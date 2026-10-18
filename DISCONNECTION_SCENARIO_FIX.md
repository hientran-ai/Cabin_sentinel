# Mất kết nối với xe: nguyên nhân gốc và cách sửa

**Tái hiện (trước, `before-lost.png`)**: nút "Mất kết nối" chỉ đặt `linkState.cutUntil` làm **trình duyệt** không gọi được API 15 giây. Đó là mất kết nối trình duyệt↔máy chủ, không phải xe. Xe vẫn "gửi" dữ liệu trong clip; `connection` chuyển `lost`, nhưng khi nối lại, `risk` ở lại `ERROR / VISION_UNAVAILABLE` (khung bị bỏ trong lúc cắt). Không có RECONNECTING/DISCONNECTED/SYNCING, không có nút nối lại thật.

**Sau khi sửa**
- Backend (`services/api/src/cabinsentinel/link.py`, `e2e_api.py`): liên kết xe **mô phỏng của từng phiên**. `POST /sessions/{id}/link {DROP|RESTORE}`. Khi DROP: sensor, observation, camera-status bị từ chối `409` (không xếp hàng, không giả); đọc trạng thái vẫn chạy; bằng chứng và dấu thời gian cuối giữ nguyên; sự cố không bị chạm. Máy trạng thái: `CONNECTED → RECONNECTING → DISCONNECTED (sau CABIN_LINK_DISCONNECT_AFTER_S, mặc định 8 s) → SYNCING → CONNECTED`; SYNCING chỉ kết thúc khi nhận tin mới của **mọi loại** xe đã gửi trước khi mất (sensor, hình). Read model có `connectivity`.
- Tách khỏi: trình duyệt offline (`connection`), camera lỗi (`camera_status`), dữ liệu cũ (TTL): mỗi thứ có thông điệp riêng.
- Frontend: `view.ts` có `vehicle-offline` ("Chưa thể xác minh"), `VehicleLinkBanner` với **Thử kết nối lại** (gọi `RESTORE`, báo lỗi thật nếu hỏng, phát lại clip nếu đã hết), **Xem dữ liệu cuối**, **Xem sự cố đang hoạt động**; huy hiệu `RECONNECTING/OFFLINE/SYNCING` trong hộp thoại cabin; xe offline không gửi gì.
- Điều khiển trong khu nhà phát triển: Dừng tình huống, Mô phỏng mất/nối lại xe, Quay lại Cockpit. Không đụng `navigator.onLine`, không dừng máy chủ.

**Hạn chế**: ngưỡng chỉ cho demo, không phải giới hạn an toàn đã kiểm chứng. DC-01 (Pi vẫn chạy cục bộ, hàng đợi sự kiện) và DC-02 (Pi tắt hẳn) **chưa kiểm được**: không có phần cứng, và không có hàng đợi sự kiện cục bộ trong bản demo.
