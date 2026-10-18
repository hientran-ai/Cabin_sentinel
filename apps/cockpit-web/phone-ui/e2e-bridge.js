// Adapter between the Cabin Noir owner UI (unchanged except for the patches listed in README.md) and the CabinSentinel
// end-to-end session. Noir calls its own /v1 REST API; here those calls are answered from the committed backend state that the
// parent page already holds (window.parent.__phoneBridge). Nothing is computed here: risk, incident, revision and delivery come
// from the backend. Acknowledge and resolve are forwarded to /api/v1/e2e. Anything Noir offers that the backend does not do
// (pause, climate, photos, accounts, school) answers "not in this demo" instead of pretending.
(function () {
  "use strict";
  // Demo sign-in: the phone starts on the login screen. There is no SMS and no real account; the code is shown on screen (see /v1/auth/otp).
  const DEMO_CODE = "246810", USER_KEY = "cn.demo.user";
  const demoUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; } };
  const style = document.createElement("style");
  style.textContent = ".frame-toggle{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.append(style));

  const B = () => { try { return window.parent && window.parent.__phoneBridge; } catch (e) { return null; } };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fail = (status, code, message) => json(status, { detail: { code, message } });
  const epoch = (iso) => (iso ? Date.parse(iso) / 1000 : null);
  const VEHICLE_ID = "e2e-vehicle";
  const LEVEL = { critical: "critical", warning: "warning", info: "notice", ok: "safe", unknown: "unknown" };
  const REJECT = {
    changed: ["Sự cố đã thay đổi", "Có dữ liệu mới từ xe sau khi bạn mở màn này. Xem lại rồi xác nhận lần nữa."],
    stale: ["Dữ liệu đã cũ", "Xe chưa gửi dữ liệu mới. Cần quan sát mới còn hiệu lực rồi gửi lại."],
    camera: ["Camera chưa nhìn được cabin", "Camera đang lỗi hoặc bị che. Hệ thống không thể xác minh cabin."],
    presence: ["Vẫn phát hiện người hoặc thú trong xe", "Hệ thống vẫn thấy có người hoặc thú. Kiểm tra lại cabin."],
    check: ["Cần kiểm tra cabin trực tiếp", "Xác nhận bạn đã kiểm tra tất cả ghế, sàn và cốp xe rồi thử lại."],
    conflict: ["Các nguồn dữ liệu chưa thống nhất", "Cần quan sát mới và kiểm tra cabin trực tiếp trước khi đóng sự cố."],
  };
  const CAMERA = { OK: "Hoạt động", BLOCKED: "Bị che", DISCONNECTED: "Mất kết nối", NO_FEED: "Chưa có hình", ERROR: "Lỗi camera" };
  function rejection(detail, s, b) {
    if (/revision|changed|state.*new/i.test(detail || "")) return "changed";
    if (/cabin_checked|explicit.*check/i.test(detail || "")) return "check";
    if (/conflict/i.test(detail || "")) return "conflict";
    if (!b.view().current || /fresh|stale|clock/i.test(detail || "")) return "stale";
    if (s.state && s.state.camera_status !== "OK") return "camera";
    if (s.state && ["PRESENT", "SUSPECTED"].includes(s.state.occupancy_state)) return "presence";
    return "changed";
  }

  function snap() { const b = B(); return b ? b.snapshot() : null; }

  function vehicleRow() {
    return { id: VEHICLE_ID, name: "VinFast VF 8", plate: "MÔ PHỎNG", model: "VF 8 (cảm hứng, mô phỏng)", image: "vf8", color: "white", role: "owner" };
  }

  function seats(state) {
    // The detector gives no seat position, so none is invented: detections are listed against "cabin".
    const objs = (state.last_observation && state.last_observation.vision && state.last_observation.vision.detections) || [];
    const fresh = state.freshness && state.freshness.vision && state.freshness.vision.status === "FRESH";
    const rows = (fresh ? objs : []).map((d, i) => ({ key: "cabin" + i, label: "Cabin (chưa xác định ghế)", occ: true, kind: d.class === "person" ? "person" : "pet", conf: d.confidence, age: null }));
    return rows.length ? rows : [{ key: "cabin", label: "Cabin (chưa xác định ghế)", occ: false, kind: null, conf: 0, age: null }];
  }

  function eventOf(h) {
    const at = epoch(h.at);
    const base = { at, kind: "data", title: h.type, detail: "" };
    switch (h.type) {
      case "alert": return { ...base, kind: "alert", title: "Cảnh báo #" + h.sequence + " (" + h.stage + ")", detail: "Kênh thông báo mô phỏng; chưa gửi push thật" };
      case "action_result": return { ...base, kind: "action", title: h.tool + ": " + h.status, detail: h.status === "simulated" ? "Mô phỏng, không gửi thật" : h.status === "pending_human_confirmation" ? "Chờ người có quyền xác nhận" : "" };
      case "unlock_request": return { ...base, kind: "action", title: "Yêu cầu mở khoá: " + h.status, detail: "Không gửi tới xe" };
      case "acknowledgment": return { ...base, at: epoch(h.acknowledged_at) || at, kind: "ack", title: "Chủ xe đã xem", detail: "Sự cố vẫn mở cho tới khi cabin được xác minh" };
      case "incident_resolution": return { ...base, at: epoch(h.resolved_at) || at, kind: "resolved", title: "Sự cố đã đóng", detail: "Sau kiểm tra cabin và quan sát mới còn hiệu lực" };
      case "operator_action": {
        if (h.action === "resolve") return h.result === "OK" ? { ...base, kind: "resolved", title: "Xác nhận kiểm tra cabin", detail: "Từ " + (h.actor && h.actor.surface === "PHONE" ? "điện thoại" : "màn xe") }
          : { ...base, kind: "reject", title: "Từ chối xác nhận", detail: REJECT[rejection(h.reason, snap(), B())][1] };
        if (h.action === "acknowledge") return null;
        return { ...base, title: h.action + ": " + h.result };
      }
      case "risk_change": return { ...base, title: "Mức rủi ro " + (h.previous_risk_level || "—") + " → " + h.risk_level, detail: (B() && B().ruleText(h.rule_id, "")) || h.rule_id || "" };
      case "camera_status": return { ...base, title: "Camera: " + (CAMERA[h.camera_status] || "Chưa rõ"), detail: h.origin === "SIMULATED_FAULT" ? "Lỗi mô phỏng" : "Bộ chuyển đổi camera" };
      case "notification_delivery": return { ...base, title: "Điện thoại đã nhận thông báo #" + h.notification_id, detail: "" };
      default: return null;
    }
  }

  function escalation(state) {
    const a = state.alert; if (!a) return null;
    const first = epoch(a.initial_sent_at);
    const escAt = a.escalated_at ? epoch(a.escalated_at) : epoch(a.escalation_due_at);
    const steps = [
      { offset: 0, key: "push", title: "Thông báo cho chủ xe", note: "Cảnh báo ban đầu (mô phỏng, chưa gửi push thật)", state: "done", at: first, detail: "" },
      { offset: escAt && first ? Math.round(escAt - first) : 0, key: "sms", title: "Leo thang: SMS liên hệ khẩn cấp", note: "Mô phỏng, không gửi SMS thật", state: a.escalated_at ? "done" : "pending", at: escAt, detail: "" },
    ];
    const next = steps.find((s) => s.state === "pending");
    return { steps, current: steps.filter((s) => s.state === "done").length - 1, next_in: next && next.at ? Math.max(0, Math.round(next.at - Date.now() / 1000)) : null, stopped: state.incident && state.incident.status !== "OPEN" };
  }

  function incidentJson(s, withDetail) {
    const state = s.state; const inc = state && state.incident; if (!inc) return null;
    const notes = s.notifications.filter((n) => n.incident_id === inc.incident_id);
    const crit = notes.some((n) => n.risk_level === "CRITICAL") || state.risk_level === "CRITICAL";
    const view = B().view();
    const out = {
      id: inc.incident_id, vehicle_id: VEHICLE_ID, level: crit ? "critical" : "warning", status: inc.status === "OPEN" ? "open" : "resolved",
      reason: (notes.length && B().ruleText(notes[notes.length - 1].rule_id, notes[notes.length - 1].reason)) || view.reason, seat: null, seat_label: null, created_at: epoch(inc.opened_at), viewed_at: epoch(inc.acknowledged_at), viewed_by: inc.acknowledged_at ? "Chủ xe (điện thoại)" : null,
      resolved_at: epoch(inc.resolved_at), resolved_by: inc.resolved_at ? "Chủ xe (điện thoại)" : null, revision: state.revision,
      cabin_temp: state.sensor_snapshot ? state.sensor_snapshot.temperature : null, elapsed: Math.round(Date.now() / 1000 - epoch(inc.opened_at)),
    };
    if (withDetail) {
      out.escalation = escalation(state);
      out.events = s.history.map(eventOf).filter((e) => e && e.at).filter((e) => e.at >= (out.created_at || 0) - 1);
      const lf = B().latestFrame && B().latestFrame();
      out.alert_photos = lf ? ["e2e-" + lf.frameId] : [];
    }
    return out;
  }

  function status(s) {
    const state = s.state; const view = B().view();
    const base = { vehicle: vehicleRow(), role: "owner", scenario: "e2e", no_real_data: false, restricted: false };
    if (!state) {
      return { ...base, verdict: { level: "unknown", title: view.headline, sub: view.reason, current: false }, tiles: [], seats: [{ key: "cabin", label: "Cabin (chưa xác định ghế)", occ: false, kind: null, conf: 0 }], items: [],
        cabin_temp: null, outside_temp: null, doors_locked: false, lock_known: false, engine_on: false, camera: "ok", connection: s.connection === "ok" ? "online" : "offline", last_seen: null,
        source: "sim", detector: null, device: null, paused_until: null, paused_indefinite: false, coords: null, geofence: null, in_geofence: false, route: null, incident: null,
        climate: { status: "off", seconds_left: 0 }, protection: { rows: [] }, exit_check: { pending: false, location: "", seats: [], items: [], confirmed_at: null } };
    }
    const snapT = state.sensor_snapshot || {};
    const camOk = state.camera_status === "OK";
    const offline = s.connection !== "ok";
    const incident = incidentJson(s, true);
    return {
      ...base,
      verdict: { level: LEVEL[view.tone] || "unknown", title: view.headline, sub: [view.reason, view.caution].filter(Boolean).join(" "), current: view.current },
      tiles: [
        { label: "Cửa", value: snapT.doors_locked ? "Đã khoá" : "Chưa khoá", tone: "plain" },
        { label: "Nhiệt độ cabin (mô phỏng)", value: snapT.temperature != null ? snapT.temperature + "°C" : "—", tone: snapT.temperature >= 35 ? "orange" : "plain" },
        { label: "Camera", value: CAMERA[state.camera_status] || "Chưa rõ", tone: camOk ? "plain" : "orange" },
      ],
      seats: seats(state), items: [], cabin_temp: snapT.temperature != null ? snapT.temperature : null, outside_temp: null,
      doors_locked: !!snapT.doors_locked, lock_known: true, engine_on: snapT.engine_status === "ON", camera: camOk ? "ok" : "blocked",
      connection: offline ? "offline" : "online", last_seen: epoch(state.evaluated_at), source: "sim", detector: "yolov8n (máy chủ demo)", device: null,
      paused_until: null, paused_indefinite: false, coords: null, geofence: null, in_geofence: false, route: null, incident,
      climate: { status: "off", seconds_left: 0 }, protection: { rows: [] }, exit_check: { pending: false, location: "", seats: [], items: [], confirmed_at: null },
    };
  }

  function incidentsFromHistory(s) {
    const map = new Map();
    const touch = (id, patch) => { if (!id) return; map.set(id, { ...(map.get(id) || { id, vehicle_id: VEHICLE_ID, level: "warning", status: "open", reason: "", seat: null, seat_label: null, created_at: null, viewed_at: null, viewed_by: null, resolved_at: null, resolved_by: null, revision: 1, cabin_temp: null }), ...patch }); };
    for (const h of s.history) {
      if (h.type === "alert") touch(h.incident_id, { created_at: map.get(h.incident_id)?.created_at ?? epoch(h.at) });
      if (h.type === "acknowledgment") touch(h.incident_id, { created_at: epoch(h.opened_at), viewed_at: epoch(h.acknowledged_at), viewed_by: "Chủ xe (điện thoại)" });
      if (h.type === "incident_resolution") touch(h.incident_id, { created_at: epoch(h.opened_at), status: "resolved", resolved_at: epoch(h.resolved_at), resolved_by: "Chủ xe (điện thoại)" });
    }
    for (const n of s.notifications) if (map.has(n.incident_id)) { const cur = map.get(n.incident_id); touch(n.incident_id, { level: n.risk_level === "CRITICAL" || cur.level === "critical" ? "critical" : "warning", reason: (B().ruleText(n.rule_id, n.reason) || cur.reason) }); }
    const live = s.state && s.state.incident && incidentJson(s, false);
    if (live) map.set(live.id, live);
    return [...map.values()].filter((i) => i.created_at).sort((a, b) => b.created_at - a.created_at);
  }

  function currentIncident(s, id) {
    const live = s.state && s.state.incident && s.state.incident.incident_id === id ? incidentJson(s, true) : null;
    return live;
  }

  async function handle(method, path, query, body) {
    const b = B();
    if (!b) return fail(503, "no_bridge", "Màn điện thoại chỉ chạy bên trong trang demo.");
    let s = snap();
    let m;
    if (method === "GET" && path === "/v1/config") return json(200, { simulation: false });
    if (method === "POST" && path === "/v1/auth/otp") {
      const phone = String((body && body.phone) || "").replace(/\s/g, "");
      if (!/^0\d{9}$/.test(phone)) return fail(422, "bad_phone", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
      return json(200, { sent: false, demo: true, dev_code: DEMO_CODE, telegram: null });
    }
    if (method === "POST" && path === "/v1/auth/verify") {
      const phone = String((body && body.phone) || "").replace(/\s/g, "");
      if (!/^0\d{9}$/.test(phone)) return fail(422, "bad_phone", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
      if (String((body && body.code) || "") !== DEMO_CODE) return fail(401, "bad_code", "Mã không đúng. Mã demo được hiện sẵn trên màn hình.");
      try { localStorage.setItem(USER_KEY, JSON.stringify({ phone, name: String((body && body.name) || "").slice(0, 40) || "Chủ xe (demo)" })); } catch (e) { /* ignore */ }
      return json(200, { token: "e2e-session" });
    }
    if (method === "GET" && path === "/v1/me") { const u = demoUser(); return json(200, { id: "e2e", name: (u && u.name) || "Chủ xe (demo)", phone: (u && u.phone) || "—", settings: { mute_until: 0, mute_indefinite: false } }); }
    if (method === "GET" && path === "/v1/vehicles") {
      const st = status(s);
      return json(200, [{ vehicle: vehicleRow(), role: "owner", level: st.verdict.level, title: st.verdict.title, incident_id: st.incident ? st.incident.id : null }]);
    }
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/status") return json(200, status(s));
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/trips") return json(200, []);
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/photos") return json(200, []);
    if (method === "GET" && path.indexOf("/v1/vehicles/" + VEHICLE_ID + "/photos/") === 0) {
      const lf = B().latestFrame && B().latestFrame();
      if (!lf) return fail(404, "no_photo", "Chưa có khung hình đã che.");
      try { const r = await fetch(lf.url); return new Response(await r.blob(), { status: 200, headers: { "Content-Type": "image/jpeg" } }); } catch (e) { return fail(404, "no_photo", "Không đọc được khung hình."); }
    }
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/camera") return json(200, { available: false, message: "Điện thoại không xem camera. Camera và suy luận chạy ở xe (ở demo này: máy chủ demo)." });
    const DH = window.__demoHistory, V = "/v1/vehicles/" + VEHICLE_ID;
    const nowS = () => Date.now() / 1000;
    const days = () => Math.max(1, Math.min(+query.get("days") || 30, 365));
    // Real incidents of this session first, then the simulated sample history (basis "simulated") so the page is never empty for a tester.
    const liveRows = (s) => incidentsFromHistory(s).map((i) => {
      const note = s.notifications.filter((n) => n.incident_id === i.id).sort((a, b) => epoch(a.sent_at) - epoch(b.sent_at))[0];
      return { id: "live-" + i.id, kind: "left_behind", label: "Bỏ quên người/vật trong xe", started_at: i.created_at, ended_at: i.resolved_at, duration_s: Math.round(Math.max(0, (i.resolved_at || nowS()) - i.created_at)),
        ongoing: i.status === "open", seat: null, seat_label: null, level: i.level, incident_id: i.id, outcome: i.status === "open" ? null : "confirmed", outcome_label: i.status === "open" ? "Đang mở" : "Đã kiểm tra xe",
        basis: "simulated", ack_s: i.viewed_at ? Math.round(i.viewed_at - i.created_at) : null, notify_s: note ? Math.round(Math.max(0, epoch(note.sent_at) - i.created_at)) : null, sealed: false, clip: null, conf_max: null, note: null };
    });
    const allRows = (s, d) => liveRows(s).concat(DH ? DH.build(nowS(), d) : []).sort((a, b) => b.started_at - a.started_at);
    if (method === "GET" && path === V + "/history") {
      const level = query.get("level"), d = days();
      let incidents = incidentsFromHistory(s).concat(DH ? DH.incidents(nowS()).filter((i) => i.created_at >= nowS() - d * 86400) : []).sort((a, b) => b.created_at - a.created_at);
      if (level === "warning" || level === "critical") incidents = incidents.filter((i) => i.level === level);
      const events = s.history.map(eventOf).filter((e) => e && e.at).reverse().concat(DH ? DH.events(nowS()) : []).sort((a, b) => b.at - a.at);
      return json(200, { incidents, events });
    }
    if (method === "GET" && path === V + "/log") {
      const kind = query.get("kind"), rows = allRows(s, days());
      const items = rows.filter((r) => kind === "activity" ? r.kind !== "left_behind" : kind && kind !== "all" ? r.kind === kind : true);
      return json(200, { items, stats: DH ? DH.stats(rows) : null, chain: { ok: true, checked: 0 } });
    }
    if (method === "GET" && path === V + "/log/summary") {
      return json(200, DH ? DH.summary(nowS(), days(), +query.get("tz") || 0, allRows(s, 90), incidentsFromHistory(s)) : { days: [], coverage: null, tz_min: 0 });
    }
    if (method === "GET" && path === V + "/log.csv") return new Response(DH ? DH.csv(allRows(s, days())) : "", { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8" } });
    if (method === "GET" && path === V + "/observations") return json(200, DH ? DH.observations(nowS(), +query.get("hours") || 24) : { retention_hours: 24, items: [] });
    if (method === "GET" && path === V + "/audit") return json(200, DH ? DH.audit(nowS()) : { retention_days: 365, items: [] });
    if (method === "GET" && path === "/v1/me/notifications") {
      const items = s.notifications.map((n) => {
        const push = n.channels.push.state;
        return { kind: "alert", level: n.risk_level === "CRITICAL" ? "critical" : n.risk_level === "WARNING" ? "warning" : "info", at: epoch(n.sent_at), vehicle_name: "Xe demo",
          title: b.ruleText(n.rule_id, n.reason) || "Cảnh báo cabin", detail: "#" + n.sequence + " " + n.stage + " · push " + (push === "FAILED" ? "thất bại" : push === "SIMULATED" ? "mô phỏng" : push === "NOT_PLANNED" ? "không có lệnh gửi" : push.toLowerCase()) + " · push OS chưa kiểm chứng" };
      });
      // The phone fetching the list is what "delivered to the app" means for the in-app channel.
      s.notifications.forEach((n) => b.delivered(n.notification_id));
      return json(200, { items, server_build: "e2e" });
    }
    if ((m = path.match(/^\/v1\/incidents\/([^/]+)$/)) && method === "GET") {
      if (window.__demoHistory && /^demo-inc-\d+$/.test(decodeURIComponent(m[1]))) { const d = window.__demoHistory.incidents(Date.now() / 1000).find((i) => i.id === decodeURIComponent(m[1])); if (d) return json(200, { ...d, escalation: null, events: [], alert_photos: [] }); }
      await b.refresh(); s = snap();
      const inc = currentIncident(s, decodeURIComponent(m[1]));
      return inc ? json(200, inc) : fail(404, "not_found", "Không tìm thấy sự cố này trong phiên demo.");
    }
    if ((m = path.match(/^\/v1\/incidents\/([^/]+)\/view$/)) && method === "POST") {
      if (!currentIncident(s, decodeURIComponent(m[1]))) return fail(409, "changed", REJECT.changed[1]);
      const r = await b.acknowledge();
      s = snap();
      if (!r.ok) return fail(409, "ack_rejected", r.detail || "Không ghi nhận được.");
      return json(200, incidentJson(s, true));
    }
    if ((m = path.match(/^\/v1\/incidents\/([^/]+)\/confirm$/)) && method === "POST") {
      if (!currentIncident(s, decodeURIComponent(m[1]))) return fail(409, "changed", REJECT.changed[1]);
      if (body && body.override) return fail(422, "override_unsupported", "Bản demo không cho đóng thủ công khi hệ thống còn thấy người hoặc thú.");
      // the confirmation names the revision the person was looking at and needs all three physical checks; neither is filled in for them
      if (!body || !Array.isArray(body.checks) || body.checks.length < 3) return json(200, { ...incidentJson(s, true), result: "rejected", reject: { code: "check", title: REJECT.check[0], message: REJECT.check[1] } });
      const r = await b.resolve(body.revision);
      s = snap();
      const inc = incidentJson(s, true);
      if (r.ok) return json(200, { ...inc, status: "resolved", result: "resolved" });
      const code = rejection(r.detail, s, b);
      return json(200, { ...inc, result: "rejected", reject: { code, title: REJECT[code][0], message: REJECT[code][1] } });
    }
    if (method === "POST" && /\/refresh$/.test(path)) { await b.refresh(); return json(200, status(snap())); }
    return fail(404, "not_in_demo", "Chức năng này không có trong bản demo.");
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith("/v1/")) {
      const method = ((init && init.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
      let body = null;
      try { body = init && typeof init.body === "string" ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      return handle(method, url.pathname, url.searchParams, body).catch(() => fail(500, "bridge_error", "Chưa đọc được dữ liệu demo. Thử cập nhật trạng thái."));
    }
    return realFetch(input, init);
  };
  // The service worker belongs to Noir's own backend; it must not take over the demo origin.
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error("disabled in the demo")); } catch (e) { /* ignore */ } }
})();
