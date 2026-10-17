// Adapter between the Cabin Noir owner UI (unchanged except for the patches listed in README.md) and the CabinSentinel
// end-to-end session. Noir calls its own /v1 REST API; here those calls are answered from the committed backend state that the
// parent page already holds (window.parent.__phoneBridge). Nothing is computed here: risk, incident, revision and delivery come
// from the backend. Acknowledge and resolve are forwarded to /api/v1/e2e. Anything Noir offers that the backend does not do
// (pause, climate, photos, accounts, school) answers "not in this demo" instead of pretending.
(function () {
  "use strict";
  try { localStorage.setItem("cn.token", "e2e-session"); } catch (e) { /* storage blocked: the app shows its login */ }
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
  };

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
          : { ...base, kind: "reject", title: "Từ chối xác nhận", detail: h.reason || "" };
        if (h.action === "acknowledge") return null;
        return { ...base, title: h.action + ": " + h.result };
      }
      case "risk_change": return { ...base, title: "Mức rủi ro " + (h.previous_risk_level || "—") + " → " + h.risk_level, detail: (B() && B().ruleText(h.rule_id, "")) || h.rule_id || "" };
      case "camera_status": return { ...base, title: "Camera: " + h.camera_status, detail: h.origin === "SIMULATED_FAULT" ? "Lỗi mô phỏng" : "Bộ chuyển đổi camera" };
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
      out.alert_photos = [];
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
        { label: "Camera", value: camOk ? "Hoạt động" : state.camera_status || "Không rõ", tone: camOk ? "plain" : "orange" },
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
    if (method === "GET" && path === "/v1/me") return json(200, { id: "e2e", name: "Chủ xe (demo)", phone: "—", settings: { mute_until: 0, mute_indefinite: false } });
    if (method === "GET" && path === "/v1/vehicles") {
      const st = status(s);
      return json(200, [{ vehicle: vehicleRow(), role: "owner", level: st.verdict.level, title: st.verdict.title, incident_id: st.incident ? st.incident.id : null }]);
    }
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/status") return json(200, status(s));
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/trips") return json(200, []);
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/photos") return json(200, []);
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/camera") return json(200, { available: false, message: "Điện thoại không xem camera. Camera và suy luận chạy ở xe (ở demo này: máy chủ demo)." });
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/history") {
      const level = query.get("level");
      let incidents = incidentsFromHistory(s);
      if (level === "warning" || level === "critical") incidents = incidents.filter((i) => i.level === level);
      return json(200, { incidents, events: s.history.map(eventOf).filter((e) => e && e.at).reverse() });
    }
    if (method === "GET" && path === "/v1/vehicles/" + VEHICLE_ID + "/log") {
      if (query.get("kind") !== "left_behind") return fail(404, "not_in_demo", "Nhật ký hoạt động thiết bị không có trong bản demo.");
      const items = incidentsFromHistory(s).map((i) => {
        const note = s.notifications.filter((n) => n.incident_id === i.id).sort((a, b) => epoch(a.sent_at) - epoch(b.sent_at))[0];
        return { kind: "left_behind", incident_id: i.id, started_at: i.created_at, ended_at: i.resolved_at, ongoing: i.status === "open", basis: "simulated",
          duration_s: Math.max(0, (i.resolved_at || Date.now() / 1000) - i.created_at), notify_s: note ? Math.max(0, epoch(note.sent_at) - i.created_at) : null,
          ack_s: i.viewed_at ? i.viewed_at - i.created_at : null, outcome_label: i.status === "open" ? "Đang mở" : "Đã đóng sau kiểm tra cabin" };
      });
      return json(200, { items, stats: null, chain: { ok: true, checked: 0 } });
    }
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
      await b.refresh(); s = snap();
      const inc = currentIncident(s, decodeURIComponent(m[1]));
      return inc ? json(200, inc) : fail(404, "not_found", "Không tìm thấy sự cố này trong phiên demo.");
    }
    if ((m = path.match(/^\/v1\/incidents\/([^/]+)\/view$/)) && method === "POST") {
      const r = await b.acknowledge();
      s = snap();
      if (!r.ok) return fail(409, "ack_rejected", r.detail || "Không ghi nhận được.");
      return json(200, incidentJson(s, true));
    }
    if ((m = path.match(/^\/v1\/incidents\/([^/]+)\/confirm$/)) && method === "POST") {
      if (body && body.override) return fail(422, "override_unsupported", "Bản demo không cho đóng thủ công khi hệ thống còn thấy người hoặc thú.");
      const r = await b.resolve();
      s = snap();
      const inc = incidentJson(s, true);
      if (r.ok) return json(200, { ...inc, status: "resolved", result: "resolved" });
      const st = s.state;
      let code = "changed";
      if (/empty-cabin|Fresh, consistent/i.test(r.detail || "")) {
        code = !b.view().current || (st && st.data_quality && st.data_quality.status !== "CURRENT") ? "stale" : st && st.camera_status !== "OK" ? "camera" : st && ["PRESENT", "SUSPECTED"].includes(st.occupancy_state) ? "presence" : "stale";
      }
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
      return handle(method, url.pathname, url.searchParams, body).catch((e) => fail(500, "bridge_error", String(e && e.message || e)));
    }
    return realFetch(input, init);
  };
  // The service worker belongs to Noir's own backend; it must not take over the demo origin.
  if (navigator.serviceWorker) { try { navigator.serviceWorker.register = () => Promise.reject(new Error("disabled in the demo")); } catch (e) { /* ignore */ } }
})();
