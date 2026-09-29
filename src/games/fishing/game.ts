import { CAST_LINES, ENCOUNTERS, ENDING_LINES, IDOLS, INTRO_LINES, needsConfirmation, type DialogueBeat } from './content.ts'
import { FISH_BOUNDS, HOOK_ORIGIN, createFish, firstCollision, hookPoint, idleAngle, maxHookLength, stepFish, type FishState, type Point } from './model.ts'

export type FishingPhase = 'intro' | 'aiming' | 'casting' | 'reeling' | 'landing' | 'encounter' | 'releasing' | 'ending' | 'ended'
type ScriptKind = 'intro' | 'cast' | 'encounter' | 'ending'
type Script = { kind: ScriptKind; beats: readonly DialogueBeat[]; index: number; elapsed: number }

export interface FishingGame {
  phase: FishingPhase
  time: number
  fishes: FishState[]
  angle: number
  length: number
  hook: Point
  caughtId: string | null
  casts: number
  metIds: string[]
  speech: DialogueBeat | null
  script: Script | null
  castSpeechDone: boolean
  shiroAway: boolean
  shiroExiting: boolean
  ryoExiting: boolean
  shiroSleeping: boolean
  mood: DialogueBeat['mood'] | null
  hasLeft: boolean
  release: { from: Point; to: Point; elapsed: number } | null
  revision: number
  introCompleted: boolean
  inputLockedUntil: number
}

const REST_LENGTH = 26
const CAST_SPEED = 190
const REEL_SPEED = 210
const RELEASE_SECONDS = 1.1
const TAP_GUARD_SECONDS = 0.35

export function createFishingGame(showIntro: boolean, metIds: string[] = [], endingCompleted = false): FishingGame {
  const game: FishingGame = {
    phase: showIntro ? 'intro' : 'aiming', time: 0, fishes: createFish(IDOLS), angle: idleAngle(0),
    length: REST_LENGTH, hook: hookPoint(idleAngle(0), REST_LENGTH), caughtId: null, casts: 0,
    metIds: [...new Set(metIds.filter((id) => IDOLS.some((idol) => idol.id === id)))],
    speech: null, script: null, castSpeechDone: true, shiroAway: false, mood: null,
    shiroExiting: false, ryoExiting: false, shiroSleeping: false,
    hasLeft: false, release: null, revision: 0, introCompleted: !showIntro, inputLockedUntil: 0,
  }
  if (hasMetEveryone(game)) {
    game.introCompleted = true
    if (endingCompleted) {
      game.phase = 'ended'
      game.shiroExiting = true
      game.ryoExiting = true
    } else startEnding(game)
  } else if (showIntro) startIntroduction(game)
  return game
}

function hasMetEveryone(game: FishingGame): boolean {
  return IDOLS.every((idol) => game.metIds.includes(idol.id))
}

function startEnding(game: FishingGame) {
  if (game.phase === 'ending' || game.phase === 'ended') return
  game.phase = 'ending'
  game.introCompleted = true
  game.caughtId = null
  game.release = null
  game.hasLeft = false
  game.mood = null
  game.shiroAway = false
  game.shiroExiting = false
  game.ryoExiting = false
  game.shiroSleeping = true
  game.length = REST_LENGTH
  game.hook = hookPoint(game.angle, REST_LENGTH)
  startScript(game, 'ending', ENDING_LINES)
}

export function restartFishingGame(game: FishingGame): boolean {
  if (game.phase !== 'ended') return false
  const revision = game.revision + 1
  Object.assign(game, createFishingGame(false, []), { revision })
  return true
}

function startScript(game: FishingGame, kind: ScriptKind, beats: readonly DialogueBeat[]) {
  game.script = { kind, beats, index: 0, elapsed: 0 }
  enterBeat(game)
}

