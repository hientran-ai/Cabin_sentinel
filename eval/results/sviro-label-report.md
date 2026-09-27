# Báo cáo nhãn dữ liệu SVIRO cho bài toán phân loại độ tuổi

## 1. Phạm vi

Báo cáo mô tả bộ dữ liệu đã chuẩn bị tại `data/sviro-child`, được tạo từ ảnh khoang xe BMW X5 của SVIRO. Mỗi mẫu là một ảnh cắt quanh người được gán nhãn theo vị trí ghế. Bộ dữ liệu gồm 2.500 cảnh và 2.275 ảnh cắt người, chia thành tập huấn luyện, kiểm định và kiểm thử.

## 2. Ý nghĩa nhãn

| Nhãn gốc SVIRO | Ý nghĩa | Nhãn dùng để huấn luyện |
| --- | --- | --- |
| `1` | Em bé trong ghế dành cho trẻ sơ sinh (*infant in infant seat*) | `child` |
| `2` | Trẻ em trong ghế trẻ em (*child in child seat*) | `child` |
| `3` | Người lớn | `adult` |
| `0`, `4`, `5`, `6` | Ghế trống, đồ vật hoặc ghế trẻ em/trẻ sơ sinh không có người | Loại khỏi bài toán phân loại tuổi |

Như vậy, **“em bé” và “trẻ em” là hai nhãn gốc khác nhau nhưng cùng được gộp vào `child`**. Mô hình hiện tại chỉ học hai lớp `child` và `adult`; nó không dự đoán riêng em bé hay trẻ em. `unknown` là quyết định khi điểm dự đoán không đạt ngưỡng tin cậy, không phải nhãn huấn luyện. Nhãn `3` trong dữ liệu phát hiện SVIRO chỉ có nghĩa là *person*; nhãn `3` trong bảng trên là nhãn phân loại theo ghế, có nghĩa là *adult*.

## 3. Số lượng và cách chia tập

| Tập | Số cảnh | Em bé (nhãn 1) | Trẻ em (nhãn 2) | Tổng `child` | `adult` | Tổng ảnh cắt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Huấn luyện | 1.627 | 303 | 455 | 758 | 737 | 1.495 |
| Kiểm định | 373 | 68 | 114 | 182 | 155 | 337 |
| Kiểm thử | 500 | 109 | 100 | 209 | 234 | 443 |
| **Tổng** | **2.500** | **480** | **669** | **1.149** | **1.126** | **2.275** |

Tập kiểm thử là tập test chính thức của SVIRO. Từ 2.000 cảnh huấn luyện chính thức, quy trình dùng seed 68 để chia theo cảnh thành 1.627 cảnh huấn luyện và 373 cảnh kiểm định; các ảnh cắt từ cùng một cảnh ở cùng một tập.

## 4. Cách tạo nhãn

Quy trình lấy hộp người, ghép hộp với mặt nạ người của từng ghế, rồi đọc nhãn ghế trong tên ảnh gốc. Ảnh cắt của người được đưa vào thư mục `train`, `val` hoặc `test`, bên dưới là `child` hoặc `adult`. Quy trình không suy ra tuổi từ chiều cao hay kích thước hộp; ghế trẻ em trống cũng không được coi là người lớn.

## 5. Kết quả mô hình và giới hạn

Mô hình MobileNetV3 Small hiện có phân loại hai lớp trên ảnh cắt. Theo báo cáo huấn luyện, balanced accuracy trên 337 ảnh kiểm định là 100%; trên 443 ảnh kiểm thử là 95,69%. Với ngưỡng quyết định mặc định, trong 209 ảnh `child` của tập kiểm thử, 191 ảnh được dự đoán `child`, 13 ảnh `unknown`, và 5 ảnh sai thành `adult`. Cả 234 ảnh `adult` được dự đoán `adult`. Phân tích riêng tập kiểm thử ghi nhận 109/109 ảnh em bé và 82/100 ảnh trẻ em được nhận là `child`.

Các số liệu này đo **phân loại trên ảnh cắt đã có**, chưa đo toàn bộ quy trình phát hiện người rồi phân loại trên video thực tế. SVIRO là dữ liệu tổng hợp của một mẫu xe; người hoặc texture có thể xuất hiện ở cả tập huấn luyện và kiểm định. Cần đánh giá thêm trên video khoang xe thật trước khi sử dụng kết quả cho cảnh báo.

## 6. Nguồn số liệu trong dự án

- `data/sviro-child/summary.json`: trạng thái chuẩn bị và số ảnh cắt theo hai lớp.
- `data/sviro-child/manifest.jsonl`: nhãn gốc của từng ảnh cắt, dùng để đếm riêng em bé và trẻ em.
- `runs/age-baseline/report.json`: kết quả mô hình trên tập kiểm định và kiểm thử.
- `docs/sviro-child-adult.md`: quy trình tạo nhãn, đánh giá và các giới hạn.
