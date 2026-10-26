import { createRowing, START_MINUTE, clockDisplayAt, type RowingState } from '../model.ts'
import { IMPLEMENTED_WEEK, UPGRADE_DIALOGUE, upgradeAt } from '../progression/catalog.ts'
import { createEvolution } from '../progression/evolution.ts'

export const SAVE_FORMAT = 'SHIRYO99/i-hate-rowing'
export const SAVE_VERSION = 2
export const MAX_SAVE_BYTES = 1024 * 1024
export const METERS_PER_WORLD_UNIT = .025 // A 200-unit hull is about five metres, regardless of screen size.
export interface RunIdentity { runId: string; startedAt: string }
export interface SaveFile extends RunIdentity {
  format: typeof SAVE_FORMAT
  version: typeof SAVE_VERSION
  savedAt: string
  dockOrigin: number
  state: RowingState
}
export const newRunIdentity = (): RunIdentity => ({ runId: crypto.randomUUID(), startedAt: new Date().toISOString() })

type Rule = (value: unknown) => boolean
const number = (min = -1e12, max = 1e12): Rule => v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const integer = (min = 0, max = 1e9): Rule => v => number(min, max)(v) && Number.isInteger(v)
const boolean: Rule = v => typeof v === 'boolean'
const text = (max = 500): Rule => v => typeof v === 'string' && v.length <= max
const one = (...values: unknown[]): Rule => v => values.includes(v)
const nullable = (rule: Rule): Rule => v => v === null || rule(v)
const optional = (rule: Rule): Rule => v => v === undefined || rule(v)
const array = (rule: Rule, max = 128): Rule => v => Array.isArray(v) && v.length <= max && v.every(rule)
const object = (fields: Record<string, Rule>): Rule => v => Boolean(v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(k => Object.hasOwn(fields, k))
  && Object.entries(fields).every(([k, rule]) => rule((v as Record<string, unknown>)[k])))
const n = number(), positive = number(0), rower = one('shiro', 'ryo')
const line = object({ who: rower, text: text() })
const timedLines = { lines: array(line, 40), line: integer(0, 40), age: number(0, 120) }
const dailyChat = object({ ...timedLines, kind: one('tired', 'school', 'hungry', 'random'), day: integer() })
const calendarChat = object({ ...timedLines, key: text(24), birthday: nullable(rower) })
const motion = object({ speed: number(0, 200), lane: number(-1000, 1000), amplitude: number(0, 500), frequency: positive, phase: n,
  pulseFrequency: positive, pulsePhase: n, style: one('steady', 'resting', 'wobbly', 'fast', 'distracted'), direction: one(-1, 1), pauseLength: positive, cycle: number(.01, 1e6) })
const boat = object({ id: integer(), x: n, y: n, heading: n, motion: optional(motion), chiefChecked: optional(boolean), chiefSurname: optional(text(20)),
  chiefGreeted: optional(boolean), chiefNight: optional(integer()), chiefTalking: optional(boolean), departing: optional(boolean), departureReason: optional(one('collision','spin','closing')),
  departureRemark: optional(boolean), accidentalContact: optional(boolean), nextChatAt: optional(n), strokePhase: optional(n), stopped: optional(boolean) })
const action = one('rest','stroke','strong','refuse','push','reverse','miss'), moodLine = one('tired','protest','huff')
const point = { x: n, y: n, age: positive }
const stateRule = object({
  opening: nullable(one('ryo','shiro','boarding','guide','guide-gap','guide-start')), openingAge: positive,
  elapsed: positive, activeSeconds: positive, minutes: number(START_MINUTE, 5e8), x: n, y: n, heading: n, spin: number(-3,3), speed: number(-1000,1000),
  effort: boolean, eveningSeen: boolean, dialogue: nullable(one(0,1)), dialogueAge: positive, lastShiro: n, lastRyo: n,
  shiroAction: action, ryoAction: action, shiroUntil: n, ryoUntil: n,
  ryoMood: object({ strokes: integer(), phase: one('cooperating','strike','mischief'), nagCount: integer(), lastNag: n, lastReverse: n, revenge: boolean,
    reverseSpoken: boolean, pending: array(moodLine, 3), speech: nullable(moodLine), age: positive }),
  progression: object({ level: integer(0, IMPLEMENTED_WEEK), pending: array(integer(1, IMPLEMENTED_WEEK), IMPLEMENTED_WEEK),
    presentation: nullable(object({ week: integer(1, IMPLEMENTED_WEEK), phase: one('dialogue','reveal'), line: integer(0,40), age: positive })) }),
  skills: object({ waiting: nullable(object({ who: rower, at: n })), lastPairAt: n, streak: integer(0,4), pairs: integer(), dashUntil: n, wakeTimer: positive,
    wake: array(object({ ...point, heading: n }), 24),
    evolution: object({ charge: number(0,100), altitude: number(0,180), airUntil: n, surfUntil: n, meteorUntil: n,
      tailUntil: n, tailStarsUntil: n, starUntil: n, binaryUntil: n, brakeUntil: n, lastTail: n, realmMix: number(0,2), form: number(0,3) }) }),
  laughUntil: n, shiroStrokes: integer(), ryoStrokes: integer(), taps: integer(), distance: positive, turnTravel: positive,
  trail: array(object(point), 64), trailTimer: positive, cameraY: n, cameraX: n, couples: array(boat, 32), nextCoupleId: integer(),
  encounter: nullable(object({ boatId: integer(), complaint: text(), apology: text(), age: positive })),
  chiefVisit: nullable(object({ boatId: integer(), surname: text(20), line: integer(0,9), age: positive, masked: boolean, done: boolean, holdX: optional(n), holdY: optional(n) })),
  firstChiefSeen: boolean, daily: object({ chat: nullable(dailyChat), pending: array(dailyChat, 32), lastFinished: n }),
  calendar: object({ chat: nullable(calendarChat), pending: nullable(calendarChat), celebration: nullable(object({ birthday: rower, age: positive })) }),
  collisionCooldown: positive, collisions: integer(), trafficNextAt: n,
  coupleChat: nullable(object({ boatId: integer(), kind: one('leaving','night','resting','wobbly','steady','distracted','fast','sunset'), lines: array(text(), 8), line: integer(0,8), age: positive })),
  coupleChatNextAt: n,
})

