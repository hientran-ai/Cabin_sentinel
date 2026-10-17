import { Component, Suspense, memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi, useT, type CarView } from '../../../store/uiStore'
import { BRANDS } from '../../../lib/vehicleSimulation'
import type { BrandSpec, DoorId, WindowState } from '../../../types/vehicle'
import { GlbCar, GLB_ANCHORS, glbOffset } from './GlbCar'
import { Environment3D, type Backdrop } from './StudioScene'
import { CustomCar, useCustomCar } from './CustomCar'
import { SPEC, carMetrics, poseToPosition, publishBox, solveStudioCamera, type Avoid, type Fit } from './studioCamera'
import { doorShape, extrude, hoodShape, layoutOf, lowerProfile, trunkShape, upperProfile, windowShape } from './carGeometry'

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** Frame-rate independent ease toward a target. */
const ease = (cur: number, target: number, dt: number, speed = 7) => (reduceMotion() ? target : cur + (target - cur) * (1 - Math.exp(-speed * dt)))

// Studio camera (V6 §7): the default pose is solved from the geometry in studioCamera.ts. Presets other than the default reuse the fitted
// target and distance and only change the angles (polar deg, azimuth deg from +Z of the spec towards its +X).
const PRESETS: Record<CarView, [number, number]> = { threeQuarter: [NaN, SPEC.azimuthDeg], side: [SPEC.polarMaxDeg, 90], top: [SPEC.polarMinDeg, SPEC.azimuthDeg], rear: [SPEC.seed.polarDeg, 150] }
// ADAS illustration: behind and above the car, looking down the road. Fixed; not interactive.
const ADAS_CAM = { position: [-9.2, 3.1, 0] as [number, number, number], target: [4, 0.9, 0] as [number, number, number], fov: 40 }

const WINDOW_DROP: Record<WindowState, number> = { closed: 0, vent: 0.07, open: 0.42 }

function useMaterials(spec: BrandSpec, paint: string, dark: boolean) {
  const color = spec.paints.find((p) => p.id === paint)?.color ?? spec.paints[0]!.color
  const body = useMemo(() => new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.15 }), [])
  useEffect(() => { body.color.set(color) }, [body, color])
  return useMemo(() => ({
    body,
    glass: new THREE.MeshPhysicalMaterial({ color: '#0d1217', metalness: 0.3, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6 }),
    trim: new THREE.MeshStandardMaterial({ color: '#16181b', metalness: 0.2, roughness: 0.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: dark ? '#9aa1a8' : '#b8bec4', metalness: 0.85, roughness: 0.28 }),
    aero: new THREE.MeshStandardMaterial({ color: '#3a3f45', metalness: 0.5, roughness: 0.35 }),
    seam: new THREE.MeshBasicMaterial({ color: '#0a0b0c' }),
    head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f1ff', emissiveIntensity: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ color: '#5a0a10', emissive: '#ff2030', emissiveIntensity: 0.4 }),
    port: new THREE.MeshStandardMaterial({ color: '#1b1d20', emissive: '#2c6bed', emissiveIntensity: 0 }),
  }), [body, dark])
}

function Wheel({ x, z, r, spec, mats, spin }: { x: number; z: number; r: number; spec: BrandSpec; mats: ReturnType<typeof useMaterials>; spin: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => { if (g.current) g.current.rotation.z = -spin.current })
  const side = Math.sign(z)
  return (
    <group position={[x, r, z]}>
      <group ref={g}>
        <mesh material={mats.tyre} rotation-x={Math.PI / 2}><cylinderGeometry args={[r, r, 0.25, 40]} /></mesh>
        <mesh material={spec.id === 'tesla' ? mats.aero : mats.rim} position-z={side * 0.128} rotation-x={Math.PI / 2}><cylinderGeometry args={[r * 0.7, r * 0.7, 0.012, 36]} /></mesh>
        {spec.id === 'vinfast'
          ? [0, 1, 2, 3, 4].map((i) => <mesh key={i} material={mats.trim} position-z={side * 0.136} rotation-z={(i * Math.PI * 2) / 5}><boxGeometry args={[0.04, r * 1.25, 0.008]} /></mesh>)
          : <mesh material={mats.rim} position-z={side * 0.136} rotation-x={Math.PI / 2}><torusGeometry args={[r * 0.55, 0.012, 8, 40]} /></mesh>}
      </group>
    </group>
  )
}

