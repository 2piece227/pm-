import assert from 'node:assert/strict';
import {createGame,advanceDay,playerAgency} from '../src/engine/game.js';
import {ensureOfficials,internationalSeason,tickInternational} from '../src/engine/international.js';
import {snapshotGame,restoreGame} from '../src/engine/checkpoint.js';
import {PWT,pwtBreak,internationallyLocked} from '../src/data/international.js';
import {challengeGym} from '../src/engine/gyms.js';
import {regionalRanking} from '../src/engine/regional-ranking.js';
import {swissPairs} from '../src/engine/swiss.js';
import {makeRng} from '../src/engine/run-battle.js';

// Hundreds of standings sequences check exact qualification and pairing constraints without battles.
for(let seed=0;seed<100;seed++){
  const rng=makeRng(seed),entries=Array.from({length:32},(_,i)=>({id:`p${i}`,region:`r${Math.floor(i/4)}`}));
  const records=Object.fromEntries(entries.map(e=>[e.id,{wins:0,losses:0}])),matches=[];
  for(let round=1;round<=5;round++)for(const [a,b]of swissPairs(entries,records,matches,round)){
    assert(!matches.some(m=>[m.aId,m.bId].includes(a.id)&&[m.aId,m.bId].includes(b.id)));
    if(round===1)assert.notEqual(a.region,b.region);
    assert.equal(records[a.id].wins,records[b.id].wins);
    const winner=rng()<0.5?a:b,loser=winner===a?b:a;
    records[winner.id].wins++;records[loser.id].losses++;matches.push({aId:a.id,bId:b.id});
  }
  assert.equal(Object.values(records).filter(r=>r.wins===3).length,16);
  assert.equal(Object.values(records).filter(r=>r.losses===3).length,16);
}
console.log('PASS: 100 Swiss draws, 16/16 advancement/elimination, no rematches, first-round region separation');
const g=await createGame({seed:660,agencyChoiceId:'player-major',careerStart:true});
g.opening.tutorialContractNeeded=false;
await ensureOfficials(g);const state=g.international,s=internationalSeason(g);
assert.equal(state.regions.length,8);assert(state.regions.every(r=>r.eliteIds.length===4));
assert.equal(state.regions[0].gymIds.length,16);
g.day=130;assert(pwtBreak(g));
const t=playerAgency(g).roster[0];
await assert.rejects(()=>challengeGym(g,t,'brock'),/PWT/);
g.actions[t.id]='gym:brock';
await advanceDay(g);assert.equal(s.qualifiers.length,8);assert(s.qualifiers.every(q=>q.gymIds.length===2));
assert(!g.log[0].gyms?.length);assert(g.log[0].rested.includes(t.name));
g.day=138;await tickInternational(g);assert.equal(s.representatives.length,32);
for(const q of s.qualifiers){assert.equal(q.qualified.length,3);assert(s.representatives.includes(q.championId));assert.equal(s.representatives.filter(id=>s.entrants.find(e=>e.id===id).region===q.region).length,4);}
assert(internationallyLocked(g,s.representatives[0]));
const snapshot=structuredClone(s.entrants);state.officials[0].party[0].moves=['Splash'];assert.deepEqual(s.entrants,snapshot);
g.day=150;await tickInternational(g);
const restored=restoreGame(snapshotGame(g)),rs=internationalSeason(restored);
for(const day of [...PWT.swissDays.slice(1),...PWT.knockoutDays]){g.day=day;restored.day=day;await tickInternational(g);await tickInternational(restored);}
assert.equal(s.status,'completed');assert.equal(s.qualified.length,16);
const clean=x=>JSON.stringify(x).replace(/\|t:\|\d+/g,'|t:|CLOCK');
assert.equal(clean(s),clean(rs));assert.equal(g.rng.getState(),restored.rng.getState());
assert.equal(s.result.championId,s.bracket[0]);assert.equal(s.pwcAuto.trainerId,s.result.championId);assert.equal(s.pwcAuto.baseSeeds,4);
const before=clean(snapshotGame(g));await tickInternational(g);assert.equal(clean(snapshotGame(g)),before,'no duplicate prizes or honours');
assert.equal(g.international.honours.length,1);
for(const m of s.matches.filter(m=>m.log&&!m.draw)){
  const winner=m.winnerId===m.aId?m.trainerName:m.gymName;assert(m.log.includes('|win|'+winner));
}
assert(regionalRanking(g).every(r=>r.region==='kanto-johto'));
g.day=160;assert(!pwtBreak(g));g.day=366;assert(!internationallyLocked(g,s.representatives[0]));
const old=snapshotGame(g);old.snapshotVersion=6;delete old.international;old.day=170;
const migrated=restoreGame(old);assert.equal(internationalSeason(migrated).status,'missed');assert.equal(migrated.rng.getState(),old.rngState);
const bytes=Buffer.byteLength(JSON.stringify(snapshotGame(restored)));
console.log(`PASS: ${s.matches.length} PWT/qualifier matches, representative quotas, gym pause, immutable registration, replay/winner, mid-event save, honour/seed; save ${(bytes/1024/1024).toFixed(2)} MiB`);
