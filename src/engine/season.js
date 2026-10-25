import { competitionTrainer, competitionAgency, payCompetitionPrize } from './international.js';
import { isDomestic } from '../data/international.js';
import { SEASON, SEASON_PHASES, CUP_SCHEDULE, RANKING, TYPE_CUP, TYPES, TYPE_NAME_KO, TYPE_CITY } from '../data/season.js';
import { citySeedScores } from './regional-ranking.js';
import { proEligible, isRegisteredPro, isRaceSeat } from './career.js';
import { findTrainer, seedOrder, makeTrainerFor } from './league.js';
import { effectiveStats, STAT_KEYS } from '../data/agencies.js';
import { partyToTeam, gainExp, expForLevel } from '../data/pokemon.js';
import { recordBattle } from './evolution.js';
import { outfitNpcTrainer } from './npc-loadout.js';
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
    if(spec.kind==='type'){addTypeCups(game,y,d,`제${y}시즌`);continue;}
    const id=`${spec.kind}-${y}-${d}`,date=(y-1)*SEASON.days+d;
    if(game.competitions.events.some(e=>e.id===id)||date<game.day)continue;
    game.competitions.events.push({id,name:`제${y}시즌 ${spec.label} · ${spec.kind==='city'?(d<100?'전반기':'후반기')+' '+(spec.days.indexOf(d)%3+1)+'차':spec.kind==='youth'?(d===7?'개막':'후반'):'연간 오픈'}`,kind:spec.kind,region:'kanto-johto',
      season:y,date,deadline:date-SEASON.drawLead,openDay:date-SEASON.registrationLead,status:'scheduled',
      eligibility:spec.eligibility,capacity:spec.kind==='local'?32:SEASON.capacity,qualification:'none',format:'knockout',
      prizeMultiplier:SEASON.prizeMultipliers[spec.kind],reputationMultiplier:SEASON.prizeMultipliers[spec.kind],ranking:spec.ranking,rankingWeight:spec.weight,pointsMultiplier:spec.kind==='city'&&d===spec.days.at(-1)?RANKING.lastCityMultiplier:1,rosterSize:6,setFormat:'bo1',musicContext:'kanto',
      registrations:[],entrants:[],matches:[],decisions:[],result:null,viewed:[],watchMode:'results'});
  }
  game.competitions.version=2;
  return game.competitions;
}
const baseEvent=(game,{id,name,kind,y,d,capacity=SEASON.capacity,ranking=false,weight=0,prize=1,levelCap=null,clauses=[],division=null,region='kanto-johto',city=null,eligibility})=>({
  id,name,kind,region,city,season:y,date:(y-1)*SEASON.days+d,deadline:(y-1)*SEASON.days+d-SEASON.drawLead,openDay:(y-1)*SEASON.days+d-SEASON.registrationLead,status:'scheduled',
  eligibility,capacity,qualification:kind==='youth-final'?'series-points':'none',format:'knockout',prizeMultiplier:prize,reputationMultiplier:prize,ranking,rankingWeight:weight,pointsMultiplier:1,
  rosterSize:6,setFormat:'bo1',musicContext:'kanto',levelCap,clauses,division,reform:true,
  registrations:[],entrants:[],matches:[],decisions:[],result:null,viewed:[],watchMode:'results'});
/** 리그 개혁 일정 — 2026은 유스 전용, 2027부터 정규 일정(시티컵·로컬컵·타입컵) */
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
      /* 로컬컵은 레벨 무제한 단일 대회 (유스부 삭제, §6.3). 예전 저장의 113일 오픈부가 있으면 그것을 쓴다 */
      if(!game.competitions.events.some(e=>e.id===`local-open-${y}-${d+1}`))
        events.push(baseEvent(game,{id:`local-open-${y}-${d}`,name:`${yearName} 로컬컵 (레벨 무제한)`,kind:'local',division:'open',y,d,capacity:32,ranking:true,weight:spec.weight,prize:SEASON.prizeMultipliers.local,eligibility:'open'}));
    }
    else if(spec.kind==='type')addTypeCups(game,y,d,`${yearName}`);
  }
  /* 예전 저장의 로컬컵 유스부: 등록자가 없으면 지운다 (§16.3) */
  game.competitions.events=game.competitions.events.filter(e=>!(e.season===y&&e.kind==='local'&&e.division==='youth'&&e.status==='scheduled'&&!e.registrations.length&&!REFORM.youthOnlySeasons.includes(y)));
  for(const e of events)if(!game.competitions.events.some(x=>x.id===e.id)&&e.date>=game.day)game.competitions.events.push(e);
}

