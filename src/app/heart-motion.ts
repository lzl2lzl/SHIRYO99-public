export const HEART_PATH = 'M16 28S3 20.2 3 11.6C3 3.8 12.8 2.5 16 8.6c3.2-6.1 13-4.8 13 3C29 20.2 16 28 16 28Z'
export const ENTRY_DURATION = 1150
export const REPLAY_DURATION = 2100
export interface HeartPoint { x: number; y: number }
export const clampUnit = (value: number) => Math.max(0, Math.min(1, value))
export const easeOut = (value: number) => 1 - (1 - clampUnit(value)) ** 3

export function heartFlight(from: HeartPoint, to: HeartPoint, progress: number): HeartPoint {
  const t = easeOut(progress)
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 44 }
}

/** The heart contains a circle of radius 6 around (16,17). Cover every viewport corner. */
export function heartCoverScale(point: HeartPoint, width: number, height: number): number {
  return Math.hypot(Math.max(point.x, width - point.x), Math.max(point.y, height - point.y)) / 6 + 1
}
