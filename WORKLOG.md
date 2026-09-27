# Worklog — Team [Tên Team]

> Ghi lại tất cả công việc đã làm theo ngày. Ai làm gì, kết quả gì.

---

## 2026-09-24

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| BaoTam | Tạo nhánh riêng trên repo đội | ✅ Done | Nhánh `BaoTam`, theo dõi `origin/BaoTam` | — |
| BaoTam + Codex | Rà soát baseline SVIRO child/adult đã train | ✅ Done | `docs/sviro-child-adult.md`; SHA-256 checkpoint khớp bản review | — |
| BaoTam + Codex | Kiểm tra code Vision | ✅ Done | 8/8 unittest đạt; Ruff đạt cho `src/`, `tests/` và `scripts/run_vision.py` | — |
| BaoTam + Codex | Chạy YOLO + age classifier trên video có sẵn | ✅ Done | `eval/cabin-age-20260924.summary.json`: đủ 266/266 frame; 1,42 FPS CPU | — |

**Kết quả model đã có:** test crop SVIRO nhận đúng 191/209 trẻ em;
5 trẻ em bị phân loại thành người lớn, 13 trả về `unknown`. Balanced accuracy
argmax là 95,69%. Đây là dữ liệu tổng hợp, chưa xác nhận chất lượng trên video thật.

**Phạm vi tiếp theo:** tối ưu tốc độ CPU và đánh giá trên dữ liệu có nhãn; backend và thu thập video mới
vẫn đang hoãn theo ghi chú công việc trước đó.

---

## [YYYY-MM-DD]

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| [Tên] | [mô tả task] | ✅ Done | [link/kết quả] | 2h |
| [Tên] | [mô tả task] | 🔄 WIP | [mô tả tiến độ] | 1.5h |
| [Tên] | [mô tả task] | ❌ Blocked | [lý do block] | - |

**Tổng kết ngày:** [1-2 câu về tiến độ chung]

---

## [YYYY-MM-DD]

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| | | | | |

**Tổng kết ngày:**

---

<!-- Format: copy block trên cho mỗi ngày làm việc -->
