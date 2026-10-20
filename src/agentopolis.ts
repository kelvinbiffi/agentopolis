// createAgentopolis: the city, its robots and the loop that drives them.
//
// Each agent is a robot with three ways to spend its time:
// - work: at the door of its building, while its last line is fresh;
// - meet: the one speaking walks to the crossroads, and the agent it answers
//   comes to meet it there, face to face, with speech bubbles;
// - break: quiet for a while, it picks a place to rest (a café stool, the
//   counter, a bench, or a short stroll), weighted, and chats now and then.
// When the work is done the crew gathers at the crossroads and dances.
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { buildWorld, CITY_MODELS, type CityModel, type Spot, type World } from './world'
import type { Agentopolis, AgentopolisOptions, AgentDef, Character, Line } from './types'

const DEFAULT_ASSETS = 'https://cdn.jsdelivr.net/gh/kelvinbiffi/agentopolis@main/assets/'
/** The built-in characters, served from `characters/<name>.glb`. */
export const CHARACTERS: readonly Character[] = ['director', 'narrator', 'designer', 'critic', 'composer', 'editor', 'explorer']
const ROBOT_HEIGHT = 0.82
const PERSON_HEIGHT = 0.95
const ONE_SHOT = ['Wave', 'Yes', 'No', 'ThumbsUp', 'Jump', 'Punch']
const WALK_SPEED = 1.25
const RUN_SPEED = 2.4
const SEAT_HEIGHT = 0.25 // stools and benches; a character's sitting clip sits on the floor
// A character's clips under the names the crew plays (the robot's names).
const CLIP_NAMES: Record<string, string> = { Walk: 'Walking', Run: 'Running', SitDrink: 'Sitting', Cheer: 'ThumbsUp', Agree: 'Yes' }
// What to play when a model lacks a clip.
const FALLBACK: Record<string, string[]> = {
  Talk: ['Yes', 'Idle'], Yes: ['Talk', 'Wave'], No: ['Talk', 'Idle'], ThumbsUp: ['Wave', 'Yes'], Dance: ['ThumbsUp', 'Wave'],
  Running: ['Walking'], Sitting: ['Idle'], Wave: ['Yes', 'Idle'],
}

const CHATTER = {
  pt: ['☕ Mais um café?', 'Esse take vai ficar lindo.', 'Alguém viu o storyboard?', 'Pausa rápida, já volto.', 'O crítico tá exigente hoje…',
    'Quem pediu descafeinado?', 'Bora fechar esse corte!', 'Ouvi dizer que vai viralizar.', 'Mais açúcar, por favor.'],
  en: ['☕ Another coffee?', 'This take will look great.', 'Anyone seen the storyboard?', 'Quick break, back soon.', 'The critic is tough today…',
    'Who ordered decaf?', "Let's wrap this cut!", 'I heard this one goes viral.', 'More sugar, please.'],
}
const WRAP = { pt: 'Corta! Ficou ótimo!', en: "That's a wrap!" }
const SNAG = { pt: 'Deu ruim nesse take.', en: 'We hit a snag on this take.' }

type Mode = 'work' | 'meet' | 'break' | 'party'

interface Actor {
  def: AgentDef
  root: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  current: string
  robot: boolean
  height: number
  head: THREE.Object3D
  mode: Mode
  goal: { x: number; z: number } | null
  path: { x: number; z: number }[]
  face: number | null
  spot: number | null
  strollUntil: number
  nextGesture: number
  chatter: { text: string; until: number } | null
  bubble: HTMLDivElement
  tag: HTMLDivElement
}

const loaders = new Map<string, Promise<GLTF>>()
function load(url: string) {
  if (!loaders.has(url)) loaders.set(url, new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url))
  return loaders.get(url)!
}

/** Where an agent's model is served from. */
function modelUrl(def: AgentDef, base: string) {
  const m = def.model ?? 'robot'
  if (m === 'robot') return base + 'robot.glb'
  if ((CHARACTERS as readonly string[]).includes(m)) return `${base}characters/${m}.glb`
  return m
}