function Door({ id, spec, mats, geo, x0, x1, side, belt, open, window }: {
  id: DoorId; spec: BrandSpec; mats: ReturnType<typeof useMaterials>; geo: { skin: THREE.BufferGeometry; pane: THREE.BufferGeometry }
  x0: number; x1: number; side: 1 | -1; belt: number; open: boolean; window: WindowState
}) {
  const hinge = useRef<THREE.Group>(null), pane = useRef<THREE.Mesh>(null)
  const toggleDoor = useVehicle((s) => s.toggleDoor)
  const W = spec.width, Wg = W * 0.8
  const zSkin = side * (W / 2 + 0.004), zPane = side * (Wg / 2 + 0.036) - zSkin
  useFrame((_, dt) => {
    if (hinge.current) hinge.current.rotation.y = ease(hinge.current.rotation.y, open ? side * 1.0 : 0, dt, 6)
    if (pane.current) pane.current.position.y = ease(pane.current.position.y, -WINDOW_DROP[window], dt, 4)
  })
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); toggleDoor(id) }
  return (
    <group ref={hinge} position={[x0, 0, zSkin]}>
      <mesh geometry={geo.skin} material={mats.body} position={[-x0, 0, side * 0.015]} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')} />
      <mesh ref={pane} geometry={geo.pane} material={mats.glass} position={[-x0, 0, zPane]} />
      <mesh material={mats.trim} position={[x1 - x0 + 0.2, belt - 0.12, side * 0.035]}><boxGeometry args={[0.12, 0.025, 0.02]} /></mesh>
    </group>
  )
}

