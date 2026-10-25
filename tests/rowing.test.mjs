import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRowing, row, tickRowing, clockAt, periodAt, EVENING_LINES, COMPLAINTS, APOLOGIES, COUPLE_COUNT, ryoForwardChance, CHIEF_SURNAMES, chiefLines, coupleVisible, createCoupleMotion, moveCouple, riverCenter } from '../src/games/rowing/model.ts'
import { overlaps, placeResponse, rowingBounds } from '../src/games/rowing/bubble-layout.ts'
import { clockDisplayAt } from '../src/games/rowing/model.ts'
import { createDailyDialogue, tickDailyDialogue, DAILY_LINES, SMALL_TALK, dailyLineSeconds } from '../src/games/rowing/daily-dialogue.ts'

test('daily conversations start on day two, cross each scheduled time once and repeat on later days', () => {
  for (const day of [0, 1, 2, 7]) for (const [hour, kind] of [[4, 'tired'], [7, 'school'], [12, 'hungry'], [18, 'hungry']]) {
    const s = createDailyDialogue(), at = day * 1440 + hour * 60
    tickDailyDialogue(s, at - .1, at, .03, false, () => .99)
    assert.equal(s.chat?.kind ?? null, day ? kind : null)
    tickDailyDialogue(s, at, at + .1, .03, false, () => .99)
    assert.equal(s.pending.length, 0)
    if (day) assert.deepEqual(s.chat.lines, DAILY_LINES[kind])
  }
})

test('school conversation preserves the pauses and every line, gives long sentences more time and clears automatically', () => {
  assert.deepEqual(DAILY_LINES.school.map(l => l.text), ['……', '了くん你给学校请假了吗？', '答案不是很显然吗？！', '究竟为什么会这样……我的工资……', '我也想知道？？？', '……', '。。。。。。', '……', '。。。。。。', '好了，我给上司发完消息了，接下来帮你给学校打电话吧。', '哦，你快点。'])
  const s = createDailyDialogue(), at = 1440 + 420
  tickDailyDialogue(s, at - .1, at, .03, false, () => .99)
  for (let i = 0; i < DAILY_LINES.school.length; i++) {
    assert.equal(s.chat.line, i)
    const seconds = dailyLineSeconds(DAILY_LINES.school[i])
    assert.ok(seconds >= 3.2)
    tickDailyDialogue(s, at, at, seconds - .01, false, () => .99)
    assert.equal(s.chat.line, i)
    tickDailyDialogue(s, at, at, .02, false, () => .99)
  }
  assert.equal(s.chat, null)
  assert.ok(dailyLineSeconds(DAILY_LINES.school[9]) > 6)
})

test('scheduled dialogue waits for existing speech and takes priority over random chatter', () => {
  const s = createDailyDialogue(), at = 1440 + 240
  tickDailyDialogue(s, at - .1, at, .03, true, () => 0)
  assert.equal(s.chat, null); assert.equal(s.pending.length, 1)
  tickDailyDialogue(s, at, at + .1, .03, false, () => 0)
  assert.equal(s.chat.kind, 'tired')
  tickDailyDialogue(s, at, at, 10, true, () => 0)
  assert.equal(s.chat.line, 0); assert.equal(s.chat.age, 0)
  s.chat = { kind: 'random', lines: SMALL_TALK[0], day: 1, line: 0, age: 0 }
  tickDailyDialogue(s, 2519.9, 2520, .03, false, () => 0)
  assert.equal(s.chat.kind, 'hungry')
})

test('afternoon chatter rolls rarely once per half-hour, respects cooldown and never starts outside its window', () => {
  for (const at of [30, 780, 1440 + 690, 1440 + 1110]) {
    const s = createDailyDialogue()
    tickDailyDialogue(s, at - .1, at, .03, false, () => 0)
    assert.equal(s.chat, null)
  }
  for (let variant = 0; variant < 3; variant++) {
    const s = createDailyDialogue(), at = 1440 + 780
    let calls = 0
    tickDailyDialogue(s, at - .1, at, .03, false, () => calls++ ? (variant + .1) / 3 : .119)
    assert.deepEqual(s.chat.lines, SMALL_TALK[variant]); assert.equal(calls, 2)
  }
  const s = createDailyDialogue(), at = 1440 + 780
  let rolls = 0
  tickDailyDialogue(s, at - .1, at, .03, false, () => { rolls++; return .12 })
  for (let i = 0; i < 100; i++) tickDailyDialogue(s, at + i * .01, at + (i + 1) * .01, .01, false, () => { rolls++; return 0 })
  assert.equal(rolls, 1); assert.equal(s.chat, null)
  s.lastFinished = at - 40
  tickDailyDialogue(s, at - .1, at, .03, false, () => 0)
  assert.equal(s.chat, null)
})