/** Mounts a city in the container and returns the handle that drives it. */
export function createAgentopolis(container: HTMLElement, options: AgentopolisOptions): Agentopolis {
  const opts = {
    assetsUrl: DEFAULT_ASSETS, title: 'AGENTOPOLIS', gate: 'AGENTOPOLIS STUDIOS', cafe: 'AGENTOPOLIS CAFÉ',
    breakAfterMs: 45_000, theme: 'sunset' as const, orbit: true, bubbleChars: 140,
    language: (navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en') as 'pt' | 'en',
    ...options,
  }
  const base = opts.assetsUrl.endsWith('/') ? opts.assetsUrl : opts.assetsUrl + '/'
  const chatter = opts.chatter?.length ? opts.chatter : CHATTER[opts.language]
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  // ── state fed by the events ────────────────────────────────────────────
  let lines: Line[] = []
  let live = true
  let wrap: string | null = null
  let snag: string | null = null

  // ── DOM ────────────────────────────────────────────────────────────────
  container.classList.add('agentopolis')
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  container.style.overflow = 'hidden'
  injectStyles()
  const overlay = document.createElement('div')
  overlay.className = 'ap-overlay'
  const hint = document.createElement('div')
  hint.className = 'ap-hint'
  hint.textContent = opts.language === 'pt' ? 'Arraste para olhar a cidade' : 'Drag to look around the city'

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'ap-canvas'
  container.append(renderer.domElement, overlay)
  if (opts.orbit) container.append(hint)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 120)
  const look = new THREE.Vector3(0, 1.5, -1.4)
  const lookGoal = look.clone()
  const camGoal = new THREE.Vector3()

  let controls: OrbitControls | null = null
  let dragging = false, userUntil = 0
  if (opts.orbit) {
    controls = new OrbitControls(camera, renderer.domElement)
    Object.assign(controls, {
      enableDamping: true, dampingFactor: 0.08, minDistance: 3.5, maxDistance: 18,
      minPolarAngle: 0.35, maxPolarAngle: 1.42, screenSpacePanning: false, zoomToCursor: true,
      enableZoom: false, // the page keeps scrolling over the city until the viewer grabs it
    })
    controls.addEventListener('start', () => { dragging = true; controls!.enableZoom = true; hint.style.opacity = '0' })
    controls.addEventListener('end', () => { dragging = false; userUntil = clock.elapsedTime + 10 })
  }

  // ── loading ────────────────────────────────────────────────────────────
  let world: World | null = null
  const cast = new Map<string, GLTF>()
  const actors = new Map<string, Actor>()
  let disposed = false
  const castUrls = [...new Set(opts.agents.map(d => modelUrl(d, base)))]
  Promise.all([
    Promise.all(castUrls.map(u => load(u).catch(err => {
      // a character that fails to load is played by the robot
      console.warn('[agentopolis] could not load', u, err)
      return load(base + 'robot.glb')
    }))),
    Promise.all(CITY_MODELS.map(n => load(`${base}city/${n}.gltf`))),
  ]).then(([people, city]) => {
    if (disposed) return
    castUrls.forEach((u, i) => cast.set(u, people[i]))
    const models = Object.fromEntries(CITY_MODELS.map((n, i) => [n, city[i]])) as Record<CityModel, GLTF>
    world = buildWorld(scene, models, {
      agents: opts.agents,
      placements: new Map((opts.placements ?? []).map(p => [p.agent, { x: p.x, z: p.z }])),
      headquarters: opts.headquarters, title: opts.title, gate: opts.gate, cafe: opts.cafe, theme: opts.theme,
    })
    for (const def of opts.agents) actors.set(def.id, spawn(def))
  }).catch(err => {
    console.error('[agentopolis] could not load the assets', err)
  })

  function spawn(def: AgentDef): Actor {
    const home = world!.homes.get(def.id)!
    const root = new THREE.Group()
    const gltf = cast.get(modelUrl(def, base))!
    const isRobot = gltf.animations.some(c => c.name === 'Walking') // the robot's clip names (a character has "Walk")
    const height = isRobot ? ROBOT_HEIGHT : PERSON_HEIGHT
    const model = SkeletonUtils.clone(gltf.scene) as THREE.Group
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model, true)
    const tall = box.max.y - box.min.y
    const k = height / (tall > 0.01 && Number.isFinite(tall) ? tall : 4.4)
    model.scale.multiplyScalar(k)
    if (Number.isFinite(box.min.y)) model.position.y -= box.min.y * k // feet on the street
    const tint = new THREE.Color(def.color)
    model.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.frustumCulled = false // skinned clones keep the bind pose's bounds
      const mat = m.material as THREE.MeshStandardMaterial
      if (isRobot && mat?.name === 'Main') {
        const mine = mat.clone()
        mine.color.copy(tint)
        mine.emissive = tint.clone().multiplyScalar(0.08)
        m.material = mine
      }
    })
    root.add(model)
    root.position.set(home.door.x, 0, home.door.z)
    scene.add(root)

    const mixer = new THREE.AnimationMixer(model)
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of gltf.animations) {
      const name = isRobot ? clip.name : CLIP_NAMES[clip.name] ?? clip.name
      const a = mixer.clipAction(clip)
      if (ONE_SHOT.includes(name) || (isRobot && name === 'Sitting')) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      actions[name] = a
    }
    actions.Idle?.play()
    let head: THREE.Object3D = model
    model.traverse(o => { if (o.name === 'Head' && (o as THREE.Bone).isBone) head = o })

    const bubble = document.createElement('div')
    bubble.className = 'ap-bubble'
    bubble.style.setProperty('--tint', def.color)
    const tag = document.createElement('div')
    tag.className = 'ap-tag'
    const b = document.createElement('b')
    b.style.color = def.color
    b.textContent = def.name ?? def.id
    tag.append(b)
    overlay.append(bubble, tag)

    const a: Actor = {
      def, root, mixer, actions, current: 'Idle', robot: isRobot, height, head, mode: 'work', goal: null, path: [], face: null, spot: null,
      strollUntil: 0, nextGesture: 0, chatter: null, bubble, tag,
    }
    play(a, 'Wave')
    return a
  }

  function play(a: Actor, wanted: string, fade = 0.25) {
    const name = a.actions[wanted] ? wanted : FALLBACK[wanted]?.find(n => a.actions[n]) ?? wanted
    if (a.current === name && !ONE_SHOT.includes(name)) return
    const next = a.actions[name], prev = a.actions[a.current]
    if (!next) return
    next.reset().setEffectiveWeight(1).fadeIn(fade).play()
    if (prev && prev !== next) prev.fadeOut(fade)
    a.current = name
  }

  /** Sends an agent somewhere along the streets (nothing new when it is already going there). */
  function go(a: Actor, to: { x: number; z: number }) {
    if (a.goal && Math.hypot(a.goal.x - to.x, a.goal.z - to.z) < 0.05) return
    a.goal = { ...to }
    const from = { x: a.root.position.x, z: a.root.position.z }
    a.path = world!.nav.path(from, to)
    if (!a.path.length && Math.hypot(from.x - to.x, from.z - to.z) > 0.05) a.path = [to] // no route: straight there
  }

  function gestureFor(a: Actor, text: string) {
    const score = text.match(/(\d+)\s*\/\s*10/)
    if (score) return Number(score[1]) >= 7 ? (a.robot || !a.actions.Yes ? 'ThumbsUp' : 'Yes') : 'No'
    if (/music|soundtrack|trilha|música|compos/i.test(a.def.id + ' ' + (a.def.name ?? ''))) return 'Dance'
    if (a.actions.Talk) return Math.random() < 0.2 ? 'Wave' : 'Talk'
    return Math.random() < 0.3 ? 'Wave' : 'Yes'
  }

  /** A place for a break: café 55%, bench 25%, a stroll 20% (taken spots skipped). */
  function pickRest(a: Actor, t: number) {
    const taken = new Set([...actors.values()].map(o => o.spot).filter((s): s is number => s !== null))
    const free = world!.spots.map((s, i) => [s, i] as [Spot, number]).filter(([, i]) => !taken.has(i))
    const roll = Math.random()
    const want = roll < 0.55 ? ['cafe', 'counter'] : roll < 0.8 ? ['bench'] : []
    const choices = free.filter(([s]) => want.includes(s.kind))
    if (choices.length) {
      const [s, i] = choices[Math.floor(Math.random() * choices.length)]
      a.spot = i
      a.face = s.face
      go(a, s)
      return
    }
    // a short stroll along the sidewalk
    a.spot = null
    a.face = null
    a.strollUntil = t + 8 + Math.random() * 8
    const { minX, maxX } = world!.bounds
    go(a, { x: minX + 1 + Math.random() * (maxX - minX - 2), z: 0.6 + Math.random() * 1.8 })
  }

  // ── loop ───────────────────────────────────────────────────────────────
  const clock = new THREE.Clock()
  const tmp = new THREE.Vector3()
  let raf = 0, visible = true, w = 1, h = 1, nextChatter = 4, lastSeen: Line | null = null

  const resize = () => {
    w = Math.max(1, container.clientWidth)
    h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w < 520 ? 50 : 40
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
  io.observe(container)

  function place(div: HTMLElement, world3: THREE.Vector3, clamp: boolean, below = false) {
    tmp.copy(world3).project(camera)
    const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h
    const half = Math.min(140, w * 0.4)
    const cx = clamp ? Math.min(Math.max(x, half + 8), w - half - 8) : x
    div.style.transform = `translate(${cx}px, ${y}px) translate(-50%, ${below ? '0' : '-100%'})`
    div.style.setProperty('--tail', `${x - cx}px`)
    div.style.visibility = tmp.z > 1 ? 'hidden' : 'visible'
    return cx
  }

  const clip = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    return t.length > opts.bubbleChars ? t.slice(0, opts.bubbleChars - 1).trimEnd() + '…' : t
  }

  function frame() {
    raf = requestAnimationFrame(frame)
    if (!visible || document.hidden) { clock.getDelta(); return }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
    if (world && actors.size) step(dt, t)
    updateCamera(dt, t)
    renderer.render(scene, camera)
  }

  function step(dt: number, t: number) {
    const now = Date.now()
    const lastAt = new Map<string, number>()
    const latest = new Map<string, string>()
    for (const l of lines) { lastAt.set(l.agent, l.at); latest.set(l.agent, l.text) }
    const fresh = (id: string) => now - (lastAt.get(id) ?? -Infinity) < opts.breakAfterMs
    const last = lines[lines.length - 1]
    const ended = wrap !== null || snag !== null
    const current = ended || !live || !last || !actors.has(last.agent) ? null : last.agent
    const speaker = current && fresh(current) ? current : null
    const answered = speaker ? [...lines].reverse().find(l => l.agent !== speaker && actors.has(l.agent))?.agent ?? null : null
    const partner = answered && fresh(answered) ? answered : null
    const first = opts.agents[0]?.id
    const crew = [...actors.values()]

    // Where everyone should be.
    crew.forEach((a, k) => {
      let mode: Mode
      if (wrap !== null) mode = 'party'
      else if (a.def.id === speaker || a.def.id === partner) mode = 'meet'
      else if (live && !snag && (fresh(a.def.id) || a.def.id === current || (lines.length === 0 && a.def.id === first))) mode = 'work'
      else mode = 'break'
      if (mode !== 'break') { a.spot = null; a.chatter = null; a.strollUntil = 0 }
      a.mode = mode
      if (mode === 'party') {
        const n = crew.length, ang = Math.PI * (0.15 + 0.7 * (n === 1 ? 0.5 : k / (n - 1)))
        const r = Math.max(1.1, n * 0.26) // room for everyone
        go(a, { x: world!.meet.x + Math.cos(ang) * -r, z: world!.meet.z - Math.sin(ang) * 0.3 + 0.3 })
        a.face = null
      } else if (mode === 'meet') {
        const side = a.def.id === speaker ? 1 : -1
        go(a, partner ? { x: world!.meet.x + 0.32 * side, z: world!.meet.z } : world!.meet)
        a.face = partner ? -side * Math.PI / 2 : null
      } else if (mode === 'work') {
        go(a, world!.homes.get(a.def.id)!.door)
        a.face = null
      } else if (a.spot === null && (a.strollUntil === 0 || (t > a.strollUntil && !a.path.length))) {
        pickRest(a, t)
      }
    })

    // Small talk on breaks.
    if (!reduced && t > nextChatter) {
      nextChatter = t + 6 + Math.random() * 6
      const resting = crew.filter(a => a.mode === 'break' && !a.path.length)
      if (resting.length) {
        const a = resting[Math.floor(Math.random() * resting.length)]
        a.chatter = { text: chatter[Math.floor(Math.random() * chatter.length)], until: t + 4.5 }
      }
    }

    for (const a of crew) {
      const speaking = a.def.id === speaker
      const next = a.path[0]
      if (next && reduced) { a.root.position.set(a.path[a.path.length - 1].x, 0, a.path[a.path.length - 1].z); a.path = [] }
      if (a.path.length && !reduced) {
        const dx = next.x - a.root.position.x, dz = next.z - a.root.position.z
        const dist = Math.hypot(dx, dz)
        if (dist < 0.04) a.path.shift()
        else {
          // hurrying to the crossroads from far away: run
          const left = a.path.reduce((s, p, i) => s + (i ? Math.hypot(p.x - a.path[i - 1].x, p.z - a.path[i - 1].z) : dist), 0)
          const run = a.current === 'Running' ? left > 1.2 : a.mode === 'meet' && left > 4
          const stepLen = Math.min(dist, dt * (run ? RUN_SPEED : a.mode === 'party' ? 1.6 : WALK_SPEED))
          a.root.position.x += (dx / dist) * stepLen
          a.root.position.z += (dz / dist) * stepLen
          a.root.rotation.y = lerpAngle(a.root.rotation.y, Math.atan2(dx, dz), dt * 10)
          play(a, run && a.actions.Running ? 'Running' : 'Walking')
        }
      } else {
        a.root.rotation.y = lerpAngle(a.root.rotation.y, a.face ?? 0, dt * 6)
        if (a.current === 'Walking' || a.current === 'Running') play(a, 'Idle')
        const spot = a.spot !== null ? world!.spots[a.spot] : null
        if (a.mode === 'party') {
          const lead = a.def.id === first
          if (!lead) play(a, 'Dance')
          else if (a.current !== 'ThumbsUp' && a.current !== 'Dance') play(a, 'ThumbsUp')
          else if (a.current === 'ThumbsUp' && !a.actions.ThumbsUp?.isRunning()) play(a, 'Dance')
        } else if (speaking) {
          if (last !== lastSeen) { lastSeen = last; a.nextGesture = 0 }
          if (t >= a.nextGesture) {
            play(a, gestureFor(a, latest.get(a.def.id) ?? ''))
            a.nextGesture = t + 3.5 + Math.random() * 2
          }
          const g = a.actions[a.current]
          if (g && g.loop === THREE.LoopOnce && !g.isRunning()) play(a, a.actions.Talk ? 'Talk' : 'Idle')
        } else if (a.mode === 'break' && spot?.sit) {
          if (a.current !== 'Sitting') play(a, 'Sitting', a.robot ? 0.4 : 0.6)
        } else if (a.current === 'Dance' || a.current === 'Sitting' || a.current === 'Talk') {
          play(a, 'Idle')
        } else if (a.current !== 'Idle') {
          const g = a.actions[a.current]
          if (!g || g.loop !== THREE.LoopOnce || !g.isRunning()) play(a, 'Idle')
        }
      }
      // a character climbs onto the seat as it sits down
      const seated = !a.robot && a.current === 'Sitting' && !a.path.length
      a.root.position.y += ((seated ? SEAT_HEIGHT : 0) - a.root.position.y) * Math.min(1, dt * 5)
      a.mixer.update(dt)
    }

    // Robots on the move keep a little room between them.
    for (let i = 0; i < crew.length; i++)
      for (let j = i + 1; j < crew.length; j++) {
        const a = crew[i], b = crew[j]
        if (!a.path.length && !b.path.length) continue
        const dx = b.root.position.x - a.root.position.x, dz = b.root.position.z - a.root.position.z
        const d = Math.hypot(dx, dz)
        if (d > 0.001 && d < 0.3) {
          const push = (0.3 - d) * 0.5
          const mover = b.path.length ? b : a, sign = mover === b ? 1 : -1
          const nx = mover.root.position.x + (dx / d) * push * sign, nz = mover.root.position.z + (dz / d) * push * sign
          if (world!.nav.walkableAt({ x: nx, z: nz })) mover.root.position.set(nx, 0, nz)
        }
      }

    // Bubbles and name tags.
    const xs = new Map<string, number>()
    for (const a of crew) {
      const speaking = a.def.id === speaker
      const isLead = a.def.id === first
      const chat = a.chatter && a.chatter.until > t && !a.path.length ? a.chatter.text : ''
      const text = wrap !== null && isLead ? wrap
        : snag !== null && isLead ? snag
        : speaking || a.def.id === partner ? clip(latest.get(a.def.id) ?? '')
        : chat
      if (a.bubble.dataset.text !== text) { a.bubble.dataset.text = text; a.bubble.textContent = text }
      const strong = speaking || (isLead && (wrap !== null || snag !== null)) || (!!chat && text === chat)
      a.bubble.style.opacity = text ? (strong ? '1' : '0.6') : '0'
      a.bubble.classList.toggle('ap-small', !speaking && !(isLead && (wrap !== null || snag !== null)))
      a.head.getWorldPosition(tmp)
      xs.set(a.def.id, place(a.bubble, tmp.setY(a.root.position.y + a.height * 1.18), true))
      place(a.tag, tmp.set(a.root.position.x, -0.02, a.root.position.z + 0.12), false, true)
    }
    if (speaker && partner && Math.abs((xs.get(partner) ?? 0) - (xs.get(speaker) ?? 0)) < Math.min(280, w * 0.5))
      actors.get(partner)!.bubble.style.opacity = '0' // the faded bubble steps aside

    // The camera follows the speaker; on breaks it shows the street and the café.
    const sp = speaker ? actors.get(speaker) : null
    if (sp) lookGoal.set(sp.root.position.x * 0.7, 1.5, Math.min(sp.root.position.z, 0.4) - 1.0)
    else if (wrap === null && crew.some(a => a.mode === 'break')) lookGoal.set(1.4, 1.2, 0.1)
    else lookGoal.set(0, 1.5, -1.4)
    world!.rec.color.set(live && !ended && Math.sin(t * 4) > 0 ? '#ff2b2b' : '#3a0d0d')
  }

  function updateCamera(dt: number, t: number) {
    if (controls && (dragging || t < userUntil)) {
      controls.update()
      look.copy(controls.target)
      return
    }
    look.lerp(lookGoal, Math.min(1, dt * (reduced ? 10 : 1.2)))
    const drift = reduced ? 0 : Math.sin(t * 0.1) * 0.6
    camGoal.set(look.x + drift, look.y + 2.05, look.z + 8.2)
    camera.position.lerp(camGoal, Math.min(1, dt * (reduced ? 10 : 1.6)))
    controls?.target.copy(look)
    camera.lookAt(look)
  }
  camera.position.set(look.x, look.y + 2.05, look.z + 8.2)
  frame()

  const toMs = (at?: Date | number | string) => at === undefined ? Date.now() : typeof at === 'number' ? at : new Date(at).getTime()

  return {
    say(agent, text, at) { lines = [...lines, { agent, text, at: toMs(at) }] },
    setLines(next) { lines = next.map(l => ({ agent: l.agent, text: l.text, at: toMs(l.at) })) },
    setLive(v) { live = v },
    done(message) { wrap = message ?? WRAP[opts.language]; snag = null },
    fail(message) { snag = message ?? SNAG[opts.language]; wrap = null },
    reset() { lines = []; wrap = null; snag = null; live = true; lastSeen = null },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      controls?.dispose()
      for (const a of actors.values()) {
        a.mixer.stopAllAction()
        a.root.traverse(o => {
          const m = o as THREE.Mesh
          if (a.robot && m.isMesh && (m.material as THREE.Material).name === 'Main') (m.material as THREE.Material).dispose()
        })
      }
      world?.dispose()
      ;(scene.background as THREE.Texture | null)?.dispose?.()
      renderer.dispose()
      renderer.domElement.remove()
      overlay.remove()
      hint.remove()
      container.classList.remove('agentopolis')
    },
  }
}

