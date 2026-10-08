import assert from 'node:assert/strict'
import test from 'node:test'
import { CAST_LINES, ENCOUNTERS, IDOLS, INTRO_LINES } from '../src/games/fishing/content.ts'
import {
  advanceSpeech,
  basketCount,
  canAdvanceSpeech,
  castLine,
  createFishingGame,
  isWaitingForTap,
  startIntroduction,
  tickFishingGame,
} from '../src/games/fishing/game.ts'
import { FISH_BOUNDS } from '../src/games/fishing/model.ts'

const FRAME_SECONDS = 0.05

function recordSpeech(game, trace) {
  const speech = game.speech
  if (!speech || trace.at(-1)?.source === speech) return
  trace.push({
    source: speech,
    kind: game.script?.kind,
    text: speech.text,
    speaker: speech.speaker,
    location: speech.location,
    event: speech.event,
    mood: game.mood,
    shiroAway: game.shiroAway,
    hasLeft: game.hasLeft,
  })
}

function runUntil(game, condition, description, trace = [], maxFrames = 4000) {
  recordSpeech(game, trace)
  for (let frame = 0; frame < maxFrames; frame += 1) {
    assert.equal(basketCount(game), 0, 'the basket never collects an idol')
    if (condition()) return trace
    tickFishingGame(game, FRAME_SECONDS)
    recordSpeech(game, trace)
    if (!condition() && canAdvanceSpeech(game)) {
      assert.equal(advanceSpeech(game, true), true)
      recordSpeech(game, trace)
    }
  }
  assert.fail(`${description}: still in ${game.phase}, speech ${JSON.stringify(game.speech?.text)}`)
}

function runWithoutTapping(game, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds / FRAME_SECONDS); frame += 1) {
    tickFishingGame(game, FRAME_SECONDS)
    assert.equal(basketCount(game), 0)
  }
}

// Arrange an actual catch at the end of its return trip, without adding a test API.
function catchAtShore(game, id, trace = []) {
  assert.equal(game.phase, 'aiming')
  if (game.time < game.inputLockedUntil) runWithoutTapping(game, 0.4)
  assert.equal(castLine(game), true)
  recordSpeech(game, trace)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = id
  runUntil(game, () => game.phase === 'encounter', `land ${id}`, trace)
  return trace
}

function playEncounter(id) {
  const game = createFishingGame(false)
  const trace = catchAtShore(game, id)
  runUntil(game, () => game.phase === 'aiming', `complete ${id}`, trace)
  return { game, trace, encounter: trace.filter((beat) => beat.kind === 'encounter') }
}

test('sixteen unique encounters leave the basket empty, deduplicate repeats, and then begin the ending', () => {
  const game = createFishingGame(false, ['riku', 'riku', 'not-an-idol'])
  assert.deepEqual(game.metIds, ['riku'])
  assert.equal(IDOLS.length, 16)
  assert.deepEqual(
    ['IDOLiSH7', 'TRIGGER', 'Re:vale', 'ŹOOĻ'].map((group) => IDOLS.filter((idol) => idol.group === group).length),
    [7, 3, 2, 4],
  )

  const savedIds = [...game.metIds]
  catchAtShore(game, 'riku')
  runUntil(game, () => game.phase === 'aiming', 'release a repeated catch')
  assert.deepEqual(game.metIds, savedIds)

  for (const idol of IDOLS) {
    const trace = catchAtShore(game, idol.id)
    const expectedPhase = game.metIds.length === 16 ? 'ending' : 'aiming'
    runUntil(game, () => game.phase === expectedPhase, `release ${idol.id}`, trace)
    assert.ok(trace.some((beat) => beat.event === 'idol-leaves'), `${idol.name} returns to the water`)
    assert.equal(game.caughtId, null)
    assert.equal(game.release, null)
    if (expectedPhase === 'ending') {
      assert.equal(game.script?.kind, 'ending')
      assert.equal(game.speech?.text, '一天过去了')
    } else {
      assert.equal(game.script, null)
      assert.equal(game.speech, null)
    }
    assert.equal(game.shiroAway, false)
    assert.equal(game.metIds.filter((id) => id === idol.id).length, 1)
    assert.equal(basketCount(game), 0)
  }

  assert.equal(game.phase, 'ending')
  assert.equal(game.casts, 17)
  assert.deepEqual(new Set(game.metIds), new Set(IDOLS.map((idol) => idol.id)))
})