test('rowing and clock continue during daily speech; invalid time and a fresh game preserve their existing rules', () => {
  const g = createRowing(seeded(10)); g.minutes = 1440 + 420 - .01; g.eveningSeen = true; g.effort = true
  tickRowing(g, .01, () => .99)
  assert.equal(g.daily.chat.kind, 'school')
  const time = g.minutes, before = structuredClone(g.daily)
  for (const dt of [0, -1, NaN, Infinity]) tickRowing(g, dt)
  assert.deepEqual(g.daily, before)
  row(g, 'shiro'); row(g, 'ryo', () => 0)
  assert.equal(g.shiroStrokes, 1); assert.equal(g.ryoStrokes, 1)
  tickRowing(g, .1, () => .99)
  assert.ok(g.minutes > time); assert.ok(g.daily.chat.age > 0)
  assert.equal(createRowing().daily.chat, null)
})

function wait(game, seconds) { for (let i = 0; i < seconds * 60; i++) tickRowing(game, 1 / 60) }

test('display clock uses ten-minute steps, correct am/pm and calendar rollover from April 1', () => {
  for (const [minutes, date, time, meridiem] of [
    [1080, '2026/04/01', '06:00', 'pm'], [1089.99, '2026/04/01', '06:00', 'pm'], [1090, '2026/04/01', '06:10', 'pm'],
    [1440, '2026/04/02', '12:00', 'am'], [1440 + 348, '2026/04/02', '05:40', 'am'],
    [1440 + 720, '2026/04/02', '12:00', 'pm'], [1440 * 30, '2026/05/01', '12:00', 'am'],
  ]) {
    const result = clockDisplayAt(minutes)
    assert.deepEqual([result.date, result.time, result.meridiem], [date, time, meridiem])
    assert.ok(!/[\u4e00-\u9fff]/u.test(JSON.stringify(result)))
  }
  const g = createRowing(); g.minutes = 1440 + 239.9; g.eveningSeen = true
  tickRowing(g, .1); assert.equal(g.daily.chat.kind, 'tired'); assert.equal(clockDisplayAt(g.minutes).time, '04:00')
})

test('shore opening freezes the clock through boarding and two automatic announcements separated by a gap', () => {
  const g = createRowing(() => .2, true), position = { x: g.x, y: g.y }
  assert.equal(g.opening, 'ryo'); assert.equal(g.minutes, 1080)
  for (const expected of ['shiro', 'boarding', 'guide', 'guide-gap', 'guide-start', null]) {
    const before = g.opening
    for (let i = 0; i < 40 && g.opening === before; i++) {
      assert.equal(row(g, 'shiro'), null); assert.equal(row(g, 'ryo'), null)
      tickRowing(g, .1)
    }
    assert.equal(g.opening, expected)
    assert.equal(g.minutes, 1080); assert.equal(g.taps, 0)
    assert.deepEqual({ x: g.x, y: g.y }, position)
  }
  assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(g.opening, null)
  tickRowing(g, .1); assert.ok(g.minutes > 1080); assert.equal(g.shiroStrokes, 1)
  assert.equal(createRowing(() => .2, true).opening, 'ryo')
})

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
function hullGap(boat, player) {
  return Math.min(...[-48, 0, 48].map(offset => Math.hypot(boat.x - player.x - Math.sin(player.heading) * offset, boat.y - player.y + Math.cos(player.heading) * offset)))
}

test('each couple receives stable random speed, rhythm and route; new games redraw them', () => {
  const a = createRowing(seeded(7)), b = createRowing(seeded(8))
  for (const key of ['speed', 'frequency', 'pulseFrequency', 'phase', 'lane', 'amplitude']) {
    assert.equal(new Set(a.couples.map(boat => boat.motion[key])).size, 8)
  }
  assert.notDeepEqual(a.couples.map(b => b.motion), b.couples.map(b => b.motion))
  const start = new Map(a.couples.map(boat => [boat.id, structuredClone(boat)]))
  for (let i = 0; i < 100; i++) tickRowing(a, .1, () => .99)
  assert.ok(a.couples.filter(boat => start.has(boat.id)).length >= 7)
  a.couples.forEach(boat => {
    const before = start.get(boat.id)
    if (before) { assert.deepEqual(boat.motion, before.motion); assert.ok(Math.hypot(boat.x - before.x, boat.y - before.y) > 2) }
  })
})