function lerpAngle(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * Math.min(1, k)
}

const CSS = `
.agentopolis .ap-canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
.agentopolis .ap-canvas:active{cursor:grabbing}
.agentopolis .ap-overlay{position:absolute;inset:0;pointer-events:none}
.agentopolis .ap-bubble{position:absolute;left:0;top:0;max-width:min(270px,80%);padding:7px 10px;border-radius:13px;background:#fff;color:#14161b;
  font:500 11.5px/1.35 Inter,system-ui,sans-serif;box-shadow:0 0 0 2px var(--tint),0 8px 22px rgba(20,10,30,.35);transition:opacity .35s;will-change:transform}
.agentopolis .ap-bubble::after{content:'';position:absolute;left:calc(50% + var(--tail,0px));bottom:-7px;width:12px;height:12px;background:#fff;
  transform:translateX(-50%) rotate(45deg);box-shadow:2px 2px 0 0 var(--tint)}
.agentopolis .ap-bubble.ap-small{font-size:10.5px;max-width:min(200px,56%)}
.agentopolis .ap-tag{position:absolute;left:0;top:0;padding:1px 6px;border-radius:7px;background:rgba(20,14,28,.72);
  font:700 9.5px/1.3 Inter,system-ui,sans-serif;white-space:nowrap;will-change:transform}
.agentopolis .ap-hint{position:absolute;left:8px;bottom:8px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:rgba(255,255,255,.85);
  font:400 10px/1.3 Inter,system-ui,sans-serif;pointer-events:none;transition:opacity .7s}
`

function injectStyles() {
  if (document.getElementById('agentopolis-styles')) return
  const s = document.createElement('style')
  s.id = 'agentopolis-styles'
  s.textContent = CSS
  document.head.append(s)
}
