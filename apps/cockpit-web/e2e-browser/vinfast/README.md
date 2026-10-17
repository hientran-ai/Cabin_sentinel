# VinFast HMI: kiểm tra bằng Chrome headless

Cần backend (cổng 8000) và Vite (cổng 4177) đang chạy, xem `docs/OEM_E2E_V1_RUNBOOK.md`.

| Script | Việc |
| --- | --- |
| `node smoke.mjs` | 15 kiểm tra luồng giám khảo với backend thật (kịch bản, trace, chế độ xe, camera giả) |
| `node shot.mjs <url> <out.png> 1920 1080 [js…]` | Chụp màn sau khi chạy các bước JS |
| `node audit3.mjs <url> [js…]` / `locate.mjs` | Liệt kê gap, padding, radius lệch thang 4–8 |
| `node nest.mjs <url> [js…]` | Bề mặt con tròn hơn bề mặt cha (góc đồng tâm) |
| `node squeeze.mjs <url> [js…]` | Icon bị bóp hoặc chữ tràn nút |
