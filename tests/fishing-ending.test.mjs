import assert from 'node:assert/strict'
import test from 'node:test'
import { ENDING_LINES, IDOLS, needsConfirmation } from '../src/games/fishing/content.ts'
import {
  advanceSpeech, basketCount, canAdvanceSpeech, canGreetShiro, castLine,
  createFishingGame, isWaitingForTap, restartFishingGame, startIntroduction, tickFishingGame,
} from '../src/games/fishing/game.ts'
import { FISH_BOUNDS, hookPoint, idleAngle } from '../src/games/fishing/model.ts'

const allIds = IDOLS.map(idol => idol.id)
const without = id => allIds.filter(candidate => candidate !== id)

function wait(game, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds / 0.05); frame++) {
    tickFishingGame(game, 0.05)
    assert.equal(basketCount(), 0)
  }
}

function until(game, condition, { confirm = true, maxFrames = 4000 } = {}) {
  for (let frame = 0; frame < maxFrames; frame++) {
    if (condition()) return
    tickFishingGame(game, 0.05)
    if (!condition() && confirm && canAdvanceSpeech(game)) advanceSpeech(game, true)
  }
  assert.fail(`condition not reached: phase ${game.phase}, text ${JSON.stringify(game.speech?.text)}`)
}

function land(game, id) {
  assert.equal(castLine(game), true)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = id
  until(game, () => game.phase === 'encounter', { confirm: false })
}

test('the ending contains exactly the requested seventeen manual lines and three wordless actions', () => {
  const visible = ENDING_LINES.filter(beat => beat.text)
  assert.deepEqual(visible.map(beat => beat.text), [
    '一天过去了', '月云了什么也没钓起来', '……',
    '到底什么意思？？！？', '这个游戏是在耍我吗？？！', '无聊！神经！好烦啊！！！',
    '游戏作者简直就是丧心病狂没有公德心。', '啊！！！！？！你说句话啊？？',
    '啊……？哦！结束了啊。', '果然是这样呢。', '？', '回去了吗？', '……😡', '好吧。',
    '竟敢耍我，我会让你付出代价！！！', '了くん？你好慢啊- -', '你烦不烦？！',
  ])
  assert.deepEqual(visible.slice(0, 3).map(beat => [beat.speaker, beat.location]), [
    [undefined, 'narration'], [undefined, 'narration'], [undefined, 'narration'],
  ])
  assert.ok(visible.every(beat => beat.mode === 'dialogue' && needsConfirmation(beat)))
  assert.deepEqual(ENDING_LINES.filter(beat => beat.event).map(beat => [beat.text, beat.event, beat.durationMs]), [
    ['', 'wake-shiro', 700], ['', 'shiro-exits', 1100], ['', 'ryo-exits', 1100],
  ])
  const offscreen = visible.filter(beat => beat.location === 'offscreen')
  assert.equal(offscreen.length, 1)
  assert.equal(offscreen[0].speaker, 'shiro')
  assert.equal(offscreen[0].text, '了くん？你好慢啊- -')
})

test('restoring a complete unique roster resumes the ending or its completed state, without replaying the intro', () => {
  for (const showIntro of [false, true]) {
    const pending = createFishingGame(showIntro, [...allIds, 'riku', 'not-an-idol'])
    assert.equal(pending.phase, 'ending')
    assert.deepEqual(pending.metIds, allIds)
    assert.equal(pending.script?.kind, 'ending')
    assert.equal(pending.speech?.text, '一天过去了')
    assert.equal(pending.shiroSleeping, true)
    assert.equal(pending.introCompleted, true)

    const complete = createFishingGame(showIntro, [...allIds, 'riku'], true)
    assert.equal(complete.phase, 'ended')
    assert.equal(complete.script, null)
    assert.equal(complete.speech, null)
    assert.equal(complete.shiroExiting, true)
    assert.equal(complete.ryoExiting, true)
    assert.equal(complete.shiroSleeping, false)
    assert.equal(complete.introCompleted, true)
  }
  const missing = createFishingGame(false, [...without('tora'), 'riku', 'riku', 'not-an-idol'], true)
  assert.equal(missing.metIds.length, 15)
  assert.equal(missing.phase, 'aiming', 'duplicates, unknown ids and a stale completion flag cannot fake 16/16')
  assert.equal(createFishingGame(true, [], true).phase, 'intro')
})

test('the sixteenth encounter and its full return animation finish before the ending starts', () => {
  const game = createFishingGame(false, without('iori'))
  land(game, 'iori')
  assert.equal(game.metIds.length, 16)
  assert.equal(game.phase, 'encounter')
  assert.equal(game.script?.kind, 'encounter')
  wait(game, 20)
  assert.equal(game.phase, 'encounter', '16/16 does not skip the silent encounter acknowledgement')
  assert.equal(game.hasLeft, false)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.speech?.event, 'idol-leaves')
  wait(game, 0.95)
  assert.equal(game.phase, 'releasing')
  assert.notEqual(game.release, null)
  until(game, () => game.phase === 'ending', { confirm: false })
  assert.equal(game.release, null)
  assert.equal(game.caughtId, null)
  assert.equal(game.speech?.text, '一天过去了')
  assert.equal(game.shiroSleeping, true)
  assert.equal(castLine(game), false)
  const script = game.script
  startIntroduction(game)
  assert.equal(game.script, script)
})

test('Riku as the sixteenth idol still waits for Ryo final humming confirmation after returning underwater', () => {
  const game = createFishingGame(false, without('riku'))
  land(game, 'riku')
  until(game, () => game.speech?.text === '🎵')
  wait(game, 20)
  assert.equal(game.phase, 'encounter')
  assert.equal(game.script?.kind, 'encounter')
  assert.equal(game.hasLeft, true)
  assert.equal(game.release, null)
  assert.equal(game.speech?.text, '🎵')
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.phase, 'ending')
  assert.equal(game.speech?.text, '一天过去了')
})

