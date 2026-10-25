import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_EPOCH, calendarAt, japaneseHolidays } from '../src/games/rowing/calendar.ts'
import { BIRTHDAY_LINES, HOLIDAY_GREETINGS, CELEBRATION_SECONDS, createCalendarDialogue, tickCalendarDialogue } from '../src/games/rowing/calendar-dialogue.ts'
import { createRowing, tickRowing, row } from '../src/games/rowing/model.ts'
import { coupleTarget } from '../src/games/rowing/couples.ts'
import { dailyLineSeconds } from '../src/games/rowing/daily-dialogue.ts'

const at = (date) => (Date.parse(date+'Z')-CALENDAR_EPOCH)/60000

test('2004 story epoch and historical Japanese holidays agree with published dates', () => {
  assert.equal(calendarAt(createRowing().minutes).key, '2004-04-07')
  assert.equal(calendarAt(1440).key, '2004-04-08')
  assert.deepEqual([...japaneseHolidays(2004).keys()].sort(), ['1-1','1-12','2-11','3-20','4-29','5-3','5-4','5-5','7-19','9-20','9-23','10-11','11-3','11-23','12-23'].sort())
  assert.equal(japaneseHolidays(2004).has('2-23'), false)
  assert.equal(japaneseHolidays(2004).has('8-11'), false)
  assert.equal(japaneseHolidays(2007).has('5-6'), false)
  assert.equal(japaneseHolidays(2019).has('5-1'), true)
  assert.equal(japaneseHolidays(2020).has('7-23'), true)
  assert.equal(japaneseHolidays(2021).has('8-9'), true)
  assert.equal(calendarAt(at('2008-02-29T23:59')).key, '2008-02-29')
  assert.equal(calendarAt(at('2008-03-01T00:00')).key, '2008-03-01')
})

test('2026 and 2027 holidays match the Cabinet Office including substitute and citizen holidays', () => {
  const expected = {
    2026:['1-1','1-12','2-11','2-23','3-20','4-29','5-3','5-4','5-5','5-6','7-20','8-11','9-21','9-22','9-23','10-12','11-3','11-23'],
    2027:['1-1','1-11','2-11','2-23','3-21','3-22','4-29','5-3','5-4','5-5','7-19','8-11','9-20','9-23','10-11','11-3','11-23'],
  }
  for (const [year, dates] of Object.entries(expected)) assert.deepEqual([...japaneseHolidays(Number(year)).keys()].sort(), dates.sort())
  assert.equal(japaneseHolidays(2026).get('9-22'),'国民休日')
  assert.equal(japaneseHolidays(2026).get('5-6'),'补休')
  assert.equal(japaneseHolidays(2027).get('3-22'),'补休')
  assert.equal(japaneseHolidays(2045).get('9-22'),'秋分日')
  assert.equal(japaneseHolidays(2049).get('9-22'),'秋分日')
})

test('holiday traffic includes seasonal breaks and romance days without labeling them statutory holidays', () => {
  for (const date of ['2026-04-29','2026-04-30','2026-05-06','2026-07-07','2026-08-13','2026-08-16','2026-09-22','2026-12-24','2026-12-25','2026-12-30','2027-01-03']) {
    assert.equal(coupleTarget(at(date+'T09:00')),9,date)
    assert.equal(coupleTarget(at(date+'T14:00')),9,date)
    assert.equal(coupleTarget(at(date+'T03:00')),0,date)
  }
  assert.equal(calendarAt(at('2026-12-25T12:00')).holiday,undefined)
  assert.equal(calendarAt(at('2026-08-15T12:00')).holiday,undefined)
  assert.equal(coupleTarget(at('2026-04-02T09:00')),3)
})

test('Valentine traffic runs for all 24 hours and ends on the next date', () => {
  for (const month of ['02','03']) for (const time of ['00:00','03:00','06:00','12:00','23:59']) assert.equal(coupleTarget(at(`2027-${month}-14T`+time)),9)
  const g=createRowing(()=>.2);g.minutes=at('2027-02-14T03:00');g.eveningSeen=true
  tickRowing(g,.01,()=>.2);assert.ok(g.couples.length>0)
  g.minutes=at('2027-02-15T00:00');tickRowing(g,.01,()=>.2);assert.equal(g.couples.length,0)
})

