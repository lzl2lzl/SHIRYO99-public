import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { GameDefinition, GameScreenProps } from '../../engine/types'
import { platform } from '../../platform'
import { IDOLS, type DialogueBeat } from './content'
import { advanceSpeech, basketCount, canAdvanceSpeech, canGreetRyo, canGreetShiro, castLine, createFishingGame, getDepartureOffset, getShiroPose, isWaitingForTap, restartFishingGame, speechDuration, tickFishingGame, turnWater, type FishingGame } from './game'
import { HOOK_ORIGIN, WORLD_HEIGHT, WORLD_WIDTH, hookPoint, maxHookLength, type Point } from './model'
import { dialoguePages, idolBubbleAnchor, shiroBubbleAnchor, shouldHighlightIdol, RYO_ENDING_REPLY, RYO_GREETING, SHIRO_DINNER, SHIRO_GREETING, skyResponse, type TimeOfDay } from './presentation'
import { RyoPortrait } from './RyoPortrait'
import { IntroGuide } from './IntroGuide'
import { HeartReplay } from '../../app/HeartMotion'
import { FISHING_WATER_COLORS, nameFontSize, nameWaveAmplitude } from './name-style'
import './fishing.css'

// THESIS: The sea is full of names, but the basket stays empty.
// WORLD: A day/night upper-right pier, deep water, and freely travelling names.
// STORY: Tap the sea to cast; confirm each encounter line before letting go.
// VIEW: Shore dialogue by the portraits, idol dialogue beside the speaking name.
// FORM: User-selected shore portraits; underwater idols remain text, with no modal.

const INTRO_KEY = 'fishing:intro:v1'
const MET_KEY = 'fishing:met:v1'
const TIME_KEY = 'fishing:time-of-day:v1'
const ENDING_KEY = 'fishing:ending:v1'
const HINTS_KEY = 'fishing:hints:v1'
const SHIRO_PORTRAIT = `${import.meta.env.BASE_URL}assets/characters/shiro/white-a.png`
const memory = new Map<string, string>()

function readSaved(key: string) {
  if (memory.has(key)) return memory.get(key)!
  try { return platform.load(key) } catch { return null }
}

function save(key: string, value: string) {
  memory.set(key, value)
  try { platform.save(key, value) } catch { /* This session remains playable without storage. */ }
}

