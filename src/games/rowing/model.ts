import { createDailyDialogue, tickDailyDialogue, type DailyDialogue } from './daily-dialogue.ts'
import { COUPLE_COUNT, CONTACT_DISTANCE, createCouple, createCoupleMotion, moveCouple, departCouple, hullContact, coupleVisible, coupleTarget, riverCenter, type CoupleBoat } from './couples.ts'
import { COUPLE_LINES, coupleLineSeconds, pickCoupleChat, type CoupleChat } from './couple-dialogue.ts'
export { COUPLE_COUNT, createCoupleMotion, moveCouple, coupleVisible, riverCenter } from './couples.ts'
export type { CoupleBoat, CoupleMotion } from './couples.ts'

export type Rower = 'shiro' | 'ryo'
export type RowAction = 'rest' | 'stroke' | 'strong' | 'refuse' | 'push' | 'reverse' | 'miss'
export type Period = 'morning' | 'noon' | 'sunset' | 'night'
export const MINUTES_PER_SECOND = 3
export const START_MINUTE = 18 * 60
const FORWARD_RAMP_START = 19 * 60
export const EVENING_MINUTE = 22 * 60
export const EVENING_LINE_SECONDS = 3.2
export const STROKE_COOLDOWN = .55
export const COMPLAINTS = ['啊！', '小心一点，没素质的家伙！', '你撞到我女朋友了！！']
export const APOLOGIES = ['不好意思。', '真的非常不好意思。', '非常抱歉，我们会注意的。']
export const CHIEF_SURNAMES = ['佐藤', '铃木', '高桥', '田中', '渡边', '伊藤', '山本', '中村', '小林', '加藤', '吉田']
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
  trafficNextAt: number
  coupleChat: CoupleChat | null
  coupleChatNextAt: number
}

export function createRowing(random: () => number = Math.random, withOpening = false): RowingState {
  return {
    opening: withOpening ? 'ryo' : null, openingAge: 0,
    elapsed: 0, minutes: START_MINUTE, x: 195, y: withOpening ? 480 : 370, heading: Math.PI, spin: 0, speed: 0,
    effort: false, eveningSeen: false, dialogue: null, dialogueAge: 0,
    lastShiro: -100, lastRyo: -100, shiroAction: 'rest', ryoAction: 'rest',
    shiroUntil: 0, ryoUntil: 0, laughUntil: 0, shiroStrokes: 0, ryoStrokes: 0,
    taps: 0, distance: 0, turnTravel: 0, trail: [], trailTimer: 0,
    cameraY: 0, couples: [-740, -480, -240, 240, 480, 720, 960].map((offset, id) => createCouple(id, (withOpening ? 480 : 370) + offset, random)),
    nextCoupleId: COUPLE_COUNT, encounter: null, chiefVisit: null, firstChiefSeen: false, daily: createDailyDialogue(), collisionCooldown: 0, collisions: 0,
    trafficNextAt: 3, coupleChat: null, coupleChatNextAt: 3,
  }
}

export function complaintSeconds(encounter: Encounter) { return Math.max(2.6, Array.from(encounter.complaint).length * .15 + 1.2) }

function updateTraffic(state: RowingState, random: () => number) {
  const hour = state.minutes / 60 % 24, target = coupleTarget(state.minutes)
  if (hour < 6) { state.couples = []; state.encounter = null; state.chiefVisit = null; state.coupleChat = null; return }
  if (state.elapsed < state.trafficNextAt) return
  state.trafficNextAt = state.elapsed + 2
  const active = state.couples.filter(b => !b.departing).sort((a, b) => Math.abs(a.y - state.y) - Math.abs(b.y - state.y))
  for (const boat of active.slice(target)) departCouple(boat, state, 'closing')
  state.couples = state.couples.filter(b => b.departing ? coupleVisible(b, state.cameraY) : b.y >= state.cameraY - 260 && b.y <= state.cameraY + 1250)
  if (state.couples.length < target) {
    const preferTop = state.nextCoupleId % 2 === 0
    for (const fromTop of [preferTop, !preferTop]) {
      const y = state.cameraY + (fromTop ? -180 : 880)
      const boat = createCouple(state.nextCoupleId, y, random)
      boat.motion!.direction = fromTop ? 1 : -1; boat.heading = fromTop ? Math.PI : 0
      if (!state.couples.every(b => hullContact(b, boat).distance > 140)) continue
      state.nextCoupleId++
      state.couples.push(boat)
      break
    }
  }
}

