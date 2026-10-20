// Public types of Agentopolis.

/** An agent living in the city: a little robot with its own colour and building. */
export interface AgentDef {
  /** Stable id used in events (`say('critic', ...)`). */
  id: string
  /** Name on its tag; defaults to the id. */
  name?: string
  /** CSS colour of the robot, its tag and its building sign. */
  color: string
  /** Text of its building's sign (e.g. "SOUND STAGE"); defaults to the name in capitals. */
  sign?: string
}

/** Optional fixed position of an agent's building on the lot grid (tiles are 2 × 2 units). */
export interface Placement {
  /** Agent id. */
  agent: string
  /** Centre of the building tile: x along the main street, z = -2 is the row facing it. */
  x: number
  z: number
}

export type Theme = 'sunset' | 'day' | 'night'

export interface AgentopolisOptions {
  /** The agents, in the order their buildings line up along the main street. */
  agents: AgentDef[]
  /** Where `robot.glb` and `city/*.gltf` are served from. Defaults to the jsDelivr copy of this package's assets. */
  assetsUrl?: string
  /** Big letters on the hill. Default "AGENTOPOLIS". */
  title?: string
  /** Text of the arch over the side street. Default "AGENTOPOLIS STUDIOS". Empty string: no arch. */
  gate?: string
  /** Name over the café kiosk. Default "AGENTOPOLIS CAFÉ". */
  cafe?: string
  /** Agents quiet for this long take a break (café, bench, a stroll). Default 45 000 ms. */
  breakAfterMs?: number
  /** Language of the built-in small talk and status lines. Default: the browser's ("pt" or "en"). */
  language?: 'en' | 'pt'
  /** Your own small-talk lines for the breaks. */
  chatter?: string[]
  /** Light of the scene. Default "sunset". */
  theme?: Theme
  /** Fixed building positions (otherwise they alternate left/right of the side street). */
  placements?: Placement[]
  /** The agent whose building closes the side street (the "headquarters"). */
  headquarters?: string
  /** Let the viewer turn the camera by dragging. Default true. */
  orbit?: boolean
  /** Characters a speech bubble shows before an ellipsis. Default 140. */
  bubbleChars?: number
}

/** One line an agent said: what the bubbles show. */
export interface Line {
  agent: string
  text: string
  /** When it was said (ms since epoch). */
  at: number
}

/** The handle returned by `createAgentopolis`. */
export interface Agentopolis {
  /** An agent says something: it walks to the crossroads, and the agent it answers meets it there. */
  say(agent: string, text: string, at?: Date | number): void
  /** Replace the whole conversation (e.g. when reloading a finished run). */
  setLines(lines: { agent: string; text: string; at?: Date | number | string }[]): void
  /** The run is live (lights on, REC blinking) or paused. */
  setLive(live: boolean): void
  /** The work is done: the crew gathers and dances. */
  done(message?: string): void
  /** The work failed: the first agent says so; everyone goes on a break. */
  fail(message?: string): void
  /** Back to a fresh run. */
  reset(): void
  /** Stop rendering and free the GPU and DOM resources. */
  dispose(): void
}
