# P-068: model package for backend

Includes YOLO26s detector, face age checkpoint, YuNet face detector,
p068_vision Python library, model tests, licenses and integration documentation.
No backend server, frontend, datasets, private .env, database or credentials.

Extract the entire ZIP. Run from this directory (containing model/ and models/).
Python 3.11 or newer is required. Install compatible PyTorch for your device
following model/README.md, then:

    python -m pip install ./model
    python model/verify_handoff.py
    python -m p068_vision --assets-root .

Python integration:

    from p068_vision import Pipeline
    with Pipeline(assets_root=".", device="cpu") as pipeline:
        result = pipeline.infer(open("input.jpg", "rb").read(), include_preview=True)

Keep one pipeline per backend worker and reuse it. Detailed integration:
model/README.md. Weights are NOT inside the installed Python wheel; keep models/.

If integrating only the detector with an existing backend:
MODEL_PATH=models/selection-20261015/yolo26s.pt

The complete pipeline also uses models/age/cabin-age-repair-20261015.pt
and models/face_detection_yunet_2023mar.onnx.
Source commit: 3ca065d3a35b1ec372762f296defca99cdf16643.
