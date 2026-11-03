# CabinSentinel

CabinSentinel is an in-cabin safety platform that combines computer vision and
vehicle-sensor telemetry to identify potentially unsafe conditions in parked
vehicles. It provides a local risk engine, incident tracking, privacy-aware
evidence handling, and web interfaces for vehicle and fleet monitoring.

> [!IMPORTANT]
> This repository contains a software prototype. Vehicle actions, emergency
> calls, notifications, HVAC control, unlocking, and external delivery channels
> are simulated or disabled unless explicitly connected to validated hardware
> and services.

## Core capabilities

- Accepts versioned vehicle telemetry through MQTT and vision observations
  through HTTP.
- Evaluates each vehicle with five deterministic risk states: `SAFE`, `NOTICE`,
  `WARNING`, `CRITICAL`, and `ERROR`.
- Expires vision input after 3 seconds and sensor input after 5 seconds to avoid
  treating stale data as current evidence.
- Preserves uncertainty when the camera is blocked, disconnected, or unable to
  verify cabin occupancy.
- Tracks alerts, acknowledgements, resolutions, actions, and privacy-safe
  evidence.
- Provides cockpit, owner, caregiver, and operations interfaces.
- Supports local containers, automated tests, production builds, and a gated
  deployment workflow.

## Safety behavior

The risk engine runs locally and evaluates new vision or sensor input as it
arrives. A missing or stale observation is not equivalent to an empty cabin.
When the available evidence cannot support a current decision, the system
reports an uncertain or error state instead of silently reporting safety.

The current implementation does not prove:

- detection of every child, adult, animal, or object;
- operation on production vehicle hardware;
- delivery through real notification or emergency channels;
- physical execution of horn, HVAC, lock, unlock, or window commands; or
- production readiness without the remaining validation gates.

Review [RELEASE_READINESS.md](RELEASE_READINESS.md) before presenting or
deploying the system.

## Architecture

```text
Camera / video ----> Vision pipeline ----+
                                         |
Vehicle sensors ---> Telemetry ingest ---> Risk engine ---> Incidents / actions
                                         |                       |
                                         +----> Platform API <---+
                                                     |
                                  +------------------+------------------+
                                  |                  |                  |
                              Cockpit UI       Operations UI       Mobile UI
```

The canonical architecture is documented in
[docs/ARCHITECTURE_V2.md](docs/ARCHITECTURE_V2.md). See
[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for package boundaries and
dependency rules.

## Repository layout

```text
apps/
  cockpit-web/          In-vehicle cockpit interface
  operations-web/       Fleet administration and operations portal
services/
  api/src/              Backend API and safety services
packages/               Shared frontend contracts and libraries
src/                    Python compatibility layer
tests/                  Backend and integration tests
workers/                Static frontend router
scripts/                Local development and validation utilities
deploy/                 Hosted deployment files
docs/                   Architecture, model, safety, and handoff documents
eval/                   Evaluation reports
```

## Requirements

- Python 3.11
- Node.js 22.12 or newer
- npm
- Git
- A container runtime with Compose support (optional)

## Quick start with containers

Create the local environment file:

```bash
cp .env.example .env
```

Start the backend and local MQTT broker:

```bash
docker compose up --build
```

The API is available at `http://localhost:8000`. Interactive API documentation
is available at `http://localhost:8000/docs` when documentation is enabled.

## Local backend setup

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
```

Activate the environment:

```bash
# Linux or macOS
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install dependencies and start the API:

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

## Frontend setup

Install workspace dependencies:

```bash
npm ci
```

Start an application:

```bash
npm run dev:cockpit
npm run dev:operations
```

Create the production web bundle:

```bash
npm run build
```

## Sensor and vision demo

Publish simulated sensor telemetry:

```bash
python scripts/cabinsentinel_sensor_simulator.py \
  --vehicle-id CAR_1 \
  --temperature 35 \
  --engine OFF \
  --radar
```

Send a matching vision observation to `POST /api/v1/vision`:

```json
{
  "vehicle_id": "CAR_1",
  "timestamp": "2026-11-03T10:00:00+07:00",
  "camera_status": "OK",
  "objects": [
    {
      "class": "dog",
      "confidence": 0.95
    }
  ]
}
```

Always replace the example timestamp with the current time. The simulator sends
an increasing sequence number once per second. When restarting it for the same
vehicle, clear the local demo database or use a new vehicle identifier.

Useful endpoints:

```text
GET /health
GET /api/v1/state/CAR_1
GET /api/v1/risk/CAR_1
GET /api/v1/events/CAR_1
```

The image endpoint remains unavailable until `MODEL_PATH` references a readable
model artifact. MQTT ingestion is disabled by default and can be enabled with
`CABINSENTINEL_MQTT_ENABLED=true`.

## Configuration

Important environment variables include:

| Variable | Purpose |
|---|---|
| `APP_ENV` | Runtime environment |
| `DATABASE_URL` | Database connection string |
| `CABINSENTINEL_DB_PATH` | Local database path |
| `CABINSENTINEL_MQTT_ENABLED` | Enables MQTT telemetry ingestion |
| `MQTT_BROKER_HOST` | MQTT broker hostname |
| `MQTT_BROKER_PORT` | MQTT broker port |
| `MODEL_PATH` | Object-detection model path |
| `AGE_CLASSIFIER_PATH` | Optional age-classification model path |
| `CORS_ORIGINS` | Allowed web origins |
| `PLATFORM_SIGNING_KEY` | Evidence-link signing key |
| `REMOTE_COMMANDS_ENABLED` | Enables simulated remote commands |

Keep secrets outside version control. Production deployments must use explicit
origins, persistent storage, strong credentials, and separately managed secret
values.

## Testing and validation

Run backend tests and lint checks:

```bash
pytest -q
ruff check services/api/src src tests scripts/cabinsentinel_sensor_simulator.py
```

Run frontend and worker tests:

```bash
npm test
npm run typecheck
npm run build
```

The automated workflow performs frontend type checking, unit tests, production
builds, backend linting and tests, container/model verification, and a container
smoke test. Deployment runs only after its required checks and configuration
gates pass.

Automated tests and local demonstrations are not substitutes for model
validation, hardware testing, security review, or production monitoring.

## Additional documentation

- [Architecture](ARCHITECTURE.md)
- [Integration status](INTEGRATION_STATUS.md)
- [Release readiness](RELEASE_READINESS.md)
- [Model evaluation](MODEL_DETECTION_EVALUATION.md)
- [Scenario test matrix](SCENARIO_TEST_MATRIX.md)
- [Video scenario matrix](VIDEO_SCENARIO_MATRIX.md)
- [Contribution guide](CONTRIBUTING.md)

## License

See [LICENSE](LICENSE) for the license terms.
