// The demo: a film crew making a video, line by line.
import { createAgentopolis, type Agentopolis, type Theme } from '../src'

const AGENTS = [
  { id: 'director', name: 'Director', color: '#f59e0b', sign: 'DIRECTOR' },
  { id: 'narrator', name: 'Narrator', color: '#f43f5e', sign: 'SOUND STAGE' },
  { id: 'designer', name: 'Designer', color: '#8b5cf6', sign: 'ART DEPT' },
  { id: 'critic', name: 'Critic', color: '#10b981', sign: 'SCREENING' },
  { id: 'composer', name: 'Composer', color: '#ec4899', sign: 'MUSIC STAGE' },
  { id: 'editor', name: 'Editor', color: '#c6ff00', sign: 'EDIT BAY' },
]

const SCRIPT: [string, string][] = [
  ['director', 'Script ready: "The Night of the Forgotten Videos", 6 scenes.'],
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
let city: Agentopolis
let timer = 0
let at = 0

function mount() {
  city?.dispose()
  city = createAgentopolis(host, {
    agents: AGENTS,
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

mount()
run()
