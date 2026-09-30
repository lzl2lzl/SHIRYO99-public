import { CAST_LINES, ENCOUNTERS, ENDING_CATCH_LINES, ENDING_LINES, IDOLS, INTRO_LINES, needsConfirmation, type DialogueBeat } from './content.ts'
import { FISH_BOUNDS, HOOK_ORIGIN, createFish, firstCollision, hookPoint, idleAngle, maxHookLength, stepFish, type FishState, type Point } from './model.ts'

export type FishingPhase = 'intro' | 'aiming' | 'casting' | 'reeling' | 'landing' | 'encounter' | 'releasing' | 'ending' | 'ended'
export type EndingFishing = 'inactive' | 'aiming' | 'casting' | 'reeling' | 'caught'
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
  endingFishing: EndingFishing
  shiroPosition: Point | null
  shiroHooked: boolean
  shiroSwimTime: number
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
const SHIRO_SHORE: Readonly<Point> = { x: 357, y: 120 }
const SHIRO_EXIT: Readonly<Point> = { x: 510, y: 120 }
const SHIRO_WATER: Readonly<Point> = { x: 220, y: 300 }
const SHIRO_HOOK_OFFSET = 35
const smooth = (progress: number) => progress * progress * (3 - 2 * progress)

function beatProgress(game: FishingGame): number {
  if (!game.script || !game.speech) return 0
  return Math.min(1, game.script.elapsed * 1000 / speechDuration(game.speech, game.script.kind))
}

/** Apply this horizontal offset to Ryo, the rod and both line endpoints when they leave together. */
export function getDepartureOffset(game: FishingGame): number {
  if (game.phase === 'ended') return 180
  return game.speech?.event === 'leave-together' ? smooth(beatProgress(game)) * 180 : 0
}

/** One world-space portrait center for rendering, dialogue anchors and the catch target. Rotation is degrees. */
export function getShiroPose(game: FishingGame): Point & { rotation: number } {
  const event = game.speech?.event
  const progress = beatProgress(game)
  const eased = smooth(progress)
  if (event === 'pull-shiro') {
    const pulling = Math.max(0, Math.min(1, ((game.script?.elapsed ?? 0) - 0.45) / 0.65))
    return {
      x: SHIRO_EXIT.x + (SHIRO_SHORE.x - SHIRO_EXIT.x) * smooth(pulling),
      y: SHIRO_SHORE.y + Math.sin(pulling * Math.PI) * 10,
      rotation: pulling === 0 ? 0 : Math.sin(pulling * Math.PI) * -16,
    }
  }
  if (event === 'dunk-shiro') {
    const elapsed = game.script?.elapsed ?? 0
    if (elapsed < 0.3) return { x: SHIRO_SHORE.x + elapsed / 0.3 * 10, y: SHIRO_SHORE.y - elapsed / 0.3 * 3, rotation: elapsed / 0.3 * 8 }
    const flight = Math.min(1, (elapsed - 0.3) / 0.7)
    return {
      x: SHIRO_SHORE.x + 10 + (SHIRO_WATER.x - SHIRO_SHORE.x - 10) * smooth(flight),
      y: SHIRO_SHORE.y - 3 + (SHIRO_WATER.y - SHIRO_SHORE.y + 3) * smooth(flight) - Math.sin(flight * Math.PI) * 65,
      rotation: (1 - flight) * 8 - Math.sin(flight * Math.PI) * 32,
    }
  }
  if (game.shiroPosition) return {
    x: game.shiroPosition.x + getDepartureOffset(game), y: game.shiroPosition.y,
    rotation: game.shiroHooked ? -8 : Math.sin(game.shiroSwimTime * 0.9) * 5,
  }
  if (game.shiroExiting) {
    const exit = event === 'shiro-exits' ? eased : 1
    return { x: SHIRO_SHORE.x + (SHIRO_EXIT.x - SHIRO_SHORE.x) * exit, y: SHIRO_SHORE.y, rotation: 0 }
  }
  return { ...SHIRO_SHORE, rotation: 0 }
}

