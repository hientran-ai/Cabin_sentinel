# Frontend build and deployment

Node.js 20+ is required. From the repository root run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.

## Owner portal (`apps/owner-web/`)

- Build: `npm run build --workspace @cabinsentinel/owner-web`
- Output: `apps/owner-web/dist`
- Required: `VITE_API_BASE_URL`, `VITE_VEHICLE_ID`, `VITE_AUTH_MODE`
- Cloudflare Pages root directory: repository root.
- Cloudflare Pages build command: `npm ci && npm run build --workspace @cabinsentinel/owner-web`.
- Cloudflare Pages output directory: `apps/owner-web/dist`.
- Deploy as an independent SPA. Current live coverage is one configured vehicle through V1 state/events. Login, multi-vehicle access, acknowledgement, profile and notification preferences require the APIs in `FRONTEND_BACKEND_REQUIREMENTS.md`.

## Operations portal (`apps/operations-web/`)

- Build: `npm run build --workspace @cabinsentinel/operations-web`
- Output: `apps/operations-web/dist`
- Required: `VITE_API_BASE_URL`, `VITE_VEHICLE_ID`, `VITE_AUTH_MODE`
- Cloudflare Pages root directory: repository root.
- Cloudflare Pages build command: `npm ci && npm run build --workspace @cabinsentinel/operations-web`.
- Cloudflare Pages output directory: `apps/operations-web/dist`.
- Deploy as an independent SPA and protect it at the platform edge until backend OIDC/RBAC exists. V1 provides a single-vehicle evaluation stream, not a fleet incident queue.

## Mobile (`apps/mobile/`)

- Local: copy `.env.example` to `.env`, then `npm run start --workspace @cabinsentinel/mobile`.
- Required build variables: `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_VEHICLE_ID`. Public variables are not secrets.
- Bundle smoke check: `npm run build --workspace @cabinsentinel/mobile` (output `apps/mobile/dist`).
- Install EAS CLI, authenticate, create the Expo project, replace the placeholder bundle/package identifiers if ownership requires it, and run `eas build --profile preview --platform android|ios` followed by `eas build --profile production --platform android|ios`.
- Store submission additionally requires Apple/Google developer accounts, signing credentials, privacy disclosures, icons/splash assets and an Expo project ID. No store release is claimed by this repository.

## Production smoke checks

For every web origin, verify direct navigation to a nested route, refresh fallback, `/health`, a valid vehicle state, stale/offline behavior, an empty event list and a 4xx/5xx response. Confirm no old result is presented as a new analysis and no disabled command appears successful.
