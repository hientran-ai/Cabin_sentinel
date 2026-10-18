// "Cá nhân hoá" tab: profiles (child, pet), named modes and a weekly schedule. Stored in this phone only.
// Profile photo: chosen by the owner, shrunk on the phone, never uploaded, deleted with one tap. Nothing here identifies or matches a face.
import { h, icon, toast, sheet, confirmDialog, field, busy } from "../ui.js";
import { CHILD_MUSIC, ADULT_MUSIC, SCREENS, FANS, PROFILE_KINDS, TEMP_MIN, TEMP_MAX, KEY_DISMISSED, DEFAULT_MODES, presetFor, sanitizeProfile, sanitizeMode, startArgs,
  dueModes, dayKeyOf, loadModes, loadProfiles, saveModes, saveProfiles, profileLine } from "./modesLogic.js";

const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const bridge = () => { try { return window.parent && window.parent.__phoneBridge; } catch (e) { return null; } };
const canStart = () => { const b = bridge(); return !!(b && b.petCareAvailable && b.petCareAvailable() && b.startCareProfile); };
const DAYS = [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"], [0, "CN"]];
const musicFor = (profile) => (profile === "CHILD" ? CHILD_MUSIC : profile === "ADULT" ? ADULT_MUSIC : [["off", "Không bật âm thanh"]]);

function savedOk(ok) { if (!ok) toast("Không lưu được trên điện thoại này (bộ nhớ bị chặn).", "err"); return ok; }

// Square, 192 px JPEG made on the phone; the original file is never kept.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), c = document.createElement("canvas");
  c.width = c.height = 192;
  c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
  return c.toDataURL("image/jpeg", 0.8);
}

const avatar = (p) => (p.photo ? h("img", { class: "avatar", src: p.photo, alt: `Ảnh ${p.name}`, style: "width:44px;height:44px;border-radius:50%;object-fit:cover" })
  : h("div", { class: "avatar", "aria-hidden": "true", style: "width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--card2);font-size:22px" }, p.kind === "PET" ? "🐾" : "🧒"));

function editProfile(profile, onSave, onDelete) {
  const p = { ...profile };
  return sheet((close) => {
    const name = h("input", { type: "text", value: p.name, maxlength: 24, placeholder: p.kind === "PET" ? "Ví dụ: Mực" : "Ví dụ: Bé Na" });
    const age = h("input", { type: "number", min: 0, max: p.kind === "PET" ? 30 : 17, value: p.age ?? "", inputmode: "numeric" });
    const breed = h("input", { type: "text", value: p.breed, maxlength: 24, placeholder: "Ví dụ: Corgi" });
    const tempOut = h("span", { class: "small muted" }, `${p.temp} °C`);
    const temp = h("input", { type: "range", min: TEMP_MIN, max: TEMP_MAX, step: 0.5, value: p.temp, "aria-label": "Nhiệt độ ưu tiên", on: { input: () => { tempOut.textContent = `${temp.value} °C`; } } });
    const volOut = h("span", { class: "small muted" }, `${p.volume}%`);
    const vol = h("input", { type: "range", min: 0, max: 100, step: 5, value: p.volume, "aria-label": "Âm lượng", on: { input: () => { volOut.textContent = `${vol.value}%`; } } });
    const music = h("select", {}, CHILD_MUSIC.map(([id, t]) => h("option", { value: id, selected: p.music === id }, t)));
    const consent = h("input", { type: "checkbox", checked: p.photo_consent });
    const pic = h("div", {}); const drawPic = () => pic.replaceChildren(avatar(p));
    const file = h("input", { type: "file", accept: "image/jpeg,image/png", hidden: true, on: { change: async () => {
      const f = file.files[0]; file.value = ""; if (!f) return;
      if (f.size > 6 * 1024 * 1024) { toast("Ảnh lớn hơn 6 MB.", "err"); return; }
      try { p.photo = await shrink(f); drawPic(); } catch (e) { toast("Không đọc được ảnh này.", "err"); }
    } } });
    drawPic();
    return h("div", { class: "gap" },
      h("div", { class: "row" }, pic, h("div", { class: "grow" }, h("button", { class: "btn small", on: { click: () => file.click() } }, icon("image"), p.photo ? "Đổi ảnh" : "Thêm ảnh"),
        p.photo && h("button", { class: "btn ghost small", on: { click: () => { p.photo = null; p.photo_consent = false; consent.checked = false; drawPic(); } } }, icon("trash"), "Xoá ảnh")), file),
      h("label", { class: "row small muted", style: "gap:8px;align-items:flex-start" }, consent,
        h("span", {}, p.kind === "CHILD" ? "Tôi là người đại diện hợp pháp của bé và đồng ý lưu ảnh này. Ảnh chỉ nằm trên điện thoại này, không gửi đi đâu, xoá được bất cứ lúc nào."
          : "Ảnh chỉ nằm trên điện thoại này, không gửi đi đâu, xoá được bất cứ lúc nào.")),
      field(p.kind === "PET" ? "Tên thú cưng" : "Tên bé", name),
      field(p.kind === "PET" ? "Tuổi (năm)" : "Tuổi (năm)", age),
      p.kind === "PET" && field("Giống", breed),
      field("Nhiệt độ ưu tiên", h("div", { class: "row between" }, temp, tempOut), "Chỉ là ưu tiên của bạn. Không đổi ngưỡng cảnh báo."),
      p.kind === "CHILD" && field("Âm thanh", music),
      p.kind === "CHILD" && field("Âm lượng", h("div", { class: "row between" }, vol, volOut), "Chưa gửi xuống xe trong bản demo."),
      h("p", { class: "small muted", style: "margin:0" }, "Hệ thống không nhận diện khuôn mặt và không đối chiếu ảnh với camera trong xe. Ảnh chỉ để bạn nhìn thấy hồ sơ."),
      h("div", { class: "row wrap" },
        onDelete && h("button", { class: "btn danger", on: { click: async () => { if (await confirmDialog({ title: "Xoá hồ sơ?", message: "Hồ sơ và ảnh sẽ bị xoá khỏi điện thoại này.", ok: "Xoá", danger: true })) { onDelete(); close(true); } } } }, "Xoá"),
        h("button", { class: "btn grow", on: { click: () => close(false) } }, "Hủy"),
        h("button", { class: "btn primary grow", on: { click: () => {
          if (!name.value.trim()) { toast("Nhập tên trước khi lưu.", "err"); return; }
          if (p.photo && !consent.checked) { toast("Cần xác nhận trước khi lưu ảnh.", "err"); return; }
          onSave(sanitizeProfile({ ...p, name: name.value, age: age.value, breed: breed.value, temp: temp.value, volume: vol.value, music: music.value, photo_consent: consent.checked })); close(true);
        } } }, "Lưu")));
  }, { title: profile.name ? `Sửa hồ sơ ${profile.name}` : p.kind === "PET" ? "Thêm thú cưng" : "Thêm bé" });
}

