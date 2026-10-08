import assert from 'node:assert/strict'
import test from 'node:test'
import { IDOLS } from '../src/games/fishing/content.ts'
import { angleToward, createFish, FISH_BOUNDS, HOOK_ORIGIN, hookPoint, maxHookLength, REST_ANGLE, TURNOVER_SECONDS } from '../src/games/fishing/model.ts'
import { advanceSpeech, canAdvanceSpeech, canTurnWater, castLine, createFishingGame, restartFishingGame, tickFishingGame, turnWater } from '../src/games/fishing/game.ts'

function wait(game, seconds, reduced = false) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) tickFishingGame(game, 1 / 60, reduced)
}
const coords = game => game.fishes.map(({ id, x, y }) => ({ id, x, y }))

test('idle sway never chooses the casting ray: sky, shore and water taps aim exactly', () => {
  for (const target of [{ x: 50, y: 270 }, { x: 330, y: 270 }, { x: 236, y: 540 }, { x: 85, y: 535 }, { x: 236, y: 0 }, { x: 0, y: 147 }, { x: 390, y: 147 }, { x: 389, y: 185 }, { x: 100, y: 99 }, { x: 380, y: 25 }]) {
    const game = createFishingGame(false)
    wait(game, 9)
    assert.equal(game.angle, REST_ANGLE)
    assert.equal(castLine(game, target), true)
    const expected = Math.atan2(target.x - HOOK_ORIGIN.x, target.y - HOOK_ORIGIN.y)
    assert.equal(game.angle, expected)
    assert.deepEqual(game.hook, hookPoint(expected, 26))
    tickFishingGame(game, .05)
    assert.equal(game.angle, expected)
    assert.ok(game.length > 26)
    assert.deepEqual(game.hook, hookPoint(expected, game.length))
    assert.equal(game.speech.text, '加油，了くん！')
    assert.equal(castLine(game, { x: 100, y: 500 }), false)
    assert.equal(game.angle, expected, 'a second tap cannot bend a cast already in flight')
  }
})

test('invalid directions and an introduction never consume a cast or change the aim', () => {
  for (const target of [{ x: NaN, y: 300 }, { x: 50, y: Infinity }, { x: -1, y: 300 }, { x: 400, y: 300 }, { x: 100, y: -1 }, { x: 100, y: 601 }, { ...HOOK_ORIGIN }]) {
    const game = createFishingGame(false)
    assert.equal(angleToward(target), null)
    assert.equal(castLine(game, target), false)
    assert.equal(game.casts, 0)
    assert.equal(game.phase, 'aiming')
    assert.equal(game.angle, REST_ANGLE)
  }
  const intro = createFishingGame(true)
  assert.equal(castLine(intro, { x: 320, y: 280 }), false)
  assert.equal(intro.angle, REST_ANGLE)
})

test('idle hook hangs at constant length with gentle sway, and reduced motion is vertical', () => {
  for (const showIntro of [true, false]) {
    const game = createFishingGame(showIntro)
    const positions = []
    for (let frame = 0; frame < 240; frame++) {
      tickFishingGame(game, 1 / 60)
      positions.push(game.hook.x)
      assert.ok(Math.abs(game.hook.x - HOOK_ORIGIN.x) < 1.8)
      assert.ok(game.hook.y > HOOK_ORIGIN.y + 25.9)
      assert.ok(Math.abs(Math.hypot(game.hook.x - HOOK_ORIGIN.x, game.hook.y - HOOK_ORIGIN.y) - 26) < 1e-8)
      assert.equal(game.angle, REST_ANGLE)
    }
    assert.ok(Math.max(...positions) - Math.min(...positions) > 2)
    tickFishingGame(game, .05, true)
    assert.deepEqual(game.hook, hookPoint(REST_ANGLE, 26))
  }
})

test('empty casts hit every scene edge and return without changing progress', () => {
  for (const ending of [false, true]) {
    for (const target of [{x:0,y:0},{x:390,y:0},{x:0,y:600},{x:390,y:600},{x:236,y:0},{x:390,y:147},{x:236,y:600},{x:0,y:147}]) {
      const game = createFishingGame(false)
      game.fishes = []
      if (ending) { game.phase = 'ending'; game.endingFishing = 'aiming' }
      assert.equal(castLine(game, target), true)
      const limit = maxHookLength(game.angle)
      let reachedEdge = false
      for (let frame = 0; frame < 600; frame++) {
        tickFishingGame(game, 1 / 60)
        if (Math.abs(game.length - limit) < 1e-8) reachedEdge = true
        assert.ok(game.hook.x >= -1e-8 && game.hook.x <= 390 + 1e-8)
        assert.ok(game.hook.y >= -1e-8 && game.hook.y <= 600 + 1e-8)
      }
      assert.equal(reachedEdge, true)
      assert.equal(ending ? game.endingFishing : game.phase, 'aiming')
      assert.equal(game.casts, 1)
      assert.equal(game.caughtId, null)
      assert.equal(game.shiroHooked, false)
      assert.deepEqual(game.metIds, [])
      assert.ok(Math.abs(game.hook.x - HOOK_ORIGIN.x) < 1.8)
    }
  }
})

