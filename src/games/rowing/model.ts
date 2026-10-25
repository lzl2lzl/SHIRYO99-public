export type Rower = 'shiro' | 'ryo'
export type RowAction = 'rest' | 'stroke' | 'strong' | 'refuse' | 'push' | 'reverse'
export type Period = 'morning' | 'noon' | 'sunset' | 'night'
export const MINUTES_PER_SECOND = 3
export const EVENING_MINUTE = 18 * 60
export const EVENING_LINE_SECONDS = 3.2
export const STROKE_COOLDOWN = .55
export const COUPLE_COUNT = 8
export const COMPLAINTS = ['啊！', '小心一点，没素质的家伙！', '你撞到我女朋友了！！']
export const APOLOGIES = ['不好意思。', '真的非常不好意思。', '非常抱歉，我们会注意的。']
export interface CoupleBoat { id: number; x: number; y: number; heading: number }
export interface Encounter { boatId: number; complaint: string; apology: string; age: number }
export function riverCenter(y: number) { return 195 + Math.sin(y / 420) * 22 + Math.sin(y / 190) * 12 }
export const EVENING_LINES = [
  { speaker: '宇都木士郎', who: 'shiro' as const, text: '该回家了，明天还有工作。' },
  { speaker: '月云了', who: 'ryo' as const, text: '你以为我不想吗！！！' },
]

export interface RowingState {
  elapsed: number
  minutes: number
  x: number
  y: number
  heading: number
  spin: number
  speed: number
  effort: boolean
  eveningSeen: boolean
  dialogue: number | null
  dialogueAge: number
  lastShiro: number
  lastRyo: number
  shiroAction: RowAction
  ryoAction: RowAction
  shiroUntil: number
  ryoUntil: number
  laughUntil: number
  shiroStrokes: number
  ryoStrokes: number
  taps: number
  distance: number
  turnTravel: number
  trail: { x: number; y: number; age: number }[]
  trailTimer: number
  cameraY: number
  couples: CoupleBoat[]
  nextCoupleId: number
  encounter: Encounter | null
  collisionCooldown: number
  collisions: number
}

export function createRowing(): RowingState {
  return {
    elapsed: 0, minutes: 9 * 60, x: 195, y: 370, heading: Math.PI, spin: 0, speed: 0,
    effort: false, eveningSeen: false, dialogue: null, dialogueAge: 0,
    lastShiro: -100, lastRyo: -100, shiroAction: 'rest', ryoAction: 'rest',
    shiroUntil: 0, ryoUntil: 0, laughUntil: 0, shiroStrokes: 0, ryoStrokes: 0,
    taps: 0, distance: 0, turnTravel: 0, trail: [], trailTimer: 0,
    cameraY: 0, couples: [-160, 0, 170, 540, 700, 850, 1000, 1150].map((y, id) => ({
      id, x: riverCenter(y) + Math.sin(id * 2.3) * 78, y, heading: Math.PI + Math.sin(id) * .25,
    })), nextCoupleId: COUPLE_COUNT, encounter: null, collisionCooldown: 0, collisions: 0,
  }
}

export function periodAt(minutes: number): Period {
  const hour = ((minutes / 60) % 24 + 24) % 24
  return hour < 6 || hour >= 18 ? 'night' : hour < 11 ? 'morning' : hour < 16 ? 'noon' : 'sunset'
}

