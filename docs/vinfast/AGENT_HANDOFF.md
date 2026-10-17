AGENT_HANDOFF — VINFAST-HMI-IMPL-20261016
- Task: frontend VinFast thứ ba `/cockpit/vinfast/` cạnh SU7 và Tesla.
- Files changed: xem `docs/vinfast/VINFAST_HMI_REPORT.md` và `AI_LOG.md` (BUILD_PHASE). Ledgers: `docs/vinfast/{geometry,motion,source}-ledger.json`.
- Verified behavior: tsc/vitest 79/79/build; chạy local với backend thật (CRITICAL, 1 người); count-per-frame có test; SU7/Tesla tải được.
- User decisions used: dùng ảnh/icon nguồn cho phần không tự vẽ; không push khi chưa hỏi.
- Assumptions remaining: vị trí widget, theme sáng, motion timing là PROPOSED; icon sidebar/map còn lucide.
- Known risks: SR-01 mở; không có analytics đồ vật; chưa đo FPS/golden; nền ảnh xe lộ nhẹ ở theme tối.
- Next owner: REVIEW_AGENT (QA golden/FPS/phone-width, camera fault) → PO (hỏi trước khi push P-068); BACKEND/VISION cho analytics đồ vật.
