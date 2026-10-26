import test from 'node:test'
import assert from 'node:assert/strict'
import { createRowing, row, tickRowing } from '../src/games/rowing/model.ts'
import { createRyoMood, openingRyoAction, tickRyoMood, RYO_MOOD_LINES } from '../src/games/rowing/ryo-mood.ts'

function scene() { const s = createRowing(); s.couples = []; s.trafficNextAt = Infinity; s.coupleChatNextAt = Infinity; return s }
function wait(s, seconds) { for (let i = 0; i < Math.ceil(seconds * 100); i++) tickRowing(s, .01, () => .99) }
function tired(s) { for (let i = 0; i < 3; i++) { assert.equal(row(s, 'ryo', () => .99), 'stroke'); wait(s, .75) } }

test('opening cooperates exactly three times, then visibly refuses without pushing or changing physics', () => {
  const s = scene(); tired(s)
  assert.equal(s.ryoMood.speech, 'tired'); assert.equal(RYO_MOOD_LINES[s.ryoMood.speech], '我累了')
  const spin = s.spin, speed = s.speed, shiro = s.shiroStrokes, strokes = s.ryoStrokes
  assert.equal(row(s, 'ryo', () => 0), 'refuse')
  assert.equal(s.spin, spin); assert.equal(s.speed, speed)
  assert.equal(s.shiroStrokes, shiro); assert.equal(s.ryoStrokes, strokes)
  assert.equal(s.ryoMood.nagCount, 0, 'Tapping during the tired line cannot skip ahead')
  assert.equal(row(s, 'shiro'), 'stroke', 'Shiro still responds independently')
})

test('sparse clicks leave the strike intact, four close requests provoke one line then one reverse', () => {
  const s = scene(); tired(s); wait(s, 3)
  for (let i = 0; i < 5; i++) { assert.equal(row(s, 'ryo'), 'refuse'); wait(s, 2.1) }
  assert.equal(s.ryoMood.phase, 'strike')
  for (let i = 0; i < 4; i++) { assert.equal(row(s, 'ryo'), 'refuse'); wait(s, .6) }
  assert.equal(s.ryoMood.speech, 'protest')
  assert.equal(RYO_MOOD_LINES.protest, '你让我划我就划吗？？')
  for (let i = 0; i < 3; i++) { assert.equal(row(s, 'ryo'), 'refuse'); wait(s, .6) }
  wait(s, 3)
  assert.equal(row(s, 'ryo', () => .99), 'reverse')
  for (let i = 0; i < 10; i++) { wait(s, .6); assert.equal(row(s, 'ryo', () => 0), 'refuse') }
  wait(s, 3); assert.equal(row(s, 'ryo', () => 0), 'reverse')
  assert.equal(s.ryoMood.pending.length, 0); assert.equal(s.ryoMood.speech, null)
})

test('pending mood speech waits for ongoing dialogue and pauses in background', () => {
  const mood = createRyoMood()
  for (let i = 0; i < 3; i++) openingRyoAction(mood, i, () => 0)
  tickRyoMood(mood, 1, 3, 4, false, false); assert.equal(mood.speech, null)
  tickRyoMood(mood, 1, 5, 4, true, false); assert.equal(mood.speech, null)
  tickRyoMood(mood, .1, 5, 4, false, false); assert.equal(mood.speech, 'tired')
  const s = scene(); tired(s); const previous = structuredClone(s.ryoMood)
  for (const dt of [0, NaN, Infinity, -1]) tickRowing(s, dt)
  assert.deepEqual(s.ryoMood, previous)
})

test('22:00 go-home exchange clears opening strike speech and later effort remains available', () => {
  const s = scene(); tired(s); s.minutes = 22 * 60 - .01
  tickRowing(s, .01)
  assert.equal(s.dialogue, 0); assert.equal(s.ryoMood.speech, null); assert.deepEqual(s.ryoMood.pending, [])
  wait(s, 3.3); assert.equal(s.effort, true)
  assert.equal(row(s, 'ryo', () => 0), 'stroke')
  assert.deepEqual(createRowing().ryoMood, createRyoMood())
})
