# CabinSentinel — Backend & Sensor Sprint 0

V1 online image demo instructions: [docs/V1_ONLINE_DEMO.md](docs/V1_ONLINE_DEMO.md).
The image path uses Tâm's YOLO detector settings, a separate model artifact,
and the canonical CabinSentinel reasoning service. It does not use the
`BUILD_PHASE/app` prototype. No vehicle action is physically executed.
An SVIRO child/infant-only sample was missed by the stock detector and produced
`EMPTY_CABIN/SAFE`; see the V1 guide before presenting child safety claims.

This repo now contains Khánh's local safety backend under `src/cabinsentinel/`.
It accepts versioned sensor JSON through local MQTT and Vision results through
HTTP, evaluates risk on either update, and exposes the latest state to the
dashboard. Rules run locally. Horn, SMS, notification and unlock are **mock or
pending** outputs; this does not demonstrate real vehicle control or delivery.
The CabinSentinel routes do not need an OpenAI API key; the template chat route
still uses the template's separate LLM configuration.

## Run the Sprint 0 demo

```bash
cp .env.example .env
docker compose up --build
```

The V1 image endpoint reports unavailable until `MODEL_PATH` points to a
readable local model artifact. Set `CABINSENTINEL_MQTT_ENABLED=true` in `.env`
when running the older MQTT sensor demo below.

In another terminal, publish a sensor snapshot (Python dependencies from
`requirements.txt` are required on the host):

```bash
python scripts/cabinsentinel_sensor_simulator.py --vehicle-id CAR_1 --temperature 35 --engine OFF --radar
```

Send a matching Vision result to `POST http://localhost:8000/api/v1/vision`:

```json
{
  "vehicle_id": "CAR_1",
  "timestamp": "2026-09-23T10:00:00+07:00",
  "camera_status": "OK",
  "objects": [{"class": "dog", "confidence": 0.95}]
}
```

Use the current time in `timestamp`; the example timestamp is illustrative.
Inputs expire after 3 seconds for Vision and 5 seconds for sensors. Read
`GET /api/v1/state/CAR_1`,
`GET /api/v1/risk/CAR_1`, and `GET /api/v1/events/CAR_1`. Swagger is at
`http://localhost:8000/docs`. The simulator publishes a new snapshot every
second with an increasing sequence; stop it with Ctrl-C. Restarting a
simulator for the same vehicle resets its sequence, so clear the demo SQLite
database or use a new vehicle ID for a separate demo run.
Send a new Vision frame at least every 3 seconds during a live demo; after a
single frame expires, the backend correctly reports `ERROR` without radar.
`GET /health` reports model and database readiness. MQTT is disabled by default
for V1; if explicitly enabled, a disconnected broker makes readiness degraded.

For an EV Pet Mode demo, use `--powertrain EV --mode PET --hvac ACTIVE --soc 40
--temperature 28`. For an ICE remote start demo, use `--powertrain ICE --mode
REMOTE_START --hvac ACTIVE --engine ON`. These flags simulate vehicle feedback;
they do not switch on a real vehicle mode or HVAC.

Run checks with `pytest -q` and `ruff check src tests scripts/cabinsentinel_sensor_simulator.py`.

This is a Sprint 0 integration baseline. The team still needs real Vision
integration, authorization and expiry for unlock confirmation, device feedback,
mode telemetry validation, offline delivery adapters, and measured latency on
the target Raspberry Pi 5 before claiming the full safety Definition of Done.

## Original AI20K template guidance

Template chính thức cho học viên VinUni AI20K Build Phase: cấu trúc dự án, code
mẫu và hướng dẫn kỹ thuật để xây dựng một AI Agent hoàn chỉnh — từ kiến trúc,
code, test cho đến deploy và nộp bài Demo Day.

Technical Guidebook: <https://phoenix.note.transformerlabs.ai/technical-book>

## Template có sẵn những gì

- **Cấu trúc thư mục tách lớp** — `agents/`, `api/`, `services/`, `models/` đã
  chia sẵn, không phải bàn lại từ đầu.
