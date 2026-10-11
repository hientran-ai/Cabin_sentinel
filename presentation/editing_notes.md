# CabinSentinel — editing notes

## Deliverables

- `video_demo_120s.mp4`: bản chính, voice-over nữ tiếng Việt, nhạc nền/sound design và phụ đề burn-in.
- `video_demo_120s_no_music.mp4`: voice-over và phụ đề burn-in, không nhạc.
- `video_demo_120s_clean.mp4`: hình dựng sạch, không voice-over, nhạc hay phụ đề hội thoại; vẫn giữ title/outro graphics của sản phẩm.
- `video_demo_120s_vi.srt`: phụ đề tiếng Việt rời.
- `voiceover_120s_vi.m4a`: voice-over rời, có khoảng nghỉ theo timeline và được pad đến 120 giây.

Không file nguồn nào bị chỉnh sửa hoặc ghi đè. Không hiển thị URL vì không có URL triển khai thực tế trong yêu cầu.

## Timeline và nguồn cảnh

| Timeline | Nội dung | Nguồn và timecode nguồn |
|---|---|---|
| 00:00–00:08 | Hook: detection + CRITICAL, zoom 110%, vignette, title | Owner `21-27-52`, 00:47–00:55 |
| 00:08–00:14 | Trạng thái thiếu dữ liệu | Owner `21-31-15`, 00:17–00:23 |
| 00:14–00:22 | Tổng quan tín hiệu cabin | Owner `21-27-52`, 00:20–00:28 |
| 00:22–00:30 | Owner Web / live monitoring | Owner `21-31-15`, 00:23–00:31 |
| 00:30–00:38 | Telemetry và tiến trình | Owner `21-31-15`, 01:15–01:23 |
| 00:38–00:45 | Risk overview / trạng thái rule | Owner `21-31-15`, 03:15–03:22 |
| 00:45–00:51 | Bật camera và tạo session | Owner `21-31-15`, 00:38–00:44 |
| 00:51–00:58 | Camera lên hình, frame tới backend | Owner `21-31-15`, 00:44–00:51 |
| 00:58–01:06 | AI Vision detection và CRITICAL | Owner `21-31-15`, 00:51–00:59 |
| 01:06–01:13 | Preview riêng tư và backend verdict | Owner `21-27-52`, 01:00–01:07 |
| 01:13–01:20 | HOT_OCCUPANT / CRITICAL | Owner `21-31-15`, 01:09–01:16 |
| 01:20–01:27 | Nhiệt độ 39,2°C và cảnh báo | Owner `21-31-15`, 03:23–03:30 |
| 01:27–01:34 | Cabin summary và bằng chứng | Owner `21-31-15`, 03:30–03:37 |
| 01:34–01:41 | Event/action progress | Owner `21-31-15`, 01:24–01:31 |
| 01:41–01:48 | Operations dashboard | Operations `21-35-57`, 00:00–00:05.887, retime nhẹ đến 7 giây |
| 01:48–02:00 | Benefits, brand, CTA và technical-demo note | Nền brand nâu đậm tạo mới |

## Quyết định dựng và bảo vệ riêng tư

- Footage 1920×1020 được padding 30 px trên và dưới thành 1920×1080; không kéo méo giao diện.
- Mọi cảnh camera được áp dụng thêm blur cố định trên vùng khuôn mặt, kể cả khi preview nguồn đã blur.
- Đã loại màn hình đăng nhập, thời gian tải dài, thao tác thừa, màn hình lặp và âm thanh gốc.
- Dùng hard cut, fade ngắn, vignette và zoom tối đa 110%; không dùng glitch hay hiệu ứng gây mất tập trung.
- Phụ đề tối đa hai dòng, đặt thấp nhưng tránh vùng detection/verdict/action chính.
- Nhạc nền là bed điện tử tối giản được tổng hợp riêng cho bản dựng này; không dùng tác phẩm âm nhạc bên thứ ba.
- Voice-over được tổng hợp cục bộ bằng model tiếng Việt; nội dung kịch bản không được gửi tới dịch vụ TTS trực tuyến.

## Giới hạn kỹ thuật phải giữ nguyên

- AI Vision chỉ được mô tả là phát hiện các lớp như `person`, `dog`, `cat`; không tuyên bố nhận diện danh tính hoặc nhận diện trẻ em chính xác.
- Backend tạo verdict bằng safety rules và chỉ coi verdict là hiện tại khi dữ liệu còn hiệu lực.
- Telemetry trong demo là mô phỏng; thiếu dữ liệu không được diễn giải là trạng thái an toàn.
- Horn, SMS và notification: **SIMULATED**.
- Unlock: **PENDING HUMAN CONFIRMATION**.
- Không tuyên bố hệ thống đã thực hiện hành động vật lý, điều khiển xe thật hoặc sẵn sàng triển khai thương mại.

## Thông số xuất

- 1920×1080, 16:9, 30 fps, H.264 High Profile, pixel format yuv420p.
- Thời lượng container bản chính và no-music: 120,00 giây; hình sạch: 119,97 giây (3599 frame, sai số 0,03 giây).
- Audio AAC 48 kHz; bản chính được loudness-normalize mục tiêu -16 LUFS, true peak không vượt -1 dBTP.
