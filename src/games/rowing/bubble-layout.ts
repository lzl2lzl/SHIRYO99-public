export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }

/** Quiet asides hug the hull rather than reserving the full sweep of its oars. */
export function coupleTextBounds(center: Point, angle: number, scale: number): Rect {
  const c = Math.cos(angle), s = Math.sin(angle)
  const x = Math.hypot(68 * c, 102 * s) * scale, y = Math.hypot(68 * s, 102 * c) * scale
  return { left: center.x - x, right: center.x + x, top: center.y - y, bottom: center.y + y }
}

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
