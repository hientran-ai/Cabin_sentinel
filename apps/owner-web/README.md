# Owner Web — V1 demo integration

User decision `DECISION-20261002-OWNER-DEMO-V1`: keep Owner Web's design and use the
verified V1 demo session, with image upload. This is a single simulated vehicle session,
not a product owner account or fleet contract.

```bash
cd /path/to/Cabin
npm ci
cp apps/owner-web/.env.example apps/owner-web/.env.local
npm run dev --workspace @cabinsentinel/owner-web -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173/demo and upload a JPEG/PNG ≤5 MiB. The backend receives
these image bytes; use an approved public or synthetic fixture for online tests.
`VITE_API_BASE_URL` selects the backend at build time. No credentials belong in Vite env.
The API client, contracts, authentication, domain model and design tokens are npm
workspace packages. React is deduplicated by Owner's Vite config. Build the unified
Cloudflare artifact from the repository root:

```bash
npm run build:web
```

Deploy the generated root `dist/` directory. Owner routes live at `/overview` and
Operations routes live at `/admin`; both use the same origin and login session.

The demo session credential is stored in session storage and follows navigation between
the Owner and Operations routes on the same origin. HTTP polling returns committed state; stale/missing evidence
shows UNKNOWN. Last backend verdicts remain clearly historical. Action SIMULATED is
“Mô phỏng”; request_unlock is waiting for human confirmation and never opens a door here.
Mark notification read and submit cabin check are separate backend operations.
Checkbox authorization is bound to the currently displayed incident/revision; backend
checks the exact revision, freshness and empty evidence again. No auto retry of mutation.

Overview, demo, cabin metadata, the single demo vehicle, and evaluation history use
backend data. Camera imagery/WebRTC, seat positions, trend series, family/profile,
vehicle registration and notification preferences are unavailable. Their UI explicitly
states the gap; runtime does not import the mock repository. Historical fixture tests
are retained as fixture tests and are not live integration evidence.

Static hosting uses the generated `_redirects` file for both SPAs. Configure the deployed
HTTPS origin on the backend. See ../../docs/FRONTEND_DEPLOYMENT.md.
