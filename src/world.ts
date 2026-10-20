// The city: sky and light, the hill with its letters, the streets, one
// building per agent with its sign, the café with its seats, benches, palms,
// the water tower and the arch. It also blocks, on the navigation grid,
// every place a robot cannot walk through.
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { NavGrid } from './nav'
import { letterTexture, signTexture, skyTexture, stripeTexture } from './textures'
import type { AgentDef, Theme } from './types'

export const CITY_MODELS = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H',
  'base', 'road_straight', 'road_junction', 'streetlight', 'bench', 'bush', 'car_taxi', 'car_sedan', 'watertower', 'firehydrant'] as const
export type CityModel = (typeof CITY_MODELS)[number]

/** A place to rest: sit on a stool or a bench, or stand at the counter. */
export interface Spot { x: number; z: number; face: number; sit: boolean; kind: 'cafe' | 'counter' | 'bench' }

export interface Home { agent: string; x: number; z: number; door: { x: number; z: number } }

export interface World {
  nav: NavGrid
  homes: Map<string, Home>
  spots: Spot[]
  /** Where the speaker and the one it answers meet. */
  meet: { x: number; z: number }
  /** The sign plates of the lot (lit while the run is live). */
  rec: THREE.MeshBasicMaterial
  bounds: { minX: number; maxX: number }
  dispose(): void
}

const THEMES: Record<Theme, { sky: [number, string][]; fog: string; hemi: [string, string, number]; sun: [string, number]; ground: string; hill: string }> = {
  sunset: { sky: [[0, '#4b3a8f'], [0.45, '#c9718f'], [0.75, '#f6a46f'], [1, '#ffd29a']], fog: '#f2a77a', hemi: ['#ffd7b0', '#5a3d6b', 0.95], sun: ['#ffb36b', 1.9], ground: '#6f8f5a', hill: '#8a7a4f' },
  day: { sky: [[0, '#4f8fe0'], [0.6, '#9cc9f5'], [1, '#e6f3ff']], fog: '#cfe5f7', hemi: ['#ffffff', '#6b7f5a', 1.05], sun: ['#fff4e0', 2.1], ground: '#7fa363', hill: '#7f8f55' },
  night: { sky: [[0, '#05060f'], [0.6, '#151a3a'], [1, '#2b2f5a']], fog: '#151a3a', hemi: ['#8ea0ff', '#1a1630', 0.55], sun: ['#9fb4ff', 0.7], ground: '#2f3d2c', hill: '#2d2a33' },
}

/** Building slots on the row facing the main street, alternating sides of the side street. */
const SLOTS = [-2, 2, -4, 4, -6, 6, -8, 8, -10, 10]
const BUILDINGS = ['building_C', 'building_E', 'building_G', 'building_D', 'building_F', 'building_A', 'building_B', 'building_H'] as const

