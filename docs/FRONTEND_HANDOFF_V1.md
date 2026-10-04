# Bàn giao Frontend — CabinSentinel MVP V1

Ngày: 28/09/2026. Owner đề xuất: Backend (Khánh), Vision (Tâm), Frontend (thành viên nhận việc).

## 1. Trạng thái bàn giao

- API V1 đã có trên nhánh Khanh của repo nhóm: https://github.com/AI20K-Build-Phase-Cohort-4/P-068.
- Bản bàn giao bao gồm các sửa Docker/Pillow/ignore và tài liệu này; gửi kèm SHA commit đã push để người nhận lấy đúng phiên bản.
- Kiểm chứng gần nhất: 138 tests và Ruff đạt; Docker local Linux ARM64 qua cache wheel kiểm SHA-256; 4 lượt inference ảnh và 5 request lỗi đạt.
- API online URL chưa được cấp; Frontend có thể bắt đầu theo contract và chạy local khi có model.
- Weights smoke là YOLO stock, chưa phải weights custom Tâm đã duyệt; đã có false negative trên ảnh trẻ trong cabin. V1 minh họa luồng kỹ thuật, chưa chứng minh độ chính xác nhận diện trẻ em.

## 2. Những thứ Backend phải cung cấp

| Hạng mục | Giá trị / trạng thái |
|---|---|
| Repo / branch | Repo P-068, branch Khanh; gửi kèm SHA sau khi push bản bàn giao |
| API base URL | Local: http://localhost:8000; online: Backend/DevOps bổ sung |
| OpenAPI / Swagger | `<API_BASE_URL>/openapi.json` và `<API_BASE_URL>/docs` |
| Model | Tệp YOLO `.pt` do Backend/Vision cấp ngoài Git, cùng nguồn và checksum |
| CORS | Frontend gửi origin local và domain Vercel chính xác để Backend cấu hình |
| Ảnh demo | Backend/Vision cung cấp bộ ảnh ngoài Git và ghi rõ nguồn/giới hạn; không cam kết risk chỉ từ tên scenario |
| Tài liệu backend | [V1_ONLINE_DEMO.md](V1_ONLINE_DEMO.md) |

## 3. Chạy thử local

Dùng Python 3.11 và tệp model đã được cấp. Tại thư mục repo:

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-vision.txt
MODEL_PATH=/absolute/path/to/yolov8n.pt \
  YOLO_AUTOINSTALL=false \
  CABINSENTINEL_MQTT_ENABLED=false \
  CORS_ORIGINS=http://localhost:3000,http://localhost:5173 \
  .venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000
```

Sửa đường dẫn model và origin theo máy của người nhận. Backend kiểm tra cấu hình `.env` có sẵn trước khi chạy; không gửi secret cho Frontend. Nếu mở server từ máy khác, `localhost` của Frontend không trỏ đến máy Backend: phải dùng URL truy cập được và cấu hình CORS phù hợp.

Kiểm tra `GET /health`: có model/SQLite sẵn sàng và MQTT disabled thì trả 200. Thiếu model trả 503 với `vision: unavailable`; đây là trạng thái chưa sẵn sàng phân tích ảnh. Docker liveness healthy không thay thế cho phép kiểm readiness này.

## 4. API upload

`POST /api/v1/demo/analyze`, body `multipart/form-data`:

| Field | Kiểu | Giá trị |
|---|---|---|
| image | File | JPEG hoặc PNG, tối đa 5 MiB theo cấu hình mặc định |
| scenario | String | normal / parked_locked / hot_locked |

| Scenario | Trạng thái xe giả lập chính |
|---|---|
| normal | 25°C, có người lái, xe đang chạy, HVAC active |
| parked_locked | 25°C, xe đỗ/khóa, không có người lái, HVAC inactive |
| hot_locked | 40°C, xe đỗ/khóa, không có người lái, HVAC inactive |

Scenario cung cấp input xe. Risk cuối cùng phụ thuộc cả detection và rules của Backend.

```bash
curl -F 'image=@cabin.jpg;type=image/jpeg' \
  -F 'scenario=hot_locked' \
  http://localhost:8000/api/v1/demo/analyze
