export const READ_UNTIL = 2.85
export const CONDENSE_UNTIL = 3.3
export const FLY_UNTIL = 4.05
export const LEVEL_UP_SECONDS = 4.4
export interface LightPoint { x: number; y: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n))
export const flightPoint = (progress: number, start: LightPoint, end: LightPoint): LightPoint => {
  const t = clamp(progress), inverse = 1 - t
  const control = { x: Math.max(start.x, end.x) + 18, y: start.y - 35 }
  return { x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y }
}
/** Foreground-clock choreography: resizing and restoring a save recalculate the same phase. */
export function revealFrame(age: number, start: LightPoint, end: LightPoint, reduced = false) {
  const safeAge = Number.isFinite(age) ? Math.max(0, age) : 0
  const collapse = clamp((safeAge - READ_UNTIL) / (CONDENSE_UNTIL - READ_UNTIL))
  const flight = clamp((safeAge - CONDENSE_UNTIL) / (FLY_UNTIL - CONDENSE_UNTIL))
  const arrival = clamp((safeAge - FLY_UNTIL) / (LEVEL_UP_SECONDS - FLY_UNTIL))
  const phase = safeAge < READ_UNTIL ? 'read' : safeAge < CONDENSE_UNTIL ? 'condense' : safeAge < FLY_UNTIL ? 'fly' : 'arrive'
  return { phase, collapse, flight, arrival,
    textOpacity: 1 - collapse, textScale: reduced ? 1 : 1 - .96 * collapse ** 2,
    lightOpacity: reduced ? 0 : collapse * (1 - arrival),
    position: flightPoint(flight ** 1.5, start, end),
  }
}
