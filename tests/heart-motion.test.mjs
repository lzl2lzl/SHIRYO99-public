import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ENTRY_DURATION, REPLAY_DURATION, heartFlight, heartCoverScale, clampUnit, replayFrame } from '../src/app/heart-motion.ts'

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
  assert.ok(REPLAY_DURATION <= 3500)
  assert.equal(clampUnit(-1), 0)
  assert.equal(clampUnit(2), 1)
})

test('ending lights eight hearts before revealing the core, spins faster, then enables choices', () => {
  const at = milliseconds => replayFrame(milliseconds / REPLAY_DURATION)
  for (let i = 0; i < 8; i++) {
    const frame = at(i * 110 + 105)
    assert.equal(frame.lights.filter(value => value === 1).length, i + 1)
    assert.equal(frame.core, 0)
    assert.equal(frame.rotation, 0)
    assert.equal(frame.ready, false)
  }
  assert.ok(at(1100).core > 0)
  assert.equal(at(1260).core, 1)
  assert.equal(at(1260).rotation, 0)
  assert.ok(at(1600).glow > 0)
  assert.ok(at(2500).rotation - at(2400).rotation > at(1700).rotation - at(1600).rotation)
  assert.equal(at(2999).ready, false)
  assert.equal(at(3000).ready, true)
  assert.equal(at(3400).rotation, Math.PI * 4)
  assert.equal(at(3400).actions, 1)
})

test('ending has two explicit actions and no extra wordmark or loading heart row', () => {
  const source = readFileSync(new URL('../src/app/HeartMotion.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /heart-replay-wordmark|heart-replay-progress/)
  assert.match(source, /onClick=\{onReplay\}[^>]*>再来一次？/)
  assert.match(source, /onClick=\{onExit\}[^>]*>我不玩了！/)
})
