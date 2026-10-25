import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRowing, row, tickRowing, clockAt, periodAt, EVENING_LINES, COMPLAINTS, APOLOGIES, COUPLE_COUNT, ryoForwardChance, CHIEF_SURNAMES, chiefLines, coupleVisible } from '../src/games/rowing/model.ts'
import { overlaps, placeResponse, rowingBounds } from '../src/games/rowing/bubble-layout.ts'

function wait(game, seconds) { for (let i = 0; i < seconds * 60; i++) tickRowing(game, 1 / 60) }

function chiefScene() {
  const g = createRowing(); g.minutes = 16 * 60
  g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
  tickRowing(g, .01, () => .01)
  return g
}

test('dusk draws once per visible boat at 1/10, never every frame or outside dusk', () => {
  let selected = 0
  for (let i = 0; i < 1000; i++) {
    const g = createRowing(); g.minutes = 16 * 60
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
  for (const minutes of [9 * 60, 15 * 60, 18 * 60, 23 * 60]) {
    const g = createRowing(); g.minutes = minutes; g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
    tickRowing(g, .01, () => { assert.fail('No chief draw outside dusk') })
    assert.equal(g.chiefVisit, null)
  }
})

test('Sato plus ten surnames are freshly selected and carried consistently through the script', () => {
  assert.equal(CHIEF_SURNAMES.length, 11); assert.equal(new Set(CHIEF_SURNAMES).size, 11)
  for (let i = 0; i < CHIEF_SURNAMES.length; i++) {
    const g = createRowing(); g.minutes = 16 * 60; g.couples = [{ id: 100, x: 90, y: 200, heading: Math.PI }]
    const draws = [.01, (i + .5) / CHIEF_SURNAMES.length]
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
    const g = createRowing(); g.minutes = 16 * 60
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
  for (const [roll, result] of [[.01, 'stroke'], [.3, 'refuse'], [.9, 'push']]) {
    const g = createRowing(); assert.equal(row(g, 'ryo', () => roll), result)
    if (result === 'stroke') { assert.equal(g.ryoStrokes, 1); assert.ok(g.spin < 0) }
    if (result === 'refuse') { assert.equal(g.spin, 0); assert.equal(g.speed, 0) }
    if (result === 'push') { assert.equal(g.shiroStrokes, 1); assert.equal(g.ryoStrokes, 0); assert.equal(g.laughUntil, 1.8); assert.ok(g.spin > 0) }
  }
})

test('each draw is independent of tapping rhythm and previous actions; morning forward outcomes total 5%', () => {
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
  assert.deepEqual(counts, { stroke: 40, strong: 10, refuse: 475, push: 475 })
  const normal = createRowing(), strong = createRowing()
  row(normal, 'ryo', () => .01); row(strong, 'ryo', () => .045)
  assert.ok(strong.speed > normal.speed); assert.ok(Math.abs(strong.spin) > Math.abs(normal.spin))
})

test('forward probability rises from morning to evening and caps all forward actions together at 50%', () => {
  for (const [hour, expected] of [[9, .05], [12, .2], [15, .35], [18, .5], [24, .5], [33, .5], [100, .5]]) {
    assert.ok(Math.abs(ryoForwardChance(hour * 60) - expected) < 1e-10)
    for (const effort of [false, true]) {
      const counts = { stroke: 0, strong: 0, refuse: 0, push: 0, reverse: 0 }
      for (let i = 0; i < 2000; i++) {
        const g = createRowing(); g.minutes = hour * 60; g.effort = effort
        counts[row(g, 'ryo', () => (i + .5) / 2000)]++
      }
      assert.equal(counts.stroke + counts.strong, Math.round(expected * 2000))
      assert.ok(counts.stroke + counts.strong <= 1000)
      if (effort) { assert.equal(counts.refuse + counts.push, 0); assert.equal(counts.reverse, 2000 - Math.round(expected * 2000)) }
      else { assert.equal(counts.refuse, counts.push); assert.equal(counts.reverse, 0) }
    }
  }
  let previous = 0
  for (let minute = 0; minute <= 3 * 24 * 60; minute++) {
    const probability = ryoForwardChance(minute)
    assert.ok(probability >= previous && probability >= 0 && probability <= .5)
    previous = probability
  }
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
    const g = createRowing(); g.effort = true; g.minutes = 18 * 60
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
      for (const text of [...COMPLAINTS, ...APOLOGIES, ...chiefLines('佐藤').map(line => line.text)]) {
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
