// "Video mẫu" source of the in-car device page: a recorded clip (a sample, or the user's own file) stands in for the
// camera. Everything happens on this device, exactly like the webcam source: COCO-SSD finds people, pets and items
// anywhere in the cabin, the empty-cabin reference flags spots that no longer look empty, and only kinds, confidences
// and boxes go to the server. There are no seats: a person outside a drawn box counts all the same. The clip itself never leaves this page (a chosen file is played from a local blob: URL).
import { loadModel, ITEM, PET } from "./detect.js";
import { W, H, luma, makeReference, similarity, track } from "./cabinref.js";

const SAMPLE_DIR = new URL("../samples/", import.meta.url).href;
// Boxes are [x1, y1, x2, y2] in 0..1, marked once per car and camera pose like a fitter would at installation.
// "zones" are only where the empty-cabin picture is compared (a child the model misses still changes the picture);
// they are never shown or reported as seats. "glass" is the windows: people outside the car are ignored.
const SAME_CAR = { a: [0.4, 0.52, 0.55, 0.9], b: [0.55, 0.58, 0.7, 0.95], c: [0.7, 0.5, 0.99, 1] };
const SAME_CAR_GLASS = [[0.18, 0.44, 0.32, 0.62], [0.4, 0.47, 0.66, 0.6]];

export const SAMPLES = [
  { id: "child-rear", file: "child-rear.mp4", ref: "empty-cabin-ref.jpg", zones: SAME_CAR, glass: SAME_CAR_GLASS,
    title: "Trẻ trên ghế an toàn phía sau", note: "Nhóm tự quay, mặt đã làm mờ. Mô hình không thấy bé; ảnh xe trống bắt được.", truth: "Có một bé trong xe" },
  { id: "empty-cabin", file: "empty-cabin.mp4", ref: "empty-cabin-ref.jpg", zones: SAME_CAR, glass: SAME_CAR_GLASS,
    title: "Xe trống", note: "Cùng xe, ghế trẻ em không có ai.", truth: "Không có ai" },
  { id: "rear-facing", file: "empty-cabin.mp4", ref: "empty-cabin-ref.jpg", zones: SAME_CAR, glass: SAME_CAR_GLASS, rearFacing: "b",
    title: "Ghế trẻ em quay ngược", note: "Cùng video xe trống; có một ghế trẻ em quay ngược nên camera không nhìn được vào trong.", truth: "Phải nhắc kiểm tra bằng mắt" },
  { id: "ai-child", file: "ai-child.mp4", zones: {},
    glass: [[0, 0.28, 0.2, 0.6], [0.8, 0.28, 1, 0.62], [0.36, 0.33, 0.62, 0.42]],
    title: "Trẻ ngồi ghế nâng (video AI)", note: "Video do AI tạo, không có người thật. Cửa kính thấy người ngoài đường.", truth: "Có một bé trong xe" },
];
// An own clip: the empty-cabin picture is compared over the lower part of the frame, in three strips.
export const OWN = { id: "own", zones: { a: [0.02, 0.3, 0.34, 0.95], b: [0.34, 0.3, 0.66, 0.95], c: [0.66, 0.3, 0.98, 0.95] }, glass: [],
  title: "Video của bạn", note: "Nhận diện cả khoang xe. Thêm ảnh xe trống cùng góc máy để bắt cả người mà mô hình bỏ sót.", truth: null };

export const sampleUrl = (s) => SAMPLE_DIR + s.file;
const toXYWH = ([x1, y1, x2, y2]) => [x1, y1, x2 - x1, y2 - y1].map((v) => +v.toFixed(3));
const inside = ([x1, y1, x2, y2], x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;

/** 320x180 luma plane of whatever is drawn now (video frame or picture). */
export function grayOf(source, canvas) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(source, 0, 0, W, H);
  return luma(g.getImageData(0, 0, W, H).data);
}

/** State kept between frames for the reference counter. */
export function newRun(sample) {
  return { sample, ref: null, low: {}, frames: 0, ms: [], firstAlertAt: null, startedAt: performance.now(), seen: [] };
}

export async function setReference(vr, picture, canvas) {
  vr.ref = makeReference(grayOf(picture, canvas), Object.entries(vr.sample.zones).map(([name, box]) => ({ name, box })));
  vr.low = {};
}

/** One frame: detector, then the empty-cabin reference, then what this device reports. Returns { detections, items, ok, boxes }.
 *  Every person and pet in the picture counts (except through the windows); there are no seats. */
