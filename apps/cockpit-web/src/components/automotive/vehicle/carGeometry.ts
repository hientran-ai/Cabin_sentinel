// Code-built car geometry (no downloaded model). Side profiles are extruded across the width; doors, lids and the
// charge flap are separate meshes so they can really move. Units: metres. +X front, +Y up, +Z right side.
import * as THREE from 'three'
import type { BrandSpec } from '../../../types/vehicle'

export interface CarLayout {
  frontAxle: number; rearAxle: number; wheelR: number; belt: number
  frontDoor: [number, number]; rearDoor: [number, number]   // x ranges (front edge, rear edge)
  doorBottom: number
  hoodStart: number; hoodFront: number
  trunkPivot: [number, number]; trunkTail: number
  chargePort: [number, number]
}

export function layoutOf(spec: BrandSpec): CarLayout {
  const half = spec.length / 2
  if (spec.bodyStyle === 'sedan') {
    return { frontAxle: half - 0.86, rearAxle: half - 0.86 - spec.wheelbase, wheelR: 0.34, belt: 0.98,
      frontDoor: [0.98, -0.12], rearDoor: [-0.12, -1.08], doorBottom: 0.36, hoodStart: 1.02, hoodFront: half - 0.08,
      trunkPivot: [-1.86, 0.99], trunkTail: -half + 0.08, chargePort: [-1.78, 0.86] }
  }
  return { frontAxle: half - 0.88, rearAxle: half - 0.88 - spec.wheelbase, wheelR: 0.39, belt: 1.12,
    frontDoor: [0.95, -0.2], rearDoor: [-0.2, -1.2], doorBottom: 0.44, hoodStart: 0.98, hoodFront: half - 0.1,
    trunkPivot: [-half + 0.28, spec.height - 0.08], trunkTail: -half + 0.02, chargePort: [half - 0.62, 0.92] }
}

/** Lower body (below the belt line) with wheel arches cut out. */
export function lowerProfile(spec: BrandSpec, L: CarLayout): THREE.Shape {
  const h = spec.length / 2, r = L.wheelR + 0.05, ground = spec.rideHeight + 0.12
  const s = new THREE.Shape()
  if (spec.bodyStyle === 'sedan') {
    s.moveTo(-h + 0.08, ground)
    s.lineTo(L.rearAxle - r, ground); s.absarc(L.rearAxle, L.wheelR, r, Math.PI, 0, true)
    s.lineTo(L.frontAxle - r, ground); s.absarc(L.frontAxle, L.wheelR, r, Math.PI, 0, true)
    s.lineTo(h - 0.1, ground - 0.02)
    s.quadraticCurveTo(h + 0.04, 0.42, h - 0.04, 0.66)
    s.quadraticCurveTo(h - 0.5, 0.86, L.hoodStart, L.belt - 0.02)
    s.lineTo(L.trunkPivot[0], L.belt)
    s.quadraticCurveTo(-h + 0.12, L.belt + 0.02, -h + 0.02, 0.86)
    s.quadraticCurveTo(-h - 0.04, 0.6, -h + 0.08, ground)
  } else {
    s.moveTo(-h + 0.06, ground)
    s.lineTo(L.rearAxle - r, ground); s.absarc(L.rearAxle, L.wheelR, r, Math.PI, 0, true)
    s.lineTo(L.frontAxle - r, ground); s.absarc(L.frontAxle, L.wheelR, r, Math.PI, 0, true)
    s.lineTo(h - 0.08, ground)
    s.quadraticCurveTo(h + 0.05, 0.5, h - 0.02, 0.86)
    s.quadraticCurveTo(h - 0.4, 1.02, L.hoodStart, L.belt - 0.04)
    s.lineTo(-h + 0.26, L.belt)
    s.quadraticCurveTo(-h + 0.02, L.belt - 0.02, -h, 0.9)
    s.quadraticCurveTo(-h - 0.03, 0.55, -h + 0.06, ground)
  }
  return s
}

/** Greenhouse (glass and pillars) above the belt line. */
export function upperProfile(spec: BrandSpec, L: CarLayout): THREE.Shape {
  const h = spec.length / 2, top = spec.height
  const s = new THREE.Shape()
  if (spec.bodyStyle === 'sedan') {
    s.moveTo(L.hoodStart, L.belt - 0.02)
    s.quadraticCurveTo(0.6, top - 0.1, 0.1, top)
    s.quadraticCurveTo(-0.7, top + 0.01, -1.15, top - 0.12)
    s.quadraticCurveTo(-1.6, top - 0.3, L.trunkPivot[0], L.belt)
  } else {
    s.moveTo(L.hoodStart, L.belt - 0.04)
    s.quadraticCurveTo(0.55, top - 0.08, 0.15, top - 0.02)
    s.lineTo(-h + 0.45, top - 0.04)
    s.quadraticCurveTo(-h + 0.2, top - 0.06, -h + 0.26, L.belt)
  }
  s.closePath()
  return s
}

