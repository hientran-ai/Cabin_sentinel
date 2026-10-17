"""TensorRT age inference with bounded dynamic batches and checkpoint identity."""

import json
from pathlib import Path

import torch
from torch import nn


class TensorRTAgeModel(nn.Module):
    def __init__(self, engine_path, device, checkpoint_sha256):
        super().__init__()
        import tensorrt as trt

        self.logger = trt.Logger(trt.Logger.WARNING)
        self.runtime = trt.Runtime(self.logger)
        with Path(engine_path).open("rb") as stream:
            length = int.from_bytes(stream.read(4), "little")
            if not 0 < length < 1_000_000:
                raise ValueError("Missing TensorRT age metadata")
            self.metadata = json.loads(stream.read(length))
            if self.metadata.get("checkpoint_sha256") != checkpoint_sha256:
                raise ValueError("TensorRT age engine/checkpoint mismatch")
            with torch.cuda.device(device):
                self.engine = self.runtime.deserialize_cuda_engine(stream.read())
                if self.engine is None:
                    raise RuntimeError("Cannot deserialize TensorRT age engine")
                self.context = self.engine.create_execution_context()
        self.input_name, self.output_name = "images", "logits"
        if self.engine.num_io_tensors != 2:
            raise ValueError("Unexpected TensorRT age inputs/outputs")
        shape = tuple(self.engine.get_tensor_shape(self.input_name))
        if shape != (-1, 3, 224, 224):
            raise ValueError("TensorRT age input shape must be dynamic batch x 3 x 224 x 224")
        profile = self.engine.get_tensor_profile_shape(self.input_name, 0)
        self.max_batch = profile[2][0]
        dtype = torch.float16 if self.engine.get_tensor_dtype(self.input_name) == trt.float16 else torch.float32
        out_dtype = torch.float16 if self.engine.get_tensor_dtype(self.output_name) == trt.float16 else torch.float32
        self.register_parameter("device_marker", nn.Parameter(torch.empty(0, device=device, dtype=dtype), requires_grad=False))
        self.register_buffer("output_buffer", torch.empty((self.max_batch, self.metadata["classes"]), device=device, dtype=out_dtype))
        self.execution_stream = torch.cuda.Stream(device=device)

    def forward(self, batch):
        if batch.device != self.device_marker.device or batch.dtype != self.device_marker.dtype:
            raise ValueError("TensorRT age batch device/precision mismatch")
        caller = torch.cuda.current_stream(batch.device)
        self.execution_stream.wait_stream(caller)
        batch.record_stream(self.execution_stream)
        with torch.cuda.stream(self.execution_stream):
            output = self._execute(batch, self.execution_stream)
        caller.wait_stream(self.execution_stream)
        output.record_stream(caller)
        return output

    def _execute(self, batch, stream):
        outputs = []
        for part in batch.split(self.max_batch):
            part = part.contiguous()
            if not self.context.set_input_shape(self.input_name, tuple(part.shape)):
                raise ValueError("TensorRT age batch outside optimization profile")
            self.context.set_tensor_address(self.input_name, part.data_ptr())
            self.context.set_tensor_address(self.output_name, self.output_buffer.data_ptr())
            if not self.context.execute_async_v3(stream.cuda_stream):
                raise RuntimeError("TensorRT age execution failed")
            # Preserve chunks before this reusable output buffer is overwritten.
            outputs.append(self.output_buffer[:len(part)].clone())
        return torch.cat(outputs, dim=0)
