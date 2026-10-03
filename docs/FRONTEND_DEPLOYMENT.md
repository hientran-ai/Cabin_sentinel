# Frontend build and deployment

Node.js 20+ is required. From the repository root run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.

## Unified Cloudflare website

- Build: `npm run build:web`
- Output: `dist`
- Required: `VITE_API_BASE_URL`, `VITE_VEHICLE_ID`, `VITE_AUTH_MODE`
- Cloudflare Pages root directory: repository root.
- Cloudflare Pages build command: `npm ci && npm run build:web`.
- Cloudflare Pages output directory: `dist`.
- Owner routes are served from `/overview`, `/vehicles`, `/events` and related paths.
- Operations routes are served from `/admin` and `/admin/*`.
- Both portals share one origin and authentication session. The authenticated role decides which portal is accessible.
- The generated `_redirects` file provides separate SPA fallbacks for `/admin/*` and owner routes.

### Source applications

- `apps/owner-web/` builds the owner-facing root application.
- `apps/operations-web/` builds the role-protected application mounted under `/admin`.
- Do not deploy their individual `dist` directories separately; `scripts/assemble-web.mjs` combines them into the root `dist` directory.

## Mobile (`apps/mobile/`)

- Local: copy `.env.example` to `.env`, then `npm run start --workspace @cabinsentinel/mobile`.
- Required build variables: `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_VEHICLE_ID`. Public variables are not secrets.
- Bundle smoke check: `npm run build --workspace @cabinsentinel/mobile` (output `apps/mobile/dist`).
- Install EAS CLI, authenticate, create the Expo project, replace the placeholder bundle/package identifiers if ownership requires it, and run `eas build --profile preview --platform android|ios` followed by `eas build --profile production --platform android|ios`.
- Store submission additionally requires Apple/Google developer accounts, signing credentials, privacy disclosures, icons/splash assets and an Expo project ID. No store release is claimed by this repository.

## Production smoke checks

For every web origin, verify direct navigation to a nested route, refresh fallback, `/health`, a valid vehicle state, stale/offline behavior, an empty event list and a 4xx/5xx response. Confirm no old result is presented as a new analysis and no disabled command appears successful.