test('each cast speaks the same two lines once, blocks recasting, and finishes them before the encounter', () => {
  const game = createFishingGame(false)

  for (const id of ['iori', 'riku']) {
    const castNumber = game.casts + 1
    assert.equal(castLine(game), true)
    const trace = []
    recordSpeech(game, trace)
    assert.equal(game.speech?.speaker, 'shiro')
    assert.equal(game.speech?.text, '加油，了くん！')
    assert.equal(castLine(game), false)
    assert.equal(game.casts, castNumber)

    game.phase = 'reeling'
    game.length = 27
    game.caughtId = id
    tickFishingGame(game, FRAME_SECONDS)
    assert.equal(game.phase, 'landing', 'a fast catch waits for both shore lines')
    assert.equal(castLine(game), false)
    runUntil(game, () => game.phase === 'encounter', 'finish cast dialogue', trace)

    assert.deepEqual(
      trace.filter((beat) => beat.kind === 'cast').map(({ speaker, text }) => ({ speaker, text })),
      [{ speaker: 'shiro', text: '加油，了くん！' }, { speaker: 'ryo', text: '闭嘴！' }],
    )
    assert.equal(game.castSpeechDone, true)
    assert.equal(castLine(game), false)
    assert.equal(game.casts, castNumber)
    runUntil(game, () => game.phase === 'aiming', 'complete cast cycle', trace)
  }

  assert.deepEqual(CAST_LINES.map((beat) => beat.durationMs), [1800, 1800])
})

test('Riku hears one anonymous underwater crowd and leaves before Ryo finishes humming', () => {
  const { encounter } = playEncounter('riku')
  const crowd = encounter.filter((beat) => beat.speaker === 'crowd')
  assert.equal(crowd.length, 1)
  assert.equal(crowd[0].text, 'riku！快回来！！！')
  assert.equal(crowd[0].location, 'water')
  assert.equal(Object.hasOwn(crowd[0].source, 'name'), false)
  const leave = encounter.findIndex((beat) => beat.event === 'idol-leaves')
  const humming = encounter.findIndex((beat) => beat.text === '🎵')
  assert.ok(leave >= 0 && humming > leave)
  assert.equal(encounter[humming].mood, 'happy')
  assert.equal(encounter[humming].hasLeft, true)
})

test('Riku waits for separate confirmation of thanks, silence and goodbye before returning underwater', () => {
  const game = createFishingGame(false)
  const lines = ['呃，你好？总之，谢谢你下单了这么多周边支持我们……', '……', '我先回去了！！！']
  catchAtShore(game, 'riku')
  runUntil(game, () => game.speech?.text === lines[0], 'reach Riku three-part reply')

  for (const [index, text] of lines.entries()) {
    const beat = game.speech
    assert.equal(beat?.speaker, 'idol')
    assert.equal(beat?.text, text)
    assert.equal(isWaitingForTap(game), true)
    runWithoutTapping(game, 20)
    assert.equal(game.speech, beat, 'each individual line stays until acknowledged')
    assert.equal(game.hasLeft, false, 'Riku stays ashore until the goodbye is acknowledged')
    assert.equal(game.release, null)
    assert.equal(castLine(game), false)
    assert.equal(advanceSpeech(game, false), false)
    assert.equal(advanceSpeech(game, true), true)
    if (index < lines.length - 1) {
      assert.equal(game.speech?.speaker, 'idol')
      assert.equal(game.speech?.text, lines[index + 1])
      assert.equal(game.hasLeft, false)
      assert.equal(advanceSpeech(game, true), false, 'the following line cannot be swallowed by a double tap')
    }
  }

  assert.equal(game.speech?.event, 'idol-leaves')
  assert.equal(game.hasLeft, true)
  assert.notEqual(game.release, null)
  runUntil(game, () => game.phase === 'aiming', 'finish Ryo response after Riku goodbye')
})

test('Momo makes Shiro stay away after the punch until his explicit return after Momo leaves', () => {
  const { encounter } = playEncounter('momo')
  const punch = encounter.findIndex((beat) => beat.event === 'punch-shiro')
  const leaves = encounter.findIndex((beat) => beat.event === 'idol-leaves')
  const returns = encounter.findIndex((beat) => beat.event === 'shiro-returns')
  assert.ok(punch > 0 && leaves > punch && returns > leaves)
  assert.ok(encounter.slice(0, punch).every((beat) => beat.shiroAway === false))
  assert.ok(encounter.slice(punch, returns).every((beat) => beat.shiroAway === true))
  assert.equal(encounter[returns].shiroAway, false)
  assert.equal(encounter[returns].hasLeft, true)
  assert.ok(encounter.some((beat) => beat.text.includes('勒索你达令1000000$')))
})

