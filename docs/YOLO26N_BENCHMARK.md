# YOLO26n so với YOLOv8n trên thiết bị giả lập (13/10/2026)

Mô hình mới: `yolo26n.pt` (commit `998955e` của Tâm, nhánh `BaoTam`). Đây là detector COCO gốc thế hệ mới, ghim bản
Ultralytics v8.4.0, SHA-256 `9b09cc8b…4fef` (đã kiểm khi tải). Nhánh này đã cherry-pick commit đó; backend demo và
simulator chạy YOLO26n (xác nhận qua `/api/v1/admin/system/vision`).

Nhãn số liệu: **đo thật** = chạy trên máy Mac M-series; **ước lượng Pi 5** = đo trên Mac với 4 luồng NCNN rồi nhân hệ số
hiệu chỉnh của `embedded/dev/pi_sim/simulate.py`. Chưa có số đo trên Pi 5 thật.

## 1. Tốc độ: NCNN, chỉ lượt chạy model, 4 luồng

Hệ số đo lại trong cùng lượt chạy: YOLOv8n@640 trên Mac = 18,99 ms, ứng với 85,06 ms trên Pi 5 (số công bố của Ultralytics),
nên k = 4,48 (bình thường) và 5,58 (máy chậm). Khi Pi nóng và hạ xung, nhân thêm 1,6.

| Model | Ảnh | Mac p50 (đo thật) | Pi 5 (ước lượng) | Pi 5 chậm | Pi 5 hạ xung | FPS Pi 5 | Trọng số |
|---|---|---|---|---|---|---|---|
| YOLOv8n | 640 | 18,99 ms | 85 ms | 106 ms | 169 ms | 11,8 | 12,7 MB |
| YOLO26n | 640 | 19,72 ms | 88 ms | 110 ms | 176 ms | 11,3 | 9,7 MB |
| YOLOv8n | 512 | 12,63 ms | 57 ms | 70 ms | 113 ms | 17,7 | 12,7 MB |
| YOLO26n | 512 | 13,15 ms | 59 ms | 73 ms | 117 ms | 17,0 | 9,7 MB |
| YOLOv8n | 320 | 5,87 ms | 26 ms | 33 ms | 52 ms | 38,1 | 12,6 MB |
| YOLO26n | 320 | 6,16 ms | 28 ms | 34 ms | 55 ms | 36,2 | 9,7 MB |

YOLO26n chậm hơn khoảng 4–5 % khi chạy với NMS (đúng cấu hình Tâm chọn, `end2end: false`), và nhẹ hơn 24 % về trọng số.
Đầu ra NCNN giống YOLOv8 (84×2100 ở 320), nên `embedded/cabin_edge/v3/ncnn_yolo.py` dùng được ngay.

## 2. Độ chính xác trên 4 video mẫu (đo thật)

Số khung có sinh vật ở ghế, dạng ≥ 0,40 / ≥ 0,15. Tổng số khung lấy mẫu với tốc độ 2,5 khung/s: trẻ ghế sau 21,
cabin trống 31, người lớn 20, trẻ (video do AI tạo) 25.

| Video | Ghế thật | YOLOv8n 640 | YOLO26n 640 | YOLOv8n 320 (NCNN) | YOLO26n 320 (NCNN) |
|---|---|---|---|---|---|
| Trẻ ghế sau | rear_right | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** |
| Người lớn ghế trước | front_left | 17 / 20 | 14–16 / 20 | 19 / 20 | 14 / 20 |
| Trẻ (video do AI tạo) | seat_right | 25 / 25 | 25 / 25 | 25 / 25 | 25 / 25 |
| Báo nhầm ở ghế trống: cabin trống | | 0 / 11–13 | **0 / 0** | 0 / 0 | **0 / 0** |
| Báo nhầm ở ghế trống: video người lớn | | 1 / 1 | 0 / 17–19 | 0 / 1 | **0 / 0** |
| Báo nhầm ở ghế trống: video trẻ | | 0 / 0 | 0 / 0 | 0 / 16 | **0 / 0** |