```

Ví dụ gọi từ browser, độc lập framework:

```javascript
export async function analyzeCabin(apiBaseUrl, imageFile, scenario) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('scenario', scenario);
  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, '')}/api/v1/demo/analyze`,
    { method: 'POST', body: form, credentials: 'omit' }
  );
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data.detail === 'string'
      ? data.detail : `Phân tích ảnh thất bại (HTTP ${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }
  return data;
}
```

Để browser tự đặt `Content-Type` và multipart boundary. Caller cũng xử lý lỗi mạng/CORS và JSON không hợp lệ qua `try/catch`; luôn kết thúc trạng thái loading.

## 5. Response và cách hiển thị

| Field hiện có | Frontend sử dụng |
|---|---|
| session_id | ID lần phân tích |
| vision.source | MODEL_INFERENCE |
| vision.detections | Danh sách `{class, confidence, bbox, age_group, age_scores, age_crop}`. `class` là nhãn detector (`person`/`dog`/`cat`). `age_group` chỉ có với `person`: `adult`/`child`/`unknown` (`unknown` = chưa có bằng chứng tuổi, không phải người lớn); `null` với dog/cat. Các field tuổi/bbox là bổ sung tùy chọn |
| vision.age_classifier | `{status: ok/disabled/load_failed/error, checkpoint_sha256, model_classes, thresholds}` |
| vision.latency_ms | Thời gian inference, có thể null |
| vehicle_state | Input xe, có source SIMULATED và scenario |
| reasoning.risk_level | Hiển thị verdict Backend trả về |
| reasoning.rule_id / reason | Hiển thị lý do và mã rule để kiểm tra |
| reasoning.occupancy_state | Trạng thái evidence hiện diện |
| reasoning.decision_current / freshness | Hiển thị tình trạng dữ liệu; khi decision không còn current phải báo rõ |
| actions | Đọc tool/status của từng action; có thể là danh sách rỗng |

Lấy schema đầy đủ từ OpenAPI, không thay đổi field names theo UI. Backend hiện có SAFE, WARNING, CRITICAL, NOTICE và ERROR; UI cần hiển thị được ERROR/NOTICE và có trạng thái rõ ràng cho giá trị chưa hỗ trợ hoặc thiếu kết quả. UI sử dụng verdict Backend, không tự suy CRITICAL từ person hoặc SAFE từ danh sách detection rỗng.

Horn/SMS/notification là `simulated`; request_unlock là `pending_human_confirmation`. Label trên UI ghi rõ mô phỏng/chờ xác nhận. Response này không chứng minh đã mở cửa hay gửi SMS thật. Luồng này hỗ trợ person/dog/cat; không dùng nhãn person để kết luận tuổi. `age_group` là gợi ý riêng, không đổi risk/cảnh báo; `adult`/`unknown` không có nghĩa là xe an toàn.

## 6. Lỗi và trải nghiệm người dùng

| HTTP / tình huống | Cách xử lý |
|---|---|
| 413 | Báo ảnh/request quá lớn hoặc vượt giới hạn pixel; cho chọn ảnh khác |
| 415 | Báo chỉ nhận JPEG/PNG |
| 422 | Báo ảnh không hợp lệ, thiếu field hoặc scenario không được hỗ trợ; detail có thể là string hoặc validation array |
| 503 do quá tải | Báo backend đang bận; backend gửi Retry-After: 1; cho thử lại sau, tránh vòng retry liên tục |
| 503 do model/inference/database | Hiển thị chưa thể phân tích; Backend kiểm tra service, không hiển thị SAFE |
| Network/CORS/5xx | Hiển thị lỗi kết nối/xử lý và cho thử lại; giữ thông tin lỗi để Backend chẩn đoán |

Có thể disable nút gửi khi đang phân tích để tránh gửi lặp. Backend mặc định nhận một analysis đồng thời trên mỗi worker. Nếu Frontend cần đọc header Retry-After qua cross-origin fetch, phối hợp Backend bổ sung expose_headers; cấu hình CORS hiện chưa expose header này. Chưa tự thay contract trong tài liệu bàn giao.

## 7. Checklist nghiệm thu cùng nhau

- [ ] Người nhận xác nhận đã checkout đúng SHA bản bàn giao trên Khanh.
- [ ] Tâm/Khánh cấp weights và bộ ảnh demo ngoài Git.
- [ ] Frontend chạy upload + preview + chọn scenario + loading + kết quả/lỗi theo contract.
- [ ] Backend/DevOps cấp URL online, cấu hình CORS đúng domain Vercel, `/health` trả 200.
- [ ] Cùng chạy từ browser Vercel qua API online; kiểm tra input/output/network request với bộ ảnh đã thống nhất.
- [ ] Thử ảnh sai định dạng, quá lớn, ảnh hỏng và backend unavailable; UI không hiển thị kết quả cũ như quyết định mới.
- [ ] Risk/reason khớp response; actions ghi rõ mô phỏng/chờ xác nhận.
- [ ] Ghi lỗi và xác nhận của người nhận; sau đó chốt bàn giao bản V1 online.

Frontend có thể làm UI/tích hợp local song song với việc cấp URL online. Backend chịu trách nhiệm giải quyết lỗi tích hợp đến khi người nhận chạy được luồng demo đã thống nhất.

## Backend alert profile cập nhật 30/09/2026

Backend bổ sung phiên analyze liên tục với Bearer token, incident bền vững, lịch notification độc lập risk, ACK riêng với cabin check và action ledger. Xem [hướng dẫn kiểm backend/API](BACKEND_ALERTS_TEST_GUIDE.md). Chưa triển khai frontend trong task này. Client cũ analyze một lần vẫn dùng được; mỗi phiên mới nhận thêm session_token. API/source/risk mới và migration được mô tả trong hướng dẫn; không dùng bảng V1 cũ như policy mới.