function readMet(): string[] {
  try {
    const parsed: unknown = JSON.parse(readSaved(MET_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

function getSpeechName(game: FishingGame) {
  if (game.speech?.speaker === 'shiro') return '宇都木士郎'
  if (game.speech?.speaker === 'ryo') return '月云了'
  if (game.speech?.speaker === 'idol') return IDOLS.find((idol) => idol.id === game.caughtId)?.name
  return undefined
}

function Fishing({ onExit }: GameScreenProps) {
  const [game] = useState(() => createFishingGame(readSaved(INTRO_KEY) !== '1', readMet(), readSaved(ENDING_KEY) === '1'))
  const [, render] = useState(0)
  const [backgrounded, setBackgrounded] = useState(document.hidden)
  const [stageWidth, setStageWidth] = useState(WORLD_WIDTH)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => readSaved(TIME_KEY) === 'night' ? 'night' : 'day')
  const [hintsEnabled, setHintsEnabled] = useState(() => readSaved(HINTS_KEY) !== '0')
  const [skySpeech, setSkySpeech] = useState<DialogueBeat | null>(null)
  const [shiroGreeting, setShiroGreeting] = useState(false)
  const [ryoGreeting, setRyoGreeting] = useState(false)
  const [reading, setReading] = useState<{ speech: DialogueBeat | null; script: FishingGame['script']; page: number; offset: number }>({ speech: null, script: null, page: 0, offset: 0 })
  const skySpeechRef = useRef<DialogueBeat | null>(null)
  const skySpeechElapsed = useRef(0)
  const shiroGreetingUntil = useRef(0)
  const ryoGreetingUntil = useRef(0)
  const lastTap = useRef(-Infinity)
  const hiddenRef = useRef(document.hidden)
  const reducedRef = useRef(reducedMotion)
  const scene = useRef<SVGSVGElement>(null)
  const fishElements = useRef(new Map<string, SVGGElement>())
  const glyphElements = useRef(new Map<string, SVGTSpanElement[]>())
  const hook = useRef<SVGGElement>(null)
  const line = useRef<SVGLineElement>(null)
  const guide = useRef<SVGLineElement>(null)
  const ryoMotion = useRef<SVGGElement>(null)
  const shiroMotion = useRef<SVGGElement>(null)
  const rodMotion = useRef<SVGPathElement>(null)
  const speechBubble = useRef<HTMLButtonElement>(null)
  const seaInput = useRef<HTMLButtonElement>(null)
  const latestRevision = useRef(-1)
  const isEnding = game.phase === 'ending'
  const ended = game.phase === 'ended'
  const introGuide = game.phase === 'intro' ? game.speech?.guideTarget : undefined
  const sceneTime = ended ? 'night' : isEnding ? 'sunset' : timeOfDay
  const fontSize = Math.max(14, Math.min(15, stageWidth * 0.0385))
  const nameSize = nameFontSize(stageWidth)
  const halfNameWidth = Math.max(38, nameSize * 2.5 + 7)
  const measureText = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (context) context.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`
    return (text: string) => context?.measureText(text).width ?? Array.from(text).length * fontSize
  }, [fontSize])

  const maxBubbleWidth = useCallback((speech: DialogueBeat) => {
    if (speech.speaker === 'shiro' && game.shiroPosition) return shiroBubbleAnchor(getShiroPose(game)).width / WORLD_WIDTH * stageWidth
    const fish = speech.speaker === 'idol' ? game.fishes.find((item) => item.id === game.caughtId) : undefined
    if (fish) return idolBubbleAnchor(fish, undefined, halfNameWidth).width / WORLD_WIDTH * stageWidth
    return stageWidth * (speech.location === 'water' ? 0.48 : 0.55)
  }, [game, stageWidth, halfNameWidth])

  const paginateSpeech = useCallback((speech: DialogueBeat, text = speech.text) => dialoguePages(text, {
    maxWidth: maxBubbleWidth(speech) - 26,
    maxLines: speech.speaker === 'idol' || speech.location === 'water' ? 3 : 2,
    measure: measureText,
  }), [maxBubbleWidth, measureText])

  useEffect(() => {
    const element = scene.current
    if (!element) return
    const updateWidth = () => setStageWidth(element.getBoundingClientRect().width)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const dismissShiroGreeting = useCallback(() => {
    if (!shiroGreetingUntil.current) return
    shiroGreetingUntil.current = 0
    setShiroGreeting(false)
  }, [])

  const dismissRyoGreeting = useCallback(() => {
    if (!ryoGreetingUntil.current) return
    ryoGreetingUntil.current = 0
    setRyoGreeting(false)
  }, [])

  const sync = useCallback(() => {
    if (latestRevision.current !== game.revision) {
      if (game.phase === 'ending' ? game.shiroExiting || Boolean(game.shiroPosition) : !canGreetShiro(game)) dismissShiroGreeting()
      if (!canGreetRyo(game)) dismissRyoGreeting()
      latestRevision.current = game.revision
      if (game.introCompleted) save(INTRO_KEY, '1')
      save(MET_KEY, JSON.stringify(game.metIds))
      save(ENDING_KEY, game.phase === 'ended' ? '1' : '0')
      render((value) => value + 1)
    }
  }, [game, dismissShiroGreeting, dismissRyoGreeting])

  useEffect(() => {
    if (game.phase !== 'ending' && game.phase !== 'ended') return
    skySpeechRef.current = null
    skySpeechElapsed.current = 0
    setSkySpeech(null)
    dismissShiroGreeting()
    dismissRyoGreeting()
    if (game.phase === 'ended') {
      setTimeOfDay('night')
      save(TIME_KEY, 'night')
    }
  }, [game.phase, dismissShiroGreeting, dismissRyoGreeting])

  const act = useCallback((target?: Point) => {
    if (hiddenRef.current || performance.now() - lastTap.current < 350) return
    if (game.phase === 'aiming' || (game.phase === 'ending' && game.endingFishing === 'aiming')) {
      if (castLine(game, target)) lastTap.current = performance.now()
    } else if (isWaitingForTap(game) && canAdvanceSpeech(game)) {
      const sameSpeech = reading.speech === game.speech && reading.script === game.script
      const offset = sameSpeech ? reading.offset : 0
      const page = sameSpeech ? reading.page : 0
      const pages = game.phase === 'intro' || game.speech!.location === 'narration' ? [game.speech!.text] : paginateSpeech(game.speech!, game.speech!.text.slice(offset))
      if (pages.length > 1) setReading({ speech: game.speech, script: game.script, page: page + 1, offset: offset + pages[0].length })
      else advanceSpeech(game, true)
      lastTap.current = performance.now()
    }
    sync()
  }, [game, paginateSpeech, reading, sync])

  const touchSea = (event: MouseEvent<HTMLButtonElement>) => {
    // Invert the actual SVG transform so CSS sizing and mobile scaling cannot skew aiming.
    const matrix = scene.current?.getScreenCTM()
    if (event.detail === 0 || !matrix) { act(); return }
    const target = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    act({ x: target.x, y: target.y })
  }

  const stirSea = () => {
    if (hiddenRef.current) return
    if (turnWater(game)) sync()
  }

  const touchSky = () => {
    if (hiddenRef.current || game.phase === 'ended') return
    if (game.phase === 'ending') { touchShiro(); return }
    dismissShiroGreeting()
    dismissRyoGreeting()
    const response = skyResponse(timeOfDay)
    skySpeechRef.current = response
    skySpeechElapsed.current = 0
    setSkySpeech(response)
  }

  const touchShiro = () => {
    if (hiddenRef.current || ryoGreetingUntil.current > 0) return
    const endingResponse = game.phase === 'ending'
    if (endingResponse ? game.shiroExiting || game.shiroAway || Boolean(game.shiroPosition) : !canGreetShiro(game, Boolean(skySpeechRef.current) || shiroGreetingUntil.current > 0)) return
    shiroGreetingUntil.current = game.time + speechDuration(endingResponse ? SHIRO_DINNER : SHIRO_GREETING) / 1000
    setShiroGreeting(true)
  }

  const touchRyo = () => {
    if (hiddenRef.current || !canGreetRyo(game, Boolean(skySpeechRef.current) || shiroGreetingUntil.current > 0)) return
    const response = game.phase === 'ending' ? RYO_ENDING_REPLY : RYO_GREETING
    ryoGreetingUntil.current = game.time + speechDuration(response) / 1000
    setRyoGreeting(true)
  }

  const switchTime = () => {
    if (hiddenRef.current || game.phase === 'ending' || game.phase === 'ended') return
    const next = timeOfDay === 'day' ? 'night' : 'day'
    setTimeOfDay(next)
    save(TIME_KEY, next)
  }

  const replay = () => {
    if (hiddenRef.current || !restartFishingGame(game)) return
    skySpeechRef.current = null
    skySpeechElapsed.current = 0
    setSkySpeech(null)
    dismissShiroGreeting()
    dismissRyoGreeting()
    setReading({ speech: null, script: null, page: 0, offset: 0 })
    setTimeOfDay('day')
    save(TIME_KEY, 'day')
    lastTap.current = performance.now()
    sync()
    requestAnimationFrame(() => seaInput.current?.focus({ preventScroll: true }))
  }

  const toggleHints = () => {
    if (hiddenRef.current || game.phase === 'ending' || game.phase === 'ended') return
    const next = !hintsEnabled
    setHintsEnabled(next)
    save(HINTS_KEY, next ? '1' : '0')
  }

  useEffect(() => {
    let frame = 0
    let last = 0
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => {
      reducedRef.current = media.matches
      setReducedMotion(media.matches)
    }
    const onVisibility = () => {
      hiddenRef.current = document.hidden
      setBackgrounded(document.hidden)
      last = 0
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.target === seaInput.current && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        if (!hiddenRef.current && !game.waterTurnover && (game.phase === 'aiming' || (game.phase === 'ending' && game.endingFishing === 'aiming'))) {
          const next = game.angle + (event.key === 'ArrowRight' ? 0.12 : -0.12)
          const angle = Math.atan2(Math.sin(next), Math.cos(next))
          if (maxHookLength(angle) > 0) game.angle = angle
        }
        return
      }
      if ((event.key === ' ' || event.key === 'Enter') && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        act()
      }
    }
    media.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    const paint = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      if (!hiddenRef.current) {
        const skyLine = skySpeechRef.current
        if (skyLine) {
          // Sky feedback has its own clock; casting and dialogue keep running alongside it.
          skySpeechElapsed.current += dt * 1000
          if (skySpeechElapsed.current >= speechDuration(skyLine)) {
            skySpeechRef.current = null
            setSkySpeech(null)
          }
        }
        tickFishingGame(game, dt, reducedRef.current)
        if (shiroGreetingUntil.current && game.time >= shiroGreetingUntil.current) dismissShiroGreeting()
        if (ryoGreetingUntil.current && game.time >= ryoGreetingUntil.current) dismissRyoGreeting()
      }
      for (const fish of game.fishes) {
        const element = fishElements.current.get(fish.id)
        const attached = fish.id === game.caughtId && !game.hasLeft
        const tilt = reducedRef.current || attached ? 0 : Math.sin(game.time * 0.8 + fish.phase) * (fish.style === 'hostile' ? 1.5 : 1)
        element?.setAttribute('transform', `translate(${fish.x.toFixed(2)} ${fish.y.toFixed(2)}) rotate(${tilt.toFixed(2)})`)
        element?.setAttribute('data-x', fish.x.toFixed(2))
        element?.setAttribute('data-y', fish.y.toFixed(2))
        const glyphs = glyphElements.current.get(fish.id) ?? []
        const amplitude = nameWaveAmplitude(fish.style, reducedRef.current || attached)
        const frequency = fish.style === 'hostile' ? 3.3 : fish.style === 'hesitant' ? 1.2 : 2
        glyphs.forEach((glyph, index) => glyph?.setAttribute('y', String(4 + Math.sin(game.time * frequency + fish.phase + index * 0.9) * amplitude)))
      }
      const speakingFish = game.speech?.speaker === 'idol'
        ? game.fishes.find((fish) => fish.id === game.caughtId) : undefined
      const movingShiro = game.speech?.speaker === 'shiro' && game.shiroPosition ? getShiroPose(game) : null
      const bubble = speechBubble.current
      if ((speakingFish || movingShiro) && bubble && bubble.dataset.speaker === game.speech?.speaker) {
        const anchor = movingShiro ? shiroBubbleAnchor(movingShiro, Number(bubble.dataset.bubbleWidth)) : idolBubbleAnchor(speakingFish!, Number(bubble.dataset.bubbleWidth), halfNameWidth)
        bubble.style.left = `${anchor.left / WORLD_WIDTH * 100}%`
        bubble.style.top = `${anchor.top / WORLD_HEIGHT * 100}%`
        bubble.style.width = `${anchor.width / WORLD_WIDTH * 100}%`
        bubble.style.setProperty('--idol-tail-offset', `${anchor.tailOffset / WORLD_WIDTH * 100}cqi`)
        bubble.dataset.tailSide = anchor.side
      }
      const departure = getDepartureOffset(game)
      const shiroPose = getShiroPose(game)
      shiroMotion.current?.setAttribute('transform', `translate(${shiroPose.x - 357} ${shiroPose.y - 120}) rotate(${reducedRef.current ? 0 : shiroPose.rotation} 357 120)`)
      shiroMotion.current?.setAttribute('data-x', String(shiroPose.x))
      shiroMotion.current?.setAttribute('data-y', String(shiroPose.y))
      ryoMotion.current?.setAttribute('transform', `translate(${departure} 0)`)
      rodMotion.current?.setAttribute('transform', `translate(${departure} 0)`)
      hook.current?.setAttribute('transform', `translate(${game.hook.x + departure} ${game.hook.y})`)
      line.current?.setAttribute('x1', String(HOOK_ORIGIN.x + departure))
      line.current?.setAttribute('x2', String(game.hook.x + departure))
      line.current?.setAttribute('y2', String(game.hook.y))
      const hint = hookPoint(game.angle, 96)
      guide.current?.setAttribute('x2', String(hint.x))
      guide.current?.setAttribute('y2', String(hint.y))
      scene.current?.setAttribute('data-angle', String(game.angle))
      sync()
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => {
      cancelAnimationFrame(frame)
      media.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [act, game, sync, dismissShiroGreeting, dismissRyoGreeting, halfNameWidth])

  const speech = game.speech
  const speaker = getSpeechName(game)
  const isIntro = game.phase === 'intro'
  const floatingText = isIntro || speech?.location === 'narration'
  const sameSpeech = reading.speech === speech && reading.script === game.script
  const unreadText = (speech?.text ?? '').slice(sameSpeech ? reading.offset : 0)
  const pages = speech ? floatingText ? [speech.text] : paginateSpeech(speech, unreadText) : ['']
  const pageIndex = sameSpeech ? reading.page : 0
  const manualSpeech = isWaitingForTap(game)
  const mood = skySpeech?.mood ?? game.mood ?? 'neutral'
  const night = sceneTime === 'night'
  const sunset = sceneTime === 'sunset'
  const waterColors = FISHING_WATER_COLORS[sceneTime]
  const wakingShiro = speech?.event === 'wake-shiro'
  const tailAction = speech?.event === 'pull-shiro' ? 'pull' : speech?.event === 'dunk-shiro' ? 'dunk' : undefined
  const leavingTogether = speech?.event === 'leave-together' || ended
  const shiroAtShore = !game.shiroPosition && !game.shiroExiting && !game.shiroAway
  const canCast = !game.waterTurnover && (game.phase === 'aiming' || (isEnding && game.endingFishing === 'aiming'))
  const speakingFish = speech?.speaker === 'idol' ? game.fishes.find((fish) => fish.id === game.caughtId) : undefined
  const speakingShiro = speech?.speaker === 'shiro' && game.shiroPosition ? getShiroPose(game) : null
  const bubbleWidth = speech ? Math.min(maxBubbleWidth(speech), Math.max(80, measureText(pages[0]) + 26, measureText(speaker ?? '') + 24)) : 80
  const widthInWorld = bubbleWidth / stageWidth * WORLD_WIDTH
  const idolAnchor = speakingShiro ? shiroBubbleAnchor(speakingShiro, widthInWorld) : speakingFish ? idolBubbleAnchor(speakingFish, widthInWorld, halfNameWidth) : undefined
  const speechClass = idolAnchor ? 'from-idol' : speech?.location === 'offscreen' ? 'from-offscreen' : speech?.location === 'water' ? 'from-water' : 'from-shore'
  const speechStyle = idolAnchor ? {
    left: `${idolAnchor.left / WORLD_WIDTH * 100}%`,
    top: `${idolAnchor.top / WORLD_HEIGHT * 100}%`,
    width: `${idolAnchor.width / WORLD_WIDTH * 100}%`,
    '--idol-tail-offset': `${idolAnchor.tailOffset / WORLD_WIDTH * 100}cqi`,
  } as CSSProperties : { width: `${bubbleWidth}px` }
  const actionLabel = isWaitingForTap(game) ? speech?.text ? '继续对白' : '放回水中' : canCast ? isEnding ? '向宇都木士郎下钩' : '下钩' : '等待收线'

  return (
    <main className={`fishing-screen${backgrounded ? ' is-background' : ''}${reducedMotion ? ' reduced-motion' : ''}`} data-phase={game.phase} data-time-of-day={sceneTime} data-ending-fishing={game.endingFishing} data-turning-water={Boolean(game.waterTurnover)}>
      <header className="fishing-header" inert={ended}>
        <button type="button" onClick={onExit} aria-label="返回游戏大厅">← 返回</button>
      </header>

      <div className="fishing-stage" inert={ended} data-guide={introGuide} style={{ '--fishing-dialogue-font': `${fontSize}px` } as CSSProperties}>
        <svg ref={scene} className="fishing-world" viewBox="0 0 390 600" aria-hidden="true" data-casts={game.casts}>
          <defs>
            <linearGradient id="fishing-soft-water" x1="0" y1="0" x2=".25" y2="1">
              <stop offset="0%" stopColor={night ? '#7889b2' : sunset ? '#cba9b2' : '#96c9ba'} stopOpacity="0" />
              <stop offset="42%" stopColor={night ? '#7889b2' : sunset ? '#cba9b2' : '#96c9ba'} stopOpacity=".18" />
              <stop offset="100%" stopColor={night ? '#45618a' : sunset ? '#756385' : '#34838a'} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fishing-depth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={waterColors[0]} />
              <stop offset="54%" stopColor={waterColors[1]} />
              <stop offset="100%" stopColor={waterColors[2]} />
            </linearGradient>
            <linearGradient id="fishing-sunset" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dfb1ab" /><stop offset="100%" stopColor="#f6c98d" />
            </linearGradient>
          </defs>
          <rect width="390" height="600" fill={night ? '#192039' : '#d8ece9'} />
          {sunset ? <rect width="390" height="206" fill="url(#fishing-sunset)" /> : null}
          {night ? <g fill="#d5ddf1"><circle cx="129" cy="43" r="1.5" /><circle cx="220" cy="62" r="1" /><circle cx="320" cy="24" r="1.5" /><circle cx="84" cy="126" r="1" /><circle cx="179" cy="134" r="1.5" /></g> :
            <path d="M139 60h37m-24 6h39M34 118h51m-66 7h25" stroke="#eff8f2" strokeWidth="5" strokeLinecap="round" />}
          <path d="M0 174Q90 151 166 174T390 163V206H0Z" fill={night ? '#3d4f73' : sunset ? '#b09396' : '#95c6c8'} />
          <path className="fishing-surface" d="M0 184Q25 179 50 184T100 184T150 184T200 184T250 184T300 184T350 184T400 184V610H0Z" fill="url(#fishing-depth)" />
          <g className="fishing-water-veils" fill="url(#fishing-soft-water)" pointerEvents="none">
            <path d="M-50 221C40 198 89 261 183 252S335 216 432 251L432 380C320 365 240 396 144 345S20 336-50 360Z" />
            <path d="M-42 438C54 482 99 415 207 397S354 443 433 398L433 568C339 598 291 523 179 546S36 566-42 535Z" opacity=".75" />
          </g>
          <g className="fishing-light" fill="#b7e5dc" opacity=".035" pointerEvents="none">
            <path d="M80 193l40 330h52L120 193z" />
            <path d="M175 193l15 290h30L204 193z" />
          </g>
          <path d="M0 187Q25 181 50 187T100 187T150 187T200 187T250 187" fill="none" stroke="#d4eeeb" strokeWidth="2" opacity=".7" />
          {game.waterTurnover ? <g className="fishing-turnover-wake" fill="none" stroke="#cce8e4" strokeWidth="1.5">
            <path d="M-20 206q65-16 130 0t130 0 130 0 130 0" />
            <path d="M-20 218q65-16 130 0t130 0 130 0 130 0" opacity=".5" />
          </g> : null}

          <g className="fishing-pier">
            <path d="M279 168h111v44l-18-9-23 8-27-7-43-3z" fill="#9b9377" />
            <path d="M281 191v42m69-29v24m28-28v28" stroke="#817b65" strokeWidth="7" />
            <path d="M270 162h120v17H270z" fill="#d8c9a4" />
            <path d="M270 163h120M282 172h31m9 0h47" stroke="#f3e4c5" strokeWidth="3" />
          </g>

          <g ref={ryoMotion} className={`fishing-ryo mood-${mood}${game.ryoExiting && !leavingTogether ? ' is-exiting' : ''}`} data-character="ryo">
            <RyoPortrait active={game.shiroAway || wakingShiro} fast={wakingShiro} action={tailAction} />
            <text className="fishing-mood-mark" x="286" y="65" textAnchor="middle">
              {mood === 'shy' ? '///' : mood === 'happy' ? '♪' : mood === 'angry' ? '!' : mood === 'stunned' || mood === 'nervous' ? '…' : ''}
            </text>
          </g>
          <path ref={rodMotion} visibility={ended ? 'hidden' : 'visible'} d="M286 151Q256 112 236 147" stroke="#695838" strokeWidth="3" fill="none" strokeLinecap="round" />
          <g className="fishing-basket" transform="translate(363 171)">
            <path d="M-15 0h30l3 27q-18 7-36 0z" fill="#aa754b" stroke="#704e36" strokeWidth="1.5" />
            <ellipse cy="0" rx="16" ry="4" fill="#69513d" stroke="#d3a676" strokeWidth="2" />
            <rect x="-13" y="5" width="26" height="21" rx="2" fill="#f1e6c8" />
            <text textAnchor="middle" y="14" fontSize="8" fill="#604f35">鱼篮</text>
            <text textAnchor="middle" y="24" fontSize="12" fontWeight="800" fill="#604f35" data-testid="basket-count">{basketCount(game)}</text>
          </g>

          <line ref={guide} className="fishing-aim" x1={HOOK_ORIGIN.x} y1={HOOK_ORIGIN.y} x2="195" y2="243" stroke="#fff4c7" strokeDasharray="2 6" opacity={canCast ? 0.55 : 0} />
          <line ref={line} visibility={ended ? 'hidden' : 'visible'} x1={HOOK_ORIGIN.x} y1={HOOK_ORIGIN.y} x2={game.hook.x} y2={game.hook.y} stroke="#fff8da" strokeWidth="1.4" />
          <g ref={hook} visibility={ended ? 'hidden' : 'visible'} className="fishing-hook" transform={`translate(${game.hook.x} ${game.hook.y})`}>
            <path d="M0-3v9q0 7-6 7t-6-7v-2l4 3" stroke="#ffdf8b" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle r="2.5" fill="#fff1ba" />
          </g>

          <g className={`fishing-names${floatingText ? ' during-intro' : ''}`}>
            {IDOLS.map((idol, index) => {
              const initial = game.fishes[index]
              const caught = game.caughtId === idol.id && !game.hasLeft
              const hinted = shouldHighlightIdol(idol.id, game.metIds, hintsEnabled)
              return (
                <g key={idol.id} ref={(element) => { if (element) fishElements.current.set(idol.id, element); else fishElements.current.delete(idol.id) }}
                  className={`fishing-name${caught ? ' is-caught' : ''}`} data-idol={idol.id} data-affinity={idol.affinity} data-hinted={hinted}
                  style={{ color: idol.color }}
                  transform={`translate(${initial.x} ${initial.y})`}>
                  <path className="fishing-name-wake" d="M-15 12q7.5-2 15 0t15 0" fill="none" />
                  {hinted ? <path className="fishing-unmet-wake" d="M-8 16q4-1.5 8 0t8 0" fill="none" /> : null}
                  <text textAnchor="middle" fontSize={nameSize} fontWeight="700" fill="currentColor">
                    {Array.from(idol.name).map((char, charIndex, chars) => <tspan key={charIndex} x={(charIndex - (chars.length - 1) / 2) * nameSize * 0.98} y="4" ref={(element) => {
                      if (!element) return
                      const glyphs = glyphElements.current.get(idol.id) ?? []
                      glyphs[charIndex] = element
                      glyphElements.current.set(idol.id, glyphs)
                    }}>{char}</tspan>)}
                  </text>
                </g>
              )
            })}
          </g>
          <g className="fishing-seabed" fill="none" stroke="#8ab8b6" strokeWidth="2" opacity=".28">
            <path d="M28 600q-12-17-4-29m4 29q13-24 4-40m330 40q-7-27 1-38m0 32q11-13 8-28" />
            <path d="M0 596q65-10 129 0t131-1 130 0" strokeWidth="1" />
          </g>
          <g ref={shiroMotion} data-character="shiro" data-hooked={game.shiroHooked}>
            <g className={`fishing-shiro${game.shiroAway ? ' is-away' : ''}${game.shiroSleeping ? ' is-sleeping' : ''}${wakingShiro ? ' is-waking' : ''}`}>
              <svg x="328" y="76" width="61" height="88" viewBox="390 90 558 801" preserveAspectRatio="xMidYMax meet">
                <image href={SHIRO_PORTRAIT} x="0" y="0" width="1280" height="960" />
              </svg>
              {game.shiroSleeping ? <text className="fishing-sleep-mark" x="356" y="70" textAnchor="middle">z z</text> : null}
            </g>
          </g>
        </svg>

        <button ref={seaInput} type="button" className="fishing-sea-input" onClick={touchSea} disabled={backgrounded || ended || Boolean(introGuide) || Boolean(game.waterTurnover)} aria-label={actionLabel} data-testid="fishing-action" />
        <button type="button" className="fishing-sky-body" onClick={touchSky} disabled={backgrounded || ended || Boolean(introGuide) || (sunset && !shiroAtShore)} aria-label={sunset ? '触碰灰色兔子太阳' : night ? '触碰紫色狐狸月亮' : '触碰 ZERO 太阳'}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="29" fill={night ? '#f5ecc8' : '#f8e7ae'} />
            {sunset ? <g fill="#d1d1d1" stroke="#797979" strokeWidth="1.7">
              <ellipse cx="25" cy="22" rx="5" ry="13" transform="rotate(-10 25 22)" />
              <ellipse cx="39" cy="22" rx="5" ry="13" transform="rotate(10 39 22)" />
              <ellipse cx="32" cy="39" rx="18" ry="15" />
              <path d="M21 37h5m12 0h5" strokeLinecap="round" fill="none" />
              <path d="m30 42 2 2 2-2m-2 2q-4 5-7 1m7-1q4 5 7 1" fill="none" strokeLinecap="round" />
            </g> : night ? <g>
              <circle cx="18" cy="18" r="4" fill="#ded3b3" />
              <circle cx="48" cy="42" r="5" fill="#ded3b3" />
              <path d="M16 37 15 17 28 26 36 26 49 17 48 37 32 49Z" fill="#a68bd0" stroke="#5b3c86" strokeWidth="2" strokeLinejoin="round" />
              <path d="M19 38 26 36 32 46 38 36 45 38 32 49Z" fill="#e8dcf2" />
              <path d="m22 33 5 2m10 0 5-2" stroke="#54336e" strokeWidth="2" strokeLinecap="round" />
              <path d="m29 40 3 3 3-3Z" fill="#54336e" />
            </g> : <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="700" fill="#705321">ZERO</text>}
          </svg>
        </button>
        <button type="button" className="fishing-count" onClick={toggleHints} aria-pressed={hintsEnabled}
          disabled={backgrounded || isEnding || ended || Boolean(introGuide)} aria-label={`未钓过提示，已遇见 ${game.metIds.length} 位，共 16 位`}
          title={hintsEnabled ? '隐藏未钓过提示' : '显示未钓过提示'}>
          <svg className="fishing-hint-mark" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" />
          </svg>
          {game.metIds.length}<span>/16</span>
        </button>
        {!isEnding && !ended ? <button type="button" className="fishing-turn-water" onClick={stirSea}
          disabled={backgrounded || game.phase !== 'aiming' || Boolean(game.script || game.waterTurnover)} aria-label="毁灭偶像，让深处的名字浮上来" aria-busy={Boolean(game.waterTurnover)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9q4-5 9 0t9 0M3 16q4-5 9 0t9 0M18 4l3 5-5 2" />
          </svg>毁灭偶像
        </button> : null}
        <button type="button" className="fishing-time-toggle" onClick={switchTime} disabled={backgrounded || isEnding || ended || Boolean(introGuide)} aria-label={sunset ? '当前为夕阳' : night ? '切换到白天' : '切换到夜晚'}>{sunset ? '夕阳' : night ? '☀ 白天' : '☾ 夜晚'}</button>
        <button type="button" className="fishing-shiro-input" onClick={touchShiro} disabled={backgrounded || ryoGreeting || (isEnding ? !shiroAtShore : !canGreetShiro(game, Boolean(skySpeech) || shiroGreeting))} aria-label="和宇都木士郎打招呼" />
        <button type="button" className="fishing-ryo-input" onClick={touchRyo} disabled={backgrounded || !canGreetRyo(game, Boolean(skySpeech) || shiroGreeting)} aria-label="和月云了打招呼" />

        <div className="fishing-announcement" aria-live="polite" aria-atomic="true">
          {speech?.text && !introGuide ? floatingText ? (
            <button type="button" onClick={() => act()} disabled={backgrounded} key={`${game.script?.kind}-${game.script?.index}`} className="fishing-intro" aria-description="继续">
              <p>{speech.text}</p>
              <span className="fishing-next" aria-hidden="true"><span className="fishing-continue-mark" /></span>
            </button>
          ) : (
            <button ref={speechBubble} type="button" onClick={() => act()} disabled={backgrounded || !manualSpeech} className={`fishing-speech ${speechClass}`} style={speechStyle}
              data-speaker={speech.speaker ?? 'narration'} data-page={pageIndex} data-anchor-id={speakingShiro ? 'shiro' : speakingFish?.id} data-tail-side={idolAnchor?.side} data-playback={manualSpeech ? 'dialogue' : 'line'} data-bubble-width={widthInWorld}
              aria-description={manualSpeech ? '继续对白' : undefined}>
              {speaker ? <span className="fishing-speaker">{speaker}</span> : null}
              <p>{pages[0]}</p>
              {manualSpeech ? <span className="fishing-next" aria-hidden="true"><span className="fishing-continue-mark" /></span> : null}
            </button>
          ) : null}
          {!speech?.text && isWaitingForTap(game) ? <button type="button" className="fishing-silent-confirm" onClick={() => act()} disabled={backgrounded} aria-label="确认放回水中"><span className="fishing-continue-mark" aria-hidden="true" /></button> : null}
        </div>
        {skySpeech ? <div className="fishing-speech fishing-sky-response" role="status" aria-live="polite" aria-atomic="true" data-speaker="ryo" data-playback="line" data-companion-speaker={speech?.speaker}>
          <span className="fishing-speaker">月云了</span>
          <p>{skySpeech.text}</p>
        </div> : null}
        {shiroGreeting ? <div className={`fishing-speech from-shore fishing-shiro-greeting${sunset ? ' is-dinner' : ''}`} role="status" aria-live="polite" aria-atomic="true" data-speaker="shiro" data-playback="line" data-companion-speaker={speech?.speaker}>
          <span className="fishing-speaker">宇都木士郎</span>
          <p>{sunset ? SHIRO_DINNER.text : SHIRO_GREETING.text}</p>
        </div> : null}
        {ryoGreeting ? <div className="fishing-speech fishing-sky-response fishing-ryo-greeting" role="status" aria-live="polite" aria-atomic="true" data-speaker="ryo" data-playback="line" data-companion-speaker={speech?.speaker}>
          <span className="fishing-speaker">月云了</span>
          <p>{isEnding ? RYO_ENDING_REPLY.text : RYO_GREETING.text}</p>
        </div> : null}
        {introGuide ? <IntroGuide target={introGuide} text={speech!.text} disabled={backgrounded} onNext={() => {
          act()
          if (game.phase !== 'intro') requestAnimationFrame(() => seaInput.current?.focus({ preventScroll: true }))
        }} /> : null}
      </div>
      {ended ? <HeartReplay onReplay={replay} onExit={onExit} disabled={backgrounded} /> : null}
      <span className="fishing-sr-only">{ended ? '游戏结束，选择再来一次将从零开始，或选择我不玩了返回大厅。' : '点击场景空白处，朝任意方向出钩；空钩碰到场景边缘后返回。「毁灭偶像」可让深处的名字浮上来。轻点对白继续。聚焦场景后用左右方向键瞄准，空格或回车出钩。'}鱼篮数量为 {basketCount(game)}。</span>
    </main>
  )
}

export const fishingGame: GameDefinition = {
  id: 'idol-fishing',
  title: '钓鱼了了',
  kicker: '海里有熟人，鱼篮没动静',
  description: '一根鱼竿，十六个名字。士郎正在旁边加油。',
  kind: 'mechanic',
  accent: '#79c5bd',
  estimatedTime: '随时来一竿',
  component: Fishing,
}
