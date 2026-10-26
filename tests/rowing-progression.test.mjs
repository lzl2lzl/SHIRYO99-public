import test from 'node:test'
import assert from 'node:assert/strict'
import { createRowing, row, tickRowing, clockDisplayAt, ryoForwardChance } from '../src/games/rowing/model.ts'
import { SKILLS, IMPLEMENTED_WEEK, upgradeAt } from '../src/games/rowing/progression/catalog.ts'
import { createProgression, unlockDueSkills, tickProgression, upgradeDialogue, LEVEL_UP_SECONDS } from '../src/games/rowing/progression/state.ts'
import { createSkillRuntime, recordForwardStroke, tickSkillRuntime, bowLift } from '../src/games/rowing/progression/skills.ts'
import { CALENDAR_EPOCH } from '../src/games/rowing/calendar.ts'

const scene = (level = 0) => {
  const s = createRowing(() => .99)
  s.progression = createProgression(level); s.minutes = 1380; s.effort = true; s.eveningSeen = true
  s.couples = []; s.trafficNextAt = Infinity; s.coupleChatNextAt = Infinity
  return s
}
const wait = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 100); i++) tickRowing(s, .01, () => .99) }

test('all 26 supplied skill entries unlock once and keep titles, including the unnamed week 24', () => {
  assert.equal(SKILLS.length, 26); assert.equal(SKILLS[23].name, null)
  assert.equal(SKILLS[25].name, 'BREAK THE LIMITATION')
  for (const [i, skill] of SKILLS.entries()) assert.equal(skill.week, i + 1)
  assert.equal(IMPLEMENTED_WEEK, 26)
  const p = createProgression(); unlockDueSkills(p, upgradeAt(26))
  const weeks=Array.from({length:26},(_,i)=>i+1)
  assert.equal(p.level, 26); assert.deepEqual(p.pending, weeks)
  unlockDueSkills(p, upgradeAt(26)); unlockDueSkills(p, upgradeAt(1)); unlockDueSkills(p, NaN)
  assert.deepEqual(p.pending, weeks)
})

test('upgrades use exact 08:31 each seventh calendar day, independent of displayed ten-minute clock', () => {
  assert.equal(new Date(CALENDAR_EPOCH + upgradeAt(1) * 60000).toISOString(), '2004-04-14T08:31:00.000Z')
  assert.equal(new Date(CALENDAR_EPOCH + upgradeAt(4) * 60000).toISOString(), '2004-05-05T08:31:00.000Z')
  const s = scene(); s.minutes = upgradeAt(1) - .06
  tickRowing(s, .01, () => .99); assert.equal(s.progression.level, 0)
  tickRowing(s, .02, () => .99); assert.equal(s.progression.level, 1)
  assert.equal(clockDisplayAt(s.minutes).time, '08:30')
  assert.equal(s.progression.presentation.week, 1)
  wait(s, LEVEL_UP_SECONDS + .2); assert.equal(s.progression.presentation, null); assert.deepEqual(s.progression.pending, [])
})

test('existing dialogue and birthday finish before upgrade; foreground time and input continue', () => {
  const s = scene(); s.minutes = upgradeAt(1) - .03
  s.daily.chat = { kind: 'tired', day: 7, lines: [{ who: 'ryo', text: '我累了。' }, { who: 'shiro', text: '我也是。' }], line: 0, age: 0 }
  tickRowing(s, .02, () => .99)
  assert.equal(s.progression.level, 1); assert.equal(s.progression.presentation, null)
  assert.deepEqual(s.progression.pending, [1]); assert.equal(row(s, 'shiro'), 'stroke')
  wait(s, 7); assert.ok(s.progression.presentation)
  const age = s.progression.presentation.age, minute = s.minutes
  tickRowing(s, 0); tickRowing(s, NaN); assert.equal(s.minutes, minute); assert.equal(s.progression.presentation.age, age)
  s.calendar.celebration = { birthday: 'shiro', age: 0 }; wait(s, .5)
  assert.equal(s.progression.presentation.age, age, 'New higher-priority birthday freezes the reveal')
  s.calendar.celebration = null; assert.equal(row(s, 'shiro'), 'stroke')
  wait(s, LEVEL_UP_SECONDS + 1); assert.equal(s.progression.presentation, null)
})