export function createFishingGame(showIntro: boolean, metIds: string[] = [], endingCompleted = false): FishingGame {
  const game: FishingGame = {
    phase: showIntro ? 'intro' : 'aiming', time: 0, fishes: createFish(IDOLS), angle: idleAngle(0),
    length: REST_LENGTH, hook: hookPoint(idleAngle(0), REST_LENGTH), caughtId: null, casts: 0,
    metIds: [...new Set(metIds.filter((id) => IDOLS.some((idol) => idol.id === id)))],
    speech: null, script: null, castSpeechDone: true, shiroAway: false, mood: null,
    shiroExiting: false, ryoExiting: false, shiroSleeping: false,
    endingFishing: 'inactive', shiroPosition: null, shiroHooked: false, shiroSwimTime: 0,
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
  game.endingFishing = 'inactive'
  game.shiroPosition = null
  game.shiroHooked = false
  game.shiroSwimTime = 0
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
  if (beat?.event === 'pull-shiro') {
    game.shiroExiting = false
    game.shiroPosition = { ...SHIRO_EXIT }
  }
  if (beat?.event === 'dunk-shiro') game.shiroPosition = { ...SHIRO_SHORE }
  if (beat?.event === 'leave-together') {
    game.shiroExiting = true
    game.ryoExiting = true
  }
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
    if (game.endingFishing === 'caught') {
      game.phase = 'ended'
      game.shiroSleeping = false
      game.shiroPosition = null
    } else {
      game.endingFishing = 'aiming'
      game.length = REST_LENGTH
      game.angle = idleAngle(game.time)
      game.hook = hookPoint(game.angle, REST_LENGTH)
    }
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

/** During the ending, a portrait response may accompany (but never advance) its dialogue. */
export function canGreetRyo(game: FishingGame, hasOtherBubble = false): boolean {
  return game.phase !== 'ended' && !game.ryoExiting && !hasOtherBubble
    && (game.phase === 'ending' || game.script === null)
}

export function advanceSpeech(game: FishingGame, manual = true): boolean {
  const script = game.script
  const speech = game.speech
  if (game.phase === 'ended' || !script || !speech) return false
  if (manual) {
    if (!canAdvanceSpeech(game)) return false
    game.inputLockedUntil = game.time + TAP_GUARD_SECONDS
  } else if (isWaitingForTap(game) || script.elapsed * 1000 < speechDuration(speech, script.kind)) return false
  if (speech.event === 'pull-shiro') game.shiroPosition = null
  if (speech.event === 'dunk-shiro') {
    game.shiroPosition = { ...SHIRO_WATER }
    game.shiroSwimTime = 0
  }
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
  if (game.phase === 'ending') {
    if (game.endingFishing !== 'aiming' || game.script || game.time < game.inputLockedUntil) return false
    game.endingFishing = 'casting'
    game.length = REST_LENGTH
    game.hook = hookPoint(game.angle, REST_LENGTH)
    game.shiroHooked = false
    game.casts++
    game.revision++
    return true
  }
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

function tickEndingFishing(game: FishingGame, delta: number) {
  const event = game.speech?.event
  if (event === 'pull-shiro' || event === 'dunk-shiro') {
    const { x, y } = getShiroPose(game)
    game.shiroPosition = { x, y }
  } else if (game.shiroPosition && !game.shiroHooked) {
    game.shiroSwimTime += delta
    game.shiroPosition = {
      x: SHIRO_WATER.x + Math.sin(game.shiroSwimTime * 0.4) * 40,
      y: SHIRO_WATER.y + (1 - Math.cos(game.shiroSwimTime * 0.3)) * 35,
    }
  }
  if (game.endingFishing === 'aiming') {
    game.angle = idleAngle(game.time)
    game.length = REST_LENGTH
    game.hook = hookPoint(game.angle, REST_LENGTH)
  } else if (game.endingFishing === 'casting') {
    const nextLength = Math.min(maxHookLength(game.angle), game.length + CAST_SPEED * delta)
    const next = hookPoint(game.angle, nextLength)
    const pose = getShiroPose(game)
    // The ending has one target; the sixteen idol labels cannot intercept this cast.
    const hit = firstCollision(game.hook, next, [{ id: 'shiro', ...pose, phase: 0, heading: 0, style: 'quiet' }])
    if (hit) {
      game.shiroHooked = true
      game.hook = hit.point
      game.length = Math.hypot(hit.point.x - HOOK_ORIGIN.x, hit.point.y - HOOK_ORIGIN.y)
      game.endingFishing = 'reeling'
      game.shiroPosition = { x: game.hook.x, y: game.hook.y + SHIRO_HOOK_OFFSET }
      game.revision++
    } else {
      game.length = nextLength
      game.hook = next
      if (nextLength >= maxHookLength(game.angle)) {
        game.endingFishing = 'reeling'
        game.revision++
      }
    }
  } else if (game.endingFishing === 'reeling') {
    game.length = Math.max(REST_LENGTH, game.length - REEL_SPEED * delta)
    game.hook = hookPoint(game.angle, game.length)
    if (game.shiroHooked) game.shiroPosition = { x: game.hook.x, y: game.hook.y + SHIRO_HOOK_OFFSET }
    if (game.length <= REST_LENGTH) {
      if (game.shiroHooked) {
        game.endingFishing = 'caught'
        startScript(game, 'ending', ENDING_CATCH_LINES)
      } else game.endingFishing = 'aiming'
      game.revision++
    }
  }
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

  if (game.phase === 'ending') {
    tickEndingFishing(game, delta)
    return
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

// Idols never enter the basket; Shiro counts only after reeling him all the way in.
export function basketCount(game: Pick<FishingGame, 'phase' | 'endingFishing'>): 0 | 1 {
  return game.endingFishing === 'caught' || game.phase === 'ended' ? 1 : 0
}
