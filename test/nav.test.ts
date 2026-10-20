import { describe, expect, it } from 'vitest'
import { NavGrid } from '../src/nav'

describe('NavGrid', () => {
  it('walks straight when nothing is in the way (string-pulled to one segment)', () => {
    const g = new NavGrid(0, 0, 10, 10)
    const p = g.path({ x: 1, z: 1 }, { x: 9, z: 9 })
    expect(p).toEqual([{ x: 9, z: 9 }])
  })

  it('goes around a wall and never through it', () => {
    const g = new NavGrid(0, 0, 10, 10)
    g.blockRect(5, 4, 0.5, 8, 0) // a wall from z 0 to 8, open at the top
    const p = g.path({ x: 2, z: 2 }, { x: 8, z: 2 })
    expect(p.length).toBeGreaterThan(1)
    let prev = { x: 2, z: 2 }
    for (const q of p) {
      expect(g.clear(prev, q)).toBe(true)
      prev = q
    }
    expect(p.some(q => q.z > 8)).toBe(true) // it went over the top
  })

  it('finds no path into a closed room', () => {
    const g = new NavGrid(0, 0, 10, 10)
    for (const [x, z, w, d] of [[5, 3, 4, 0.3], [5, 7, 4, 0.3], [3, 5, 0.3, 4], [7, 5, 0.3, 4]]) g.blockRect(x, z, w, d, 0)
    expect(g.path({ x: 1, z: 1 }, { x: 5, z: 5 })).toEqual([])
  })

  it('does not squeeze diagonally between two blocked corners', () => {
    const g = new NavGrid(0, 0, 2, 2, 1)
    g.blockRect(1.5, 0.5, 0.9, 0.9, 0)
    g.blockRect(0.5, 1.5, 0.9, 0.9, 0)
    expect(g.path({ x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 })).toEqual([])
  })

  it('starts from the nearest walkable cell when standing in a blocked one', () => {
    const g = new NavGrid(0, 0, 10, 10)
    g.blockRect(1, 1, 1, 1, 0)
    expect(g.path({ x: 1, z: 1 }, { x: 8, z: 8 }).length).toBeGreaterThan(0)
  })
})
