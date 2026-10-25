import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from 'react'
import type { GameDefinition, GameScreenProps } from '../../engine/types'
import { chiefLines, clockDisplayAt, createRowing, EVENING_LINES, complaintSeconds, periodAt, row, tickRowing, type Rower } from './model'
import { bankPath, bankX, riverDetails } from './scenery'
import { placeResponse, rowingBounds } from './bubble-layout'
import { BirthdayMoment } from './BirthdayMoment'
import { CALENDAR_EPOCH } from './calendar'
import './rowing.css'


const ASSETS = `${import.meta.env.BASE_URL}assets/characters/`

const MOSAIC_COLORS = ['#a68bc6', '#b4a1c9', '#8f7aa9', '#c1b1d1', '#786783', '#ddd0cd', '#b3a8bd', '#9b8ba9']
function BoatHull() {
  return <>
    <ellipse cy="10" rx="71" ry="109" fill="#143e4d" opacity=".12"/>
    <path d="M0 -111C73 -77 80 17 56 83Q0 112 -56 83C-80 17 -73 -77 0 -111" fill="#9c7961"/>
    <path d="M0 -103C64 -72 70 14 49 77Q0 99 -49 77C-70 14 -64 -72 0 -103" fill="#dfc6a0"/>
    <path d="M0 -87C51 -58 59 10 41 64Q0 84 -41 64C-59 10 -51 -58 0 -87" fill="#ae8f73"/>
    <path d="M0 -72V70M-27 -42V63M27 -42V63" stroke="#c8ab88" strokeWidth="2"/>
    <path d="M-55 -13H55M-51 46H51" stroke="#e6cfa9" strokeWidth="12"/>
  </>
}
function Portrait({ who, active, masked = false }: { who: Rower; active: boolean; masked?: boolean }) {
  const source = who === 'shiro' ? `shiro/white-${active ? 'b' : 'a'}.png` : `ryo/${active ? 'fishing-no-grapes' : 'no-crown-a'}.png`
  const frame = who === 'shiro' ? '390 88 560 810' : active ? '467 190 566 644' : '96 32 162 178'
  const width = who === 'shiro' ? 1280 : active ? 1448 : 300
  const height = who === 'shiro' ? 960 : active ? 1086 : 225
  return <svg viewBox={frame} width="88" height="108" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <image href={ASSETS + source} width={width} height={height} />
    {who === 'ryo' && masked ? <svg className="rowing-face-mosaic" x={active ? 502 : 111} y={active ? 488 : 104} width={active ? 396 : 100} height={active ? 154 : 45} viewBox="0 0 100 40" preserveAspectRatio="none" pointerEvents="none">
      {Array.from({ length: 40 }, (_, i) => <rect key={i} x={i % 10 * 10} y={Math.floor(i / 10) * 10} width="10.1" height="10.1" fill={MOSAIC_COLORS[(i * 7 + Math.floor(i / 10) * 3) % MOSAIC_COLORS.length]} />)}
    </svg> : null}
  </svg>
}

