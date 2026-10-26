import type { SkillRuntime } from './skills'

export function SkillWake({ runtime, level, cameraX, cameraY, reduced }: { runtime: SkillRuntime; level: number; cameraX: number; cameraY: number; reduced: boolean }) {
  const points = reduced ? runtime.wake.slice(-2) : runtime.wake
  return <g className="rowing-skill-wake" aria-hidden="true">
    {points.map((p, i) => <g key={i} transform={`translate(${p.x - cameraX} ${p.y - cameraY}) rotate(${p.heading * 180 / Math.PI})`} opacity={(1 - p.age / 1.8) * .32}>
      <path d="M-28 68Q-36 87 -42 100" stroke={level>=17?'#ddd6ee':undefined}/><path d="M28 68Q36 87 42 100" stroke={level>=18?'#c29be9':undefined}/>
      {level>=17&&<path d="M-34 90v8m-4 -4h8" stroke="#f1e7ff"/>}
      {level>=18&&<path d="M35 84v8m-4 -4h8" stroke="#c294ee"/>}
    </g>)}
  </g>
}
