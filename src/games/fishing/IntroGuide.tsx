import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { DialogueBeat } from './content'

const TARGETS = { hints: '.fishing-count', turnover: '.fishing-turn-water', time: '.fishing-time-toggle' }

/** A click-through spotlight on the real control, never a second copy of it. */
export function IntroGuide({ target, text, disabled, onNext }: {
  target: NonNullable<DialogueBeat['guideTarget']>
  text: string
  disabled: boolean
  onNext: () => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  const maskId = useId()
  const [bounds, setBounds] = useState({ width: 390, height: 600, x: 45, y: 576, rx: 47, ry: 23 })

  useLayoutEffect(() => {
    const overlay = button.current
    const stage = overlay?.parentElement
    const control = stage?.querySelector<HTMLButtonElement>(TARGETS[target])
    if (!stage || !control || !overlay) return
    const measure = () => {
      const scene = stage.getBoundingClientRect()
      const box = control.getBoundingClientRect()
      const x = box.left - scene.left + box.width / 2
      const y = box.top - scene.top + box.height / 2
      setBounds({ width: scene.width, height: scene.height, x, y,
        rx: Math.min(box.width / 2 + 10, x - 2, scene.width - x - 2),
        ry: Math.min(box.height / 2 + 5, scene.height - y - 2) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(control)
    overlay.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [target])

  const labelX = Math.max(90, Math.min(bounds.width - 90, bounds.x))
  return (
    <button ref={button} className="fishing-intro-guide" type="button" disabled={disabled}
      data-guide-target={target} onClick={onNext} aria-label={text} aria-description="继续指引">
      <svg viewBox={`0 0 ${bounds.width} ${bounds.height}`} aria-hidden="true">
        <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={bounds.width} height={bounds.height}>
          <rect width={bounds.width} height={bounds.height} fill="white" />
          <ellipse cx={bounds.x} cy={bounds.y} rx={bounds.rx} ry={bounds.ry} fill="black" />
        </mask></defs>
        <rect width={bounds.width} height={bounds.height} fill="#0c132b" opacity=".48" mask={`url(#${maskId})`} />
        <g key={target} className="fishing-guide-ink" fill="none" stroke="#f3f4e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse className="fishing-guide-circle" cx={bounds.x} cy={bounds.y} rx={bounds.rx} ry={bounds.ry} pathLength="1" />
          <path className="fishing-guide-pointer" d={`M${labelX} ${bounds.y - 64} Q${bounds.x} ${bounds.y - 59} ${bounds.x} ${bounds.y - 34} m-4 -5 4 5 4 -5`} />
        </g>
      </svg>
      <span key={target} className="fishing-guide-copy" style={{ left: labelX, top: bounds.y - 104 }}>{text}</span>
    </button>
  )
}
