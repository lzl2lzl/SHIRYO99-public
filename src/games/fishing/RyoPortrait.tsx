import { useId } from 'react'
import './ryo-portrait.css'

const PORTRAIT = `${import.meta.env.BASE_URL}assets/characters/ryo/fishing-no-grapes.png`

// Source-image coordinates: keep the torso edge in front of the moving tail.
const TAIL = 'M846 653L920 626H958V557H1060V790H865L853 750L848 731L846 700Z'

/** A false → true edge plays one tail flick; an unchanged true value never loops. */
export function RyoPortrait({ active, fast = false }: { active: boolean; fast?: boolean }) {
  const id = useId()
  const tailClip = `${id}-tail`
  const bodyMask = `${id}-body`

  return (
    <svg className="fishing-ryo-portrait" data-tail-active={active} data-tail-fast={fast}
      x="253" y="76" width="79" height="88" viewBox="467 190 566 644" preserveAspectRatio="xMidYMax meet">
      <defs>
        <clipPath id={tailClip} clipPathUnits="userSpaceOnUse"><path d={TAIL} /></clipPath>
        <mask id={bodyMask} maskUnits="userSpaceOnUse" x="0" y="0" width="1448" height="1086">
          <rect width="1448" height="1086" fill="white" />
          <path d={TAIL} fill="black" />
        </mask>
      </defs>
      {/* At rest, show the original image alone, without any compositing seams. */}
      <image className="fishing-ryo-original" href={PORTRAIT} x="0" y="0" width="1448" height="1086" />
      <g className="fishing-ryo-parts">
        <g transform="translate(846 709)">
          <g className="fishing-ryo-tail">
            <g transform="translate(-846 -709)">
              <image href={PORTRAIT} x="0" y="0" width="1448" height="1086" clipPath={`url(#${tailClip})`} />
            </g>
          </g>
        </g>
        <image href={PORTRAIT} x="0" y="0" width="1448" height="1086" mask={`url(#${bodyMask})`} />
      </g>
    </svg>
  )
}