function tickCoupleChat(state: RowingState, dt: number, random: () => number) {
  const busy = state.dialogue !== null || state.encounter || state.daily.chat || (state.chiefVisit && !state.chiefVisit.done)
  const chat = state.coupleChat, boat = state.couples.find(b => b.id === chat?.boatId)
  if (chat && (busy || !boat || !coupleVisible(boat, state.cameraY))) {
    state.coupleChat = null; state.coupleChatNextAt = state.elapsed + 5
  } else if (chat) {
    chat.age += dt
    if (chat.age >= coupleLineSeconds(chat.lines[chat.line])) {
      chat.line++; chat.age = 0
      if (chat.line >= chat.lines.length) { state.coupleChat = null; state.coupleChatNextAt = state.elapsed + 10 + random() * 8 }
    }
  }
  if (busy || state.coupleChat || state.elapsed < state.coupleChatNextAt) return
  const candidates = state.couples.filter(b => !b.chiefSurname && b.y > state.cameraY + 100 && b.y < state.cameraY + 600
    && state.elapsed >= (b.nextChatAt ?? 0) && (!b.departing || (b.departureReason !== 'closing' && !b.departureRemark)))
  const speaker = candidates.find(b => b.departing) ?? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
  if (speaker) {
    state.coupleChat = pickCoupleChat(speaker, state.minutes, random)
    speaker.nextChatAt = state.elapsed + 35 + random() * 20
    if (speaker.departing) speaker.departureRemark = true
  } else state.coupleChatNextAt = state.elapsed + 3
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
    if (state.encounter.age >= complaintSeconds(state.encounter) + 3.2) state.encounter = null
  }
  updateTraffic(state, random)
  for (const boat of state.couples) {
    moveCouple(boat, { ...movingPlayer, spin: state.spin }, state.elapsed, dt, state.couples)
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
    const hit = hullContact(state, boat)
    if (hit.distance < CONTACT_DISTANCE) {
      const nx = hit.distance > .01 ? hit.dx / hit.distance : 1
      const ny = hit.distance > .01 ? hit.dy / hit.distance : 0
      const overlap = CONTACT_DISTANCE - hit.distance
      boat.x += nx * (overlap + .5); boat.y += ny * (overlap + .5)
      state.speed *= .7
      const accidental = boat.motion?.style === 'distracted' && !boat.accidentalContact
      boat.accidentalContact = true
      departCouple(boat, state, 'collision')
      if (canStartBoatSpeech(state) && state.collisionCooldown === 0) {
        const pick = (choices: string[]) => choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]
        state.encounter = { boatId: boat.id, complaint: boat.chiefSurname ? '啊！' : accidental ? COUPLE_LINES.distracted[0][0] : pick(COMPLAINTS), apology: boat.chiefSurname ? APOLOGIES[2] : pick(APOLOGIES), age: 0 }
        state.collisionCooldown = 9; state.collisions++; state.laughUntil = 0
        state.spin = Math.max(-2.5, Math.min(2.5, state.spin + nx * .22))
      }
    }
  }
  const speakingBoat = state.couples.find(candidate => candidate.id === state.encounter?.boatId)
  if (!speakingBoat || !coupleVisible(speakingBoat, state.cameraY)) state.encounter = null
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
  tickCoupleChat(state, dt, random)
  for (const point of state.trail) point.age += dt
  state.trail = state.trail.filter(point => point.age < 3)
  state.trailTimer += dt
  if (state.trailTimer >= .4 && (Math.abs(state.speed) > 1 || Math.abs(state.spin) > .1)) {
    state.trailTimer = 0
    state.trail.push({ x: state.x - Math.sin(state.heading) * 72, y: state.y + Math.cos(state.heading) * 72, age: 0 })
  }
}
