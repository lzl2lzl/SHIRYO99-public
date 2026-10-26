export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }

export function overlaps(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** Protect the entire rotating boat, oars and both upright portraits, not just the speaker's face. */
export function rowingBounds(center: Point, angle: number, scale: number, seats: Point[]): Rect {
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
  const halfWidth = (110 * cos + 125 * sin) * scale
  const halfHeight = (110 * sin + 125 * cos) * scale
  return {
    left: Math.min(center.x - halfWidth, ...seats.map(p => p.x - 48 * scale)),
    right: Math.max(center.x + halfWidth, ...seats.map(p => p.x + 48 * scale)),
    top: Math.min(center.y - halfHeight, ...seats.map(p => p.y - 116 * scale)),
    bottom: Math.max(center.y + halfHeight, ...seats.map(p => p.y + 8 * scale)),
  }
}

export function placeResponse(view: { width: number; height: number }, anchor: Point, boat: Rect, width: number, height: number, speakerBoat?: Rect): { left: number; top: number; below: boolean; tailX: number } {
  const clampX = (x: number) => Math.max(16, Math.min(view.width - width - 16, x))
  const header = [
    { left: 24, top: 16, right: 84, bottom: 72 },
    { left: view.width - 134, top: 16, right: view.width - 24, bottom: 94 },
  ]
  const candidates = [false, true].flatMap(below => {
    const source = speakerBoat ?? boat
    const outside = below ? Math.max(source.bottom + 14, anchor.y + 20) : Math.min(source.top - height - 14, anchor.y - height - 20)
    // Near an edge, use the speaking boat's bow/stern before moving the bubble across the player's boat.
    const tops = speakerBoat ? [outside, below ? anchor.y + 20 : anchor.y - height - 20] : [outside]
    return tops.flatMap((top, proximity) => [anchor.x - width / 2, (view.width - width) / 2, 16, view.width - width - 16].map(x => {
      const left = clampX(x), rect = { left, top, right: left + width, bottom: top + height }
      const score = Math.hypot(left + width / 2 - anchor.x, (below ? top : top + height) - anchor.y)
        + (header.some(h => overlaps(rect, h)) ? 10000 : 0) + proximity * 180
      return { left, top, below, score, rect }
    }))
  }).filter(c => c.top >= 12 && c.top + height <= view.height - (speakerBoat ? 12 : 108) && !overlaps(c.rect, boat))
  candidates.sort((a, b) => a.score - b.score)
  // A short viewport may force the bubble above the scene's header; it must still never cover the boat.
  const result = candidates[0] ?? (speakerBoat ? placeResponse(view, anchor, boat, width, height) : { left: clampX(anchor.x - width / 2), top: boat.top - height - 14, below: false })
  return { left: result.left, top: result.top, below: result.below, tailX: Math.max(18, Math.min(width - 18, anchor.x - result.left)) }
}

/** Connect the bubble to the actual hull, including when avoiding the player displaced the bubble. */
export function coupleLeader(bubble: { left: number; top: number }, width: number, height: number, center: Point, heading: number, scale: number) {
  const middle = { x: bubble.left + width / 2, y: bubble.top + height / 2 }
  const dx = middle.x - center.x, dy = middle.y - center.y, distance = Math.hypot(dx, dy) || 1
  const nx = dx / distance, ny = dy / distance, c = Math.cos(heading), s = Math.sin(heading)
  const localX = c * nx + s * ny, localY = -s * nx + c * ny
  const radius = scale / Math.sqrt((localX / 68) ** 2 + (localY / 102) ** 2)
  const gap = Math.hypot(center.x - Math.max(bubble.left, Math.min(bubble.left + width, center.x)), center.y - Math.max(bubble.top, Math.min(bubble.top + height, center.y)))
  const reach = Math.min(radius, Math.max(0, gap - 12))
  const target = { x: center.x + nx * reach, y: center.y + ny * reach }
  const top = center.y < middle.y
  const start = { x: Math.max(bubble.left + 18, Math.min(bubble.left + width - 18, target.x)), y: top ? bubble.top : bubble.top + height }
  return { start, target }
}