export function clockAt(minutes: number) {
  const whole = Math.floor(minutes + 1e-7)
  return `${String(Math.floor(whole / 60) % 24).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function impulse(state: RowingState, who: Rower, reverse = false, strength = 1) {
  const direction = reverse ? -1 : 1
  state.spin = Math.max(-2.5, Math.min(2.5, state.spin + (who === 'shiro' ? .72 : -.72) * direction * strength))
  state.speed = Math.max(-22, Math.min(54, state.speed + 18 * direction * strength))
  if (who === 'shiro') {
    state.shiroAction = 'stroke'; state.shiroUntil = state.elapsed + .7; state.shiroStrokes++
  } else {
    state.ryoAction = reverse ? 'reverse' : strength > 1 ? 'strong' : 'stroke'; state.ryoUntil = state.elapsed + .7; state.ryoStrokes++
  }
}

/** Starts reluctant at 09:00; forward outcomes together never exceed 50%, even after midnight. */
export function ryoForwardChance(minutes: number) {
  return .05 + .45 * Math.max(0, Math.min(1, (minutes - 9 * 60) / (EVENING_MINUTE - 9 * 60)))
}

/** Independent weighted draws: no sequence, pity counter, or dependence on tapping rhythm. */
export function row(state: RowingState, who: Rower, random: () => number = Math.random): RowAction | null {
  const since = state.elapsed - (who === 'shiro' ? state.lastShiro : state.lastRyo)
  if (since < STROKE_COOLDOWN) return null
  state.taps++
  if (who === 'shiro') {
    state.lastShiro = state.elapsed
    impulse(state, who)
    return 'stroke'
  }
  state.lastRyo = state.elapsed
  const chance = Math.max(0, Math.min(.9999, random()))
  const forwardChance = ryoForwardChance(state.minutes)
  if (chance < forwardChance) {
    impulse(state, who, false, chance >= forwardChance * .8 ? 1.45 : 1)
    return state.ryoAction
  }
  if (state.effort) {
    impulse(state, who, true)
    return state.ryoAction
  }
  if (chance < forwardChance + (1 - forwardChance) / 2) {
    state.ryoAction = 'refuse'; state.ryoUntil = state.elapsed + .85
    return 'refuse'
  }
  state.ryoAction = 'push'; state.ryoUntil = state.elapsed + .8
  impulse(state, 'shiro')
  if (periodAt(state.minutes) === 'morning') state.laughUntil = state.elapsed + 1.8
  return 'push'
}

/** Foreground simulation only; a suspended tab never catches up wall-clock time. */
export function tickRowing(state: RowingState, dt: number, random: () => number = Math.random) {
  if (!Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, .1)
  state.elapsed += dt
  if (state.elapsed >= state.shiroUntil) state.shiroAction = 'rest'
  if (state.elapsed >= state.ryoUntil) state.ryoAction = 'rest'
  if (state.dialogue !== null) {
    state.dialogueAge += dt
    if (state.dialogueAge >= EVENING_LINE_SECONDS) {
      state.dialogueAge -= EVENING_LINE_SECONDS
      if (state.dialogue === 0) { state.dialogue = 1; state.effort = true }
      else state.dialogue = null
    }
  }
  state.minutes += dt * MINUTES_PER_SECOND
  if (!state.eveningSeen && state.minutes >= EVENING_MINUTE) {
    state.eveningSeen = true; state.dialogue = 0; state.dialogueAge = 0; state.laughUntil = 0; state.encounter = null
  }
  state.spin *= Math.exp(-.2 * dt)
  state.speed *= Math.exp(-.65 * dt)
  state.heading += state.spin * dt
  state.turnTravel += Math.abs(state.spin * dt)
  // A tight turn spends force on circling, not forward travel.
  const travel = state.speed * dt / (1 + Math.abs(state.spin) * 2.4)
  state.x += Math.sin(state.heading) * travel
  state.y += -Math.cos(state.heading) * travel + 6 * dt
  state.distance += Math.abs(travel)
  // The river is unbounded longitudinally; a following camera replaces the old invisible end wall.
  const center = riverCenter(state.y)
  state.x += (Math.max(center - 95 - state.x, 0) - Math.max(state.x - center - 95, 0)) * dt * 2
  state.cameraY += (state.y - 370 - state.cameraY) * (1 - Math.exp(-3 * dt))
  state.collisionCooldown = Math.max(0, state.collisionCooldown - dt)
  if (state.encounter) {
    state.encounter.age += dt
    if (state.encounter.age >= 5.8) state.encounter = null
  }
  for (const boat of state.couples) {
    boat.y += (3 + boat.id % 3) * dt
    boat.x += (riverCenter(boat.y) + Math.sin(boat.id * 2.3 + boat.y / 220) * 78 - boat.x) * dt * .08
    // Three hull samples approximate the long boat, rather than colliding with portrait pixels.
    let hit: { dx: number; dy: number; distance: number } | null = null
    for (const offset of [-48, 0, 48]) {
      const dx = boat.x - (state.x + Math.sin(state.heading) * offset)
      const dy = boat.y - (state.y - Math.cos(state.heading) * offset)
      const distance = Math.hypot(dx, dy)
      if (distance < 59 && (!hit || distance < hit.distance)) hit = { dx, dy, distance }
    }
    if (hit) {
      const nx = hit.distance > .01 ? hit.dx / hit.distance : 1
      const ny = hit.distance > .01 ? hit.dy / hit.distance : 0
      const overlap = 59 - hit.distance
      boat.x += nx * (overlap + .5); boat.y += ny * (overlap + .5)
      state.speed *= .7
      if (state.dialogue === null && !state.encounter && state.collisionCooldown === 0) {
        const pick = (choices: string[]) => choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]
        state.encounter = { boatId: boat.id, complaint: pick(COMPLAINTS), apology: pick(APOLOGIES), age: 0 }
        state.collisionCooldown = 9; state.collisions++; state.laughUntil = 0
        state.spin = Math.max(-2.5, Math.min(2.5, state.spin + nx * .22))
      }
    }
  }
  // Recycle only well outside the viewport, and keep a speaking boat alive until its exchange ends.
  for (let i = 0; i < state.couples.length; i++) {
    const boat = state.couples[i]
    if (state.encounter?.boatId === boat.id) continue
    if (boat.y < state.cameraY - 200 || boat.y > state.cameraY + 1300) {
      const id = state.nextCoupleId++
      const start = state.cameraY - 200
      const y = start + ((boat.y - start) % 1500 + 1500) % 1500
      state.couples[i] = { id, x: riverCenter(y) + Math.sin(id * 2.3) * 78, y, heading: Math.PI + Math.sin(id) * .25 }
    }
  }
  for (const point of state.trail) point.age += dt
  state.trail = state.trail.filter(point => point.age < 3)
  state.trailTimer += dt
  if (state.trailTimer >= .4 && (Math.abs(state.speed) > 1 || Math.abs(state.spin) > .1)) {
    state.trailTimer = 0
    state.trail.push({ x: state.x - Math.sin(state.heading) * 72, y: state.y + Math.cos(state.heading) * 72, age: 0 })
  }
}
