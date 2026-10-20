// Textures drawn on a canvas: signs, the hill letters, the sky, stripes.
import * as THREE from 'three'

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif'

/** A sign: text in a colour, optionally on a rounded plate (neon glow on dark plates). */
export function signTexture(text: string, color: string, plate?: string, w = 1000, h = 220) {
  return canvasTexture(w, h, g => {
    if (plate) {
      g.fillStyle = plate
      g.beginPath()
      g.roundRect(4, 4, w - 8, h - 8, h * 0.18)
      g.fill()
    }
    let size = h * 0.5
    g.font = `800 ${size}px ${FONT}`
    while (g.measureText(text).width > w * 0.88 && size > 12) g.font = `800 ${(size -= 4)}px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (!plate || isDark(plate)) {
      g.shadowColor = color
      g.shadowBlur = 18
    }
    g.fillStyle = color
    g.fillText(text, w / 2, h / 2 + h * 0.03)
  })
}

/** One white letter of the hill sign. */
export function letterTexture(ch: string) {
  return canvasTexture(256, 320, g => {
    g.font = `900 300px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.shadowColor = 'rgba(0,0,0,.25)'
    g.shadowBlur = 6
    g.fillText(ch, 128, 172)
  })
}

export function skyTexture(stops: [number, string][]) {
  return canvasTexture(16, 256, g => {
    const grad = g.createLinearGradient(0, 0, 0, 256)
    for (const [at, c] of stops) grad.addColorStop(at, c)
    g.fillStyle = grad
    g.fillRect(0, 0, 16, 256)
  })
}

export function stripeTexture(a: string, b: string) {
  return canvasTexture(256, 64, g => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b
      g.fillRect(i * 32, 0, 32, 64)
    }
  })
}

function isDark(css: string) {
  const c = new THREE.Color(css)
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35
}
