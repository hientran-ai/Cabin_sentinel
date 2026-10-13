// "Video mẫu" source of the in-car device page: a recorded clip (a sample, or the user's own file) stands in for the
// camera. Everything happens on this device, exactly like the webcam source: COCO-SSD finds people, pets and items,
// the empty-cabin reference flags seats that no longer look empty, and only seat labels, confidences and boxes go to
// the server. The clip itself never leaves this page (a chosen file is played from a local blob: URL).
import { loadModel, ITEM, PET } from "./detect.js";
import { W, H, luma, makeReference, similarity, track } from "./cabinref.js";

const SAMPLE_DIR = new URL("../samples/", import.meta.url).href;
// Boxes are [x1, y1, x2, y2] in 0..1, marked once per car and camera pose like a fitter would at installation.
const SAME_CAR = { rear_left: [0.4, 0.52, 0.55, 0.9], rear_right: [0.55, 0.58, 0.7, 0.95], passenger: [0.7, 0.5, 0.99, 1] };
const SAME_CAR_GLASS = [[0.18, 0.44, 0.32, 0.62], [0.4, 0.47, 0.66, 0.6]];

export const SAMPLES = [
  { id: "child-rear", file: "child-rear.mp4", ref: "empty-cabin-ref.jpg", seats: SAME_CAR, glass: SAME_CAR_GLASS,
    title: "Trẻ trên ghế an toàn phía sau", note: "Nhóm tự quay, mặt đã làm mờ. Mô hình không thấy bé; ảnh xe trống bắt được.", truth: "Có trẻ ở ghế sau phải" },
  { id: "empty-cabin", file: "empty-cabin.mp4", ref: "empty-cabin-ref.jpg", seats: SAME_CAR, glass: SAME_CAR_GLASS,
    title: "Xe trống", note: "Cùng xe, ghế trẻ em không có ai.", truth: "Không có ai" },
  { id: "rear-facing", file: "empty-cabin.mp4", ref: "empty-cabin-ref.jpg", seats: SAME_CAR, glass: SAME_CAR_GLASS, rearFacing: "rear_right",
    title: "Ghế trẻ em quay ngược", note: "Cùng video xe trống; ghế sau phải là ghế quay ngược nên camera không nhìn được vào trong.", truth: "Phải nhắc kiểm tra bằng mắt" },
  { id: "ai-child", file: "ai-child.mp4", seats: { rear_left: [0.18, 0.35, 0.45, 1], rear_mid: [0.42, 0.38, 0.56, 0.85], rear_right: [0.55, 0.38, 0.85, 1] },
    glass: [[0, 0.28, 0.2, 0.6], [0.8, 0.28, 1, 0.62], [0.36, 0.33, 0.62, 0.42]],
    title: "Trẻ ngồi ghế nâng (video AI)", note: "Video do AI tạo, không có người thật. Cửa kính thấy người ngoài đường.", truth: "Có trẻ ở ghế sau phải" },
];
// An own clip: the three rear seats as thirds of the lower part of the picture.
export const OWN = { id: "own", seats: { rear_left: [0.02, 0.3, 0.34, 0.95], rear_mid: [0.34, 0.3, 0.66, 0.95], rear_right: [0.66, 0.3, 0.98, 0.95] }, glass: [],
  title: "Video của bạn", note: "Ghế sau chia đều ba phần. Thêm ảnh xe trống cùng góc máy để bắt cả người mà mô hình bỏ sót.", truth: null };

export const sampleUrl = (s) => SAMPLE_DIR + s.file;
const toXYWH = ([x1, y1, x2, y2]) => [x1, y1, x2 - x1, y2 - y1].map((v) => +v.toFixed(3));
const inside = ([x1, y1, x2, y2], x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** 320x180 luma plane of whatever is drawn now (video frame or picture). */
export function grayOf(source, canvas) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(source, 0, 0, W, H);
  return luma(g.getImageData(0, 0, W, H).data);
}

/** Seat state per frame, kept between frames for the reference counter. */
export function newRun(sample) {
  return { sample, ref: null, low: {}, seats: {}, frames: 0, ms: [], firstAlertAt: null, startedAt: performance.now() };
}

export async function setReference(vr, picture, canvas) {
  vr.ref = makeReference(grayOf(picture, canvas), Object.entries(vr.sample.seats).map(([name, box]) => ({ name, box })));
  vr.low = {};
}

