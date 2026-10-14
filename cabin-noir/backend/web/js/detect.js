// Shared by the in-car device page: box helpers and the on-device detector loader. Nothing here touches the network
// except loading the detection library; camera frames stay in the browser.
export const ITEM = { backpack: "Ba lô", handbag: "Túi xách", suitcase: "Vali", "teddy bear": "Gấu bông", "cell phone": "Điện thoại", bottle: "Chai nước" };
export const PET = new Set(["cat", "dog"]);

export function script(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Không tải được thư viện nhận diện.")); document.head.append(s); });
}

/** Pixel box to [x, y, w, h] in 0..1, flipped when the picture is mirrored so it matches what the person sees. Position only, no pixels. */
export function norm(b, vw, vh, mirror) {
  const cl = (v) => Math.min(1, Math.max(0, v));
  let x = cl(b[0] / vw), y = cl(b[1] / vh), w = cl(b[2] / vw), hh = cl(b[3] / vh);
  w = Math.min(w, 1 - x); hh = Math.min(hh, 1 - y);
  if (mirror) x = Math.max(0, 1 - x - w);
  return [x, y, w, hh].map((v) => +v.toFixed(3));
}

let model = null;
const VENDOR = new URL("../vendor/", import.meta.url).href;     // TensorFlow.js, COCO-SSD and its weights are served by this server, never a CDN

/** Load COCO-SSD once (TensorFlow.js, runs in this browser). Everything comes from our own server. */
export async function loadModel() {
  if (model) return model;
  try {
    await script(`${VENDOR}tf.min.js`);
    await script(`${VENDOR}coco-ssd.min.js`);
    if (!window.tf || typeof window.tf.loadGraphModel !== "function" || !window.cocoSsd) throw new Error("thư viện chưa sẵn sàng");
    model = await window.cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl: `${VENDOR}coco-ssd/model.json` });
  } catch (e) {
    model = null;
    throw new Error(`Không tải được mô hình nhận diện trên máy này (${e.message}). Kiểm tra mạng rồi bật lại camera; vẫn có thể tự nhìn xe bằng mắt.`);
  }
  return model;
}

/** One frame: every person, pet and item anywhere in the picture (the cabin is one zone, no seats). A dark picture is
 *  reported as "camera not ok", never as an empty cabin. */
export async function detectFrame(video, scratch, mirror, conf = 0.35) {
  const c = scratch.getContext("2d", { willReadFrequently: true });
  c.drawImage(video, 0, 0, 32, 24);
  const px = c.getImageData(0, 0, 32, 24).data; let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
  const dark = sum / (px.length / 4) < 12;
  let preds = [];
  try { preds = dark ? [] : await model.detect(video, 12, conf); } catch { /* skip frame */ }
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480, found = [], items = [];
  for (const p of preds) {
    const box = norm(p.bbox, vw, vh, mirror), conf = +p.score.toFixed(2);
    if (p.class === "person" || PET.has(p.class)) found.push({ kind: p.class === "person" ? "person" : "pet", conf, box });
    else if (ITEM[p.class]) items.push({ name: ITEM[p.class], conf, box });
  }
  found.sort((a, b) => b.conf - a.conf);
  return { detections: found.slice(0, 8), items: items.slice(0, 12), ok: !dark };
}