test('Toma and Tora return underwater during the hesitation, before Ryo speaks the final line', () => {
  for (const [id, finalText] of [
    ['toma', '我看起来像瞎子吗？？？'],
    ['tora', '我才没有想跟你打招呼呢？？'],
  ]) {
    const { encounter } = playEncounter(id)
    const leaves = encounter.findIndex((beat) => beat.event === 'idol-leaves')
    const lastLine = encounter.findIndex((beat) => beat.text === finalText)
    assert.ok(leaves > 0 && lastLine > leaves, `${id} leaves before the delayed reply`)
    assert.equal(encounter[leaves - 1].text, '', `${id} has a separate silent hesitation first`)
    assert.equal(encounter[leaves - 1].event, undefined)
    assert.equal(encounter[lastLine].hasLeft, true)
    assert.equal(encounter[lastLine].speaker, 'ryo')
    assert.ok(encounter.every((beat) => beat.mood !== 'shy'))
  }
})

test('only Haruka causes the specified embarrassed reply; the other ZOOL encounters do not', () => {
  const { encounter } = playEncounter('haruka')
  const reply = encounter.find((beat) => beat.text === '怎么可能！')
  assert.ok(reply)
  assert.equal(reply.speaker, 'ryo')
  assert.equal(reply.mood, 'shy')
  for (const id of ['toma', 'minami', 'tora']) {
    assert.ok(playEncounter(id).encounter.every((beat) => beat.mood !== 'shy'))
  }
})

test('Minami smiling silence remains a manual line followed by Ryo question mark', () => {
  const game = createFishingGame(false)
  catchAtShore(game, 'minami')
  runUntil(game, () => game.speech?.text === '^^', 'reach Minami smiling silence')
  assert.equal(game.speech?.speaker, 'idol')
  assert.equal(isWaitingForTap(game), true)
  const smilingSilence = game.speech
  runWithoutTapping(game, 20)
  assert.equal(game.speech, smilingSilence)
  assert.equal(game.hasLeft, false)
  assert.equal(advanceSpeech(game, false), false)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.speech?.speaker, 'ryo')
  assert.equal(game.speech?.text, '？')
  assert.equal(isWaitingForTap(game), true)
  assert.equal(advanceSpeech(game, true), false)
  runWithoutTapping(game, 20)
  assert.equal(game.speech?.text, '？')
  assert.equal(game.hasLeft, false)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.speech?.event, 'idol-leaves')
  runUntil(game, () => game.phase === 'aiming', 'complete Minami smiling encounter')
})

test('the introduction contains the exact three opening lines and two instructions, completes, and can replay', () => {
  assert.deepEqual(INTRO_LINES.slice(0, 3), [
    '月云了获得了一个可以捕捉偶像的鱼竿',
    '钓到的偶像会被捉进鱼篮里',
    '遇见……可怕的事……',
  ])
  assert.equal(INTRO_LINES.length, 5)
  assert.ok(INTRO_LINES.slice(3).every((text) => typeof text === 'string' && text.length > 0))
  assert.ok(INTRO_LINES[3].includes('轻点场景空白处'))
  assert.ok(INTRO_LINES[3].includes('任意方向'))
  assert.ok(INTRO_LINES[4].includes('毁灭偶像'))
  assert.ok(INTRO_LINES[4].includes('读完后点一下'))
  assert.equal(INTRO_LINES.join('').includes('轻点继续'), false)
  assert.equal(INTRO_LINES.join('').includes('「下钩」'), false)

  const game = createFishingGame(true)
  assert.equal(game.introCompleted, false)
  assert.equal(castLine(game), false)
  const firstRead = runUntil(game, () => game.phase === 'aiming', 'finish introduction')
  assert.deepEqual(firstRead.map((beat) => beat.text), [...INTRO_LINES])
  assert.equal(game.introCompleted, true)

  startIntroduction(game)
  assert.equal(game.phase, 'intro')
  assert.equal(castLine(game), false)
  const secondRead = runUntil(game, () => game.phase === 'aiming', 'replay introduction')
  assert.deepEqual(secondRead.map((beat) => beat.text), [...INTRO_LINES])
  assert.equal(game.introCompleted, true)
  assert.equal(game.casts, 0)

  runWithoutTapping(game, 0.4)
  castLine(game)
  const castScript = game.script
  startIntroduction(game)
  assert.equal(game.phase, 'casting', 'replaying the introduction cannot interrupt a cast')
  assert.equal(game.script, castScript)
})