test('both birthday scripts start exactly on their simulated midnight, once per year', () => {
  for (const year of [2004,2005,2026,2027,2028]) for (const [date,who,count] of [['08-24','shiro',12],['09-09','ryo',10]]) {
    const midnight=at(`${year}-${date}T00:00`),s=createCalendarDialogue()
    tickCalendarDialogue(s,midnight-2,midnight-1,.1,false);assert.equal(s.chat,null)
    tickCalendarDialogue(s,midnight-.01,midnight,.01,false)
    assert.equal(s.chat.birthday,who);assert.equal(s.chat.lines.length,count)
    for (const [i,line] of BIRTHDAY_LINES[who].entries()) {
      assert.equal(s.chat.line,i);assert.equal(s.celebration,null)
      const duration=dailyLineSeconds(line)
      tickCalendarDialogue(s,midnight,midnight,duration-.01,false);assert.equal(s.chat.line,i)
      tickCalendarDialogue(s,midnight,midnight,.02,false)
    }
    assert.equal(s.chat,null);assert.equal(s.celebration.birthday,who);assert.equal(s.celebration.age,0)
    tickCalendarDialogue(s,midnight,midnight+1,CELEBRATION_SECONDS+.1,false)
    assert.equal(s.celebration,null);assert.equal(s.chat,null)
    tickCalendarDialogue(s,midnight+1,midnight+2,.1,false);assert.equal(s.chat,null)
  }
  assert.equal(BIRTHDAY_LINES.shiro[0].text,'今天是几月几日了。')
  assert.equal(BIRTHDAY_LINES.shiro.at(-1).text,'：）')
  assert.equal(BIRTHDAY_LINES.ryo.at(-2).text,'这样啊，一直辛苦你了。')
  assert.equal(BIRTHDAY_LINES.ryo.at(-1).text,'不需要你同情。')
})

test('birthday dialogue and finite celebration never disable rowing; no paused time catches up', () => {
  const g=createRowing(()=>.2);g.minutes=at('2026-08-23T23:59:59');g.eveningSeen=true;g.effort=true
  tickRowing(g,.1,()=>.2);assert.equal(g.calendar.chat.birthday,'shiro')
  assert.equal(row(g,'shiro'),'stroke');assert.equal(row(g,'ryo',()=>0),'stroke')
  const before=g.minutes,chat=structuredClone(g.calendar)
  for(const dt of [0,NaN,Infinity,-1]) tickRowing(g,dt,()=>.2)
  assert.deepEqual(g.calendar,chat)
  tickRowing(g,.1,()=>.2);assert.ok(g.minutes>before);assert.ok(g.calendar.chat.age>0)
  g.calendar.chat.line=BIRTHDAY_LINES.shiro.length-1;g.calendar.chat.age=3.2
  tickRowing(g,.1,()=>.2);assert.equal(g.calendar.celebration.age,0)
  const age=g.calendar.celebration.age;tickRowing(g,999999,()=>.2)
  assert.ok(g.calendar.celebration.age-age<=.1)
  assert.deepEqual(createRowing().calendar,createCalendarDialogue())
})

test('holiday greetings wait for speech, occur once, and do not queue yesterday greetings', () => {
  for(const [date,config] of Object.entries(HOLIDAY_GREETINGS)) {
    const [month,day]=date.split('-').map(n=>n.padStart(2,'0'))
    const time=at(`2027-${month}-${day}T${String(config.hour).padStart(2,'0')}:00`),s=createCalendarDialogue()
    tickCalendarDialogue(s,time-.01,time,.01,true);assert.equal(s.chat,null);assert.equal(s.pending.lines[0].text,config.text)
    tickCalendarDialogue(s,time,time+.1,.01,false);assert.equal(s.chat.lines[0].text,config.text)
    tickCalendarDialogue(s,time+.1,time+1,20,false);assert.equal(s.chat,null);assert.equal(s.pending,null);assert.equal(s.celebration,null)
  }
  const s=createCalendarDialogue(),time=at('2027-12-25T09:00')
  tickCalendarDialogue(s,time-.1,time,.1,true)
  tickCalendarDialogue(s,time,time+1440,.1,false);assert.equal(s.pending,null);assert.equal(s.chat,null)
})
