# Owner phone UI (Cabin Noir)

`public/phone/` is the Cabin Noir owner web app (from the Cabin repository, `cabin-noir/backend/web`) with a small, listed set of patches
and `e2e-bridge.js`, which answers Noir's `/v1` calls from the committed CabinSentinel end-to-end session. Regenerate with:

```bash
python3 apps/cockpit-web/phone-ui/sync.py /path/to/Cabin/cabin-noir/backend/web
```

Removed on purpose (backend has no such feature, or it would contradict the approved rules): school trips, accounts, on-phone camera
and AI check (the phone is not a camera), live camera view, map, photo upload, pause monitoring, manual close while the system still
sees someone. The sentence "Đã xem chỉ dừng nhắc lặp lại" is corrected, because in this backend an acknowledgement does not stop repeats.
Seats are not drawn per position: the detector gives none, so detections are listed under "Cabin (chưa xác định ghế)".