function CarModel({ spec }: { spec: BrandSpec }) {
  const L = useMemo(() => layoutOf(spec), [spec])
  const dark = document.documentElement.dataset.mode === 'dark'
  const paint = useUi((s) => s.paint[spec.id])
  const mats = useMaterials(spec, paint, dark)
  const v = useVehicle()
  const W = spec.width, Wg = W * 0.8
  const geo = useMemo(() => ({
    lower: extrude(lowerProfile(spec, L), W - 0.24, 0.12, 6),
    upper: extrude(upperProfile(spec, L), Wg - 0.1, 0.08, 5),
    hood: extrude(hoodShape(spec, L), W * 0.82, 0.01, 1),
    trunk: extrude(trunkShape(spec, L), W * (spec.bodyStyle === 'sedan' ? 0.8 : 0.84), 0.012, 1),
    doors: {
      front: { skin: extrude(doorShape(L, L.frontDoor[0], L.frontDoor[1], false), 0.03, 0.012, 2), pane: extrude(windowShape(spec, L, L.frontDoor[0], L.frontDoor[1]), 0.01, 0.004, 1) },
      rear: { skin: extrude(doorShape(L, L.rearDoor[0], L.rearDoor[1], true), 0.03, 0.012, 2), pane: extrude(windowShape(spec, L, L.rearDoor[0], L.rearDoor[1]), 0.01, 0.004, 1) },
    },
  }), [spec, L, W, Wg])
  useEffect(() => () => {
    for (const g of [geo.lower, geo.upper, geo.hood, geo.trunk, geo.doors.front.skin, geo.doors.front.pane, geo.doors.rear.skin, geo.doors.rear.pane]) g.dispose()
  }, [geo])

  useEffect(() => { publishBox(spec.length, spec.width, spec.height) }, [spec])
  const root = useRef<THREE.Group>(null), hood = useRef<THREE.Group>(null), trunk = useRef<THREE.Group>(null), flap = useRef<THREE.Group>(null)
  const spin = useRef(0)
  const born = useRef(performance.now())
  useFrame((_, dt) => {
    const s = useVehicle.getState()
    spin.current += ((s.speed / 3.6) / L.wheelR) * dt * (s.gear === 'R' ? -1 : 1)
    if (hood.current) hood.current.rotation.z = ease(hood.current.rotation.z, s.frontTrunkOpen ? 0.95 : 0, dt, 5)
    if (trunk.current) trunk.current.rotation.z = ease(trunk.current.rotation.z, s.rearTrunkOpen ? (spec.bodyStyle === 'sedan' ? -1.15 : -1.35) : 0, dt, 5)
    if (flap.current) flap.current.rotation.y = ease(flap.current.rotation.y, s.chargingPortOpen ? -1.7 : 0, dt, 8)
    // entrance: settle in from a slight turn
    if (root.current) {
      const t = Math.min(1, (performance.now() - born.current) / 900)
      const k = reduceMotion() ? 1 : 1 - (1 - t) ** 3
      root.current.rotation.y = (1 - k) * 0.55
      root.current.position.y = (1 - k) * -0.08
    }
    const lit = s.headlights === 'on' || (s.headlights === 'auto' && document.documentElement.dataset.mode === 'dark')
    mats.head.emissiveIntensity = ease(mats.head.emissiveIntensity, lit ? 2.6 : 0.35, dt, 6)
    mats.tail.emissiveIntensity = ease(mats.tail.emissiveIntensity, lit || s.gear === 'R' ? 1.8 : 0.4, dt, 6)
    mats.port.emissiveIntensity = ease(mats.port.emissiveIntensity, s.charging === 'charging' ? 2 + Math.sin(performance.now() / 300) : s.chargingPortOpen ? 0.6 : 0, dt, 8)
  })
  const half = spec.length / 2
  const click = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); fn() }
  const hover = { onPointerOver: () => (document.body.style.cursor = 'pointer'), onPointerOut: () => (document.body.style.cursor = '') }
  const lightZ = spec.id === 'tesla' ? [-W * 0.36, W * 0.36] : []
  return (
    <group ref={root}>
      <mesh geometry={geo.lower} material={mats.body} />
      <mesh geometry={geo.upper} material={mats.glass} />
      {spec.bodyStyle === 'suv' && <mesh material={mats.body} position={[-0.25, spec.height - 0.02, 0]}><boxGeometry args={[spec.length * 0.62, 0.035, Wg * 0.86]} /></mesh>}
      {spec.bodyStyle === 'suv' && <mesh material={mats.trim} position={[0, spec.rideHeight + 0.2, 0]}><boxGeometry args={[spec.length * 0.98, 0.12, W + 0.01]} /></mesh>}
      {/* door seams */}
      {[L.frontDoor[0], L.frontDoor[1], L.rearDoor[1]].map((x) => [-1, 1].map((sd) => (
        <mesh key={`${x}${sd}`} material={mats.seam} position={[x + 0.004, (L.belt + L.doorBottom) / 2, sd * (W / 2 + 0.006)]}><boxGeometry args={[0.006, L.belt - L.doorBottom - 0.02, 0.002]} /></mesh>)))}
      <Door id="frontLeft" spec={spec} mats={mats} geo={geo.doors.front} x0={L.frontDoor[0]} x1={L.frontDoor[1]} side={-1} belt={L.belt} open={v.doors.frontLeft} window={v.windows.frontLeft} />
      <Door id="rearLeft" spec={spec} mats={mats} geo={geo.doors.rear} x0={L.rearDoor[0]} x1={L.rearDoor[1]} side={-1} belt={L.belt} open={v.doors.rearLeft} window={v.windows.rearLeft} />
      <Door id="frontRight" spec={spec} mats={mats} geo={geo.doors.front} x0={L.frontDoor[0]} x1={L.frontDoor[1]} side={1} belt={L.belt} open={v.doors.frontRight} window={v.windows.frontRight} />
      <Door id="rearRight" spec={spec} mats={mats} geo={geo.doors.rear} x0={L.rearDoor[0]} x1={L.rearDoor[1]} side={1} belt={L.belt} open={v.doors.rearRight} window={v.windows.rearRight} />
      <group ref={hood} position={[L.hoodStart, L.belt, 0]}>
        <mesh geometry={geo.hood} material={mats.body} position={[-L.hoodStart, -L.belt + 0.012, 0]} onClick={click(v.toggleFrunk)} {...hover} />
      </group>
      <group ref={trunk} position={[L.trunkPivot[0], L.trunkPivot[1], 0]}>
        <mesh geometry={geo.trunk} material={spec.bodyStyle === 'sedan' ? mats.body : mats.glass} onClick={click(v.toggleTrunk)} {...hover} />
      </group>
      <group ref={flap} position={[L.chargePort[0] + 0.07, L.chargePort[1], -(W / 2 + 0.008)]}>
        <mesh material={mats.body} position={[-0.07, 0, -0.004]} onClick={click(v.toggleChargePort)} {...hover}><boxGeometry args={[0.14, 0.11, 0.012]} /></mesh>
      </group>
      <mesh material={mats.port} position={[L.chargePort[0], L.chargePort[1], -(W / 2 + 0.001)]}><boxGeometry args={[0.1, 0.08, 0.004]} /></mesh>
      {/* lights */}
      {lightZ.length ? lightZ.map((z) => <mesh key={z} material={mats.head} position={[half - 0.12, 0.66, z]} rotation-y={z > 0 ? 0.35 : -0.35}><boxGeometry args={[0.04, 0.045, 0.34]} /></mesh>)
        : <><mesh material={mats.head} position={[half - 0.03, 0.9, 0]}><boxGeometry args={[0.03, 0.03, W * 0.9]} /></mesh>
          <mesh material={mats.head} position={[half - 0.06, 0.82, 0]} rotation-x={0}><boxGeometry args={[0.03, 0.02, 0.5]} /></mesh></>}
      {spec.id === 'tesla' ? [-W * 0.38, W * 0.38].map((z) => <mesh key={z} material={mats.tail} position={[-half + 0.05, 0.86, z]}><boxGeometry args={[0.04, 0.06, 0.32]} /></mesh>)
        : <mesh material={mats.tail} position={[-half + 0.02, 1.0, 0]}><boxGeometry args={[0.03, 0.035, W * 0.92]} /></mesh>}
      {[[L.frontAxle, -1], [L.frontAxle, 1], [L.rearAxle, -1], [L.rearAxle, 1]].map(([x, sd]) => (
        <Wheel key={`${x}${sd}`} x={x!} z={sd! * (W / 2 - 0.16)} r={L.wheelR} spec={spec} mats={mats} spin={spin} />))}
      <LabelProjector spec={spec} glb={false} />
    </group>
  )
}

