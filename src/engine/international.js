import { PWT, INTERNATIONAL_REGIONS, dayInSeason } from '../data/international.js';
import { GYMS } from '../data/gyms.js';
import { createPokemon, partyToTeam, expForLevel } from '../data/pokemon.js';
import { buildParty } from './team-builder.js';
import { createTrainerAI, runBattle, makeRng } from './run-battle.js';
import { seedOrder } from './league.js';
import { swissPairs } from './swiss.js';

export function ensureInternational(game){
  game.international??={version:1,officials:[],regions:[],seasons:[],honours:[]};
  return game.international;
}
const yearOf=day=>Math.floor((day-1)/365)+1;
export function internationalSeason(game){
  const state=ensureInternational(game),year=yearOf(game.day);
  let s=state.seasons.find(s=>s.season===year);
  if(!s){
    const start=(year-1)*365+PWT.gymDay;
    s={id:`pwt-${year}`,name:`제${year}시즌 PWT`,season:year,start,lockUntil:(year-1)*365+PWT.lockEnd,
      status:game.day>start?'missed':'scheduled',stage:'예선 대기',entrants:[],qualifiers:[],matches:[],viewed:[],
      processed:[],swiss:{},qualified:[],bracket:[],result:null,watchMode:'results'};
    state.seasons.push(s);
  }
  return s;
}
export async function ensureOfficials(game){
  const state=ensureInternational(game);
  if(state.regions.length)return state;
  // Build into temporary arrays, so partially generated officials cannot be saved.
  const officials=[],regions=[];
  async function add(region,role,index,gym=null){
    const id=gym?`official-${gym.id}`:`official-${region.id}-${role}-${index}`;
    let party;
    if(gym){
      party=[];
      for(const def of gym.seriousParty){
        const m=await createPokemon({species:def.species,level:def.level,rng:game.rng});
        if(!m)throw new Error(`관장 파티 종족 확인 필요: ${def.species}`);
        m.moves=[...def.moves];m.item=def.item||null;party.push(m);
      }
    }else party=await buildParty(game.rng,'elite');
    const name=gym?.name||`${region.name} ${role==='champion'?'챔피언':role==='elite-four'?`사천왕 ${index+1}`:`관장 ${index+1}`}`;
    const t={id,name,region:region.id,agencyId:`officials-${region.id}`,regionalRole:role,isYouth:false,legacyPro:true,badges:[],
      generated:!gym,source:gym?.seriousSource||'생성 대표 · 원작 네임드 배치 미확정',party,
      stats:{...PWT.stats},potential:{...PWT.stats},nature:{style:'균형형',compliance:10},
      fatigue:0,record:{wins:0,losses:0},prizeMoney:0,reputation:0};
    officials.push(t);return id;
  }
  for(const region of INTERNATIONAL_REGIONS){
    const gymIds=[],eliteIds=[];
    if(region.id==='kanto-johto')for(const gym of GYMS.filter(g=>PWT.gymRegions.includes(g.region)))gymIds.push(await add(region,'gym-leader',0,gym));
    else for(let i=0;i<8;i++)gymIds.push(await add(region,'gym-leader',i));
    for(let i=0;i<4;i++)eliteIds.push(await add(region,'elite-four',i));
    regions.push({...region,gymIds,eliteIds,championId:await add(region,'champion',0)});
  }
  state.officials=officials;state.regions=regions;return state;
}
export function competitionTrainer(game,id){
  return game.league.agencies.flatMap(a=>a.roster).find(t=>t.id===id)||game.international?.officials.find(t=>t.id===id);
}
export function competitionAgency(game,t){
  return game.league.agencies.find(a=>a.id===t.agencyId)?.name||`${INTERNATIONAL_REGIONS.find(r=>r.id===t.region)?.name||'지역'} 리그`;
}
export function payCompetitionPrize(game,x,prize,reputation){
  const a=game.league.agencies.find(a=>a.id===x.agencyId);
  if(a){a.funds+=prize;a.reputation+=reputation;}
  else {const t=competitionTrainer(game,x.id);if(t){t.prizeMoney=(t.prizeMoney||0)+prize;t.reputation=(t.reputation||0)+reputation;}}
}
function snapshotEntry(game,t){
  const party=structuredClone(t.party.slice(0,PWT.rosterSize));
  for(const m of party){m.level=PWT.level;m.exp=expForLevel(PWT.level);delete m.fieldState;delete m.training;}
  return {id:t.id,name:t.name,region:t.region||'kanto-johto',agencyId:t.agencyId,agencyName:competitionAgency(game,t),party,
    definition:structuredClone({name:t.name,stats:t.stats,nature:t.nature,battlePolicy:t.battlePolicy,isYouth:false,legacyPro:true,regionalRole:t.regionalRole,badges:t.badges})};
}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
async function match(game,s,a,b,stage,region,onProgress,keepLog=true){
  const seed=Math.floor(game.rng()*0x7fffffff);
  const r=runBattle({trainerA:createTrainerAI(a.definition,a.definition.nature?.style,makeRng(seed+1)),
    trainerB:createTrainerAI(b.definition,b.definition.nature?.style,makeRng(seed+2)),teamA:partyToTeam(a.party),teamB:partyToTeam(b.party),seed});
  const draw=r.winner==null,winner=draw?(game.rng()<0.5?a:b):r.winner==='p1'?a:b;
  const m={id:`${s.id}-${s.matches.length+1}`,day:game.day,stage,region,aId:a.id,bId:b.id,winnerId:winner.id,draw,seed,
    log:keepLog?r.log:null,turns:r.turns,trainerName:a.name,gymName:b.name,agencyName:a.agencyName,opponentAgency:b.agencyName,
    eventName:`${s.name} · ${stage}`,won:winner.id===a.id};
  s.matches.push(m);
  if(keepLog&&s.watchMode==='watch'&&(a.region==='kanto-johto'||b.region==='kanto-johto'))(game.pendingCupWatches??=[]).push(m.id);
  await onProgress({id:m.id,state:'done',label:m.eventName,detail:`${a.name} vs ${b.name} · ${winner.name} 승리${draw?' (무승부 추첨)':''}`});
  return winner;
}
async function gymQualifiers(game,s,onProgress){
  await ensureOfficials(game);
  s.entrants=game.international.officials.map(t=>snapshotEntry(game,t));
  for(const r of game.international.regions){
    let pool=shuffle(r.gymIds.map(id=>s.entrants.find(t=>t.id===id)),game.rng);
    let round=1;
    while(pool.length>2){
      const next=[];
      for(let i=0;i<pool.length;i+=2)next.push(await match(game,s,pool[i],pool[i+1],`관장 예선 ${round}라운드`,r.id,onProgress,r.id==='kanto-johto'));
      pool=next;round++;
    }
    s.qualifiers.push({region:r.id,gymIds:pool.map(t=>t.id),championId:r.championId,eliteIds:[...r.eliteIds],groups:[],qualified:[]});
  }
  s.stage='파이널 예선 대기';s.status='qualifying';
}
async function finalQualifiers(game,s,onProgress){
  for(const q of s.qualifiers){
    const six=shuffle([...q.gymIds,...q.eliteIds].map(id=>s.entrants.find(t=>t.id===id)),game.rng);
    const seconds=[];
    for(let i=0;i<2;i++){
      const members=six.slice(i*3,i*3+3),wins=Object.fromEntries(members.map(t=>[t.id,0]));
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
        const winner=await match(game,s,members[a],members[b],`파이널 예선 ${i===0?'A':'B'}조`,q.region,onProgress,q.region==='kanto-johto');
        wins[winner.id]++;
      }
      // For a 1-1 cycle no head-to-head order exists: record an explicit seeded draw.
      const tie=new Set(Object.values(wins)).size===1;
      const order=tie?shuffle([...members],game.rng):[...members].sort((a,b)=>wins[b.id]-wins[a.id]);
      q.groups.push({ids:members.map(t=>t.id),wins,order:order.map(t=>t.id),tieBreak:tie?'동률 순환 · 추첨':null});
      q.qualified.push(order[0].id);seconds.push(order[1]);
    }
    q.qualified.push((await match(game,s,seconds[0],seconds[1],'파이널 예선 최종 진출전',q.region,onProgress,q.region==='kanto-johto')).id);
  }
  const ids=s.qualifiers.flatMap(q=>[q.championId,...q.qualified]);
  if(new Set(ids).size!==32)throw new Error('PWT 지역 대표는 중복 없이 32명이어야 합니다.');
  s.representatives=shuffle(ids.map(id=>s.entrants.find(t=>t.id===id)),game.rng).map(t=>t.id);
  s.swiss=Object.fromEntries(ids.map(id=>[id,{wins:0,losses:0}]));s.status='swiss';s.stage='스위스 대기';
}
async function swissRound(game,s,round,onProgress){
  const entries=s.representatives.map(id=>s.entrants.find(t=>t.id===id));
  const pairs=swissPairs(entries,s.swiss,s.matches.filter(m=>m.stage.startsWith('스위스')),round);
  for(const [a,b]of pairs){
    const winner=await match(game,s,a,b,`스위스 ${round}라운드`,'international',onProgress);
    s.swiss[winner.id].wins++;s.swiss[winner.id===a.id?b.id:a.id].losses++;
  }
  s.stage=`스위스 ${round}라운드 완료`;
  if(round===5){
    const qualified=entries.filter(t=>s.swiss[t.id].wins===3).sort((a,b)=>s.swiss[a.id].losses-s.swiss[b.id].losses);
    if(qualified.length!==16)throw new Error('스위스 통과자는 16명이어야 합니다.');
    s.qualified=qualified.map(t=>t.id);s.bracket=seedOrder(16).map(n=>qualified[n-1].id);s.status='knockout';
  }
}
async function knockout(game,s,onProgress){
  const size=s.bracket.length,next=[];
  for(let i=0;i<size;i+=2){
    const a=s.entrants.find(t=>t.id===s.bracket[i]),b=s.entrants.find(t=>t.id===s.bracket[i+1]);
    next.push((await match(game,s,a,b,size===2?'결승':`${size}강`,'international',onProgress)).id);
  }
  s.bracket=next;s.stage=size===2?'대회 종료':`${size}강 완료`;
  if(size===2){
    const final=s.matches.at(-1),champion=s.entrants.find(t=>t.id===next[0]),runner=s.entrants.find(t=>t.id===(final.aId===champion.id?final.bId:final.aId));
    s.result={championId:champion.id,runnerId:runner.id,region:champion.region};s.status='completed';
    s.pwcAuto={trainerId:champion.id,region:champion.region,baseSeeds:4,extraSeed:true,party:structuredClone(champion.party)};
    payCompetitionPrize(game,champion,PWT.prize,PWT.reputation);payCompetitionPrize(game,runner,PWT.runnerPrize,PWT.reputation);
    game.international.honours.push({season:s.season,kind:'pwt',trainerId:champion.id,name:champion.name,region:champion.region});
  }
}
export async function tickInternational(game,onProgress=async()=>{}){
  const s=internationalSeason(game),d=dayInSeason(game.day);
  if(s.status==='missed'||s.processed.includes(d))return null;
  if(d===PWT.gymDay&&s.status==='scheduled')await gymQualifiers(game,s,onProgress);
  else if(d===PWT.finalQualifierDay&&s.status==='qualifying')await finalQualifiers(game,s,onProgress);
  else if(PWT.swissDays.includes(d)&&s.status==='swiss')await swissRound(game,s,PWT.swissDays.indexOf(d)+1,onProgress);
  else if(PWT.knockoutDays.includes(d)&&s.status==='knockout')await knockout(game,s,onProgress);
  else return null;
  s.processed.push(d);
  const text=s.result?`${s.name} · ${s.entrants.find(t=>t.id===s.result.championId).name} 우승 · PWC 자동 출전권 획득`:`${s.name} · ${s.stage} · 일정에서 결과와 저장 관전을 확인하세요.`;
  game.league.newsFeed.unshift({day:game.day,kind:'pwt',text});return text;
}
