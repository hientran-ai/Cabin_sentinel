# Cabin frontend ↔ CabinSentinel: audit và tích hợp BUILD_PHASE

Ngày kiểm tra: 2026-10-02 (Asia/Ho_Chi_Minh). TASK_ID: FRONTEND-INTEGRATION-20261002.
OWNER: FRONTEND_AGENT / INTEGRATION_TEST_AGENT (agent hiện tại, một owner).
Scope: clone riêng, dashboard và Owner Web; không đổi backend public API, schema, safety rules, TTL hoặc actuator.
Tất cả thay đổi trong BUILD_PHASE; P-068 chưa được sửa, sync, commit hoặc push.

## Quyết định và intent

USER DECISION — DECISION-20261002-OWNER-DEMO-V1:
- Question: Owner/mobile dùng mock sản phẩm hay phiên demo V1 trong checkpoint này?
- Decision: “Mở rộng Owner Web dùng cùng phiên demo V1, giữ UI và bổ sung upload”.
- Scope/modules: apps/owner-web dùng chung contract và API client/store với frontend dashboard.
- Hai ứng dụng dùng cùng loại phiên V1; credential được giữ riêng trong memory của mỗi tab. Không suy ra yêu cầu đồng bộ token giữa tab hoặc product identity.

CHANGE INTENT (đã báo trước patch):
- Files: frontend API/types/store/components; Owner App/mapping/styles/env và test; tài liệu/bằng chứng.
- Current: dashboard chưa theo token/session live; Owner mặc định mock xe, incident, video/trend và account/settings.
- Intended: upload thật đến backend live, đọc phiên được cấp quyền, giữ design/routes và dùng metadata/risk/action backend; capability thiếu hiện rõ.
- Reason: live contract đã audit; user duyệt scope Owner V1.
- Safety invariant: backend quyết định risk; thiếu/cũ/lỗi không thành current SAFE; SIMULATED ≠ physical success; unlock chỉ pending; cabin check gắn incident/revision.
- Compatibility: không đổi API/schema/enum/TTL/policy backend. UI ngừng tự bịa dữ liệu mock. Operations/mobile chưa chuyển sang session V1.
- Confidence: 95% cho contract/tích hợp đã kiểm thử; không suy confidence thành safety validation.

## VERIFIED FACT — source, entrypoint và deployment

| Source | Revision/version | Entrypoint / vai trò | Kết luận |
|---|---|---|---|
| Cabin-frontend, clone https://github.com/hientran-ai/Cabin | 2ab2d21fec531fbb84254c594defebfbcbc92c5c | frontend/src/main.tsx; apps/owner-web/src/main.tsx | Clone riêng; React/TypeScript/Vite; root npm workspaces. Dashboard React19, Owner19.1; Vite dedupe React ở Owner. |
| BUILD_PHASE/app | prototype | app/main.py | Không phải source backend live đang tích hợp. |
| BUILD_PHASE/safety-alert-backend | local source, không có Git revision riêng | src/main.py:app, src/cabinsentinel/ | Có bộ test backend dùng để regression snapshot. Không suy ra deployment từ folder này. |
| BUILD_PHASE/deploy/huggingface | 080c8e746dde3daf024074f7b9cc40646b3de6c0 | app.py, Gradio demo.launch | Gradio source cục bộ + camera API mới; không ghi đè công việc BACKEND_AGENT. |
| Cabin-backend-live-snapshot, clone Hugging Face Space | 0123ee55797ba34a1710ce776fc1b0673be8caf6 | app.py → src/main.py:app → demo_api/CabinService/rules/LangGraph | Source live audited, giữ nguyên không patch. |
| https://khanh3636-cabinsentinel-backend.hf.space | OpenAPI FastAPI1.0.0; Gradio6.29.0; HF RUNNING | SDK gradio, Python3.12, app_file app.py; REST mounted/forwarded; lifespan starts Vision and timer | /health + OpenAPI + real uploads xác minh live. REST YOLO dùng CPU; Gradio UI riêng có ZeroGPU. |

INFERENCE: HF metadata SHA và source clone khớp; live health/OpenAPI/behavior khớp snapshot, nhưng backend không trả một application build SHA từ /health. Không khẳng định source attestation của container.