test('couples keep moving slowly on different paths and never steer into a stationary player', () => {
  for (let seed = 0; seed < 64; seed++) {
    const angle = seed * Math.PI / 8, player = { x: riverCenter(370), y: 370, heading: seed * .37 }
    const boat = { id: seed, x: player.x + Math.cos(angle) * 110, y: player.y + Math.sin(angle) * 110, heading: Math.PI, motion: createCoupleMotion(seeded(seed + 12)) }
    let travelled = 0
    const initialGap = hullGap(boat, player)
    for (let i = 0; i < 600; i++) {
      const before = { x: boat.x, y: boat.y, heading: boat.heading }
      moveCouple(boat, player, i * .1, .1)
      const step = Math.hypot(boat.x - before.x, boat.y - before.y)
      assert.ok(step <= .80000001, 'NPC speed must be capped at 8 world units/second')
      assert.ok(Math.abs(boat.heading - before.heading) <= .06500001, 'No sudden turns')
      assert.ok(hullGap(boat, player) >= Math.min(88, initialGap) - 1e-8, 'Autonomous motion must preserve visual clearance around the player hull')
      travelled += step
    }
    assert.ok(travelled > 20, `Avoidance must not make the boat permanently motionless: seed ${seed}, distance ${travelled}`)
  }
})

test('passive drifting does not provoke collisions, while paddling into a couple still does', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = createRowing(seeded(seed))
    for (let i = 0; i < 600; i++) tickRowing(g, .1, () => .99)
    assert.equal(g.collisions, 0, `idle river seed ${seed}`)
  }
  const g = createRowing(seeded(4)); g.minutes = 20 * 60
  g.couples = [{ id: 99, x: g.x, y: g.y + 108.1, heading: Math.PI, motion: createCoupleMotion(seeded(5)) }]
  assert.ok(hullGap(g.couples[0], g) > 59)
  row(g, 'shiro'); row(g, 'ryo', () => .01); tickRowing(g, .1, () => .2)
  assert.equal(g.collisions, 1); assert.equal(g.encounter.complaint, '啊！')
})

test('invalid time never moves couples; recycled boats receive new motion without keeping a chief identity', () => {
  const g = createRowing(seeded(3)), boat = g.couples[0], original = structuredClone(boat)
  for (const dt of [NaN, Infinity, 0, -1]) moveCouple(boat, g, 0, dt)
  assert.deepEqual(boat, original)
  boat.y = g.cameraY - 400; boat.chiefSurname = '佐藤'; boat.chiefChecked = true
  tickRowing(g, .01, () => .99)
  assert.notEqual(g.couples[0].id, boat.id); assert.notDeepEqual(g.couples[0].motion, boat.motion)
  assert.equal(g.couples[0].chiefSurname, undefined)
})

function chiefScene() {
  const g = createRowing(); g.minutes = 44 * 60; g.eveningSeen = true; g.effort = true
  g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
  tickRowing(g, .01, () => .01)
  return g
}

test('first evening guarantees one nearby chief greeting even with an unlucky draw, then later nights are random', () => {
  for (const draw of [0, .5, .999]) {
    const g = createRowing(seeded(5)); g.minutes = 19 * 60
    g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }, { id: 101, x: 300, y: 520, heading: Math.PI }]
    tickRowing(g, .01, () => draw)
    assert.equal(g.firstChiefSeen, true); assert.ok(g.chiefVisit)
    assert.equal(g.couples.filter(b => b.chiefSurname).length, 1)
    g.couples = [{ id: 102, x: 90, y: 200, heading: Math.PI }]
    tickRowing(g, .01, () => 0); assert.equal(g.chiefVisit, null)
    for (let i = 0; i < 100; i++) tickRowing(g, .1, () => 0)
    assert.equal(g.chiefVisit, null, 'No second guaranteed chief or random first-night chain')
    g.eveningSeen = true; g.minutes = 43 * 60
    tickRowing(g, .01, () => .999); assert.equal(g.chiefVisit, null)
    assert.equal(g.couples[0].chiefChecked, true)
    g.minutes = 67 * 60
    tickRowing(g, .01, () => .01); assert.ok(g.chiefVisit)
    assert.equal(g.couples[0].chiefNight, 2)
  }
})

