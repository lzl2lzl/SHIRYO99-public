import test from 'node:test'
import assert from 'node:assert/strict'
import { acquiredSkills, skillTone, skillTitle, IMPLEMENTED_WEEK, upgradeAt } from '../src/games/rowing/progression/catalog.ts'
import { createRowing, tickRowing, row } from '../src/games/rowing/model.ts'
import { captureSave, copySave } from '../src/games/rowing/saves/format.ts'
import { revealFrame, READ_UNTIL, CONDENSE_UNTIL, FLY_UNTIL, LEVEL_UP_SECONDS } from '../src/games/rowing/progression/presentation.ts'

test('tree derives all and only awarded, implemented abilities with effects and ownership colors',()=>{
  assert.deepEqual(acquiredSkills(0),[])
  for(let level=1;level<=IMPLEMENTED_WEEK;level++){
    const skills=acquiredSkills(level)
    assert.deepEqual(skills.map(s=>s.week),Array.from({length:level},(_,i)=>i+1))
    assert.ok(skills.every(s=>skillTitle(s)&&s.ability.summary&&s.ability.usage))
  }
  assert.equal(acquiredSkills(26).length,IMPLEMENTED_WEEK)
  assert.deepEqual(acquiredSkills(4).map(s=>skillTone(s.owner)),['silver','violet','woven','woven'])
})

test('reveal explains before condensing and light lands on the measured tree entry at any size',()=>{
  for(const [w,h] of [[320,640],[560,900],[390,844]]){
    const start={x:w/2,y:h*.3},end={x:w-80,y:h-40}
    const read=revealFrame(READ_UNTIL-.01,start,end)
    assert.equal(read.phase,'read');assert.equal(read.textOpacity,1);assert.equal(read.lightOpacity,0)
    const gather=revealFrame((READ_UNTIL+CONDENSE_UNTIL)/2,start,end)
    assert.equal(gather.phase,'condense');assert.ok(gather.textScale<1);assert.deepEqual(gather.position,start)
    const flight=revealFrame((CONDENSE_UNTIL+FLY_UNTIL)/2,start,end)
    assert.equal(flight.phase,'fly');assert.equal(flight.textOpacity,0);assert.equal(flight.lightOpacity,1)
    assert.ok(flight.position.y<end.y)
    const arrival=revealFrame(FLY_UNTIL,start,end)
    assert.equal(arrival.phase,'arrive');assert.deepEqual(arrival.position,end)
    assert.equal(revealFrame(LEVEL_UP_SECONDS,start,end).lightOpacity,0)
    for(let age=0;age<LEVEL_UP_SECONDS;age+=.02){
      const reduced=revealFrame(age,start,end,true)
      assert.equal(reduced.textScale,1);assert.equal(reduced.lightOpacity,0)
    }
  }
})

test('each reveal phase survives saves, dialogue interruptions and continued rowing without a second award',()=>{
  const origin={x:160,y:253},target={x:240,y:804}
  for(const age of [.7,3.05,3.7,4.1]){
    const s=createRowing(()=>.99);s.minutes=upgradeAt(4)+.01;s.eveningSeen=true;s.effort=true
    s.couples=[];s.trafficNextAt=Infinity;s.coupleChatNextAt=Infinity
    s.progression={level:4,pending:[],presentation:{week:4,phase:'reveal',line:0,age}}
    const restored=copySave(captureSave({runId:'tree-test',startedAt:'2026-10-26T00:00:00Z'},s,480,'2026-10-26T01:00:00Z')).state
    assert.deepEqual(acquiredSkills(restored.progression.level),acquiredSkills(s.progression.level))
    assert.deepEqual(revealFrame(restored.progression.presentation.age,origin,target),revealFrame(age,origin,target))
    restored.daily.chat={kind:'tired',day:28,lines:[{who:'ryo',text:'我累了。'}],line:0,age:0}
    tickRowing(restored,.1,()=>.99);assert.equal(restored.progression.presentation.age,age)
    restored.daily.chat=null;assert.equal(row(restored,'shiro'),'stroke')
    for(let i=0;i<Math.ceil((LEVEL_UP_SECONDS-age)*10)+2;i++)tickRowing(restored,.1,()=>.99)
    assert.equal(restored.progression.presentation,null);assert.equal(restored.progression.level,4)
    assert.deepEqual(restored.progression.pending,[])
  }
})