function date(value: unknown) { return typeof value === 'string' && value.length <= 30 && Number.isFinite(Date.parse(value)) }
const envelopeRule = object({ format: one(SAVE_FORMAT), version: one(SAVE_VERSION), runId: text(80), startedAt: date, savedAt: date, dockOrigin: n, state: stateRule })

/** Validate imports and database reads before they can become live simulation state. */
export function validateSave(value: unknown): SaveFile {
  // Version 1 only shipped four weeks. Add neutral runtime fields without rewriting its story or unlocks.
  if (value && typeof value === 'object' && 'version' in value && value.version === 1) {
    const old = value as { format?: unknown; state?: { progression?: { level?: unknown }; skills?: Record<string, unknown> } }
    if (old.format !== SAVE_FORMAT || !old.state?.skills || 'evolution' in old.state.skills || typeof old.state.progression?.level !== 'number' || old.state.progression.level > 4) throw new Error('旧存档结构不完整，无法迁移。')
    value = { ...old, version: SAVE_VERSION, state: { ...old.state, skills: { ...old.state.skills, evolution: createEvolution() } } }
  }
  if (value && typeof value === 'object' && 'version' in value && value.version !== SAVE_VERSION) throw new Error('这个存档版本暂不支持，请使用对应版本的游戏。')
  if (!envelopeRule(value)) throw new Error('这不是有效的「我讨厌划船」存档，或存档内容已损坏。')
  const save = value as SaveFile, s = save.state
  if (!save.runId || Date.parse(save.startedAt) > Date.parse(save.savedAt)) throw new Error('存档时间信息不完整。')
  for (const chat of [s.daily.chat, ...s.daily.pending, s.calendar.chat, s.calendar.pending, s.coupleChat]) {
    if (chat && (!chat.lines.length || chat.line >= chat.lines.length)) throw new Error('存档中的对白进度不完整。')
  }
  const ids = new Set(s.couples.map(b => b.id))
  if (ids.size !== s.couples.length || s.couples.some(b => b.id >= s.nextCoupleId)) throw new Error('存档中的船只记录不完整。')
  for (const event of [s.encounter, s.chiefVisit, s.coupleChat]) if (event && !ids.has(event.boatId)) throw new Error('存档中的说话船只不存在。')
  if (s.chiefVisit && s.chiefVisit.done !== (s.chiefVisit.line === 9)) throw new Error('存档中的课长对话进度不完整。')
  const p = s.progression, show = p.presentation
  if ((p.level && s.minutes + 1e-7 < upgradeAt(p.level)) || p.pending.some((week,i) => week > p.level || (i > 0 && week <= p.pending[i-1]))
    || (show && (show.week > p.level || p.pending.includes(show.week)))
    || (show?.phase === 'dialogue' && !UPGRADE_DIALOGUE[show.week]?.[show.line])) throw new Error('存档中的技能进度与当前版本不匹配。')
  return save
}

export function captureSave(identity: RunIdentity, state: RowingState, dockOrigin: number, savedAt = new Date().toISOString()): SaveFile {
  // JSON-safe timer sentinels; runtime infinities are not lost as null in exported files.
  const copy = JSON.parse(JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, ...identity, savedAt, dockOrigin, state }, (_key, value) => {
    if (value === Infinity) return 1e12
    if (value === -Infinity) return -1e12
    return value
  }))
  return validateSave(copy)
}
export function parseSave(text: string): SaveFile {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('存档文件过大，请选择游戏导出的备份文件。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('无法读取存档，请选择游戏导出的 JSON 文件。') }
  return validateSave(value)
}
export function copySave(save: SaveFile) { return parseSave(JSON.stringify(save)) }
export function saveSummary(state: RowingState) {
  const clock = clockDisplayAt(state.minutes)
  const days = Math.floor(Math.max(0, state.minutes - START_MINUTE) / 1440)
  const seconds = Math.floor(state.activeSeconds)
  return { date: clock.date, time: clock.time, days, meters: Math.floor(state.distance * METERS_PER_WORLD_UNIT), level: state.progression.level,
    played: `${Math.floor(seconds / 3600)}小时${Math.floor(seconds / 60) % 60}分` }
}
export function freshRun() {
  const state = createRowing(Math.random, true)
  return captureSave(newRunIdentity(), state, state.y)
}
export function checkpointKey(s: RowingState) {
  return [s.opening, s.dialogue, s.progression.level, s.progression.presentation?.week, s.progression.presentation?.phase,
    s.daily.chat?.kind, s.daily.chat?.line, s.calendar.chat?.key, s.calendar.chat?.line, s.calendar.celebration?.birthday,
    s.chiefVisit?.boatId, s.chiefVisit?.line, s.chiefVisit?.done, s.ryoMood.phase, s.ryoMood.reverseSpoken].join('|')
}
