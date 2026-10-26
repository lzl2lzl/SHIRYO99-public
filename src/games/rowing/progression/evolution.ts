export interface EvolutionRuntime {
  charge: number; altitude: number; airUntil: number; surfUntil: number; meteorUntil: number
  tailUntil: number; tailStarsUntil: number; starUntil: number; binaryUntil: number; brakeUntil: number
  lastTail: number; realmMix: number; form: number
}
export interface Motion { x?: number; y?: number; speed: number; spin: number; heading: number }
export const createEvolution = (): EvolutionRuntime => ({ charge: 0, altitude: 0, airUntil: 0, surfUntil: 0, meteorUntil: 0,
  tailUntil: 0, tailStarsUntil: 0, starUntil: 0, binaryUntil: 0, brakeUntil: 0, lastTail: -1e12, realmMix: 0, form: 0 })
export const realmFor = (level: number) => level >= 20 ? 'galaxy' : level >= 16 ? 'clouds' : 'river'
export const realmAltitude = (mix: number) => Math.min(1, mix) * 72 + Math.max(0, mix - 1) * 38
export const craftScale = (e: EvolutionRuntime) => 1 + e.form * .12
export const speedLimit = (level: number) => level >= 26 ? 230 : level >= 25 ? 195 : level >= 24 ? 178 : level >= 20 ? 165 : level >= 19 ? 150 : level >= 16 ? 125 : level >= 15 ? 116 : level >= 12 ? 98 : level >= 8 ? 88 : level >= 4 ? 78 : level >= 3 ? 64 : 54
export function movementProfile(level: number, e: EvolutionRuntime, elapsed: number) {
  const airborne = e.altitude - realmAltitude(e.realmMix) > 24
  const meteor = elapsed < e.meteorUntil, surf = elapsed < e.surfUntil
  return { airborne, ceiling: speedLimit(level), drag: meteor ? .18 : airborne ? .25 : surf ? .36 : level >= 20 ? .36 : level >= 16 ? .4 : level >= 12 ? .48 : .65,
    turnLoss: level >= 26 ? .7 : meteor ? .85 : airborne ? 1.1 : surf ? 1.4 : level >= 12 ? 2.7 : 2.4 }
}

/** Only called for a real, commanded forward stroke. No input or willingness is synthesized. */
export function forwardTechnique(e: EvolutionRuntime, motion: Motion, level: number, who: 'shiro' | 'ryo', elapsed: number,
  neighbours: readonly { x: number; y: number }[] = [], tailDraw = 1) {
  if (who === 'shiro') {
    if (level >= 5 && Math.abs(motion.spin) > .5) motion.spin *= .55
    if (level >= 9 && motion.x !== undefined && motion.y !== undefined) {
      const forwardX = Math.sin(motion.heading), forwardY = -Math.cos(motion.heading)
      const nearest = neighbours.map(b => ({ dx: b.x - motion.x!, dy: b.y - motion.y! }))
        .filter(b => b.dx * forwardX + b.dy * forwardY > 0 && Math.hypot(b.dx, b.dy) < 250)
        .sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy))[0]
      if (nearest) {
        const side = nearest.dx * Math.cos(motion.heading) + nearest.dy * Math.sin(motion.heading)
        const turn = side >= 0 ? -1 : 1
        motion.heading += turn * .12; motion.spin += turn * .24
        if (Math.hypot(nearest.dx, nearest.dy) < 170) motion.speed *= .85
      }
    }
    if (level >= 13 && e.altitude - realmAltitude(e.realmMix) > 6) motion.spin *= .45
    if (level >= 17) { e.starUntil = elapsed + 2; motion.spin *= .85 }
    if (level >= 21 && Math.abs(motion.speed) > 50) motion.spin *= .6
  } else {
    if (level >= 6) { motion.spin *= .65; e.tailUntil = elapsed + .55 }
    if (level >= 10 && tailDraw < .22 && elapsed - e.lastTail >= 3) {
      motion.speed += 24; e.lastTail = elapsed; e.tailUntil = elapsed + .9
    }
    if (level >= 14 && e.altitude - realmAltitude(e.realmMix) > 6) e.airUntil = Math.min(elapsed + 5, Math.max(elapsed + .8, e.airUntil + .55))
    if (level >= 18) { e.tailStarsUntil = elapsed + 2.2; motion.speed += 4 }
    if (level >= 22 && Math.abs(motion.speed) > 45) { motion.heading += Math.sign(motion.spin) * .16; motion.spin *= .5 }
  }
  motion.spin = Math.max(-2.5, Math.min(2.5, motion.spin))
  motion.speed = Math.min(speedLimit(level), motion.speed)
}

/** Safety wins over acceleration. Spin energy is consumed at most once per admitted pair. */
export function pairTechnique(e: EvolutionRuntime, motion: Motion, level: number, elapsed: number, streak: number, danger = false) {
  if (level >= 7 && motion.speed > speedLimit(level) * .75 && (Math.abs(motion.spin) > .35 || danger)) {
    motion.speed *= .62; motion.spin *= .05; e.brakeUntil = elapsed + .7
    e.surfUntil = e.meteorUntil = e.binaryUntil = elapsed
    return 'brake'
  }
  if (level >= 8) { motion.speed += e.charge * .45; e.charge = 0 }
  if (level >= 11 && streak >= 2) e.surfUntil = elapsed + 2.5
  if (level >= 15 && streak >= 3) e.airUntil = elapsed + 4.2
  if (level >= 17) e.starUntil = elapsed + 2.2
  if (level >= 19) { e.meteorUntil = elapsed + 1.8; motion.speed += 30 }
  if (level >= 23) { e.binaryUntil = elapsed + 1.5; motion.speed += 18; motion.spin *= .5 }
  motion.speed = Math.min(speedLimit(level), motion.speed)
  return 'boost'
}

export function tickEvolution(e: EvolutionRuntime, level: number, elapsed: number, dt: number, motion: Motion) {
  if (!Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, .1)
  if (level >= 8 && Math.abs(motion.spin) > .2) e.charge = Math.min(100, e.charge + Math.abs(motion.spin) * dt * 7)
  const targetRealm = level >= 20 ? 2 : level >= 16 ? 1 : 0
  const targetForm = Math.max(0, level - 23)
  e.realmMix += (targetRealm - e.realmMix) * (1 - Math.exp(-dt))
  e.form += (Math.min(3, targetForm) - e.form) * (1 - Math.exp(-dt * 1.5))
  const elevation = level >= 15 && elapsed < e.airUntil ? 62 : level >= 12 && (Math.abs(motion.speed) > 28 || elapsed < e.airUntil) ? 12 : 0
  e.altitude += (realmAltitude(e.realmMix) + elevation - e.altitude) * (1 - Math.exp(-dt * (level >= 13 ? 3.5 : 2.5)))
  motion.speed = Math.max(-22, Math.min(speedLimit(level), motion.speed))
}
