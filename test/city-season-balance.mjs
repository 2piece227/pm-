import assert from 'node:assert/strict';
import {createGame,advanceDay,playerAgency} from '../src/engine/game.js';
import {ensureSeason,registerCup,cupEligible} from '../src/engine/season.js';
import {regionalRanking} from '../src/engine/regional-ranking.js';
const start=performance.now();
for(const seed of [510,511,512]){
  const g=await createGame({seed,agencyChoiceId:'player-major',careerStart:true});g.opening.tutorialContractNeeded=false;
  let midLeader=null;
  while(g.day<=267){
    for(const e of ensureSeason(g).events.filter(e=>e.season===1&&e.openDay===g.day))
      for(const t of playerAgency(g).roster.filter(t=>cupEligible(t,e)))assert(registerCup(g,e.id,t.id).ok);
    await advanceDay(g);
    if(g.day===130)midLeader=regionalRanking(g)[0]?.id;
  }
  const events=g.competitions.events.filter(e=>e.season===1&&e.kind!=='youth');
  assert.equal(events.length,7);assert(events.every(e=>e.status==='completed'));
  assert.equal(events.filter(e=>e.kind==='local').length,1);
  const rank=regionalRanking(g),wins={};
  for(const e of events){const agency=e.entrants.find(t=>t.id===e.result.championId).agencyName;wins[agency]=(wins[agency]||0)+1;}
  console.log(JSON.stringify({seed,matches:events.reduce((n,e)=>n+e.matches.length,0),champions:wins,leaderChanged:rank[0].id!==midLeader,qualified:rank.filter(r=>r.challengerEligible).length,funds:playerAgency(g).funds}));
}
console.log(`PASS: three 267-day careers; ${(performance.now()-start).toFixed(0)}ms`);
