// The demo: a film crew making a video, line by line.
import { createAgentopolis, type Agentopolis, type AgentDef, type Theme } from '../src'

const AGENTS: AgentDef[] = [
  { id: 'director', name: 'Director', color: '#f59e0b', sign: 'DIRECTOR', model: 'director' },
  { id: 'narrator', name: 'Narrator', color: '#f43f5e', sign: 'SOUND STAGE', model: 'narrator' },
  { id: 'designer', name: 'Designer', color: '#8b5cf6', sign: 'ART DEPT', model: 'designer' },
  { id: 'critic', name: 'Critic', color: '#10b981', sign: 'SCREENING', model: 'critic' },
  { id: 'composer', name: 'Composer', color: '#ec4899', sign: 'MUSIC STAGE', model: 'composer' },
  { id: 'editor', name: 'Editor', color: '#c6ff00', sign: 'EDIT BAY', model: 'editor' },
  { id: 'explorer', name: 'Scout', color: '#0ea5e9', sign: 'SCOUTING', model: 'explorer' },
]

const SCRIPT: [string, string][] = [
  ['explorer', 'Found 12 references: old VHS tapes, fog, flickering neon.'],
  ['director','Script ready: "The Night of the Forgotten Videos", 6 scenes.'],
  ['composer', 'Composing the score: deep drones and a slow heartbeat.'],
  ['narrator', 'Narration recorded, 34 s, every word timed.'],
  ['designer', 'Scene 1: static, a heavy vignette and trembling letters.'],
  ['critic', 'Scene 1: 5/10. The base works, it needs more drama.'],
  ['designer', 'Scene 1, take 2: stronger static and an RGB split on every beat.'],
  ['critic', 'Scene 1: 8/10. Now it is scary!'],
  ['designer', 'Scene 2: a digital graveyard with violet fog.'],
  ['critic', 'Scene 2: 9/10. Beautiful.'],
  ['editor', 'Joined the scenes with transitions and captions.'],
]

const host = document.getElementById('city')!
const themes: Theme[] = ['sunset', 'day', 'night']
let theme = 0
let robots = false
let city: Agentopolis
let timer = 0
let at = 0

function mount() {
  city?.dispose()
  city = createAgentopolis(host, {
    agents: robots ? AGENTS.map(a => ({ ...a, model: 'robot' })) : AGENTS,
    headquarters: 'editor',
    assetsUrl: './assets/',
    breakAfterMs: 14_000,
    theme: themes[theme],
    language: 'en',
  })
}

function next() {
  if (at >= SCRIPT.length) { city.done(); stop(); return }
  const [agent, text] = SCRIPT[at++]
  city.say(agent, text)
}

function stop() { clearInterval(timer); timer = 0 }

function run() {
  stop()
  city.reset()
  at = 0
  next()
  timer = window.setInterval(next, 6500)
}

document.getElementById('run')!.onclick = run
document.getElementById('say')!.onclick = () => { stop(); next() }
document.getElementById('break')!.onclick = () => {
  stop()
  // everyone quiet for a minute: a coffee break
  city.setLines(SCRIPT.slice(0, Math.max(1, at)).map(([agent, text]) => ({ agent, text, at: Date.now() - 60_000 })))
}
document.getElementById('wrap')!.onclick = () => { stop(); city.done() }
document.getElementById('fail')!.onclick = () => { stop(); city.fail() }
document.getElementById('theme')!.onclick = () => {
  stop()
  theme = (theme + 1) % themes.length
  mount()
}
document.getElementById('cast')!.onclick = e => {
  stop()
  robots = !robots
  ;(e.currentTarget as HTMLButtonElement).textContent = robots ? '🎭 Characters' : '🤖 Robots'
  mount()
  run()
}

mount()
run()