test('guaranteed greeting waits for existing speech and a visible boat, without spawning or moving one', () => {
  const g = createRowing(); g.minutes = 19 * 60
  g.couples = [{ id: 100, x: 90, y: 900, heading: Math.PI }]
  tickRowing(g, .01, () => .99); assert.equal(g.firstChiefSeen, false)
  g.couples[0].y = 200
  g.encounter = { boatId: 100, complaint: COMPLAINTS[0], apology: APOLOGIES[0], age: 0 }
  tickRowing(g, .01, () => .99); assert.equal(g.firstChiefSeen, false)
  g.encounter = null
  tickRowing(g, .01, () => .99); assert.equal(g.firstChiefSeen, true)
  assert.equal(g.couples.length, 1); assert.equal(g.chiefVisit.boatId, 100)
  assert.ok(Math.abs(g.couples[0].y - 200) < 1)
})

test('collisions during a chief conversation still separate hulls but never interrupt or queue stale speech', () => {
  const g = chiefScene(), speakingId = g.chiefVisit.boatId, age = g.chiefVisit.age
  g.couples.push({ id: 101, x: g.x, y: g.y + 90, heading: Math.PI })
  const beforeY = g.couples[1].y
  tickRowing(g, .01, () => .9)
  assert.equal(g.encounter, null); assert.equal(g.chiefVisit.boatId, speakingId)
  assert.ok(g.chiefVisit.age > age); assert.ok(g.couples[1].y > beforeY)
  assert.equal(g.collisionCooldown, 0)
  g.chiefVisit.done = true
  g.couples[1].y = g.y + 90; g.couples[1].x = g.x
  tickRowing(g, .01, () => .9); assert.equal(g.encounter.boatId, 101)
  assert.equal(g.encounter.complaint, COMPLAINTS[2])
})

test('later nights draw once per visible boat at 1/10, never every frame or outside after-work hours', () => {
  let selected = 0
  for (let i = 0; i < 1000; i++) {
    const g = createRowing(); g.minutes = 44 * 60; g.eveningSeen = true
    g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
    let draws = 0
    tickRowing(g, .01, () => { draws++; return (i + .5) / 1000 })
    const initial = draws
    for (let frame = 0; frame < 20; frame++) tickRowing(g, .01, () => { draws++; return 0 })
    assert.equal(draws, initial)
    assert.equal(initial, i < 100 ? 2 : 1)
    if (g.couples[0].chiefSurname) selected++
  }
  assert.equal(selected, 100)
  for (const minutes of [9 * 60, 16 * 60, 18 * 60, 22 * 60, 23 * 60, 40 * 60]) {
    const g = createRowing(); g.minutes = minutes; g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
    tickRowing(g, .01, () => { assert.fail('No chief draw outside dusk') })
    assert.equal(g.chiefVisit, null)
  }
})

test('Sato plus ten surnames are freshly selected and carried consistently through the script', () => {
  assert.equal(CHIEF_SURNAMES.length, 11); assert.equal(new Set(CHIEF_SURNAMES).size, 11)
  for (let i = 0; i < CHIEF_SURNAMES.length; i++) {
    const g = createRowing(); g.minutes = 20 * 60; g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
    const draws = [(i + .5) / CHIEF_SURNAMES.length]
    tickRowing(g, .01, () => draws.shift())
    assert.equal(g.chiefVisit.surname, CHIEF_SURNAMES[i])
    assert.equal(chiefLines(g.chiefVisit.surname)[2].text, `啊，${CHIEF_SURNAMES[i]}课长，晚上好，您辛苦了。`)
    assert.equal(chiefLines(g.chiefVisit.surname)[0].speaker, CHIEF_SURNAMES[i])
  }
})

test('chief lines auto advance in exact order; face stays clear through ! then stays masked after dialogue ends', () => {
  const g = chiefScene()
  assert.deepEqual(chiefLines('佐藤').map(line => line.text), [
    '咦，这不是宇都木吗？', '！', '啊，佐藤课长，晚上好，您辛苦了。', '晚上好，下班过来的？',
    '是的，来稍微换换心情。', '这样啊，偶尔这样也挺好的。', '是的，这里很安静。', '那明天见。', '好的，那我先告辞了。',
  ])
  for (let line = 0; line < 9; line++) {
    assert.equal(g.chiefVisit.line, line); assert.equal(g.chiefVisit.masked, line >= 2)
    const start = g.elapsed
    while (g.chiefVisit.line === line && g.elapsed - start < 4) tickRowing(g, .05, () => .9)
    assert.ok(g.elapsed > start)
  }
  assert.equal(g.chiefVisit.done, true); assert.equal(g.chiefVisit.masked, true)
  wait(g, 1); assert.equal(g.chiefVisit.done, true)
})

