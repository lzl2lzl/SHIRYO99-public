import { useEffect, useRef, useState } from 'react'
import { captureSave, checkpointKey, copySave, freshRun, MAX_SAVE_BYTES, newRunIdentity, parseSave, type RunIdentity, type SaveFile } from './format'
import { SaveConflict, SaveStore, SLOT_IDS, type SlotId, type SlotView, type SaveWrite } from './store'
import type { RowingState } from '../model'

type Panel = 'loading' | 'entry' | 'menu' | null
export type SavePrompt = { kind: 'new' } | { kind: 'save' | 'load'; slot: SlotId } | { kind: 'import'; data: SaveFile } | { kind: 'exit' } | null
interface Options {
  preview: boolean
  snapshot: () => { state: RowingState; dockOrigin: number }
  replace: (save: SaveFile) => void
  release: () => void
  onExit: () => void
}
const emptySlots = (): SlotView[] => SLOT_IDS.map(slot=>({slot,revision:0,data:null}))
const messageFor = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试或导出备份。'

export function useRowingSaves(options: Options) {
  const opt=useRef(options); opt.current=options
  const store=useRef(new SaveStore())
  const [initialIdentity]=useState(newRunIdentity)
  const identity=useRef<RunIdentity>(initialIdentity)
  const slotsRef=useRef(emptySlots()), autoRevision=useRef(0)
  const [slots,setSlots]=useState<SlotView[]>(emptySlots)
  const [panel,setPanel]=useState<Panel>(options.preview?null:'loading')
  const paused=useRef(!options.preview), started=useRef(options.preview)
  const [busy,setBusy]=useState(false), working=useRef(false)
  const [message,setMessage]=useState(''), [error,setError]=useState('')
  const [prompt,setPrompt]=useState<SavePrompt>(null)
  const [target,setTarget]=useState<SlotId>('slot-1')
  const enabled=useRef(false), mounted=useRef(true)
  const lastSave=useRef(0), lastKey=useRef('')
  const queue=useRef<Promise<unknown>>(Promise.resolve())
  const setScreen=(next:Panel)=>{paused.current=next!==null;opt.current.release();setPanel(next)}
  const updateSlots=(next:SlotView[])=>{slotsRef.current=next;if(mounted.current)setSlots(next)}
  const capture=()=>{const current=opt.current.snapshot();return captureSave(identity.current,current.state,current.dockOrigin)}
  const serialize=<T,>(job:()=>Promise<T>):Promise<T>=>{
    const result=queue.current.then(job);queue.current=result.catch(()=>{});return result
  }
  const writes=async(updates:SaveWrite[])=>{
    await store.current.write(updates)
    const auto=updates.find(w=>w.slot==='auto');if(auto)autoRevision.current=auto.expectedRevision+1
    updateSlots(await store.current.list())
  }
  const fail=(cause:unknown)=>{enabled.current=false;if(mounted.current)setError(messageFor(cause))}
  const autosave=()=>{
    if(options.preview||!started.current||!enabled.current)return Promise.resolve(false)
    let data:SaveFile
    try{data=capture()}catch(cause){fail(cause);return Promise.resolve(false)}
    lastSave.current=data.state.activeSeconds;lastKey.current=checkpointKey(data.state)
    return serialize(async()=>{
      if(!enabled.current)return false
      try{await writes([{slot:'auto',expectedRevision:autoRevision.current,data}]);return true}
      catch(cause){fail(cause);return false}
    })
  }
  const autosaveRef=useRef(autosave);autosaveRef.current=autosave
  useEffect(()=>{
    mounted.current=true
    if(options.preview)return()=>{mounted.current=false}
    let live=true
    store.current.list().then(rows=>{if(!live)return;updateSlots(rows);autoRevision.current=rows[0].revision;enabled.current=!rows[0].damaged;setScreen('entry')})
      .catch(cause=>{if(!live)return;fail(cause);setScreen('entry')})
    const leave=()=>{if(document.hidden)void autosaveRef.current()}
    const pagehide=()=>{void autosaveRef.current()}
    document.addEventListener('visibilitychange',leave);window.addEventListener('pagehide',pagehide)
    return()=>{live=false;void autosaveRef.current();mounted.current=false;document.removeEventListener('visibilitychange',leave);window.removeEventListener('pagehide',pagehide)}
  },[options.preview])
  const run=async(job:()=>Promise<void>)=>{
    if(working.current)return
    working.current=true;setBusy(true);setMessage('')
    try{await serialize(job)}catch(cause){setError(messageFor(cause));if(cause instanceof SaveConflict)enabled.current=false}
    finally{working.current=false;if(mounted.current)setBusy(false)}
  }
  const apply=(save:SaveFile)=>{
    const copy=copySave(save);identity.current={runId:copy.runId,startedAt:copy.startedAt};opt.current.replace(copy)
    started.current=true;lastSave.current=copy.state.activeSeconds;lastKey.current=checkpointKey(copy.state)
    setPrompt(null);setScreen(null)
  }
  const chooseBackup=()=>setTarget(slotsRef.current.find(s=>s.slot!=='auto'&&!s.data&&!s.damaged)?.slot ?? 'slot-1')
  const refresh=()=>run(async()=>{updateSlots(await store.current.list());setMessage('已重新读取存档。')})
  const open=()=>{setScreen('menu');setPrompt(null);setMessage('');void autosaveRef.current();void refresh()}
  const persist=()=>{try{void navigator.storage?.persist?.().catch(()=>false)}catch{/* Optional; a denial never blocks saving. */}}
  const save=(slot:SlotId)=>{
    if(!started.current||options.preview)return
    const selected=slotsRef.current.find(s=>s.slot===slot)!
    if(selected.data||selected.damaged){setPrompt({kind:'save',slot});return}
    void commitSave(slot)
  }
  const commitSave=(slot:SlotId)=>run(async()=>{
    const data=capture(),selected=slotsRef.current.find(s=>s.slot===slot)!
    await writes([{slot,expectedRevision:selected.revision,data}]);persist();setPrompt(null);setError(enabled.current?'':'自动保存已停止，请重新读档后继续。');setMessage('已保存。')
  })
  const load=(slot:SlotId)=>{
    if(!slotsRef.current.find(s=>s.slot===slot)?.data)return
    if(started.current){setPrompt({kind:'load',slot});return}
    void commitLoad(slot)
  }
  const commitLoad=(slot:SlotId)=>run(async()=>{
    const rows=await store.current.list(),selected=rows.find(s=>s.slot===slot)
    if(!selected?.data)throw new Error('这个存档目前无法读取，请重新选择。')
    // An explicit load accepts the current automatic revision; passive refresh never does.
    autoRevision.current=rows[0].revision;updateSlots(rows);enabled.current=!rows[0].damaged
    setError(rows[0].damaged?'自动存档损坏，当前可手动保存或导出备份。':'');apply(selected.data)
  })
  const startNew=()=>{
    if(started.current||slotsRef.current.some(s=>s.slot==='auto'&&(s.data||s.damaged))){chooseBackup();setPrompt({kind:'new'});return}
    void commitNew()
  }
  const commitNew=()=>run(async()=>{
    const data=freshRun(),old=started.current?capture():slotsRef.current[0].data
    const auto=slotsRef.current[0],backup=slotsRef.current.find(s=>s.slot===target)!
    if(old){
      await writes([{slot:target,expectedRevision:backup.revision,data:old},{slot:'auto',expectedRevision:autoRevision.current,data}])
      enabled.current=true;setError('')
    }else if(enabled.current){await writes([{slot:'auto',expectedRevision:auto.revision,data}])}
    else if(auto.damaged){throw new Error('自动存档无法读取。请先导入备份或另存，避免覆盖旧记录。')}
    // A new visitor can still play if storage is unavailable; the error remains visible.
    apply(data)
  })
  const exportData=(slot?:SlotId)=>{
    try{
      const data=slot?slotsRef.current.find(s=>s.slot===slot)?.data:capture()
      if(!data)throw new Error('这个档位没有可导出的存档。')
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
      const a=document.createElement('a');a.href=url;a.download=`SHIRYO99-rowing-${data.savedAt.replace(/[:.]/g,'-')}.json`;a.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('备份文件已交给浏览器下载，请妥善保留。')
    }catch(cause){setError(messageFor(cause))}
  }
  const importFile=async(file:File)=>{
    if(working.current)return
    try{if(file.size>MAX_SAVE_BYTES)throw new Error('请选择游戏导出的存档文件（不超过 1 MB）。');const data=parseSave(await file.text());chooseBackup();setPrompt({kind:'import',data});if(enabled.current)setError('')}
    catch(cause){setError(messageFor(cause))}
  }
  const confirm=()=>{
    if(prompt?.kind==='save')void commitSave(prompt.slot)
    if(prompt?.kind==='load')void commitLoad(prompt.slot)
    if(prompt?.kind==='new')void commitNew()
    if(prompt?.kind==='import')void run(async()=>{
      const selected=slotsRef.current.find(s=>s.slot===target)!
      await writes([{slot:target,expectedRevision:selected.revision,data:prompt.data}]);setPrompt(null);setMessage('备份已导入，请选择该档位读取。');if(enabled.current)setError('')
    })
    if(prompt?.kind==='exit'){started.current=false;opt.current.onExit()}
  }
  const exit=async()=>{
    if(options.preview||!started.current){opt.current.onExit();return}
    setScreen('menu')
    if(await autosaveRef.current()){started.current=false;opt.current.onExit()}
    else setPrompt({kind:'exit'})
  }
  return { panel,paused,slots,busy,message,error,prompt,target,setTarget,started:started.current,preview:options.preview,
    open,save,load,startNew,exportData,importFile,confirm,cancel:()=>setPrompt(null),refresh,exit,
    close:()=>{setPrompt(null);setScreen(null)},
    frame:()=>{
      if(options.preview||paused.current||!started.current||!enabled.current||working.current)return
      const s=opt.current.snapshot().state,key=checkpointKey(s)
      if(s.activeSeconds-lastSave.current>=10||key!==lastKey.current)void autosaveRef.current()
    },
  }
}
export type RowingSaves = ReturnType<typeof useRowingSaves>
