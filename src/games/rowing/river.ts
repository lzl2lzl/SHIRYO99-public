export const RIVER_START_MINUTE = 18 * 60
export const INITIAL_HALF_WIDTH = 169

/** Seven elapsed days reach 1.5×; later weeks grow continuously, at a gentler rate. */
export function riverScale(minutes: number) {
  const days = Math.max(0, (minutes - RIVER_START_MINUTE) / 1440)
  return 1 + .5 * Math.log2(1 + days / 7)
}

export function riverHalfWidth(minutes: number) { return INITIAL_HALF_WIDTH * riverScale(minutes) }
export function riverCenter(y: number) { return 195 + Math.sin(y / 420) * 22 + Math.sin(y / 190) * 12 }

/** Populate a boat-sized neighbourhood, rather than spreading a fixed fleet across the whole river. */
export function trafficCenter(y: number, minutes: number, cameraX: number) {
  const extra = riverHalfWidth(minutes) - INITIAL_HALF_WIDTH
  return riverCenter(y) + Math.max(-extra, Math.min(extra, cameraX))
}
