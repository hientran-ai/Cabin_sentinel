# CabinSentinel API service

The backend source is located in `services/api/src`.

The repository currently keeps the `src.*` Python import namespace for
compatibility. The root `src/__init__.py` bridge points Python module discovery
at this directory, so existing commands remain valid:

```powershell
.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

Key modules:

- `src/main.py`: FastAPI application and lifecycle.
- `src/config.py`: environment-backed settings.
- `src/cabinsentinel/`: safety domain, platform APIs and storage.
- `src/vision/`: vision and privacy processing.
- `src/api/`: legacy/template API routes still mounted by the application.

Do not place frontend code or shared TypeScript libraries in this service.