function enterBeat(game: FishingGame) {
  const beat = game.script?.beats[game.script.index]
  game.speech = beat ?? null
  if (beat?.mood) game.mood = beat.mood
  if (beat?.event === 'punch-shiro') game.shiroAway = true
  if (beat?.event === 'shiro-returns') game.shiroAway = false
  if (beat?.event === 'idol-leaves') releaseIdol(game)
  if (beat?.event === 'wake-shiro') game.shiroSleeping = false
  if (beat?.event === 'shiro-exits') game.shiroExiting = true
  if (beat?.event === 'ryo-exits') game.ryoExiting = true
  game.revision++
}

function releaseIdol(game: FishingGame) {
  if (!game.caughtId || game.hasLeft) return
  const fish = game.fishes.find((item) => item.id === game.caughtId)
  if (!fish) return
  game.hasLeft = true
  game.release = {
    from: { x: fish.x, y: fish.y },
    to: {
      x: FISH_BOUNDS.left + 12 + Math.random() * (FISH_BOUNDS.right - FISH_BOUNDS.left - 24),
      y: FISH_BOUNDS.top + 12 + Math.random() * (FISH_BOUNDS.bottom - FISH_BOUNDS.top - 24),
    },
    elapsed: 0,
  }
}

function backToAiming(game: FishingGame) {
  game.phase = 'aiming'
  game.caughtId = null
  game.hasLeft = false
  game.mood = null
  game.shiroAway = false
  game.speech = null
  game.script = null
  game.length = REST_LENGTH
  game.release = null
  game.revision++
  if (hasMetEveryone(game)) startEnding(game)
}

function finishScript(game: FishingGame, kind: ScriptKind) {
  game.script = null
  game.speech = null
  if (kind === 'intro') {
    game.introCompleted = true
    game.phase = 'aiming'
  } else if (kind === 'cast') {
    game.castSpeechDone = true
    if (game.phase === 'landing') landCatch(game)
  } else if (kind === 'encounter') {
    releaseIdol(game)
    game.phase = 'releasing'
    if (!game.release) backToAiming(game)
  } else if (kind === 'ending') {
    game.phase = 'ended'
    game.shiroSleeping = false
  }
  game.revision++
}

export function speechDuration(beat: DialogueBeat, kind?: ScriptKind) {
  return beat.durationMs ?? (kind === 'intro' ? 2800 : Math.min(11000, Math.max(1500, Array.from(beat.text).length * 155)))
}

/** Encounter dialogue needs acknowledgement; ambient lines and silent animations are automatic. */
export function isWaitingForTap(game: FishingGame): boolean {
  if (game.phase === 'ended' || !game.script || !game.speech) return false
  return needsConfirmation(game.speech, game.script.kind === 'cast' ? 'line' : 'dialogue')
}

export function canAdvanceSpeech(game: FishingGame): boolean {
  return isWaitingForTap(game)
    && game.script!.elapsed >= TAP_GUARD_SECONDS
    && game.time >= game.inputLockedUntil
}

/** Casual greetings never interrupt an introduction, a scripted exchange, or another bubble. */
export function canGreetShiro(game: FishingGame, hasOtherBubble = false): boolean {
  return game.phase !== 'ending' && game.phase !== 'ended'
    && !game.shiroAway && !game.shiroExiting && !game.ryoExiting && !game.shiroSleeping
    && game.script === null && !hasOtherBubble
}

export function advanceSpeech(game: FishingGame, manual = true): boolean {
  const script = game.script
  const speech = game.speech
  if (game.phase === 'ended' || !script || !speech) return false
  if (manual) {
    if (!canAdvanceSpeech(game)) return false
    game.inputLockedUntil = game.time + TAP_GUARD_SECONDS
  } else if (isWaitingForTap(game) || script.elapsed * 1000 < speechDuration(speech, script.kind)) return false
  script.index++
  script.elapsed = 0
  if (script.index >= script.beats.length) finishScript(game, script.kind)
  else enterBeat(game)
  return true
}

export function startIntroduction(game: FishingGame) {
  if (game.phase !== 'aiming' && game.phase !== 'intro') return
  game.phase = 'intro'
  game.mood = null
  startScript(game, 'intro', INTRO_LINES.map((text) => ({ text })))
}

