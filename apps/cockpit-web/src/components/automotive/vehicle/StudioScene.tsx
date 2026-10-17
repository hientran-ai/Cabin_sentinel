// HMI V6 §6-§8: environment of the car. The background is a screen-space sky/ground gradient anchored to the camera's true horizon
// (computed every frame from the camera, so it follows orbit and lens shift), the ground only receives the car's real shadow, and
// the lights follow the spec's preset scaled by the car length L. No fog, no stars, no grid, no blob shadow, no bloom.
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ADAS_FIXTURE } from './adasFixture'
import { carMetrics } from './studioCamera'

export type Backdrop = 'none' | 'sky' | 'adas'

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const glsl = (h: string) => { const [r, g, b] = hex(h); return `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})` }

// §6: stops by scene height at the default angle (0 = top of the scene, 0.5 = horizon).
const SKY_STOPS: [number, string][] = [[0, '#101A2B'], [0.28, '#253A50'], [0.44, '#566C7C'], [0.5, '#85939E']]
const GROUND_STOPS: [number, string][] = [[0.5, '#85939E'], [0.68, '#566678'], [1, '#263342']]

const stopsGlsl = (name: string, s: [number, string][]) => `vec3 ${name}(float u){
  ${s.slice(1).map(([t, c], i) => `${i ? 'else ' : ''}if (u <= ${t.toFixed(3)}) return mix(${glsl(s[i]![1])}, ${glsl(c)}, (u - ${s[i]![0].toFixed(3)}) / ${(t - s[i]![0]).toFixed(3)});`).join('\n  ')}
  return ${glsl(s[s.length - 1]![1])};
}`

const FRAGMENT = `uniform vec2 res; uniform float hor;
${stopsGlsl('skyCol', SKY_STOPS)}
${stopsGlsl('groundCol', GROUND_STOPS)}
void main(){
  vec2 p = vec2(gl_FragCoord.x / res.x, 1.0 - gl_FragCoord.y / res.y);
  float h = clamp(hor, 0.02, 0.98);
  // rows above the horizon map to 0..0.5, rows below to 0.5..1, so the gradient follows the horizon of the camera
  vec3 col = p.y < h ? skyCol(p.y / h * 0.5) : groundCol(0.5 + (p.y - h) / (1.0 - h) * 0.5);
  // light behind the car: centre (64%, 44%), radius (30% w, 22% h), #C7D9DF, 0.14 -> 0
  float g = max(0.0, 1.0 - length(vec2((p.x - 0.64) / 0.30, (p.y - 0.44) / 0.22)));
  col = mix(col, ${glsl('#C7D9DF')}, 0.14 * g);
  // the only lavender lobe: centre (20%, 47%), radius (25% w, 8% h), #857A9E, 0.06 -> 0
  float l = max(0.0, 1.0 - length(vec2((p.x - 0.20) / 0.25, (p.y - 0.47) / 0.08)));
  col = mix(col, ${glsl('#857A9E')}, 0.06 * l);
  // +-0.5/255 dither against banding
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`

/** Sky + ground as one gradient behind the scene. Values are written as sRGB straight to the framebuffer (no tone mapping), so the
 *  stops of the spec are reproduced exactly. `hor` is the horizon row measured on the camera, as a fraction of the scene height. */
function Backdrop2D() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false, fog: false,
    uniforms: { res: { value: new THREE.Vector2(1, 1) }, hor: { value: 0.5 } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAGMENT,
  }), [])
  const hd = useMemo(() => new THREE.Vector3(), [])
  const far = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, gl }) => {
    const cam = camera as THREE.PerspectiveCamera
    gl.getDrawingBufferSize(material.uniforms.res!.value as THREE.Vector2)
    // horizon = where a horizontal direction lands on screen (point at infinity), through the real projection matrix incl. lens shift
    cam.getWorldDirection(hd); hd.y = 0
    if (hd.lengthSq() < 1e-8) return
    hd.normalize()
    far.set(hd.x, 0, hd.z).applyMatrix4(cam.matrixWorldInverse.clone().setPosition(0, 0, 0))   // direction, w = 0
    const clip = new THREE.Vector4(far.x, far.y, far.z, 0).applyMatrix4(cam.projectionMatrix)
    material.uniforms.hor!.value = (1 - clip.y / clip.w) / 2
  })
  useEffect(() => () => material.dispose(), [material])
  return <mesh material={material} renderOrder={-100} frustumCulled={false}><planeGeometry args={[2, 2]} /></mesh>
}