- **Code mẫu chạy được** — LangGraph agent (state, node, tool), FastAPI routes,
  Pydantic settings, schema.
- **Docker và CI** — Dockerfile multi-stage, `docker-compose.yml`, workflow
  GitHub Actions chạy `ruff` + `pytest` khi push lên `main`/`develop` và khi mở
  pull request vào `main`.
- **Technical Guidebook 10 chương** trong `docs/guide/`, đồng thời đọc được
  online.
- **Checklist 10 deliverables** của Demo Day.
- **AI usage logging** — hook cài sẵn cho 6 công cụ AI, log tự động gửi lên
  grading server mỗi lần `git push`.

## Yêu cầu

- Python 3.11 (phiên bản CI đang dùng)
- Git
- Docker — tuỳ chọn, chỉ cần nếu chạy `docker compose`

## Bắt đầu

### 1. Clone repo của đội

Khi đội được chốt, hệ thống tự sinh repo cho đội từ template này, nằm trong org
GitHub của khoá bạn đang học và đặt tên theo mã đội. Copy URL ở trang đội trên
Phoenix rồi clone về:

```bash
git clone https://github.com/<ORG-CỦA-KHOÁ>/<MÃ-ĐỘI>.git
cd <MÃ-ĐỘI>
```

Không cần `rm -rf .git`, `git init` hay `git remote add`: repo sinh từ template
đã bắt đầu bằng lịch sử riêng của đội và remote trỏ sẵn đúng chỗ. Chưa thấy repo
của đội thì báo BTC — repo tự tạo nằm ngoài org sẽ không được chấm.

### 2. Cài môi trường

```bash
python3.11 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Mở `.env` và điền `OPENAI_API_KEY`. Riêng `AI_LOG_API_KEY`, mỗi thành viên tự
tạo key riêng tại [dashboard Phoenix](https://phoenix.note.transformerlabs.ai/api-keys)
rồi thay vào chỗ `<get-your-api-key-from-dashboard-phoenix>` — giá trị trong
`.env.example` chỉ là placeholder, để nguyên thì log không vào được hệ thống chấm.

### 4. Cài hook ghi log AI

```bash
bash scripts/setup_hooks.sh                                      # Linux / macOS / Git Bash
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1 # Windows PowerShell
```

Chạy một lần sau khi clone. Hook ghi lại prompt khi bạn dùng Claude Code, Cursor,
Codex CLI, Gemini CLI, Antigravity hoặc GitHub Copilot, và cài pre-push hook để
đẩy log lên server.

### 5. Chạy server

```bash
uvicorn src.main:app --reload --port 8000
```

Swagger UI ở <http://localhost:8000/docs>. Hoặc dùng `make run`, `make test`,
`make lint` — xem `Makefile`.

## Cấu trúc thư mục

```
src/
  agents/            LangGraph agent
    graph.py         State graph (nodes + edges)
    state.py         State schema (TypedDict)
    nodes/           Node functions
    tools/           Agent tools (@tool)
  api/routes.py      FastAPI endpoints
  models/schemas.py  Pydantic schemas
  services/llm.py    LLM client
  config.py          Pydantic Settings
  main.py            App entry point
tests/               pytest suite
scripts/             Hook ghi log AI + installer
docs/
  guide/             Technical Guidebook (nguồn của bản online)
  architecture_diagram.md
eval/                Kết quả evaluation
presentation/        Slide và video Demo Day
.claude/ .codex/ .cursor/ .gemini/ .agents/ .github/hooks/
                     Config hook cho từng công cụ
