import { useEffect, useRef, useState } from 'react'
import { acquiredSkills, SKILL_OWNERS, skillTone, skillTitle, type SkillDefinition } from './catalog'
import './skill-tree.css'

export function SkillTreeIcon() {
  return <svg className="rowing-tree-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5V10Q5 14 12 14Q19 14 19 10V5M12 14V21" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="5" cy="5" r="3" fill="#d5d1d8" stroke="currentColor" strokeWidth=".7"/>
    <circle cx="19" cy="5" r="3" fill="#a68bc6" stroke="currentColor" strokeWidth=".7"/>
    <circle cx="12" cy="14" r="3" fill="currentColor"/>
  </svg>
}

function SkillNode({ skill, selected, onSelect }: { skill: SkillDefinition; selected: boolean; onSelect: () => void }) {
  return <button className="rowing-tree-node" data-tone={skillTone(skill.owner)} data-week={skill.week} aria-pressed={selected} onClick={onSelect}>
    <i className="rowing-tree-orb" aria-hidden="true"/><small>第 {skill.week} 周 · {SKILL_OWNERS[skill.owner]}</small><span>{skillTitle(skill)}</span>
  </button>
}

/** The tree is a view of persisted progression, not another source of skill ownership. */
export function SkillTree({ level, onClose }: { level: number; onClose: () => void }) {
  const skills = acquiredSkills(level), [selected, setSelected] = useState(skills.at(-1)?.week ?? 0)
  const panel = useRef<HTMLDivElement>(null), active = skills.find(skill => skill.week === selected)
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('.rowing-tree-close')?.focus()
    panel.current?.querySelector<HTMLElement>('.rowing-tree-node[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
    return () => { document.querySelector<HTMLButtonElement>('.rowing-tree-entry')?.focus() }
  }, [])
  const groups = Array.from({ length: Math.ceil(skills.length / 4) }, (_, i) => skills.filter(skill => Math.floor((skill.week - 1) / 4) === i))
  return <div className="rowing-tree-overlay">
    <div ref={panel} className="rowing-tree-panel" role="dialog" aria-modal="true" aria-labelledby="rowing-tree-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const nodes = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const first = nodes[0], last = nodes.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className="rowing-tree-heading"><div><h2 id="rowing-tree-title">技能树</h2><p>已获得 {skills.length} 项能力</p></div>
        <button className="rowing-tree-close" onClick={onClose} aria-label="关闭技能树">×</button></header>
      {!skills.length ? <div className="rowing-tree-empty"><SkillTreeIcon/><p>还没有获得新能力。</p><p>第一次升级在 2004/04/14 08:31。</p></div> : <>
        <div className="rowing-tree-map" aria-label="已获得的技能">
          {groups.map((group, i) => {
            const personal = group.filter(s => s.owner === 'shiro' || s.owner === 'ryo'), shared = group.filter(s => s.owner === 'pair' || s.owner === 'boat')
            return <div className="rowing-tree-group" key={i}>
              {personal.length > 0 && <div className="rowing-tree-branches" data-paired={personal.length === 2} data-joined={shared.length > 0}>
                {personal.map(skill => <SkillNode key={skill.week} skill={skill} selected={selected === skill.week} onSelect={() => setSelected(skill.week)}/>)}
              </div>}
              {shared.map(skill => <div className="rowing-tree-shared" key={skill.week}><SkillNode skill={skill} selected={selected === skill.week} onSelect={() => setSelected(skill.week)}/></div>)}
            </div>
          })}
        </div>
        <section className="rowing-tree-detail" data-tone={active ? skillTone(active.owner) : undefined} aria-live="polite" aria-atomic="true">
          {active && <><h3>{skillTitle(active)}</h3><p>{active.ability?.summary}</p><p>{active.ability?.usage}</p></>}
        </section>
      </>}
    </div>
  </div>
}
