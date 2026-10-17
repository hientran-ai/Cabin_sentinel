// Real car: "Car Concept" by Khronos Group (CC-BY 4.0), loaded from public/models. The model ships with the doors,
// hood and rear hatch as separate, pre-pivoted nodes, so they really open. It is a 2-door concept car with no
// charge flap: rear-door and charge-port state show as labels only.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi } from '../../../store/uiStore'
import { BRANDS } from '../../../lib/vehicleSimulation'
import type { Brand, WindowState } from '../../../types/vehicle'
import { publishCar } from './studioCamera'

export const MODEL_URL = `${import.meta.env.BASE_URL}models/CarConcept.glb`
export const MODEL_CREDIT = 'Car Concept · Khronos Group · CC-BY 4.0'
const WIN_DROP: Record<WindowState, number> = { closed: 0, vent: 0.04, open: 0.3 }
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (cur: number, target: number, dt: number, k = 6) => (reduce() ? target : cur + (target - cur) * (1 - Math.exp(-k * dt)))

/** Where labels sit, in the same frame as the procedural car (front = +X, up = +Y, left = -Z). */
export const GLB_ANCHORS = {
  frunk: [2.05, 0.95, 0], trunk: [-2.0, 1.25, 0], lock: [0, 1.7, 0], port: [-1.7, 0.7, -1.3],
  frontLeft: [0.5, 0.95, -1.55], rearLeft: [-0.9, 0.95, -1.55], frontRight: [0.5, 0.95, 1.55], rearRight: [-0.9, 0.95, 1.55],
} as const

// Paint colours for the shared body materials (the model's own materials are renamed "Paint 1/2 ...")
function paintColor(brand: Brand, id: string) { return BRANDS[brand].paints.find((p) => p.id === id)?.color ?? BRANDS[brand].paints[0]!.color }

/** Move a node's pivot: returns a group placed at `pivotLocal` (in the node's parent space) that now holds the node. */
function repivot(node: THREE.Object3D, pivotLocal: THREE.Vector3): THREE.Group {
  const parent = node.parent!
  const g = new THREE.Group()
  g.name = `${node.name}-pivot`
  g.position.copy(pivotLocal)
  parent.add(g)
  node.position.sub(pivotLocal)
  g.add(node)
  return g
}

/** Offset that puts the car on the ground and its pivot in the middle of the footprint. It is measured once, from the tyres' real
 *  vertices at rest (doors shut, wheels unspun). Never from the whole-scene bounding box and never per frame, so opening a door or
 *  spinning a wheel cannot move the car. Labels read it too. */
export const glbOffset = { x: 0, y: 0, z: 0 }

function measureFootprint(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  let minY = Infinity
  const perWheel: number[] = [], cx: number[] = [], cz: number[] = []
  for (const name of ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']) {
    const wheel = scene.getObjectByName(name)
    if (!wheel) continue
    let y = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    wheel.traverse((o) => {
      const m = o as THREE.Mesh
      const pos = m.isMesh ? m.geometry.getAttribute('position') : null
      if (!pos) return
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        y = Math.min(y, v.y); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
      }
    })
    if (Number.isFinite(y)) { perWheel.push(y); minY = Math.min(minY, y); cx.push((x0 + x1) / 2); cz.push((z0 + z1) / 2) }
  }
  if (!perWheel.length) return null
  const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length
  return { groundY: minY, spread: Math.max(...perWheel) - minY, centreX: mean(cx), centreZ: mean(cz) }
}

