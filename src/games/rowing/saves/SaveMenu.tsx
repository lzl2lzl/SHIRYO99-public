import { useEffect, useRef, useState } from 'react'
import type { RowingState } from '../model'
import { saveSummary } from './format'
import type { RowingSaves } from './useRowingSaves'
import type { SlotId } from './store'
import './saves.css'

const titleFor=(slot:SlotId)=>slot==='auto'?'自动存档':`存档 ${slot.slice(-1)}`
function Summary({state}:{state:RowingState}) {
  const info=saveSummary(state)
  return <div className="rowing-save-summary"><p>{info.date} <span>{info.time}</span></p>
    <p>已漂流 {info.days} 天 · 航行 {info.meters.toLocaleString()} 米</p>
    <p>技能 Lv. {info.level} · 游玩 {info.played}</p></div>
}
export function SaveMenu({saves,state}:{saves:RowingSaves;state:RowingState}) {
  const dialog=useRef<HTMLDivElement>(null), file=useRef<HTMLInputElement>(null)
  const [showSlots,setShowSlots]=useState(false)
  const open=saves.panel!==null
  useEffect(()=>{
    if(!open)return
    const restore=document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return()=>{if(restore?.isConnected&&!restore.closest('[inert]'))restore.focus();else document.querySelector<HTMLButtonElement>('.rowing-save-button')?.focus()}
  },[open])
  useEffect(()=>{if(open)dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()},[saves.prompt,saves.panel,open])
  if(!open)return null
  const latest=saves.slots.filter(s=>s.data).sort((a,b)=>Date.parse(b.data!.savedAt)-Date.parse(a.data!.savedAt))[0]
  const viewing=saves.panel==='menu',prompt=saves.prompt
  const selected=saves.slots.find(s=>s.slot===saves.target)
  const summary=prompt?.kind==='import'?prompt.data.state:prompt?.kind==='load'?saves.slots.find(s=>s.slot===prompt.slot)?.data?.state
    :saves.started?state:latest?.data?.state
  return <div className="rowing-save-overlay">
    <div ref={dialog} className="rowing-save-panel" role="dialog" aria-modal="true" aria-labelledby="rowing-save-title" onKeyDown={event=>{
      if(event.key==='Escape'&&!saves.busy){event.preventDefault();if(prompt)saves.cancel();else if(viewing)saves.close();return}
      if(event.key==='Tab'){
        const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not([type=hidden]):not(:disabled)')??[]).filter(n=>n.offsetParent!==null)
        const first=nodes[0],last=nodes[nodes.length-1]
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }}>
      <div className="rowing-save-heading"><h2 id="rowing-save-title">{viewing?'航行记录':'我讨厌划船'}</h2>
        {viewing&&!saves.busy&&<button onClick={saves.close} aria-label="关闭存档菜单">×</button>}</div>
      {saves.panel==='loading'?<p role="status">正在读取存档……</p>:<>
        {summary&&<Summary state={summary}/>}
        {prompt?<section className="rowing-save-confirm">
          <p>{prompt.kind==='new'?'开始新航行前，先把旧进度保存在一个手动档位。':prompt.kind==='load'?'读取会替换当前航行。需要保留现在的进度，请先取消并另存。':prompt.kind==='save'?`要用当前进度覆盖「${titleFor(prompt.slot)}」吗？`:prompt.kind==='import'?'将这份备份导入一个手动档位。导入后可以选择读取。':'自动存档没有保存成功。可以取消并导出备份，也可以不保存返回。'}</p>
          {(prompt.kind==='new'||prompt.kind==='import')&&<label className="rowing-save-target">保存到
            <select value={saves.target} disabled={saves.busy} onChange={e=>saves.setTarget(e.target.value as SlotId)}>
              {saves.slots.filter(s=>s.slot!=='auto').map(s=><option key={s.slot} value={s.slot}>{titleFor(s.slot)}{s.data?'（已有记录）':s.damaged?'（无法读取）':'（空）'}</option>)}
            </select>
            {(selected?.data||selected?.damaged)&&<span>确认后会覆盖这个手动档位，其他档位保留。</span>}
          </label>}
          <div className="rowing-save-actions"><button disabled={saves.busy} onClick={saves.cancel}>取消</button>
            <button className="rowing-save-primary" disabled={saves.busy} onClick={saves.confirm}>{saves.busy?'处理中……':prompt.kind==='new'?'备份并开始':prompt.kind==='load'?'读取':prompt.kind==='save'?'覆盖保存':prompt.kind==='import'?'确认导入':'不保存返回'}</button></div>
        </section>:<>
          <div className="rowing-save-actions rowing-save-main-actions">
            {viewing?<button className="rowing-save-primary" disabled={saves.busy} onClick={saves.close}>继续划船</button>:latest&&<button className="rowing-save-primary" disabled={saves.busy} onClick={()=>saves.load(latest.slot)}>继续游戏</button>}
            <button disabled={saves.busy} onClick={saves.startNew}>新游戏</button>
            {!viewing&&<button disabled={saves.busy} onClick={()=>setShowSlots(value=>!value)}>{showSlots?'收起存档':'读取存档'}</button>}
          </div>
          {(viewing||showSlots)&&<section className="rowing-save-slots" aria-label="存档列表">
            {saves.slots.map(slot=><article className="rowing-save-slot" key={slot.slot} data-slot={slot.slot}>
              <div className="rowing-save-slot-heading"><h3>{titleFor(slot.slot)}</h3><span>{slot.data?new Date(slot.data.savedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):slot.damaged?'无法读取':'空'}</span></div>
              {slot.data&&<Summary state={slot.data.state}/>}
              <div className="rowing-save-slot-actions">
                {slot.slot!=='auto'&&saves.started&&<button disabled={saves.busy} onClick={()=>saves.save(slot.slot)}>保存</button>}
                <button disabled={!slot.data||saves.busy} onClick={()=>saves.load(slot.slot)}>读取</button>
                <button disabled={!slot.data||saves.busy} onClick={()=>saves.exportData(slot.slot)}>导出</button>
              </div>
            </article>)}
          </section>}
          <div className="rowing-save-tools">
            {saves.started&&<button disabled={saves.busy} onClick={()=>saves.exportData()}>导出当前进度</button>}
            <button disabled={saves.busy} onClick={()=>file.current?.click()}>导入备份</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void saves.importFile(selected)}}/>
            <button disabled={saves.busy} onClick={()=>void saves.refresh()}>刷新存档</button>
          </div>
        </>}
        {saves.message&&<p className="rowing-save-status" role="status">{saves.message}</p>}
        {saves.error&&<p className="rowing-save-error" role="alert">{saves.error}</p>}
        <p className="rowing-save-note">存档保存在当前浏览器。导出备份可以换设备继续。</p>
      </>}
      {!prompt&&<button className="rowing-save-exit" disabled={saves.busy} onClick={()=>void saves.exit()}>← 返回大厅</button>}
    </div>
  </div>
}
