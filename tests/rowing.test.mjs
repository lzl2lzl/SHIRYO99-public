import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRowing, row, tickRowing, clockAt, periodAt, EVENING_LINES, COMPLAINTS, APOLOGIES } from '../src/games/rowing/model.ts'

function wait(game, seconds) { for (let i = 0; i < seconds * 60; i++) tickRowing(game, 1 / 60) }

test('rowing starts at 09:00; idle time runs without inventing strokes', () => {
  const g = createRowing(); wait(g, 10)
  assert.equal(clockAt(g.minutes), '09:30')
  assert.equal(g.taps, 0); assert.equal(g.shiroStrokes, 0); assert.equal(g.ryoStrokes, 0)
  assert.equal(g.x, 195); assert.ok(Math.abs(g.y - 430) < .01); assert.ok(g.cameraY > 50)
})

test('Shiro reliably rows and rapidly repeated events cannot spam strokes', () => {
  const g = createRowing()
  assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'shiro'), null)
  assert.equal(g.shiroStrokes, 1); assert.ok(g.spin > 0)
  wait(g, .6); assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(g.shiroStrokes, 2)
})

test('daytime Ryo can cooperate, refuse or push Shiro; morning push says haha', () => {
  for (const [roll, result] of [[.1, 'stroke'], [.8, 'refuse'], [.9, 'push']]) {
    const g = createRowing(); assert.equal(row(g, 'ryo', () => roll), result)
    if (result === 'stroke') { assert.equal(g.ryoStrokes, 1); assert.ok(g.spin < 0) }
    if (result === 'refuse') { assert.equal(g.spin, 0); assert.equal(g.speed, 0) }
    if (result === 'push') { assert.equal(g.shiroStrokes, 1); assert.equal(g.ryoStrokes, 0); assert.equal(g.laughUntil, 1.8); assert.ok(g.spin > 0) }
  }
})

test('each draw is independent of tapping rhythm and previous actions; 75% of daytime outcomes propel forward', () => {
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
  assert.deepEqual(counts, { stroke: 650, strong: 100, refuse: 100, push: 150 })
  const normal = createRowing(), strong = createRowing()
  row(normal, 'ryo', () => .2); row(strong, 'ryo', () => .7)
  assert.ok(strong.speed > normal.speed); assert.ok(Math.abs(strong.spin) > Math.abs(normal.spin))
})

test('one-sided effort circles; matched strokes cancel turning and travel further', () => {
  const circle = createRowing(), forward = createRowing()
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
  const g = createRowing(); g.couples = []; g.minutes = 1079.9; tickRowing(g, .1)
  assert.ok(g.minutes > 1080); assert.equal(g.dialogue, 0)
  assert.deepEqual(EVENING_LINES.map(line => line.text), ['该回家了，明天还有工作。', '你以为我不想吗！！！'])
  const startY = g.y, startTime = g.minutes
  for (let i = 0; i < 5; i++) {
    assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'ryo', () => .2), 'stroke'); wait(g, .6)
  }
  assert.equal(g.dialogue, 0); assert.ok(g.minutes > startTime); assert.ok(g.y > startY)
  assert.equal(g.effort, false)
  wait(g, .3); assert.equal(g.dialogue, 1); assert.equal(g.effort, true)
  assert.equal(row(g, 'shiro'), 'stroke'); assert.equal(row(g, 'ryo', () => .9), 'reverse')
  wait(g, 3.2); assert.equal(g.dialogue, null); assert.equal(g.effort, true)
  assert.ok(g.minutes > 1098); assert.ok(g.cameraY > 0)
})

test('evening effort always rows, reverse strokes worsen Shiro-side spinning, never refuses or pushes', () => {
  for (const roll of [0, .2, .75, .9]) {
    const g = createRowing(); g.effort = true
    row(g, 'shiro'); const oldSpin = g.spin
    const action = row(g, 'ryo', () => roll)
    assert.ok(['stroke', 'strong', 'reverse'].includes(action))
    assert.equal(g.ryoStrokes, 1); assert.equal(g.shiroStrokes, 1)
    assert.equal(g.laughUntil, 0)
    if (action === 'reverse') { assert.ok(g.spin > oldSpin); assert.equal(g.speed, 0) }
    else if (action === 'stroke') assert.equal(g.spin, 0)
    else assert.ok(g.spin < 0)
  }
})

test('time wraps across midnight; effort survives dawn and dialogue never repeats', () => {
  const g = createRowing(); g.effort = true; g.eveningSeen = true; g.minutes = 1439.9
  tickRowing(g, .1); assert.equal(clockAt(g.minutes), '00:00'); assert.equal(periodAt(g.minutes), 'night')
  g.minutes = 1799.9; tickRowing(g, .1); assert.equal(periodAt(g.minutes), 'morning'); assert.equal(g.effort, true)
  g.minutes = 2519.9; tickRowing(g, .1); assert.equal(g.dialogue, null)
})

test('invalid time is ignored; large delta cannot catch up a background tab; trail bounded', () => {
  const g = createRowing(), initial = structuredClone(g)
  for (const dt of [0, -1, Infinity, NaN]) tickRowing(g, dt)
  assert.deepEqual(g, initial)
  tickRowing(g, 10000); assert.ok(g.minutes < 541)
  for (let i = 0; i < 300; i++) { row(g, 'shiro'); wait(g, .6) }
  assert.ok(g.trail.length < 33); assert.ok(g.x > 60 && g.x < 340); assert.ok(g.y > 550)
})

test('river camera follows unbounded forward and backward travel instead of an invisible wall', () => {
  for (const heading of [0, Math.PI]) {
    const g = createRowing(); g.couples = []; g.heading = heading
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
  g.minutes = 1079.99; tickRowing(g, .01)
  assert.equal(g.dialogue, 0); assert.equal(g.encounter, null)
  g.couples[0].x = g.x; g.couples[0].y = g.y + 90
  tickRowing(g, .1); assert.equal(g.encounter, null); assert.ok(g.minutes > 1080)
  const trip = createRowing(); trip.y = 5000; trip.cameraY = 4630
  tickRowing(trip, .01)
  assert.equal(trip.couples.length, 3); assert.ok(trip.couples.every(b => b.id >= 3 && b.y > trip.cameraY + 700))
})

test('UI references approved portraits and stops animation while hidden or entering', () => {
  const ui = readFileSync(new URL('../src/games/rowing/index.tsx', import.meta.url), 'utf8')
  assert.match(ui, /document.hidden/); assert.match(ui, /closest\('\[inert\]'\)/)
  assert.match(ui, /prefers-reduced-motion/); assert.match(ui, /cancelAnimationFrame/)
  assert.match(ui, /white-a.png/); assert.match(ui, /white-b.png/); assert.match(ui, /no-crown-a.png/); assert.match(ui, /fishing-no-grapes.png/)
  assert.doesNotMatch(ui, /crown-a\.png'\s*,.*crown-b/)
})
