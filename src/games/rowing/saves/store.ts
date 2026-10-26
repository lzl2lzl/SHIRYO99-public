import { validateSave, type SaveFile } from './format.ts'

export const SLOT_IDS = ['auto', 'slot-1', 'slot-2', 'slot-3'] as const
export type SlotId = typeof SLOT_IDS[number]
export interface SaveSlot { slot: SlotId; revision: number; data: SaveFile }
export interface SlotView { slot: SlotId; revision: number; data: SaveFile | null; damaged?: boolean }
export interface SaveWrite { slot: SlotId; expectedRevision: number; data: SaveFile }
export class SaveConflict extends Error { constructor() { super('另一个页面已更新这个存档。请重新读取，或将本页进度另存到其他档位。') } }
const DATABASE = 'shiryo99-rowing-saves-v1'

export class SaveStore {
  private opening: Promise<IDBDatabase> | null = null
  private open() {
    if (!this.opening) this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest, blocked=false
      try { request = indexedDB.open(DATABASE, 1) } catch { reject(new Error('浏览器无法使用本地存档。仍可游玩并导出备份。')); return }
      request.onupgradeneeded = () => request.result.createObjectStore('slots', { keyPath: 'slot' })
      request.onerror = () => reject(new Error('无法打开本地存档。请检查浏览器的存储设置。'))
      request.onblocked = () => { blocked=true; reject(new Error('存档正在被其他页面使用，请关闭旧页面后重试。')) }
      request.onsuccess = () => { const db=request.result; if(blocked){db.close();return} db.onversionchange=()=>{db.close();this.opening=null}; resolve(db) }
    }).catch(error => { this.opening=null; throw error })
    return this.opening
  }
  async list(): Promise<SlotView[]> {
    const db = await this.open()
    const rows = await new Promise<SaveSlot[]>((resolve,reject) => {
      const tx=db.transaction('slots','readonly'), req=tx.objectStore('slots').getAll()
      tx.oncomplete=()=>resolve(req.result); tx.onabort=()=>reject(tx.error ?? new Error('无法读取存档。'))
    })
    return SLOT_IDS.map(slot => {
      const row=rows.find(r=>r.slot===slot)
      if (!row) return {slot,revision:0,data:null}
      try { return {slot,revision:row.revision,data:validateSave(row.data)} }
      catch { return {slot,revision:row.revision,data:null,damaged:true} }
    })
  }
  /** Compare revisions and commit all writes atomically, including backup + new game. */
  async write(writes: SaveWrite[]): Promise<void> {
    writes = writes.map(write => ({ ...write, data: validateSave(write.data) }))
    if (new Set(writes.map(w=>w.slot)).size!==writes.length) throw new Error('不能同时写入同一档位。')
    const db=await this.open()
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('slots','readwrite'), store=tx.objectStore('slots')
      let count=0, failure: Error | null=null
      tx.oncomplete=()=>resolve()
      tx.onabort=()=>reject(failure ?? new Error('存档没有保存成功。请导出备份，或检查浏览器剩余存储空间。'))
      for(const write of writes) {
        const req=store.get(write.slot)
        req.onsuccess=()=>{
          if(failure)return
          if((req.result?.revision ?? 0)!==write.expectedRevision){failure=new SaveConflict();tx.abort();return}
          if(++count===writes.length) try {
            for(const next of writes) store.put({slot:next.slot,revision:next.expectedRevision+1,data:next.data})
          } catch { tx.abort() }
        }
      }
    })
  }
}
