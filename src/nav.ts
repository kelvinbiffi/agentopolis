// Walking on the lot: a grid of cells over the ground, blocked where there
// are buildings and furniture, A* with eight directions and an octile
// heuristic, then string-pulling so the robots walk in straight lines and
// cut corners only where nothing is in the way.

export interface Point { x: number; z: number }

export class NavGrid {
  readonly cell: number
  readonly minX: number
  readonly minZ: number
  readonly cols: number
  readonly rows: number
  private blocked: Uint8Array

  constructor(minX: number, minZ: number, maxX: number, maxZ: number, cell = 0.25) {
    this.cell = cell
    this.minX = minX
    this.minZ = minZ
    this.cols = Math.ceil((maxX - minX) / cell)
    this.rows = Math.ceil((maxZ - minZ) / cell)
    this.blocked = new Uint8Array(this.cols * this.rows)
  }

  /** Blocks an axis-aligned rectangle (centre and size in world units), with a margin. */
  blockRect(cx: number, cz: number, w: number, d: number, margin = 0.08) {
    const x0 = this.col(cx - w / 2 - margin), x1 = this.col(cx + w / 2 + margin)
    const z0 = this.row(cz - d / 2 - margin), z1 = this.row(cz + d / 2 + margin)
    for (let r = Math.max(0, z0); r <= Math.min(this.rows - 1, z1); r++)
      for (let c = Math.max(0, x0); c <= Math.min(this.cols - 1, x1); c++) this.blocked[r * this.cols + c] = 1
  }

  /** Frees a rectangle again (a seat inside a furniture footprint). */
  freeRect(cx: number, cz: number, w: number, d: number) {
    const x0 = this.col(cx - w / 2), x1 = this.col(cx + w / 2)
    const z0 = this.row(cz - d / 2), z1 = this.row(cz + d / 2)
    for (let r = Math.max(0, z0); r <= Math.min(this.rows - 1, z1); r++)
      for (let c = Math.max(0, x0); c <= Math.min(this.cols - 1, x1); c++) this.blocked[r * this.cols + c] = 0
  }

  col(x: number) { return Math.floor((x - this.minX) / this.cell) }
  row(z: number) { return Math.floor((z - this.minZ) / this.cell) }
  private centre(c: number, r: number): Point { return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell } }

  walkable(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0
  }

  walkableAt(p: Point) { return this.walkable(this.col(p.x), this.row(p.z)) }

  /** The nearest walkable cell to a point (searching outwards), or null. */
  nearestWalkable(p: Point, maxRadius = 12): [number, number] | null {
    const c0 = this.col(p.x), r0 = this.row(p.z)
    if (this.walkable(c0, r0)) return [c0, r0]
    for (let k = 1; k <= maxRadius; k++)
      for (let dr = -k; dr <= k; dr++)
        for (let dc = -k; dc <= k; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== k) continue
          if (this.walkable(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr]
        }
    return null
  }

  /** A walking path from a to b (world points, b included), or [] when there is none. */
  path(a: Point, b: Point): Point[] {
    const s = this.nearestWalkable(a), g = this.nearestWalkable(b)
    if (!s || !g) return []
    const [sc, sr] = s, [gc, gr] = g
    const N = this.cols * this.rows
    const gScore = new Float32Array(N).fill(Infinity)
    const came = new Int32Array(N).fill(-1)
    const closed = new Uint8Array(N)
    const heap = new MinHeap()
    const start = sr * this.cols + sc, goal = gr * this.cols + gc
    gScore[start] = 0
    heap.push(start, octile(sc, sr, gc, gr))
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
    while (heap.size) {
      const cur = heap.pop()
      if (cur === goal) break
      if (closed[cur]) continue
      closed[cur] = 1
      const cc = cur % this.cols, cr = (cur - cc) / this.cols
      for (const [dc, dr, cost] of D) {
        const nc = cc + dc, nr = cr + dr
        if (!this.walkable(nc, nr)) continue
        // no squeezing diagonally between two blocked cells
        if (dc && dr && (!this.walkable(cc + dc, cr) || !this.walkable(cc, cr + dr))) continue
        const n = nr * this.cols + nc
        const tentative = gScore[cur] + cost
        if (tentative < gScore[n]) {
          gScore[n] = tentative
          came[n] = cur
          heap.push(n, tentative + octile(nc, nr, gc, gr))
        }
      }
    }
    if (start !== goal && came[goal] < 0) return []
    const cells: Point[] = []
    for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(this.centre(k % this.cols, Math.floor(k / this.cols)))
    cells.reverse()
    return this.smooth([a, ...cells, b])
  }

  /** String-pulling: drops the points a straight walk can skip. */
  private smooth(points: Point[]): Point[] {
    if (points.length <= 2) return points.slice(1)
    const out: Point[] = []
    let anchor = points[0]
    for (let i = 1; i < points.length - 1; i++) {
      if (!this.clear(anchor, points[i + 1])) {
        out.push(points[i])
        anchor = points[i]
      }
    }
    out.push(points[points.length - 1])
    return out
  }

  /** Whether the straight segment a→b crosses only walkable cells. */
  clear(a: Point, b: Point) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.ceil(dist / (this.cell * 0.5))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (!this.walkableAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false
    }
    return true
  }
}

function octile(c: number, r: number, gc: number, gr: number) {
  const dx = Math.abs(c - gc), dy = Math.abs(r - gr)
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)
}

/** A binary heap of (index, priority). */
class MinHeap {
  private idx: number[] = []
  private pri: number[] = []
  get size() { return this.idx.length }
  push(i: number, p: number) {
    this.idx.push(i); this.pri.push(p)
    let k = this.idx.length - 1
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (this.pri[parent] <= this.pri[k]) break
      this.swap(k, parent); k = parent
    }
  }
  pop(): number {
    const top = this.idx[0]
    const lastI = this.idx.pop()!, lastP = this.pri.pop()!
    if (this.idx.length) {
      this.idx[0] = lastI; this.pri[0] = lastP
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1
        let m = k
        if (l < this.idx.length && this.pri[l] < this.pri[m]) m = l
        if (r < this.idx.length && this.pri[r] < this.pri[m]) m = r
        if (m === k) break
        this.swap(k, m); k = m
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    ;[this.idx[a], this.idx[b]] = [this.idx[b], this.idx[a]]
    ;[this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]]
  }
}
