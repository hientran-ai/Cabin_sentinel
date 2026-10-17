// HMI V6 §5 and §7: the default camera is not tuned by eye, it is solved from the geometric targets of the spec.
//
// Fixed by the spec:   vertical FOV 35 deg, azimuth 45 deg, near 0.01L, far 100L, orbit limits (polar 25..86 deg, distance 1.2L..3.0L).
// Seed by the spec:    target (0, 0.16L, 0), polar 78 deg, distance 1.8L.
// Acceptance targets:  footprint centre (57%, 82%), car bounding box width 52%, horizon 50% (all in the scene viewport).
//
// The solver uses the real vertices of the loaded car (pose with doors closed), projects them with the exact camera maths of
// three.js and finds the camera. A perspective camera that only orbits cannot satisfy horizon 50% and footprint 82% together at polar 78 deg
// (the horizon would be near 16%), so the solver uses two things the spec does not name, and reports both:
//   1. polar is solved inside the orbit interval instead of staying at the 78 deg seed,
//   2. a lens shift (camera.setViewOffset) moves the principal point so the horizon and the footprint land on their targets.
// Neither is hidden: `Fit.deviations` lists them, and `Fit.strict` shows what the unmodified seed camera gives.
import * as THREE from 'three'

export const SPEC = {
  fovDeg: 35, azimuthDeg: 45, nearL: 0.01, farL: 100,
  seed: { polarDeg: 78, targetYL: 0.16, distanceL: 1.8 },
  polarMinDeg: 25, polarMaxDeg: 86, distMinL: 1.2, distMaxL: 3.0,
  target: { footprintX: 0.57, footprintY: 0.82, width: 0.52, horizon: 0.5 },
  tol: { footprint: 0.02, width: 0.02, horizon: 0.02 },
} as const

/** Geometry of the car that the camera is fitted to: world points (footprint centre at the origin, tyres on y=0, +X forward). */
export const carMetrics: { L: number; cloud: Float32Array; version: number } = { L: 4.8, cloud: new Float32Array(0), version: 0 }

const MAX_POINTS = 6000

/** Samples the car's vertices at rest. `offset` is the group offset that is applied above `root` (the GLB wrapper). */
export function publishCar(root: THREE.Object3D, offset = new THREE.Vector3()) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.geometry.getAttribute('position')) meshes.push(m) })
  let total = 0
  for (const m of meshes) total += m.geometry.getAttribute('position').count
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS))
  const pts: number[] = []
  const v = new THREE.Vector3()
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i += stride) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).add(offset); pts.push(v.x, v.y, v.z) }
  }
  setCloud(new Float32Array(pts))
}

/** Box-shaped stand-in for the built-in procedural car (fallback when the GLB is missing). */
export function publishBox(length: number, width: number, height: number) {
  const pts: number[] = []
  for (const x of [-length / 2, length / 2]) for (const y of [0, height]) for (const z of [-width / 2, width / 2]) pts.push(x, y, z)
  setCloud(new Float32Array(pts))
}

function setCloud(cloud: Float32Array) {
  let x0 = Infinity, x1 = -Infinity
  for (let i = 0; i < cloud.length; i += 3) { x0 = Math.min(x0, cloud[i]!); x1 = Math.max(x1, cloud[i]!) }
  carMetrics.cloud = cloud
  carMetrics.L = Number.isFinite(x1 - x0) && x1 > x0 ? x1 - x0 : 4.8
  carMetrics.version++
}

export interface Projection {
  footprintX: number; footprintY: number      // fractions of scene width / height, from top-left, after lens shift
  widthFrac: number; heightFrac: number
  left: number; right: number; top: number; bottom: number
  horizonY: number
}

export interface CameraPose { polarDeg: number; azimuthDeg: number; distance: number; targetY: number; shiftX: number; shiftY: number }

export interface Fit extends CameraPose {
  L: number; aspect: number; fovDeg: number; near: number; far: number
  limits: { polarMinDeg: number; polarMaxDeg: number; distMin: number; distMax: number }
  achieved: Projection
  /** seed camera of the spec (polar 78, target 0.16L), distance solved for width 52%, with and without the lens shift */
  strict: { polarDeg: number; distance: number; withoutShift: Projection; withShift: Projection }
  feasible: boolean
  deviations: string[]
  gapToCard?: number
  widthTarget: number
}

