import { competitionTrainer, competitionAgency, payCompetitionPrize } from './international.js';
import { SEASON, SEASON_PHASES, CUP_SCHEDULE, RANKING } from '../data/season.js';
import { citySeedScores } from './regional-ranking.js';
import { proEligible, isRegisteredPro, isRaceSeat } from './career.js';
import { findTrainer, seedOrder, makeTrainerFor } from './league.js';
import { effectiveStats, STAT_KEYS } from '../data/agencies.js';
import { partyToTeam, gainExp, expForLevel } from '../data/pokemon.js';
import { recordBattle } from './evolution.js';
import { createTrainerAI, runBattle, makeRng } from './run-battle.js';
import { analyseBattle } from './battle-analysis.js';
import { ko, SPECIES_KO } from '../data/ko.js';
import { REFORM, SEASON1_SCHEDULE, REFORM_PRIZE } from '../data/league-reform.js';
import { seriesPoints } from './league-reform.js';
import { GYMS } from '../data/gyms.js';
import { Dex } from '@pkmn/dex';

export function seasonDate(day) {
  const year=Math.floor((day-1)/SEASON.days)+1, dayOfYear=(day-1)%SEASON.days+1;
  return {year,dayOfYear,phase:SEASON_PHASES.filter(p=>p.start<=dayOfYear).at(-1)};
}
export function ensureSeason(game) {
  game.competitions??={version:1,events:[]};
  const {year}=seasonDate(game.day||1);
  if(game.reform)for(const y of [year,year+1])addReformSeason(game,y);
  if(!game.reform)for(const y of [year,year+1]) for(const spec of CUP_SCHEDULE) for(const d of spec.days){
    const id=`${spec.kind}-${y}-${d}`,date=(y-1)*SEASON.days+d;
    if(game.competitions.events.some(e=>e.id===id)||date<game.day)continue;
    game.competitions.events.push({id,name:`제${y}시즌 ${spec.label} · ${spec.kind==='city'?(d<100?'전반기':'후반기')+' '+(spec.days.indexOf(d)%3+1)+'차':spec.kind==='youth'?(d===7?'개막':'후반'):'연간 오픈'}`,kind:spec.kind,region:'kanto-johto',
      season:y,date,deadline:date-1,openDay:date-SEASON.registrationLead,status:'scheduled',
      eligibility:spec.eligibility,capacity:spec.kind==='local'?32:SEASON.capacity,qualification:'none',format:'knockout',
      prizeMultiplier:SEASON.prizeMultipliers[spec.kind],reputationMultiplier:SEASON.prizeMultipliers[spec.kind],ranking:spec.ranking,rankingWeight:spec.weight,pointsMultiplier:spec.kind==='city'&&d===spec.days.at(-1)?RANKING.lastCityMultiplier:1,rosterSize:6,setFormat:'bo1',musicContext:'kanto',
      registrations:[],entrants:[],matches:[],decisions:[],result:null,viewed:[],watchMode:'results'});
  }
  game.competitions.version=2;
  return game.competitions;
}
const baseEvent=(game,{id,name,kind,y,d,capacity=SEASON.capacity,ranking=false,weight=0,prize=1,levelCap=null,clauses=[],division=null,region='kanto-johto',city=null,eligibility})=>({
  id,name,kind,region,city,season:y,date:(y-1)*SEASON.days+d,deadline:(y-1)*SEASON.days+d-1,openDay:(y-1)*SEASON.days+d-SEASON.registrationLead,status:'scheduled',
  eligibility,capacity,qualification:kind==='youth-final'?'series-points':'none',format:'knockout',prizeMultiplier:prize,reputationMultiplier:prize,ranking,rankingWeight:weight,pointsMultiplier:1,
  rosterSize:6,setFormat:'bo1',musicContext:'kanto',levelCap,clauses,division,reform:true,
  registrations:[],entrants:[],matches:[],decisions:[],result:null,viewed:[],watchMode:'results'});
