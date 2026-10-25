import { calendarAt } from './calendar.ts'
import { dailyLineSeconds, type DailyLine } from './daily-dialogue.ts'

export const BIRTHDAY_LINES = {
  shiro: [
    {who:'ryo',text:'今天是几月几日了。'},
    {who:'shiro',text:'不知道啊，手机没电了。'},
    {who:'ryo',text:'我有上帝视角，我知道今天是8月24日。'},
    {who:'shiro',text:'哦，好像是我生日吗？'},
    {who:'ryo',text:'难道你连这种事都不记得？你真是老年痴呆了。'},
    {who:'shiro',text:'才反应过来。'},
    {who:'shiro',text:'了くん原来一直都记得我生日吗？'},
    {who:'ryo',text:'……'},
    {who:'ryo',text:'只是偶然知道的，因为我有上帝视角。'},
    {who:'shiro',text:'谢谢你一直记得。'},
    {who:'ryo',text:'都说了只是偶然！'},
    {who:'shiro',text:'：）'},
  ],
  ryo: [
    {who:'shiro',text:'生日快乐，了くん。'},
    {who:'ryo',text:'真不敢相信这种日子我竟然一边吹风一边跟你这家伙呆在船上？？？'},
    {who:'shiro',text:'哈哈，好惨。'},
    {who:'ryo',text:'哦。'},
    {who:'shiro',text:'我会为你默哀的。'},
    {who:'ryo',text:'哼。'},
    {who:'ryo',text:'不过这样就不用见到那群恶心的家伙了，终于过了一个清净的生日。'},
    {who:'shiro',text:'啊。'},
    {who:'shiro',text:'这样啊，一直辛苦你了。'},
    {who:'ryo',text:'不需要你同情。'},
  ],
} satisfies Record<string,DailyLine[]>

// New holiday greetings requested for this feature; existing story lines are untouched.
export const HOLIDAY_GREETINGS: Record<string, { hour:number; text:string }> = {
  '1-1': {hour:0,text:'新年快乐，了くん。'},
  '2-14': {hour:9,text:'情人节快乐，了くん。'},
  '3-14': {hour:9,text:'白色情人节快乐，了くん。'},
  '7-7': {hour:18,text:'七夕快乐，了くん。'},
  '11-23': {hour:9,text:'今天是勤劳感谢日。一直以来辛苦了，了くん。'},
  '12-25': {hour:9,text:'圣诞快乐，了くん。'},
}
export interface CalendarChat { key:string; birthday:'shiro'|'ryo'|null; lines:DailyLine[]; line:number; age:number }
export interface Celebration { birthday:'shiro'|'ryo'; age:number }
export interface CalendarDialogue { chat:CalendarChat|null; pending:CalendarChat|null; celebration:Celebration|null }
export const CELEBRATION_SECONDS = 7.1
export const createCalendarDialogue = (): CalendarDialogue => ({chat:null,pending:null,celebration:null})

/** Crossed date boundaries are keyed to the running game clock, never to the real device date. */
export function tickCalendarDialogue(state:CalendarDialogue, previous:number, minutes:number, dt:number, blocked:boolean) {
  if (!Number.isFinite(dt) || dt<=0 || minutes<previous) return
  if (state.celebration) {
    state.celebration.age += dt
    if (state.celebration.age >= CELEBRATION_SECONDS) state.celebration = null
  }
  if (state.chat) {
    state.chat.age += dt
    if (state.chat.age >= dailyLineSeconds(state.chat.lines[state.chat.line])) {
      state.chat.age = 0; state.chat.line++
      if (state.chat.line >= state.chat.lines.length) {
        if (state.chat.birthday) state.celebration = {birthday:state.chat.birthday,age:0}
        state.chat = null
      }
    }
  }
  const dayNumber=Math.floor(minutes/1440), day=calendarAt(minutes), midnight=dayNumber*1440
  if (previous<midnight && minutes>=midnight && day.birthday) {
    state.chat = {key:day.key,birthday:day.birthday,lines:BIRTHDAY_LINES[day.birthday],line:0,age:0}
    state.pending = null
  }
  const greeting=HOLIDAY_GREETINGS[`${day.month}-${day.date}`]
  if (greeting && previous<midnight+greeting.hour*60 && minutes>=midnight+greeting.hour*60) {
    state.pending = {key:day.key,birthday:null,lines:[{who:'shiro',text:greeting.text}],line:0,age:0}
  }
  if (state.pending && state.pending.key!==day.key) state.pending=null
  if (!state.chat && state.pending && !blocked) {state.chat=state.pending;state.pending=null}
}
