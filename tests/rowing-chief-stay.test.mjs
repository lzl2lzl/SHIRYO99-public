import test from 'node:test'
import assert from 'node:assert/strict'
import { createRowing, tickRowing, row, chiefLines, coupleVisible } from '../src/games/rowing/model.ts'

function meeting() {
  const s = createRowing(() => .9); s.minutes = 22 * 60; s.eveningSeen = true; s.effort = true
  s.trafficNextAt = Infinity; s.coupleChatNextAt = Infinity
  s.couples = [{ id: 100, x: 90, y: 180, heading: 0 }]
  tickRowing(s, .01, () => .9)
  assert.ok(s.chiefVisit)
  return s
}

test('the complete chief exchange plays while the player keeps rowing, then the chief really leaves', () => {
  for (const mode of ['forward', 'reverse', 'spin']) {
    const s = meeting(), seen = new Set(), boat = s.couples[0]
    for (let i = 0; i < 500 && !s.chiefVisit.done; i++) {
      if (i % 6 === 0) { row(s, 'shiro'); if (mode !== 'spin') row(s, 'ryo', () => mode === 'reverse' ? .52 : 0) }
      seen.add(s.chiefVisit.line)
      assert.equal(boat.departing, undefined)
      tickRowing(s, .1, () => .9)
      assert.ok(coupleVisible(boat, s.cameraY, s.cameraX))
    }
    assert.equal(seen.size, chiefLines(s.chiefVisit.surname).length)
    assert.equal(s.chiefVisit.done, true); assert.equal(s.chiefVisit.masked, true)
    assert.equal(boat.departing, true); assert.equal(boat.chiefTalking, false)
    assert.ok(s.shiroStrokes > 0)
    for (let i = 0; i < 600 && s.chiefVisit; i++) tickRowing(s, .1, () => .9)
    assert.equal(s.chiefVisit, null)
  }
})

test('midnight traffic cleanup and collisions cannot remove a chief who is still speaking', () => {
  const s = meeting(), id = s.chiefVisit.boatId
  s.minutes = 1439.99; s.trafficNextAt = 0
  s.couples[0].x = s.x; s.couples[0].y = s.y
  tickRowing(s, .1, () => .9)
  assert.ok(s.minutes > 1440)
  assert.equal(s.chiefVisit.boatId, id); assert.equal(s.couples.length, 1)
  assert.equal(s.couples[0].departing, undefined)
  for (let i = 0; i < 1000 && s.chiefVisit; i++) tickRowing(s, .1, () => .9)
  assert.equal(s.chiefVisit, null)
  tickRowing(s, .1, () => .9); assert.equal(s.couples.length, 0)
})