test('future supplied upgrade dialogue uses one queue, then reveal; no placeholder dialogue by default', () => {
  const p = createProgression(); unlockDueSkills(p, upgradeAt(2))
  const supplied = { 1: [{ who: 'ryo', text: '哼！' }] }
  tickProgression(p, .1, true, supplied); assert.equal(p.presentation, null)
  tickProgression(p, .1, false, supplied); assert.equal(upgradeDialogue(p, supplied).text, '哼！')
  for (let i = 0; i < 33; i++) tickProgression(p, .1, false, supplied)
  assert.equal(p.presentation.phase, 'reveal')
  for (let i = 0; i < Math.ceil(LEVEL_UP_SECONDS * 10) + 2; i++) tickProgression(p, .1, false, supplied)
  assert.equal(p.presentation.week, 2); assert.equal(p.presentation.phase, 'reveal')
  assert.equal(upgradeDialogue(p), undefined)
  const fresh = createProgression(); assert.equal(fresh.level, 0); assert.deepEqual(fresh.pending, [])
})

test('weeks 1 and 2 improve actual thrust, turning precision and settling, not willingness', () => {
  for (const [who, level] of [['shiro', 1], ['ryo', 2]]) {
    const base = scene(), trained = scene(level)
    assert.equal(row(base, who, () => .1), 'stroke'); assert.equal(row(trained, who, () => .1), 'stroke')
    assert.ok(trained.speed > base.speed); assert.ok(Math.abs(trained.spin) < Math.abs(base.spin))
    wait(base, 2); wait(trained, 2)
    assert.ok(trained.distance > base.distance); assert.ok(Math.abs(trained.spin) < Math.abs(base.spin))
  }
  for (const minute of [1380, 1800]) for (let i = 0; i < 100; i++) {
    const actions = [0, 1, 2, 3, 4].map(level => { const s = scene(level); s.minutes = minute; return row(s, 'ryo', () => (i + .5) / 100) })
    assert.ok(actions.every(action => action === actions[0]))
    assert.ok(ryoForwardChance(minute) <= .5)
  }
})

test('week 3 requires two successful distinct strokes within 180 ms in either order', () => {
  for (const order of [['shiro', 'ryo'], ['ryo', 'shiro']]) {
    const baseline = scene(2), trained = scene(3)
    baseline.spin = trained.spin = 1
    for (const who of order) { row(baseline, who, () => .1); row(trained, who, () => .1) }
    assert.equal(trained.skills.pairs, 1); assert.equal(baseline.skills.pairs, 0)
    assert.ok(trained.speed > baseline.speed); assert.ok(Math.abs(trained.spin) < Math.abs(baseline.spin))
    assert.equal(row(trained, order[1], () => .1), null); assert.equal(trained.skills.pairs, 1)
    wait(baseline, 1); wait(trained, 1); assert.ok(trained.distance > baseline.distance)
    assert.ok(trained.skills.wake.length > 0)
  }
  for (const draw of [.52, .9]) {
    const s = scene(3); row(s, 'shiro'); row(s, 'ryo', () => draw)
    assert.equal(s.skills.pairs, 0); assert.equal(s.skills.waiting, null)
  }
  const late = scene(3); row(late, 'shiro'); wait(late, .2); row(late, 'ryo', () => .1)
  assert.equal(late.skills.pairs, 0)
})

test('week 4 consecutive pairs build bounded acceleration and bow lift; a miss breaks the streak', () => {
  const a = scene(3), b = scene(4)
  for (let i = 0; i < 3; i++) {
    for (const s of [a, b]) { row(s, 'shiro'); row(s, 'ryo', () => .1); wait(s, .6) }
  }
  assert.equal(b.skills.streak, 3); assert.ok(b.speed > a.speed); assert.ok(b.distance > a.distance)
  assert.ok(bowLift(b.skills, 4, b.elapsed) > 0); assert.ok(b.speed <= 78)
  row(b, 'ryo', () => .9); assert.equal(b.skills.streak, 0)
  assert.equal(bowLift(b.skills, 4, b.elapsed), 0)
  wait(b, 4); assert.equal(b.skills.wake.length, 0)
  const runtime = createSkillRuntime(), motion = { speed: 40, spin: 1, heading: Math.PI / 2 }
  for (let i = 0; i < 100; i++) {
    recordForwardStroke(runtime, motion, 4, 'shiro', i * .6)
    recordForwardStroke(runtime, motion, 4, 'ryo', i * .6)
    tickSkillRuntime(runtime, .6, i * .6, { x: i, y: 0, heading: motion.heading })
  }
  assert.equal(motion.heading, Math.PI / 2, 'Dash follows the current bow, not an automatic route home')
  assert.ok(motion.speed <= 78); assert.equal(runtime.streak, 4); assert.ok(runtime.wake.length <= 24)
})