function editMode(mode, profiles, onSave, onDelete) {
  const m = { ...mode, schedule: { ...mode.schedule, days: [...mode.schedule.days] } };
  return sheet((close) => {
    const name = h("input", { type: "text", value: m.name, maxlength: 28 });
    const kind = h("select", {}, Object.entries(PROFILE_KINDS).map(([id, t]) => h("option", { value: id, selected: m.profile === id }, t)));
    const link = h("select", {});
    const tempOut = h("span", { class: "small muted" }, `${m.temp} °C`);
    const temp = h("input", { type: "range", min: TEMP_MIN, max: TEMP_MAX, step: 0.5, value: m.temp, "aria-label": "Nhiệt độ ưu tiên", on: { input: () => { tempOut.textContent = `${temp.value} °C`; } } });
    const fan = h("select", {}, FANS.map(([id, t]) => h("option", { value: id, selected: m.fan === id }, t)));
    const music = h("select", {}); const screen = h("select", {}, SCREENS.map(([id, t]) => h("option", { value: id, selected: m.screen === id }, t)));
    const fillMusic = () => music.replaceChildren(...musicFor(kind.value).map(([id, t]) => h("option", { value: id, selected: m.music === id }, t)));
    const fillLink = () => link.replaceChildren(h("option", { value: "" }, "Không gắn hồ sơ"), ...profiles.filter((p) => (kind.value === "PET") === (p.kind === "PET") && kind.value !== "ADULT")
      .map((p) => h("option", { value: p.id, selected: m.profileId === p.id }, p.name)));
    fillMusic(); fillLink();
    kind.addEventListener("change", () => { m.music = "off"; m.profileId = null; fillMusic(); fillLink(); });
    link.addEventListener("change", () => { const p = profiles.find((x) => x.id === link.value); m.profileId = p ? p.id : null; if (!p) return;
      temp.value = p.temp; tempOut.textContent = `${p.temp} °C`; if (kind.value === "CHILD") { m.music = p.music; fillMusic(); } });
    const en = h("input", { type: "checkbox", checked: m.schedule.enabled, role: "switch" });
    const from = h("input", { type: "time", value: m.schedule.from }), to = h("input", { type: "time", value: m.schedule.to });
    const dayBtns = DAYS.map(([d, t]) => h("button", { type: "button", class: `chip2 ${m.schedule.days.includes(d) ? "on" : ""}`, "aria-pressed": m.schedule.days.includes(d), on: { click: (e) => {
      const on = !m.schedule.days.includes(d); m.schedule.days = on ? [...m.schedule.days, d] : m.schedule.days.filter((x) => x !== d); e.currentTarget.classList.toggle("on", on); e.currentTarget.setAttribute("aria-pressed", String(on)); } } }, t));
    return h("div", { class: "gap" },
      field("Tên chế độ", name), field("Dành cho", kind), field("Hồ sơ", link),
      field("Nhiệt độ ưu tiên", h("div", { class: "row between" }, temp, tempOut)), field("Quạt", fan), field("Âm thanh", music), field("Màn hình trong xe", screen),
      h("label", { class: "switch" }, h("div", {}, h("div", {}, "Gợi ý theo lịch"), h("div", { class: "small muted" }, "Chỉ hiện gợi ý trên trang Xe, không tự bật.")), en),
      h("div", { class: "row wrap" }, dayBtns), h("div", { class: "row" }, field("Từ", from), field("Đến", to)),
      h("p", { class: "small muted", style: "margin:0" }, "Khi bật, hệ thống thật sự nhận hồ sơ và âm thanh. Nhiệt độ, quạt, màn hình là ưu tiên của bạn; bản demo giữ 25 °C. Không chế độ nào đổi mức cảnh báo."),
      h("div", { class: "row wrap" },
        onDelete && h("button", { class: "btn danger", on: { click: () => { onDelete(); close(true); } } }, "Xoá"),
        h("button", { class: "btn grow", on: { click: () => close(false) } }, "Hủy"),
        h("button", { class: "btn primary grow", on: { click: () => { onSave(sanitizeMode({ ...m, name: name.value, profile: kind.value, profileId: link.value || null, temp: temp.value, fan: fan.value, music: music.value, screen: screen.value,
          schedule: { enabled: en.checked, days: m.schedule.days, from: from.value, to: to.value } })); close(true); } } }, "Lưu")));
  }, { title: mode.name ? `Sửa chế độ ${mode.name}` : "Thêm chế độ" });
}

