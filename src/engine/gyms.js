import { Dex } from '@pkmn/dex';
import { ko, SPECIES_KO } from '../data/ko.js';
import { GYMS, gymById } from '../data/gyms.js';
import { createPokemon, partyToTeam, gainExp } from '../data/pokemon.js';
import { effectiveStats } from '../data/agencies.js';
import { createTrainerAI, runBattle, makeRng } from './run-battle.js';
import { healParty } from './field-state.js';
import { applyLoss, applyWin } from './explore.js';
import { agencyOf, evolutionOptions, evolvePokemon } from './pokemon-management.js';

export async function challengeGym(game, trainer, gymId) {
  const gym=gymById(gymId), agency=agencyOf(game);
  if(!gym||!agency.roster.includes(trainer)||!trainer.party.length) throw new Error('도전할 체육관과 트레이너를 확인하세요.');
  if(trainer.lastGymDay===game.day) throw new Error('관장전은 하루 한 번 도전합니다.');
  const seed=Math.floor(game.rng()*0x7fffffff), rng=makeRng(seed);
  const party=[];
  const gen=Dex.forGen(gym.region==='kanto'?3:4);
  for(const def of gym.party) {
    const mon=await createPokemon({...def,rng});
    mon.moves=[...def.moves];mon.item=def.item;
    mon.ability=gen.species.get(mon.species).abilities[0];
    mon.nature='Serious';
    party.push(mon);
  }
  healParty(trainer); // A dedicated gym day includes preparation at the center.
  const stats={judge:15,ops:15,focus:15,know:15,mental:16};
  const result=runBattle({trainerA:createTrainerAI({name:trainer.name,stats:effectiveStats(trainer)},trainer.nature?.style,makeRng(seed+1)),
    trainerB:createTrainerAI({name:gym.name,stats},'균형형',makeRng(seed+2)),
    teamA:partyToTeam(trainer.party),teamB:partyToTeam(party),seed});
  trainer.party.forEach((m,i)=>{m.fieldState=result.hpAfter.p1[i];});
  trainer.lastGymDay=game.day;trainer.locationId=gym.location;
  trainer.fatigue=Math.min(100,(trainer.fatigue||0)+24);
  const won=result.winner==='p1';
  trainer.record[won?'wins':'losses']++;
  if(won) applyWin(trainer);else applyLoss(trainer);
  trainer.badges??=[];
  const firstWin=won&&!trainer.badges.includes(gym.id);
  let reward=0,bonusPaid=0;
  const growth=[];
  if(firstWin){
    trainer.badges.push(gym.id);reward=500+gym.order*150;agency.funds+=reward;
    bonusPaid=Number(trainer.contract?.badgeBonus||0);agency.funds-=bonusPaid;
    for(const m of trainer.party){
      const before=m.level,experience=Math.round(gym.party.reduce((n,p)=>n+p.level*40,0)/trainer.party.length);
      const result=await gainExp(m,experience);
      growth.push({species:m.species,before,level:m.level,experience,learned:result.learned});
    }
    if(trainer.isYouth && GYMS.filter(g=>g.region===gym.region&&trainer.badges.includes(g.id)).length===8){
      trainer.isYouth=false;
      if(trainer.contract?.wage!=null) trainer.contract.wage=Math.round(trainer.contract.wage*(1+Number(trainer.contract.proRaise||0)/100));
      const unlock=game.opening && !game.opening.done && trainer.id===game.opening.firstTrainerId;
      if(unlock)game.opening.done=true;
      game.league.newsFeed.unshift({day:game.day,text:`${trainer.name}, ${gym.region==='kanto'?'관동':'성도'} 배지 8개 달성! 정식 승급${unlock?' · 추가 유스 계약이 열렸습니다.':''}`});
    }
  }
  const evolutions=[];
  if(won) for(const mon of trainer.party) {
    if(!mon.autoEvolve) continue;
    const ready=evolutionOptions(mon).filter(e=>e.ready);
    if(ready.length===1){const r=await evolvePokemon(mon,ready[0].species);if(r.ok)evolutions.push(r);}
  }
  for(const e of evolutions) game.league.newsFeed.unshift({day:game.day,kind:'evolution',text:`${trainer.name}의 ${ko(SPECIES_KO,e.before)} → ${ko(SPECIES_KO,e.after)} 진화!`});
  const entry={evolutions,growth,bonusPaid,badge:gym.badge,id:`gym-${game.day}-${trainer.id}`,day:game.day,gymId,trainerId:trainer.id,trainerName:trainer.name,
    agencyName:agency.name,gymName:gym.name,won,firstWin,reward,log:result.log,turns:result.turns,
    party:structuredClone(gym.party)};
  (game.gymHistory??=[]).unshift(entry);
  (game.pendingGymWatches??=[]).push(entry.id);
  game.league.newsFeed.unshift({day:game.day,text:`${trainer.name} vs ${gym.name} — ${won?'승리':'패배'}${firstWin?` · ${gym.badge} 획득 · 상금 ${reward}`:''}`,kind:'gym',gymMatchId:entry.id});
  return entry;
}
