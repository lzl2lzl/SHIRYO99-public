import { HEART_PATH, replayFrame } from '../../app/heart-motion'
import { CELEBRATION_SECONDS, type Celebration } from './calendar-dialogue'

const Petal = () => <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28C3 23 2 8 11 4L16 9L21 4C30 8 29 23 16 28Z" fill="currentColor"/><path d="M16 11L16 23" stroke="#fff5f8" strokeWidth="1" opacity=".55"/></svg>
const Heart = () => <svg viewBox="0 0 32 32" aria-hidden="true"><path d={HEART_PATH} fill="currentColor"/></svg>

/** Uses foreground simulation time: no independent timer, interception or ending navigation. */
export function BirthdayMoment({ celebration, reduced }: { celebration: Celebration; reduced: boolean }) {
  const age=celebration.age, hearts=age>=3, fade=Math.min(1,Math.max(0,(CELEBRATION_SECONDS-age)/.7))
  const frame=replayFrame(reduced ? 1 : Math.min(1,(age-3)/3.4))
  return <div className="rowing-birthday" aria-hidden="true" data-phase={hearts?'hearts':'petals'} data-birthday={celebration.birthday} style={{opacity:fade}}>
    {!hearts && Array.from({length:reduced?8:28},(_,i)=>{
      const p=(age-(i%7)*.09)/2.5
      if (!reduced && (p<0 || p>1)) return null
      const x=reduced?10+(i*31)%80:-12+p*124
      const y=8+(i*37)%76+(reduced?0:Math.sin(p*Math.PI*2+i)*5+p*10)
      return <span key={i} className={`rowing-petal rowing-petal-${i%3}`} style={{left:`${x}%`,top:`${y}%`,opacity:reduced?.6:Math.sin(p*Math.PI)*.8,transform:`rotate(${reduced?i*27:i*43+p*260}deg) scale(${.7+(i%4)*.15})`}}><Petal/></span>
    })}
    {hearts &&
      <div className="rowing-birthday-emblem" style={{filter:reduced?'none':`drop-shadow(0 0 ${frame.glow*9}px #b493de88)`}}>
        {frame.lights.map((light,i)=>{
          const angle=-Math.PI/2+i*Math.PI/4+(reduced?0:frame.rotation)
          return <span key={i} className={`rowing-birthday-orbit rowing-birthday-orbit-${i%2}`} style={{opacity:light,transform:`translate(${Math.cos(angle)*82}px,${Math.sin(angle)*82}px) rotate(${reduced?0:Math.sin(angle)*22}deg)`}}><Heart/></span>
        })}
      </div>
    }
  </div>
}
