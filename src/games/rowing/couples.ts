import { calendarAt } from './calendar.ts'
import { trafficCenter, RIVER_START_MINUTE } from './river.ts'
export { riverCenter } from './river.ts'
export type CoupleStyle = 'steady' | 'resting' | 'wobbly' | 'fast' | 'distracted'
export interface CoupleMotion {
  speed: number; lane: number; amplitude: number; frequency: number; phase: number; pulseFrequency: number; pulsePhase: number
  style: CoupleStyle; direction: number; pauseLength: number; cycle: number
}
export interface CoupleBoat {
  id: number; x: number; y: number; heading: number; motion?: CoupleMotion
  chiefChecked?: boolean; chiefSurname?: string; chiefGreeted?: boolean; chiefNight?: number
  chiefTalking?: boolean
  departing?: boolean; departureReason?: 'collision' | 'spin' | 'closing'; departureRemark?: boolean
  accidentalContact?: boolean; nextChatAt?: number; strokePhase?: number; stopped?: boolean
}
export interface Hull { x: number; y: number; heading: number }
export const COUPLE_COUNT = 7
export const CONTACT_DISTANCE = 110
export const CLEARANCE = 128
export function coupleVisible(boat: CoupleBoat, cameraY: number, cameraX = 0) {
  return boat.y + 160 >= cameraY && boat.y - 160 <= cameraY + 700 && boat.x + 160 >= cameraX && boat.x - 160 <= cameraX + 390
}
export function coupleTarget(minutes: number) {
  const hour = ((minutes / 60) % 24 + 24) % 24
  const calendar = calendarAt(minutes)
  if (calendar.allDayRomance) return 9
  if (calendar.busy && hour >= 6 && hour < 23.5) return hour < 23 ? 9 : 5
  return hour < 6 || hour >= 23.5 ? 0 : hour < 12 ? 3 : hour < 23 ? COUPLE_COUNT : 3
}
export function createCoupleMotion(random: () => number = Math.random): CoupleMotion {
  const draw = random(), style: CoupleStyle = draw < .35 ? 'steady' : draw < .55 ? 'resting' : draw < .75 ? 'wobbly' : draw < .9 ? 'fast' : 'distracted'
  return { style, direction: random() < .35 ? -1 : 1, speed: (style === 'fast' ? 28 : 14) + random() * 7,
    lane: (random() < .5 ? -1 : 1) * (65 + random() * 35), amplitude: style === 'wobbly' ? 35 + random() * 20 : 10 + random() * 15,
    frequency: .14 + random() * .18, phase: random() * Math.PI * 2, pulseFrequency: 3.5 + random() * 1.8,
    pulsePhase: random() * Math.PI * 2, pauseLength: 7 + random() * 6, cycle: 24 + random() * 12 }
}
export function createCouple(id: number, y: number, random: () => number = Math.random, minutes = RIVER_START_MINUTE, cameraX = 0): CoupleBoat {
  const motion = createCoupleMotion(random)
  return { id, x: trafficCenter(y, minutes, cameraX) + motion.lane, y, heading: motion.direction > 0 ? Math.PI : 0, motion }
}
function samples(hull: Hull) {
  return [-40, 0, 40].map(offset => ({ x: hull.x + Math.sin(hull.heading) * offset, y: hull.y - Math.cos(hull.heading) * offset }))
}
export function hullContact(a: Hull, b: Hull) {
  let best = { dx: b.x - a.x, dy: b.y - a.y, distance: Infinity }
  for (const p of samples(a)) for (const q of samples(b)) {
    const dx = q.x - p.x, dy = q.y - p.y, distance = Math.hypot(dx, dy)
    if (distance < best.distance) best = { dx, dy, distance }
  }
  return best
}
export function departCouple(boat: CoupleBoat, player: Hull, reason: 'collision' | 'spin' | 'closing') {
  if (boat.departing || boat.chiefTalking) return
  boat.departing = true; boat.departureReason = reason
  const motion = boat.motion ??= createCoupleMotion()
  motion.direction = boat.y >= player.y ? 1 : -1
  motion.lane = (boat.x >= player.x ? 1 : -1) * 108
}

