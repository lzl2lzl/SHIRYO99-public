import test from 'node:test'
import assert from 'node:assert/strict'
import { createRowing, row, tickRowing, ryoForwardChance } from '../src/games/rowing/model.ts'
import { createSkillRuntime, recordForwardStroke, strokeTechnique } from '../src/games/rowing/progression/skills.ts'
import { createEvolution, forwardTechnique, pairTechnique, tickEvolution, movementProfile, speedLimit, realmAltitude, craftScale } from '../src/games/rowing/progression/evolution.ts'
import { SKILLS, skillTitle, upgradeAt } from '../src/games/rowing/progression/catalog.ts'
import { createProgression, unlockDueSkills, tickProgression, LEVEL_UP_SECONDS } from '../src/games/rowing/progression/state.ts'
import { captureSave, copySave, validateSave, SAVE_VERSION } from '../src/games/rowing/saves/format.ts'
import { hullContact } from '../src/games/rowing/couples.ts'
const motion=()=>({x:195,y:370,speed:25,spin:1.3,heading:0})
const at=level=>{const s=createRowing(()=>.99);s.progression=createProgression(level);s.minutes=upgradeAt(Math.max(1,level))+30;s.eveningSeen=true;s.effort=true;s.couples=[];s.trafficNextAt=1e12;s.coupleChatNextAt=1e12;return s}
const step=(s,seconds)=>{for(let i=0;i<Math.round(seconds*10);i++)tickRowing(s,.1,()=>.99)}
const save=s=>captureSave({runId:'evolution',startedAt:'2026-10-26T00:00:00Z'},s,480,'2026-10-26T01:00:00Z')

test('weeks 5–8 correct rotation, prioritize safe braking and consume real stored rotation once',()=>{
  const a=motion(),b=motion();forwardTechnique(createEvolution(),a,4,'shiro',10);forwardTechnique(createEvolution(),b,5,'shiro',10);assert.ok(Math.abs(b.spin)<Math.abs(a.spin))
  const c=motion(),e=createEvolution();forwardTechnique(e,c,6,'ryo',10);assert.ok(c.spin<1.3);assert.ok(e.tailUntil>10)
  const r=createSkillRuntime(),fast={speed:77,spin:1,heading:.8};r.evolution.charge=50
  recordForwardStroke(r,fast,8,'shiro',10);recordForwardStroke(r,fast,8,'ryo',10.1)
  assert.ok(fast.speed<50);assert.ok(Math.abs(fast.spin)<.1);assert.equal(r.evolution.charge,50);assert.equal(r.dashUntil,10.1)
  const energy=createEvolution(),m=motion();for(let i=0;i<100;i++)tickEvolution(energy,8,i*.1,.1,m)
  assert.ok(energy.charge>0&&energy.charge<=100);const charge=energy.charge
  pairTechnique(energy,m,8,11,1);assert.ok(m.speed>=25+charge*.45);assert.equal(energy.charge,0)
  const before=m.speed;pairTechnique(energy,m,8,12,1);assert.equal(m.speed,before)
  m.spin=0;tickEvolution(energy,8,13,.1,m);assert.equal(energy.charge,0)
})

test('weeks 9–12 steer away from a forward obstacle, bound tail bursts, surf, then physically lift on foils',()=>{
  const m=motion(),e=createEvolution();forwardTechnique(e,m,9,'shiro',10,[{x:225,y:240}]);assert.ok(m.heading<0);assert.ok(m.speed<25)
  const plain=motion(),burst=motion();forwardTechnique(createEvolution(),plain,9,'ryo',10,[],.1);forwardTechnique(e,burst,10,'ryo',10,[],.1);assert.ok(burst.speed>plain.speed+20)
  const before=burst.speed;forwardTechnique(e,burst,10,'ryo',11,[],.1);assert.equal(burst.speed,before)
  pairTechnique(e,m,11,20,2);assert.ok(e.surfUntil>20);assert.ok(movementProfile(11,e,20).drag<movementProfile(10,createEvolution(),20).drag)
  m.speed=50;for(let i=0;i<30;i++)tickEvolution(e,12,30+i*.1,.1,m);assert.ok(e.altitude>10);assert.ok(speedLimit(12)>speedLimit(11))
  m.speed=0;for(let i=0;i<50;i++)tickEvolution(e,12,40+i*.1,.1,m);assert.ok(e.altitude<.1)
})

