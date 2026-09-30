import assert from 'node:assert/strict'
import test from 'node:test'
import { IDOLS, needsConfirmation } from '../src/games/fishing/content.ts'
import {
  advanceSpeech, canAdvanceSpeech, canGreetRyo, castLine, createFishingGame,
  getShiroPose, isWaitingForTap, speechDuration, tickFishingGame,
} from '../src/games/fishing/game.ts'
import { HOOK_ORIGIN, hookPoint } from '../src/games/fishing/model.ts'
import { RYO_ENDING_REPLY, RYO_GREETING } from '../src/games/fishing/presentation.ts'

const allIds = IDOLS.map(idol => idol.id)

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
  until(game, () => game.phase === 'encounter', { confirm: false })
}

test('Ryo can hum during ordinary play only when no other ambient bubble is present', () => {
  const game = createFishingGame(false)
  assert.equal(canGreetRyo(game), true)
  assert.equal(canGreetRyo(game, false), true)
  assert.equal(canGreetRyo(game, true), false)
  assert.equal(canGreetRyo(game), true)
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
  assert.equal(castLine(game), true, 'checking the greeting never consumes the cast action')
})

test('Ryo does not interrupt the introduction, either fixed casting line, or an idol encounter', () => {
  const intro = createFishingGame(true)
  assert.equal(intro.phase, 'intro')
  assert.equal(canGreetRyo(intro), false)

  const game = createFishingGame(false)
  assert.equal(castLine(game), true)
  assert.equal(game.speech?.text, '加油，了くん！')
  assert.equal(canGreetRyo(game), false)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = 'minami'
  until(game, () => game.speech?.text === '闭嘴！', { confirm: false })
  assert.equal(canGreetRyo(game), false)
  until(game, () => game.phase === 'encounter', { confirm: false })
  assert.equal(canGreetRyo(game), false, 'the wordless opening beat is also part of the protected encounter')
  until(game, () => game.speech?.speaker === 'idol', { confirm: false })
  assert.equal(isWaitingForTap(game), true)
  assert.equal(canGreetRyo(game), false)
  until(game, () => game.speech?.text === '？')
  assert.equal(canGreetRyo(game), false, 'Ryo own encounter reply is still a protected manual dialogue')
})

test('16/16 alone does not enable Ryo ending reply before the final encounter has been fully acknowledged', () => {
  const game = createFishingGame(false, allIds.filter(id => id !== 'riku'))
  reelToShore(game, 'riku')
  assert.equal(game.metIds.length, 16)
  assert.equal(game.phase, 'encounter')
  assert.equal(canGreetRyo(game), false)
  until(game, () => game.speech?.text === '🎵' && game.release === null)
  assert.equal(game.hasLeft, true)
  assert.equal(game.phase, 'encounter')
  assert.equal(canGreetRyo(game), false, 'Riku already returning underwater does not skip Ryo final manual reply')
  until(game, () => canAdvanceSpeech(game), { confirm: false })
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.phase, 'ending')
  assert.equal(game.speech?.text, '一天过去了')
  assert.equal(canGreetRyo(game), true)
})

test('the ending permits an independent Ryo reply beside manual narration and dialogue, but not another ambient bubble', () => {
  const game = createFishingGame(false, allIds)
  for (const text of ['一天过去了', '到底什么意思？？！？', '游戏作者简直就是丧心病狂没有公德心。']) {
    until(game, () => game.speech?.text === text)
    assert.equal(game.phase, 'ending')
    assert.equal(game.script?.kind, 'ending')
    assert.equal(isWaitingForTap(game), true)
    assert.equal(canGreetRyo(game), true)
    assert.equal(canGreetRyo(game, true), false)
    assert.equal(canGreetRyo(game, false), true)
  }
})

test('Ryo replies remain available after Shiro leaves, then stop as soon as Ryo exits and remain disabled after completion', () => {
  const game = createFishingGame(false, allIds)
  until(game, () => game.speech?.event === 'shiro-exits')
  assert.equal(game.shiroExiting, true)
  assert.equal(game.ryoExiting, false)
  assert.equal(canGreetRyo(game), true)
  until(game, () => game.speech?.event === 'leave-together')
  assert.equal(game.phase, 'ending')
  assert.equal(game.ryoExiting, true)
  assert.equal(canGreetRyo(game), false)
  until(game, () => game.phase === 'ended')
  assert.equal(canGreetRyo(game), false)
  assert.equal(canGreetRyo(createFishingGame(false, allIds, true)), false)

  const leaving = createFishingGame(false)
  leaving.ryoExiting = true
  assert.equal(canGreetRyo(leaving), false, 'the exit flag itself prevents a response in any phase')
})

test('both Ryo responses use the exact requested text as automatic 1.8-second shore lines', () => {
  for (const [beat, text] of [[RYO_GREETING, '啦啦啦~'], [RYO_ENDING_REPLY, '看什么看！']]) {
    assert.equal(beat.text, text)
    assert.equal(beat.speaker, 'ryo')
    assert.equal(beat.location, 'shore')
    assert.equal(beat.mode, 'line')
    assert.equal(beat.durationMs, 1800)
    assert.equal(speechDuration(beat), 1800)
    assert.equal(needsConfirmation(beat), false)
    assert.equal(beat.waitForTap, undefined)
    assert.equal(beat.event, undefined)
  }
})

test('greeting checks do not mutate any game state or advance a manual ending line while ordinary time continues', () => {
  const states = [createFishingGame(false), createFishingGame(true), createFishingGame(false, allIds), createFishingGame(false, allIds, true)]
  const encounter = createFishingGame(false)
  reelToShore(encounter, 'iori')
  states.push(encounter)
  for (const game of states) {
    const original = structuredClone(game)
    for (const otherBubble of [false, true, false]) canGreetRyo(game, otherBubble)
    assert.deepEqual(game, original)
  }

  for (const game of [createFishingGame(false), createFishingGame(false, allIds)]) {
    const control = structuredClone(game)
    const speech = game.speech
    const scriptIndex = game.script?.index
    for (let frame = 0; frame < 36; frame++) {
      assert.equal(canGreetRyo(game), true)
      tickFishingGame(game, 0.05)
      tickFishingGame(control, 0.05)
    }
    assert.deepEqual(game, control, 'reply eligibility has no effect on time, movement, hook, or dialogue state')
    assert.ok(game.time >= 1.79)
    assert.equal(game.speech, speech)
    assert.equal(game.script?.index, scriptIndex)
  }
})