test('chief visit never blocks either rower and pauses speech beneath collision/night lines', () => {
  const g = chiefScene(), initialTime = g.minutes, initialY = g.y
  row(g, 'shiro'); row(g, 'ryo', () => .01); wait(g, .6)
  assert.equal(g.shiroStrokes, 1); assert.equal(g.ryoStrokes, 1); assert.ok(g.minutes > initialTime); assert.notEqual(g.y, initialY)
  const age = g.chiefVisit.age
  g.encounter = { boatId: 100, complaint: '啊！', apology: APOLOGIES[2], age: 0 }
  wait(g, 1); assert.equal(g.chiefVisit.age, age)
  g.encounter = null; g.dialogue = 0; g.dialogueAge = 0
  wait(g, 1); assert.equal(g.chiefVisit.age, age)
  g.dialogue = null; wait(g, .2); assert.ok(g.chiefVisit.age > age)
})

test('chief boat leaving any edge cancels remaining lines and mosaic, including completed visits', () => {
  for (const line of [0, 1, 2, 9]) for (const direction of ['top', 'bottom', 'left', 'right']) {
    const g = chiefScene(); Object.assign(g.chiefVisit, { line, masked: line >= 2, done: line === 9 })
    const boat = g.couples[0]
    if (direction === 'top') boat.y = g.cameraY - 60
    if (direction === 'bottom') boat.y = g.cameraY + 760
    if (direction === 'left') boat.x = -60
    if (direction === 'right') boat.x = 450
    tickRowing(g, .01, () => .99)
    assert.equal(g.chiefVisit, null); assert.equal(coupleVisible(boat, g.cameraY), false)
  }
  const g = chiefScene(); g.couples[0].y = g.cameraY - 39
  assert.equal(coupleVisible(g.couples[0], g.cameraY), true)
  tickRowing(g, .01, () => .99); assert.ok(g.chiefVisit, 'Keep the visit while part of the boat is still visible')
})

test('chief collision always says ah and uses the most polite apology, even before greeting', () => {
  for (const draw of [0, .5, .999]) {
    const g = createRowing(); g.minutes = 20 * 60
    g.couples = [{ id: 100, x: g.x, y: g.y + 90, heading: Math.PI, chiefChecked: true, chiefSurname: '田中' }]
    tickRowing(g, .01, () => draw)
    assert.equal(g.encounter.complaint, '啊！'); assert.equal(g.encounter.apology, '非常抱歉，我们会注意的。')
    g.couples[0].y = g.cameraY - 60; tickRowing(g, .01, () => draw)
    assert.equal(g.encounter, null); assert.equal(g.chiefVisit, null)
  }
})

test('recycled boats get a fresh chief draw and no visit survives recycling or a new game', () => {
  const g = chiefScene(); const oldId = g.couples[0].id
  g.couples[0].y = -400; tickRowing(g, .01, () => .99)
  assert.equal(g.chiefVisit, null); assert.notEqual(g.couples[0].id, oldId); assert.equal(g.couples[0].chiefChecked, undefined)
  g.couples[0].y = g.cameraY + 200
  const draws = [.01, .999]; tickRowing(g, .01, () => draws.shift())
  assert.equal(g.chiefVisit.surname, '吉田'); assert.equal(createRowing().chiefVisit, null)
})

test('rowing starts at 18:00 in night scenery without an immediate go-home line', () => {
  const g = createRowing()
  assert.equal(clockAt(g.minutes), '18:00'); assert.equal(periodAt(g.minutes), 'night'); assert.equal(ryoForwardChance(g.minutes), 0)
  wait(g, 10)
  assert.equal(clockAt(g.minutes), '18:30')
  assert.equal(g.dialogue, null); assert.equal(g.effort, false)
  assert.equal(g.taps, 0); assert.equal(g.shiroStrokes, 0); assert.equal(g.ryoStrokes, 0)
  assert.equal(g.x, 195); assert.ok(Math.abs(g.y - 430) < .01); assert.ok(g.cameraY > 50)
})

test('Shiro reliably rows and rapidly repeated events cannot spam strokes', () => {
  const g = createRowing()
  assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'shiro'), null)
  assert.equal(g.shiroStrokes, 1); assert.ok(g.spin > 0)
  wait(g, .6); assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(g.shiroStrokes, 2)
})

