// Pure helpers for the "Cá nhân hoá" tab: in-car profiles (a child, a pet), named modes and their weekly schedule.
// Everything here lives only in this phone's localStorage. Nothing in it is sent to the backend except the profile kind
// (CHILD / PET / ADULT) and a music id when a mode is started, and nothing here can change an alert level or a threshold.
export const KEY_PROFILES = "cs.profiles.v1", KEY_MODES = "cs.modes.v1", KEY_DISMISSED = "cs.modes.dismissed.v1";
export const CHILD_MUSIC = [["off", "Không bật âm thanh"], ["twinkle", "Twinkle (ru bé)"], ["brahms", "Brahms (ru bé)"]];
export const ADULT_MUSIC = [["off", "Không bật âm thanh"], ["ambient", "Âm thanh nền"], ["music_app", "Mở ứng dụng nhạc (mô phỏng)"], ["podcast_app", "Mở podcast (mô phỏng)"]];
export const SCREENS = [["CHILD_FRIENDLY", "Giao diện cho bé"], ["PET_NOTICE", "Thông báo thú cưng"], ["OFF", "Không đổi màn hình"]];
export const FANS = [["LOW", "Nhẹ"], ["MID", "Vừa"], ["HIGH", "Mạnh"]];
export const PROFILE_KINDS = { CHILD: "Bé", PET: "Thú cưng", ADULT: "Người lớn" };
export const TEMP_MIN = 20, TEMP_MAX = 28;            // comfort preference range, not an alert threshold

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const newId = (p) => p + Math.random().toString(36).slice(2, 9);

// Suggested comfort values for a profile. A toddler gets a lullaby, a dog gets no music.
export function presetFor(profile) {
  if (profile.kind === "PET") return { temp: 23, music: "off", volume: 0 };
  const age = clamp(profile.age, 0, 17, 3);
  return { temp: age < 6 ? 24 : 25, music: age < 6 ? "twinkle" : "off", volume: age < 6 ? 30 : 0 };
}

export function sanitizeProfile(p) {
  const kind = p && p.kind === "PET" ? "PET" : "CHILD";
  const base = presetFor({ kind, age: p && p.age });
  const photo = p && typeof p.photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.photo) && p.photo.length <= 60000 ? p.photo : null;
  const music = kind === "CHILD" && CHILD_MUSIC.some(([id]) => id === (p && p.music)) ? p.music : base.music;
  return { id: text(p && p.id, 16) || newId("p"), kind, name: text(p && p.name, 24), age: p && p.age != null && p.age !== "" ? clamp(p.age, 0, kind === "PET" ? 30 : 17, 0) : null,
    breed: kind === "PET" ? text(p && p.breed, 24) : "", temp: clamp(p && p.temp, TEMP_MIN, TEMP_MAX, base.temp), music, volume: clamp(p && p.volume, 0, 100, base.volume),
    photo, photo_consent: !!(photo && p.photo_consent) };
}

const SCHEDULE = (days, from, to) => ({ enabled: false, days, from, to });
export const DEFAULT_MODES = () => [
  { id: "pickup", name: "Đón bé", profile: "CHILD", profileId: null, temp: 24, fan: "LOW", music: "twinkle", screen: "CHILD_FRIENDLY", schedule: SCHEDULE([1, 2, 3, 4, 5], "07:00", "08:00") },
  { id: "pet", name: "Đi cùng thú cưng", profile: "PET", profileId: null, temp: 23, fan: "LOW", music: "off", screen: "PET_NOTICE", schedule: SCHEDULE([0, 6], "09:00", "11:00") },
  { id: "camp", name: "Cắm trại", profile: "ADULT", profileId: null, temp: 25, fan: "LOW", music: "ambient", screen: "OFF", schedule: SCHEDULE([], "18:00", "21:00") },
];

const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
export function sanitizeMode(m) {
  const profile = ["CHILD", "PET", "ADULT"].includes(m && m.profile) ? m.profile : "CHILD";
  const music = (profile === "CHILD" ? CHILD_MUSIC : profile === "ADULT" ? ADULT_MUSIC : [["off"]]).some(([id]) => id === (m && m.music)) ? m.music : "off";
  const sc = (m && m.schedule) || {};
  return { id: text(m && m.id, 16) || newId("m"), name: text(m && m.name, 28) || "Chế độ mới", profile, profileId: m && m.profileId ? text(m.profileId, 16) : null,
    temp: clamp(m && m.temp, TEMP_MIN, TEMP_MAX, 25), fan: FANS.some(([id]) => id === (m && m.fan)) ? m.fan : "LOW",
    music, screen: SCREENS.some(([id]) => id === (m && m.screen)) ? m.screen : "OFF",
    schedule: { enabled: !!sc.enabled, days: [...new Set((Array.isArray(sc.days) ? sc.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort(), from: hhmm(sc.from, "07:00"), to: hhmm(sc.to, "08:00") } };
}

// What the backend is actually asked to do when a mode starts: the profile and, for CHILD/ADULT, a music id. Temperature, fan and screen are
// the owner's preference only (the backend plan fixes them), so they are never sent.
export function startArgs(mode) {
  return { profile: mode.profile, music: mode.profile === "PET" || mode.music === "off" ? undefined : mode.music };
}

export function minutes(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
// A mode is "due" inside its window on its days. It is only ever a suggestion on the home page: it never starts by itself.
export function scheduleMatches(mode, date) {
  const s = mode.schedule;
  if (!s || !s.enabled || !s.days.includes(date.getDay())) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return now >= minutes(s.from) && now < minutes(s.to);
}
export const dueModes = (modes, date) => modes.filter((m) => scheduleMatches(m, date));
export const dayKeyOf = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export function loadModes(storage) {
  try { const raw = JSON.parse(storage.getItem(KEY_MODES) || "null"); if (Array.isArray(raw)) return raw.map(sanitizeMode); } catch (e) { /* fall through */ }
  return DEFAULT_MODES().map(sanitizeMode);
}
export function loadProfiles(storage) {
  try { const raw = JSON.parse(storage.getItem(KEY_PROFILES) || "[]"); return Array.isArray(raw) ? raw.map(sanitizeProfile) : []; } catch (e) { return []; }
}
export const saveModes = (storage, modes) => { try { storage.setItem(KEY_MODES, JSON.stringify(modes.map(sanitizeMode))); return true; } catch (e) { return false; } };
export const saveProfiles = (storage, profiles) => { try { storage.setItem(KEY_PROFILES, JSON.stringify(profiles.map(sanitizeProfile))); return true; } catch (e) { return false; } };

export function profileLine(p) {
  const who = p.kind === "PET" ? `${p.breed || "Thú cưng"}${p.age != null ? ` · ${p.age} tuổi` : ""}` : `Bé${p.age != null ? ` · ${p.age} tuổi` : ""}`;
  const music = p.kind === "CHILD" && p.music !== "off" ? (CHILD_MUSIC.find(([id]) => id === p.music) || [])[1] : null;
  return `${who} · ${p.temp} °C${music ? ` · ${music}` : ""}`;
}