test('Momo as the sixteenth idol finishes Shiro return instead of truncating the punch scene', () => {
  const game = createFishingGame(false, without('momo'))
  land(game, 'momo')
  until(game, () => game.speech?.event === 'punch-shiro')
  assert.equal(game.shiroAway, true)
  until(game, () => game.speech?.event === 'shiro-returns')
  assert.equal(game.phase, 'encounter')
  assert.equal(game.shiroAway, false)
  wait(game, 0.5)
  assert.equal(game.phase, 'encounter', 'the existing return animation gets its full duration')
  until(game, () => game.phase === 'ending', { confirm: false })
  assert.equal(game.release, null)
  assert.equal(game.shiroAway, false)
  assert.equal(game.shiroSleeping, true)
})

test('the ending waits on every visible line, wakes Shiro without punching, and exits each character in order', () => {
  const game = createFishingGame(false, allIds)
  let woken = false
  let shiroExited = false
  let ryoExited = false
  for (const expected of ENDING_LINES) {
    assert.equal(game.phase, 'ending')
    assert.equal(game.speech, expected)
    assert.equal(canGreetShiro(game), false)
    assert.equal(castLine(game), false)
    assert.equal(restartFishingGame(game), false)
    assert.equal(game.shiroAway, false, 'wake-shiro never reuses the punch animation flag')
    if (expected.event === 'wake-shiro') woken = true
    if (expected.event === 'shiro-exits') shiroExited = true
    if (expected.event === 'ryo-exits') ryoExited = true
    assert.equal(game.shiroSleeping, !woken)
    assert.equal(game.shiroExiting, shiroExited)
    assert.equal(game.ryoExiting, ryoExited)
    if (expected.text) {
      wait(game, 4)
      assert.equal(game.speech, expected)
      assert.equal(isWaitingForTap(game), true)
      assert.equal(advanceSpeech(game, false), false)
      assert.equal(advanceSpeech(game, true), true)
      assert.equal(advanceSpeech(game, true), false, 'the next beat cannot disappear in the same tap')
    } else {
      assert.equal(isWaitingForTap(game), false)
      assert.equal(advanceSpeech(game, true), false)
      until(game, () => game.speech !== expected, { confirm: false, maxFrames: 30 })
    }
  }
  assert.equal(game.phase, 'ended')
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
  assert.equal(game.shiroSleeping, false)
  assert.equal(game.shiroExiting, true)
  assert.equal(game.ryoExiting, true)
  assert.equal(basketCount(), 0)
})

test('completed games freeze all state and cannot cast, greet, replay the intro or restart the ending by ticking', () => {
  const game = createFishingGame(false, allIds)
  until(game, () => game.phase === 'ended')
  const frozen = structuredClone(game)
  for (const dt of [0.05, 0.05, 1, 60, NaN, -1]) tickFishingGame(game, dt)
  assert.equal(castLine(game), false)
  assert.equal(canGreetShiro(game), false)
  assert.equal(isWaitingForTap(game), false)
  assert.equal(canAdvanceSpeech(game), false)
  assert.equal(advanceSpeech(game, true), false)
  assert.equal(advanceSpeech(game, false), false)
  startIntroduction(game)
  assert.deepEqual(game, frozen)
})

test('restart only works after completion and resets the same game object with a new revision and no intro', () => {
  const playing = createFishingGame(false)
  const untouched = structuredClone(playing)
  assert.equal(restartFishingGame(playing), false)
  assert.deepEqual(playing, untouched)
  const game = createFishingGame(false, allIds)
  assert.equal(restartFishingGame(game), false)
  until(game, () => game.phase === 'ended')
  const identity = game
  const revision = game.revision
  const oldFishes = game.fishes
  assert.equal(restartFishingGame(game), true)
  assert.equal(game, identity)
  assert.equal(game.revision, revision + 1)
  assert.equal(game.phase, 'aiming')
  assert.equal(game.introCompleted, true)
  assert.deepEqual(game.metIds, [])
  assert.equal(game.casts, 0)
  assert.equal(game.time, 0)
  assert.equal(game.inputLockedUntil, 0)
  assert.equal(game.castSpeechDone, true)
  assert.equal(game.caughtId, null)
  assert.equal(game.release, null)
  assert.equal(game.hasLeft, false)
  assert.equal(game.mood, null)
  assert.equal(game.speech, null)
  assert.equal(game.script, null)
  assert.equal(game.shiroAway, false)
  assert.equal(game.shiroSleeping, false)
  assert.equal(game.shiroExiting, false)
  assert.equal(game.ryoExiting, false)
  assert.equal(game.angle, idleAngle(0))
  assert.equal(game.length, 26)
  assert.deepEqual(game.hook, hookPoint(idleAngle(0), 26))
  assert.notEqual(game.fishes, oldFishes)
  assert.equal(game.fishes.length, 16)
  assert.ok(game.fishes.every(fish => fish.x >= FISH_BOUNDS.left && fish.x <= FISH_BOUNDS.right && fish.y >= FISH_BOUNDS.top && fish.y <= FISH_BOUNDS.bottom))
  assert.equal(canGreetShiro(game), true)

  // A new run can reach its own ending after collecting its own final missing name.
  game.metIds = without('iori')
  land(game, 'iori')
  until(game, () => game.phase === 'ending')
  assert.equal(game.speech?.text, '一天过去了')
})