test('weeks 13–16 stabilize and prolong real flight, clear low boats, land, and transition into cloud cruising',()=>{
  const e=createEvolution();e.altitude=12;const m=motion(),base=motion();forwardTechnique(e,m,13,'shiro',10);forwardTechnique({...e},base,12,'shiro',10);assert.ok(m.spin<base.spin)
  forwardTechnique(e,m,14,'ryo',10);assert.ok(e.airUntil>10)
  pairTechnique(e,m,15,20,3);assert.ok(e.airUntil>=24);for(let i=0;i<15;i++)tickEvolution(e,15,20+i*.1,.1,m)
  assert.ok(e.altitude>50);assert.equal(movementProfile(15,e,21).airborne,true)
  e.airUntil=0;m.speed=0;for(let i=0;i<40;i++)tickEvolution(e,15,30+i*.1,.1,m);assert.equal(movementProfile(15,e,34).airborne,false)
  for(let i=0;i<80;i++)tickEvolution(e,16,40+i*.1,.1,m);assert.ok(e.realmMix>.99);assert.ok(e.altitude>70)
  assert.equal(movementProfile(16,e,50).airborne,false,'Neighbours share the cloud cruising plane')
  const s=at(15);s.skills.evolution.altitude=60;s.skills.evolution.airUntil=100;s.elapsed=10;s.couples=[{id:0,x:s.x,y:s.y,heading:0}];s.nextCoupleId=1
  tickRowing(s,.01,()=>.99);assert.equal(s.collisions,0)
})

test('weeks 17–20 leave directional star trails, add real tail thrust and meteor travel, then enter the galaxy',()=>{
  const e=createEvolution(),m=motion();forwardTechnique(e,m,17,'shiro',10);assert.ok(e.starUntil>10)
  const speed=m.speed;forwardTechnique(e,m,18,'ryo',10,[],.99);assert.ok(m.speed>speed);assert.ok(e.tailStarsUntil>10)
  m.spin=0;pairTechnique(e,m,19,11,1);assert.ok(e.meteorUntil>11);assert.ok(m.speed>speed+25)
  assert.ok(movementProfile(19,e,11).drag<movementProfile(18,createEvolution(),11).drag)
  for(let i=0;i<100;i++)tickEvolution(e,20,20+i*.1,.1,m);assert.ok(e.realmMix>1.99);assert.ok(e.altitude>108)
  assert.ok(speedLimit(20)>speedLimit(19))
})

test('weeks 21–26 add controlled turning, binary propulsion and three distinct mechanical upgrades',()=>{
  const m=motion(),e=createEvolution();m.speed=90;const previous=structuredClone(m);forwardTechnique(e,m,21,'shiro',10);forwardTechnique(createEvolution(),previous,20,'shiro',10);assert.ok(m.spin<previous.spin)
  const heading=m.heading;forwardTechnique(e,m,22,'ryo',10,[],.99);assert.notEqual(m.heading,heading)
  m.spin=0;const a=structuredClone(m),b=structuredClone(m);pairTechnique(createEvolution(),a,22,10,1);pairTechnique(e,b,23,10,1);assert.ok(b.speed>a.speed);assert.ok(e.binaryUntil>10)
  for(const level of [24,25,26]){
    assert.ok(strokeTechnique(level,'shiro',false).thrust>strokeTechnique(level-1,'shiro',false).thrust)
    assert.ok(speedLimit(level)>speedLimit(level-1))
    for(let i=0;i<60;i++)tickEvolution(e,level,30+i*.1,.1,m)
    assert.ok(Math.abs(e.form-(level-23))<.01)
  }
  assert.ok(craftScale(e)>1.14)
  assert.ok(hullContact({x:0,y:0,heading:0,scale:craftScale(e)},{x:160,y:0,heading:0}).distance<hullContact({x:0,y:0,heading:0},{x:160,y:0,heading:0}).distance)
  assert.ok(movementProfile(26,e,50).turnLoss<movementProfile(25,e,50).turnLoss)
})

