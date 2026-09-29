import assert from 'node:assert/strict'
import test from 'node:test'
import { needsConfirmation } from '../src/games/fishing/content.ts'
import { canGreetShiro, castLine, createFishingGame, speechDuration, tickFishingGame } from '../src/games/fishing/game.ts'
import { SHIRO_GREETING } from '../src/games/fishing/presentation.ts'

test('Shiro only greets on shore when no other dialogue or sky response is present', () => {
  const game = createFishingGame(false)
  assert.equal(canGreetShiro(game), true)
  assert.equal(canGreetShiro(game, true), false)
  game.shiroAway = true
  assert.equal(canGreetShiro(game), false)
  assert.equal(canGreetShiro(createFishingGame(true)), false)
  game.shiroAway = false
  castLine(game)
  assert.equal(canGreetShiro(game), false)
  game.script = { kind: 'encounter', beats: [{ text: '', waitForTap: true }], index: 0, elapsed: 0 }
  assert.equal(canGreetShiro(game), false)
})

test('the greeting is an automatic line and does not enter or advance a game script', () => {
  const game = createFishingGame(false)
  assert.equal(SHIRO_GREETING.text, 'hi😊')
  assert.equal(SHIRO_GREETING.speaker, 'shiro')
  assert.equal(needsConfirmation(SHIRO_GREETING), false)
  assert.equal(speechDuration(SHIRO_GREETING), 1800)
  const start = { x: game.fishes[0].x, y: game.fishes[0].y }
  for (let frame = 0; frame < 36; frame++) tickFishingGame(game, 0.05)
  assert.equal(game.script, null)
  assert.equal(game.phase, 'aiming')
  assert.ok(game.time >= 1.79)
  assert.notDeepEqual({ x: game.fishes[0].x, y: game.fishes[0].y }, start)
  assert.equal(castLine(game), true)
})