test('one turnover brings every deep-half name into upper water in under two seconds without changing progress', () => {
  for (const seed of [1, 42, 1847, 20260929]) {
    for (const reduced of [false, true]) {
      const game = createFishingGame(false, ['riku'])
      game.fishes = createFish(IDOLS, seed)
      wait(game, 7, reduced)
      const deepest = [...game.fishes].sort((a, b) => b.y - a.y).slice(0, 8).map(fish => fish.id)
      const original = coords(game)
      assert.equal(canTurnWater(game), true)
      assert.equal(turnWater(game), true)
      assert.equal(turnWater(game), false, 'cannot stack currents')
      assert.equal(castLine(game, { x: 80, y: 400 }), false, 'do not move a target under an active hook')
      wait(game, .9, reduced)
      assert.notDeepEqual(coords(game), original, 'continuous travel instead of instant teleportation')
      assert.ok(game.waterTurnover)
      wait(game, TURNOVER_SECONDS - .9 + .02, reduced)
      assert.equal(game.waterTurnover, null)
      for (const fish of game.fishes) {
        if (deepest.includes(fish.id)) assert.ok(fish.y <= 330, `${fish.id} is still deep: ${fish.y}`)
        else assert.ok(fish.y >= 460)
        assert.ok(fish.x >= FISH_BOUNDS.left && fish.x <= FISH_BOUNDS.right)
        assert.ok(fish.y >= FISH_BOUNDS.top && fish.y <= FISH_BOUNDS.bottom)
      }
      assert.equal(game.casts, 0)
      assert.equal(game.speech, null)
      assert.deepEqual(game.metIds, ['riku'])
      assert.equal(game.phase, 'aiming')
      assert.equal(canTurnWater(game), true)
      const settled = coords(game)
      wait(game, 2, reduced)
      assert.notDeepEqual(coords(game), settled, 'normal free swimming resumes')
      assert.ok(game.fishes.filter(f => deepest.includes(f.id)).every(f => f.y < 365), 'give the player time to aim')
    }
  }
})

test('turning twice swaps both halves, without using affinity or encounter history to pick targets', () => {
  const a = createFishingGame(false)
  const b = createFishingGame(false, ['riku','momo'])
  a.fishes = createFish(IDOLS, 99)
  b.fishes = createFish(IDOLS.map(idol => ({ ...idol, swimStyle: 'hostile' })), 99)
  const reached = new Set()
  for (let round = 0; round < 2; round++) {
    assert.equal(turnWater(a), true)
    assert.equal(turnWater(b), true)
    wait(a, 1.85)
    wait(b, 1.85)
    assert.deepEqual(coords(a), coords(b))
    a.fishes.filter(f => f.y < 330).forEach(f => reached.add(f.id))
  }
  assert.equal(reached.size, 16)
})

test('turnover is inert during all scripts, hooked states and the ending; restart clears it', () => {
  for (const phase of ['intro','casting','reeling','landing','encounter','releasing','ending','ended']) {
    const game = createFishingGame(false)
    game.phase = phase
    const before = structuredClone(game)
    assert.equal(turnWater(game), false)
    assert.deepEqual(game, before)
  }
  const game = createFishingGame(true)
  while (game.phase === 'intro') {
    wait(game, .4)
    if (canAdvanceSpeech(game)) advanceSpeech(game)
  }
  assert.equal(turnWater(game), false, 'last introduction tap cannot immediately stir water')
  wait(game, .4)
  assert.equal(turnWater(game), true)
  game.phase = 'ended'
  assert.equal(restartFishingGame(game), true)
  assert.equal(game.waterTurnover, null)
})

test('invalid/large ticks cannot teleport the current, and normal/reduced motion have identical destinations', () => {
  const game = createFishingGame(false)
  turnWater(game)
  const before = structuredClone(game)
  for (const dt of [0, -1, Infinity, NaN]) tickFishingGame(game, dt)
  assert.deepEqual(game, before)
  tickFishingGame(game, 999)
  assert.equal(game.waterTurnover.elapsed, .05)
})