/** 리그 개혁 일정 — 2026은 유스 전용, 2027부터 시티컵·로컬컵(유스부/오픈부) */
function addReformSeason(game,y){
  const yearName=REFORM.firstYear+y-1,events=[];
  if(REFORM.youthOnlySeasons.includes(y)){
    for(const sp of SEASON1_SCHEDULE){
      const id=`${sp.kind}-${y}-${sp.day}`;
      if(sp.kind==='youth')events.push(baseEvent(game,{id,name:`${yearName} ${sp.city} 유스컵`,kind:'youth',y,d:sp.day,prize:REFORM_PRIZE.youth,city:sp.city,region:sp.region,eligibility:'youth-any'}));
      else if(sp.kind==='demo')events.push(baseEvent(game,{id,name:`${yearName} ${sp.label}`,kind:'demo',y,d:sp.day,prize:REFORM_PRIZE.demo,city:sp.city,levelCap:REFORM.proLevelCap,clauses:REFORM.clauses,eligibility:'pro-qualified'}));
      else events.push(baseEvent(game,{id,name:`${yearName} ${sp.label}`,kind:'youth-final',y,d:sp.day,prize:REFORM_PRIZE['youth-final'],city:sp.city,eligibility:'series-top8'}));
    }
  }else for(const spec of CUP_SCHEDULE)for(const d of spec.days){
    if(spec.kind==='city')events.push(baseEvent(game,{id:`city-${y}-${d}`,name:`${yearName} 시티컵 · ${d<100?'전반기':'후반기'} ${spec.days.indexOf(d)%3+1}차`,kind:'city',y,d,ranking:true,weight:spec.weight,prize:SEASON.prizeMultipliers.city,levelCap:REFORM.proLevelCap,clauses:REFORM.clauses,eligibility:'registered-pro'}));
    else if(spec.kind==='youth')events.push(baseEvent(game,{id:`youth-${y}-${d}`,name:`${yearName} 유스컵 · ${d===7?'개막':'후반'}`,kind:'youth',y,d,prize:1,eligibility:'youth-under-eight'}));
    else if(spec.kind==='local'){
      events.push(baseEvent(game,{id:`local-${y}-${d}`,name:`${yearName} 로컬컵 · 유스부`,kind:'local',division:'youth',y,d,capacity:16,ranking:false,prize:SEASON.prizeMultipliers.local/2,eligibility:'youth-any'}));
      events.push(baseEvent(game,{id:`local-open-${y}-${d+1}`,name:`${yearName} 로컬컵 · 오픈부 (레벨 무제한)`,kind:'local',division:'open',y,d:d+1,capacity:32,ranking:true,weight:spec.weight,prize:SEASON.prizeMultipliers.local,eligibility:'open'}));
    }
  }
  for(const e of events)if(!game.competitions.events.some(x=>x.id===e.id)&&e.date>=game.day)game.competitions.events.push(e);
}

