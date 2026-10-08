import { useEffect, useRef, useState } from 'react'
import { HEART_PATH, ENTRY_DURATION, REPLAY_DURATION, clampUnit, easeOut, heartCoverScale, heartFlight, type HeartPoint } from './heart-motion'
import './heart-motion.css'

export function Heart() {
  return <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false"><path d={HEART_PATH} /></svg>
}

/** One finite sequence; elapsed time freezes in hidden tabs, never a perpetual loading loop. */
function useHeartSequence(duration: number) {
  const [progress, setProgress] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, elapsed = 0, previous = performance.now(), cancelled = false
    const tick = (now: number) => {
      if (cancelled) return
      if (!document.hidden) elapsed += Math.min(50, Math.max(0, now - previous))
      previous = now
      const next = media.matches ? 1 : clampUnit(elapsed / duration)
      setProgress(next)
      if (next < 1) frame = requestAnimationFrame(tick)
    }
    const visibility = () => { previous = performance.now() }
    const preference = () => { if (media.matches) { cancelAnimationFrame(frame); setProgress(1) } }
    frame = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', preference)
    return () => { cancelled = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preference) }
  }, [duration])
  return progress
}

export interface HeartEntry { id: string; from: HeartPoint; to: HeartPoint }

export function HeartTransition({ entry, onComplete }: { entry: HeartEntry; onComplete: () => void }) {
  const progress = useHeartSequence(ENTRY_DURATION)
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }))
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight })
    addEventListener('resize', resize)
    return () => removeEventListener('resize', resize)
  }, [])
  useEffect(() => { if (progress === 1) onComplete() }, [progress, onComplete])
  const flight = heartFlight(entry.from, entry.to, clampUnit((progress - .1) / .32))
  const reveal = clampUnit((progress - .42) / .58) ** 2
  const scale = reveal * heartCoverScale(entry.to, viewport.width, viewport.height)
  return <>
    <svg className="heart-clip-defs" aria-hidden="true"><defs><clipPath id="game-heart-reveal" clipPathUnits="userSpaceOnUse">
      <path d={HEART_PATH} transform={`translate(${entry.to.x} ${entry.to.y}) scale(${scale}) translate(-16 -17)`} />
    </clipPath></defs></svg>
    <div className="heart-flight-layer" aria-hidden="true">
      <span className="heart-entry-spark" style={{ left: entry.from.x, top: entry.from.y, opacity: 1 - clampUnit(progress / .25), transform: `translate(-50%,-50%) scale(${1 + progress * 4})` }}><Heart /></span>
      <span className="heart-entry-traveller" style={{ left: flight.x, top: flight.y, opacity: 1 - clampUnit((progress - .42) / .1), transform: `translate(-50%,-50%) rotate(${12 - progress * 35}deg) scale(${1 + Math.sin(progress * Math.PI) * .25})` }}><Heart /></span>
    </div>
  </>
}

export function HeartReplay({ onReplay, disabled }: { onReplay: () => void; disabled: boolean }) {
  const progress = useHeartSequence(REPLAY_DURATION)
  const ready = progress >= .87
  const panel = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => { panel.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (ready) button.current?.focus({ preventScroll: true }) }, [ready])
  const gather = easeOut(progress / .42)
  const rotation = easeOut((progress - .22) / .61) * Math.PI * 2
  const pop = clampUnit((progress - .87) / .13)
  const buttonScale = 1 - Math.cos(pop * Math.PI * 2) * (1 - pop) * .16
  return <div className="fishing-end-overlay heart-replay-overlay" role="dialog" aria-modal="true" aria-label="游戏结束">
    <div ref={panel} className="heart-replay-panel" tabIndex={-1} data-ready={ready}>
      <div className="heart-replay-emblem" aria-hidden="true">
        <span className="heart-replay-core" style={{ opacity: gather, transform: `scale(${.65 + gather * .35})` }}><Heart /><span>99</span></span>
        {Array.from({ length: 8 }, (_, index) => {
          const angle = index * Math.PI / 4 + rotation
          const radius = 112 - gather * 53
          return <span key={index} className={`heart-replay-orbit heart-replay-orbit-${index % 2}`} style={{ opacity: .2 + gather * .8,
            transform: `translate(${Math.cos(angle) * radius}px,${Math.sin(angle) * radius * .8}px) rotate(${Math.sin(angle) * 22}deg) scale(${.6 + gather * .4})` }}><Heart /></span>
        })}
      </div>
      <div className="heart-replay-wordmark" aria-label="SHIRYO99"><span>SHI</span><span>RYO</span><sup>99</sup></div>
      <div className="heart-replay-progress" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => {
          const lit = progress >= (index + 1) * .1
          const pulse = ready ? 1 : .6 + .4 * Math.sin(progress * Math.PI * 7 - index * .5) ** 2
          return <span key={index} style={{ opacity: lit ? pulse : .16 }}><Heart /></span>
        })}
      </div>
      <div className="heart-replay-action">
        {ready ? <button ref={button} type="button" className="fishing-replay heart-replay-button" onClick={onReplay} disabled={disabled}
          style={{ opacity: easeOut(pop), transform: `scale(${buttonScale})` }}>再来一次 <Heart /></button> : null}
      </div>
      <span className="fishing-sr-only" role="status">{ready ? '可以再来一次了。' : '游戏结束。'}</span>
    </div>
  </div>
}
