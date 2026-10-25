import { createDailyDialogue, tickDailyDialogue, type DailyDialogue } from './daily-dialogue.ts'

export type Rower = 'shiro' | 'ryo'
export type RowAction = 'rest' | 'stroke' | 'strong' | 'refuse' | 'push' | 'reverse' | 'miss'
export type Period = 'morning' | 'noon' | 'sunset' | 'night'
export const MINUTES_PER_SECOND = 3
export const START_MINUTE = 18 * 60
const FORWARD_RAMP_START = 19 * 60
export const EVENING_MINUTE = 22 * 60
export const EVENING_LINE_SECONDS = 3.2
export const STROKE_COOLDOWN = .55
export const COUPLE_COUNT = 8
export const COMPLAINTS = ['啊！', '小心一点，没素质的家伙！', '你撞到我女朋友了！！']
export const APOLOGIES = ['不好意思。', '真的非常不好意思。', '非常抱歉，我们会注意的。']
export const CHIEF_SURNAMES = ['佐藤', '铃木', '高桥', '田中', '渡边', '伊藤', '山本', '中村', '小林', '加藤', '吉田']
export interface CoupleMotion { speed: number; lane: number; amplitude: number; frequency: number; phase: number; pulseFrequency: number; pulsePhase: number }
export interface CoupleBoat { id: number; x: number; y: number; heading: number; motion?: CoupleMotion; chiefChecked?: boolean; chiefSurname?: string; chiefGreeted?: boolean; chiefNight?: number }
export interface Encounter { boatId: number; complaint: string; apology: string; age: number }
export interface ChiefVisit { boatId: number; surname: string; line: number; age: number; masked: boolean; done: boolean }
export function chiefLines(surname: string) {
  return [
    { who: 'couple', speaker: surname, text: '咦，这不是宇都木吗？' },
    { who: 'ryo', speaker: '月云了', text: '！' },
    { who: 'shiro', speaker: '宇都木士郎', text: `啊，${surname}课长，晚上好，您辛苦了。` },
    { who: 'couple', speaker: surname, text: '晚上好，下班过来的？' },
    { who: 'shiro', speaker: '宇都木士郎', text: '是的，来稍微换换心情。' },
    { who: 'couple', speaker: surname, text: '这样啊，偶尔这样也挺好的。' },
    { who: 'shiro', speaker: '宇都木士郎', text: '是的，这里很安静。' },
    { who: 'couple', speaker: surname, text: '那明天见。' },
    { who: 'shiro', speaker: '宇都木士郎', text: '好的，那我先告辞了。' },
  ] as const
}
export function coupleVisible(boat: CoupleBoat, cameraY: number) {
  return boat.y + 40 >= cameraY && boat.y - 40 <= cameraY + 700 && boat.x + 40 >= 0 && boat.x - 40 <= 390
}
export function riverCenter(y: number) { return 195 + Math.sin(y / 420) * 22 + Math.sin(y / 190) * 12 }
export const EVENING_LINES = [
  { speaker: '宇都木士郎', who: 'shiro' as const, text: '该回家了，明天还有工作。' },
  { speaker: '月云了', who: 'ryo' as const, text: '你以为我不想吗！！！' },
]

export interface RowingState {
  opening: 'ryo' | 'shiro' | 'boarding' | 'guide' | 'guide-gap' | 'guide-start' | null
  openingAge: number
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
  chiefVisit: ChiefVisit | null
  firstChiefSeen: boolean
  daily: DailyDialogue
  collisionCooldown: number
  collisions: number
}

export function createCoupleMotion(random: () => number = Math.random): CoupleMotion {
  return { speed: 3 + random() * 4, lane: (random() - .5) * 140, amplitude: 18 + random() * 24,
    frequency: .12 + random() * .22, phase: random() * Math.PI * 2,
    pulseFrequency: .35 + random() * .5, pulsePhase: random() * Math.PI * 2 }
}

export function createRowing(random: () => number = Math.random, withOpening = false): RowingState {
  return {
    opening: withOpening ? 'ryo' : null, openingAge: 0,
    elapsed: 0, minutes: START_MINUTE, x: 195, y: withOpening ? 480 : 370, heading: Math.PI, spin: 0, speed: 0,
    effort: false, eveningSeen: false, dialogue: null, dialogueAge: 0,
    lastShiro: -100, lastRyo: -100, shiroAction: 'rest', ryoAction: 'rest',
    shiroUntil: 0, ryoUntil: 0, laughUntil: 0, shiroStrokes: 0, ryoStrokes: 0,
    taps: 0, distance: 0, turnTravel: 0, trail: [], trailTimer: 0,
    cameraY: 0, couples: [-160, 0, 170, 540, 700, 850, 1000, 1150].map((y, id) => ({
      id, x: riverCenter(y) + Math.sin(id * 2.3) * 78, y, heading: Math.PI + Math.sin(id) * .25, motion: createCoupleMotion(random),
    })), nextCoupleId: COUPLE_COUNT, encounter: null, chiefVisit: null, firstChiefSeen: false, daily: createDailyDialogue(), collisionCooldown: 0, collisions: 0,
  }
}