Snapshot API: integration-evidence/backend-openapi-2026-10-02.json. Source live README/config xác nhận model path/hash, SQLite, upload5MiB/20M pixels, concurrency default1, sensor TTL5s và Vision TTL3s. /health quan sát database/backend/vision/timer ready, MQTT disabled. Không đọc/ghi secret deployment.
App FastAPI vẫn có route chat template riêng; frontend tích hợp chỉ dùng deterministic CabinService, không gọi chat/LLM để quyết định risk hoặc action.

IMPLEMENTATION / DESIGN MISMATCH:
- Root docs/FRONTEND_HANDOFF_V1.md mô tả Gradio /test_analyze_ui và 2-step SSE. Live hiện có REST demo/session/acknowledge/resolve; Gradio config live dùng /analyze. Bản tích hợp dùng REST đã runtime xác minh.
- docs/BACKEND_REASONING_ARCHITECTURE.md là mục tiêu Sprint0; không dùng phần planned như bằng chứng runtime. Backend live có incident lifecycle/timer/demo sessions, nhưng không có HTTP unlock-confirm control.
- Camera API trong deploy/huggingface local chưa có trong OpenAPI live. DOCUMENTED BUT NOT VERIFIED trên live. Không chuyển API camera local sang live bằng assumption.
- Frontend upstream còn nhiều product prototype/mock (fleet, profiles, preferences, WebRTC, seat positions/trends). Prototype không phải requirement backend.

## Contract chung đã xác minh

State = vehicle_id, revision, risk_level, rule_id, reason, occupancy_state, evaluated_at, sensor_snapshot/temperature/engine_status/doors_locked, detected_objects, seat_evidence/conflicts, freshness, decision_current, data_quality, incident/alert/unlock_request, actions/action_results và action_ledger khi được cấp quyền demo. Sensor/Vision thiếu có null/UNKNOWN; frontend không tạo số0 hoặc locked mặc định.

DemoResponse = session_id, session_token (chỉ cấp lần tạo), vision{source:MODEL_INFERENCE,detections[{class,confidence}],latency_ms}, vehicle_state{source:SIMULATED,scenario,vehicle_id,timestamp,sensor fields}, reasoning{revision,risk_level,rule_id,reason,occupancy_state,decision_current,freshness}, actions.

Session auth: Authorization: Bearer token trả lần đầu; credentials:omit (không cookie). Token chỉ ở memory; không URL/localStorage/env/log. session_id trong multipart cho upload tiếp theo. Reload bắt đầu phiên mới; HF restart có thể mất phiên SQLite. Không login/RBAC chủ xe thật.

Actions: backend lower-case status → UI PLANNED/ATTEMPTED/RUNNING/SIMULATED/SUCCESS/FAILED/PENDING_CONFIRMATION/UNKNOWN; tool/status không biết giữ UNKNOWN, không bỏ thành success. SIMULATED có “Mô phỏng”. Ledger giữ action_key, revision, incident để truy vết. Pending ledger là action đã ghi tại revision; unlock_request hiện tại có lifecycle pending/expired/canceled, không có nút mở khóa.

Errors: API string/Pydantic detail; malformed JSON/HTML/schema báo invalid response. GET timeout10s, analyze90s; no automatic mutation retry. 401 thiếu token,403 token sai,404 session/state không có,409 incident/revision/freshness conflict,413 quá giới hạn,415 MIME,422 validation/decoder/scenario,503 Vision/service unavailable hoặc concurrency busy (Retry-After). Poll lỗi → current unavailable; vẫn giữ verdict lịch sử. Client ngăn upload/mutation đồng thời, bỏ state revision cũ cùng vehicle; đọc GET không phát action. Timer backend có thể commit revision mới khi stale/escalation: không nhầm timer với replay.

## Bảng màn hình/thao tác → API

“Đã sửa FE” = mapping/client/UI đã đổi và có evidence bên dưới. “Unsupported” không có contract sản phẩm; không tạo endpoint giả.