export function youthEligible(t){return !!t?.isYouth&&!proEligible(t)&&!!t.party?.length;}
export function cupEligible(t,e){
  if(!t?.party?.length)return false;
  if(e.kind==='youth')return e.eligibility==='youth-any'?!!t.isYouth:youthEligible(t);
  if(e.kind==='youth-final')return !!t.isYouth;
  if(e.kind==='demo')return proEligible(t)&&!['champion','elite-four','gym-leader'].includes(t.regionalRole);
  if(e.kind==='local'&&e.division==='youth')return !!t.isYouth;
  if(e.kind==='city')return isRaceSeat(t)&&!['champion','elite-four'].includes(t.regionalRole);   // 리저브는 시티컵 불가
  return e.kind==='local';
}
export function registerCup(game,eventId,trainerId,remove=false){
  const e=ensureSeason(game).events.find(e=>e.id===eventId),t=findTrainer(game.league,trainerId);
  if(!e||e.status!=='scheduled'||game.day<e.openDay||game.day>e.deadline) return {ok:false,msg:'접수 기간이 아닙니다.'};
  if(!t||t.agencyId!==game.playerAgencyId)return {ok:false,msg:'우리 소속 트레이너만 등록할 수 있습니다.'};
  if(remove){e.registrations=e.registrations.filter(id=>id!==trainerId);return {ok:true};}
  if(!cupEligible(t,e)||game.pendingStarter?.trainerId===t.id)return {ok:false,msg:'대회의 참가 신분과 파트너 보유 조건을 확인하세요.'};
  if(t.camp&&game.day+t.camp.remaining>e.date)return {ok:false,msg:'캠프 일정과 겹칩니다.'};
  if(!e.registrations.includes(t.id)&&e.registrations.length>=e.capacity)return {ok:false,msg:'등록 정원이 가득 찼습니다.'};
  if(!e.registrations.includes(t.id))e.registrations.push(t.id);
  return {ok:true};
}
export function npcEntryScore(agency,t){
  return (agency.policy?.aggression??0.5)*SEASON.npcAggressionWeight+SEASON.npcBase-(t.fatigue||0)/100;
}
/** 시범경기 빈자리를 채울 무소속 프로 — 갓 졸업한 수준(Lv48~55) [임시값] */
async function demoFreeAgents(game,count){
  game.personnel??={version:1,freeAgents:[],history:[],notices:[]};
  const have=game.personnel.freeAgents.filter(t=>t.freeAgent&&t.demoPro);
  const kanto=GYMS.filter(g=>g.region==='kanto').map(g=>g.id);
  for(let i=have.length;i<count;i++){
    const t=await makeTrainerFor({id:'free',statRange:[11,15],rosterProfile:'strong'},`fa-demo-${i}`,game.rng);
    t.agencyId=null;t.freeAgent=true;t.demoPro=true;t.isYouth=false;t.badges=[...kanto];t.legacyPro=true;
    for(const m of t.party){const L=48+Math.floor(game.rng()*8);if(L>m.level)await gainExp(m,expForLevel(L)-m.exp);}
    game.personnel.freeAgents.push(t);have.push(t);
  }
  return have.slice(0,count);
}
/** 시범경기는 늘 무소속 프로 4명 이상과 섞는다 — 유스가 프로의 벽을 미리 겪어보는 자리 [임시값] */
const DEMO_PROS=4;
export async function prepareCupEntrants(game,e){
  if(e.kind!=='demo'||e.fillers)return;
  const n=cupEntrants(game,e).length;
  e.fillers=(await demoFreeAgents(game,Math.max(DEMO_PROS,e.capacity-n))).map(t=>t.id);
}
export function cupEntrants(game,e){
  if(e.kind==='youth-final'){
    const top=seriesPoints(game,e.season).slice(0,e.capacity).map(r=>findTrainer(game.league,r.id)).filter(t=>t&&t.isYouth&&t.party?.length);
    return top;
  }
  const fillers=(e.fillers||[]).map(id=>game.personnel?.freeAgents?.find(t=>t.id===id)).filter(Boolean);
  const own=e.registrations.map(id=>findTrainer(game.league,id)).filter(t=>t?.agencyId===game.playerAgencyId&&cupEligible(t,e)&&!t.camp);
  const npc=game.league.agencies.filter(a=>a.id!==game.playerAgencyId).flatMap(a=>a.roster.filter(t=>cupEligible(t,e)).map(t=>({t,score:npcEntryScore(a,t)})))
    .filter(x=>!x.t.camp&&x.score>=SEASON.npcThreshold).sort((a,b)=>b.score-a.score||a.t.id.localeCompare(b.t.id));
  const officials=e.kind==='local'&&e.division!=='youth'?(game.international?.officials||[]).filter(t=>t.region==='kanto-johto'):[];
  /* 오픈부(레벨 무제한)에는 NPC 소속사가 유스를 보내지 않는다 */
  const npcList=npc.map(x=>x.t).filter(t=>!(e.kind==='local'&&e.division==='open'&&t.isYouth));
  return [...[...own,...officials,...npcList].slice(0,e.capacity-fillers.length),...fillers].slice(0,e.capacity);
}
/** 공식전 출전 파티: 같은 포켓몬·같은 도구 1개씩, 50 초과는 50으로 (VGC·배틀스타디움과 같다) */
export function officialParty(party,e){
  const out=structuredClone(party),species=new Set(),items=new Set(),kept=[];
  for(const m of out){
    if(e.clauses?.includes('species')){const base=Dex.species.get(m.species).baseSpecies||m.species;if(species.has(base))continue;species.add(base);}
    if(e.clauses?.includes('item')&&m.item){if(items.has(m.item))m.item=null;else items.add(m.item);}
    if(e.levelCap&&m.level>e.levelCap){m.level=e.levelCap;m.exp=expForLevel(e.levelCap);delete m.fieldState;}
    kept.push(m);
  }
  return kept;
}
export function cupToday(game){return ensureSeason(game).events.find(e=>e.date===game.day&&e.status==='scheduled');}
export async function runCup(game,e,onProgress=async()=>{}){
  if(e.status!=='scheduled'||e.date!==game.day)return;
  await prepareCupEntrants(game,e);
  const trainers=cupEntrants(game,e);
  e.decisions=game.league.agencies.filter(a=>a.id!==game.playerAgencyId).flatMap(a=>a.roster.filter(t=>cupEligible(t,e)).map(t=>({trainerId:t.id,score:npcEntryScore(a,t),entered:trainers.includes(t)})));
  e.entrants=trainers.map(t=>({id:t.id,name:t.name,agencyId:t.agencyId,agencyName:competitionAgency(game,t),party:officialParty(t.party.slice(0,e.rosterSize),e),definition:structuredClone({name:t.name,isYouth:t.isYouth,badges:t.badges,legacyPro:t.legacyPro,regionalRole:t.regionalRole,stats:effectiveStats(t),nature:t.nature,battlePolicy:t.battlePolicy,mentalDebuff:t.mentalDebuff,lossStreak:t.lossStreak,keyStone:!!t.keyStone})}));
  if(trainers.length<2){e.status='cancelled';game.league.newsFeed.unshift({day:game.day,kind:'cup',text:`${e.name} · 참가자 부족으로 취소. 상금 지급 없음.`});return;}
  for(let i=e.entrants.length-1;i>0;i--){const j=Math.floor(game.rng()*(i+1));[e.entrants[i],e.entrants[j]]=[e.entrants[j],e.entrants[i]];}
  if(e.kind==='city'){const scores=citySeedScores(game,e);e.entrants.sort((a,b)=>(scores.get(b.id)??RANKING.base)-(scores.get(a.id)??RANKING.base));}
  let size=2;while(size<trainers.length)size*=2;
  let slots=seedOrder(size).map(n=>e.entrants[n-1]||null),round=1;
  const appearances=new Map();
  while(slots.length>1){
    const next=[];
    for(let i=0;i<slots.length;i+=2){
      let a=slots[i],b=slots[i+1];if(!a||!b){next.push(a||b);continue;}
      if(b.agencyId===game.playerAgencyId&&a.agencyId!==game.playerAgencyId)[a,b]=[b,a];
      const seed=Math.floor(game.rng()*0x7fffffff);
      const r=runBattle({trainerA:createTrainerAI({...a.definition,partyTactics:a.party.map(m=>m.tactics)},a.definition.nature?.style,makeRng(seed+1)),trainerB:createTrainerAI({...b.definition,partyTactics:b.party.map(m=>m.tactics)},b.definition.nature?.style,makeRng(seed+2)),teamA:partyToTeam(a.party),teamB:partyToTeam(b.party),seed,collectThink:true});
      // A drawn engine battle is recorded as drawn; a seeded draw decides advancement explicitly.
      const tie=r.winner==null,winner=tie?(game.rng()<0.5?a:b):(r.winner==='p1'?a:b);
      const m={id:`${e.id}-${round}-${i/2}`,round,aId:a.id,bId:b.id,winnerId:winner.id,draw:tie,seed,log:r.log,turns:r.turns,
        trainerName:a.name,gymName:b.name,agencyName:a.agencyName,opponentAgency:b.agencyName,eventName:e.name,
        won:winner.id===a.id,analysis:analyseBattle(r,{policy:a.definition.battlePolicy,mentalDebuff:a.definition.mentalDebuff,lossStreak:a.definition.lossStreak})};
      e.matches.push(m);next.push(winner);
      /* 우리 선수는 배틀 기록으로 진화 카운터를 올린다 (저승갓숭·대도각참 등) */
      for(const [x,side] of [[a,'p1'],[b,'p2']])if(x.agencyId===game.playerAgencyId){const real=competitionTrainer(game,x.id);if(real)recordBattle(real.party,r.log,side);}
      if(e.watchMode==='watch'&&(a.agencyId===game.playerAgencyId||b.agencyId===game.playerAgencyId))(game.pendingCupWatches??=[]).push(m.id);
      for(const x of [a,b])appearances.set(x.id,(appearances.get(x.id)||0)+1);
      await onProgress({id:m.id,state:'done',label:e.name,detail:`${a.name} vs ${b.name} · ${winner.name} 진출${tie?' (무승부 추첨)':''}`});
    }
    slots=next;round++;
  }
  const champion=slots[0],final=e.matches.at(-1),runner=e.entrants.find(x=>x.id===(final.aId===champion.id?final.bId:final.aId));
  e.result={championId:champion.id,runnerId:runner.id};
  e.scouting=[];
  for(const x of e.entrants){
    const t=competitionTrainer(game,x.id),count=appearances.get(x.id)||0;
    const growth=[];
    for(const mon of t.party.slice(0,e.rosterSize)){const before=mon.level;await gainExp(mon,SEASON.experience*count);growth.push({species:mon.species,before,level:mon.level,experience:SEASON.experience*count});}
    for(const key of STAT_KEYS)t.stats[key]=Math.min(t.potential?.[key]??t.stats[key],t.stats[key]+SEASON.growth*count);
    const wins=e.matches.filter(m=>m.winnerId===t.id&&!m.draw).length;
    const losses=e.matches.filter(m=>!m.draw&&m.winnerId!==t.id&&(m.aId===t.id||m.bId===t.id)).length;
    t.fatigue=Math.max(0,Math.min(100,(t.fatigue||0)+losses*SEASON.fatigue-wins*2));   // 컨디션은 패배로 깎인다
    t.record.wins+=wins;t.record.losses+=e.matches.filter(m=>!m.draw&&m.winnerId!==t.id&&(m.aId===t.id||m.bId===t.id)).length;
    e.scouting.push({trainerId:t.id,name:t.name,agencyName:x.agencyName,growth,text:`${count}경기 · ${wins}승 · 출전 당시 ${x.party.map(p=>`${ko(SPECIES_KO,p.species)} Lv.${p.level}`).join(', ')}. 상대와 파티 차이를 함께 보고 평가하세요.`});
  }
  for(const [x,prize]of [[champion,SEASON.prize*(e.prizeMultiplier??1)],[runner,SEASON.runnerPrize*(e.prizeMultiplier??1)]]){
    payCompetitionPrize(game,x,prize,SEASON.reputation*(e.reputationMultiplier??1));
  }
  e.status='completed';
  game.league.newsFeed.unshift({day:game.day,kind:'cup',text:`${e.name} · ${champion.name} 우승 (${SEASON.prize*(e.prizeMultiplier??1)}), ${runner.name} 준우승 (${SEASON.runnerPrize*(e.prizeMultiplier??1)}). 일정에서 대진·저장 관전·스카우팅 보고서를 확인하세요.`});
}

// Compatibility for existing saved reports and tests.
export const registerYouth=registerCup;
export const runYouthCup=runCup;
