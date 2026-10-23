import { pwtBreak } from '../data/international.js';
import { Dex } from '@pkmn/dex';
import { ko, SPECIES_KO } from '../data/ko.js';
import { GYMS, gymById } from '../data/gyms.js';
import { createPokemon, partyToTeam, gainExp } from '../data/pokemon.js';
import { effectiveStats } from '../data/agencies.js';
import { createTrainerAI, runBattle, makeRng } from './run-battle.js';
import { healParty } from './field-state.js';
import { applyLoss, applyWin } from './explore.js';
import { agencyOf, evolutionOptions, evolvePokemon } from './pokemon-management.js';
import { analyseBattle } from './battle-analysis.js';
import { markGraduation } from './career.js';
import { consumeBerries } from './shop.js';
import { recordBattle } from './evolution.js';
import { outfitNpcTrainer } from './npc-loadout.js';

export async function challengeGym(game, trainer, gymId) {
  if(pwtBreak(game))throw new Error('PWT 기간에는 공식 체육관 도전이 중단됩니다.');
  const gym=gymById(gymId), agency=agencyOf(game);
  if(!gym||!agency.roster.includes(trainer)||!trainer.party.length) throw new Error('도전할 체육관과 트레이너를 확인하세요.');
  if(trainer.lastGymDay===game.day) throw new Error('관장전은 하루 한 번 도전합니다.');
  if((trainer.badges||[]).includes(gym.id)) throw new Error(`이미 ${gym.badge}를 가지고 있어 다시 도전할 수 없습니다.`);
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
  const analysisContext={policy:trainer.battlePolicy,mentalDebuff:trainer.mentalDebuff,lossStreak:trainer.lossStreak};
  const result=runBattle({trainerA:createTrainerAI({...trainer,stats:effectiveStats(trainer),partyTactics:trainer.party.map(m=>m.tactics)},trainer.nature?.style,makeRng(seed+1)),
    trainerB:createTrainerAI({name:gym.name,stats},'균형형',makeRng(seed+2)),
    teamA:partyToTeam(trainer.party),teamB:partyToTeam(party),seed,collectThink:true});
  const analysis=analyseBattle(result,analysisContext);
  trainer.party.forEach((m,i)=>{m.fieldState=result.hpAfter.p1[i];});
  consumeBerries(trainer.party,result.log);
  recordBattle(trainer.party,result.log,'p1');
  trainer.lastGymDay=game.day;trainer.locationId=gym.location;
  const won=result.winner==='p1';
  trainer.record[won?'wins':'losses']++;
  if(won) applyWin(trainer);else applyLoss(trainer);
  trainer.badges??=[];
  const firstWin=won&&!trainer.badges.includes(gym.id);
  let reward=0,bonusPaid=0;
  const growth=[];
  if(firstWin){
    trainer.lastBadgeDay=game.day;
    trainer.badges.push(gym.id);reward=500+gym.order*150;agency.funds+=reward;
    bonusPaid=Number(trainer.contract?.badgeBonus||0);agency.funds-=bonusPaid;
    for(const m of trainer.party){
      const before=m.level,experience=Math.round(gym.party.reduce((n,p)=>n+p.level*40,0)/trainer.party.length);
      const result=await gainExp(m,experience);
      growth.push({species:m.species,before,level:m.level,experience,learned:result.learned});
    }
    markGraduation(game,trainer);
  }
  const evolutions=[];
  if(won) for(const mon of trainer.party) {
    if(!mon.autoEvolve) continue;
    const ready=evolutionOptions(mon,game).filter(e=>e.auto);
    if(ready.length===1){const r=await evolvePokemon(mon,ready[0].species,game);if(r.ok)evolutions.push(r);}
  }
  for(const e of evolutions) game.league.newsFeed.unshift({day:game.day,kind:'evolution',text:`${trainer.name}의 ${ko(SPECIES_KO,e.before)} → ${ko(SPECIES_KO,e.after)} 진화!`});
  const entry={analysis,evolutions,growth,bonusPaid,badge:gym.badge,id:`gym-${game.day}-${trainer.id}`,day:game.day,gymId,trainerId:trainer.id,trainerName:trainer.name,
    agencyName:agency.name,gymName:gym.name,won,firstWin,reward,log:result.log,turns:result.turns,
    party:structuredClone(gym.party)};
  (game.gymHistory??=[]).unshift(entry);
  (game.pendingGymWatches??=[]).push(entry.id);
  game.league.newsFeed.unshift({day:game.day,text:`${trainer.name} vs ${gym.name} — ${won?'승리':'패배'}${firstWin?` · ${gym.badge} 획득 · 상금 ${reward}`:''}`,kind:'gym',gymMatchId:entry.id});
  return entry;
}


/** NPC 유스의 관장전 — 같은 관장 파티·같은 엔진, 우리 쪽 돈·기록·관전에는 손대지 않는다 (리그 개혁 경량 계층) */
export async function challengeGymNpc(game, trainer, gymId) {
  const gym=gymById(gymId);
  if(!gym||!trainer.party?.length||(trainer.badges||[]).includes(gym.id))return null;
  outfitNpcTrainer(trainer);
  const seed=Math.floor(game.rng()*0x7fffffff), rng=makeRng(seed), party=[];
  const gen=Dex.forGen(gym.region==='kanto'?3:4);
  for(const def of gym.party){const mon=await createPokemon({...def,rng});mon.moves=[...def.moves];mon.item=def.item;mon.ability=gen.species.get(mon.species).abilities[0];mon.nature='Serious';party.push(mon);}
  healParty(trainer);
  const result=runBattle({trainerA:createTrainerAI({...trainer,stats:effectiveStats(trainer),partyTactics:trainer.party.map(m=>m.tactics)},trainer.nature?.style||'균형형',makeRng(seed+1)),
    trainerB:createTrainerAI({name:gym.name,stats:{judge:15,ops:15,focus:15,know:15,mental:16}},'균형형',makeRng(seed+2)),
    teamA:partyToTeam(trainer.party),teamB:partyToTeam(party),seed});
  healParty(trainer);
  const won=result.winner==='p1';
  if(won){(trainer.badges??=[]).push(gym.id);trainer.lastBadgeDay=game.day;}
  trainer.record??={wins:0,losses:0};trainer.record[won?'wins':'losses']++;
  return {won,turns:result.turns};
}