| Chức năng/màn hình | Endpoint | Method | Request | Response | Auth/session | Lỗi và UI | Hỗ trợ hiện tại |
|---|---|---|---|---|---|---|---|
| Dashboard Overview / Owner Overview, current risk | /api/v1/demo/sessions/{id} | GET | session id | State + freshness/quality/ledger | Bearer sở hữu phiên |401/403/404/timeout/network/invalid → UNKNOWN hiện tại, history giữ rõ | Đã sửa FE, runtime verified |
| Upload dashboard / Owner /demo | /api/v1/demo/analyze | POST | multipart image JPEG/PNG≤5MiB, scenario; session_id nếu tiếp tục | DemoResponse, token nếu tạo | anonymous lần đầu; Bearer khi reuse |413/415/422/503 (busy có Retry-After), timeout/network; loading và no success fallback | Đã sửa FE, runtime verified |
| Chọn scenario | cùng /analyze | POST | normal/parked_locked/hot_locked | simulated vehicle + real YOLO/risk | như upload | không giả định tên scenario đảm bảo SAFE | 3 scenario hiển thị; live còn pet_mode/camp_mode/warm_parked chưa expose/test trong UI |
| Backend/model health (Dashboard / Owner) | /health | GET | none | backend/database/vision/safety_timer/mqtt | public | lỗi/HTML → model unavailable; disable Analyze nếu notready | Đã sửa FE, live ready verified |
| Sensor cards / Owner vehicle detail | session State | GET | none thêm | temp,engine,doors,occupancy,timestamp | same Bearer | null → UNKNOWN/—; stale banner; không tự suy theoengine/temp | Đã sửa FE, runtime + unit |
| Vision metadata / Owner /cabin | session State; demo vision | GET / POST analyze | image khi phân tích | classes/confidences, camera_status | same session | rỗng không chứng minh cabin trống; không bịa vị trí bounding box/ghế; chỉ metadata | Đã sửa FE; runtime person/empty |
| Seat evidence (dashboard) / Owner seatmap | session State | GET | none | seat_evidence/config/conflicts nếu có | same Bearer | unknown và nguồn/timestamp khi cung cấp | Dashboard mapping; Owner vị trí ghế UNKNOWN vì không có seatpositions; child-seat runtime NOT_VERIFIED |
| Action progress / ledger | session State / DemoResponse | GET / POST analyze | không manual command | backend action_results + action_ledger | same Bearer | planned/attempted/unknown/failed khác simulated/success; không thực thi lại từ GET | Đã sửa FE, simulated/pending runtime, các status khác unit only |
| Unlock request | session State unlock_request | GET | none | pending/expired/canceled | same Bearer | không có lệnh confirm/unlock live | Read-only lifecycle; unlock control UNSUPPORTED |
| Đánh dấu notification đã đọc | /api/v1/demo/sessions/{id}/acknowledge | POST | {incident_id} | State | Bearer phiên; incident đang mở |409 conflict; pending/actual response only | Đã sửa FE, UI + duplicate HTTP runtime; không resolve risk |
| Cabin check riêng | /api/v1/demo/sessions/{id}/resolve | POST | {incident_id,revision,cabin_checked:true} | State incident RESOLVED | same Bearer; checkbox đúng currentincident/revision |409 nếu revision/stale/notABSENT/conflict; error explicit | Đã sửa FE; backend rechecks. HTTP runtime accepted syntheticempty + stale rejected; UI accepted200/RESOLVED và controls đóng sau follow-upread |
| Dashboard event history / Owner /events + detail | /api/v1/demo/sessions/{id}/events?limit=50 | GET | limit50 | flat heterogeneous audit records | same Bearer | error/empty explicit; chỉ filter evaluation có risk, label Historical evaluation | Đã sửa FE, runtime history/routes; không giả lifecycle cho evaluation |
| Owner activeincident detail | session State incident | GET | displayed current id | incident OPEN/acknowledged, revision | same Bearer | id khác → not found; controls backend-bound | Đã sửa FE; same demo incident, không product incident catalog |
| Owner /vehicles, detail | session State | GET | none | single DEMO vehicle | same Bearer | trước upload empty; biển số/model thật không có | Đã sửa FE, runtime singlevehicle/routes; Add vehicle disabled |
| Owner /notifications preferences, emergency contact | không có | — | contract chưa có | — | product auth chưa có | Unsupported rõ, không local fake saved | UNSUPPORTED; cần product contract |
| Owner /profile, family, access | không có | — | contract chưa có | — | không account/RBAC | Unsupported rõ | UNSUPPORTED; cần quyết định/auth contract |
| Camera image/WebRTC/live feed, evidence photos | approved Gradio `camera_*` V1 in active-source snapshot | POST `/gradio_api/call/camera_*`, upload then SSE | capture image + sequence + timestamp | risk/freshness/bbox/action snapshot | one-time session bearer in POST body | explicit stale/duplicate/out-of-order/error; stop invalidates pending frame | local active-source code + frontend browser/YOLO verified; hosted deployment not updated |
| 30-minute telemetry/occupantconfidence trends | không có | — | — | — | — | không chartfabricated | UNSUPPORTED |
| Legacy manual emergency/JSONsimulation/reason-based acknowledgement | không có tương thích | — | khác live contract | — | — | disable capability; client501 nếu gọi | Backend gap, đã sửa dashboard tránh fakecall |
| Operations Web | /api/v1/state,risk,events/{vehicle}; /health (clientupstream) | GET | configuredCAR_1 | currentlegacy state | DEMO cần token; appchưaownsessions | trước chưa có phiên demo | Không sửa/runtime NOT_VERIFIED; build/typecheck only |
| Mobile Expo | sharedlegacy client / state,risk,events + health | GET | configured vehicle | state metadata | chưa demo token/upload integration | không suy build thành runtime | Không sửa; tests/export build only, runtime NOT_VERIFIED |
| Template chat/LLM | ngoài scope | — | — | — | — | không đưa vào safetypath | Không sử dụng |