export function RowingGame({ onExit }: GameScreenProps) {
  const [initialGame] = useState(() => {
    // Local review links exercise the real midnight event; production always starts normally.
    const birthday = import.meta.env.DEV ? new URLSearchParams(location.search).get('birthday') : null
    const preview = birthday === 'shiro' || birthday === 'ryo'
    const state = createRowing(Math.random, !preview)
    if (preview) {
      const year = new Date(CALENDAR_EPOCH).getUTCFullYear()
      const midnight = birthday === 'shiro' ? Date.UTC(year, 7, 24) : Date.UTC(year, 8, 9)
      state.minutes = (midnight - CALENDAR_EPOCH - 1000) / 60000
      state.eveningSeen = true
      state.effort = true
      state.couples = []
    }
    return state
  })
  const game = useRef(initialGame)
  const dockOrigin = useRef(initialGame.opening ? initialGame.y : -1000)
  const [, repaint] = useState(0)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [hidden, setHidden] = useState(document.hidden)
  const [size, setSize] = useState({ width: 390, height: 844 })
  const scene = useRef<HTMLElement>(null)
  const responseElement = useRef<HTMLDivElement>(null)
  const [measuredResponse, setMeasuredResponse] = useState({ text: '', width: 0, height: 0 })
  const held = useRef(new Map<string, Rower>())
  const state = game.current
  const period = periodAt(state.minutes)
  const clock = clockDisplayAt(state.minutes)
  const dialogue = state.dialogue === null ? null : EVENING_LINES[state.dialogue]
  const onShore = state.opening === 'ryo' || state.opening === 'shiro' || state.opening === 'boarding'
  const announcement = state.opening === 'guide' ? '点击人物' : state.opening === 'guide-start' ? '开始划船' : null
  const announcementDuration = state.opening === 'guide' ? 2 : 1.8
  const announcementOpacity = reduced ? 1 : Math.max(0, Math.min(1, state.openingAge / .25, (announcementDuration - state.openingAge) / .35))

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    if (scene.current) observer.observe(scene.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    for (const file of ['shiro/white-a.png', 'shiro/white-b.png', 'ryo/no-crown-a.png', 'ryo/fishing-no-grapes.png']) {
      const img = new Image(); img.src = ASSETS + file
    }
    return () => query.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    let frame = 0, previous = 0
    const loop = (now: number) => {
      const blocked = document.hidden || Boolean(scene.current?.closest('[inert]'))
      if (blocked) held.current.clear()
      if (!blocked && previous) {
        tickRowing(game.current, (now - previous) / 1000)
        for (const who of new Set(held.current.values())) row(game.current, who)
        repaint(n => n + 1)
      }
      previous = blocked ? 0 : now
      frame = requestAnimationFrame(loop)
    }
    const release = () => { held.current.clear(); repaint(n => n + 1) }
    const visibility = () => { previous = 0; release(); setHidden(document.hidden) }
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || document.hidden || scene.current?.closest('[inert]')) return
      const who = event.code === 'KeyA' ? 'shiro' : event.code === 'KeyL' ? 'ryo' : null
      if (!who || game.current.opening) return
      event.preventDefault(); held.current.set(`key:${event.code}`, who); row(game.current, who)
    }
    const keyUp = (event: globalThis.KeyboardEvent) => held.current.delete(`key:${event.code}`)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', release)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame); held.current.clear()
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', release)
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp)
    }
  }, [])

  const paddle = (who: Rower) => {
    row(game.current, who)
    repaint(n => n + 1)
  }
  const inputs = (who: Rower) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || game.current.opening) return
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
      held.current.set(`pointer:${event.pointerId}`, who); paddle(who)
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => held.current.delete(`pointer:${event.pointerId}`),
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => held.current.delete(`pointer:${event.pointerId}`),
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => held.current.delete(`pointer:${event.pointerId}`),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault(); if (event.repeat) return
      held.current.set(`key:${event.code}`, who); paddle(who)
    },
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); held.current.delete(`key:${event.code}`) }
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0) paddle(who) },
  })
  const heading = state.heading * 180 / Math.PI
  const theta = reduced ? Math.round(heading / 30) * 30 : heading
  const radians = theta * Math.PI / 180
  const boatScale = Math.max(180, Math.min(230, size.width * .48)) / 220
  const seats = (['shiro', 'ryo'] as const).map(who => {
    const x = who === 'shiro' ? -35 : 35
    const depth = Math.sin(radians) * x + Math.cos(radians) * 20
    return { who, depth,
      x: (state.x - state.cameraX) / 390 * size.width + (Math.cos(radians) * x - Math.sin(radians) * 20) * boatScale,
      y: 50 + (state.y - state.cameraY) / 700 * (size.height - 50) + depth * boatScale,
    }
  })
  const boardingProgress = state.opening === 'boarding' ? reduced ? 1 : Math.min(1, state.openingAge / 1.2) : 0
  const boardingEase = boardingProgress * boardingProgress * (3 - 2 * boardingProgress)
  // Feet start 20px inside the wooden dock, then interpolate to the unchanged boat seats.
  const shoreSeats = seats.map(seat => ({ ...seat, x: seat.x - 35 * (1 - boardingEase), y: seat.y - 65 * (1 - boardingEase) }))
  const dockY = 50 + (dockOrigin.current - state.cameraY) / 700 * (size.height - 50) - 20 * boatScale - 85
  const openingSpeaker = shoreSeats[state.opening === 'ryo' ? 1 : 0]
  const openingLeft = Math.max(16, Math.min(size.width - 236, openingSpeaker.x - 110))
  const speakerSeat = seats[dialogue?.who === 'ryo' ? 1 : 0]
  const bubbleWidth = Math.min(300, size.width * .64)
  const bubbleLeft = Math.max(16, Math.min(size.width - bubbleWidth - 16, speakerSeat.x - bubbleWidth / 2))
  const headTop = Math.min(...seats.map(seat => seat.y)) - 108 * boatScale
  const otherSeat = seats[dialogue?.who === 'ryo' ? 0 : 1]
  const estimatedBubbleHeight = 62 + Math.ceil((dialogue?.text.length ?? 0) * 16 / (bubbleWidth - 40)) * 26
  const roomBelow = Math.max(...seats.map(seat => seat.y)) + 24 + estimatedBubbleHeight < size.height - 126
  const bubbleBelow = roomBelow && (headTop < 210 || speakerSeat.y > otherSeat.y + 16)
  const bubbleY = bubbleBelow ? Math.max(...seats.map(seat => seat.y)) + 24 : headTop - 18
  const details = riverDetails(state.cameraY)
  const encounter = state.encounter
  const visit = state.chiefVisit
  const chiefLine = visit && !visit.done ? chiefLines(visit.surname)[visit.line] : null
  const dailyChat = state.daily.chat
  const dailyLine = dailyChat?.lines[dailyChat.line]
  const calendarChat = state.calendar.chat, calendarLine = calendarChat?.lines[calendarChat.line]
  const coupleChat = state.coupleChat, coupleLine = coupleChat?.lines[coupleChat.line]
  const complaining = Boolean(encounter && encounter.age < complaintSeconds(encounter))
  const couple = state.couples.find(boat => boat.id === (encounter?.boatId ?? (chiefLine ? visit?.boatId : coupleChat?.boatId)))
  const response = calendarLine?.text ?? (encounter ? complaining ? encounter.complaint : encounter.apology : dailyLine?.text ?? chiefLine?.text ?? coupleLine ?? '')
  const responseWho = calendarLine?.who ?? (encounter ? complaining ? 'couple' : 'shiro' : dailyLine?.who ?? chiefLine?.who ?? (coupleLine ? 'couple' : undefined))
  const responseSpeaker = calendarLine ? calendarLine.who==='ryo'?'月云了':'宇都木士郎' : encounter ? complaining ? '周围的情侣' : '宇都木士郎' : dailyLine ? dailyLine.who === 'ryo' ? '月云了' : '宇都木士郎' : chiefLine?.speaker ?? (coupleLine ? '周围的情侣' : '')
  const responseSeat = seats[responseWho === 'ryo' ? 1 : 0]
  const encounterAnchor = responseWho === 'couple' && couple ? { x: (couple.x - state.cameraX) / 390 * size.width, y: 50 + (couple.y - state.cameraY) / 700 * (size.height - 50) - 110 * boatScale } : { x: responseSeat.x, y: responseSeat.y - 108 * boatScale }
  const responseWidth = Math.min(300, size.width - 32, Math.max(112, response.length * 16 + 44, responseSpeaker.length * 12 + 44))
  const responseHeight = measuredResponse.text === response && measuredResponse.width === responseWidth ? measuredResponse.height : 62 + Math.ceil(response.length * 16 / (responseWidth - 40)) * 26
  const protectedBoat = rowingBounds({ x: (state.x - state.cameraX) / 390 * size.width, y: 50 + (state.y - state.cameraY) / 700 * (size.height - 50) }, radians, boatScale, seats)
  const responsePosition = placeResponse(size, encounterAnchor, protectedBoat, responseWidth, responseHeight)
  useLayoutEffect(() => {
    const element = responseElement.current
    if (!element) return
    const measure = () => {
      const height = element.getBoundingClientRect().height
      setMeasuredResponse(previous => previous.text === response && previous.width === responseWidth && previous.height === height ? previous : { text: response, width: responseWidth, height })
    }
    measure()
    const observer = new ResizeObserver(measure); observer.observe(element)
    return () => observer.disconnect()
  }, [response, responseWidth, Boolean(dialogue)])

  return <main ref={scene} className="rowing-screen" data-period={period} data-effort={state.effort} data-hidden={hidden} data-opening={state.opening ?? 'done'}
    data-spinning={Math.abs(state.spin) > 1.05} data-heading={state.heading.toFixed(2)} data-taps={state.taps}
    data-camera={state.cameraY.toFixed(1)} data-collisions={state.collisions} data-shiro-strokes={state.shiroStrokes} data-ryo-strokes={state.ryoStrokes}
    style={{ '--row-angle': `${theta}deg` } as CSSProperties}>
    <header className="rowing-header">
      <button className="rowing-back" onClick={onExit} aria-label="返回游戏大厅">← 返回</button>
      <div className="rowing-clock" aria-label={`${clock.date} ${clock.time}`}>
        <span>{clock.date}</span>
        <time dateTime={clock.dateTime}>{clock.time}</time>
      </div>
    </header>
    <div className="rowing-celestial" aria-hidden="true"><span /></div>
    <svg className="rowing-water" viewBox="0 0 390 700" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="rowing-water-light" x2=".9" y2="1"><stop stopColor="white" stopOpacity=".14"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient></defs>
      {[false, true].map(right => <g key={String(right)}>
        <path className="rowing-bank" d={bankPath(state.cameraY, right, 0, state.minutes, state.cameraX)} />
        <path className="rowing-bank-inner" d={bankPath(state.cameraY, right, 12, state.minutes, state.cameraX)} />
      </g>)}
      <path d="M36 -180L275 880H350L110 -180Z" fill="url(#rowing-water-light)"/>
      {details.map(p => <g key={p.id}>
        <path className="rowing-waterline" d={`M${p.x} ${p.y}q12 -5 26 0t22 0`} />
        <g className="rowing-reeds" transform={`translate(${(bankX(p.y + state.cameraY, p.right, state.minutes) - state.cameraX) + (p.right ? 9 : -9)} ${p.y + 30})`}>
          <path d="M0 0Q-9 -11 -7 -23M0 0Q1 -16 6 -28M0 0Q10 -6 13 -17" />
          {p.id % 3 === 0 ? <><circle cx="-7" cy="-24" r="3"/><circle cx="6" cy="-28" r="3"/></> : null}
        </g>
      </g>)}
    </svg>
    <div className="rowing-dock" aria-hidden="true" style={{ top: dockY, width: size.width / 2 + 35 * boatScale + 18 }}><i/><i/><i/></div>
    <svg className="rowing-stage" viewBox="0 0 390 700" preserveAspectRatio="none" aria-hidden="true">
      {state.trail.map((p, i) => <ellipse key={i} cx={p.x - state.cameraX} cy={p.y - state.cameraY} rx={5 + p.age * 6} ry={2 + p.age * 2} className="rowing-trail" opacity={Math.max(0, (1 - p.age / 3) * .18)} />)}
    </svg>
    <div className="rowing-boat-layer rowing-couples" aria-hidden="true">
      {state.couples.map(boat => {
        const angle = boat.heading * 180 / Math.PI, stroke = reduced || boat.stopped ? 0 : Math.sin(boat.strokePhase ?? 0) * 24
        return <div key={boat.id} className="rowing-boat rowing-couple" data-boat={boat.id} data-chief={boat.chiefSurname} data-style={boat.motion?.style} data-departing={boat.departing || false} data-stopped={boat.stopped || false}
          style={{ left: `${(boat.x - state.cameraX) / 390 * 100}%`, top: `${(boat.y - state.cameraY) / 700 * 100}%`, transform: `translate(-50%, -50%) rotate(${angle}deg)` }}>
          <svg className="rowing-hull" viewBox="-110 -125 220 250"><BoatHull/>
            <g className="rowing-oar rowing-oar-left" style={{ transform: `rotate(${stroke - 12}deg)` }}><path d="M-22 3L-91 26" stroke="#5e544f" strokeWidth="4" strokeLinecap="round"/><path d="M-77 20L-105 30" stroke="#e8d4b3" strokeWidth="11" strokeLinecap="round"/></g>
            <g className="rowing-oar rowing-oar-right" style={{ transform: `rotate(${-stroke + 12}deg)` }}><path d="M22 3L91 26" stroke="#5e544f" strokeWidth="4" strokeLinecap="round"/><path d="M77 20L105 30" stroke="#e8d4b3" strokeWidth="11" strokeLinecap="round"/></g>
            <g transform={`rotate(${-angle})`}>
              {[-1, 1].map(side => <path key={side} className="rowing-couple-heart" transform={`translate(${side * 18} ${side * 8}) scale(1.3)`} d="M0 11C-4 7 -16 0 -13 -8C-10 -16 -2 -12 0 -7C2 -12 10 -16 13 -8C16 0 4 7 0 11Z"/>)}
            </g>
          </svg>
        </div>
      })}
    </div>
    <div className="rowing-boat-layer">
      <div className="rowing-boat" style={{ left: `${(state.x - state.cameraX) / 390 * 100}%`, top: `${(state.y - state.cameraY) / 700 * 100}%` }}>
        <svg className="rowing-hull" viewBox="-110 -125 220 250" aria-hidden="true">
          <BoatHull/>
          <g className="rowing-oar rowing-oar-left" data-active={state.shiroAction === 'stroke'} style={{ transform: `rotate(${state.shiroAction === 'stroke' && !reduced ? Math.sin((.7 - (state.shiroUntil - state.elapsed)) / .7 * Math.PI * 2) * 32 : -12}deg)` }}>
            <path d="M-22 3L-91 26" stroke="#5e544f" strokeWidth="4" strokeLinecap="round"/><path d="M-77 20L-105 30" stroke="#e8d4b3" strokeWidth="11" strokeLinecap="round"/>
          </g>
          <g className="rowing-oar rowing-oar-right" data-reverse={state.ryoAction === 'reverse'} style={{ transform: `rotate(${['stroke', 'strong', 'reverse', 'miss'].includes(state.ryoAction) && !reduced ? Math.sin((.7 - (state.ryoUntil - state.elapsed)) / .7 * Math.PI * 2) * (state.ryoAction === 'reverse' ? 32 : state.ryoAction === 'strong' ? -44 : -32) : 12}deg)` }}>
            <path d="M22 3L91 26" stroke="#5e544f" strokeWidth="4" strokeLinecap="round"/><path d="M77 20L105 30" stroke="#e8d4b3" strokeWidth="11" strokeLinecap="round"/>
          </g>
        </svg>
        {!onShore && seats.map(({ who, depth }) => <button key={who} className={`rowing-person rowing-person-${who}`} style={{ zIndex: Math.round(depth + 60) }}
          data-action={who === 'shiro' ? state.shiroAction : state.ryoAction}
          aria-label={who === 'shiro' ? '让宇都木士郎划桨' : '让月云了划桨'} {...inputs(who)}>
          <Portrait who={who} masked={who === 'ryo' && Boolean(visit?.masked)} active={who === 'shiro' ? state.shiroAction !== 'rest' : ['push', 'stroke', 'strong', 'reverse', 'miss'].includes(state.ryoAction)} />
        </button>)}
        {!dialogue && !calendarLine && !encounter && !chiefLine && !dailyLine && !coupleLine && state.laughUntil > state.elapsed ? <div className="rowing-laugh" role="status">哈哈</div> : null}
      </div>
    </div>
    {onShore && shoreSeats.map(seat => <div key={seat.who} className="rowing-shore-person" data-who={seat.who} style={{ left: seat.x, top: seat.y, width: 88 * boatScale, height: 108 * boatScale }}><Portrait who={seat.who} active={false}/></div>)}
    {state.opening === 'ryo' || state.opening === 'shiro' ? <div className="rowing-dialogue rowing-response rowing-opening-response" role="status" style={{ left: openingLeft, top: Math.min(...shoreSeats.map(s => s.y)) - 108 * boatScale - 16, width: 220, '--row-tail-x': `${openingSpeaker.x - openingLeft}px` } as CSSProperties}><span>{state.opening === 'ryo' ? '月云了' : '宇都木士郎'}</span><p>{state.opening === 'ryo' ? '好无聊，我要划船。' : 'ok'}</p></div> : null}
    {announcement ? <div className="rowing-opening-guide" role="status" style={{ opacity: announcementOpacity }}><p>{announcement}</p></div> : null}
    {dialogue ? <div className="rowing-dialogue rowing-response rowing-evening-response" role="status" data-speaker={dialogue.who} data-below={bubbleBelow}
      style={{ left: bubbleLeft, top: bubbleY, width: bubbleWidth, '--row-tail-x': `${Math.max(18, Math.min(bubbleWidth - 18, speakerSeat.x - bubbleLeft))}px` } as CSSProperties}>
      <span>{dialogue.speaker}</span><p>{dialogue.text}</p>
    </div> : null}
    {!dialogue && response ? <div ref={responseElement} className={`rowing-dialogue rowing-response ${calendarLine ? 'rowing-calendar-response' : encounter ? 'rowing-collision-response' : dailyLine ? 'rowing-daily-response' : chiefLine ? 'rowing-chief-response' : 'rowing-couple-response'}`} role="status" data-chat={calendarChat ? calendarChat.birthday ? 'birthday' : 'holiday' : dailyChat?.kind ?? coupleChat?.kind} data-speaker={responseWho} data-below={responsePosition.below}
      style={{ left: responsePosition.left, top: responsePosition.top, transform: 'none', width: responseWidth, '--row-tail-x': `${responsePosition.tailX}px` } as CSSProperties}>
      <span>{responseSpeaker}</span><p>{response}</p>
    </div> : null}
    {state.calendar.celebration && <BirthdayMoment celebration={state.calendar.celebration} reduced={reduced}/>}
  </main>
}

export const rowingGame: GameDefinition = {
  id: 'i-hate-rowing', title: '我讨厌划船', kicker: '', description: '两个人，一条总在打转的小船。',
  kind: 'mechanic', accent: '#a68bc6', estimatedTime: '一直划', component: RowingGame,
}