test('all 26 upgrades present in order including week 24, never duplicate or create unprovided dialogue',()=>{
  const p=createProgression();unlockDueSkills(p,upgradeAt(26));const seen=[]
  for(let i=0;i<26;i++){
    tickProgression(p,.1,false);assert.equal(p.presentation.week,i+1);assert.equal(p.presentation.phase,'reveal');seen.push(p.presentation.week)
    for(let j=0;j<Math.ceil(LEVEL_UP_SECONDS*10)+1;j++)tickProgression(p,.1,false)
  }
  assert.equal(new Set(seen).size,26);assert.equal(skillTitle(SKILLS[23]),'船体进化');assert.equal(SKILLS[23].name,null)
  unlockDueSkills(p,upgradeAt(60));assert.equal(p.level,26);assert.deepEqual(p.pending,[])
})

test('all stages retain action probabilities, improve paired travel, and keep bounded state after months',()=>{
  const distances=[]
  for(const level of [4,8,12,16,20,26]){
    const s=at(level)
    for(let i=0;i<16;i++){row(s,'shiro',()=>.1);row(s,'ryo',()=>.1);step(s,.6)}
    distances.push(s.distance);assert.ok(s.skills.wake.length<=24);assert.ok(s.speed<=speedLimit(level));assert.ok(ryoForwardChance(s.minutes)<=.5)
    assert.equal(copySave(save(s)).state.progression.level,level)
  }
  assert.ok(distances.at(-1)>distances[0]*2,JSON.stringify(distances))
  for(const draw of [.1,.4,.52,.9]){
    const actions=[1,5,10,15,20,26].map(level=>{const s=at(level);s.minutes=upgradeAt(26)+23*60;return row(s,'ryo',()=>draw)})
    assert.ok(actions.every(a=>a===actions[0]),actions.join(','))
  }
  const s=at(26);for(let i=0;i<12000;i++){if(i%6===0)row(s,'shiro',()=>.1);if(i%7===0)row(s,'ryo',()=>.1);tickRowing(s,.1,()=>.99);if(i%500===0)validateSave(save(s))}
  assert.ok(s.skills.wake.length<=24&&s.trail.length<=64);assert.ok(s.skills.evolution.charge<=100);assert.ok(s.couples.length<=32)
})

test('version 1 four-week saves migrate losslessly, version 2 preserves every evolution resource',()=>{
  const s=at(4),old=save(s);old.version=1;delete old.state.skills.evolution
  const migrated=validateSave(old);assert.equal(migrated.version,SAVE_VERSION);assert.equal(migrated.state.minutes,s.minutes);assert.deepEqual(migrated.state.skills.evolution,createEvolution());assert.equal(old.version,1)
  for(const level of [8,15,16,20,24,25,26]){
    const advanced=at(level);const e=advanced.skills.evolution;e.charge=74;e.airUntil=9;e.meteorUntil=7;e.tailStarsUntil=6;e.binaryUntil=5;e.realmMix=level>=20?2:level>=16?1:0;e.altitude=realmAltitude(e.realmMix)+12;e.form=Math.max(0,level-23)
    const restored=copySave(save(advanced)).state;assert.deepEqual(restored.skills.evolution,e);tickRowing(restored,.1,()=>.99);validateSave(save(restored))
  }
  const invalid=save(at(26));invalid.version=1;delete invalid.state.skills.evolution;assert.throws(()=>validateSave(invalid))
})