## Cài đặt và chạy

Node≥20, npm. Backend live được cấu hình trong cả .env.example; .env.local ignored. Không secret VITE_*.

```bash
cd /Users/mac/BUILD_PHASE/Cabin-frontend
npm ci
npm --prefix frontend ci
cp frontend/.env.example frontend/.env.local
cp apps/owner-web/.env.example apps/owner-web/.env.local
# Terminal1
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
# Terminal2
npm run dev --workspace @cabinsentinel/owner-web -- --host 127.0.0.1 --port 4173 --strictPort
```

Dashboard http://127.0.0.1:5173; Owner http://127.0.0.1:4173/demo.
Dev servers được để chạy sau kiểm thử. Production bundle previews cũng được kiểm với backend live: Owner http://127.0.0.1:4183/demo và dashboard http://127.0.0.1:5183 (receipt/screenshots production-runtime). Open publicfixture/syntheticempty ở integration-evidence để tái hiện. Upload gửi ảnh đến HF; không lưu/preview rawimage trong UI. Không gửi ảnh riêng tư nếu chưa được cho phép.

Backend URL khác: đặt VITE_API_BASE_URL rồi restart/rebuild. Muốn chạy FastAPI local hãy dùng đúng src/main.py và MODEL_PATH/model artifact + dependency từ source backend đã chọn; root BUILD_PHASE/app không thay thế backend này. Source live Gradio app.py có model startup config riêng, không giả rằng uvicorn với MODEL_PATH rỗng có Visionready.

CORS OPTIONS đã verify exact origins http://127.0.0.1:5173 và :4173 với authorization. Live Gradio deployment phản hồi CORS ở lớp ngoài; không suy validator config local bảo vệ mọi response ở lớpouter. Frontend production cần URL/origin HTTPS được BACKEND_AGENT kiểm tra và SPA fallback index.html cho Owner routes. Task không deploy publicfrontend URL, không đổi CORSserver, không sync P-068.

## Bằng chứng và trạng thái

- CODE_CHANGED: YES — frontend/dashboard + Owner; source backend live/local không patch.
- TEST_EXECUTED: npm test (workspaces + dashboard), npm run typecheck/lint/build; backend pytest trên source live snapshot với bộ test local; script HTTPlive và browser Chromium.
- TEST_PASSED: 62 frontend/workspace (46dashboard,7Owner,3APIclient,4domain,2mobile); 181 regressionbackend; 19 HTTPlivechecks. Final build/typecheck/lint exit0; logs nằm dưới integration-evidence.
- INTEGRATION_VERIFIED: V1 upload → YOLO → VisionPayload + SIMULATED vehicle → CabinService deterministic rules/LangGraph → risk → action SIMULATED/pending → REST → dashboard/Owner.
- RUNTIME_VERIFIED: local browser frontend ↔ onlineHFbackend, với publicperson fixture và syntheticempty, stale/outage/invalidupload; HTTP auth/duplicate/resolve. Không có publicfrontend URL triển khai trong task.
- Production bundle Chromium: Owner4183 và dashboard5183 upload publicperson → CRITICAL + Mô phỏng + pending; không dùng Vite HMR để xác minh runtimebundle.
- HARDWARE_VERIFIED: NO. SAFETY_VALIDATED: NO. Child/child-seat capability: NOT_VERIFIED.