Kết quả khi chạy cả chuỗi qua simulator (backend YOLO26n, localhost):

| Video | YOLOv8n | YOLO26n |
|---|---|---|
| Trẻ ghế sau | SAFE 42/42 (sót) | SAFE 42/42 (**vẫn sót**) |
| Cabin trống | SAFE | SAFE |
| Người lớn ghế trước | WARNING ngay | WARNING sau 0,5 s |
| Trẻ, 30 °C | WARNING | WARNING |
| Khứ hồi p50 / p95 | 45–48 / 55–176 ms | 44–47 / 55–69 ms |

## 3. Pipeline v3 trên Pi (kịch bản A–F của `pi_sim`, detector NCNN 384×640, đo thật trên Mac)

| Kịch bản | YOLOv8n | YOLO26n |
|---|---|---|
| A: cabin trống, có ảnh tham chiếu | 0 báo nhầm | 0 báo nhầm |
| B: trẻ detector không thấy, có ảnh tham chiếu | báo sau 0,83 s, 0 khung báo trống | báo sau 0,83 s, 0 khung báo trống |
| C: trẻ, không có ảnh tham chiếu | không báo có người, nhưng 0 khung báo trống (UNVERIFIED) | như YOLOv8n |
| E: người lớn ghế trước | báo sau 0,00 s | báo sau 0,25 s |
| F: ban đêm, đèn pha, mờ, che, đứng hình, bẩn, che một phần | trẻ không bao giờ bị báo trống | như YOLOv8n |

Ở kịch bản E, tổng báo nhầm 1,0 là của ghế `rear_right` khi không có ảnh tham chiếu. Lỗi này giống nhau ở cả hai model nên do logic v3, không do detector.

## 4. Kết luận

- **Dùng YOLO26n được.**
  - Ở 320, cỡ ảnh Pi hay chạy, YOLO26n không báo nhầm khung nào ở ghế trống trên cả 4 video (YOLOv8n: 17 khung yếu).
  - Ở 640, cabin trống sạch hơn (0 khung so với 11–13), nhưng video người lớn có thêm hit yếu (< 0,40) ở ghế sau bên phải.
    Bước theo dõi 3/5 khung biến chúng thành "nghi có người" (`SUSPECTED_OCCUPANT`). Trong video đó đằng nào cũng có người lớn nên kết luận không đổi,
    nhưng ghế báo sai.
  - Trọng số nhẹ hơn 24 %, tốc độ trên Pi gần bằng YOLOv8n, pipeline v3 cho kết quả giống hệt.
- **YOLO26n không giải quyết được trẻ ngồi ghế sau.** Cả hai model đều 0/21 khung. Trên Pi, trường hợp này vẫn an toàn
  nhờ so sánh với ảnh tham chiếu cabin trống (kịch bản B báo sau 0,83 s). Backend demo và simulator **chưa có** bước này, nên vẫn báo SAFE.
  Việc tiếp theo: (1) finetune từ `yolo26n.pt` trên dữ liệu cabin (`IN_CABIN_SETUP_AND_FINETUNE.md`);
  (2) ~~đưa bước so ảnh tham chiếu vào simulator~~ đã làm: video trẻ ghế sau báo sau 1,9 s (`E2E_SIMULATION.md` §3.5); (3) sửa SR-01 trong `rules.py` theo quy trình §5.4.
- Người lớn được nhận chậm hơn một chút (14–16/20 khung đạt ≥ 0,40 so với 17/20) nhưng vẫn được báo trong 0,5 s nhờ bước theo dõi 3/5 khung.
- Còn phải đo trên Pi 5 thật: FPS, p95, nhiệt độ, RAM (theo `YOLO26_MIGRATION_VI.md`).
