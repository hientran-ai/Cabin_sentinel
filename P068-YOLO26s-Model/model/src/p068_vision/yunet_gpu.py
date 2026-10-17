"""YuNet CUDA adapter, matching OpenCV FaceDetectorYN's decoder.

Decoder reference: OpenCV modules/objdetect/src/face_detect.cpp (Apache 2.0).
Only ONNX shape metadata is adjusted; trained initializers remain unchanged.
"""

import hashlib
import json
from collections import Counter, OrderedDict
from pathlib import Path

import cv2
import numpy as np


class OnnxGpuYuNet:
    def __init__(
        self,
        model,
        input_size=(1280, 720),
        score_threshold=0.3,
        nms_threshold=0.3,
        top_k=5000,
        *,
        device_id=0,
        verify_cuda=False,
    ):
        import onnx
        import onnxruntime as ort
        import torch

        ort.set_default_logger_severity(3)

        if not torch.cuda.is_available():
            raise RuntimeError("YuNet CUDA requires working CUDA PyTorch runtime")
        if "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("ONNX Runtime CUDAExecutionProvider unavailable")
        ort.preload_dlls(directory=str(Path(torch.__file__).parent / "lib"))
        self.size = tuple(input_size)
        self.pad_size = tuple((n + 31) // 32 * 32 for n in self.size)
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.top_k = top_k
        original = Path(model).read_bytes()
        graph = onnx.load_model_from_string(original)
        initializer_hash = hashlib.sha256(b"".join(x.SerializeToString() for x in graph.graph.initializer)).hexdigest()
        dims = graph.graph.input[0].type.tensor_type.shape.dim
        for dim, value in zip(dims, [1, 3, self.pad_size[1], self.pad_size[0]]):
            dim.ClearField("dim_param")
            dim.dim_value = value
        for output in graph.graph.output:
            shape = output.type.tensor_type.shape.dim
            if len(shape) == 3:
                shape[1].ClearField("dim_value")
                shape[1].dim_param = "anchors_" + output.name
        del graph.graph.value_info[:]
        assert (
            initializer_hash
            == hashlib.sha256(b"".join(x.SerializeToString() for x in graph.graph.initializer)).hexdigest()
        )
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        options.log_severity_level = 3
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        options.add_session_config_entry("session.inter_op.allow_spinning", "0")
        options.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
        options.enable_profiling = verify_cuda
        profile_dir = Path(__file__).resolve().parents[2] / "tmp/yunet-profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        options.profile_file_prefix = str(profile_dir / "cuda")
        self.session = ort.InferenceSession(
            graph.SerializeToString(),
            sess_options=options,
            providers=[
                (
                    "CUDAExecutionProvider",
                    {"device_id": device_id, "use_tf32": 0, "cudnn_conv_algo_search": "HEURISTIC"},
                )
            ],
        )
        self.session.disable_fallback()
        if self.session.get_providers()[0] != "CUDAExecutionProvider":
            raise RuntimeError("YuNet session fell back to CPU")
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [x.name for x in self.session.get_outputs()]
        self.evidence = {
            "runtime": ort.__version__,
            "providers": self.session.get_providers(),
            "device_id": device_id,
            "cpu_ep_fallback_disabled": True,
            "original_model_sha256": hashlib.sha256(original).hexdigest(),
            "initializer_sha256": initializer_hash,
            "input_shape": [1, 3, self.pad_size[1], self.pad_size[0]],
            "weights_unchanged": True,
            "use_tf32": False,
        }
        if verify_cuda:
            self.session.run(
                None, {self.input_name: np.zeros((1, 3, self.pad_size[1], self.pad_size[0]), dtype=np.float32)}
            )
            profile = Path(self.session.end_profiling())
            events = json.loads(profile.read_text(encoding="utf-8"))
            kernels = [e["args"] for e in events if e.get("cat") == "Node" and e.get("args", {}).get("provider")]
            gpu_conv = [
                e for e in kernels if e["provider"] == "CUDAExecutionProvider" and "Conv" in e.get("op_name", "")
            ]
            cpu_conv = [
                e for e in kernels if e["provider"] == "CPUExecutionProvider" and "Conv" in e.get("op_name", "")
            ]
            if not gpu_conv or cpu_conv:
                raise RuntimeError("Profiling did not prove all convolution execution on CUDA")
            self.evidence.update(
                gpu_convolution_events=len(gpu_conv),
                cpu_convolution_events=len(cpu_conv),
                node_provider_counts=dict(Counter(e["provider"] for e in kernels)),
                profile_file=str(profile),
            )

    def setScoreThreshold(self, threshold):  # noqa: N802 - OpenCV detector interface
        if not 0 < threshold <= 1:
            raise ValueError("Invalid face threshold")
        self.score_threshold = float(threshold)

    def setInputSize(self, size):  # noqa: N802 - OpenCV detector interface
        if tuple(size) != self.size:
            raise ValueError(f"This experimental session is fixed at {self.size}, got {size}")

    def detect(self, frame):
        if frame.shape[:2] != (self.size[1], self.size[0]):
            raise ValueError("YuNet frame dimensions mismatch")
        pw, ph = self.pad_size
        padded = cv2.copyMakeBorder(frame, 0, ph - frame.shape[0], 0, pw - frame.shape[1], cv2.BORDER_CONSTANT, value=0)
        blob = cv2.dnn.blobFromImage(padded)  # BGR, no mean/normalization/RGB swap
        raw = self.session.run(None, {self.input_name: blob})
        return 1, self.decode(
            dict(zip(self.output_names, raw)), self.pad_size, self.score_threshold, self.nms_threshold, self.top_k
        )

    @staticmethod
    def decode(outputs, pad_size, score_threshold=0.3, nms_threshold=0.3, top_k=5000):
        pw, ph = pad_size
        rows = []
        for stride in [8, 16, 32]:
            cls = outputs[f"cls_{stride}"].reshape(-1)
            obj = outputs[f"obj_{stride}"].reshape(-1)
            scores = np.sqrt(np.clip(cls, 0, 1) * np.clip(obj, 0, 1))
            indices = np.flatnonzero(scores >= score_threshold)
            if not len(indices):
                continue
            cols = pw // stride
            grid = np.column_stack((indices % cols, indices // cols)).astype(np.float32)
            bbox = outputs[f"bbox_{stride}"].reshape(-1, 4)[indices]
            kps = outputs[f"kps_{stride}"].reshape(-1, 5, 2)[indices]
            center = (grid + bbox[:, :2]) * stride
            sizes = np.exp(bbox[:, 2:]) * stride
            landmarks = (kps + grid[:, None, :]) * stride
            rows.append(
                np.column_stack((center - sizes / 2, sizes, landmarks.reshape(-1, 10), scores[indices])).astype(
                    np.float32
                )
            )
        if not rows:
            return None
        faces = np.concatenate(rows)
        if len(faces) > 1:
            keep = cv2.dnn.NMSBoxes(
                np.trunc(faces[:, :4]).astype(int).tolist(),
                faces[:, 14].tolist(),
                score_threshold,
                nms_threshold,
                eta=1.0,
                top_k=top_k,
            )
            faces = faces[np.asarray(keep, dtype=np.int64).reshape(-1)]
        return faces


class CudaFaceDetector:
    """Bounded sessions per input shape; no cache of detections across frames."""

    def __init__(self, model, device="cuda:0", *, max_sessions=1):
        import onnxruntime as ort
        import torch

        if not device.startswith("cuda:") or not torch.cuda.is_available():
            raise RuntimeError("CUDA face detection requires a CUDA Vision device")
        if "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("ONNX Runtime CUDAExecutionProvider unavailable")
        self.model = Path(model)
        self.device_id = int(device.split(":")[1])
        if max_sessions < 1:
            raise ValueError("max_sessions must be positive")
        self.max_sessions = max_sessions
        self.sessions = OrderedDict()
        self.size = None
        self.score_threshold = 0.85

    def setInputSize(self, size):  # noqa: N802 - OpenCV detector interface
        self.size = tuple(size)

    def setScoreThreshold(self, threshold):  # noqa: N802 - OpenCV detector interface
        if not 0 < threshold <= 1:
            raise ValueError("Invalid face threshold")
        self.score_threshold = float(threshold)

    def detect(self, frame):
        if self.size != frame.shape[:2][::-1]:
            raise ValueError("CUDA face frame/input dimensions mismatch")
        if self.size not in self.sessions:
            # Evict before allocating another CUDA session to bound peak memory.
            while len(self.sessions) >= self.max_sessions:
                self.sessions.popitem(last=False)
            self.sessions[self.size] = OnnxGpuYuNet(self.model, self.size, device_id=self.device_id)
        self.sessions.move_to_end(self.size)
        session = self.sessions[self.size]
        session.setScoreThreshold(self.score_threshold)
        return session.detect(frame)

    def describe(self):
        return {
            "backend": "onnxruntime-cuda",
            "device_id": self.device_id,
            "sessions": [s.evidence for s in self.sessions.values()],
        }

    def close(self):
        self.sessions.clear()
