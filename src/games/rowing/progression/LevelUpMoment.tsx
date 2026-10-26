import { SKILLS, skillTone, skillTitle } from './catalog'
import { type UpgradePresentation } from './state'
import { flightPoint, revealFrame, type LightPoint } from './presentation'

/** Explain, condense and deliver to the actual tree icon without capturing game input. */
export function LevelUpMoment({ moment, reduced, origin, target }: {
  moment: UpgradePresentation; reduced: boolean; origin: LightPoint; target: LightPoint
}) {
  const skill = SKILLS[moment.week - 1], frame = revealFrame(moment.age, origin, target, reduced)
  const tone = skillTone(skill.owner), entering = Math.max(0, 1 - moment.age / .3) ** 3
  return <div className="rowing-level-up" role="status" data-week={moment.week} data-milestone={skill.milestone} data-major={skill.milestone && moment.week>=16} data-phase={frame.phase} data-tone={tone}>
    <span className="rowing-sr-only">LEVEL UP! {skillTitle(skill)}。{skill.ability?.summary}</span>
    {!reduced && skill.milestone && moment.week>=16 && frame.phase==='read' && <svg className="rowing-evolution-burst" aria-hidden="true" style={{left:origin.x,top:origin.y,opacity:Math.max(0,.28-moment.age*.075),transform:`translate(-50%,-50%) scale(${.4+moment.age*.8})`}} viewBox="-150 -150 300 300"><circle r="100"/><circle r="132" strokeDasharray="45 15"/><path d="M-150 0H150M0 -150V150"/></svg>}
    <div className="rowing-level-title" aria-hidden="true" style={{ left: origin.x, top: origin.y, opacity: frame.textOpacity,
      transform: `translate(-50%, -50%) translateX(${reduced ? 0 : -60 * entering}px) scale(${frame.textScale})` }}>
      <div className="rowing-level-slash" />
      <strong>LEVEL UP!</strong><span>{skillTitle(skill)}</span><p>{skill.ability?.summary}</p>
    </div>
    {!reduced && frame.collapse > 0 && <div aria-hidden="true">
      {frame.phase === 'condense' && Array.from({ length: 8 }, (_, i) => {
        const angle = i / 8 * Math.PI * 2, radius = 75 * (1 - frame.collapse)
        return <i className="rowing-skill-spark" key={i} style={{ left: origin.x + Math.cos(angle) * radius,
          top: origin.y + Math.sin(angle) * radius * .65, opacity: Math.sin(frame.collapse * Math.PI) }} />
      })}
      {frame.phase === 'fly' && Array.from({ length: 5 }, (_, i) => {
        const point = flightPoint(Math.max(0, frame.flight ** 1.5 - (i + 1) * .025), origin, target)
        return <i className="rowing-skill-spark" key={i} style={{ left: point.x, top: point.y, opacity: .32 - i * .05 }} />
      })}
      <i className="rowing-skill-light" style={{ left: frame.position.x, top: frame.position.y, opacity: frame.lightOpacity,
        transform: `translate(-50%, -50%) scale(${.5 + frame.collapse * .5 - frame.arrival * .65}) rotate(${moment.age * 130}deg)` }} />
    </div>}
  </div>
}