Evidence files (không token/header credential/raw privatephoto):
- frontend-tests.txt, frontend-typecheck.txt, frontend-lint.txt, frontend-build.txt; backend-tests.txt.
- live-contract-results.json (19 trường hợp): health,CORS2,missing/empty/oversized/corrupt/type/scenario,syntheticemptySAFE,auth401/403,exactduplicateVision revision invariant,publicYOLOhotCRITICAL,ackrepeat,stalevision,resolve409stale,freshsyntheticresolution,duplicateresolution,history.
- browser-live-critical.png: dashboard upload real public fixture, CRITICAL + simulated/pending.
- owner-live-critical.png, owner-live-fresh-safe.png, owner-live-stale.png: UI real inference/empty model result, freshnessunknown.
- owner-invalid-upload.png: corrupted PNG backend422. owner-network-outage.png: browseroffline, unavailablemodel/decision.
- owner-acknowledged.png: actual acknowledgement response visible. browser-owner-resolve.json và owner-resolved.png: resolve200/RESOLVED, follow-up UI đóng controls; fixturecheck chỉ demo tổng hợp.
- browser-double-submit.json: uploads=1 for two simultaneous submits; public-free synthetic fixture; no automatic secondrequest.
- browser-owner-responsive.json + owner-mobile-layout.png: viewport390, document390, không overflow sau chỉnh CSS sessionname; browser-owner-unlock-lifecycle.json: current canceled tách pending ledger.
- owner-sanitized-network.json: only operation/status/revision/risk/current/actions; excludes ids/tokens/headers/images.
- public-ultralytics-bus.jpg provenance https://raw.githubusercontent.com/ultralytics/assets/main/im/bus.jpg; public official model example, not a real cabin scene and not childvalidation. SHA256 in HTTPreceipt.
- synthetic-empty.png: generated blank640×480RGB image; corrupt-image.png generated invalidbytes. No privatefixture persisted.

Tests dùng fakeAPI/faketimer kiểm tra timeout/malformed/missing/outoforder/rendering chỉ là unit evidence. Backend regression dùng tests của safety-alert-backend với import PYTHONPATH trỏ live snapshot; snapshot không có test package riêng. Không diễn giải181 tests thành181 liveHTTPchecks.
Reproduce HTTP suite với Python3.12 + httpx: `python scripts/verify-live-integration.py`. Tool run dùng dependency đã có ở /private/tmp/cabinsentinel-camera-deps. Script giữ token trong memory, output bỏcredential.
Build ban đầu cần permission cho Expo cache ngoài workspace; một lượt cuối bị lỗi TS enum widening trong regressionfixture, đã sửa typeannotation, không đổi expectedbehavior. Một lượt compile tiếp theo phát hiện sharedActionProgress đặt nhầm scope Overview thiếu hook; sửa caller đúng scope và rerun. Dev HMR từng split context khi đổi sharedstore; entrypoints reload khi sharedAPI/context thay đổi; sessionreset khi reload là hành vi rõ.

## Safety review, gaps và owner tiếp theo

VERIFIED FACT: không diff backend; riskrules/actionrouting vẫn deterministic/offline. FE không callsLLM, không làm actuator, không autounlock, không tự resolving sau ack. Missing telemetry/currentness và invalidfreshness bị coi unavailable, backend SAFE giữ chỉ như verdict lịch sử. UI bỏ threshold35°C và occupancy+enginecolor tựsuy từ prototype. Current SAFE chỉ hiển thị khi backendcurrent + đủmetadata + bothfreshness + sessionconnected và khôngpending.

OUT_OF_SCOPE_CRITICAL_FINDING: stock YOLOv8n person/cat/dog không child classifier; upstream/backend README đã ghi child/infant miss dẫn EMPTY_CABIN/SAFE ở mẫu trước. Evidence hiện tại kiểm person/empty, không chứng minh child/infant detection hoặc child-seat safety. Owner: VISION_AGENT + SAFETY_AGENT; đề nghị priority trước demo claims về trẻ em. Không sửa policy hoặc model trong checkpoint integration.

