import assert from 'node:assert/strict'
import test from 'node:test'
import { ENDING_CATCH_LINES, ENDING_LINES, IDOLS, needsConfirmation } from '../src/games/fishing/content.ts'
import {
  advanceSpeech, basketCount, canAdvanceSpeech, canGreetShiro, castLine,
  createFishingGame, getDepartureOffset, getShiroPose, isWaitingForTap, restartFishingGame, startIntroduction, tickFishingGame,
} from '../src/games/fishing/game.ts'
import { FISH_BOUNDS, HOOK_ORIGIN, REST_ANGLE, hookPoint } from '../src/games/fishing/model.ts'

const allIds = IDOLS.map(idol => idol.id)
const without = id => allIds.filter(candidate => candidate !== id)

function wait(game, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds / 0.05); frame++) {
    tickFishingGame(game, 0.05)
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

function catchShiro(game) {
  if (game.endingFishing === 'inactive') until(game, () => game.endingFishing === 'aiming')
  for (let attempt = 0; attempt < 8 && game.endingFishing !== 'caught'; attempt++) {
    until(game, () => game.time >= game.inputLockedUntil, { confirm: false })
    const target = getShiroPose(game)
    assert.equal(castLine(game, target), true)
    assert.equal(game.script, null, 'the ending cast does not replay the ordinary fixed lines')
    until(game, () => game.endingFishing === 'caught' || game.endingFishing === 'aiming', { confirm: false })
  }
  assert.equal(game.endingFishing, 'caught', 'a aimed hook must actually hit and reel in Shiro')
}

function finishEnding(game) {
  catchShiro(game)
  until(game, () => game.phase === 'ended')
}

test('the ending preserves the initial dialogue and contains exactly the requested new lines and wordless actions', () => {
  const visible = ENDING_LINES.filter(beat => beat.text)
  assert.deepEqual(visible.map(beat => beat.text), [
    '一天过去了', '月云了什么也没钓起来', '……',
    '到底什么意思？？！？', '这个游戏是在耍我吗？？！', '无聊！神经！好烦啊！！！',
    '游戏作者简直就是丧心病狂没有公德心。', '啊！！！！？！你说句话啊？？',
    '啊……？哦！结束了啊。', '果然是这样呢。', '？', '回去了吗？', '……😡',
    '你给我回来？！！！', '我钓不到鱼。', '啊？对哦，哈哈。', '竟敢嘲笑我！',
    '你给我下去。', '欸，还可以这样？', '你快咬钩，不然小心我淹死你。', '我会游泳。', '现在，可以对宇都木桑下钩了~',
  ])
  assert.deepEqual(visible.slice(0, 3).map(beat => [beat.speaker, beat.location]), [
    [undefined, 'narration'], [undefined, 'narration'], [undefined, 'narration'],
  ])
  assert.ok(visible.every(beat => beat.mode === 'dialogue' && needsConfirmation(beat)))
  assert.deepEqual(ENDING_LINES.filter(beat => beat.event && !beat.text).map(beat => [beat.text, beat.event, beat.durationMs]), [
    ['', 'wake-shiro', 700], ['', 'shiro-exits', 1100], ['', 'pull-shiro', 1100], ['', 'dunk-shiro', 1000],
  ])
  assert.equal(ENDING_LINES.at(-1).event, 'fish-shiro')
  assert.equal(ENDING_LINES.at(-1).location, 'narration')
  assert.deepEqual(visible.filter(beat => beat.speaker === 'shiro' && beat.location === 'water').map(beat => beat.text), ['欸，还可以这样？', '我会游泳。'])
  assert.deepEqual(ENDING_CATCH_LINES.filter(beat => beat.text).map(beat => beat.text), ['呃', '哈哈！', '我饿了，可以回去吃饭了吗？', '好吧。', '我要吃鱼料理。', '哦'])
  assert.ok(ENDING_CATCH_LINES.filter(beat => beat.text).every(beat => beat.mode === 'dialogue' && needsConfirmation(beat)))
  assert.deepEqual(ENDING_CATCH_LINES.at(-1), { text: '', event: 'leave-together', durationMs: 1400 })
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
    assert.equal(pending.endingFishing, 'inactive')
    assert.equal(pending.shiroPosition, null)
    assert.equal(pending.shiroHooked, false)
    assert.equal(basketCount(pending), 0)

    const complete = createFishingGame(showIntro, [...allIds, 'riku'], true)
    assert.equal(complete.phase, 'ended')
    assert.equal(complete.script, null)
    assert.equal(complete.speech, null)
    assert.equal(complete.shiroExiting, true)
    assert.equal(complete.ryoExiting, true)
    assert.equal(complete.shiroSleeping, false)
    assert.equal(complete.introCompleted, true)
    assert.equal(basketCount(complete), 1, 'a restored completed ending keeps Shiro in the basket count')
  }
  const missing = createFishingGame(false, [...without('tora'), 'riku', 'riku', 'not-an-idol'], true)
  assert.equal(missing.metIds.length, 15)
  assert.equal(missing.phase, 'aiming', 'duplicates, unknown ids and a stale completion flag cannot fake 16/16')
  assert.equal(basketCount(missing), 0)
  assert.equal(basketCount(createFishingGame(true, [], true)), 0)
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

test('every visible ending line waits for confirmation, then actual fishing and the caught dialogue precede departure', () => {
  const game = createFishingGame(false, allIds)
  let woken = false
  let shiroExited = false
  for (const expected of ENDING_LINES) {
    assert.equal(game.phase, 'ending')
    assert.equal(game.speech, expected)
    assert.equal(canGreetShiro(game), false)
    assert.equal(basketCount(game), 0, 'the basket stays empty before Shiro is caught')
    assert.equal(castLine(game), false)
    assert.equal(restartFishingGame(game), false)
    assert.equal(game.shiroAway, false, 'wake-shiro never reuses the punch animation flag')
    if (expected.event === 'wake-shiro') woken = true
    if (expected.event === 'shiro-exits') shiroExited = true
    if (expected.event === 'pull-shiro') shiroExited = false
    assert.equal(game.shiroSleeping, !woken)
    assert.equal(game.shiroExiting, shiroExited)
    assert.equal(game.ryoExiting, false)
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
  assert.equal(game.phase, 'ending')
  assert.equal(game.endingFishing, 'aiming')
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
  assert.equal(castLine(game), false, 'the narration confirmation cannot accidentally cast in the same tap')
  wait(game, 20)
  assert.equal(game.phase, 'ending', 'waiting alone cannot finish the ending')
  assert.equal(game.endingFishing, 'aiming')
  assert.equal(restartFishingGame(game), false)
  catchShiro(game)
  for (const expected of ENDING_CATCH_LINES) {
    assert.equal(game.phase, 'ending')
    assert.equal(game.speech, expected)
    assert.equal(game.endingFishing, 'caught')
    assert.equal(basketCount(game), 1, 'Shiro stays counted throughout the caught dialogue and departure')
    assert.equal(castLine(game), false)
    assert.equal(restartFishingGame(game), false)
    if (expected.text) {
      wait(game, 4)
      assert.equal(game.speech, expected)
      assert.equal(advanceSpeech(game, false), false)
      assert.equal(advanceSpeech(game, true), true)
      assert.equal(advanceSpeech(game, true), false)
    } else until(game, () => game.phase === 'ended', { confirm: false })
  }
  assert.equal(game.phase, 'ended')
  assert.equal(game.shiroSleeping, false)
  assert.equal(game.shiroExiting, true)
  assert.equal(game.ryoExiting, true)
  assert.equal(basketCount(game), 1)
})

test('the final fishing instruction remains manual and a confirmed instruction opens fishing without skipping its tap guard', () => {
  const game = createFishingGame(false, allIds)
  until(game, () => game.speech?.event === 'fish-shiro')
  wait(game, 30)
  assert.equal(game.endingFishing, 'inactive')
  assert.equal(game.speech?.text, '现在，可以对宇都木桑下钩了~')
  assert.equal(castLine(game), false)
  assert.equal(advanceSpeech(game, false), false)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.phase, 'ending')
  assert.equal(game.endingFishing, 'aiming')
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
  assert.equal(advanceSpeech(game, true), false)
  assert.equal(castLine(game), false)
  wait(game, 0.4)
  assert.equal(castLine(game), true)
  assert.equal(castLine(game), false, 'a second input cannot start another hook in flight')
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
  assert.equal(game.phase, 'ending')
})

test('an empty ending cast returns to aiming, then only the moving Shiro target can be hooked despite intervening idol labels', () => {
  const game = createFishingGame(false, allIds)
  until(game, () => game.endingFishing === 'aiming')
  wait(game, 0.4)
  const originalRoster = [...game.metIds]
  game.angle = -64 * Math.PI / 180
  game.hook = hookPoint(game.angle, game.length)
  assert.equal(castLine(game), true)
  until(game, () => game.endingFishing === 'aiming', { confirm: false })
  assert.equal(game.shiroHooked, false)
  assert.equal(game.phase, 'ending')
  assert.equal(game.script, null)
  assert.equal(game.caughtId, null)
  assert.deepEqual(game.metIds, originalRoster)
  assert.equal(basketCount(game), 0, 'an empty cast does not fill the basket')

  const target = getShiroPose(game)
  game.angle = Math.atan2(target.x - HOOK_ORIGIN.x, target.y - HOOK_ORIGIN.y)
  game.hook = hookPoint(game.angle, game.length)
  for (const fish of game.fishes) {
    fish.x = HOOK_ORIGIN.x + Math.tan(game.angle) * (260 - HOOK_ORIGIN.y)
    fish.y = 260
  }
  assert.equal(castLine(game), true)
  let observedHookedReel = false
  for (let frame = 0; frame < 400 && game.endingFishing !== 'caught'; frame++) {
    tickFishingGame(game, 0.05)
    assert.equal(game.phase, 'ending')
    assert.equal(game.caughtId, null, 'Shiro never becomes a seventeenth idol or an ordinary caughtId')
    assert.deepEqual(game.metIds, originalRoster)
    if (game.endingFishing !== 'caught') assert.equal(basketCount(game), 0, 'hooking Shiro is not enough until reeling completes')
    assert.notEqual(game.script?.kind, 'encounter')
    if (game.endingFishing === 'reeling' && game.shiroHooked) {
      observedHookedReel = true
      assert.deepEqual(game.shiroPosition, { x: game.hook.x, y: game.hook.y + 35 })
      assert.deepEqual(getShiroPose(game), { x: game.hook.x, y: game.hook.y + 35, rotation: -8 })
    }
  }
  assert.equal(observedHookedReel, true, 'a real swept collision precedes the caught script')
  assert.equal(game.endingFishing, 'caught')
  assert.equal(game.speech, ENDING_CATCH_LINES[0])
  assert.equal(basketCount(game), 1, 'the basket changes as soon as Shiro reaches the top of the line')
  assert.equal(game.metIds.length, 16)
  assert.equal(game.casts, 2)
})

test('Shiro waits for the reaching tail, returns once, arcs into the sea after the windup, and swims within the visible water', () => {
  const game = createFishingGame(false, allIds)
  until(game, () => game.speech?.text === '你给我回来？！！！')
  assert.equal(game.shiroExiting, true)
  assert.deepEqual(getShiroPose(game), { x: 510, y: 120, rotation: 0 })
  until(game, () => game.speech?.event === 'pull-shiro')
  assert.equal(game.shiroExiting, false)
  assert.deepEqual(game.shiroPosition, { x: 510, y: 120 })
  wait(game, 0.4)
  assert.deepEqual(getShiroPose(game), { x: 510, y: 120, rotation: 0 })
  wait(game, 0.35)
  assert.ok(getShiroPose(game).x < 510 && getShiroPose(game).x > 357)
  until(game, () => game.speech?.text === '我钓不到鱼。', { confirm: false })
  assert.equal(game.shiroPosition, null)
  assert.deepEqual(getShiroPose(game), { x: 357, y: 120, rotation: 0 })

  until(game, () => game.speech?.event === 'dunk-shiro')
  wait(game, 0.15)
  assert.ok(getShiroPose(game).x > 357)
  assert.ok(getShiroPose(game).y < 120)
  wait(game, 0.4)
  assert.ok(getShiroPose(game).x < 367 && getShiroPose(game).x > 220)
  assert.ok(getShiroPose(game).y < 300)
  until(game, () => game.speech?.text === '你给我下去。', { confirm: false })
  assert.ok(game.shiroPosition.y >= 300 && game.shiroPosition.y < 301)
  const start = getShiroPose(game)
  for (let frame = 0; frame < 600; frame++) {
    tickFishingGame(game, 0.05)
    const pose = getShiroPose(game)
    assert.ok(pose.x >= 180 && pose.x <= 260)
    assert.ok(pose.y >= 300 && pose.y <= 370)
    assert.equal(game.speech?.text, '你给我下去。')
  }
  assert.notDeepEqual(getShiroPose(game), start)
})

test('the final confirmation starts a shared 1.4-second departure offset with Shiro still held beneath the hook', () => {
  const game = createFishingGame(false, allIds)
  catchShiro(game)
  until(game, () => game.speech?.text === '哦')
  wait(game, 3)
  assert.equal(game.phase, 'ending')
  assert.equal(game.shiroExiting, false)
  assert.equal(game.ryoExiting, false)
  assert.equal(getDepartureOffset(game), 0)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.speech?.event, 'leave-together')
  assert.equal(game.shiroExiting, true)
  assert.equal(game.ryoExiting, true)
  const held = { ...game.shiroPosition }
  assert.equal(getDepartureOffset(game), 0)
  wait(game, 0.7)
  const offset = getDepartureOffset(game)
  assert.ok(offset > 89 && offset < 91)
  assert.equal(game.phase, 'ending')
  assert.equal(getShiroPose(game).x, held.x + offset)
  assert.equal(getShiroPose(game).y, held.y)
  assert.ok(getShiroPose(game).y >= 35, 'the hanging portrait is not carried above the scene')
  assert.equal(restartFishingGame(game), false)
  until(game, () => game.phase === 'ended', { confirm: false })
  assert.equal(getDepartureOffset(game), 180)
  assert.equal(game.shiroPosition, null)
  assert.equal(game.caughtId, null)
  assert.equal(game.metIds.length, 16)
})

test('completed games freeze all state and cannot cast, greet, replay the intro or restart the ending by ticking', () => {
  const game = createFishingGame(false, allIds)
  finishEnding(game)
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
  finishEnding(game)
  const identity = game
  assert.equal(basketCount(game), 1)
  const revision = game.revision
  const oldFishes = game.fishes
  assert.equal(restartFishingGame(game), true)
  assert.equal(game, identity)
  assert.equal(game.revision, revision + 1)
  assert.equal(game.phase, 'aiming')
  assert.equal(game.introCompleted, true)
  assert.equal(basketCount(game), 0, 'replay empties the basket')
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
  assert.equal(game.endingFishing, 'inactive')
  assert.equal(game.shiroPosition, null)
  assert.equal(game.shiroHooked, false)
  assert.equal(game.shiroSwimTime, 0)
  assert.equal(getDepartureOffset(game), 0)
  assert.deepEqual(getShiroPose(game), { x: 357, y: 120, rotation: 0 })
  assert.equal(game.angle, REST_ANGLE)
  assert.equal(game.length, 26)
  assert.deepEqual(game.hook, hookPoint(REST_ANGLE, 26))
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
