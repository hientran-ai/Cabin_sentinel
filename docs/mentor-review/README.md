# CabinSentinel — Bộ tổng quan xin mentor review

Ngày chuẩn bị: 14/10/2026  
Mục tiêu: trình bày trong 10–12 phút, demo 3–5 phút, dành phần còn lại để mentor phản biện kiến trúc và kế hoạch kiểm chứng.

## Bộ tài liệu

- [01-one-page-overview.md](01-one-page-overview.md): bản tóm tắt một trang gửi mentor trước buổi review.
- [02-presentation-script.md](02-presentation-script.md): nội dung 12 slide và lời nói gợi ý.
- [03-demo-and-review-checklist.md](03-demo-and-review-checklist.md): kịch bản demo, checklist trước buổi trình bày và câu hỏi xin review.

## Thông điệp xuyên suốt

> CabinSentinel là hệ thống hỗ trợ phát hiện người hoặc vật nuôi bị bỏ quên trong cabin. AI tạo bằng chứng nhận biết; safety rules xác định mức rủi ro; hệ thống tiếp tục được thiết kế theo hướng edge-first để không phụ thuộc Internet. Phiên bản hiện tại là technical integration baseline, chưa phải sản phẩm an toàn sẵn sàng thương mại.

## Cách sử dụng

1. Gửi bản one-page cho mentor trước buổi gặp.
2. Dùng tài liệu presentation script làm khung slide hoặc speaker notes.
3. Chạy checklist demo trước buổi trình bày ít nhất một lần.
4. Kết thúc bằng 5 câu hỏi review ưu tiên, không kết thúc chỉ bằng “mentor có góp ý gì không?”.

## Bằng chứng kỹ thuật đã kiểm tra tại workspace

Kết quả ngày 14/10/2026:

| Hạng mục | Kết quả |
|---|---:|
| Backend test theo CI (`pytest tests -q`) | 303 passed, 17 skipped, 2 subtests passed |
| Frontend/unit/worker (`npm test`) | 27 passed, 5 test files |
| TypeScript typecheck | Passed |
| Ruff | Passed |
| Production web build | Passed |

Lưu ý: chạy `pytest -q` từ root để tự động collect cả `tests/` và `cabin-noir/backend/tests/` hiện lỗi collection do hai test package cùng mang tên `tests`. CI hiện chạy `pytest tests/`, nên suite chính vẫn xanh. Nên tách cấu hình test cho từng workspace hoặc dùng import mode phù hợp.