export async function analyse(vr, video, canvas, blocked) {
  const t0 = performance.now();
  const gray = grayOf(video, canvas);
  let mean = 0;
  for (let i = 0; i < gray.length; i += 7) mean += gray[i];
  mean /= Math.ceil(gray.length / 7);
  const ok = !blocked && mean >= 12;                   // dark or covered: camera problem, never "empty" (SR-01)
  vr.frames += 1;
  if (!ok) { vr.seen = []; vr.ms.push(performance.now() - t0); return { detections: [], items: [], ok: false, boxes: [] }; }

  const model = await loadModel();
  let preds = [];
  try { preds = await model.detect(video, 12, 0.35); } catch { /* skip frame */ }
  const vw = video.videoWidth || 640, vh = video.videoHeight || 360, found = [], items = [], boxes = [];
  for (const p of preds) {
    const b = [p.bbox[0] / vw, p.bbox[1] / vh, (p.bbox[0] + p.bbox[2]) / vw, (p.bbox[1] + p.bbox[3]) / vh];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const living = p.class === "person" || PET.has(p.class);
    if (vr.sample.glass.some((g) => inside(g, cx, cy))) { if (living) boxes.push({ b, label: `${p.class === "person" ? "người" : "thú"} ngoài kính, bỏ qua`, muted: true }); continue; }
    const box = toXYWH(b.map((v) => Math.min(1, Math.max(0, v)))), conf = +p.score.toFixed(2);
    if (living) {
      const kind = p.class === "person" ? "person" : "pet";
      found.push({ kind, conf, box });
      boxes.push({ b, label: `${kind === "person" ? "Người" : "Thú cưng"} ${Math.round(conf * 100)}%`, kind });
    } else if (ITEM[p.class]) {
      items.push({ name: ITEM[p.class], conf, box });
      boxes.push({ b, label: `${ITEM[p.class]} ${Math.round(conf * 100)}%`, kind: "item" });
    }
  }
  // Spots the camera cannot judge by the model alone. Skipped when the model already sees someone there.
  const covered = (z) => found.some((d) => inside(z, d.box[0] + d.box[2] / 2, d.box[1] + d.box[3] / 2));
  for (const [n, z] of Object.entries(vr.sample.zones)) {
    if (n === vr.sample.rearFacing) {                    // cannot see into it: always "check by eye", never "empty"
      if (!covered(z)) { found.push({ kind: "person", conf: 0.5, age: "unknown", box: toXYWH(z) }); boxes.push({ b: z, label: "Ghế trẻ em quay ngược: kiểm tra bằng mắt", kind: "check" }); }
      continue;
    }
    if (!vr.ref) continue;
    const sim = similarity(vr.ref, n, gray);
    if (track(vr.low, n, sim) && !covered(z)) {
      found.push({ kind: "person", conf: 0.5, age: "unknown", box: toXYWH(z) });
      boxes.push({ b: z, label: "Khác lúc xe trống: có thể có người", kind: "check" });
    }
  }
  found.sort((a, b) => b.conf - a.conf);
  const detections = found.slice(0, 8);
  vr.seen = boxes.filter((x) => !x.muted).map((x) => x.label);
  if (detections.length && vr.firstAlertAt == null) vr.firstAlertAt = performance.now();
  vr.ms.push(performance.now() - t0);
  if (vr.ms.length > 60) vr.ms.shift();
  return { detections, items: items.slice(0, 12), ok: true, boxes };
}

const p50 = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const stats = (vr) => ({ frames: vr.frames, p50: p50(vr.ms), firstAlert: vr.firstAlertAt == null ? null : (vr.firstAlertAt - vr.startedAt) / 1000 });

const COLOR = { person: "#ff4d4d", pet: "#ff9f0a", item: "#f5c518", check: "#ff9f0a" };

/** Detector boxes over the video, on this screen only. No seat zones. */
export function paint(overlay, video, vr, boxes) {
  const r = video.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr);
  const g = overlay.getContext("2d"), cw = overlay.width, ch = overlay.height;
  g.clearRect(0, 0, cw, ch); g.lineWidth = 2 * dpr; g.font = `600 ${12 * dpr}px system-ui, sans-serif`;
  for (const { b, label, muted, kind } of boxes || []) {
    const col = muted ? "rgba(255,255,255,.4)" : COLOR[kind] || COLOR.person;
    g.setLineDash(kind === "check" ? [6 * dpr, 4 * dpr] : []);
    g.strokeStyle = col; g.strokeRect(b[0] * cw, b[1] * ch, (b[2] - b[0]) * cw, (b[3] - b[1]) * ch);
    // Keep the whole label inside the picture: shift it left at the right edge.
    const tw = Math.min(g.measureText(label).width + 8 * dpr, cw), tx = Math.max(0, Math.min(b[0] * cw, cw - tw));
    const ty = b[1] * ch >= 18 * dpr ? b[1] * ch - 18 * dpr : b[1] * ch;
    g.fillStyle = col; g.fillRect(tx, ty, tw, 18 * dpr);
    g.fillStyle = "#000"; g.fillText(label, tx + 4 * dpr, ty + 13 * dpr, tw - 8 * dpr);
  }
  g.setLineDash([]);
}
