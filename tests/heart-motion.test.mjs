import test from 'node:test'
import assert from 'node:assert/strict'
import { ENTRY_DURATION, REPLAY_DURATION, heartFlight, heartCoverScale, clampUnit } from '../src/app/heart-motion.ts'

test('heart flight starts at the logo and lands exactly at the clicked entry', () => {
  const from = { x: 280, y: 160 }, to = { x: 90, y: 350 }
  assert.deepEqual(heartFlight(from, to, 0), from)
  const end = heartFlight(from, to, 1)
  assert.ok(Math.abs(end.x - to.x) < 1e-8 && Math.abs(end.y - to.y) < 1e-8)
  for (let i = 0; i <= 10; i++) {
    const point = heartFlight(from, to, i / 10)
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
  }
})

test('final heart covers every viewport corner even for an edge click or rotation', () => {
  for (const [width, height] of [[320, 844], [390, 844], [1280, 900], [844, 390]]) {
    for (const point of [{ x: 0, y: 0 }, { x: width, y: height }, { x: width * .8, y: height * .35 }]) {
      const scale = heartCoverScale(point, width, height)
      for (const [x,y] of [[0,0],[width,0],[0,height],[width,height]]) {
        assert.ok(Math.hypot(x - point.x, y - point.y) < scale * 6)
      }
    }
  }
})

test('choreography is finite and bounded, without a fake indefinite loading state', () => {
  assert.ok(ENTRY_DURATION <= 1200)
  assert.ok(REPLAY_DURATION <= 2200)
  assert.equal(clampUnit(-1), 0)
  assert.equal(clampUnit(2), 1)
})