/** Boat-sized collision capsules, individual rowing strokes, and a persistent route away from trouble. */
export function moveCouple(boat: CoupleBoat, player: Hull & { spin?: number; velocityX?: number; velocityY?: number }, elapsed: number, dt: number, peers: CoupleBoat[] = [], minutes = RIVER_START_MINUTE, cameraX = 0, hold?: { x: number; y: number }) {
  if (!Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, .1)
  const motion = boat.motion ??= createCoupleMotion()
  const proximity = Math.hypot(boat.x - player.x, boat.y - player.y)
  if (Math.abs(player.spin ?? 0) > 1.05 && proximity < 285) departCouple(boat, player, 'spin')
  boat.stopped = !boat.departing && motion.style === 'resting' && (elapsed + motion.phase * 3) % motion.cycle < motion.pauseLength
  boat.strokePhase = elapsed * motion.pulseFrequency + motion.pulsePhase
  const lane = trafficCenter(boat.y, minutes, cameraX) + motion.lane + Math.sin(elapsed * motion.frequency + motion.phase) * motion.amplitude
  let vx = (lane - boat.x) * .5
  let vy = motion.direction * (boat.departing ? 38 : boat.stopped ? .8 : motion.speed * (.82 + .18 * Math.sin(boat.strokePhase)))
  if (boat.stopped) vx *= .06
  if (motion.style === 'wobbly' && !boat.departing) vx += Math.sin(elapsed * .9 + motion.phase) * 8
  if (hold) {
    vx = (hold.x - boat.x) * .8; vy = (hold.y - boat.y) * .8
    boat.stopped = Math.hypot(vx, vy) < 2
  }
  const accidental = motion.style === 'distracted' && !boat.accidentalContact && !boat.departing && !boat.chiefSurname
  if (!hold && !accidental && !boat.stopped && hullContact(player, boat).distance < 190) {
    // Yield along the river before the two full-sized hulls get stuck abreast.
    const away = boat.y >= player.y ? 1 : -1
    motion.direction = away
    vy = away * Math.max(Math.abs(vy), 16)
  }
  for (const peer of peers) {
    if (peer.id === boat.id || !peer.motion || hullContact(peer, boat).distance >= 190) continue
    // Give a departing boat room without turning every incoming boat back at the river entrance.
    if (!hold && !boat.departing && peer.departing && motion.direction !== peer.motion.direction) {
      motion.direction = peer.motion.direction
      vy = motion.direction * Math.max(Math.abs(vy), peer.departing ? 30 : 18)
      boat.stopped = false
    }
  }
  const clearance = accidental ? CONTACT_DISTANCE - 2 : CLEARANCE
  const obstacles: Hull[] = [player, ...peers.filter(p => p.id !== boat.id && Math.abs(p.y - boat.y) < 300)]
  for (const obstacle of obstacles) {
    const contact = hullContact(obstacle, boat)
    if (contact.distance >= 175 || (accidental && obstacle === player)) continue
    const dx = boat.x - obstacle.x, dy = boat.y - obstacle.y, distance = Math.hypot(dx, dy) || 1
    const strength = (175 - contact.distance) / 65
    const nx = dx / distance, ny = dy / distance
    const closing = Math.min(0, (vx - (obstacle === player ? player.velocityX ?? 0 : 0)) * nx + (vy - (obstacle === player ? player.velocityY ?? 0 : 0)) * ny)
    vx -= closing * nx; vy -= closing * ny
    vx += (dx >= 0 ? 1 : -1) * strength * 16
    vy += ny * strength * 10
  }
  // Keep local traffic spacing identical as the world expands; this lane follows the neighbourhood.
  const bank = trafficCenter(boat.y, minutes, cameraX)
  const limit = 112
  if (boat.x > bank + limit) vx = Math.min(vx, (bank + limit - boat.x) * 1.5)
  if (boat.x < bank - limit) vx = Math.max(vx, (bank - limit - boat.x) * 1.5)
  const speed = Math.hypot(vx, vy), maximum = boat.departing ? 42 : 35
  if (speed > maximum) { vx *= maximum / speed; vy *= maximum / speed }
  const oldHeading = boat.heading, oldX = boat.x, oldY = boat.y
  const safe = (x: number, y: number, heading: number) => obstacles.every(obstacle => {
    const before = hullContact(obstacle, { x: oldX, y: oldY, heading: oldHeading }).distance
    return hullContact(obstacle, { x, y, heading }).distance >= Math.min(obstacle === player ? clearance : CLEARANCE, before) - 1e-6
  })
  const target = hold && speed < 2 ? boat.heading : Math.atan2(vx, -vy), turn = Math.atan2(Math.sin(target - boat.heading), Math.cos(target - boat.heading))
  let heading = boat.heading + Math.max(-.7 * dt, Math.min(.7 * dt, turn))
  if (!safe(oldX, oldY, heading)) heading = oldHeading
  let fraction = 1
  while (fraction > .015 && !safe(oldX + vx * dt * fraction, oldY + vy * dt * fraction, heading)) fraction /= 2
  if (fraction <= .015) {
    // Find a clear sidestep instead of freezing behind the player's circling boat.
    let found = false
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12, x = oldX + Math.cos(angle) * 9 * dt, y = oldY + Math.sin(angle) * 9 * dt
      if (Math.abs(x - trafficCenter(y, minutes, cameraX)) <= limit + 6 && safe(x, y, oldHeading)) { boat.x = x; boat.y = y; found = true; break }
    }
    if (!found) { boat.x = oldX; boat.y = oldY }
  } else { boat.x += vx * dt * fraction; boat.y += vy * dt * fraction; boat.heading = heading }
}