/** The ground only shows what falls on it: the car's real, light-cast shadow. */
function ShadowGround({ L }: { L: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.003} receiveShadow renderOrder={2}>
      <planeGeometry args={[40 * L, 40 * L]} />
      <shadowMaterial opacity={0.5} transparent depthWrite={false} />
    </mesh>
  )
}

/** ADAS illustration: lane base #1A2733, cyan corridor (#63B8E8, alpha <= 0.12 near, 0 far), lane markers #C4D1DC alpha 0.45 and
 *  0.02L wide, exactly two static silhouettes. Same camera and ground as the car. Separate from perception and risk. */
function AdasRoad({ L }: { L: number }) {
  const f = ADAS_FIXTURE
  const fade = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1
    const ctx = cv.getContext('2d')!; const g = ctx.createLinearGradient(0, 0, 256, 0)
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#fff'); g.addColorStop(1, '#000')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 1); return new THREE.CanvasTexture(cv)
  }, [])
  const corridor = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64
    const ctx = cv.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 256, 0)                      // along the road: 0.12 near -> 0 far
    g.addColorStop(0, 'rgba(99,184,232,0.12)'); g.addColorStop(1, 'rgba(99,184,232,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 64)
    ctx.globalCompositeOperation = 'destination-in'
    const e = ctx.createLinearGradient(0, 0, 0, 64)                       // across: soft edges
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.18, 'rgba(0,0,0,1)'); e.addColorStop(0.82, 'rgba(0,0,0,1)'); e.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = e; ctx.fillRect(0, 0, 256, 64)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
  }, [])
  const x0 = -30, mid = f.road.length / 2 + x0
  const stripMid = (f.laneStrip.from + f.laneStrip.to) / 2, stripLen = f.laneStrip.to - f.laneStrip.from
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[mid, 0.001, 0]}>
        <planeGeometry args={[f.road.length, f.road.width]} /><meshBasicMaterial color="#1A2733" alphaMap={fade} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {f.laneLines.map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[mid, 0.002, z]}>
          <planeGeometry args={[f.road.length, 0.02 * L]} /><meshBasicMaterial color="#C4D1DC" opacity={0.45} alphaMap={fade} transparent depthWrite={false} toneMapped={false} />
        </mesh>))}
      <mesh rotation-x={-Math.PI / 2} position={[stripMid, 0.0025, 0]}>
        <planeGeometry args={[stripLen, f.laneStrip.halfWidth * 2]} /><meshBasicMaterial map={corridor} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {f.distantVehicles.map((v, i) => (
        <group key={i} position={[v.x, 0, v.z]}>
          <mesh position={[0, v.height * 0.32, 0]}><boxGeometry args={[v.length, v.height * 0.55, v.width]} /><meshBasicMaterial color="#0C131B" toneMapped={false} /></mesh>
          <mesh position={[-v.length * 0.05, v.height * 0.72, 0]}><boxGeometry args={[v.length * 0.55, v.height * 0.4, v.width * 0.86]} /><meshBasicMaterial color="#0F1821" toneMapped={false} /></mesh>
        </group>))}
    </>
  )
}

/** Re-renders when a new car has been measured (L is needed for the light positions). */
function useCarL() {
  const [L, setL] = useState(carMetrics.L)
  useFrame(() => { if (carMetrics.L !== L) setL(carMetrics.L) })
  return L
}

/** Everything around the car. `none` = transparent canvas with only the car's shadow (settings page etc.).
 *  Lights (§7), in the scene frame (+X forward, -Z left; the spec's +Z head / +X left is mapped to ours):
 *  key (-1.5L, 2L, 2L) -> (2L, 2L, +1.5L) #DCE9F2 2.0 with shadow; fill (1.5L, .7L, -L) -> (-L, .7L, -1.5L) #A6C1D8 0.6;
 *  hemisphere #C8D9E8 / #293543 0.4. Both directional lights target the footprint centre (the origin). */
export function Environment3D({ kind }: { kind: Backdrop }) {
  const L = useCarL()
  return (
    <>
      {kind !== 'none' && <Backdrop2D />}
      {kind === 'adas' && <AdasRoad L={L} />}
      <ShadowGround L={L} />
      <hemisphereLight args={['#C8D9E8', '#293543', 0.4]} />
      <directionalLight position={[2 * L, 2 * L, 1.5 * L]} color="#DCE9F2" intensity={2.0} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001}
        shadow-camera-near={0.5 * L} shadow-camera-far={6 * L} shadow-camera-left={-1.1 * L} shadow-camera-right={1.1 * L} shadow-camera-top={1.1 * L} shadow-camera-bottom={-1.1 * L} />
      <directionalLight position={[-L, 0.7 * L, -1.5 * L]} color="#A6C1D8" intensity={0.6} />
    </>
  )
}
