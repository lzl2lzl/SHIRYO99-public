import test from 'node:test'
import assert from 'node:assert/strict'
import { captureSave, parseSave, copySave, saveSummary, METERS_PER_WORLD_UNIT, MAX_SAVE_BYTES } from '../src/games/rowing/saves/format.ts'
import { createRowing, tickRowing, row, START_MINUTE } from '../src/games/rowing/model.ts'
import { upgradeAt } from '../src/games/rowing/progression/catalog.ts'
import { BIRTHDAY_LINES } from '../src/games/rowing/calendar-dialogue.ts'
import { DAILY_LINES } from '../src/games/rowing/daily-dialogue.ts'
import { LEVEL_UP_SECONDS } from '../src/games/rowing/progression/state.ts'
const identity={runId:'test-run',startedAt:'2026-10-26T00:00:00.000Z'}
const snapshot=s=>captureSave(identity,s,480,'2026-10-26T01:00:00.000Z')
const wait=(s,seconds)=>{for(let i=0;i<Math.round(seconds*100);i++)tickRowing(s,.01,()=>.99)}

test('full-day live snapshots remain valid across traffic recycling, collisions and scheduled dialogue',()=>{
  let seed=1749;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  let s=createRowing(random)
  for(let i=0;i<8000;i++){
    if(i%7===0)row(s,'shiro',random);if(i%11===0)row(s,'ryo',random)
    tickRowing(s,.1,random)
    if(i%10===0)s=copySave(snapshot(s)).state
  }
  assert.ok(s.minutes>START_MINUTE+1440)
})

test('new game, onboarding and long-running state round-trip through exported JSON',()=>{
  for(const opening of [false,true]){
    const s=createRowing(()=>.5,opening)
    for(let i=0;i<80;i++){
      if(i%3===0)row(s,'shiro');if(i%4===0)row(s,'ryo',()=>.99)
      wait(s,.25)
      const save=snapshot(s),restored=parseSave(JSON.stringify(save))
      assert.deepEqual(restored,save)
      assert.equal(restored.state.minutes,s.minutes);assert.equal(restored.state.activeSeconds,s.activeSeconds)
      assert.equal(restored.state.distance,s.distance)
    }
  }
})

test('negative infinity timers survive as safe numeric sentinels, not null',()=>{
  const restored=copySave(snapshot(createRowing())).state
  assert.equal(restored.ryoMood.lastReverse,-1e12);assert.equal(restored.daily.lastFinished,-1e12)
  assert.equal(restored.skills.lastPairAt,-1e12)
  for(let i=0;i<3;i++){assert.equal(row(restored,'ryo',()=>.99),'stroke');wait(restored,.75)}
  assert.equal(restored.ryoMood.speech,'tired')
})

test('restoring ongoing school, birthday and chief dialogue keeps exact line and timers',()=>{
  for(const kind of ['school','birthday','chief']){
    const s=createRowing(()=>.99);s.eveningSeen=true;s.effort=true;s.minutes=START_MINUTE+8*1440
    if(kind==='school')s.daily.chat={kind:'school',day:8,lines:structuredClone(DAILY_LINES.school),line:5,age:1.2}
    if(kind==='birthday')s.calendar.chat={key:'2004-8-24',birthday:'shiro',lines:structuredClone(BIRTHDAY_LINES.shiro),line:8,age:.9}
    if(kind==='chief'){s.chiefVisit={boatId:s.couples[0].id,surname:'佐藤',line:4,age:.8,masked:true,done:false};s.couples[0].y=s.cameraY+220;s.couples[0].x=90}
    const a=copySave(snapshot(s)).state,b=copySave(snapshot(s)).state
    wait(a,2);wait(b,2)
    assert.deepEqual(a,b)
    assert.equal(a.minutes,b.minutes)
    if(kind==='school')assert.ok(a.daily.chat.line>=5)
    if(kind==='birthday')assert.ok(a.calendar.chat.line>=8)
    if(kind==='chief')assert.equal(a.chiefVisit.masked,true)
  }
})

test('saved upgrade is neither awarded again nor skipped and first reverse stays one-time',()=>{
  const s=createRowing(()=>.99);s.eveningSeen=true;s.effort=true;s.couples=[];s.trafficNextAt=Infinity;s.coupleChatNextAt=Infinity
  s.minutes=upgradeAt(1)-.02;tickRowing(s,.02,()=>.99)
  assert.equal(s.progression.presentation.week,1)
  const restored=copySave(snapshot(s)).state
  assert.equal(restored.progression.presentation.week,1);wait(restored,LEVEL_UP_SECONDS+.2)
  assert.equal(restored.progression.presentation,null);assert.deepEqual(restored.progression.pending,[])
  assert.equal(restored.progression.level,1)
  restored.minutes=23*60+7*1440;row(restored,'ryo',()=>.52)
  const again=copySave(snapshot(restored)).state;wait(again,2)
  assert.equal(row(again,'ryo',()=>.52),'reverse');assert.equal(again.ryoMood.speech,null)
})

test('rejects wrong games, future versions, oversized files, invalid numbers and broken story references',()=>{
  const valid=snapshot(createRowing(()=>.99))
  for(const mutate of [s=>s.format='different-game',s=>s.version=999,s=>s.state.minutes=null,s=>s.state.x='NaN',s=>s.state.minutes=-1,
    s=>s.state.calendar.chat={key:'x',birthday:'shiro',lines:[],line:0,age:0},
    s=>s.state.chiefVisit={boatId:9999,surname:'佐藤',line:0,age:0,masked:false,done:false},
    s=>s.state.progression={level:1,pending:[],presentation:null},
    s=>s.state.ryoMood.pending=['made-up-line'],s=>s.state.couples.push(s.state.couples[0]),
    s=>Object.defineProperty(s.state,'__proto__',{value:{polluted:true},enumerable:true})]){
    const altered=structuredClone(valid);mutate(altered);assert.throws(()=>parseSave(JSON.stringify(altered)))
  }
  assert.throws(()=>parseSave('{'));assert.throws(()=>parseSave(' '.repeat(MAX_SAVE_BYTES+1)))
  assert.equal({}.polluted,undefined)
})

test('records complete simulated days, foreground time and fixed-scale paddle distance only',()=>{
  const s=createRowing(()=>.99);s.couples=[];s.trafficNextAt=Infinity;s.coupleChatNextAt=Infinity
  wait(s,2);assert.equal(s.distance,0);assert.ok(s.y>370,'Current moves the boat but earns no rowing metres')
  s.minutes=START_MINUTE+2*1440+700;s.distance=1000;s.activeSeconds=3661
  const summary=saveSummary(s)
  assert.equal(summary.days,2);assert.equal(summary.meters,1000*METERS_PER_WORLD_UNIT);assert.equal(summary.played,'1小时1分')
  const meters=summary.meters;s.cameraX+=10000;s.cameraY+=10000;s.heading+=100
  assert.equal(saveSummary(s).meters,meters)
  const before=s.activeSeconds;tickRowing(s,0);tickRowing(s,NaN);assert.equal(s.activeSeconds,before)
})