.github/workflows/   CI
Dockerfile           Multi-stage build
docker-compose.yml   Chạy backend bằng Docker
README_boilerplate.md  Khung README cho dự án của đội
```

## Technical Guidebook

| Chương | Nội dung | Thời gian |
|---|---|---|
| 1 | Lời mở đầu — mục tiêu, cách sử dụng | 15 phút |
| 2 | Khởi tạo dự án — clone, setup, git workflow | 4 giờ |
| 3 | Thiết kế kiến trúc — 3-tier, diagram, ADR | 6 giờ |
| 4 | LangGraph Agent — state, node, edge, tool, RAG | 8 giờ |
| 5 | FastAPI — routes, validation, error handling, streaming | 6 giờ |
| 6 | Giao diện — Next.js và Streamlit | 6 giờ |
| 7 | DevOps — Docker, CI/CD, deploy, logging | 6 giờ |
| 8 | Kiểm thử — unit test, integration test, RAGAS | 4 giờ |
| 9 | Demo Day — 10 deliverables, checklist | 2 giờ |
| 10 | Tài nguyên — khoá học, tài liệu, BMAD method | tham khảo |

Đọc online tại <https://phoenix.note.transformerlabs.ai/technical-book>: đăng
nhập bằng GitHub (đúng account đã được BTC mời vào org của khoá), chọn tab
**Technical Book** ở sidebar trái. Bản offline nằm trong `docs/guide/`, mở được
bằng bất kỳ markdown viewer nào.

## 10 deliverables cho Demo Day

| # | Deliverable | Vị trí | Template lo tới đâu |
|---|---|---|---|
| 1 | Source code | `src/` | Khung sẵn |
| 2 | README | copy `README_boilerplate.md` thành `README.md` | Khung sẵn |
| 3 | Architecture diagram | `docs/architecture_diagram.md` | Khung sẵn |
| 4 | AI logs | LangSmith (3 biến môi trường) + auto AI usage logging | Cấu hình sẵn |
| 5 | Live URL | deploy lên Render/Vercel | CI/CD sẵn |
| 6 | Video demo | `presentation/` | Đội tự làm |
| 7 | Pitch deck | `presentation/` | Đội tự làm |
| 8 | Development journal | `JOURNAL.md` | Khung sẵn |
| 9 | Worklog | `WORKLOG.md` | Khung sẵn |
| 10 | Evaluation evidence | `eval/` | Đội tự làm |

## Tech stack

| Lớp | Công nghệ |
|---|---|
| Agent | LangGraph + LangChain 0.3 |
| Backend | FastAPI 0.115 + Uvicorn |
| LLM | OpenAI, mặc định `gpt-4o-mini` (đổi trong `src/config.py`) |
| Giao diện | Next.js hoặc Streamlit (đội tự chọn, hướng dẫn ở chương 6) |
| Lint / test | ruff + pytest 8 |
| DevOps | Docker + GitHub Actions |

## AI usage logging

Mọi prompt được ghi vào `.ai-log/session.jsonl` và tự động gửi lên grading server
ở bước pre-push.

| Công cụ | Cấu hình | Thời điểm ghi |
|---|---|---|
| Claude Code | `.claude/settings.json` | mỗi prompt (`UserPromptSubmit`) |
| Cursor | `.cursor/hooks.json` | mỗi prompt và khi dừng |
| OpenAI Codex CLI | `.codex/hooks.json` | mỗi prompt và khi dừng |
| Gemini CLI | `.gemini/settings.json` | mỗi lượt agent chạy |
| GitHub Copilot | `.github/hooks/hooks.json` | mỗi prompt và cuối session |
| Antigravity IDE | `.agents/hooks.json` | mỗi prompt, kèm lần quét lại lúc `git push` |

Dùng ChatGPT hay công cụ web khác thì log thủ công:

```bash
bash scripts/_pyrun.sh scripts/log_manual.py --tool chatgpt --prompt "What you asked"
```

## Đóng góp

Repo này là open source. Đọc [CONTRIBUTING.md](CONTRIBUTING.md) trước khi mở PR.

Nội dung trong `docs/guide/` là nguồn của Technical Book và được đồng bộ lên bản
online, nên mọi thay đổi ở đó cần review của
[@AI20K-Build-Phase/book-maintainers](https://github.com/orgs/AI20K-Build-Phase/teams/book-maintainers)
— xem [.github/CODEOWNERS](.github/CODEOWNERS).

Báo lỗ hổng bảo mật theo [SECURITY.md](SECURITY.md), đừng mở public issue.

## License

[MIT](LICENSE) — dùng tự do cho mục đích giáo dục.
