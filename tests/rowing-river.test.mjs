import test from 'node:test'
import assert from 'node:assert/strict'
import { riverScale, riverHalfWidth, riverCenter, trafficCenter, RIVER_START_MINUTE } from '../src/games/rowing/river.ts'
import { bankX, bankPath } from '../src/games/rowing/scenery.ts'
import { createRowing, tickRowing } from '../src/games/rowing/model.ts'
import { createCouple, coupleTarget, coupleVisible } from '../src/games/rowing/couples.ts'
import { SPACE_MILESTONES, upgradeAt } from '../src/games/rowing/progression/catalog.ts'

test('river grows faster toward each skill stage without a jump when the upgrade arrives', () => {
  const at = days => RIVER_START_MINUTE + days * 1440
  assert.equal(riverScale(at(0)), 1)
  assert.equal(riverScale(at(-1)), 1)
  assert.ok(riverScale(at(7)) >= 1.8)
  assert.ok(riverScale(at(21)) > 2)
  assert.ok(riverScale(at(365)) > riverScale(at(21)))
  for (const milestone of SPACE_MILESTONES.slice(1)) {
    assert.equal(riverScale(upgradeAt(milestone.week)), milestone.scale)
    assert.ok(Math.abs(riverScale(upgradeAt(milestone.week) + .001) - riverScale(upgradeAt(milestone.week) - .001)) < .00001)
  }
  let previous = 1
  for (let day = 0; day <= 365; day += .5) { const scale = riverScale(at(day)); assert.ok(scale >= previous); previous = scale }
  for (const y of [-1000, 0, 370, 6000]) for (const right of [false, true]) {
    const shift = bankX(y, right, at(7)) - bankX(y, right, at(0))
    assert.ok(Math.abs(shift - (right ? 1 : -1) * 169 * (riverScale(at(7)) - 1)) < 1e-9)
    assert.ok(!/NaN|Infinity/.test(bankPath(y, right, 12, at(365), 250)))
  }
})

test('wider physical river permits lateral travel and the camera follows instead of losing the boat', () => {
  for (const side of [-1, 1]) {
    const s = createRowing(() => .7)
    s.minutes = RIVER_START_MINUTE + 21 * 1440; s.eveningSeen = true
    s.x = riverCenter(s.y) + side * 210; s.couples = []; s.trafficNextAt = Infinity
    const initialX = s.x
    for (let i = 0; i < 100; i++) tickRowing(s, .05, () => .7)
    assert.ok(Math.abs(s.x - initialX) < 1, 'No old narrow-bank correction')
    assert.ok(Math.abs(s.cameraX) > 100)
    assert.ok(s.x - s.cameraX >= 139 && s.x - s.cameraX <= 251)
    assert.ok(Math.abs(s.x - riverCenter(s.y)) < riverHalfWidth(s.minutes) - 74)
    const visible = { x: s.cameraX + 195, y: s.cameraY + 350, heading: 0, id: 100 }
    assert.equal(coupleVisible(visible, s.cameraY, s.cameraX), true)
    assert.equal(coupleVisible({ ...visible, x: s.cameraX - 170 }, s.cameraY, s.cameraX), false)
  }
})

test('traffic keeps the same neighbourhood size and target at seven and twenty-one days', () => {
  for (const day of [0, 7, 21, 84, 182]) {
    const minutes = RIVER_START_MINUTE + day * 1440
    assert.equal(coupleTarget(minutes), 7)
    for (const cameraX of [-220, 0, 220]) {
      const boat = createCouple(0, 500, () => .7, minutes, cameraX)
      assert.ok(Math.abs(boat.x - trafficCenter(500, minutes, cameraX)) <= 100)
      assert.ok(Math.abs(boat.x - riverCenter(500)) < riverHalfWidth(minutes) - 57)
    }
  }
  const s = createRowing(() => .7)
  s.minutes += 21 * 1440; s.eveningSeen = true; s.couples = []
  s.x = 410; s.cameraX = 160; s.trafficNextAt = 0
  tickRowing(s, .01, () => .7)
  assert.equal(s.couples.length, 1)
  assert.ok(s.couples[0].x > 300, 'New boats arrive near the moved camera, not the old river centre')
  assert.equal(coupleVisible(s.couples[0], s.cameraY, s.cameraX), false, 'Arrivals remain offscreen')
})

test('growth freezes with background time and restarting restores initial river and camera', () => {
  const s = createRowing(); s.minutes += 7 * 1440; s.cameraX = 110
  const width = riverHalfWidth(s.minutes)
  tickRowing(s, 0); tickRowing(s, NaN)
  assert.equal(riverHalfWidth(s.minutes), width)
  const fresh = createRowing()
  assert.equal(riverHalfWidth(fresh.minutes), 169)
  assert.equal(fresh.cameraX, 0)
})

test('simulated nearby traffic density stays stable as river width grows', () => {
  const averages = [0, 7, 21].map(day => {
    let total = 0, samples = 0
    for (const seed of [1, 7, 19]) {
      let value = seed
      const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296)
      const s = createRowing(random); s.minutes += day * 1440; s.eveningSeen = true
      for (let i = 0; i < 2400; i++) {
        tickRowing(s, .1, random)
        if (i > 600 && i % 10 === 0) {
          total += s.couples.filter(b => Math.abs(b.x - s.x) < 230 && Math.abs(b.y - s.y) < 350).length
          samples++
        }
      }
    }
    return total / samples
  })
  assert.ok(averages[0] > .4, 'The samples include actual nearby traffic')
  for (const average of averages.slice(1)) assert.ok(Math.abs(average - averages[0]) < .1, String(averages))
})