const rad = (d: number) => (d * Math.PI) / 180

/** Camera basis for a pose, in our scene frame (+X forward, +Y up, -Z left). Azimuth 45 deg from the spec's +Z (head) towards its
 *  +X (left) is, in this frame, the direction (+cos45, ., -sin45): front-left of the car. */
function basis(polarDeg: number, azimuthDeg: number, d: number, ty: number) {
  const p = rad(polarDeg), a = rad(azimuthDeg)
  const dir = new THREE.Vector3(Math.sin(p) * Math.cos(a), Math.cos(p), -Math.sin(p) * Math.sin(a))
  const target = new THREE.Vector3(0, ty, 0)
  const pos = target.clone().addScaledVector(dir, d)
  const f = dir.clone().negate()
  const r = new THREE.Vector3(-f.z, 0, f.x).normalize()
  const u = new THREE.Vector3().crossVectors(r, f)
  return { pos, f, r, u }
}

/** Projects the car cloud, the footprint centre and the horizon. Shifts are added to the screen fractions (lens shift). */
export function project(pose: CameraPose, aspect: number, L: number, cloud: Float32Array): Projection {
  const { pos, f, r, u } = basis(pose.polarDeg, pose.azimuthDeg, pose.distance, pose.targetY)
  const th = Math.tan(rad(SPEC.fovDeg) / 2)
  const v = new THREE.Vector3()
  const toScreen = (x: number, y: number, z: number) => {
    v.set(x, y, z).sub(pos)
    const zc = v.dot(f)
    return zc > 1e-4 ? { sx: (v.dot(r) / (zc * th * aspect) + 1) / 2 + pose.shiftX, sy: (1 - v.dot(u) / (zc * th)) / 2 + pose.shiftY } : null
  }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (let i = 0; i < cloud.length; i += 3) {
    const s = toScreen(cloud[i]!, cloud[i + 1]!, cloud[i + 2]!)
    if (!s) continue
    left = Math.min(left, s.sx); right = Math.max(right, s.sx); top = Math.min(top, s.sy); bottom = Math.max(bottom, s.sy)
  }
  const fp = toScreen(0, 0, 0) ?? { sx: NaN, sy: NaN }
  // horizon: the vanishing line of the ground = a horizontal direction seen from the camera (point at infinity)
  const hd = new THREE.Vector3(f.x, 0, f.z).normalize()
  const hz = hd.dot(f), hy = hd.dot(u)
  const horizonY = (1 - hy / (hz * th)) / 2 + pose.shiftY
  void L
  return { footprintX: fp.sx, footprintY: fp.sy, widthFrac: right - left, heightFrac: bottom - top, left, right, top, bottom, horizonY }
}