test('Ryo can cooperate, refuse or push before going home; the retained morning push says haha', () => {
  for (const [roll, result] of [[.01, 'stroke'], [.3, 'refuse'], [.9, 'push']]) {
    const g = createRowing(); g.minutes = 33 * 60; assert.equal(row(g, 'ryo', () => roll), result)
    if (result === 'stroke') { assert.equal(g.ryoStrokes, 1); assert.ok(g.spin < 0) }
    if (result === 'refuse') { assert.equal(g.spin, 0); assert.equal(g.speed, 0) }
    if (result === 'push') { assert.equal(g.shiroStrokes, 1); assert.equal(g.ryoStrokes, 0); assert.equal(g.laughUntil, 1.8); assert.ok(g.spin > 0) }
  }
})

test('each draw is independent of tapping rhythm and previous actions; 19:00 has zero forward chance', () => {
  const counts = { stroke: 0, strong: 0, refuse: 0, push: 0 }
  for (let i = 0; i < 1000; i++) {
    const fast = createRowing(), slow = createRowing()
    fast.elapsed = .6; fast.lastRyo = 0; fast.ryoAction = 'push'
    slow.elapsed = 50; slow.lastRyo = 0; slow.ryoAction = 'stroke'
    const draw = (i + .5) / 1000
    const action = row(fast, 'ryo', () => draw)
    assert.equal(row(slow, 'ryo', () => draw), action)
    counts[action]++
  }
  assert.deepEqual(counts, { stroke: 0, strong: 0, refuse: 500, push: 500 })
  const normal = createRowing(), strong = createRowing()
  normal.minutes = strong.minutes = 22 * 60
  row(normal, 'ryo', () => .1); row(strong, 'ryo', () => .45)
  assert.ok(strong.speed > normal.speed); assert.ok(Math.abs(strong.spin) > Math.abs(normal.spin))
})

test('19–22 ramps 0–50%; subsequent days drop to 30% at 06:00 and return to 50% at 18:00', () => {
  for (const [hour, expected] of [[19, 0], [19.6, .1], [20.5, .25], [21.4, .4], [22, .5], [24, .5], [29.99, .5], [30, .3], [36, .3], [41.99, .3], [42, .5], [46, .5], [48, .5], [54, .3], [66, .5]]) {
    assert.ok(Math.abs(ryoForwardChance(hour * 60) - expected) < 1e-10)
    for (const effort of [false, true]) {
      const counts = { stroke: 0, strong: 0, refuse: 0, push: 0, reverse: 0, miss: 0 }
      for (let i = 0; i < 2000; i++) {
        const g = createRowing(); g.minutes = hour * 60; g.effort = effort
        counts[row(g, 'ryo', () => (i + .5) / 2000)]++
      }
      assert.equal(counts.stroke + counts.strong, Math.round(expected * 2000))
      assert.ok(counts.stroke + counts.strong <= 1000)
      if (effort) { assert.equal(counts.refuse + counts.push, 0); assert.equal(counts.reverse, 300); assert.equal(counts.miss, 1700 - Math.round(expected * 2000)) }
      else { assert.equal(counts.refuse, counts.push); assert.equal(counts.reverse, 0) }
    }
  }
  let previous = 0
  for (let minute = 0; minute <= 3 * 24 * 60; minute++) {
    const probability = ryoForwardChance(minute)
    if (minute >= 19 * 60 && minute <= 22 * 60) assert.ok(probability >= previous)
    assert.ok(probability >= 0 && probability <= .5)
    previous = probability
  }
})

test('one-sided effort circles; matched strokes cancel turning and travel further', () => {
  const circle = createRowing(), forward = createRowing()
  circle.minutes = forward.minutes = 20 * 60
  circle.couples = []; forward.couples = []
  for (let i = 0; i < 30; i++) {
    row(circle, 'shiro'); row(forward, 'shiro'); row(forward, 'ryo', () => 0)
    wait(circle, .6); wait(forward, .6)
  }
  assert.ok(circle.heading > Math.PI * 4)
  assert.equal(forward.heading, Math.PI)
  assert.ok(forward.distance > circle.distance * 3)
  const spin = circle.spin; wait(circle, 8); assert.ok(circle.spin < spin / 3)
})

