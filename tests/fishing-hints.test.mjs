import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { IDOLS } from '../src/games/fishing/content.ts'
import {
  advanceSpeech, canAdvanceSpeech, castLine, createFishingGame, getShiroPose,
  restartFishingGame, tickFishingGame,
} from '../src/games/fishing/game.ts'
import { FISH_HITBOX, HOOK_ORIGIN, firstCollision, hookPoint } from '../src/games/fishing/model.ts'
import { shouldHighlightIdol } from '../src/games/fishing/presentation.ts'

const allIds = IDOLS.map(idol => idol.id)
const highlighted = (game, enabled = true) => allIds.filter(id => shouldHighlightIdol(id, game.metIds, enabled))

function until(game, condition, { confirm = true, maxFrames = 4000 } = {}) {
  for (let frame = 0; frame < maxFrames; frame++) {
    if (condition()) return
    tickFishingGame(game, 0.05)
    if (!condition() && confirm && canAdvanceSpeech(game)) advanceSpeech(game, true)
    if (!condition() && confirm && game.endingFishing === 'aiming' && game.time >= game.inputLockedUntil) {
      const target = getShiroPose(game)
      game.angle = Math.atan2(target.x - HOOK_ORIGIN.x, target.y - HOOK_ORIGIN.y)
      game.hook = hookPoint(game.angle, game.length)
      castLine(game)
    }
  }
  assert.fail(`condition not reached: phase ${game.phase}, text ${JSON.stringify(game.speech?.text)}`)
}

function reelToShore(game, id) {
  assert.equal(castLine(game), true)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = id
}

test('a fresh roster highlights all sixteen names only while hints are enabled', () => {
  for (const showIntro of [false, true]) {
    const game = createFishingGame(showIntro)
    assert.deepEqual(highlighted(game), allIds)
    assert.deepEqual(highlighted(game, false), [])
    assert.deepEqual(highlighted(game, true), allIds)
    assert.deepEqual(game.metIds, [])
  }
})

test('hint membership is exact, tolerates duplicate records, and never mutates a readonly roster', () => {
  const metIds = Object.freeze(['riku', 'riku', 'momo', 'not-an-idol'])
  const original = [...metIds]
  for (const enabled of [true, false, true]) {
    assert.equal(shouldHighlightIdol('riku', metIds, enabled), false)
    assert.equal(shouldHighlightIdol('momo', metIds, enabled), false)
    assert.equal(shouldHighlightIdol('iori', metIds, enabled), enabled)
    assert.equal(shouldHighlightIdol('rik', metIds, enabled), enabled, 'partial id matches do not count as encounters')
  }
  assert.deepEqual(metIds, original)
  const restored = createFishingGame(false, [...metIds])
  assert.deepEqual(restored.metIds, ['riku', 'momo'])
  assert.deepEqual(highlighted(restored), allIds.filter(id => id !== 'riku' && id !== 'momo'))
})

test('a hooked name remains highlighted until its normal shore encounter records it, and repeat catches stay unlit', () => {
  const game = createFishingGame(false)
  reelToShore(game, 'iori')
  assert.equal(shouldHighlightIdol('iori', game.metIds, true), true)
  tickFishingGame(game, 0.05)
  assert.equal(game.phase, 'landing')
  assert.deepEqual(game.metIds, [], 'reeling and waiting for the fixed cast lines do not record an encounter')
  assert.equal(shouldHighlightIdol('iori', game.metIds, true), true)
  until(game, () => game.phase === 'encounter', { confirm: false })
  assert.deepEqual(game.metIds, ['iori'])
  assert.equal(shouldHighlightIdol('iori', game.metIds, true), false)
  assert.equal(highlighted(game).length, 15)
  until(game, () => game.phase === 'aiming' && game.time >= game.inputLockedUntil)
  assert.equal(shouldHighlightIdol('iori', game.metIds, true), false, 'returning underwater does not restore the bubble')

  reelToShore(game, 'iori')
  until(game, () => game.phase === 'encounter', { confirm: false })
  assert.deepEqual(game.metIds, ['iori'])
  assert.equal(shouldHighlightIdol('iori', game.metIds, true), false)
  assert.deepEqual(highlighted(game, false), [])
  assert.deepEqual(highlighted(game, true), allIds.filter(id => id !== 'iori'))
})