/** The same three hull samples are used by steering and the existing collision response. */
function hullSamples(player: { x: number; y: number; heading: number }) {
  return [-48, 0, 48].map(offset => ({ x: player.x + Math.sin(player.heading) * offset, y: player.y - Math.cos(player.heading) * offset }))
}

export function moveCouple(boat: CoupleBoat, player: { x: number; y: number; heading: number; velocityX?: number; velocityY?: number }, elapsed: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return
  dt = Math.min(dt, .1)
  const motion = boat.motion ??= createCoupleMotion()
  const samples = hullSamples(player)
  const gapAt = (x: number, y: number) => Math.min(...samples.map(p => Math.hypot(x - p.x, y - p.y)))
  const startGap = gapAt(boat.x, boat.y)
  // The player has already moved into this boat: let the collision code handle that contact.
  if (startGap < 59) return
  const lane = riverCenter(boat.y) + motion.lane + Math.sin(elapsed * motion.frequency + motion.phase) * motion.amplitude
  let vx = (lane - boat.x) * .24
  let vy = motion.speed * (.55 + .45 * Math.sin(elapsed * motion.pulseFrequency + motion.pulsePhase))
  const nearest = samples.reduce((a, b) => Math.hypot(boat.x - a.x, boat.y - a.y) < Math.hypot(boat.x - b.x, boat.y - b.y) ? a : b)
  if (startGap < 112) {
    const nx = (boat.x - nearest.x) / startGap, ny = (boat.y - nearest.y) / startGap
    const caution = Math.max(0, Math.min(1, (112 - startGap) / 24))
    const playerVX = player.velocityX ?? 0, playerVY = player.velocityY ?? 0
    const closing = Math.min(0, (vx - playerVX) * nx + (vy - playerVY) * ny)
    vx -= closing * nx * caution; vy -= closing * ny * caution
    vx = playerVX + (vx - playerVX) * (1 - caution * .45)
    vy = playerVY + (vy - playerVY) * (1 - caution * .45)
    vx += (boat.x >= player.x ? 1 : -1) * caution * 4 + nx * caution * 2
    vy += ny * caution * 2
  }
  // Turn back gently near the riverbank, never snap to a lane or to a new path.
  const bank = riverCenter(boat.y)
  if (boat.x > bank + 112) vx = Math.min(vx, (bank + 112 - boat.x) * .5)
  if (boat.x < bank - 112) vx = Math.max(vx, (bank - 112 - boat.x) * .5)
  const speed = Math.hypot(vx, vy)
  if (speed > 8) { vx *= 8 / speed; vy *= 8 / speed }
  // Clip only the NPC's own step, preserving collisions caused by the player's next move.
  const safeGap = Math.min(88, startGap)
  let fraction = 1
  if (gapAt(boat.x + vx * dt, boat.y + vy * dt) < safeGap) {
    let low = 0, high = 1
    for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2
      if (gapAt(boat.x + vx * dt * middle, boat.y + vy * dt * middle) >= safeGap) low = middle
      else high = middle
    }
    fraction = low
  }
  if (fraction < .1) {
    // If the intended lane is blocked, take a slow clear side-step instead of parking forever.
    let best: { x: number; y: number; score: number } | undefined
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12, x = Math.cos(angle) * 3, y = Math.sin(angle) * 3
      const nextX = boat.x + x * dt, nextY = boat.y + y * dt
      if (gapAt(nextX, nextY) < safeGap || Math.abs(nextX - riverCenter(nextY)) > Math.max(112, Math.abs(boat.x - bank))) continue
      const score = vx * x + vy * y
      if (!best || score > best.score) best = { x, y, score }
    }
    if (best) { vx = best.x; vy = best.y; fraction = 1 }
  }
  boat.x += vx * dt * fraction; boat.y += vy * dt * fraction
  if (Math.hypot(vx, vy) * fraction > .1) {
    const target = Math.atan2(vx, -vy)
    const turn = Math.atan2(Math.sin(target - boat.heading), Math.cos(target - boat.heading))
    boat.heading += Math.max(-.65 * dt, Math.min(.65 * dt, turn))
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

/** Display-only ten-minute clock; simulation and dialogue keep their exact time. */
export function clockDisplayAt(minutes: number) {
  const shown = Math.floor((minutes + 1e-7) / 10) * 10
  const date = new Date(Date.UTC(2026, 3, 1) + shown * 60000)
  const hour = date.getUTCHours(), minute = String(date.getUTCMinutes()).padStart(2, '0')
  const iso = date.toISOString().slice(0, 16)
  return { date: iso.slice(0, 10).replaceAll('-', '/'), time: `${String(hour % 12 || 12).padStart(2, '0')}:${minute}`,
    meridiem: hour < 12 ? 'am' : 'pm', dateTime: iso }
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

/** First evening ramps 0–50%; subsequent daylight is 30% and nights are 50%. */
export function ryoForwardChance(minutes: number) {
  if (minutes < EVENING_MINUTE) return .5 * Math.max(0, (minutes - FORWARD_RAMP_START) / (EVENING_MINUTE - FORWARD_RAMP_START))
  const hour = ((minutes / 60) % 24 + 24) % 24
  return hour >= 6 && hour < 18 ? .3 : .5
}

export function chiefHours(minutes: number) {
  const minute = ((minutes % 1440) + 1440) % 1440
  return minute >= FORWARD_RAMP_START && minute < EVENING_MINUTE
}

/** Success, a wrong stroke and an ineffective stroke are separate outcomes. */
export function chooseRyoAction(minutes: number, effort: boolean, draw: number): RowAction {
  const chance = Math.max(0, Math.min(.9999, draw)), forward = ryoForwardChance(minutes)
  if (chance < forward) return chance >= forward * .8 ? 'strong' : 'stroke'
  if (effort) return chance < forward + .15 ? 'reverse' : 'miss'
  return chance < forward + (1 - forward) / 2 ? 'refuse' : 'push'
}

/** Admit one complete exchange; ambient collision speech cannot interrupt a conversation. */
function canStartBoatSpeech(state: RowingState) {
  return !state.opening && state.dialogue === null && !state.encounter
    && (!state.daily.chat || state.daily.chat.kind === 'random')
    && (!state.chiefVisit || state.chiefVisit.done)
}

/** Independent weighted draws: no sequence, pity counter, or dependence on tapping rhythm. */
export function row(state: RowingState, who: Rower, random: () => number = Math.random): RowAction | null {
  if (state.opening) return null
  const since = state.elapsed - (who === 'shiro' ? state.lastShiro : state.lastRyo)
  if (since < STROKE_COOLDOWN) return null
  state.taps++
  if (who === 'shiro') {
    state.lastShiro = state.elapsed
    impulse(state, who)
    return 'stroke'
  }
  state.lastRyo = state.elapsed
  const action = chooseRyoAction(state.minutes, state.effort, random())
  if (action === 'stroke' || action === 'strong') {
    impulse(state, who, false, action === 'strong' ? 1.45 : 1)
    return state.ryoAction
  }
  if (action === 'reverse') {
    impulse(state, who, true)
    return state.ryoAction
  }
  if (action === 'miss') {
    state.ryoAction = 'miss'; state.ryoUntil = state.elapsed + .7; state.ryoStrokes++
    return 'miss'
  }
  if (action === 'refuse') {
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
  if (state.opening) {
    state.openingAge += dt
    const duration = { ryo: 3.2, shiro: 1.8, boarding: 1.2, guide: 2, 'guide-gap': .3, 'guide-start': 1.8 }[state.opening]
    if (state.openingAge >= duration) {
      state.opening = state.opening === 'ryo' ? 'shiro' : state.opening === 'shiro' ? 'boarding' : state.opening === 'boarding' ? 'guide' : state.opening === 'guide' ? 'guide-gap' : state.opening === 'guide-gap' ? 'guide-start' : null
      state.openingAge = 0
    }
    return
  }
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
  const previousMinutes = state.minutes
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
  const previousX = state.x, previousY = state.y
  state.x += Math.sin(state.heading) * travel
  state.y += -Math.cos(state.heading) * travel + 6 * dt
  state.distance += Math.abs(travel)
  // The river is unbounded longitudinally; a following camera replaces the old invisible end wall.
  const center = riverCenter(state.y)
  state.x += (Math.max(center - 95 - state.x, 0) - Math.max(state.x - center - 95, 0)) * dt * 2
  state.cameraY += (state.y - 370 - state.cameraY) * (1 - Math.exp(-3 * dt))
  const movingPlayer = { x: state.x, y: state.y, heading: state.heading, velocityX: (state.x - previousX) / dt, velocityY: (state.y - previousY) / dt }
  state.collisionCooldown = Math.max(0, state.collisionCooldown - dt)
  if (state.encounter) {
    state.encounter.age += dt
    if (state.encounter.age >= 5.8) state.encounter = null
  }
  for (const boat of state.couples) {
    moveCouple(boat, movingPlayer, state.elapsed, dt)
    // Later evenings redraw once per visible boat per night, never every frame.
    const night = Math.floor(state.minutes / 1440)
    if (night > 0 && chiefHours(state.minutes) && coupleVisible(boat, state.cameraY)) {
      if (boat.chiefNight !== undefined && boat.chiefNight !== night && state.chiefVisit?.boatId !== boat.id) {
        boat.chiefChecked = false; boat.chiefSurname = undefined; boat.chiefGreeted = false
      }
      boat.chiefNight = night
      if (!boat.chiefChecked) {
        boat.chiefChecked = true
        if (random() < .1) boat.chiefSurname = CHIEF_SURNAMES[Math.max(0, Math.min(CHIEF_SURNAMES.length - 1, Math.floor(random() * CHIEF_SURNAMES.length)))]
      }
    }
    // Three hull samples approximate the long boat, rather than colliding with portrait pixels.
    let hit: { dx: number; dy: number; distance: number } | null = null
    for (const sample of hullSamples(state)) {
      const dx = boat.x - sample.x
      const dy = boat.y - sample.y
      const distance = Math.hypot(dx, dy)
      if (distance < 59 && (!hit || distance < hit.distance)) hit = { dx, dy, distance }
    }
    if (hit) {
      const nx = hit.distance > .01 ? hit.dx / hit.distance : 1
      const ny = hit.distance > .01 ? hit.dy / hit.distance : 0
      const overlap = 59 - hit.distance
      boat.x += nx * (overlap + .5); boat.y += ny * (overlap + .5)
      state.speed *= .7
      if (canStartBoatSpeech(state) && state.collisionCooldown === 0) {
        const pick = (choices: string[]) => choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]
        state.encounter = { boatId: boat.id, complaint: boat.chiefSurname ? '啊！' : pick(COMPLAINTS), apology: boat.chiefSurname ? APOLOGIES[2] : pick(APOLOGIES), age: 0 }
        state.collisionCooldown = 9; state.collisions++; state.laughUntil = 0
        state.spin = Math.max(-2.5, Math.min(2.5, state.spin + nx * .22))
      }
    }
  }
  const speakingBoat = state.couples.find(candidate => candidate.id === state.encounter?.boatId)
  if (speakingBoat?.chiefSurname && !coupleVisible(speakingBoat, state.cameraY)) state.encounter = null
  tickDailyDialogue(state.daily, previousMinutes, state.minutes, dt,
    state.dialogue !== null || Boolean(state.encounter) || Boolean(state.chiefVisit && !state.chiefVisit.done), random)
  if (state.daily.chat) state.laughUntil = 0
  const visit = state.chiefVisit
  if (visit) {
    const boat = state.couples.find(candidate => candidate.id === visit.boatId)
    if (!boat || !coupleVisible(boat, state.cameraY)) {
      state.chiefVisit = null
      if (state.encounter?.boatId === visit.boatId) state.encounter = null
    } else if (!visit.done && state.dialogue === null && !state.encounter && !state.daily.chat) {
      visit.age += dt
      if (visit.age >= (visit.line === 1 ? 1.2 : 3.6)) {
        visit.age = 0; visit.line++
        if (visit.line >= 2) visit.masked = true
        if (visit.line >= chiefLines(visit.surname).length) visit.done = true
      }
    }
  }
  if (!state.chiefVisit && state.dialogue === null && !state.encounter && !state.daily.chat && chiefHours(state.minutes)) {
    const firstNight = state.minutes < 1440
    const boat = state.couples.filter(candidate => coupleVisible(candidate, state.cameraY)
      && (firstNight ? !state.firstChiefSeen : candidate.chiefSurname && !candidate.chiefGreeted))
      .sort((a, b) => Math.abs(a.y - state.y) - Math.abs(b.y - state.y))[0]
    if (boat) {
      if (firstNight) {
        boat.chiefSurname = CHIEF_SURNAMES[Math.max(0, Math.min(CHIEF_SURNAMES.length - 1, Math.floor(random() * CHIEF_SURNAMES.length)))]
        boat.chiefChecked = true; boat.chiefNight = 0; state.firstChiefSeen = true
      }
      boat.chiefGreeted = true
      state.chiefVisit = { boatId: boat.id, surname: boat.chiefSurname!, line: 0, age: 0, masked: false, done: false }
      state.laughUntil = 0
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
      state.couples[i] = { id, x: riverCenter(y) + Math.sin(id * 2.3) * 78, y, heading: Math.PI + Math.sin(id) * .25, motion: createCoupleMotion() }
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
