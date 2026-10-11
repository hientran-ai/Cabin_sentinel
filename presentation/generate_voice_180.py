import asyncio
from pathlib import Path

import edge_tts
from edge_tts.exceptions import NoAudioReceived

CUES = [
    "CabinSentinel phát hiện dấu hiệu sự sống trong cabin, kết hợp nhiệt độ và trạng thái kết nối để cảnh báo sớm.",
    "Một cabin đóng kín có thể nóng lên rất nhanh. Những phút đầu tiên quyết định khả năng phản ứng kịp thời.",
    "CabinSentinel không xem thiếu dữ liệu là an toàn. Mọi khoảng trống tín hiệu đều được hiển thị rõ để người dùng kiểm tra.",
    "Owner Web tập trung nhiệt độ, occupancy, camera, kết nối Edge và Cloud trong một màn hình dễ theo dõi.",
    "Verdict được backend tạo bằng safety rules, và chỉ được xem là hiện tại khi dữ liệu vẫn còn hiệu lực.",
    "Telemetry cho biết bối cảnh cabin. Camera cung cấp thêm bằng chứng hiện diện để quyết định có cơ sở hơn.",
    "Các kịch bản mô phỏng giúp kiểm tra trạng thái an toàn, cảnh báo và khả năng chuyển cấp rủi ro.",
    "Khi Cloud gián đoạn, giao diện nêu rõ giới hạn kết nối thay vì tiếp tục hiển thị một trạng thái an toàn giả định.",
    "Tương tự, mất kết nối Edge hoặc camera không khả dụng đều trở thành thông tin cần được xử lý.",
    "Camera chỉ được bật sau khi người dùng đồng ý. Frontend tạo một camera session riêng cho lần theo dõi.",
    "Các frame cần thiết được gửi tới backend. Thời gian mở trang và chờ tải đã được rút gọn trong video này.",
    "AI Vision phát hiện các lớp tổng quát như person, dog hoặc cat, không nhận diện danh tính cá nhân.",
    "Preview ưu tiên bảo vệ riêng tư bằng cách che mặt. Video demo cũng áp dụng thêm một lớp làm mờ.",
    "Backend kết hợp detection với telemetry mô phỏng, sau đó đánh giá theo bộ safety rules xác định.",
    "Mỗi verdict đi kèm rule, revision và thời điểm cập nhật, giúp người xem biết kết quả còn hiệu lực hay không.",
    "Trong kịch bản cabin nóng, nhiệt độ đạt ba mươi chín phẩy hai độ C cùng bằng chứng hiện diện.",
    "Safety rule trả về HOT OCCUPANT và mức rủi ro chuyển sang CRITICAL để ưu tiên phản ứng.",
    "Từ detection đến quyết định, event, cabin map và tiến trình xử lý đều có thể được truy vết.",
    "Horn, tin nhắn và notification trong demo là mô phỏng. Unlock luôn chờ con người xác nhận.",
    "Biểu đồ và lịch sử giúp theo dõi diễn biến thay vì chỉ nhìn một trạng thái tại một thời điểm.",
    "Operations dashboard bổ sung góc nhìn hệ thống cho đội vận hành, nhưng không tuyên bố điều khiển xe thật.",
    "CabinSentinel. Phát hiện sớm, xác minh rõ ràng và phản ứng có trách nhiệm. Khám phá CabinSentinel.",
]


async def main() -> None:
    root = Path(__file__).resolve().parent
    out = root / "voice_cues_180"
    out.mkdir(exist_ok=True)
    for index, text in enumerate(CUES, start=1):
        target = out / f"cue_{index:02d}.mp3"
        if target.exists() and target.stat().st_size > 1000:
            print(target.name, "cached")
            continue
        for attempt in range(1, 9):
            try:
                speech = edge_tts.Communicate(
                    text,
                    voice="vi-VN-HoaiMyNeural",
                    rate="-2%",
                    volume="+0%",
                    pitch="-1Hz",
                )
                await speech.save(str(target))
                print(target.name, "ok")
                break
            except NoAudioReceived:
                if target.exists():
                    target.unlink()
                if attempt == 8:
                    raise
                print(target.name, f"retry {attempt}")
                await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())