// ---- Layer 4: state labels. Plain DOM buttons over the canvas (no extra React roots); a projector inside the scene
// moves them every frame to follow their anchor on the car.
type LabelId = 'frunk' | 'trunk' | 'lock' | 'port' | DoorId
const labelEls = new Map<LabelId, HTMLElement>()

function anchorsOf(spec: BrandSpec): Record<LabelId, [number, number, number]> {
  const L = layoutOf(spec), half = spec.length / 2, W = spec.width
  const door = (x0: number, x1: number, side: number): [number, number, number] => [(x0 + x1) / 2, L.belt - 0.15, side * (W / 2 + 0.55)]
  return {
    frunk: [half - 0.5, L.belt + 0.3, 0], trunk: [L.trunkTail + 0.25, spec.height + 0.1, 0], lock: [0, spec.height + 0.3, 0],
    port: [L.chargePort[0], L.chargePort[1] + 0.3, -(W / 2 + 0.45)],
    frontLeft: door(L.frontDoor[0], L.frontDoor[1], -1), rearLeft: door(L.rearDoor[0], L.rearDoor[1], -1),
    frontRight: door(L.frontDoor[0], L.frontDoor[1], 1), rearRight: door(L.rearDoor[0], L.rearDoor[1], 1),
  }
}

function LabelProjector({ spec, glb }: { spec: BrandSpec; glb: boolean }) {
  const anchor = useRef<THREE.Group>(null)
  const anchors = useMemo(() => (glb ? (GLB_ANCHORS as unknown as Record<LabelId, [number, number, number]>) : anchorsOf(spec)), [spec, glb])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const parent = anchor.current?.parent
    if (!parent) return
    for (const [id, el] of labelEls) {
      const a = anchors[id]
      tmp.set(a[0] + (glb ? glbOffset.x : 0), a[1] + (glb ? glbOffset.y : 0), a[2] + (glb ? glbOffset.z : 0))
      parent.localToWorld(tmp)
      tmp.project(camera)
      const x = ((tmp.x + 1) / 2) * size.width, y = ((1 - tmp.y) / 2) * size.height
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      el.style.visibility = tmp.z < 1 ? 'visible' : 'hidden'
    }
  })
  return <group ref={anchor} />
}

