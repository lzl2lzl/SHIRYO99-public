import type { EvolutionRuntime } from './evolution'
import './evolution.css'

const wrap = (v: number, extent: number) => ((v % extent) + extent) % extent
/** Bounded procedural scenery follows world coordinates; no new character artwork. */
export function EvolutionScene({ evolution: e, cameraX, cameraY, elapsed, night, reduced }: {
  evolution: EvolutionRuntime; cameraX: number; cameraY: number; elapsed: number; night: boolean; reduced: boolean
}) {
  const cloud = Math.min(1,e.realmMix), galaxy = Math.max(0,e.realmMix-1)
  if (cloud < .001) return null
  return <div className="rowing-evolution-sky" aria-hidden="true" data-night={night} style={{opacity:cloud}}>
    <div className="rowing-galaxy-field" style={{opacity:galaxy}} />
    <svg viewBox="0 0 390 700" preserveAspectRatio="none">
      <g opacity={1-galaxy} className="rowing-cloud-fields">
        {Array.from({length:12},(_,i)=>{
          const x=wrap(i*137-cameraX*.32+(reduced?0:Math.sin(elapsed*.045+i)*9),570)-90
          const y=wrap(i*191-cameraY*.24,920)-110
          return <g key={i} transform={`translate(${x} ${y}) scale(${.65+(i%4)*.18})`} opacity={.3+(i%3)*.13}>
            <ellipse rx="90" ry="22"/><ellipse cx="-35" cy="-12" rx="35" ry="22"/><ellipse cx="16" cy="-20" rx="45" ry="28"/>
          </g>
        })}
      </g>
      <g opacity={galaxy} className="rowing-galaxy-stars">
        {Array.from({length:54},(_,i)=>{
          const x=wrap(i*149.3-cameraX*(.08+(i%3)*.025),410)-10,y=wrap(i*219.7-cameraY*.12,740)-20
          return <circle key={i} cx={x} cy={y} r={i%11===0?1.8:.6+(i%3)*.28} opacity={.35+(i%5)*.12}/>
        })}
        <g transform={`translate(${wrap(260-cameraX*.045,650)-80} ${wrap(170-cameraY*.06,1100)-160})`}>
          <circle r="52" fill="#b5a1d5" opacity=".3"/><ellipse rx="83" ry="13" fill="none" stroke="#d7cee9" strokeWidth="3" transform="rotate(-24)" opacity=".35"/>
        </g>
      </g>
    </svg>
  </div>
}

export function EvolutionHull({ level, evolution: e, elapsed, reduced, back = false, couple = false }: {
  level:number; evolution:EvolutionRuntime; elapsed:number; reduced:boolean; back?:boolean; couple?:boolean
}) {
  const wing=level>=12?1:0, arms=couple?0:Math.min(1,e.form), armour=couple?0:Math.max(0,Math.min(1,e.form-1)), robot=couple?0:Math.max(0,e.form-2)
  const wave=reduced?0:Math.sin(elapsed*4)*3
  if(back)return <g className="rowing-evolution-hull" aria-hidden="true">
    {wing>0&&<g opacity={wing} fill="#b6accc" stroke="#70677f" strokeWidth="1.5">
      <path d="M-46 -18L-105 15L-102 35L-48 24Z"/><path d="M46 -18L105 15L102 35L48 24Z"/>
      <path d="M-44 51L-79 77L-41 72M44 51L79 77L41 72" fill="#e0dae9"/>
    </g>}
    {level>=16&&<ellipse cy="57" rx="88" ry="30" fill={level>=20?'#bfa4eb':'#e7e9f1'} opacity={level>=20?.12:.35}/>}
    {!couple&&<>
      {e.charge>2&&<circle r="105" fill="none" stroke="#cbb8eb" strokeWidth="2" strokeDasharray={`${e.charge*6.5} 660`} transform={`rotate(${reduced?0:elapsed*30})`} opacity={.15+e.charge/180}/>}
      {elapsed<e.surfUntil&&<g fill="none" stroke="#f3f2ed" opacity=".55"><path d="M-67 40Q-100 95 -65 120M67 40Q100 95 65 120"/></g>}
      {elapsed<e.meteorUntil&&<path d="M-26 65L0 220L26 65Z" fill="#c6b7ee" opacity=".28"/>}
      {elapsed<e.binaryUntil&&<g strokeWidth="9" strokeLinecap="round" opacity=".65"><path d="M-28 55Q-54 110 -8 160" stroke="#dedbe5"/><path d="M28 55Q54 110 8 160" stroke="#ab7fe9"/></g>}
      {armour>0&&<g opacity={armour} fill="#d2bbef"><path d={`M-47 58L-41 ${110+wave}L-29 59Z`}/><path d={`M47 58L41 ${110-wave}L29 59Z`}/></g>}
    </>}
  </g>
  return <g className="rowing-evolution-hull" aria-hidden="true">
    {level>=8&&<path d="M-46 56Q0 85 46 56" fill="none" stroke="#aa8ec9" strokeWidth="3"/>}
    {level>=16&&<g fill="none" stroke="#e9e5f2" opacity=".85"><path d="M-49 -44Q-26 -77 -5 -82M49 -44Q26 -77 5 -82" strokeWidth="3"/></g>}
    {level>=20&&<path d="M0 -99L9 -78L0 -68L-9 -78Z" fill="#e1cef8"/>}
    {arms>0&&<g opacity={arms} stroke="#5f556e" strokeWidth="2" strokeLinejoin="round">
      <path d="M-46 -30L-72 -27L-82 16L-99 29L-86 44L-63 26L-57 -3L-43 0Z" fill="#cecbd5"/>
      <path d="M46 -30L72 -27L82 16L99 29L86 44L63 26L57 -3L43 0Z" fill="#a38aba"/>
      <circle cx="-68" cy="6" r="8" fill="#efecf1"/><circle cx="68" cy="6" r="8" fill="#d7c3ed"/>
    </g>}
    {armour>0&&<g opacity={armour} stroke="#61556d" strokeWidth="2">
      <path d="M-48 -62L-30 -81L30 -81L48 -62L35 -45L-35 -45Z" fill="#cec5da"/>
      <path d="M-23 -73L23 -73L28 -56L-28 -56Z" fill="#54456d"/>
      <path d="M-43 39L-53 72L-17 87L-12 54M43 39L53 72L17 87L12 54" fill="#bcaacb"/>
    </g>}
    {robot>0&&<g opacity={robot} stroke="#655772" strokeWidth="2" strokeLinejoin="round">
      <path d="M-22 -92L-16 -119L16 -119L22 -92L10 -78L-10 -78Z" fill="#d4cce0"/>
      <path d="M-16 -106L16 -106L10 -97L-10 -97Z" fill="#9365d2" stroke="none"/>
      <path d="M-31 72L-37 112L-11 119L-8 76" fill="#d3cedd"/><path d="M31 72L37 112L11 119L8 76" fill="#a994c3"/>
      <path d="M-9 -114L0 -128L9 -114" fill="none" stroke="#d6b2ff"/>
    </g>}
    {!couple&&elapsed<e.tailUntil&&<path d={`M32 19Q${95+wave} 13 81 58Q58 79 43 50`} fill="none" stroke="#b79ad8" strokeWidth={elapsed-e.lastTail<.9?8:4} strokeLinecap="round" opacity=".55"/>}
    {!couple&&elapsed<e.brakeUntil&&<path d="M-83 -20Q0 -145 83 -20" fill="none" stroke="#f1ebf5" strokeWidth="3" opacity=".7"/>}
  </g>
}
