# iOS ↔ Backend integration

The SwiftUI app already talked to the FastAPI backend (it never used in-app mock arrays). What was
"mock" is the **vehicle**: in Demo mode the backend simulator produces the cabin, alerts and trips.
This document maps every screen to its API and says what is real, simulated, or not done.

Deviations from the original brief, on purpose:

- Endpoints live under `/v1/...`, not `/api/v1/...`; existing routes were reused instead of duplicated.
- Login stays OTP (`/v1/auth/otp` + `/v1/auth/verify`); there is no password `POST /auth/login`.
- Photos are uploaded as a raw JPEG body (`POST /v1/media/photo?vehicle_id=`), not multipart, to avoid an extra dependency.
- `AppMode` is the existing server-side "Chế độ dùng thử" setting: `demo` when on, `live` when off (`AppModel.mode`).

## Modes

| | Demo | Live |
|---|---|---|
| Vehicle data | Backend simulator (`/v1/sim/...` scenarios, "Chạy xe mô phỏng" route) | Real sensors only; no simulator buttons |
| Vehicle position | Simulated route home → school (~2 min) | Phone GPS, only if the owner turns on "Dùng điện thoại này làm vị trí xe" (`POST /v1/location`) |
| Camera/photo | Same in both: capture or pick → preview → Send | same |
| Realtime | `/ws/vehicles/{id}`, `/ws/alerts`, polling fallback | same |

If the backend or network is down the app shows a connection error banner; there is **no offline mock
data**, so a presentation still needs the backend (local `./run_backend.sh` is enough).

## Screen mapping

| Screen | Current mock data | Required API | Swift service | Backend endpoint | Status |
|---|---|---|---|---|---|
| Login / OTP | Dev OTP shown in trial mode | auth | `APIClient` | `POST /v1/auth/otp`, `/v1/auth/verify` | Real |
| Link vehicle | Pair codes `CS-VF8-2026`… | link | `APIClient` | `POST /v1/vehicles/link`, `/link/confirm` | Real (pairing is seeded) |
| Home (status, tiles) | Vehicle state from simulator | status + realtime | `AppModel`, `VehicleLocationService` | `GET /v1/vehicles`, `/v1/vehicles/{id}/status`, `WS /ws/vehicles/{id}` | Real API, simulated vehicle |
| Home mini map | Coordinates from simulator route or phone | location | `VehicleLocationService` | `GET /v1/vehicles/{id}/location` | Real API |
| Map + route + ETA | Demo route waypoints | location, MapKit | `VehicleMapView`, `NavigationService` (MKDirections) | `GET /v1/vehicles/{id}/location`, `WS` | Real. ETA is road-based from Apple; the demo car drives a straight line, so ETA and path differ |
| "Dẫn đường" | – | Apple Maps | `NavigationService.openMaps` | – | Real (not exercised in Simulator run) |
| Live position (phone as car) | – | `POST /v1/location` | `LocationManager` + `VehicleMapView` | `POST /v1/location` | Real, owner only, opt-in |
| Alert detail / escalation | Simulated scenarios | alerts | `APIClient` | `GET /v1/incidents/{id}`, `/view`, `/confirm`; aliases `GET /v1/alerts`, `POST /v1/alerts/{id}/acknowledge`; `WS /ws/alerts` | Real. Acknowledging never resolves an incident |
| Climate | Simulated vehicle response | climate | `APIClient` | `POST /v1/vehicles/{id}/climate` | Real API, simulated vehicle |
| In-car camera | Drawn mock feed | camera | `APIClient` | `GET /v1/vehicles/{id}/camera` | Simulated ("Mô phỏng") |
| Phone camera as sensor | – | telemetry | `PhoneSensor` (Vision) | `POST /v1/vehicles/{id}/telemetry` | Real on device; no camera in Simulator |
| Send photo | – | media | `CameraManager`, `PhotoCaptureView` | `POST /v1/media/photo` | Real; PhotosPicker fallback. Simulator library was empty so the pick step was not completed there |
| School run (Đưa đón) | Stage comes from the simulator or a manual check-in | trips, location, MapKit | `SchoolView`, `NavigationService` | `GET /v1/vehicles/{id}/trips` (adds `progress`, `progress_known`, `school`, `destination`, `vehicle_coords`), `GET /v1/trips`; manual `POST /v1/trips/{child}/pickup`, `/dropoff` | Real: an Apple Maps view (MapKit) shows home, school, the vehicle and the remaining road route (tap to open the full map); the progress follows the vehicle position, ETA is MapKit, school name is the route destination or geofence, log times are real and carry their source (Ghi nhận thủ công / Mô phỏng / Vị trí xe). Arrival is recorded by the server when the drive ends. Without a vehicle position the map hides the vehicle and shows no ETA instead of inventing one. `origin` (home) is only known for the simulated drive |
| Family, children, contacts | none | CRUD | `APIClient` | `/v1/vehicles/{id}/members`, `/v1/children`, `/v1/contacts` | Real |
| Settings / mode | – | settings | `APIClient` | `PUT /v1/me/settings` | Real |

## Realtime

- `WebSocketService` reconnects with 1, 2, 4, 8, then 15 s backoff and treats 30 s of silence as a dead link
  (the server sends a heartbeat at least every 15 s).
- The server computes the payload every second and sends it only when it changed.
- `VehicleLocationService` falls back to polling `GET /location` every 3 s while the socket is down.
- Vercel does not support WebSockets, so the deployed demo runs on the polling fallback.

## Permissions

`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` are in
`ios/Config/Info.plist`. Permissions are requested when the map, phone-sensor or photo screen opens, never at launch.

## Live mode, trips, photos (flow fixes)

- Live mode (demo off): a vehicle whose data does not come from a real source (`source != "phone"`) returns verdict `unknown`, `no_real_data: true`, no incident. Simulated data is never shown as safe.
- `POST /v1/trips/{child}/dropoff` returns 409 `still_detected` while the camera still sees someone and data is fresh; resend with `cabin_checked: true` after a person has looked inside. A trip record never closes an incident.
- Trips reset to "waiting" on a new local day (the old row is kept).
- `POST /v1/auth/otp`: 5 per phone per 10 minutes, then 429 `otp_rate`.
- Photos: `GET /v1/vehicles/{id}/photos` and `GET /v1/vehicles/{id}/photos/{photo_id}` (owner/confirm only).
- Not done: a "báo nhầm" (false alarm) path; it needs a product decision.