function CarLabels() {
  const t = useT()
  const v = useVehicle()
  const reg = (id: LabelId) => (el: HTMLElement | null) => { if (el) labelEls.set(id, el); else labelEls.delete(id) }
  const tag = (id: LabelId, text: string, on: () => void, cls = '') => (
    <button key={id} ref={reg(id)} type="button" className={`cx-3dlabel pointer-events-auto absolute left-0 top-0 ${cls}`} style={{ visibility: 'hidden' }} onClick={on}>{text}</button>
  )
  const doors: DoorId[] = ['frontLeft', 'rearLeft', 'frontRight', 'rearRight']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Labels appear only for a state worth noticing (something open or unlocked); a closed, locked car shows none. */}
      {v.frontTrunkOpen && tag('frunk', `${t('frunk')} · ${t('open')}`, v.toggleFrunk, 'is-open')}
      {v.rearTrunkOpen && tag('trunk', `${t('trunk')} · ${t('open')}`, v.toggleTrunk, 'is-open')}
      {(v.chargingPortOpen || v.charging !== 'disconnected') && tag('port', v.charging === 'charging' ? `${t('charging')} ${Math.round(v.batteryLevel)}%` : `${t('chargePort')} · ${t('open')}`, v.toggleChargePort, v.charging === 'charging' ? 'is-open' : '')}
      {doors.filter((d) => v.doors[d]).map((d) => tag(d, t('open'), () => v.toggleDoor(d), 'is-warn'))}
    </div>
  )
}

/** Test hook (dev server and ?debug=1 only): lets the browser tests place the camera and read the controls. */
function DevProbe() {
  const st = useThree()
  useEffect(() => { (window as unknown as { __three?: unknown }).__three = st }, [st])
  return null
}

const debugHooks = () => import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1'
const toRad = (d: number) => (d * Math.PI) / 180

/** Studio camera: solves the default pose from the geometry (studioCamera.ts) whenever the scene size or the car changes, applies the
 *  orbit limits of the spec and a lens shift (setViewOffset). Reset eases back to the fitted pose; the footprint never moves. */