test('invalid time steps are harmless and an oversized frame cannot fast-forward the game', () => {
  for (const showIntro of [true, false]) {
    const game = createFishingGame(showIntro)
    if (!showIntro) castLine(game)
    const before = structuredClone(game)
    for (const dt of [0, -0.05, -Infinity, Infinity, NaN, undefined, null]) {
      tickFishingGame(game, dt)
      assert.deepEqual(game, before)
    }
    tickFishingGame(game, 60)
    assert.ok(game.time > before.time && game.time - before.time <= 0.05)
    assert.ok(Number.isFinite(game.hook.x) && Number.isFinite(game.hook.y))
    assert.ok(game.fishes.every((fish) => Number.isFinite(fish.x) && Number.isFinite(fish.y)))
    assert.equal(basketCount(game), 0)
  }
})

test('blank beats advance automatically and manual double taps do not skip a fresh speech', () => {
  const game = createFishingGame(false)
  catchAtShore(game, 'haruka')
  assert.equal(game.speech?.text, '')
  const blankBeat = game.speech
  runUntil(game, () => game.speech !== blankBeat, 'advance the silent opening', [], 30)
  assert.equal(game.speech?.text, '啊，了桑！今天开心吗！')

  const firstSpokenBeat = game.speech
  advanceSpeech(game, true)
  assert.equal(game.speech, firstSpokenBeat, 'a tap cannot skip a beat immediately after it appears')
  for (let frame = 0; frame < 8; frame += 1) tickFishingGame(game, FRAME_SECONDS)
  advanceSpeech(game, true)
  assert.equal(game.speech?.text, '怎么可能！')
  const nextBeat = game.speech
  advanceSpeech(game, true)
  assert.equal(game.speech, nextBeat, 'a second immediate tap does not skip the next beat')
  runUntil(game, () => game.phase === 'aiming', 'finish after the silent and manually advanced beats')
  assert.equal(game.script, null)
  assert.equal(game.speech, null)
})

test('an empty cast completes only the two fixed lines and returns silently without an encounter record', () => {
  const game = createFishingGame(false)
  assert.equal(castLine(game), true)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = null
  const trace = runUntil(game, () => game.phase === 'aiming', 'recover from an empty hook')
  assert.deepEqual(trace.filter((beat) => beat.kind === 'cast').map((beat) => beat.text), ['加油，了くん！', '闭嘴！'])
  assert.deepEqual(trace.filter((beat) => beat.text).map((beat) => beat.text), ['加油，了くん！', '闭嘴！'])
  assert.deepEqual(game.metIds, [])
  assert.equal(game.casts, 1)
  assert.equal(basketCount(game), 0)
})

test('opening and encounter lines never advance on a timer, and a cast stays blocked until acknowledgement', () => {
  const intro = createFishingGame(true)
  const opening = intro.speech
  runWithoutTapping(intro, 30)
  assert.equal(intro.speech, opening)
  assert.equal(intro.script.index, 0)
  assert.equal(intro.introCompleted, false)
  assert.equal(castLine(intro), false)
  assert.equal(advanceSpeech(intro, false), false, 'automatic advancement cannot bypass a manual line')
  assert.equal(advanceSpeech(intro, true), true)
  assert.equal(intro.speech.text, INTRO_LINES[1])

  const game = createFishingGame(false)
  catchAtShore(game, 'gaku')
  const dialogue = game.speech
  const castNumber = game.casts
  runWithoutTapping(game, 60)
  assert.equal(game.speech, dialogue)
  assert.equal(game.phase, 'encounter')
  assert.equal(game.hasLeft, false)
  assert.equal(isWaitingForTap(game), true)
  assert.equal(canAdvanceSpeech(game), true)
  assert.equal(castLine(game), false)
  assert.equal(game.casts, castNumber)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.speech?.event, 'idol-leaves')
  runUntil(game, () => game.phase === 'aiming', 'confirm the last Gaku line and release')
  assert.equal(castLine(game), true)
})

test('a returned idol does not end the final visible line until the user confirms, and a double tap cannot cast', () => {
  const game = createFishingGame(false)
  catchAtShore(game, 'toma')
  runUntil(game, () => game.speech?.text === '我看起来像瞎子吗？？？', 'reach Toma final line')
  runWithoutTapping(game, 30)
  assert.equal(game.hasLeft, true)
  assert.equal(game.release, null)
  assert.equal(game.phase, 'encounter')
  assert.equal(game.speech.text, '我看起来像瞎子吗？？？')
  assert.equal(castLine(game), false)
  assert.equal(advanceSpeech(game, true), true)
  assert.equal(game.phase, 'aiming')
  assert.equal(castLine(game), false, 'the second tap of the same gesture cannot become a fresh cast')
  runWithoutTapping(game, 0.4)
  assert.equal(castLine(game), true)
})