test('evening lines expire automatically while time, movement and both rowers continue', () => {
  const g = createRowing(); g.couples = []; g.minutes = 1319.9; tickRowing(g, .1)
  assert.ok(g.minutes > 1320); assert.equal(g.dialogue, 0)
  assert.deepEqual(EVENING_LINES.map(line => line.text), ['该回家了，明天还有工作。', '你以为我不想吗！！！'])
  const startY = g.y, startTime = g.minutes
  for (let i = 0; i < 5; i++) {
    assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'ryo', () => .2), 'stroke'); wait(g, .6)
  }
  assert.equal(g.dialogue, 0); assert.ok(g.minutes > startTime); assert.ok(g.y > startY)
  assert.equal(g.effort, false)
  wait(g, .3); assert.equal(g.dialogue, 1); assert.equal(g.effort, true)
  assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'ryo', () => .6), 'reverse')
  wait(g, 3.2); assert.equal(g.dialogue, null); assert.equal(g.effort, true)
  assert.ok(g.minutes > 1338); assert.ok(g.cameraY > 0)
})

test('evening effort always rows, reverse strokes worsen Shiro-side spinning, never refuses or pushes', () => {
  for (const roll of [0, .2, .45, .6, .75, .9]) {
    const g = createRowing(); g.effort = true; g.minutes = 22 * 60
    row(g, 'shiro'); const oldSpin = g.spin
    const action = row(g, 'ryo', () => roll)
    assert.ok(['stroke', 'strong', 'reverse', 'miss'].includes(action))
    assert.equal(g.ryoStrokes, 1); assert.equal(g.shiroStrokes, 1)
    assert.equal(g.laughUntil, 0)
    if (action === 'reverse') { assert.ok(g.spin > oldSpin); assert.equal(g.speed, 0) }
    else if (action === 'stroke') assert.equal(g.spin, 0)
    else if (action === 'miss') { assert.equal(g.spin, oldSpin); assert.equal(g.speed, 18) }
    else assert.ok(g.spin < 0)
  }
})

test('time wraps across midnight; effort survives dawn and dialogue never repeats', () => {
  const g = createRowing(); g.effort = true; g.eveningSeen = true; g.minutes = 1439.9
  tickRowing(g, .1); assert.equal(clockAt(g.minutes), '00:00'); assert.equal(periodAt(g.minutes), 'night')
  g.minutes = 1799.9; tickRowing(g, .1); assert.equal(periodAt(g.minutes), 'morning'); assert.equal(g.effort, true)
  g.minutes = 2519.9; tickRowing(g, .1); assert.equal(g.dialogue, null)
  assert.equal(ryoForwardChance(g.minutes), .5)
  for (const [boundary, before, after] of [[30, .5, .3], [42, .3, .5], [54, .5, .3], [66, .3, .5]]) {
    g.minutes = boundary * 60 - .1; assert.equal(ryoForwardChance(g.minutes), before)
    tickRowing(g, .1); assert.equal(ryoForwardChance(g.minutes), after); assert.equal(g.dialogue, null)
  }
})

test('invalid time is ignored; large delta cannot catch up a background tab; trail bounded', () => {
  const g = createRowing(), initial = structuredClone(g)
  for (const dt of [0, -1, Infinity, NaN]) tickRowing(g, dt)
  assert.deepEqual(g, initial)
  tickRowing(g, 10000); assert.ok(g.minutes < 1141)
  for (let i = 0; i < 300; i++) { row(g, 'shiro'); wait(g, .6) }
  assert.ok(g.trail.length < 33); assert.ok(g.x > 60 && g.x < 340); assert.ok(g.y > 550)
})

test('river camera follows unbounded forward and backward travel instead of an invisible wall', () => {
  for (const heading of [0, Math.PI]) {
    const g = createRowing(); g.minutes = 20 * 60; g.couples = []; g.heading = heading
    for (let i = 0; i < 120; i++) { row(g, 'shiro'); row(g, 'ryo', () => 0); wait(g, .6) }
    assert.ok(heading === 0 ? g.y < -1000 : g.y > 2000)
    assert.ok(Math.abs(g.y - g.cameraY - 370) < 22)
    assert.ok(g.trail.length < 33)
  }
})

test('only hull contact starts a random complaint then apology; exchanges expire without blocking rowing', () => {
  for (const [index, draw] of [[0, .1], [1, .5], [2, .9]]) {
    const g = createRowing(); g.couples = [{ id: 5, x: g.x, y: g.y + 180, heading: Math.PI }]
    tickRowing(g, .01, () => draw); assert.equal(g.encounter, null)
    g.couples[0].y = g.y + 90
    tickRowing(g, .01, () => draw)
    assert.equal(g.encounter.complaint, COMPLAINTS[index]); assert.equal(g.encounter.apology, APOLOGIES[index])
    assert.equal(g.encounter.boatId, 5); assert.equal(g.collisions, 1)
    assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(g.dialogue, null)
    wait(g, 2.7); assert.ok(g.encounter.age >= 2.6); assert.equal(g.collisions, 1)
    wait(g, 3.2); assert.equal(g.encounter, null); assert.equal(g.collisions, 1)
  }
})