/** Door skin: the part of the side between two x values, from the sill up to the belt line, clear of the arches. */
export function doorShape(L: CarLayout, x0: number, x1: number, rear: boolean): THREE.Shape {
  const s = new THREE.Shape()
  const lo = L.doorBottom, hi = L.belt - 0.015
  s.moveTo(x1, hi); s.lineTo(x0, hi); s.lineTo(x0, lo + 0.04); s.quadraticCurveTo(x0, lo, x0 - 0.04, lo)
  if (rear) {
    const archX = L.rearAxle + L.wheelR + 0.08
    s.lineTo(archX, lo); s.quadraticCurveTo(x1, lo + 0.02, x1, lo + 0.24)
  } else s.lineTo(x1 + 0.04, lo)
  s.closePath()
  return s
}

/** Side window pane for one door, following the greenhouse outline. */
export function windowShape(spec: BrandSpec, L: CarLayout, x0: number, x1: number): THREE.Shape {
  const top = spec.height - (spec.bodyStyle === 'sedan' ? 0.09 : 0.1)
  const s = new THREE.Shape()
  const slopeFront = spec.bodyStyle === 'sedan' ? 0.42 : 0.35
  const front = x0 > 0
  s.moveTo(x0 - (front ? 0.06 : 0.03), L.belt + 0.03)
  s.lineTo(x1 + 0.03, L.belt + 0.03)
  if (!front && spec.bodyStyle === 'sedan') s.quadraticCurveTo(x1 + 0.05, top - 0.25, x1 + 0.35, top - 0.06)
  else s.lineTo(x1 + 0.03, top - 0.04)
  s.lineTo(front ? x0 - slopeFront : x0 - 0.03, top - 0.03)
  s.closePath()
  return s
}

export function hoodShape(spec: BrandSpec, L: CarLayout): THREE.Shape {
  const h = spec.length / 2
  const s = new THREE.Shape()
  if (spec.bodyStyle === 'sedan') {
    s.moveTo(L.hoodStart - 0.02, L.belt - 0.01)
    s.quadraticCurveTo(h - 0.5, 0.88, h - 0.06, 0.67)
    s.lineTo(h - 0.08, 0.64)
    s.quadraticCurveTo(h - 0.52, 0.85, L.hoodStart - 0.04, L.belt - 0.04)
  } else {
    s.moveTo(L.hoodStart - 0.02, L.belt - 0.03)
    s.quadraticCurveTo(h - 0.4, 1.04, h - 0.04, 0.87)
    s.lineTo(h - 0.06, 0.84)
    s.quadraticCurveTo(h - 0.42, 1.0, L.hoodStart - 0.04, L.belt - 0.06)
  }
  s.closePath()
  return s
}

/** Trunk lid (sedan deck) or tailgate (SUV), drawn relative to its hinge so it can rotate in place. */
export function trunkShape(spec: BrandSpec, L: CarLayout): THREE.Shape {
  const [px, py] = L.trunkPivot
  const s = new THREE.Shape()
  if (spec.bodyStyle === 'sedan') {
    const tail = L.trunkTail - px
    s.moveTo(0, 0.01); s.quadraticCurveTo(tail * 0.7, 0.03, tail, -0.11); s.lineTo(tail + 0.01, -0.15); s.quadraticCurveTo(tail * 0.7, -0.02, 0, -0.03)
  } else {
    const bottom = 0.86 - py
    s.moveTo(0, 0.02); s.lineTo(-0.2, 0); s.quadraticCurveTo(-0.3, (bottom) * 0.4, -0.26, bottom); s.lineTo(-0.22, bottom); s.quadraticCurveTo(-0.25, bottom * 0.4, -0.15, -0.02); s.lineTo(0, -0.02)
  }
  s.closePath()
  return s
}

export function extrude(shape: THREE.Shape, depth: number, bevel = 0.03, segments = 3): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segments, curveSegments: 24 })
  g.translate(0, 0, -depth / 2)
  g.computeVertexNormals()
  return g
}