export function buildWorld(scene: THREE.Scene, models: Record<CityModel, GLTF>, opts: {
  agents: AgentDef[]
  placements: Map<string, { x: number; z: number }>
  headquarters?: string
  title: string
  gate: string
  cafe: string
  theme: Theme
}): World {
  const owned: (THREE.Material | THREE.BufferGeometry | THREE.Texture)[] = []
  const own = <T extends THREE.Material | THREE.BufferGeometry | THREE.Texture>(x: T) => { owned.push(x); return x }
  const th = THEMES[opts.theme]

  // ── where the buildings go ─────────────────────────────────────────────
  const homes = new Map<string, Home>()
  let k = 0
  for (const a of opts.agents) {
    const fixed = opts.placements.get(a.id)
    if (fixed) { homes.set(a.id, { agent: a.id, ...fixed, door: { x: fixed.x, z: fixed.z + 1.32 } }); continue }
    if (a.id === opts.headquarters) { homes.set(a.id, { agent: a.id, x: 0, z: -6, door: { x: 0, z: -4.68 } }); continue }
    while (k < SLOTS.length && [...homes.values()].some(h => h.x === SLOTS[k] && h.z === -2)) k++
    const x = SLOTS[k++ % SLOTS.length]
    homes.set(a.id, { agent: a.id, x, z: -2, door: { x, z: -0.68 } })
  }
  const extent = Math.max(8, ...[...homes.values()].map(h => Math.abs(h.x) + 2))
  const nav = new NavGrid(-extent - 1, -8, extent + 1, 3.6)

  // ── sky, light, ground ─────────────────────────────────────────────────
  scene.background = own(skyTexture(th.sky))
  scene.fog = new THREE.Fog(th.fog, 26, 48)
  scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]))
  const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1])
  sun.position.set(-9, 8, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -extent - 4, right: extent + 4, top: 12, bottom: -12, near: 1, far: 40 })
  sun.shadow.bias = -0.0005
  scene.add(sun)

  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(140, 140)), own(new THREE.MeshStandardMaterial({ color: th.ground, roughness: 1 })))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  ground.receiveShadow = true
  scene.add(ground)

  // The hill and its letters.
  const hill = new THREE.Mesh(own(new THREE.SphereGeometry(16, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)), own(new THREE.MeshStandardMaterial({ color: th.hill, roughness: 1 })))
  hill.scale.set(Math.max(1.5, extent / 6), 0.42, 0.6)
  hill.position.set(0, -0.2, -22)
  scene.add(hill)
  const letters = opts.title.toUpperCase().split('')
  const spacing = Math.min(1.42, 15 / Math.max(1, letters.length))
  letters.forEach((ch, i) => {
    if (ch === ' ') return
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(1.25 * spacing / 1.42, 1.55 * spacing / 1.42)), own(new THREE.MeshBasicMaterial({ map: own(letterTexture(ch)), transparent: true, fog: false })))
    const x = (i - (letters.length - 1) / 2) * spacing
    m.position.set(x, 4.15 + (i % 2 ? 0.06 : -0.04), -13.4 + Math.abs(x) * 0.12)
    m.rotation.set(-0.08, -x * 0.012, ((i % 3) - 1) * 0.04)
    scene.add(m)
  })

  // ── the lot ────────────────────────────────────────────────────────────
  const lot = new THREE.Group()
  scene.add(lot)
  const put = (name: CityModel, x: number, z: number, rotY = 0, scale = 1) => {
    const o = models[name].scene.clone()
    o.position.set(x, 0, z)
    o.rotation.y = rotY
    o.scale.setScalar(scale)
    o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true } })
    lot.add(o)
    return o
  }
  const row = []
  for (let x = -extent; x <= extent; x += 2) if (x !== 0) row.push(x)
  for (const x of row) put('road_straight', x, 0, Math.PI / 2)
  put('road_junction', 0, 0)
  for (const z of [-2, -4]) put('road_straight', 0, z)
  put('road_straight', 0, 2)

  // Sidewalk in front with benches, lights and bushes; the café keeps x 1..5 clear.
  const spots: Spot[] = []
  for (const x of row) {
    put('base', x, 2)
    if (x === 2 || x === 4) continue
    if (x % 4 === 0) { put('streetlight', x + 0.7, 1.25, Math.PI / 2); nav.blockRect(x + 0.6, 1.25, 0.12, 0.12) }
    else {
      put('bench', x, 1.5)
      nav.blockRect(x, 1.5, 0.45, 0.2)
      spots.push({ x, z: 1.75, face: 0, sit: true, kind: 'bench' })
    }
    put('bush', x - 0.6, 2.6)
    nav.blockRect(x - 0.6, 2.6, 0.22, 0.22)
  }
  put('firehydrant', -1.3, 1.3)
  nav.blockRect(-1.3, 1.3, 0.15, 0.15)

  // Buildings: each agent's, then filler around them.
  const occupied = new Set<string>()
  let b = 0
  for (const h of homes.values()) {
    put(h.z === -6 ? 'building_H' : BUILDINGS[b++ % BUILDINGS.length], h.x, h.z)
    occupied.add(`${h.x},${h.z}`)
  }
  const fillers: [number, number][] = []
  for (const x of row) for (const z of [-2, -4, -6]) if (!occupied.has(`${x},${z}`)) fillers.push([x, z])
  if (!occupied.has('0,-6')) fillers.push([0, -6])
  fillers.forEach(([x, z], i) => put(BUILDINGS[(i * 3 + 1) % BUILDINGS.length], x, z))
  for (const x of row) for (const z of [-2, -4, -6]) nav.blockRect(x, z, 2, 2, 0)
  nav.blockRect(0, -6, 2, 2, 0)
  for (const x of row) nav.blockRect(x, -0.95, 2, 0.05, 0) // no walking along the very edge of a building

  // Signs over the doors.
  const byId = new Map(opts.agents.map(a => [a.id, a]))
  for (const h of homes.values()) {
    const a = byId.get(h.agent)!
    const s = new THREE.Mesh(own(new THREE.PlaneGeometry(1.5, 0.34)), own(new THREE.MeshBasicMaterial({ map: own(signTexture((a.sign ?? a.name ?? a.id).toUpperCase(), a.color, '#14111c', 900, 200)), transparent: true })))
    s.position.set(h.x, 0.92, h.z + 1.06)
    scene.add(s)
  }

  // Cars and the water tower.
  put('car_taxi', -extent + 1.6, 0.45, Math.PI / 2, 1.1)
  nav.blockRect(-extent + 1.6, 0.45, 1.1, 0.5)
  put('car_sedan', extent - 1.4, -0.45, -Math.PI / 2, 1.1)
  nav.blockRect(extent - 1.4, -0.45, 1.1, 0.5)
  put('watertower', -extent - 0.3, -2.3, 0, 5.2)

  // The arch over the side street.
  const stone = own(new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.9 }))
  if (opts.gate) {
    for (const x of [-1.12, 1.12]) {
      const p = new THREE.Mesh(own(new THREE.BoxGeometry(0.26, 1.9, 0.26)), stone)
      p.position.set(x, 0.95, -1.2)
      p.castShadow = true
      scene.add(p)
      nav.blockRect(x, -1.2, 0.26, 0.26)
    }
    const beam = new THREE.Mesh(own(new THREE.BoxGeometry(2.6, 0.4, 0.22)), stone)
    beam.position.set(0, 2.05, -1.2)
    beam.castShadow = true
    scene.add(beam)
    const plate = new THREE.Mesh(own(new THREE.PlaneGeometry(2.45, 0.34)), own(new THREE.MeshBasicMaterial({ map: own(signTexture(opts.gate.toUpperCase(), '#1a1420', '#efe3cf', 1400, 180)), transparent: true })))
    plate.position.set(0, 2.05, -1.08)
    scene.add(plate)
  }

  // The café: kiosk with an awning, two tables with umbrellas and stools.
  {
    const cream = own(new THREE.MeshStandardMaterial({ color: '#f3e6cf', roughness: 0.8 }))
    const wood = own(new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.9 }))
    const metal = own(new THREE.MeshStandardMaterial({ color: '#2b2733', roughness: 0.5, metalness: 0.4 }))
    const cup = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }))
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(own(geo), mat)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      scene.add(m)
      return m
    }
    add(new THREE.BoxGeometry(1.25, 0.62, 0.5), cream, 4.6, 0.31, 1.55)
    add(new THREE.BoxGeometry(1.3, 0.05, 0.56), wood, 4.6, 0.64, 1.55)
    add(new THREE.BoxGeometry(0.22, 0.24, 0.18), metal, 4.25, 0.78, 1.5)
    for (const x of [4.0, 5.2]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.95), wood, x, 1.1, 1.38)
    const awning = add(new THREE.BoxGeometry(1.45, 0.05, 0.75), own(new THREE.MeshStandardMaterial({ map: own(stripeTexture('#f3e6cf', '#c6ff00')), roughness: 0.9 })), 4.6, 1.58, 1.55)
    awning.rotation.x = -0.18
    const sign = new THREE.Mesh(own(new THREE.PlaneGeometry(1.2, 0.3)), own(new THREE.MeshBasicMaterial({ map: own(signTexture(opts.cafe.toUpperCase(), '#c6ff00', '#14111c')), transparent: true })))
    sign.position.set(4.6, 1.85, 1.6)
    scene.add(sign)
    nav.blockRect(4.6, 1.55, 1.3, 0.56)
    for (const [x, umbrella] of [[1.9, '#ec4899'], [3.3, '#0ea5e9']] as const) {
      add(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), cream, x, 0.42, 2.4)
      add(new THREE.CylinderGeometry(0.025, 0.04, 0.42), metal, x, 0.21, 2.4)
      add(new THREE.CylinderGeometry(0.012, 0.012, 1.05), metal, x, 0.95, 2.4)
      add(new THREE.ConeGeometry(0.62, 0.26, 10, 1, true), own(new THREE.MeshStandardMaterial({ color: umbrella, side: THREE.DoubleSide, roughness: 0.8 })), x, 1.42, 2.4)
      nav.blockRect(x, 2.4, 0.52, 0.52)
      for (const dx of [-0.35, 0.35]) {
        add(new THREE.CylinderGeometry(0.1, 0.09, 0.03, 16), wood, x + dx, 0.24, 2.4)
        add(new THREE.CylinderGeometry(0.018, 0.018, 0.24), metal, x + dx, 0.12, 2.4)
        add(new THREE.CylinderGeometry(0.03, 0.025, 0.06, 12), cup, x + dx * 0.4, 0.465, 2.4)
        spots.push({ x: x + dx, z: 2.4, face: dx < 0 ? Math.PI / 2 : -Math.PI / 2, sit: true, kind: 'cafe' })
      }
    }
    for (const x of [4.15, 4.6, 5.05]) spots.push({ x, z: 2.2, face: Math.PI, sit: false, kind: 'counter' })
  }

  // A film camera at the crossroads; its REC light blinks while live.
  const rec = own(new THREE.MeshBasicMaterial({ color: '#ff2b2b' }))
  {
    const cam = new THREE.Group()
    const dark = own(new THREE.MeshStandardMaterial({ color: '#23202e', metalness: 0.4, roughness: 0.5 }))
    for (const a of [0, 2.1, 4.2]) {
      const leg = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.012, 0.62)), dark)
      leg.position.set(Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.1)
      leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32)
      cam.add(leg)
    }
    const body = new THREE.Mesh(own(new THREE.BoxGeometry(0.24, 0.18, 0.34)), dark)
    body.position.y = 0.66
    const lens = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 20)), dark)
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, 0.66, -0.24)
    const light = new THREE.Mesh(own(new THREE.SphereGeometry(0.022, 10, 10)), rec)
    light.position.set(0.09, 0.77, 0.12)
    cam.add(body, lens, light)
    cam.position.set(-1.2, 0, 1.3)
    cam.rotation.y = -2.6
    cam.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true })
    scene.add(cam)
    nav.blockRect(-1.2, 1.3, 0.3, 0.3)
  }

  // Palms at the edges.
  for (const [x, z] of [[-extent - 2, 2.4], [extent + 2, 2.4], [-extent - 1.6, -3.6], [extent + 1.6, -1.4]] as const) scene.add(palm(x, z, own))

  // Seats sit inside furniture footprints: free them again.
  for (const s of spots) nav.freeRect(s.x, s.z, 0.2, 0.2)

  return {
    nav, homes, spots, rec, meet: { x: 0, z: 0.35 }, bounds: { minX: -extent, maxX: extent },
    dispose() { for (const o of owned) o.dispose() },
  }
}

function palm(x: number, z: number, own: <T extends THREE.Material | THREE.BufferGeometry | THREE.Texture>(x: T) => T) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.08, 1.9, 8)), own(new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1 })))
  trunk.position.y = 0.95
  trunk.rotation.z = 0.08
  g.add(trunk)
  const leaf = own(new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 0.9, side: THREE.DoubleSide }))
  const leafGeo = own(new THREE.ConeGeometry(0.12, 0.9, 4))
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(leafGeo, leaf)
    const a = (i / 7) * Math.PI * 2
    l.position.set(0.08 + Math.cos(a) * 0.32, 1.88, Math.sin(a) * 0.32)
    l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2 + Math.PI)
    g.add(l)
  }
  g.position.set(x, 0, z)
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true })
  return g
}