function CameraRig({ variant }: { variant: 'studio' | 'adas' }) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const view = useUi((s) => s.carView), nonce = useUi((s) => s.carViewNonce)
  const fit = useRef<Fit | null>(null)
  const key = useRef('')
  const anim = useRef(true), touched = useRef(false), snap = useRef(true)
  useEffect(() => { anim.current = true; touched.current = false }, [view, nonce])
  useEffect(() => {
    if (variant !== 'adas') return
    const cam = camera as THREE.PerspectiveCamera
    cam.clearViewOffset(); cam.fov = ADAS_CAM.fov; cam.near = SPEC.nearL * carMetrics.L; cam.far = SPEC.farL * carMetrics.L
    cam.position.set(...ADAS_CAM.position); cam.lookAt(...ADAS_CAM.target); cam.updateProjectionMatrix()
  }, [camera, variant])
  useEffect(() => {
    if (!controls) return
    const stop = () => { anim.current = false; touched.current = true }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])
  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera
    if (variant === 'adas') {
      // The ADAS camera is fixed, but the cabin card must not sit on the car: if the tyres would end below the card, a lens shift
      // (no model or CSS transform) lifts the scene just enough to keep 16 px clear.
      const { width, height } = state.size
      const card = state.gl.domElement.closest('section')?.querySelector('[data-testid=cabin-card-wrap]')
      const top = card ? Math.round(card.getBoundingClientRect().y - state.gl.domElement.getBoundingClientRect().y) : -1
      const k = `${width}x${height}:${carMetrics.version}:${top}`
      if (k === key.current || !carMetrics.cloud.length) return
      key.current = k
      cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true)
      let shiftY = 0
      if (top > 0) {
        let bottom = -Infinity
        const v = new THREE.Vector3(), cl = carMetrics.cloud
        for (let i = 0; i < cl.length; i += 3) { v.set(cl[i]!, cl[i + 1]!, cl[i + 2]!).project(cam); bottom = Math.max(bottom, ((1 - v.y) / 2) * height) }
        if (bottom > top - 16) shiftY = (top - 16 - bottom) / height
      }
      if (shiftY) { cam.setViewOffset(width, height, 0, -shiftY * height, width, height); cam.updateProjectionMatrix() }
      return
    }
    const { width, height } = state.size
    // the cabin card (if the page has one over this scene) must stay clear of the car: V6 §5, >= 24 px (W >= 1600) or >= 16 px
    let avoid: Avoid | undefined
    const el = state.gl.domElement
    const card = el.closest('[data-testid=scene-parked]')?.querySelector('[data-testid=cabin-card-wrap]')
    if (card) {
      const c = card.getBoundingClientRect(), r = el.getBoundingClientRect()
      avoid = { x: Math.round(c.x - r.x), y: Math.round(c.y - r.y), w: Math.round(c.width), h: Math.round(c.height), gap: window.innerWidth >= 1600 ? 24 : 16 }
    }
    const k = `${width}x${height}:${carMetrics.version}:${avoid ? `${avoid.x},${avoid.y},${avoid.w},${avoid.h}` : ''}`
    if (k !== key.current && carMetrics.cloud.length) {
      key.current = k
      const f = solveStudioCamera(width, height, carMetrics.L, carMetrics.cloud, avoid)
      fit.current = f
      cam.fov = f.fovDeg; cam.near = f.near; cam.far = f.far
      cam.setViewOffset(width, height, -f.shiftX * width, -f.shiftY * height, width, height)
      cam.updateProjectionMatrix()
      if (controls) {
        controls.minDistance = f.limits.distMin; controls.maxDistance = f.limits.distMax
        controls.minPolarAngle = toRad(f.limits.polarMinDeg); controls.maxPolarAngle = toRad(f.limits.polarMaxDeg)
        controls.target.set(0, f.targetY, 0)
      }
      if (!touched.current) { anim.current = true; snap.current = true }
      if (debugHooks()) (window as unknown as { __fit?: Fit }).__fit = f
    }
    const f = fit.current
    if (!f || !controls || variant !== 'studio' || !anim.current) return
    const [polar, az] = PRESETS[view]
    const target = new THREE.Vector3(...poseToPosition(Number.isNaN(polar) ? f.polarDeg : polar, az, f.distance, f.targetY))
    const kk = snap.current || reduceMotion() ? 1 : 1 - Math.exp(-6 * dt)
    camera.position.lerp(target, kk)
    controls.update()
    if (camera.position.distanceTo(target) < 0.001 * f.L) { camera.position.copy(target); controls.update(); anim.current = false; snap.current = false }
  })
  return null
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('[car] GLB failed, using the built-in model', e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

class GlBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// Checked once: creating a context per render leaked contexts (the panel re-renders 10x per second).
let glOk: boolean | null = null
function webglAvailable() {
  if (glOk != null) return glOk
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    glOk = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { glOk = false }
  return glOk
}

/** The car scene. `backdrop`: 'sky' = parked studio (sky dome + ground), 'adas' = illustrative road (fixed camera, not interactive),
 *  'none' = transparent canvas with only the car's shadow (settings page). */
export const Vehicle3D = memo(function Vehicle3D({ backdrop = 'none' }: { backdrop?: Backdrop }) {
  const brand = useVehicle((s) => s.brand)
  const mode = useUi((s) => s.appearance)
  const view = useUi((s) => s.carView)
  const spec = BRANDS[brand]
  const t = useT()
  const custom = useCustomCar()
  const adas = backdrop === 'adas'
  const fallback = <div className="grid h-full place-items-center text-center text-sm text-text-2">{t('modelNote')}<br />WebGL không khả dụng trên máy này.</div>
  if (!webglAvailable()) return fallback
  return (
    <GlBoundary fallback={fallback}>
     <div className="relative h-full w-full">
      <Canvas dpr={[1, 2]} shadows="soft" camera={{ fov: SPEC.fovDeg, position: adas ? ADAS_CAM.position : poseToPosition(SPEC.seed.polarDeg, SPEC.azimuthDeg, SPEC.seed.distanceL * carMetrics.L, SPEC.seed.targetYL * carMetrics.L), near: 0.05, far: 500 }}
        gl={{ antialias: true, alpha: backdrop === 'none', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, outputColorSpace: THREE.SRGBColorSpace }}
        onPointerMissed={() => (document.body.style.cursor = '')} aria-label={spec.model}>
        <Suspense fallback={null}>
          {/* studio: long soft strips give the clean highlight lines along the body that car viewers use */}
          <Environment resolution={512} frames={1} environmentIntensity={0.5}>
            <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 4, 1]} />
            {[-3, 0, 3].map((x) => <Lightformer key={x} form="rect" intensity={1.3} position={[x, 4, -6]} scale={[1.2, 8, 1]} />)}
            <Lightformer form="rect" intensity={1.2} position={[-7, 1.5, 0]} rotation-y={Math.PI / 2} scale={[16, 1.2, 1]} />
            <Lightformer form="rect" intensity={1.2} position={[7, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[16, 1.2, 1]} />
          </Environment>
          <Environment3D kind={backdrop} />
          <ModelBoundary fallback={<CarModel key={`${brand}-${mode}`} spec={spec} />}>
            {custom === undefined ? null : custom ? <><CustomCar info={custom} />{!adas && <LabelProjector spec={spec} glb={false} />}</> : <><GlbCar />{!adas && <LabelProjector spec={spec} glb />}</>}
          </ModelBoundary>
        </Suspense>
        {!adas && <OrbitControls makeDefault enableDamping={false} enablePan={false} autoRotate={false} rotateSpeed={0.7} />}
        <CameraRig variant={adas ? 'adas' : 'studio'} />
        {(import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1') && <DevProbe />}
      </Canvas>
      {!adas && <CarLabels />}
      {!adas && (
        <button type="button" aria-label="Đặt lại góc nhìn" title="Đặt lại góc nhìn" onClick={() => useUi.getState().resetCarView(view)}
          className="su-glass absolute bottom-[1rem] right-[1rem] z-10 grid h-[3.5rem] w-[3.5rem] place-items-center rounded-full text-[var(--cx-text)]"><ArrowCounterClockwise size="1.9rem" weight="bold" /></button>)}
     </div>
    </GlBoundary>
  )
})