export async function startMode(mode) {
  const b = bridge();
  if (!b || !b.startCareProfile) { toast("Chưa kết nối được với xe demo.", "err"); return { ok: false }; }
  const { profile, music } = startArgs(mode);
  const r = await b.startCareProfile(profile, music);
  if (!r.ok) toast(r.detail, "err");
  return r;
}

const modeLine = (m, profiles) => {
  const p = profiles.find((x) => x.id === m.profileId);
  const sc = m.schedule.enabled ? ` · ${m.schedule.days.length ? DAYS.filter(([d]) => m.schedule.days.includes(d)).map(([, t]) => t).join(" ") : "chưa chọn ngày"} ${m.schedule.from}–${m.schedule.to}` : "";
  return `${PROFILE_KINDS[m.profile]}${p ? ` · ${p.name}` : ""} · ${m.temp} °C${sc}`;
};

export async function render(ctx) {
  const st = store();
  if (!st) return h("div", { class: "card center muted" }, "Trình duyệt chặn lưu trữ nên không dùng được cá nhân hoá.");
  const { rerender } = ctx;
  const profiles = loadProfiles(st), modes = loadModes(st);
  const putProfile = (p) => { const i = profiles.findIndex((x) => x.id === p.id); if (i >= 0) profiles[i] = p; else profiles.push(p); savedOk(saveProfiles(st, profiles)); rerender(); };
  const dropProfile = (id) => { savedOk(saveProfiles(st, profiles.filter((x) => x.id !== id))); savedOk(saveModes(st, modes.map((m) => (m.profileId === id ? { ...m, profileId: null } : m)))); rerender(); };
  const putMode = (m) => { const i = modes.findIndex((x) => x.id === m.id); if (i >= 0) modes[i] = m; else modes.push(m); savedOk(saveModes(st, modes)); rerender(); };
  const dropMode = (id) => { savedOk(saveModes(st, modes.filter((x) => x.id !== id))); rerender(); };
  const ready = canStart();
  const me = ctx.S && ctx.S.me;
  const mask = (ph) => (/^\d{10}$/.test(ph || "") ? `${ph.slice(0, 3)}•••••${ph.slice(-2)}` : "");
  const signOut = async () => { const app = await import("../app.js"); app.signedOut(); };
  return h("div", { class: "gap" },
    h("h1", {}, "Cá nhân hoá"),
    me && h("section", { class: "card" }, h("div", { class: "acct" }, h("div", { class: "avatar-s", "aria-hidden": "true" }, (me.name || "?").trim().slice(0, 1).toUpperCase()),
      h("div", { class: "grow" }, h("div", {}, me.name), h("div", { class: "small muted" }, `${mask(me.phone) || "Tài khoản demo"} · tài khoản demo`)),
      h("button", { class: "btn small", on: { click: signOut } }, "Đăng xuất"))),
    h("p", { class: "small muted", style: "margin:0" }, "Lưu trên điện thoại này. Không đổi mức cảnh báo hay ngưỡng của hệ thống."),
    h("section", { class: "card gap" }, h("h2", {}, "Hồ sơ người trong xe"),
      h("div", { class: "row wrap" }, h("button", { class: "btn small", on: { click: () => editProfile(sanitizeProfile({ kind: "CHILD", ...presetFor({ kind: "CHILD" }) }), putProfile) } }, icon("plus"), "Bé"),
        h("button", { class: "btn small", on: { click: () => editProfile(sanitizeProfile({ kind: "PET", ...presetFor({ kind: "PET" }) }), putProfile) } }, icon("plus"), "Thú cưng")),
      profiles.length ? h("div", { class: "list" }, profiles.map((p) => h("div", { class: "item" }, avatar(p), h("div", { class: "grow" }, h("div", {}, p.name), h("div", { class: "small muted" }, profileLine(p))),
        h("button", { class: "btn ghost small", "aria-label": `Sửa hồ sơ ${p.name}`, on: { click: () => editProfile(p, putProfile, () => dropProfile(p.id)) } }, icon("edit")))))
        : h("p", { class: "muted", style: "margin:0" }, "Chưa có hồ sơ. Thêm bé hoặc thú cưng để đặt sẵn nhiệt độ và âm thanh riêng.")),
    h("section", { class: "card gap" }, h("div", { class: "row between" }, h("h2", {}, "Chế độ"),
      h("button", { class: "btn small", on: { click: () => editMode(sanitizeMode({ name: "", profile: "CHILD" }), profiles, putMode) } }, icon("plus"), "Thêm")),
      !ready && h("p", { class: "small muted", style: "margin:0" }, "Chưa bật được lúc này: cần dữ liệu mới từ xe và chế độ chăm sóc chưa chạy."),
      h("div", { class: "list" }, modes.map((m) => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", {}, m.name), h("div", { class: "small muted" }, modeLine(m, profiles))),
        h("button", { class: "btn primary small", disabled: !ready, on: { click: (e) => busy(e.currentTarget, async () => { await startMode(m); rerender(); }) } }, "Bật"),
        h("button", { class: "btn ghost small", "aria-label": `Sửa chế độ ${m.name}`, on: { click: () => editMode(m, profiles, putMode, () => dropMode(m.id)) } }, icon("edit"))))),
      h("button", { class: "btn ghost small", on: { click: () => { savedOk(saveModes(st, DEFAULT_MODES())); rerender(); } } }, "Khôi phục chế độ mặc định")),
    h("p", { class: "small muted" }, "Bật chế độ chỉ gửi hồ sơ (bé / thú cưng / người lớn) và âm thanh. Tên, tuổi, ảnh và lịch không rời điện thoại."));
}

// Schedule hint for the home page. Never starts anything; the owner taps.
export function scheduleBanner(now = new Date()) {
  const st = store(); if (!st || !canStart()) return null;
  let dismissed = {}; try { dismissed = JSON.parse(st.getItem(KEY_DISMISSED) || "{}"); } catch (e) { /* none */ }
  const day = dayKeyOf(now), mode = dueModes(loadModes(st), now).find((m) => dismissed[m.id] !== day);
  if (!mode) return null;
  const card = h("section", { class: "card gap" }, h("div", { class: "small muted" }, "Gợi ý theo lịch của bạn"), h("div", {}, `Bật chế độ “${mode.name}” bây giờ?`),
    h("div", { class: "row" }, h("button", { class: "btn primary grow", on: { click: (e) => busy(e.currentTarget, async () => { const r = await startMode(mode); if (r.ok) card.remove(); }) } }, "Bật"),
      h("button", { class: "btn grow", on: { click: () => { try { st.setItem(KEY_DISMISSED, JSON.stringify({ ...dismissed, [mode.id]: day })); } catch (e) { /* ignore */ } card.remove(); } } }, "Bỏ qua hôm nay")));
  return card;
}
