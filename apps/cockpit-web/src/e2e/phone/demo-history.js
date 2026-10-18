// Sample history for judges (BGK) to test the History page without waiting days for real alerts.
// EVERY number here is SIMULATED (basis "simulated"): fixed episodes placed relative to "now", no images, no personal data, no detector output.
// Real incidents from the live session are merged in by e2e-bridge.js and always listed first. Shapes follow Cabin Noir's /v1 history API.
(function (root) {
  "use strict";
  const DAY = 86400, MIN = 60;
  const LABEL = { left_behind: "Bỏ quên người/vật trong xe", camera_blocked: "Camera bị che", device_offline: "Thiết bị mất kết nối", replay: "Video thử nghiệm" };
  const OUTCOME = { confirmed: "Đã kiểm tra xe", cleared: "Tự hết", manual_close: "Đóng thủ công" };
  // [days ago, minutes long, level, outcome, ack seconds, notify seconds, cabin °C, reason]
  const ALERTS = [
    [1.2, 6, "critical", "confirmed", 40, 9, 38, "Camera thấy chuyển động trong xe đã khoá, cabin 38 °C (dữ liệu mẫu)."],
    [2.6, 3, "warning", "confirmed", 55, 11, 31, "Có vật thể giống thú cưng ở cabin, xe khoá (dữ liệu mẫu)."],
    [4.1, 2, "warning", "cleared", null, 10, 28, "Cảnh báo ngắn, camera không còn thấy gì sau khi mở cửa (dữ liệu mẫu)."],
    [6.3, 11, "critical", "confirmed", 95, 8, 41, "Camera thấy người trong xe đỗ nắng, cabin 41 °C (dữ liệu mẫu)."],
    [11.8, 4, "warning", "confirmed", 62, 12, 30, "Có thể có người trong cabin, xe khoá (dữ liệu mẫu)."],
    [15.2, 8, "critical", "confirmed", 48, 9, 37, "Camera thấy chuyển động ghế sau, cabin 37 °C (dữ liệu mẫu)."],
    [21, 2, "warning", "cleared", null, 14, 27, "Cảnh báo ngắn, tự hết khi chủ xe quay lại (dữ liệu mẫu)."],
    [27.5, 5, "warning", "confirmed", 70, 10, 29, "Có vật thể giống thú cưng ở cabin (dữ liệu mẫu)."],
  ];
  const CAMERA = [[0.4, 4], [5.5, 2], [18, 7]];                     // camera blocked: days ago, minutes
  const OFFLINE = [[3.3, 9], [13, 25]];                              // device offline
  const REPLAY = [[0.9, "ai-child.webm", 0.82, "Video thử: trẻ trong ghế an toàn (mẫu)"], [8, "empty-cabin.webm", 0.0, "Video thử: cabin trống, không phát hiện gì (mẫu)"]];

  const iso = (t) => (t == null ? "" : new Date(t * 1000).toISOString().slice(0, 19));

  function build(now, days) {
    const since = now - Math.max(1, Math.min(days || 30, 365)) * DAY;
    const row = (id, kind, start, mins, extra) => ({ id, kind, label: LABEL[kind], started_at: Math.round(start), ended_at: Math.round(start + mins * MIN), duration_s: Math.round(mins * MIN),
      ongoing: false, seat: null, seat_label: null, level: null, incident_id: null, outcome: null, outcome_label: "", basis: "simulated", ack_s: null, notify_s: null,
      sealed: false, clip: null, conf_max: null, note: null, ...extra });
    const rows = [];
    ALERTS.forEach((a, i) => { const start = now - a[0] * DAY; rows.push(row("demo-log-" + i, "left_behind", start, a[1], { level: a[2], incident_id: "demo-inc-" + i, outcome: a[3], outcome_label: OUTCOME[a[3]], ack_s: a[4], notify_s: a[5] })); });
    CAMERA.forEach((c, i) => rows.push(row("demo-cam-" + i, "camera_blocked", now - c[0] * DAY, c[1])));
    OFFLINE.forEach((c, i) => rows.push(row("demo-off-" + i, "device_offline", now - c[0] * DAY, c[1])));
    REPLAY.forEach((c, i) => rows.push(row("demo-rep-" + i, "replay", now - c[0] * DAY, 1, { clip: c[1], conf_max: c[2], note: c[3] })));
    return rows.filter((r) => r.started_at >= since).sort((a, b) => b.started_at - a.started_at);
  }

  function incidents(now) {
    return ALERTS.map((a, i) => {
      const start = Math.round(now - a[0] * DAY);
      return { id: "demo-inc-" + i, vehicle_id: "e2e-vehicle", level: a[2], status: "resolved", reason: a[7], seat: null, seat_label: null, created_at: start,
        viewed_at: a[4] == null ? null : start + a[4], viewed_by: a[4] == null ? null : "Chủ xe (demo)", resolved_at: start + a[1] * MIN,
        resolved_by: a[3] === "confirmed" ? "Chủ xe (demo)" : null, revision: 1, cabin_temp: a[6], elapsed: a[1] * MIN, basis: "simulated" };
    });
  }

  function events(now) {
    const out = [];
    ALERTS.forEach((a, i) => {
      const start = now - a[0] * DAY;
      out.push({ at: start, kind: "alert", title: "Cảnh báo (mẫu) #" + (i + 1), detail: "Dữ liệu mô phỏng, không gửi thông báo thật" });
      if (a[4] != null) out.push({ at: start + a[4], kind: "ack", title: "Chủ xe đã xem (mẫu)", detail: "Sự cố vẫn mở cho tới khi cabin được xác minh" });
      out.push({ at: start + a[1] * MIN, kind: a[3] === "confirmed" ? "resolved" : "data", title: a[3] === "confirmed" ? "Sự cố đã đóng (mẫu)" : "Tự hết (mẫu)", detail: "" });
    });
    return out.sort((x, y) => y.at - x.at);
  }

  function stats(rows) {
    const lb = rows.filter((r) => r.kind === "left_behind"), cam = rows.filter((r) => r.kind === "camera_blocked"), off = rows.filter((r) => r.kind === "device_offline");
    const closed = lb.filter((r) => !r.ongoing);
    const med = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10; };
    return { left_behind: lb.length, critical: lb.filter((r) => r.level === "critical").length, open: lb.filter((r) => r.ongoing).length,
      confirmed: closed.filter((r) => r.outcome === "confirmed").length, manual_close: closed.filter((r) => r.outcome === "manual_close").length,
      median_ack_s: med(lb.filter((r) => r.ack_s != null).map((r) => r.ack_s)), median_resolve_s: med(closed.map((r) => r.duration_s)), median_notify_s: med(lb.filter((r) => r.notify_s != null).map((r) => r.notify_s)),
      camera_blocked: cam.length, camera_blocked_min: Math.round(cam.reduce((n, r) => n + r.duration_s, 0) / 6) / 10,
      offline: off.length, offline_min: Math.round(off.reduce((n, r) => n + r.duration_s, 0) / 6) / 10, basis: ["simulated"] };
  }

  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  // Same shape as cabinlog.summary(): one bar per day (or per week for 90 days) and the share of time the vehicle was watched.
  function summary(now, days, tzMin, allRows, liveIncidents) {
    days = Math.max(1, Math.min(days || 7, 90)); tzMin = Math.max(-720, Math.min(tzMin == null ? 420 : tzMin, 840));
    const midnight = Math.floor((now + tzMin * 60) / DAY) * DAY - tzMin * 60;
    const span = days > 30 ? 7 : 1, n = span > 1 ? Math.ceil(days / span) : days <= 7 ? 7 : 30;
    const first = midnight - (n * span - 1) * DAY;
    const incs = incidents(now).concat(liveIncidents || []).filter((i) => i.created_at >= first);
    const gaps = allRows.filter((r) => r.kind === "camera_blocked" || r.kind === "device_offline");
    const rank = { none: 0, notice: 1, warning: 2, critical: 3 };
    const out = [];
    for (let i = 0; i < n; i++) {
      const d0 = first + i * span * DAY, d1 = d0 + span * DAY;
      const day = incs.filter((x) => x.created_at >= d0 && x.created_at < d1);
      let cam = 0, off = 0;
      gaps.forEach((r) => { const o = overlap(r.started_at, r.ended_at || now, d0, d1); if (r.kind === "camera_blocked") cam += o; else off += o; });
      let worst = "none";
      day.forEach((x) => { const l = x.level === "critical" ? "critical" : "warning"; if (rank[l] > rank[worst]) worst = l; });
      if (worst === "none" && cam + off >= 15) worst = "notice";
      const ld = new Date((d0 + tzMin * 60) * 1000);
      const wd = (ld.getUTCDay() + 6) % 7;
      out.push({ start: d0, span, label: n <= 7 ? WEEKDAY[wd] : span === 1 ? String(ld.getUTCDate()) : ld.getUTCDate() + "/" + (ld.getUTCMonth() + 1), today: i === n - 1, worst,
        incidents: day.length, open: day.filter((x) => x.status === "open").length, camera_s: Math.round(cam), offline_s: Math.round(off) });
    }
    const w0 = now - Math.min(days, 30) * DAY, w = now - w0;                  // pretend the sample device was paired 30 days ago
    const segs = gaps.map((r) => [Math.max(r.started_at, w0), Math.min(r.ended_at || now, now), r.kind]).filter((s) => s[1] > s[0]).sort((a, b) => a[0] - b[0]);
    let lost = 0, edge = w0;
    const segments = segs.map(([a, b, kind]) => { lost += Math.max(0, b - Math.max(a, edge)); edge = Math.max(edge, b); return { kind, from: Math.round((a - w0) / w * 1e4) / 1e4, to: Math.round((b - w0) / w * 1e4) / 1e4 }; });
    return { days: out, tz_min: tzMin, coverage: { pct: Math.round(1000 * (1 - lost / w)) / 10, window_s: Math.round(w), lost_s: Math.round(lost), segments, basis: "simulated",
      note: "Dữ liệu mẫu: thiết bị giả định được ghép 30 ngày trước, trừ thời gian camera bị che và mất kết nối." } };
  }

  // Counts only (people / pets / items), every 15 minutes, never images. Gaps mean "no data", not "empty".
  function observations(now, hours) {
    const items = [];
    for (let k = 0; k < Math.min(hours || 24, 168) * 4; k++) {
      const ts = Math.round(now - k * 15 * MIN);
      const h = new Date(ts * 1000).getHours() + new Date(ts * 1000).getMinutes() / 60;
      if (k % 11 === 7) continue;                                         // a few holes
      const commute = (h >= 7 && h < 7.75) || (h >= 17 && h < 17.75);
      const pet = h >= 12 && h < 13;
      items.push({ ts, source: "simulated", detector: "yolov8n (mẫu)", camera_ok: 1, people: commute ? 1 : 0, children_hint: h >= 7 && h < 7.5 ? 1 : 0, pets: pet ? 1 : 0, items: commute ? 2 : pet ? 1 : 0,
        cabin_temp: Math.round((24 + 12 * Math.max(0, Math.sin((h - 8) / 24 * 2 * Math.PI))) * 10) / 10, outside_temp: Math.round((26 + 8 * Math.max(0, Math.sin((h - 8) / 24 * 2 * Math.PI))) * 10) / 10,
        engine_on: commute ? 1 : 0, seats: [] });
    }
    return { retention_hours: 24, items };
  }

  function audit(now) {
    const A = [[0.05, "Chủ xe (demo)", "Xem trạng thái xe"], [0.3, "Chủ xe (demo)", "Xem nhật ký hoạt động"], [1.2, "Chủ xe (demo)", "Xác nhận đã kiểm tra cabin"], [1.2, "Thiết bị trong xe", "Gửi quan sát cabin"],
      [2.6, "Chủ xe (demo)", "Xem sự cố"], [3, "Chủ xe (demo)", "Bật Cabin Care"], [5, "Chủ xe (demo)", "Tải nhật ký CSV"], [6.3, "Chủ xe (demo)", "Xác nhận đã kiểm tra cabin"]];
    return { retention_days: 365, items: A.map((a) => ({ ts: Math.round(now - a[0] * DAY), actor_name: a[1], action: a[2], target: "", outcome: "ok" })) };
  }

  function csv(rows) {
    const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    const head = ["loai", "bat_dau", "ket_thuc", "thoi_luong_giay", "ghe", "muc_do", "ket_qua", "nguon_so_lieu", "giay_den_khi_xem", "giay_den_khi_gui_tin", "ma_su_co", "da_niem_phong"];
    const body = rows.slice().reverse().map((r) => [r.kind, iso(r.started_at), iso(r.ended_at), r.duration_s, r.seat || "", r.level || "", r.outcome || (r.ongoing ? "dang_mo" : ""), r.basis,
      r.ack_s == null ? "" : r.ack_s, r.notify_s == null ? "" : r.notify_s, r.incident_id || "", r.sealed ? "co" : "chua"].map(q).join(","));
    return [head.join(",")].concat(body).join("\n") + "\n";
  }

  root.__demoHistory = { build, incidents, events, stats, summary, observations, audit, csv, ALERT_COUNT: ALERTS.length };
})(globalThis);
