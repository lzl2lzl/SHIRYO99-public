import { SPACE_MILESTONES, upgradeAt } from './progression/catalog.ts'
export const RIVER_START_MINUTE = 18 * 60
export const INITIAL_HALF_WIDTH = 169

/** Meet each manoeuvre's space requirement by its upgrade morning, without widening jumps. */
export function riverScale(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= RIVER_START_MINUTE) return 1
  for (let i = 1; i < SPACE_MILESTONES.length; i++) {
    const a = SPACE_MILESTONES[i - 1], b = SPACE_MILESTONES[i]
    const start = a.week ? upgradeAt(a.week) : RIVER_START_MINUTE, end = upgradeAt(b.week)
    if (minutes <= end) {
      const t = Math.max(0, Math.min(1, (minutes - start) / (end - start)))
      const smooth = t * t * (3 - 2 * t)
      return a.scale + (b.scale - a.scale) * smooth
    }
  }
  const last = SPACE_MILESTONES[SPACE_MILESTONES.length - 1]
  const weeks = (minutes - upgradeAt(last.week)) / (7 * 1440)
  return last.scale + .5 * Math.log2(1 + weeks * weeks)
}

export function riverHalfWidth(minutes: number) { return INITIAL_HALF_WIDTH * riverScale(minutes) }
export function riverCenter(y: number) { return 195 + Math.sin(y / 420) * 22 + Math.sin(y / 190) * 12 }

/** Populate a boat-sized neighbourhood, rather than spreading a fixed fleet across the whole river. */
export function trafficCenter(y: number, minutes: number, cameraX: number) {
  const extra = riverHalfWidth(minutes) - INITIAL_HALF_WIDTH
  return riverCenter(y) + Math.max(-extra, Math.min(extra, cameraX))
}
