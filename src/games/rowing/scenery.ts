import { riverCenter, riverHalfWidth, RIVER_START_MINUTE } from './river.ts'

export function bankX(y: number, right: boolean, minutes = RIVER_START_MINUTE) {
  return riverCenter(y) + (right ? 1 : -1) * riverHalfWidth(minutes) + Math.sin(y / 135 + (right ? 2 : 0)) * 13
}

/** Continuous world-space riverbanks: moving the camera never swaps scenery beneath the boat. */
export function bankPath(cameraY: number, right: boolean, inset = 0, minutes = RIVER_START_MINUTE, cameraX = 0) {
  const start = Math.floor(cameraY / 90) * 90 - 180
  const points = Array.from({ length: 13 }, (_, i) => {
    const y = start + i * 90
    return { x: bankX(y, right, minutes) - cameraX + (right ? inset : -inset), y: y - cameraY }
  })
  const edge = right ? Math.max(500, ...points.map(p => p.x + 100)) : Math.min(-110, ...points.map(p => p.x - 100))
  let path = `M${edge} ${points[0].y}L${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], next = points[i + 1]
    path += `Q${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  return `${path}L${last.x} ${last.y}L${edge} ${last.y}Z`
}

export function riverDetails(cameraY: number) {
  const start = Math.floor(cameraY / 160) - 1
  return Array.from({ length: 8 }, (_, i) => {
    const id = start + i, y = id * 160 + 75
    return { id, y: y - cameraY, right: Math.abs(id % 2) === 1, x: 85 + ((id * 73 % 210) + 210) % 210 }
  })
}