/** Distance at which the projected car width equals `width` (bisection; width falls monotonically with distance). */
function solveDistance(polarDeg: number, ty: number, aspect: number, L: number, cloud: Float32Array, width: number, iters = 48) {
  let lo = 0.5 * L, hi = 12 * L
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    const w = project({ polarDeg, azimuthDeg: SPEC.azimuthDeg, distance: mid, targetY: ty, shiftX: 0, shiftY: 0 }, aspect, L, cloud).widthFrac
    if (w > width) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

function shiftsFor(pose: CameraPose, aspect: number, L: number, cloud: Float32Array) {
  const p0 = project({ ...pose, shiftX: 0, shiftY: 0 }, aspect, L, cloud)
  return { shiftX: SPEC.target.footprintX - p0.footprintX, shiftY: SPEC.target.footprintY - p0.footprintY, p0 }
}

/** Keeps the vertices that stick out furthest along 160 directions: enough to get the projected extent right, fast to scan. */
function reduceCloud(cloud: Float32Array): Float32Array {
  const dirs = 160, keep = new Set<number>()
  for (let k = 0; k < dirs; k++) {
    const y = 1 - (2 * (k + 0.5)) / dirs, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * k
    const dx = Math.cos(th) * r, dz = Math.sin(th) * r
    let bi = 0, bv = -Infinity
    for (let i = 0; i < cloud.length; i += 3) { const v = cloud[i]! * dx + cloud[i + 1]! * y + cloud[i + 2]! * dz; if (v > bv) { bv = v; bi = i } }
    keep.add(bi)
  }
  const out = new Float32Array(keep.size * 3); let j = 0
  for (const i of keep) { out[j++] = cloud[i]!; out[j++] = cloud[i + 1]!; out[j++] = cloud[i + 2]! }
  return out
}

/** Smallest distance (px) between the projected car vertices and a rectangle (the cabin card), scene pixel coordinates. */
export function gapToRect(pose: CameraPose, w: number, h: number, cloud: Float32Array, rect: Avoid): number {
  const aspect = w / Math.max(1, h)
  const { pos, f, r, u } = basis(pose.polarDeg, pose.azimuthDeg, pose.distance, pose.targetY)
  const th = Math.tan(rad(SPEC.fovDeg) / 2)
  const v = new THREE.Vector3()
  let best = Infinity
  for (let i = 0; i < cloud.length; i += 3) {
    v.set(cloud[i]!, cloud[i + 1]!, cloud[i + 2]!).sub(pos)
    const zc = v.dot(f)
    if (zc <= 1e-4) continue
    const x = ((v.dot(r) / (zc * th * aspect) + 1) / 2 + pose.shiftX) * w, y = ((1 - v.dot(u) / (zc * th)) / 2 + pose.shiftY) * h
    best = Math.min(best, Math.hypot(Math.max(0, rect.x - x, x - (rect.x + rect.w)), Math.max(0, rect.y - y, y - (rect.y + rect.h))))
  }
  return best
}

/** Rectangle the car silhouette must keep `gap` px away from (the cabin card), in scene pixels. */
export interface Avoid { x: number; y: number; w: number; h: number; gap: number }

export function solveStudioCamera(width: number, height: number, L: number, cloud: Float32Array, avoid?: Avoid): Fit {
  const aspect = width / Math.max(1, height)
  const ty = SPEC.seed.targetYL * L
  const T = SPEC.target
  const deviations: string[] = []

  // strict seed camera: polar 78, target 0.16L, distance solved for the width
  const sPolar = SPEC.seed.polarDeg
  const sd = solveDistance(sPolar, ty, aspect, L, cloud, T.width)
  const sPose: CameraPose = { polarDeg: sPolar, azimuthDeg: SPEC.azimuthDeg, distance: sd, targetY: ty, shiftX: 0, shiftY: 0 }
  const sSh = shiftsFor(sPose, aspect, L, cloud)

  // relaxed solution: the spec leaves target and distance to the solver, and polar may move inside the orbit interval. Scan polar and the
  // target height (0..0.16L), solve the distance for the width, and require footprint minus horizon = 0.32 (82% - 50%). Candidates that reach
  // it within 0.4% are ranked by closeness to the seed; if none does, the smallest error wins and the remainder is reported as a conflict.
  const small = reduceCloud(cloud)
  const wantSep = T.footprintY - T.horizon
  type Cand = { polar: number; ty: number; err: number; d: number; dist: number }
  let best: Cand | null = null
  for (let p = SPEC.polarMinDeg; p <= SPEC.polarMaxDeg + 1e-9; p += 0.5) {
    for (let k = 0; k <= 16; k++) {
      const t = ty * (k / 16)
      const d = solveDistance(p, t, aspect, L, small, T.width, 28)
      const pr = project({ polarDeg: p, azimuthDeg: SPEC.azimuthDeg, distance: d, targetY: t, shiftX: 0, shiftY: 0 }, aspect, L, small)
      const err = Math.abs(pr.footprintY - pr.horizonY - wantSep)
      const dist = ((p - sPolar) / 10) ** 2 + ((t - ty) / (0.16 * L)) ** 2
      const better = !best || (err < 0.004 && best.err < 0.004 ? dist < best.dist : err < best.err)
      if (better) best = { polar: p, ty: t, err, d, dist }
    }
  }
  const pick = best!
  const tyFinal = pick.ty
  let distance = solveDistance(pick.polar, tyFinal, aspect, L, cloud, T.width)
  const dMin = SPEC.distMinL * L, dMax = SPEC.distMaxL * L
  let clamped = false
  if (distance < dMin || distance > dMax) { distance = Math.min(dMax, Math.max(dMin, distance)); clamped = true }
  const poseAt = (d: number): CameraPose => {
    const p0: CameraPose = { polarDeg: pick.polar, azimuthDeg: SPEC.azimuthDeg, distance: d, targetY: tyFinal, shiftX: 0, shiftY: 0 }
    const sh = shiftsFor(p0, aspect, L, cloud)
    return { ...p0, shiftX: sh.shiftX, shiftY: sh.shiftY }
  }
  let pose = poseAt(distance)
  let achieved = project(pose, aspect, L, cloud)
  // §5: the clearance to the cabin card has priority over the width. The width may use its tolerance (52% -> 50%) to get the clearance;
  // below that the conflict is reported, the model is never distorted.
  let gap: number | undefined
  let widthTarget: number = T.width
  if (avoid) {
    gap = gapToRect(pose, width, height, cloud, avoid)
    const margin = 1                       // px: the cloud is a sample of the vertices, keep a little room
    for (let wt = T.width - 0.001; gap < avoid.gap + margin && wt >= T.width - SPEC.tol.width - 1e-9; wt -= 0.001) {
      const d = Math.min(dMax, Math.max(dMin, solveDistance(pick.polar, tyFinal, aspect, L, cloud, wt)))
      const cand = poseAt(d)
      widthTarget = wt; pose = cand; achieved = project(cand, aspect, L, cloud); gap = gapToRect(cand, width, height, cloud, avoid)
    }
    if (widthTarget < T.width - 1e-9) deviations.push(`width ${(achieved.widthFrac * 100).toFixed(1)}% (target 52%, tolerance 50-54%) to keep ${avoid.gap}px clear of the cabin card`)
    if (gap < avoid.gap) deviations.push(`CONFLICT: clearance to the cabin card is ${gap.toFixed(1)}px (< ${avoid.gap}px) even at the lowest width in tolerance`)
  }

  if (Math.abs(pick.polar - sPolar) > 0.01) deviations.push(`polar ${pick.polar.toFixed(2)} deg instead of the 78 deg seed (needed so the horizon-to-footprint separation can be 32% of the scene height)`)
  if (Math.abs(tyFinal - ty) > 1e-4) deviations.push(`target height ${(tyFinal / L).toFixed(3)}L instead of the 0.16L seed (the spec lets the solver move the target)`)
  if (Math.abs(pose.shiftX) > 1e-4 || Math.abs(pose.shiftY) > 1e-4) deviations.push(`lens shift (${(pose.shiftX * 100).toFixed(1)}%, ${(pose.shiftY * 100).toFixed(1)}%) of the scene via setViewOffset: not named in the spec`)
  if (clamped) deviations.push(`distance clamped to the orbit interval ${SPEC.distMinL}L..${SPEC.distMaxL}L, so the width target is not reached`)

  const feasible = !clamped
    && Math.abs(achieved.footprintX - T.footprintX) <= SPEC.tol.footprint && Math.abs(achieved.footprintY - T.footprintY) <= SPEC.tol.footprint
    && Math.abs(achieved.widthFrac - T.width) <= SPEC.tol.width && Math.abs(achieved.horizonY - T.horizon) <= SPEC.tol.horizon

  return {
    ...pose, L, aspect, fovDeg: SPEC.fovDeg, near: SPEC.nearL * L, far: SPEC.farL * L,
    limits: { polarMinDeg: SPEC.polarMinDeg, polarMaxDeg: SPEC.polarMaxDeg, distMin: dMin, distMax: dMax },
    achieved,
    strict: {
      polarDeg: sPolar, distance: sd,
      withoutShift: sSh.p0,
      withShift: project({ ...sPose, shiftX: sSh.shiftX, shiftY: sSh.shiftY }, aspect, L, cloud),
    },
    feasible: feasible && (gap === undefined || avoid === undefined || gap >= avoid.gap), deviations, gapToCard: gap, widthTarget,
  }
}

/** Camera position for a pose (orbit presets reuse the fitted distance and target). */
export function poseToPosition(polarDeg: number, azimuthDeg: number, d: number, ty: number): [number, number, number] {
  const { pos } = basis(polarDeg, azimuthDeg, d, ty)
  return [pos.x, pos.y, pos.z]
}
