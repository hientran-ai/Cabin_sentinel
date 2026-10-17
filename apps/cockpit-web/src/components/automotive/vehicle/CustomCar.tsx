// Drop-in car model. Put a downloaded model in public/models/custom/ as either `car.glb` or the Sketchfab glTF export
// (`scene.gltf` + `scene.bin` + `textures/`), and optionally `car.json`:
//   { "credit": "Title · Author · CC BY 4.0 · link", "flip": false, "yaw": 0 }
// The model is scaled to 4.8 m long, centred and put on the ground; door nodes (name contains "door") open with the
// shared vehicle state; paint materials (name contains paint/body/carpaint/exterior) follow the paint colour.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useVehicle } from '../../../store/vehicleStore'
import { useUi } from '../../../store/uiStore'
import { BRANDS } from '../../../lib/vehicleSimulation'
import type { DoorId } from '../../../types/vehicle'
import { publishCar } from './studioCamera'

const BASE = `${import.meta.env.BASE_URL}models/custom/`
export interface CustomCarInfo { url: string; credit: string | null; flip: boolean; yaw: number }

let probe: Promise<CustomCarInfo | null> | null = null
/** Looks once for a model in public/models/custom/. Resolves null when there is none (the built-in car is used). */
export function findCustomCar(): Promise<CustomCarInfo | null> {
  probe ??= (async () => {
    const meta = await fetch(`${BASE}car.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Partial<CustomCarInfo>
    for (const name of ['car.glb', 'scene.gltf']) {
      const r = await fetch(BASE + name, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
      const type = r?.headers.get('content-type') ?? ''
      if (r?.ok && !type.includes('text/html')) return { url: BASE + name, credit: meta.credit ?? null, flip: !!meta.flip, yaw: meta.yaw ?? 0 }
    }
    return null
  })()
  return probe
}

export function useCustomCar() {
  const [info, setInfo] = useState<CustomCarInfo | null | undefined>(undefined)
  useEffect(() => { void findCustomCar().then(setInfo) }, [])
  return info
}

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (cur: number, target: number, dt: number, k = 6) => (reduce() ? target : cur + (target - cur) * (1 - Math.exp(-k * dt)))

interface DoorRig { pivot: THREE.Group; id: DoorId; sign: number }

export function CustomCar({ info }: { info: CustomCarInfo }) {
  const gltf = useGLTF(info.url)
  const brand = useVehicle((s) => s.brand)
  const paint = useUi((s) => s.paint[brand])
  const doors = useRef<DoorRig[]>([])
  const paints = useRef<THREE.MeshStandardMaterial[]>([])

  const root = useMemo(() => {
    const scene = gltf.scene.clone(true)
    const holder = new THREE.Group()
    holder.add(scene)
    // longest horizontal axis becomes X (our "forward"), then scale and ground it
    let box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    if (size.z > size.x) scene.rotation.y = Math.PI / 2
    scene.rotation.y += (info.flip ? Math.PI : 0) + (info.yaw * Math.PI) / 180
    scene.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(scene)
    const len = box.getSize(new THREE.Vector3()).x
    scene.scale.setScalar(4.8 / len)
    scene.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(scene)
    const c = box.getCenter(new THREE.Vector3())
    scene.position.set(scene.position.x - c.x, scene.position.y - box.min.y, scene.position.z - c.z)
    holder.updateMatrixWorld(true)

    // doors: hinge at the front edge of each door's bounding box, swinging outward
    const rigs: DoorRig[] = []
    const candidates: THREE.Object3D[] = []
    scene.traverse((o) => { if (/door/i.test(o.name) && !/handle|glass|window|mirror|trim|seal/i.test(o.name)) candidates.push(o) })
    const top = candidates.filter((o) => !candidates.some((p) => p !== o && isAncestor(p, o)))
    for (const node of top) {
      const b = new THREE.Box3().setFromObject(node)
      if (b.isEmpty()) continue
      const center = b.getCenter(new THREE.Vector3())
      const side = center.z >= 0 ? 1 : -1                          // +Z is the car's right in our frame
      const hingeWorld = new THREE.Vector3(b.max.x, center.y, side > 0 ? b.max.z : b.min.z)
      const parent = node.parent!
      const pivot = new THREE.Group()
      parent.worldToLocal(pivot.position.copy(hingeWorld))
      parent.add(pivot)
      pivot.updateMatrixWorld(true)
      pivot.attach(node)
      const id: DoorId = `${center.x > 0 ? 'front' : 'rear'}${side > 0 ? 'Right' : 'Left'}` as DoorId
      rigs.push({ pivot, id, sign: side })
    }
    doors.current = rigs
    const pm: THREE.MeshStandardMaterial[] = []
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!(o as THREE.Mesh).isMesh || !m) return
      if (/paint|body|carpaint|exterior/i.test(m.name) && !pm.includes(m)) {
        pm.push(m)                                           // V6 §7: the model keeps its own materials; only the colour follows the paint choice
      }
    })
    paints.current = pm
    publishCar(holder)
    return holder
  }, [gltf.scene, info.flip, info.yaw])

  useEffect(() => {
    const color = BRANDS[brand].paints.find((p) => p.id === paint)?.color
    if (color && paints.current.length) for (const m of paints.current) m.color.set(color)
  }, [brand, paint, root])

  useFrame((_, dt) => {
    const st = useVehicle.getState()
    for (const d of doors.current) d.pivot.rotation.y = ease(d.pivot.rotation.y, st.doors[d.id] ? d.sign * 1.0 : 0, dt)
  })
  return <primitive object={root} />
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D) { let p = b.parent; while (p) { if (p === a) return true; p = p.parent } return false }
