export const HEART_PATH = 'M16 28S3 20.2 3 11.6C3 3.8 12.8 2.5 16 8.6c3.2-6.1 13-4.8 13 3C29 20.2 16 28 16 28Z'
export const ENTRY_DURATION = 1150
export const REPLAY_DURATION = 3400
export interface HeartPoint { x: number; y: number }
export const clampUnit = (value: number) => Math.max(0, Math.min(1, value))
export const easeOut = (value: number) => 1 - (1 - clampUnit(value)) ** 3

/** Light the ring, reveal 99, then accelerate two turns before offering either action. */
export function replayFrame(progress: number) {
  const elapsed = clampUnit(progress) * REPLAY_DURATION
  const spin = clampUnit((elapsed - 1320) / 1680)
  const actions = clampUnit((elapsed - 3000) / 400)
  return {
    lights: Array.from({ length: 8 }, (_, index) => clampUnit((elapsed - index * 110) / 100)),
    core: easeOut((elapsed - 960) / 300),
    rotation: spin ** 2 * Math.PI * 4,
    glow: clampUnit((elapsed - 1260) / 260) * (1 - actions * .65),
    ready: elapsed >= 3000,
    actions,
    phase: elapsed < 960 ? 'lighting' : elapsed < 1320 ? 'core' : elapsed < 3000 ? 'spinning' : 'ready',
  }
}

export function heartFlight(from: HeartPoint, to: HeartPoint, progress: number): HeartPoint {
  const t = easeOut(progress)
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 44 }
}

/** The heart contains a circle of radius 6 around (16,17). Cover every viewport corner. */
export function heartCoverScale(point: HeartPoint, width: number, height: number): number {
  return Math.hypot(Math.max(point.x, width - point.x), Math.max(point.y, height - point.y)) / 6 + 1
}
