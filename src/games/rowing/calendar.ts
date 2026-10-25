/** Game calendar: dates use UTC arithmetic so the simulated Japanese date never depends on the device zone.
 * National holidays: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 * Equinox forecasts (2026–2050): https://www.nao.ac.jp/faq/a0301.html
 * Traffic increases are game design, not a forecast of real boating attendance. */
import { HISTORICAL_HOLIDAYS } from './historical-holidays.ts'
export const CALENDAR_EPOCH = Date.UTC(2004, 3, 7)
const DAY_MS = 86400000
const spring = [20,21,20,20,20,21,20,20,20,21,20,20,20,21,20,20,20,21,20,20,20,21,20,20,20]
const autumn = [23,23,22,23,23,23,22,23,23,23,22,23,23,23,22,23,23,23,22,22,23,23,22,22,23]
const years = new Map<number, Map<string, string>>()
const key = (month: number, day: number) => `${month}-${day}`
export function japaneseHolidays(year: number): ReadonlyMap<string, string> {
  const cached = years.get(year)
  if (cached) return cached
  const historical = HISTORICAL_HOLIDAYS[year]
  if (historical) {
    const dates = new Map(historical.split('|').map(entry => {
      const [date, name] = entry.split(':')
      return [date, name] as const
    }))
    if (years.size >= 4) years.delete(years.keys().next().value!)
    years.set(year, dates)
    return dates
  }
  const dates = new Map<string, string>()
  const add = (m: number, d: number, name: string) => dates.set(key(m, d), name)
  for (const [m,d,name] of [[1,1,'元日'],[2,11,'建国纪念日'],[2,23,'天皇诞生日'],[4,29,'昭和日'],[5,3,'宪法纪念日'],[5,4,'绿之日'],[5,5,'儿童节'],[8,11,'山之日'],[11,3,'文化日'],[11,23,'勤劳感谢日']] as const) add(m,d,name)
  for (const [m,n,name] of [[1,2,'成人日'],[7,3,'海之日'],[9,3,'敬老日'],[10,2,'体育日']] as const) {
    const first = new Date(Date.UTC(year,m-1,1)).getUTCDay()
    add(m, 1 + (8-first)%7 + (n-1)*7, name)
  }
  // Only include sourced equinox forecasts within their stated range; fixed annual rules continue beyond it.
  if (year >= 2026 && year <= 2050) { add(3,spring[year-2026],'春分日'); add(9,autumn[year-2026],'秋分日') }
  const base = new Map(dates)
  const dayKey = (time: number) => { const d = new Date(time); return key(d.getUTCMonth()+1,d.getUTCDate()) }
  const start = Date.UTC(year,0,1), end = Date.UTC(year+1,0,1)
  for (let time=start+DAY_MS; time<end-DAY_MS; time+=DAY_MS) {
    if (!base.has(dayKey(time)) && base.has(dayKey(time-DAY_MS)) && base.has(dayKey(time+DAY_MS))) dates.set(dayKey(time),'国民休日')
  }
  for (const date of base.keys()) {
    const [m,d] = date.split('-').map(Number), time=Date.UTC(year,m-1,d)
    if (new Date(time).getUTCDay() !== 0) continue
    let next = time + DAY_MS
    while (dates.has(dayKey(next))) next += DAY_MS
    dates.set(dayKey(next),'补休')
  }
  if (years.size >= 4) years.delete(years.keys().next().value!)
  years.set(year,dates)
  return dates
}
export interface CalendarDay {
  year: number; month: number; date: number; key: string; holiday?: string; occasion?: string
  busy: boolean; allDayRomance: boolean; birthday: 'shiro' | 'ryo' | null
}
let lastDay = NaN, lastValue: CalendarDay
export function calendarAt(minutes: number): CalendarDay {
  const day = Math.floor(minutes / 1440)
  if (day === lastDay) return lastValue
  const date = new Date(CALENDAR_EPOCH + day*DAY_MS), year=date.getUTCFullYear(), m=date.getUTCMonth()+1, d=date.getUTCDate()
  const holiday = japaneseHolidays(year).get(key(m,d))
  const occasions: Record<string,string> = {'2-14':'情人节','3-14':'白色情人节','7-7':'七夕','12-24':'平安夜','12-25':'圣诞节'}
  const occasion = occasions[key(m,d)]
  const golden = m===4 && d>=29 || m===5 && d<=5
  const obon = m===8 && d>=13 && d<=16
  const newYear = m===12 && d>=29 || m===1 && d<=3
  lastDay = day
  lastValue = { year, month:m, date:d, key:date.toISOString().slice(0,10), holiday, occasion,
    busy:Boolean(holiday || occasion || golden || obon || newYear), allDayRomance:(m===2 || m===3) && d===14,
    birthday:m===8 && d===24 ? 'shiro' : m===9 && d===9 ? 'ryo' : null }
  return lastValue
}