test('night scene takes precedence over collision speech and distant boats recycle in bounded storage', () => {
  const g = createRowing()
  g.couples[0] = { id: 0, x: g.x, y: g.y + 90, heading: Math.PI }
  tickRowing(g, .01); assert.ok(g.encounter)
  g.minutes = 1319.99; tickRowing(g, .01)
  assert.equal(g.dialogue, 0); assert.equal(g.encounter, null)
  g.couples[0].x = g.x; g.couples[0].y = g.y + 90
  tickRowing(g, .1); assert.equal(g.encounter, null); assert.ok(g.minutes > 1320)
  const trip = createRowing(); trip.y = 5000; trip.cameraY = 4630
  tickRowing(trip, .01)
  assert.equal(trip.couples.length, COUPLE_COUNT)
  assert.ok(trip.couples.every(b => b.id >= COUPLE_COUNT && b.y >= trip.cameraY - 200 && b.y <= trip.cameraY + 1300))
})

test('more couples stay distributed around the moving camera without growing the pool', () => {
  const g = createRowing()
  assert.equal(g.couples.length, 8)
  assert.ok(g.couples.filter(b => b.y >= 0 && b.y <= 700).length >= 4)
  tickRowing(g, .01); assert.equal(g.collisions, 0)
  for (const y of [5000, -3000, 10000, 370]) {
    g.y = y; g.cameraY = y - 370; g.encounter = null
    tickRowing(g, .01)
    assert.equal(g.couples.length, 8)
    assert.equal(new Set(g.couples.map(b => b.id)).size, 8)
    assert.ok(g.couples.every(b => b.y >= g.cameraY - 200 && b.y <= g.cameraY + 1300))
  }
})

test('collision bubbles and tails avoid the whole rotated boat and portraits at narrow and desktop sizes', () => {
  for (const width of [320, 390, 560]) for (const height of [640, 844]) {
    const scale = Math.max(180, Math.min(230, width * .48)) / 220
    for (const x of [95, 195, 300]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const center = { x: x / 390 * width, y: 50 + 370 / 700 * (height - 140) }
      const seats = [-35, 35].map(sx => ({ x: center.x + (Math.cos(angle) * sx - Math.sin(angle) * 20) * scale, y: center.y + (Math.sin(angle) * sx + Math.cos(angle) * 20) * scale }))
      const bounds = rowingBounds(center, angle, scale, seats)
      for (const text of [...COMPLAINTS, ...APOLOGIES, ...chiefLines('佐藤').map(line => line.text), ...Object.values(DAILY_LINES).flat().map(line => line.text)]) {
        const bubbleWidth = Math.min(300, width - 32, Math.max(112, text.length * 16 + 44))
        const bubbleHeight = 62 + Math.ceil(text.length * 16 / (bubbleWidth - 40)) * 26
        for (const anchor of [seats[0], { x: center.x, y: center.y - 100 }, { x: center.x, y: center.y + 100 }]) {
          const bubble = placeResponse({ width, height }, anchor, bounds, bubbleWidth, bubbleHeight)
          const rect = { left: bubble.left, top: bubble.top - (bubble.below ? 10 : 0), right: bubble.left + bubbleWidth, bottom: bubble.top + bubbleHeight + (bubble.below ? 0 : 10) }
          assert.equal(overlaps(rect, bounds), false)
          assert.ok(bubble.left >= 16 && bubble.left + bubbleWidth <= width - 16)
          assert.ok(bubble.top >= 0 && bubble.top + bubbleHeight <= height - 108)
        }
      }
    }
  }
})

test('UI references approved portraits and stops animation while hidden or entering', () => {
  const ui = readFileSync(new URL('../src/games/rowing/index.tsx', import.meta.url), 'utf8')
  assert.match(ui, /document.hidden/); assert.match(ui, /closest\('\[inert\]'\)/)
  assert.match(ui, /prefers-reduced-motion/); assert.match(ui, /cancelAnimationFrame/)
  assert.match(ui, /white-a.png/); assert.match(ui, /white-b.png/); assert.match(ui, /no-crown-a.png/); assert.match(ui, /fishing-no-grapes.png/)
  assert.doesNotMatch(ui, /crown-a\.png'\s*,.*crown-b/)
})