/** One frame: detector, then the empty-cabin reference, then what this device reports. Returns { detections, items, ok }. */
export async function analyse(vr, video, canvas, blocked) {
  const t0 = performance.now();
  const gray = grayOf(video, canvas);
  let mean = 0;
  for (let i = 0; i < gray.length; i += 7) mean += gray[i];
  mean /= Math.ceil(gray.length / 7);
  const ok = !blocked && mean >= 12;                   // dark or covered: camera problem, never "empty" (SR-01)
  vr.frames += 1;
  const seats = vr.sample.seats, names = Object.keys(seats);
  vr.seats = Object.fromEntries(names.map((n) => [n, { state: ok ? "empty" : "blind", conf: 0, sim: null }]));
  if (!ok) { vr.ms.push(performance.now() - t0); return { detections: [], items: [], ok: false, boxes: [] }; }

  const model = await loadModel();
  let preds = [];
  try { preds = await model.detect(video, 12, 0.35); } catch { /* skip frame */ }
  const vw = video.videoWidth || 640, vh = video.videoHeight || 360, best = {}, items = [], boxes = [];
  for (const p of preds) {
    const b = [p.bbox[0] / vw, p.bbox[1] / vh, (p.bbox[0] + p.bbox[2]) / vw, (p.bbox[1] + p.bbox[3]) / vh];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    if (vr.sample.glass.some((g) => inside(g, cx, cy))) { boxes.push({ b, label: `${p.class} · ngoài kính, bỏ qua`, muted: true }); continue; }
    const seat = names.filter((n) => inside(seats[n], cx, cy)).sort((x, y) => overlap(seats[y], b) - overlap(seats[x], b))[0];
    const living = p.class === "person" || PET.has(p.class);
    boxes.push({ b, label: `${living ? (p.class === "person" ? "người" : "thú cưng") : ITEM[p.class] || p.class} ${Math.round(p.score * 100)}%`, muted: !seat || (!living && !ITEM[p.class]) });
    if (!seat || seat === "driver") continue;
    const box = toXYWH(b.map((v) => Math.min(1, Math.max(0, v))));
    if (living) { if (!best[seat] || p.score > best[seat].conf) best[seat] = { seat, kind: p.class === "person" ? "person" : "pet", conf: +p.score.toFixed(2), box }; }
    else if (ITEM[p.class]) items.push({ name: ITEM[p.class], seat, conf: +p.score.toFixed(2), box });
  }
  for (const n of names) {
    const s = vr.seats[n];
    if (best[n]) { s.state = "seen"; s.conf = best[n].conf; }
    if (n === vr.sample.rearFacing) {                    // cannot see into it: always "check by eye", never "empty"
      s.state = best[n] ? "seen" : "rear_facing";
      if (!best[n]) best[n] = { seat: n, kind: "person", conf: 0.5, age: "unknown", box: toXYWH(seats[n]) };
      continue;
    }
    if (vr.ref) {
      s.sim = similarity(vr.ref, n, gray);
      if (s.sim != null) s.sim = +s.sim.toFixed(2);
      if (track(vr.low, n, s.sim) && !best[n]) {
        s.state = "changed";
        best[n] = { seat: n, kind: "person", conf: 0.5, age: "unknown", box: toXYWH(seats[n]) };
      } else if (!best[n] && s.sim != null && s.sim >= 0.55) s.state = "verified";
    }
  }
  const detections = Object.values(best);
  if (detections.length && vr.firstAlertAt == null) vr.firstAlertAt = performance.now();
  vr.ms.push(performance.now() - t0);
  if (vr.ms.length > 60) vr.ms.shift();
  return { detections, items: items.slice(0, 12), ok: true, boxes };
}

const p50 = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const stats = (vr) => ({ frames: vr.frames, p50: p50(vr.ms), firstAlert: vr.firstAlertAt == null ? null : (vr.firstAlertAt - vr.startedAt) / 1000 });

const COLOR = { seen: "#ff4d4d", changed: "#ff9f0a", rear_facing: "#ff9f0a", verified: "#30d158", empty: "#8e8e93", blind: "#8e8e93" };
export const SEAT_TEXT = { seen: "có người/thú", changed: "khác lúc xe trống", rear_facing: "ghế quay ngược, không nhìn được", verified: "trống (khớp ảnh xe trống)", empty: "không thấy ai", blind: "camera không nhìn được" };
const SEAT_NAME = { rear_left: "Sau trái", rear_mid: "Sau giữa", rear_right: "Sau phải", passenger: "Ghế phụ" };

/** Seat zones and detector boxes over the video, on this screen only. */
export function paint(overlay, video, vr, boxes) {
  const r = video.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr);
  const g = overlay.getContext("2d"), cw = overlay.width, ch = overlay.height;
  g.clearRect(0, 0, cw, ch); g.lineWidth = 2 * dpr; g.font = `${12 * dpr}px system-ui, sans-serif`;
  for (const gl of vr.sample.glass) { g.setLineDash([4 * dpr, 4 * dpr]); g.strokeStyle = "rgba(255,255,255,.35)"; g.strokeRect(gl[0] * cw, gl[1] * ch, (gl[2] - gl[0]) * cw, (gl[3] - gl[1]) * ch); }
  g.setLineDash([]);
  for (const [n, box] of Object.entries(vr.sample.seats)) {
    const s = vr.seats[n] || { state: "empty" }, c = COLOR[s.state];
    g.strokeStyle = c; g.strokeRect(box[0] * cw, box[1] * ch, (box[2] - box[0]) * cw, (box[3] - box[1]) * ch);
    const label = `${SEAT_NAME[n] || n}${s.sim != null ? ` · ${s.sim}` : ""}`;
    g.fillStyle = c; g.fillRect(box[0] * cw, box[1] * ch, g.measureText(label).width + 8 * dpr, 16 * dpr);
    g.fillStyle = "#000"; g.fillText(label, box[0] * cw + 4 * dpr, box[1] * ch + 12 * dpr);
  }
  for (const { b, label, muted } of boxes || []) {
    g.strokeStyle = muted ? "rgba(255,255,255,.4)" : "#4cc9f0"; g.strokeRect(b[0] * cw, b[1] * ch, (b[2] - b[0]) * cw, (b[3] - b[1]) * ch);
    g.fillStyle = g.strokeStyle; g.fillText(label, b[0] * cw + 3 * dpr, Math.min(ch - 4 * dpr, b[3] * ch - 4 * dpr));
  }
}
