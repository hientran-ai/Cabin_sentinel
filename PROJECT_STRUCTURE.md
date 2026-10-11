# Project structure / Cấu trúc dự án

This repository is organized as a monorepo: deployable products are separated
from reusable libraries and automated tests.

Repository này được tổ chức theo mô hình monorepo: sản phẩm có thể triển khai
được tách khỏi thư viện dùng chung và kiểm thử tự động.

```text
.
├── apps/                    # Frontend applications / Các ứng dụng frontend
│   ├── operations-web/      # Admin & operations portal
│   ├── owner-web/           # Owner portal
│   └── mobile/              # Mobile application
├── services/                # Backend services / Các dịch vụ backend
│   └── api/
│       └── src/             # FastAPI source code
│           ├── main.py      # Backend entry point
│           ├── config.py    # Runtime configuration
│           ├── cabinsentinel/
│           └── vision/
├── packages/                # Shared frontend packages / Thư viện frontend dùng chung
├── tests/                   # Backend tests / Kiểm thử backend
├── src/                     # Temporary compatibility import bridge
└── docs/                    # Architecture and handoff documentation
```

## Why `services/api`? / Vì sao dùng `services/api`?

`apps/` contains user-facing clients. `services/` contains server processes and
APIs. This makes the frontend/backend boundary immediately visible on GitHub and
leaves room for future services such as workers, notifications, or inference.

`apps/` chứa các giao diện người dùng. `services/` chứa tiến trình máy chủ và
API. Cách chia này giúp ranh giới frontend/backend rõ ràng ngay trên GitHub và
có chỗ cho các service sau này như worker, notification hoặc inference.

## Compatibility / Tương thích

The root `src/` directory is intentionally a small compatibility bridge. Existing
Python imports such as `src.main` and the current command below continue to work:

Thư mục `src/` ở root được giữ lại có chủ đích như một cầu nối tương thích. Các
import Python như `src.main` và lệnh chạy hiện tại vẫn hoạt động:

```bash
uvicorn src.main:app --reload
```

New backend code belongs in `services/api/src/`. Do not add business logic to
the compatibility bridge.

Code backend mới phải được đặt trong `services/api/src/`. Không thêm business
logic vào thư mục cầu nối tương thích.

## Dependency direction / Chiều phụ thuộc

```text
apps/* ──────> packages/*
   │
   └────────> services/api (HTTP API)

tests/* ─────> services/api/src
```

- Frontend apps may reuse `packages/*`.
- Frontend apps communicate with the backend through HTTP; they do not import
  Python source files.
- Backend modules may import other backend modules inside `services/api/src`.
- Shared frontend packages must not depend on a specific app.

- Các frontend có thể dùng lại `packages/*`.
- Frontend giao tiếp với backend qua HTTP, không import source Python.
- Module backend có thể import module backend khác trong `services/api/src`.
- Package frontend dùng chung không được phụ thuộc vào một app cụ thể.

## Common commands / Lệnh thường dùng

Run these commands from the repository root.

Chạy các lệnh sau tại thư mục root của repository.

```bash
# Backend development
uvicorn src.main:app --reload

# Backend tests
pytest

# Frontend type checking and production build
npm run typecheck
npm run build:web
```

The compatibility bridge can be removed later in a dedicated migration after
deployment, tests, scripts, and external consumers all use the new module path.

Cầu nối tương thích chỉ nên được xóa trong một đợt migration riêng sau khi môi
trường deploy, test, script và consumer bên ngoài đều dùng module path mới.