/* ---------------- 타입컵 (§6.4) ---------------- */

/** 시즌마다 타입 5개 — 시즌 안 중복 없음, 직전 시즌 것은 가능하면 빼고. 한 번 뽑으면 저장 */
export function typeRulesFor(game,y){
  game.competitions.typeRules??={};
  if(!game.competitions.typeRules[y]){
    /* 화면이 먼저 일정을 열어도 결과가 같도록 게임 시드·연도로만 정한다 */
    const rng=makeRng(((game.seed||1)^(y*0x9e3779b1))>>>0);
    const prev=new Set(y>1?typeRulesFor(game,y-1):[]);
    const pool=TYPES.filter(t=>!prev.has(t)),picks=[];
    const source=pool.length>=TYPE_CUP.perSeason?pool:[...TYPES];
    while(picks.length<TYPE_CUP.perSeason){const t=source[Math.floor(rng()*source.length)];if(!picks.includes(t))picks.push(t);}
    game.competitions.typeRules[y]=picks;
  }
  return game.competitions.typeRules[y];
}
function addTypeCups(game,y,d,yearLabel){
  const spec=CUP_SCHEDULE.find(c=>c.kind==='type');
  if((y-1)*SEASON.days+d<game.day)return;
  const type=typeRulesFor(game,y)[spec.days.indexOf(d)],ko=TYPE_NAME_KO[type];
  for(const [division,capacity,prize,label] of [['youth',TYPE_CUP.youthCapacity,TYPE_CUP.youthPrize,'유스부'],['open',TYPE_CUP.openCapacity,TYPE_CUP.openPrize,'오픈부']]){
    const id=`type-${y}-${d}-${division}`;
    if(game.competitions.events.some(e=>e.id===id))continue;
    game.competitions.events.push({...baseEvent(game,{id,name:`${yearLabel} ${ko}컵 · ${label}`,kind:'type',division,y,d,capacity,prize,clauses:['species','item'],city:TYPE_CITY[type]||null,eligibility:`type-${division}`}),typeRule:type,reform:!!game.reform});
  }
}
const typesOf=m=>Dex.species.get(m.species)?.types||[];
export const hasType=(m,type)=>typesOf(m).includes(type);
/** 등록 파티(앞 6마리)가 전원 지정 타입인가 — 플레이어 등록 조건 */
export function typePartyOk(t,type){const party=(t.party||[]).slice(0,6);return party.length>0&&party.every(m=>hasType(m,type));}
const POSITION_ROLES=['champion','elite-four'];

