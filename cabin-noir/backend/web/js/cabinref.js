// Empty-cabin reference for the "Video mẫu" source of the in-car device page. Runs on this device only: a seat whose
// picture no longer matches the verified-empty cabin counts as "maybe someone", even when the detector sees nobody
// (the child in a rear child seat that COCO-SSD misses). Port of P-068 video_sim.EmptyReference / v3 seats.py:
// luma and gradient templates on a 320x180 plane, normalised correlation within ±8 px, the lower of the two scores.
// Pure functions over gray planes so it can be tested without a browser.
export const W = 320, H = 180;
export const MATCH = 0.55;      // below this a seat differs from the empty reference (v3 ref_match_thr)
export const LOW_FRAMES = 3;    // three frames in a row before a seat counts as changed
const MARGIN = 8, INSET = 0.1;

/** Seat box [x1, y1, x2, y2] in 0..1 to the template rectangle on the 320x180 plane, or null when too small. */
export function rect(box) {
  const [x1, y1, x2, y2] = box, dx = (x2 - x1) * INSET, dy = (y2 - y1) * INSET;
  const r = [Math.round((x1 + dx) * W), Math.round((y1 + dy) * H), Math.round((x2 - dx) * W), Math.round((y2 - dy) * H)];
  return r[2] - r[0] >= 4 && r[3] - r[1] >= 4 ? r : null;
}

/** RGBA pixels (W x H) to a luma plane, BT.601 weights like OpenCV's BGR2GRAY. */
export function luma(rgba) {
  const g = new Float32Array(W * H);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

function crop(plane, pw, x1, y1, x2, y2) {
  const w = x2 - x1, h = y2 - y1, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) out.set(plane.subarray((y1 + y) * pw + x1, (y1 + y) * pw + x2), y * w);
  return { d: out, w, h };
}

/** Sobel gradient magnitude without the one-pixel border (OpenCV Sobel ksize 3, then [1:-1, 1:-1]). */
function grad(p) {
  const { d, w, h } = p, ow = w - 2, oh = h - 2, out = new Float32Array(Math.max(0, ow * oh));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const a = (y - 1) * w + x, b = y * w + x, c = (y + 1) * w + x;
    const gx = d[a + 1] - d[a - 1] + 2 * (d[b + 1] - d[b - 1]) + d[c + 1] - d[c - 1];
    const gy = d[c - 1] + 2 * d[c] + d[c + 1] - d[a - 1] - 2 * d[a] - d[a + 1];
    out[(y - 1) * ow + (x - 1)] = Math.hypot(gx, gy);
  }
  return { d: out, w: ow, h: oh };
}

/** Best normalised cross-correlation (OpenCV TM_CCOEFF_NORMED) of template t anywhere inside window win. */
function bestMatch(win, t) {
  const n = t.w * t.h;
  let tm = 0;
  for (let i = 0; i < n; i++) tm += t.d[i];
  tm /= n;
  const tz = new Float32Array(n);
  let tss = 0;
  for (let i = 0; i < n; i++) { tz[i] = t.d[i] - tm; tss += tz[i] * tz[i]; }
  let best = -1;
  for (let oy = 0; oy + t.h <= win.h; oy++) for (let ox = 0; ox + t.w <= win.w; ox++) {
    let s = 0, ss = 0, cross = 0;
    for (let y = 0; y < t.h; y++) {
      const row = (oy + y) * win.w + ox, trow = y * t.w;
      for (let x = 0; x < t.w; x++) { const v = win.d[row + x]; s += v; ss += v * v; cross += v * tz[trow + x]; }
    }
    const varW = ss - (s * s) / n, den = Math.sqrt(varW * tss);
    const r = den > 1e-6 ? cross / den : (varW < 1e-6 && tss < 1e-6 ? 1 : 0);
    if (r > best) best = r;
  }
  return best;
}

/** Templates of the verified-empty cabin, one per seat. seats: [{ name, box: [x1, y1, x2, y2] }]. */
export function makeReference(gray, seats) {
  const ref = {};
  for (const s of seats) {
    const r = rect(s.box);
    if (!r) continue;
    const patch = crop(gray, W, r[0], r[1], r[2], r[3]);
    ref[s.name] = { r, luma: patch, grad: grad(patch) };
  }
  return ref;
}

/** min(luma, gradient) similarity of this seat to the empty reference, or null without a template. */
export function similarity(ref, name, gray) {
  const t = ref[name];
  if (!t) return null;
  const { r, luma: tl, grad: tg } = t;
  const x1 = Math.max(0, r[0] - MARGIN), y1 = Math.max(0, r[1] - MARGIN);
  const x2 = Math.min(W, r[0] + tl.w + MARGIN), y2 = Math.min(H, r[1] + tl.h + MARGIN);
  const win = crop(gray, W, x1, y1, x2, y2);
  if (win.w < tl.w || win.h < tl.h) return null;
  return Math.min(bestMatch(win, tl), bestMatch(grad(win), tg));
}

/** Per-seat counter: a seat is "changed" after LOW_FRAMES frames in a row below MATCH; one good frame resets it. */
export function track(counts, name, sim) {
  counts[name] = sim != null && sim < MATCH ? (counts[name] || 0) + 1 : 0;
  return counts[name] >= LOW_FRAMES;
}
