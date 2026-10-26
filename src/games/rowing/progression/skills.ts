import { createEvolution, pairTechnique, speedLimit, type EvolutionRuntime } from './evolution.ts'
export type SkillRower = 'shiro' | 'ryo'
export interface SkillMotion { speed: number; spin: number; heading: number }
interface StrokeMark { who: SkillRower; at: number }
export interface SkillRuntime {
  waiting: StrokeMark | null
  lastPairAt: number
  streak: number
  pairs: number
  dashUntil: number
  wakeTimer: number
  wake: { x: number; y: number; heading: number; age: number }[]
  evolution: EvolutionRuntime
}
export const createSkillRuntime = (): SkillRuntime => ({ waiting: null, lastPairAt: -Infinity, streak: 0, pairs: 0, dashUntil: 0, wakeTimer: 0, wake: [], evolution: createEvolution() })
export const PAIR_WINDOW = .18
export const STREAK_WINDOW = 1.4

/** Technique changes only a successful forward stroke, never Ryo's willingness draw. */
export function strokeTechnique(level: number, who: SkillRower, reverse: boolean) {
  const trained = !reverse && level >= (who === 'shiro' ? 1 : 2)
  const engine = reverse ? 1 : level >= 26 ? 1.95 : level >= 25 ? 1.6 : level >= 24 ? 1.35 : 1
  return { thrust: (trained ? 1.12 : 1) * engine, turn: (trained ? .84 : 1) * (!reverse && level >= 21 && who === 'shiro' ? .65 : 1) }
}

export function breakCooperation(runtime: SkillRuntime) {
  runtime.waiting = null; runtime.streak = 0
}

/** Pair only two real forward strokes, once each, in either input order. */
export function recordForwardStroke(runtime: SkillRuntime, motion: SkillMotion, level: number, who: SkillRower, elapsed: number, danger = false) {
  if (level < 3) return
  const waiting = runtime.waiting
  if (!waiting || waiting.who === who || elapsed - waiting.at > PAIR_WINDOW || elapsed < waiting.at) {
    runtime.waiting = { who, at: elapsed }
    return
  }
  runtime.waiting = null
  runtime.streak = elapsed - runtime.lastPairAt <= STREAK_WINDOW ? Math.min(4, runtime.streak + 1) : 1
  runtime.lastPairAt = elapsed; runtime.pairs++; runtime.dashUntil = elapsed + 1.15
  if (pairTechnique(runtime.evolution, motion, level, elapsed, runtime.streak, danger) === 'brake') {
    runtime.streak = 0; runtime.dashUntil = elapsed; return
  }
  motion.spin *= .18
  motion.speed = Math.min(speedLimit(level), motion.speed + 10 + (level >= 4 ? runtime.streak * 3 : 0))
}

export function skillSpeedLimit(level: number) { return speedLimit(level) }
export function skillSpinDrag(level: number, idle: boolean, dashing: boolean) {
  return .2 + (level >= 1 && idle ? .2 : 0) + (level >= 3 && dashing ? .8 : 0)
}
export function bowLift(runtime: SkillRuntime, level: number, elapsed: number) {
  return level >= 4 && runtime.streak >= 2 ? Math.max(0, Math.min(1, (runtime.dashUntil - elapsed) / .45)) : 0
}
export function tickSkillRuntime(runtime: SkillRuntime, dt: number, elapsed: number, boat: { x: number; y: number; heading: number }) {
  if (!Number.isFinite(dt) || dt <= 0) return
  for (const p of runtime.wake) p.age += dt
  runtime.wake = runtime.wake.filter(p => p.age < 1.8)
  if (runtime.waiting && elapsed - runtime.waiting.at > PAIR_WINDOW) runtime.waiting = null
  if (elapsed - runtime.lastPairAt > STREAK_WINDOW) runtime.streak = 0
  if (elapsed < Math.max(runtime.dashUntil, runtime.evolution.tailStarsUntil, runtime.evolution.starUntil, runtime.evolution.meteorUntil)) {
    runtime.wakeTimer += dt
    if (runtime.wakeTimer >= .12) {
      runtime.wakeTimer = 0
      runtime.wake.push({ x: boat.x, y: boat.y, heading: boat.heading, age: 0 })
      if (runtime.wake.length > 24) runtime.wake.shift()
    }
  } else runtime.wakeTimer = 0
}
