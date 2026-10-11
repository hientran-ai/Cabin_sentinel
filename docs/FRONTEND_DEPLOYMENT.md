# Frontend build and deployment

Node.js 22.12+ is required. From the repository root run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test` and `npm run build:web`.

## Unified Cloudflare Worker

The Worker serves both frontend portals and proxies backend requests through the same public origin. This avoids cross-origin cookie and CORS problems for production login.

- Cloudflare project type: **Workers Builds** connected to this GitHub repository.
- Root directory: repository root (leave blank unless this repository is inside a monorepo).
- Production branch: `main`.
- Build command: `npm ci && npm run build:web`.
- Deploy command: `npx wrangler deploy`.
- Preview command: `npx wrangler versions upload`.
- Build output is `dist`; `wrangler.jsonc` configures it automatically.
- Set the GitHub Actions variable `VITE_MOBILE_APP_URL` to the public Cabin Noir URL.
- Set `VITE_CAMERA_API_BASE_URL` only when the browser camera must call a separate Gradio origin. Leave it empty when same-origin Worker proxying is sufficient.
- `BACKEND_ORIGIN` defaults to `https://khanh3636-backend-p068.hf.space` in `wrangler.jsonc`.

Cloudflare runtime variables are not injected into an already-built Vite bundle. `VITE_*` values must therefore be present during `npm run build:web`; the CI workflow forwards the GitHub Actions variables at that step.

Owner routes are served from `/overview`, `/vehicles`, `/events` and related paths. Operations routes are served from `/admin` and `/admin/*`. Both portals share one origin and login session; the backend-provided role determines which portal is accessible.

The Worker proxies `/api/*` and `/health` to the HTTPS backend. Do not expose refresh tokens as Cloudflare variables: the backend sets them as HttpOnly cookies on the Worker origin.

### Local Worker preview

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Run `npm run build:web`.
3. Run `npm run preview:web`.
4. Open the local URL printed by Wrangler.

Use `BACKEND_ORIGIN=http://localhost:8000` in `.dev.vars` for a local backend, or replace it with the production HTTPS backend for an end-to-end preview. `.dev.vars` is ignored by Git.

### Source applications

- `apps/owner-web/` builds the owner-facing root application.
- `apps/operations-web/` builds the role-protected application mounted under `/admin`.
- Do not deploy their individual `dist` directories separately; `scripts/assemble-web.mjs` combines them into the root `dist` directory.

## Mobile (`apps/mobile/`)

- Local: copy `.env.example` to `.env`, then `npm run start --workspace @cabinsentinel/mobile`.
- Required build variables: `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_VEHICLE_ID`. Public variables are not secrets.
- Bundle smoke check: `npm run build --workspace @cabinsentinel/mobile` (output `apps/mobile/dist`).
- Install EAS CLI, authenticate, create the Expo project, replace the placeholder bundle/package identifiers if ownership requires it, and run `eas build --profile preview --platform android|ios` followed by `eas build --profile production --platform android|ios`.

## Production smoke checks

After deployment, verify `/login`, direct navigation and refresh on `/overview` and `/admin`, `/health`, successful login for at least one Owner and one Admin account, role-based redirection, logout, and access-token refresh. Also verify a valid vehicle state, stale/offline behavior, an empty event list and a backend 4xx/5xx response.