Known limitations / PROPOSED DESIGN (không requirement đã duyệt):
- `/demo/analyze` không công bố Idempotency-Key; submit sau khi request trước hoàn tất là frame/demo evaluation mới, có thể tăng revision. FE chỉ ngăn concurrentdouble-submit và không retrymutation; duplicateVisionpacket/ack/resolve đã được kiểm riêng. Nếu cần transportretrydedup cho analyze: NEED_USER_DECISION về contract trước khi sửa publicAPI (BACKEND_AGENT/PO).
- Backend ephemeral sessions/restart; no productidentity/fleet/RBAC. BACKEND_AGENT + PO cần duyệt nếu mở rộng accountfleet.
- No unlock-confirmAPI: tiếp tục chỉ readpending. Cần approved quyền/freshness/revision/incident/idempotency + hardwarecontract trước khi triển khai. Không tạo APIgiả.
- Camera/blur/seatpositions/trends: BACKEND_AGENT/VISION_AGENT cần thống nhất contract/deploy; FE giữunsupported.
- npm audit sau cài: root17 vulnerabilities (11moderate6high), dashboard2moderate, chủ yếu existing Expo/dev/toolchain; dependency versions không nâng tự động. Owner dependency/security review, không productionready claim.
- Chưa publish frontend, chưa chứng minh CORS HTTPSproduction, chưa CI online/mobile operationsruntime/realhardware. Owner DEPLOY_AGENT; khi user yêu cầu sync phải theo workflow sync-to-p068.md.
- Route history chỉ latest50 auditrecords, không pagination/productincidentfilter. Backendresult/actionledger giữ trace keys; không claim UI chứa full end-to-endhardwareaudit.

## Rule26 — gate BTC

Ngày kiểm tra2026-10-02, cohort4 theo contextproject. Attempt https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4 và https://phoenix.note.transformerlabs.ai/demo-day không truy cập/xác minh được bằng webtool. Rubric/form/deadline và submissionrequirements hiện hành: UNVERIFIED. Owner PO/chủproject cung cấp accessible BTC source trước checkpoint submission phụ thuộc. Không dựa Cohort3 như requirementCohort4; không READY_TO_SUBMIT.
Internal10deliverables còn là checklist nội bộ: source/README/sơ đồ/AIlog/liveURL/video/slides/journal/worklog/evaluation. Task này có source,runREADME,AIlog,test/evaluation; publicfrontendURL,video/slides/submissioncontribution/individualAIlogcounts/deadline chưa xác minh, owner PO + DEPLOY_AGENT. Không chặn integration contract đã được user giao vì task không quyết định submission.

## AGENT_HANDOFF

Task: FRONTEND-INTEGRATION-20261002. Files changed: frontend API/types/store và presentation; new DemoIncidentControls/UnlockRequestStatus; Owner mapping/App/i18n/styles/main/env/README; targeted regressiontests; integrationdocs/scripts/evidence; root BUILD_PHASE handoff annotation/AI_LOG.
Verified behavior: real V1 session/upload/statehistory, truthful simulated actions, unknownmissingstale, authenticated acknowledge/resolve, UI reuse ownsession and concurrent dedup.
Tests:62FE +181BE +19liveHTTP; Chromium dashboard/Owner; final commandlogs and screenshots attached.
User decisions used: DECISION-20261002-OWNER-DEMO-V1. Assumptions remaining: none used to introduce backend requirement; deployment/product decisions remain explicitly unavailable.
Known risks: stockmodel child detection gap; sessionephemeral; unsupported product/camera/unlock; dependenciesaudit; productionorigin/publicURL notverified; nohardware.
Next recommended owner: FRONTEND_AGENT maintain sharedclient; BACKEND_AGENT compare localcamera deployment/live and define missingcontracts; VISION_AGENT/SAFETY_AGENT modelgap; DEPLOY_AGENT origin/deploy; PO BTCgate.


### Backend integration follow-up 2026-10-03

Camera API V1 has been merged locally into `Cabin-backend-live-snapshot` at baseline `0123ee55797ba34a1710ce776fc1b0673be8caf6` with additive Gradio endpoints. Existing `/api/v1/demo/*` schema/risk/action/auth behavior remains unchanged. The REST service and Gradio camera handler share the same `get_cabin_service()` singleton and existing safety timer; camera detection reuses the entrypoint YOLO model. Runtime evidence: local active-source process + browser fake public camera image; Gradio schema exposed `/camera_start`, `/camera_status`, `/camera_frame`, `/camera_stop`, `/camera_report`; browser observed frame 37 at 640x480, 4 detections and backend CRITICAL current result; stop succeeded. See backend source `docs/evidence-camera-api/`. Live HF deployment was not changed.

Additional frontend validator now accepts camera_status `ERROR`/`DISCONNECTED`, preserving explicit unavailable rather than rejecting the backend response. Unit coverage includes contract tests for both states. Non-demo product functions without approved contracts remain unsupported: accounts/family/roles, vehicle fleet, notification preferences/emergency contacts, telemetry trends, and Ops/Mobile demo-session auth. Need product/API decisions before persisting those objects or exposing fleet data.