export function castLine(game: FishingGame) {
  if (game.phase !== 'aiming' || game.time < game.inputLockedUntil) return false
  game.phase = 'casting'
  game.length = REST_LENGTH
  game.casts++
  game.castSpeechDone = false
  game.hasLeft = false
  game.shiroAway = false
  game.mood = null
  startScript(game, 'cast', CAST_LINES)
  game.revision++
  return true
}

function landCatch(game: FishingGame) {
  if (!game.castSpeechDone) {
    game.phase = 'landing'
    game.revision++
    return
  }
  if (!game.caughtId) {
    backToAiming(game)
    return
  }
  game.phase = 'encounter'
  if (!game.metIds.includes(game.caughtId)) game.metIds.push(game.caughtId)
  game.mood = game.caughtId === 'riku' ? 'happy' : null
  const fish = game.fishes.find((item) => item.id === game.caughtId)!
  fish.x = 219
  fish.y = 217
  const beats = ENCOUNTERS[game.caughtId]
  if (beats?.length) startScript(game, 'encounter', beats)
  else {
    releaseIdol(game)
    game.phase = 'releasing'
  }
  game.revision++
}

export function tickFishingGame(game: FishingGame, dt: number, reducedMotion = false) {
  if (game.phase === 'ended' || !Number.isFinite(dt) || dt <= 0) return
  const delta = Math.min(dt, 0.05)
  game.time += delta
  stepFish(game.fishes, delta, game.time, game.caughtId && (!game.hasLeft || game.release) ? game.caughtId : undefined, reducedMotion)

  if (game.release && game.caughtId) {
    const fish = game.fishes.find((item) => item.id === game.caughtId)!
    game.release.elapsed += delta
    const progress = Math.min(1, game.release.elapsed / RELEASE_SECONDS)
    const eased = progress * progress * (3 - 2 * progress)
    fish.x = game.release.from.x + (game.release.to.x - game.release.from.x) * eased
    fish.y = game.release.from.y + (game.release.to.y - game.release.from.y) * eased
    if (progress >= 1) {
      game.release = null
      if (game.phase === 'releasing') backToAiming(game)
    }
  }

  if (game.script && game.speech) {
    game.script.elapsed += delta
    if (!isWaitingForTap(game) && game.script.elapsed * 1000 >= speechDuration(game.speech, game.script.kind)) advanceSpeech(game, false)
  }

  if (game.phase === 'aiming' || game.phase === 'intro') {
    game.angle = idleAngle(game.time)
    game.length = REST_LENGTH
    game.hook = hookPoint(game.angle, game.length)
  } else if (game.phase === 'casting') {
    const nextLength = Math.min(maxHookLength(game.angle), game.length + CAST_SPEED * delta)
    const next = hookPoint(game.angle, nextLength)
    const hit = firstCollision(game.hook, next, game.fishes)
    if (hit) {
      game.caughtId = hit.id
      game.hook = hit.point
      game.length = Math.hypot(hit.point.x - HOOK_ORIGIN.x, hit.point.y - HOOK_ORIGIN.y)
      game.phase = 'reeling'
      game.revision++
    } else {
      game.length = nextLength
      game.hook = next
      if (nextLength >= maxHookLength(game.angle)) {
        game.phase = 'reeling'
        game.revision++
      }
    }
  } else if (game.phase === 'reeling') {
    game.length = Math.max(REST_LENGTH, game.length - REEL_SPEED * delta)
    game.hook = hookPoint(game.angle, game.length)
    if (game.caughtId) {
      const fish = game.fishes.find((item) => item.id === game.caughtId)!
      fish.x = game.hook.x
      fish.y = game.hook.y + 19
    }
    if (game.length <= REST_LENGTH) landCatch(game)
  }
}

// A decorative jar, deliberately not a collection or inventory.
export function basketCount(): 0 { return 0 }