test('fixed cast lines are slower automatic beats that cannot be skipped manually', () => {
  const game = createFishingGame(false)
  castLine(game)
  game.phase = 'reeling'
  game.length = 27
  game.caughtId = 'iori'
  runWithoutTapping(game, 1.2)
  assert.equal(game.speech.text, '加油，了くん！')
  assert.equal(isWaitingForTap(game), false)
  assert.equal(canAdvanceSpeech(game), false)
  assert.equal(advanceSpeech(game, true), false)
  runWithoutTapping(game, 0.65)
  assert.equal(game.speech.text, '闭嘴！')
  runWithoutTapping(game, 1.2)
  assert.equal(game.speech.text, '闭嘴！')
  assert.equal(advanceSpeech(game, true), false)
  runWithoutTapping(game, 0.65)
  assert.equal(game.phase, 'encounter')
  assert.equal(game.speech.text, '')
  assert.equal(isWaitingForTap(game), true)
})

test('the six mutually silent encounters show no narration and wait for a tap before returning', () => {
  for (const id of ['iori', 'yamato', 'mitsuki', 'tamaki', 'sogo', 'nagi']) {
    const game = createFishingGame(false)
    catchAtShore(game, id)
    runWithoutTapping(game, 15)
    assert.equal(game.phase, 'encounter')
    assert.equal(game.speech.text, '')
    assert.equal(game.speech.waitForTap, true)
    assert.equal(game.hasLeft, false)
    assert.equal(castLine(game), false)
    assert.equal(advanceSpeech(game, true), true)
    assert.equal(game.hasLeft, true)
    runUntil(game, () => game.phase === 'aiming', `release the silent ${id}`)
  }
})

test('every encounter displays only the original supplied lines, with all added narration removed', () => {
  const originalLines = {
    iori: [], yamato: [], mitsuki: [], tamaki: [], sogo: [], nagi: [],
    riku: ['啊，你是……月云了？', 'riku！快回来！！！', '……', '呃，你好？总之，谢谢你下单了这么多周边支持我们……', '……', '我先回去了！！！', '……', '🎵'],
    gaku: ['哈哈，好想打个电话提醒你父亲注意心脏~'],
    ten: ['哈哈，虚伪的家伙你也有今天！'],
    ryunosuke: ['……', '所以我说过偶像也不过如此，，，！哼！'],
    momo: ['……', '哟，momo，好久不见。', '我听宇都木桑说，你过得还不错？', '……', '哈？？？？？', '你听错了。', '噗……！果然是这样！太好啦，我也很开心哦☆', '哈？你好吵，有谁需要你开心吗？小心我把你绑架进鱼篮勒索你达令1000000$。'],
    yuki: ['哈哈，想不到你有一天也会落到我手里。哈哈！真没用~'],
    haruka: ['啊，了桑！今天开心吗！', '怎么可能！'],
    toma: ['了桑！今天天气真好啊！', '哦。', '我看起来像瞎子吗？？？'],
    minami: ['^^', '？'],
    tora: ['……嗨。', '……', '我才没有想跟你打招呼呢？？'],
  }
  for (const idol of IDOLS) {
    const lines = ENCOUNTERS[idol.id].filter((beat) => beat.text)
    assert.deepEqual(lines.map((beat) => beat.text), originalLines[idol.id], `${idol.name} keeps exactly the user's words`)
    assert.ok(lines.every((beat) => beat.speaker), 'no added narrative text appears during encounters')
  }
  assert.ok(ENCOUNTERS.momo.filter((beat) => beat.event).every((beat) => beat.text === ''))
})

test('release destinations lie inside the swimming area rather than using an idol-specific fixed row', () => {
  const game = createFishingGame(false)
  for (const idol of IDOLS) {
    catchAtShore(game, idol.id)
    runUntil(game, () => game.release !== null, `begin release ${idol.id}`)
    const { x, y } = game.release.to
    assert.ok(x >= FISH_BOUNDS.left && x <= FISH_BOUNDS.right)
    assert.ok(y >= FISH_BOUNDS.top && y <= FISH_BOUNDS.bottom)
    runUntil(game, () => game.phase === 'aiming' || game.phase === 'ending', `finish release ${idol.id}`)
  }
})
