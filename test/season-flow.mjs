import assert from 'node:assert/strict';
import { createGame, advanceDay, playerAgency } from '../src/engine/game.js';
import { ensureSeason, registerYouth, youthEligible, runYouthCup, seasonDate, npcEntryScore } from '../src/engine/season.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { GYMS } from '../src/data/gyms.js';
import { renderSeason } from '../src/ui/season.js';
const g=await createGame({seed:911,agencyChoiceId:'player-major',careerStart:true});
g.opening.tutorialContractNeeded=false;
const own=playerAgency(g),t=own.roster.find(t=>t.isYouth),pro=own.roster.find(t=>!t.isYouth);
let e=ensureSeason(g).events[0];
assert.equal(e.date,7);assert.equal(ensureSeason(g).events.filter(e=>e.kind==='youth').length,4);
assert(!registerYouth(g,e.id,pro.id).ok);
assert(registerYouth(g,e.id,t.id).ok);assert(registerYouth(g,e.id,t.id).ok);assert.equal(e.registrations.length,1);
assert(registerYouth(g,e.id,t.id,true).ok);e.capacity=0;assert(!registerYouth(g,e.id,t.id).ok);e.capacity=8;assert(registerYouth(g,e.id,t.id).ok);
t.badges=GYMS.filter(x=>x.region==='kanto').map(x=>x.id);assert(!youthEligible(t));t.badges=[];
assert(npcEntryScore({policy:{aggression:0}}, {fatigue:100})<0);
g.day=7;assert(!registerYouth(g,e.id,t.id).ok);
e.watchMode='watch';
const cloned=restoreGame(snapshotGame(g));
const levels=t.party.map(m=>m.exp),before=own.funds;
const rep=await advanceDay(g);await advanceDay(cloned);
e=g.competitions.events[0];assert.equal(e.status,'completed');assert.equal(rep.youthCupId,e.id);
assert.equal(g.pendingCupWatches.length,e.matches.filter(m=>[m.aId,m.bId].includes(t.id)).length);
assert(e.matches.filter(m=>[m.aId,m.bId].includes(t.id)).every(m=>m.aId===t.id));
assert.equal(rep.rested.includes(t.name),false);assert(!rep.gyms?.length);assert.equal(rep.explored.length,0);
assert(e.entrants.every(x=>x.definition.isYouth&&!x.definition.badges.length));
assert.equal(e.matches.length,e.entrants.length-1);
for(const m of e.matches){
 assert([m.aId,m.bId].includes(m.winnerId));
 if(!m.draw){const expected=m.winnerId===m.aId?m.trainerName:(m.gymName===m.trainerName?m.gymName+' (2)':m.gymName);assert(m.log.includes('|win|'+expected));}
 const later=e.matches.filter(x=>x.round>m.round);
 assert(!later.some(x=>[x.aId,x.bId].includes(m.winnerId===m.aId?m.bId:m.aId)));
}
const clean=e=>JSON.stringify(e).replace(/\|t:\|\d+/g,'|t:|CLOCK');
assert.equal(clean(e),clean(cloned.competitions.events[0]));
assert.equal(g.rng.getState(),cloned.rng.getState());
const funds=own.funds;await runYouthCup(g,e);assert.equal(own.funds,funds);
// NPC-only cup runs without registration and handles a three-player bye.
const npc=await createGame({seed:913,agencyChoiceId:'player-major',careerStart:true});npc.opening.tutorialContractNeeded=false;
const ne=ensureSeason(npc).events[0];npc.day=7;await advanceDay(npc);
assert.equal(ne.entrants.length,3);assert.equal(ne.matches.length,2);
assert.equal((npc.pendingCupWatches||[]).length,0);
assert(ne.entrants.every(x=>x.agencyId!==npc.playerAgencyId));
assert(ne.matches.every(m=>m.winnerId===ne.matches.at(-1).winnerId||m.round<ne.matches.at(-1).round));
const second=npc.competitions.events.find(x=>x.date===21);npc.day=15;
const nt=playerAgency(npc).roster.find(x=>x.isYouth);assert(registerYouth(npc,second.id,nt.id).ok);
assert(registerYouth(npc,second.id,nt.id,true).ok);assert.equal(second.registrations.length,0);
assert(renderSeason(g).includes('저장된 경기 관전'));
assert.equal(clean(restoreGame(snapshotGame(g)).competitions.events[0]),clean(e));
const old=snapshotGame(g);old.snapshotVersion=3;delete old.competitions;
const migrated=restoreGame(old);assert(migrated.competitions.events.every(x=>x.date>=g.day));assert.equal(migrated.rng.getState(),g.rng.getState());
assert.equal(seasonDate(366).year,2);assert.equal(seasonDate(366).phase.id,'offseason');
const c=await createGame({seed:912,agencyChoiceId:'player-major',careerStart:true});c.opening.tutorialContractNeeded=false;
const ce=ensureSeason(c).events[0];c.day=7;
for(const a of c.league.agencies)for(const t of a.roster)t.isYouth=false;
await runYouthCup(c,ce);assert.equal(ce.status,'cancelled');assert.equal(ce.matches.length,0);
console.log(`season-flow PASS: ${e.entrants.length} entrants, ${e.matches.length} saved matches; eligibility, registration, byes, rewards, replay, migration, NPC-only/cancellation`);
let total=0;const start=performance.now();
for(let n=2;n<=8;n++){
 const fixture=restoreGame(snapshotGame(g));fixture.day=21;
 const event=fixture.competitions.events.find(x=>x.date===21),a=fixture.league.agencies.find(a=>a.id!==fixture.playerAgencyId);
 for(const agency of fixture.league.agencies)agency.roster=[];
 a.roster=Array.from({length:n},(_,i)=>({...structuredClone(t),id:`case-${n}-${i}`,name:`후보${i}`,agencyId:a.id,fatigue:0}));
 await runYouthCup(fixture,event);
 assert.equal(event.matches.length,n-1);assert.equal(event.status,'completed');
 const final=event.matches.at(-1);assert.equal(event.result.championId,final.winnerId);
 for(const m of event.matches){const loser=m.winnerId===m.aId?m.bId:m.aId;assert(!event.matches.some(next=>next.round>m.round&&[next.aId,next.bId].includes(loser)));}
 total+=event.matches.length;
}
console.log(`2–8 entrants: ${total} matches, ${(performance.now()-start).toFixed(0)}ms; all bye brackets valid`);