export function youthEligible(t){return !!t?.isYouth&&!proEligible(t)&&!!t.party?.length;}
export function cupEligible(t,e){
  if(!t?.party?.length)return false;
  if(e.kind==='youth')return e.eligibility==='youth-any'?!!t.isYouth:youthEligible(t);
  if(e.kind==='youth-final')return !!t.isYouth;
  if(e.kind==='demo')return proEligible(t)&&!['champion','elite-four','gym-leader'].includes(t.regionalRole);
  if(e.kind==='local'&&e.division==='youth')return !!t.isYouth;
  if(e.kind==='city')return isRaceSeat(t)&&!POSITION_ROLES.includes(t.regionalRole);   // 리저브·사천왕·챔피언은 시티컵 불가
  if(e.kind==='type'){
    if(!t.party.some(m=>hasType(m,e.typeRule)))return false;
    /* 유스부: 8배지 미만 유스 / 오픈부: 등록 프로 + 콜업 보류 유스 + 사천왕·챔피언 */
    return e.division==='youth'?youthEligible(t):(isRegisteredPro(t)||(!!t.isYouth&&proEligible(t))||POSITION_ROLES.includes(t.regionalRole));
  }
  return e.kind==='local';
}
export function registerCup(game,eventId,trainerId,remove=false){
  const e=ensureSeason(game).events.find(e=>e.id===eventId),t=findTrainer(game.league,trainerId);
  if(!e||e.status!=='scheduled'||game.day<e.openDay||game.day>e.deadline) return {ok:false,msg:'접수 기간이 아닙니다.'};
  if(!t||t.agencyId!==game.playerAgencyId)return {ok:false,msg:'우리 소속 트레이너만 등록할 수 있습니다.'};
  if(remove){e.registrations=e.registrations.filter(id=>id!==trainerId);return {ok:true};}
  if(!cupEligible(t,e)||game.pendingStarter?.trainerId===t.id)return {ok:false,msg:'대회의 참가 신분과 파트너 보유 조건을 확인하세요.'};
  if(e.kind==='type'&&!typePartyOk(t,e.typeRule))return {ok:false,msg:`이번 타입컵은 ${TYPE_NAME_KO[e.typeRule]} 타입 포켓몬만 등록할 수 있습니다.`};
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
  if(e.drawnIds&&['drawn','live'].includes(e.status))return e.drawnIds.map(id=>findTrainer(game.league,id)||competitionTrainer(game,id)).filter(Boolean);
  if(e.kind==='youth-final'){
    const top=seriesPoints(game,e.season).slice(0,e.capacity).map(r=>findTrainer(game.league,r.id)).filter(t=>t&&t.isYouth&&t.party?.length);
    return top;
  }
  const fillers=(e.fillers||[]).map(id=>game.personnel?.freeAgents?.find(t=>t.id===id)).filter(Boolean);
  const own=e.registrations.map(id=>findTrainer(game.league,id)).filter(t=>t?.agencyId===game.playerAgencyId&&cupEligible(t,e)&&!t.camp);
  const npc=game.league.agencies.filter(a=>a.id!==game.playerAgencyId).flatMap(a=>a.roster.filter(t=>cupEligible(t,e)).map(t=>({t,score:npcEntryScore(a,t)})))
    .filter(x=>!x.t.camp&&x.score>=SEASON.npcThreshold).sort((a,b)=>b.score-a.score||a.t.id.localeCompare(b.t.id));
  /* 국내 사천왕·챔피언은 로컬컵·타입컵 오픈부에 나온다 (§21.2) */
  const officials=(e.kind==='local'||(e.kind==='type'&&e.division==='open'))&&e.division!=='youth'?(game.international?.officials||[]).filter(t=>isDomestic(t.region)&&POSITION_ROLES.includes(t.regionalRole)&&cupEligible(t,e)):[];
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
export function cupToday(game){return ensureSeason(game).events.find(e=>e.date===game.day&&['scheduled','drawn'].includes(e.status));}
/** 오늘 열리는 대회 전부 (타입컵은 유스부·오픈부가 같은 날) */
export function cupsToday(game){return ensureSeason(game).events.filter(e=>e.date===game.day&&['scheduled','drawn'].includes(e.status));}
/* ---------------- 대회 진행 — 접수 마감일에 대진 발표 → 개최일에 파티 확정 → 라운드 ----------------
 * 접수는 개최 SEASON.registrationLead일 전부터 SEASON.drawLead일 전까지. 마감일 하루가 끝나면 대진을 발표한다(drawCup).
 * 그 사이 며칠 동안 상대를 보고 대비하고, 출전 파티는 개최일에 확정한다(startCup).
 * 하루 진행에서는 개최일에 한 번에 끝까지 돌리고(runCup), 우리 선수가 나가는 유스컵은 [계속]마다 라운드 하나씩(liveCupStep).
 * 라운드 사이에 실제 파티의 선봉 순서·포켓몬별 전술을 출전 파티에 반영한다. 두 경로의 난수 순서는 같다.
 */
const cupKey=(e,i)=>`${e.id}:${i}`;
/** 대진 발표: 참가자 확정·추첨. 참가자가 2명 미만이면 취소 */
export async function drawCup(game,e){
  if(e.status!=='scheduled')return false;
  await prepareCupEntrants(game,e);
  const trainers=cupEntrants(game,e);
  e.decisions=game.league.agencies.filter(a=>a.id!==game.playerAgencyId).flatMap(a=>a.roster.filter(t=>cupEligible(t,e)).map(t=>({trainerId:t.id,score:npcEntryScore(a,t),entered:trainers.includes(t)})));
  if(trainers.length<2){e.status='cancelled';e.entrants=[];game.league.newsFeed.unshift({day:game.day,kind:'cup',text:`${e.name} · 참가자 부족으로 취소. 상금 지급 없음.`});return false;}
  const order=[...trainers];
  for(let i=order.length-1;i>0;i--){const j=Math.floor(game.rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  if(e.kind==='city'){const scores=citySeedScores(game,e);order.sort((a,b)=>(scores.get(b.id)??RANKING.base)-(scores.get(a.id)??RANKING.base));}
  let size=2;while(size<order.length)size*=2;
  e.drawnIds=order.map(t=>t.id);
  e.slots=seedOrder(size).map(n=>order[n-1]?.id||null);e.draw=[...e.slots];e.round=1;e.status='drawn';e.drawnDay=game.day;
  /* 우리 선수의 첫 상대를 소식으로 */
  const n=id=>findTrainer(game.league,id)?.name||competitionTrainer(game,id)?.name||id;
  const mine=cupPairs(e).filter(p=>p.some(id=>id&&findTrainer(game.league,id)?.agencyId===game.playerAgencyId));
  game.league.newsFeed.unshift({day:game.day,kind:'cup',cupId:e.id,text:`${e.name} 대진 발표 (개최 D-${e.date-game.day}) · ${mine.length?mine.map(([a,b])=>`${n(a)} vs ${b?n(b):'부전승'}`).join(' / '):`참가 ${order.length}명`}. 일정에서 대진표와 상대 파티를 확인하세요.`});
  return true;
}
/** 개최일: 출전 파티 확정. 그 사이 출전할 수 없게 된 선수는 기권(상대 부전승) */
export function startCup(game,e){
  if(e.status!=='drawn'||e.date!==game.day)return false;
  const trainers=(e.drawnIds||[]).map(id=>findTrainer(game.league,id)||competitionTrainer(game,id)).filter(t=>t&&t.party?.length&&!t.camp);
  /* 상대 트레이너는 배운 기술 중 좋은 4개·지닌 도구·키스톤을 챙겨 나온다 (원작 데이터를 쓰는 관장 파티는 그대로) */
  for(const t of trainers)if(t.agencyId!==game.playerAgencyId&&t.generated!==false)outfitNpcTrainer(t);
  /* 우리 선수의 출전 포켓몬에 대회 표식 — 라운드 사이에 순서·전술을 반영할 때 짝을 찾는다 */
  for(const t of trainers)if(t.agencyId===game.playerAgencyId)t.party.slice(0,e.rosterSize).forEach((m,i)=>{m._cupKey=cupKey(e,i);});
  e.entrants=trainers.map(t=>({id:t.id,name:t.name,agencyId:t.agencyId,agencyName:competitionAgency(game,t),party:officialParty(e.kind==='type'&&t.agencyId!==game.playerAgencyId?[...t.party].filter(m=>hasType(m,e.typeRule)).sort((x,y)=>y.level-x.level).slice(0,e.rosterSize):t.party.slice(0,e.rosterSize),e),definition:structuredClone({name:t.name,isYouth:t.isYouth,badges:t.badges,legacyPro:t.legacyPro,regionalRole:t.regionalRole,stats:effectiveStats(t),nature:t.nature,battlePolicy:t.battlePolicy,mentalDebuff:t.mentalDebuff,lossStreak:t.lossStreak,keyStone:!!t.keyStone})}));
  if(e.entrants.length<2){e.status='cancelled';clearCupKeys(game,e);game.league.newsFeed.unshift({day:game.day,kind:'cup',text:`${e.name} · 출전 가능한 참가자가 부족해 취소.`});return false;}
  e.status='live';
  return true;
}
/** 라운드 이름 — 결승·준결승·8강… */
export const cupRoundLabel=(e,round=e.round)=>{const total=Math.log2(e.draw?.length||e.slots?.length||2);const left=total-round+1;return left<=1?'결승':left===2?'준결승':left===3?'8강':`${2**left}강`;};
/** 우리 선수: 실제 파티의 선봉 순서·포켓몬별 전술 지시를 출전 파티에 반영 (등록 6마리·기술·도구는 그대로) */
export function syncOurEntrants(game,e){
  for(const x of e.entrants){
    if(x.agencyId!==game.playerAgencyId)continue;
    const t=competitionTrainer(game,x.id);if(!t)continue;
    const pos=m=>{const i=t.party.findIndex(p=>p._cupKey&&p._cupKey===m._cupKey);return i<0?99:i;};
    x.party.sort((a,b)=>pos(a)-pos(b));
    for(const m of x.party){const src=t.party.find(p=>p._cupKey&&p._cupKey===m._cupKey);if(src)m.tactics=structuredClone(src.tactics||null)??undefined;}
  }
}
function clearCupKeys(game,e){for(const t of game.league.agencies.find(a=>a.id===game.playerAgencyId)?.roster||[])for(const m of t.party)if(m._cupKey?.startsWith(`${e.id}:`))delete m._cupKey;}
/** 지금 라운드의 대진 [a, b] (부전승은 한쪽 null) */
export function cupPairs(e){const out=[];for(let i=0;i<(e.slots||[]).length;i+=2)out.push([e.slots[i],e.slots[i+1]]);return out;}
/** 라운드 하나 — 돌려주는 값: 이번 라운드 경기들 */
export async function playCupRound(game,e,onProgress=async()=>{}){
  if(e.status!=='live')return [];
  const E=id=>e.entrants.find(x=>x.id===id),next=[],played=[],round=e.round;
  for(let i=0;i<e.slots.length;i+=2){
    let a=E(e.slots[i]),b=E(e.slots[i+1]);if(!a||!b){next.push((a||b)?.id||null);continue;}
    if(b.agencyId===game.playerAgencyId&&a.agencyId!==game.playerAgencyId)[a,b]=[b,a];
    const seed=Math.floor(game.rng()*0x7fffffff);
    const r=runBattle({trainerA:createTrainerAI({...a.definition,partyTactics:a.party.map(m=>m.tactics)},a.definition.nature?.style,makeRng(seed+1)),trainerB:createTrainerAI({...b.definition,partyTactics:b.party.map(m=>m.tactics)},b.definition.nature?.style,makeRng(seed+2)),teamA:partyToTeam(a.party),teamB:partyToTeam(b.party),seed,collectThink:true});
    // A drawn engine battle is recorded as drawn; a seeded draw decides advancement explicitly.
    const tie=r.winner==null,winner=tie?(game.rng()<0.5?a:b):(r.winner==='p1'?a:b);
    const m={id:`${e.id}-${round}-${i/2}`,round,aId:a.id,bId:b.id,winnerId:winner.id,draw:tie,seed,log:r.log,turns:r.turns,
      trainerName:a.name,gymName:b.name,agencyName:a.agencyName,opponentAgency:b.agencyName,eventName:e.name,
      won:winner.id===a.id,analysis:analyseBattle(r,{policy:a.definition.battlePolicy,mentalDebuff:a.definition.mentalDebuff,lossStreak:a.definition.lossStreak})};
    e.matches.push(m);next.push(winner.id);played.push(m);
    /* 우리 선수는 배틀 기록으로 진화 카운터를 올린다 (저승갓숭·대도각참 등) */
    for(const [x,side] of [[a,'p1'],[b,'p2']])if(x.agencyId===game.playerAgencyId){const real=competitionTrainer(game,x.id);if(real)recordBattle(real.party,r.log,side);}
    if(!e.live&&e.watchMode==='watch'&&(a.agencyId===game.playerAgencyId||b.agencyId===game.playerAgencyId))(game.pendingCupWatches??=[]).push(m.id);
    await onProgress({id:m.id,state:'done',label:e.name,detail:`${a.name} vs ${b.name} · ${winner.name} 진출${tie?' (무승부 추첨)':''}`});
  }
  e.slots=next;e.round++;
  if(e.slots.length<=1)await finishCup(game,e);
  return played;
}
async function finishCup(game,e){
  const champion=e.entrants.find(x=>x.id===e.slots[0]),final=e.matches.at(-1);
  if(!champion||!final){e.status='cancelled';clearCupKeys(game,e);return;}
  const runner=e.entrants.find(x=>x.id===(final.aId===champion.id?final.bId:final.aId));
  e.result={championId:champion.id,runnerId:runner.id};
  e.scouting=[];
  for(const x of e.entrants){
    const t=competitionTrainer(game,x.id),count=e.matches.filter(m=>m.aId===x.id||m.bId===x.id).length;
    const growth=[];
    for(const mon of t.party.slice(0,e.rosterSize)){const before=mon.level;await gainExp(mon,SEASON.experience*count);growth.push({species:mon.species,before,level:mon.level,experience:SEASON.experience*count});}
    for(const key of STAT_KEYS)t.stats[key]=Math.min(t.potential?.[key]??t.stats[key],t.stats[key]+SEASON.growth*count);
    const wins=e.matches.filter(m=>m.winnerId===t.id&&!m.draw).length;
    const losses=e.matches.filter(m=>!m.draw&&m.winnerId!==t.id&&(m.aId===t.id||m.bId===t.id)).length;
    t.fatigue=Math.max(0,Math.min(100,(t.fatigue||0)+losses*SEASON.fatigue-wins*2));   // 컨디션은 패배로 깎인다
    t.record.wins+=wins;t.record.losses+=losses;
    e.scouting.push({trainerId:t.id,name:t.name,agencyName:x.agencyName,growth,text:`${count}경기 · ${wins}승 · 출전 당시 ${x.party.map(p=>`${ko(SPECIES_KO,p.species)} Lv.${p.level}`).join(', ')}. 상대와 파티 차이를 함께 보고 평가하세요.`});
  }
  for(const [x,prize]of [[champion,SEASON.prize*(e.prizeMultiplier??1)],[runner,SEASON.runnerPrize*(e.prizeMultiplier??1)]]){
    payCompetitionPrize(game,x,prize,SEASON.reputation*(e.reputationMultiplier??1));
  }
  e.status='completed';clearCupKeys(game,e);
  game.league.newsFeed.unshift({day:game.day,kind:'cup',text:`${e.name} · ${champion.name} 우승 (${SEASON.prize*(e.prizeMultiplier??1)}), ${runner.name} 준우승 (${SEASON.runnerPrize*(e.prizeMultiplier??1)}). 일정에서 대진·저장 관전·스카우팅 보고서를 확인하세요.`});
}
/** 하루 진행용 — 개최일에 (추첨이 안 됐으면 추첨부터) 결승까지 한 번에 */
export async function runCup(game,e,onProgress=async()=>{}){
  if(e.date!==game.day)return;
  if(e.status==='scheduled'&&!(await drawCup(game,e)))return;
  if(e.status==='drawn'&&!startCup(game,e))return;
  while(e.status==='live')await playCupRound(game,e,onProgress);
}
/** 접수 마감일 하루가 끝날 때 대진 발표 (하루 진행에서 부른다) */
export async function drawDueCups(game){
  for(const e of ensureSeason(game).events.filter(e=>e.status==='scheduled'&&e.deadline<=game.day&&e.date>game.day))await drawCup(game,e);
}

/* ---------------- 유스컵 직접 진행 (live) ---------------- */

/** 오늘 [계속]으로 직접 진행할 대회 — 우리 선수가 나가는 유스컵(그랑프리 파이널 포함) */
export function liveCupToday(game){
  return ensureSeason(game).events.find(e=>e.date===game.day&&['youth','youth-final'].includes(e.kind)
    &&(e.status==='live'||(['scheduled','drawn'].includes(e.status)&&cupEntrants(game,e).some(t=>t.agencyId===game.playerAgencyId))));
}
/**
 * [계속] 한 번 — 라운드 하나 (첫 라운드 전에 추첨이 안 됐으면 추첨, 출전 파티 확정).
 * @returns {{stage:'round'|'done'|'cancelled', matches?}}
 */
export async function liveCupStep(game,e){
  e.live=true;
  if(e.status==='scheduled'&&!(await drawCup(game,e)))return {stage:'cancelled'};
  if(e.status==='drawn'&&!startCup(game,e))return {stage:'cancelled'};
  if(e.status==='live'){
    syncOurEntrants(game,e);
    const matches=await playCupRound(game,e);
    return {stage:e.status==='completed'?'done':'round',matches};
  }
  return {stage:'done'};
}

// Compatibility for existing saved reports and tests.
export const registerYouth=registerCup;
export const runYouthCup=runCup;