export function GlbCar() {
  const gltf = useGLTF(MODEL_URL, false, false)
  const { scene, offset } = useMemo(() => {
    const sc = gltf.scene.clone(true)
    sc.rotation.y = Math.PI / 2                       // model faces +Z, the scene uses +X as forward
    const f = measureFootprint(sc)
    const off: [number, number, number] = f ? [-f.centreX, -f.groundY, -f.centreZ] : [0, 0, 0]
    glbOffset.x = off[0]; glbOffset.y = off[1]; glbOffset.z = off[2]
    if (import.meta.env.DEV && f) (window as unknown as { __carGround?: unknown }).__carGround = { ...f, offset: off }
    publishCar(sc, new THREE.Vector3(...off))          // the camera fit (studioCamera.ts) uses the real vertices at rest
    return { scene: sc, offset: off }
  }, [gltf.scene])
  const brand = useVehicle((s) => s.brand)
  const paint = useUi((s) => s.paint[brand])
  const parts = useRef<{ doorL?: THREE.Object3D; doorR?: THREE.Object3D; hood?: THREE.Object3D; hatch?: THREE.Object3D; wheels: THREE.Object3D[]; windows: Record<string, THREE.Object3D | undefined>; lights: THREE.MeshStandardMaterial[] }>({ wheels: [], windows: {}, lights: [] })
  const paintMats = useRef<THREE.MeshStandardMaterial[]>([])

  // one-time setup: find parts, fix pivots, collect materials
  useEffect(() => {
    const find = (n: string) => scene.getObjectByName(n)
    const doorL = find('BodyDoorLColor1'), doorR = find('BodyDoorRColor1')
    const hood = find('BodyHood'), hatch = find('BodyRearPanelsColor1')
    const p = parts.current
    p.doorL = doorL ?? undefined; p.doorR = doorR ?? undefined
    // hood hinges at its rear edge (the node origin is the front edge)
    if (hood && !hood.name.endsWith('-pivot')) {
      const pivot = new THREE.Vector3(hood.position.x, hood.position.y + 1.18, hood.position.z)
      p.hood = repivot(hood, pivot)
    }
    // rear hatch hinges at its forward-top edge
    if (hatch) p.hatch = repivot(hatch, new THREE.Vector3(hatch.position.x, hatch.position.y - 0.05, hatch.position.z + 0.55))
    p.windows = { frontLeft: find('BodyDoorLWindow') ?? undefined, frontRight: find('BodyDoorRWindow') ?? undefined }
    p.wheels = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'].map(find).filter(Boolean) as THREE.Object3D[]
    const pm: THREE.MeshStandardMaterial[] = [], lights: THREE.MeshStandardMaterial[] = []
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!(o as THREE.Mesh).isMesh || !m) return
      ;(o as THREE.Mesh).castShadow = !(m as THREE.MeshPhysicalMaterial).transmission
      if (/^Paint/.test(m.name) && !pm.includes(m)) {
        // Documented deviation from "keep model materials" (V6 §7): only the metallic-flake normal/roughness maps are dropped, because they
        // read as a pitted body on screen. Metalness, roughness and clearcoat stay as the model ships them.
        const ph = m as THREE.MeshPhysicalMaterial
        ph.normalMap = null; ph.roughnessMap = null
        ph.needsUpdate = true
        pm.push(m)
      }
      if (/^(Headlight|Brakelight|Signallight)/.test(m.name) && !lights.includes(m)) { m.emissive = m.emissive ?? new THREE.Color(); lights.push(m) }
    })
    paintMats.current = pm; p.lights = lights
    if (import.meta.env.DEV) (window as unknown as { __car: THREE.Object3D }).__car = scene
  }, [scene])

  useEffect(() => { const c = new THREE.Color(paintColor(brand, paint)); for (const m of paintMats.current) m.color.copy(c) }, [brand, paint, scene])

  useFrame((_, dt) => {
    const s = useVehicle.getState(), p = parts.current
    // doors swing outward about the vertical (local Z) hinge; hood and hatch about the X axis
    if (p.doorL) p.doorL.rotation.z = ease(p.doorL.rotation.z, s.doors.frontLeft ? -1.05 : 0, dt)
    if (p.doorR) p.doorR.rotation.z = ease(p.doorR.rotation.z, s.doors.frontRight ? 1.05 : 0, dt)
    if (p.hood) p.hood.rotation.x = ease(p.hood.rotation.x, s.frontTrunkOpen ? -0.95 : 0, dt, 5)
    if (p.hatch) p.hatch.rotation.x = ease(p.hatch.rotation.x, s.rearTrunkOpen ? 1.1 : 0, dt, 5)
    for (const [k, w] of Object.entries(p.windows)) {
      if (!w) continue
      w.userData.baseZ ??= w.position.z                               // the pane sits at its own offset inside the door
      w.position.z = ease(w.position.z, w.userData.baseZ - WIN_DROP[s.windows[k as 'frontLeft' | 'frontRight']], dt, 4)
    }
    const night = document.documentElement.dataset.mode === 'dark'
    const lit = s.headlights === 'on' || (s.headlights === 'auto' && night)
    for (const m of p.lights) {
      const target = /Headlight/.test(m.name) ? (lit ? 2.4 : 0.1) : /Brakelight/.test(m.name) ? (lit || s.gear === 'R' ? 1.6 : 0.15) : 0.1
      m.emissiveIntensity = ease(m.emissiveIntensity, target, dt, 6)
    }
  })

  // tapping a part toggles it, like touching the car on the real screen
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const p = parts.current, st = useVehicle.getState()
    let o: THREE.Object3D | null = e.object
    while (o) {
      if (o === p.doorL) { e.stopPropagation(); st.toggleDoor('frontLeft'); return }
      if (o === p.doorR) { e.stopPropagation(); st.toggleDoor('frontRight'); return }
      if (o === p.hood) { e.stopPropagation(); st.toggleFrunk(); return }
      if (o === p.hatch) { e.stopPropagation(); st.toggleTrunk(); return }
      o = o.parent
    }
  }
  const spin = useRef(0)
  useFrame((_, dt) => {
    const s = useVehicle.getState()
    spin.current += ((s.speed / 3.6) / 0.38) * dt * (s.gear === 'R' ? -1 : 1)
    for (const w of parts.current.wheels) for (const c of w.children) c.rotation.x = spin.current
  })
  // model faces +Z with Y up; the scene uses +X as "forward", so turn it a quarter
  return <group position={offset}><primitive object={scene} onClick={onClick} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')} /></group>
}

useGLTF.preload(MODEL_URL, false, false)
