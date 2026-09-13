import assert from 'node:assert/strict';
import { createGame, playerAgency, signYouth, rosterLock, advanceDay } from '../src/engine/game.js';
import { createTrainer, PLAYER_AGENCY_CHOICES } from '../src/data/agencies.js';
import { CAREER, NAMED_ROSTER_SLOTS } from '../src/data/career.js';
import { YOUTH_CANDIDATES, youthCandidates } from '../src/data/youth-candidates.js';
import { candidateProposal } from '../src/engine/contract.js';
import { agreeYouth, completeStarter } from '../src/engine/youth-contract.js';
import { youthCount, proEligible, isRegisteredPro, markGraduation, callUp, holdYouth, transferOffers, sellYouth, setupCareerStart } from '../src/engine/career.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { GYMS } from '../src/data/gyms.js';
import { renderCareer } from '../src/ui/career.js';

for(const choice of PLAYER_AGENCY_CHOICES){
 const g=await createGame({seed:84,agencyChoiceId:choice.id,startEmpty:true,careerStart:true});
 const a=playerAgency(g),preset=CAREER.starting[choice.tier];
 assert.equal(youthCount(a),preset.youths);
 assert.equal(a.roster.filter(isRegisteredPro).length,preset.pros);
 assert(g.opening.tutorialContractNeeded);
 for(const t of a.roster){
  if(t.isYouth){assert.equal(t.party.length,1);assert.equal(t.party[0].level,5);assert.equal(t.badges.length,0);}
  else{assert.equal(t.badges.length,8);assert(t.party.length>1);}
 }
 const before=snapshotGame(g);await setupCareerStart(g);assert.deepEqual(snapshotGame(g),before,'initial presets never repeat');
 assert.deepEqual(snapshotGame(restoreGame(before)),before);
 await assert.rejects(()=>advanceDay(g),/첫 유스 계약/);
 const candidate=YOUTH_CANDIDATES[0];
 const t=agreeYouth(g,candidate,candidateProposal(candidate,a));
 assert.equal(t.party.length,0);assert(!g.opening.tutorialContractNeeded);
 await assert.rejects(()=>advanceDay(g),/파트너/);
 await completeStarter(g,'Charmander');
 assert.equal(t.party[0].level,5);
 assert.equal(a.roster.filter(isRegisteredPro).length,preset.pros,'first contract keeps existing pros');
 console.log(`${choice.id}: ${preset.pros} pros + ${preset.youths} existing youths + first contract`);
}
assert.equal(Object.keys(NAMED_ROSTER_SLOTS).length,0);

const g=await createGame({seed:19,startEmpty:true}),a=playerAgency(g);
a.funds=100000;
const stats={judge:12,ops:12,focus:12,know:12,mental:12};
for(let i=0;i<3;i++)signYouth(g,createTrainer({id:`grad-${i}`,name:`유스${i}`,stats:{...stats},potential:{...stats}}),{wage:10,proRaise:150});
assert.equal(rosterLock(g).count,3);
const beforeFull=snapshotGame(g);
assert.throws(()=>agreeYouth(g,YOUTH_CANDIDATES[0],candidateProposal(YOUTH_CANDIDATES[0],a)));
assert.deepEqual(snapshotGame(g),beforeFull);
const t=a.roster[0];
t.badges=[...GYMS.filter(x=>x.region==='kanto').slice(0,4),...GYMS.filter(x=>x.region==='johto').slice(0,4)].map(x=>x.id);
assert(!proEligible(t));assert(!callUp(g,t.id).ok);assert(!holdYouth(g,t.id).ok);
t.badges=GYMS.filter(x=>x.region==='kanto').map(x=>x.id);
markGraduation(g,t);const count=g.league.newsFeed.length;markGraduation(g,t);assert.equal(g.league.newsFeed.length,count);
assert(t.isYouth);assert.equal(t.contract.wage,10);assert(proEligible(t));assert(!isRegisteredPro(t));
assert(holdYouth(g,t.id).ok);assert(rosterLock(g));assert.equal(t.contract.wage,10);
assert(callUp(g,t.id).ok);assert.equal(t.contract.wage,25);assert(isRegisteredPro(t));assert.equal(rosterLock(g),null);
assert(!callUp(g,t.id).ok);assert.equal(t.contract.wage,25);
assert(!callUp(g,g.league.agencies.find(x=>x.id!==a.id).roster[0].id).ok);
const candidate=youthCandidates(g).find(c=>c.id.startsWith('generated-'));
const recruited=agreeYouth(g,candidate,candidateProposal(candidate,a));await completeStarter(g,'Squirtle');
assert.equal(recruited.party.length,1);assert.equal(recruited.party[0].level,5);

const sell=a.roster[1];sell.badges=[...t.badges];sell.party=[{species:'Pikachu',level:12,moves:['Thunder Shock'],ivs:{hp:18}}];sell.bag={pokeBall:3,potion:1};
g.actions[sell.id]='rest';const partyBefore=structuredClone(sell.party),boxBefore=structuredClone(a.box);
const rngBefore=g.rng.getState();const offers=transferOffers(g,sell.id);assert(offers.length);assert.equal(g.rng.getState(),rngBefore);
const offer=offers[0],buyer=g.league.agencies.find(x=>x.id===offer.agencyId),cash=a.funds+buyer.funds;
const beforeBad=snapshotGame(g);assert(!sellYouth(g,sell.id,buyer.id,offer.fee+1).ok);assert.deepEqual(snapshotGame(g),beforeBad);
assert(renderCareer(g,sell).includes('파티 포함 이적 확정'));
assert(sellYouth(g,sell.id,buyer.id,offer.fee).ok);
assert.equal(a.funds+buyer.funds,cash);assert.equal(sell.agencyId,buyer.id);assert(!a.roster.includes(sell));assert(buyer.roster.includes(sell));
assert.deepEqual(sell.party,partyBefore);assert.deepEqual(a.box,boxBefore);assert.equal(sell.bag.pokeBall,3);assert(!g.actions[sell.id]);
assert(!sellYouth(g,sell.id,buyer.id,offer.fee).ok);assert.equal(g.transfers.length,1);
const restored=restoreGame(snapshotGame(g));assert.deepEqual(snapshotGame(restored),snapshotGame(g));
assert.equal(new Set(restored.league.agencies.flatMap(a=>a.roster.map(t=>t.id))).size,restored.league.agencies.flatMap(a=>a.roster).length);

// Legacy saves: preserve every trainer, party, wage, badge and replay. Never backfill roster.
const legacy=snapshotGame(g);legacy.snapshotVersion=2;
const player=legacy.league.agencies.find(x=>x.id===a.id);player.roster[0].isYouth=false;player.roster[0].badges=[];
delete player.roster[0].promotionApplied;
legacy.gymHistory=[{id:'old-match',log:['old'],analysis:{summary:'saved'}}];
const migrated=restoreGame(legacy),mt=playerAgency(migrated).roster[0];
assert(isRegisteredPro(mt));assert.equal(mt.contract.wage,25);assert.deepEqual(mt.party,player.roster[0].party);
assert.deepEqual(migrated.gymHistory,legacy.gymHistory);assert.equal(migrated.rng.getState(),legacy.rngState);
assert.equal(playerAgency(migrated).roster.length,player.roster.length);
assert.deepEqual(snapshotGame(restoreGame(snapshotGame(migrated))),snapshotGame(migrated));
console.log('PASS: capacity, qualification vs registration, hold/callup, one raise, sale atomicity/ownership, generated candidates, legacy migration');