test('the final normal encounter removes the last bubble before the ending, and complete restored games have none', () => {
  const game = createFishingGame(false, allIds.filter(id => id !== 'iori'))
  assert.deepEqual(highlighted(game), ['iori'])
  reelToShore(game, 'iori')
  until(game, () => game.phase === 'encounter', { confirm: false })
  assert.equal(game.metIds.length, 16)
  assert.deepEqual(highlighted(game), [])
  until(game, () => game.phase === 'ending')
  assert.deepEqual(highlighted(game), [])
  until(game, () => game.phase === 'ended')
  assert.deepEqual(highlighted(game), [])

  for (const completed of [false, true]) {
    const restored = createFishingGame(false, [...allIds, 'iori'], completed)
    assert.equal(restored.phase, completed ? 'ended' : 'ending')
    assert.deepEqual(highlighted(restored), [])
    assert.deepEqual(highlighted(restored, false), [])
  }
})

test('restart clears encounter progress and recalculates hints using the existing external preference', () => {
  for (const enabled of [true, false]) {
    const game = createFishingGame(false, allIds, true)
    assert.deepEqual(highlighted(game, enabled), [])
    assert.equal(restartFishingGame(game), true)
    assert.equal(game.phase, 'aiming')
    assert.deepEqual(game.metIds, [])
    assert.deepEqual(highlighted(game, enabled), enabled ? allIds : [])
    assert.equal(Object.hasOwn(game, 'hintsEnabled'), false, 'the display preference is not part of resettable game progress')
  }
})

test('querying or switching hints leaves game state, swimming, and the shared collision box unchanged', () => {
  const game = createFishingGame(false, ['iori'])
  const control = structuredClone(game)
  const fish = game.fishes.find(candidate => candidate.id === 'iori')
  const from = { x: fish.x - FISH_HITBOX.halfWidth - 5, y: fish.y }
  const to = { x: fish.x + FISH_HITBOX.halfWidth + 5, y: fish.y }
  const hit = firstCollision(from, to, [fish])
  assert.equal(hit?.id, 'iori', 'an already met idol is still catchable')
  assert.deepEqual(hit.point, { x: fish.x - FISH_HITBOX.halfWidth, y: fish.y })
  for (const enabled of [true, false, true, false]) {
    highlighted(game, enabled)
    assert.deepEqual(game, control)
    assert.deepEqual(firstCollision(from, to, [fish]), hit)
  }
  for (let frame = 0; frame < 120; frame++) {
    highlighted(game, frame % 2 === 0)
    tickFishingGame(game, 0.05)
    tickFishingGame(control, 0.05)
  }
  assert.deepEqual(game, control, 'presentation-only hint queries do not change movement, timing, progress, or dialogue')
})

test('the SVG hint is a small extra wake, never a floating bubble, text glow or recoloring', () => {
  const source = readFileSync(new URL('../src/games/fishing/index.tsx', import.meta.url), 'utf8')
  assert.match(source, /shouldHighlightIdol\(idol\.id,\s*game\.metIds,\s*hintsEnabled\)/)
  assert.match(source, /style=\{\{\s*color:\s*idol\.color\s*\}\}/)
  const nameText = [...source.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)]
    .map(match => match[0]).find(text => text.includes('Array.from(idol.name)'))
  assert.ok(nameText, 'the names remain text, not replacement images')
  assert.match(nameText, /fill="currentColor"/)
  assert.doesNotMatch(nameText, /\bfilter\s*=/)
  assert.doesNotMatch(nameText, /\bstroke(?:Width|-width)?\s*=/)
  assert.doesNotMatch(source, /fishing-unmet-glow|feGaussianBlur/)
  assert.doesNotMatch(source, /fishing-unmet-bubble/)
  assert.match(source, /hinted\s*\?\s*<path className="fishing-unmet-wake"/)
  const wake = source.match(/<path className="fishing-unmet-wake"[\s\S]*?\/>/)?.[0]
  assert.match(wake, /fill="none"/)
})
