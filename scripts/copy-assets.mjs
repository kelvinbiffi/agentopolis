// Copies ./assets into the demo's public folder (served as ./assets/).
import { cpSync, mkdirSync } from 'node:fs'
mkdirSync('public-demo', { recursive: true })
cpSync('assets', 'public-demo/assets', { recursive: true })
console.log('assets copied to public-demo/assets')
