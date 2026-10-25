/**
 * 국제 대회 — Road to PWT · PWT · PWC (docs/competition-v1.md §7·§8·§10·§11·§12)
 *
 * 9개 지방(관동·성도 분리). 지방마다 관장 8 · 사천왕 4 · 챔피언 1.
 * 대표 36명(지방당 4, 시드 1~4) → 플레이인(4시드 8명, GSL 2조) → 스위스 32명 → 녹아웃 16명.
 * 예전 저장의 진행 중 PWT(8지역·32명, version 없음)는 예전 방식으로 끝까지 치른다.
 */
import { PWT, PWC, INTERNATIONAL_REGIONS, dayInSeason, seasonOf, isDomestic, regionName } from '../data/international.js';
import { GYMS } from '../data/gyms.js';
import { createPokemon, partyToTeam, expForLevel } from '../data/pokemon.js';
import { outfitNpcTrainer } from './npc-loadout.js';
import { buildParty } from './team-builder.js';
import { createTrainerAI, runBattle, makeRng } from './run-battle.js';
import { seedOrder } from './league.js';
import { swissPairs, swissPairsV2, swissTiebreak } from './swiss.js';
import { createSeries, runSeries } from './series.js';
import { Dex } from '@pkmn/dex';

/** 테스트용 — 배틀 대신 결과만 정하는 함수를 끼울 수 있다 (규칙 검증 1000 시드) */
export const battleHooks = { quick: null };

export function ensureInternational(game){
  game.international??={version:2,officials:[],regions:[],seasons:[],pwc:[],honours:[]};
  game.international.pwc??=[];
  return game.international;
}

/* ---------------- 공식 인물 (관장·사천왕·챔피언) ---------------- */

async function makeOfficial(game,region,role,index,gym=null){
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
  return {id,name,region:region.id,agencyId:`officials-${region.id}`,regionalRole:role,isYouth:false,legacyPro:true,badges:[],
    generated:!gym,source:gym?.seriousSource||'생성 대표 · 원작 네임드 배치 미확정',party,
    stats:{...PWT.stats},potential:{...PWT.stats},nature:{style:'균형형',compliance:10},
    fatigue:0,record:{wins:0,losses:0},prizeMoney:0,reputation:0};
}

/** 9개 지방 공식 인물을 만든다. 예전 저장(관동·성도 통합)은 관동·성도로 나눈다 (§16.2) */
export async function ensureOfficials(game){
  const state=ensureInternational(game);
  if(state.regions.length&&!state.regions.some(r=>r.id==='kanto-johto'))return state;
  // Build into temporary arrays, so partially generated officials cannot be saved.
  const officials=[...state.officials],regions=[];
  const old=new Map(state.regions.map(r=>[r.id,r]));
  for(const region of INTERNATIONAL_REGIONS){
    const legacy=region.id==='kanto'?old.get('kanto-johto'):old.get(region.id);
    if(legacy&&region.id!=='kanto'&&region.id!=='johto'){regions.push({...legacy,...region});continue;}
    const gymIds=[],eliteIds=[];
    const gyms=GYMS.filter(g=>g.region===region.id);
    if(gyms.length){
      for(const gym of gyms){
        const id=`official-${gym.id}`;
        let t=officials.find(o=>o.id===id);
        if(!t){t=await makeOfficial(game,region,'gym-leader',0,gym);officials.push(t);}
        t.region=region.id;t.agencyId=`officials-${region.id}`;gymIds.push(id);
      }
    }else for(let i=0;i<8;i++){const t=await makeOfficial(game,region,'gym-leader',i);officials.push(t);gymIds.push(t.id);}
    let championId;
    if(region.id==='kanto'&&legacy){
      /* 기존 통합 지방의 사천왕·챔피언은 관동으로 옮긴다 — id는 그대로(경기 기록 참조 유지) */
      for(const id of legacy.eliteIds){const t=officials.find(o=>o.id===id);if(t){t.region='kanto';t.agencyId='officials-kanto';}eliteIds.push(id);}
      championId=legacy.championId;const c=officials.find(o=>o.id===championId);if(c){c.region='kanto';c.agencyId='officials-kanto';}
    }else{
      for(let i=0;i<4;i++){const t=await makeOfficial(game,region,'elite-four',i);officials.push(t);eliteIds.push(t.id);}
      const c=await makeOfficial(game,region,'champion',0);officials.push(c);championId=c.id;
    }
    regions.push({...region,gymIds,eliteIds,championId});
  }
  state.officials=officials;state.regions=regions;state.version=2;
  return state;
}

export function competitionTrainer(game,id){
  return game.league.agencies.flatMap(a=>a.roster).find(t=>t.id===id)||game.international?.officials.find(t=>t.id===id)||game.personnel?.freeAgents?.find(t=>t.id===id);
}
export function competitionAgency(game,t){
  if(!t.agencyId&&t.freeAgent)return '무소속';
  return game.league.agencies.find(a=>a.id===t.agencyId)?.name||`${regionName(t.region)} 리그`;
}
export function payCompetitionPrize(game,x,prize,reputation){
  const a=game.league.agencies.find(a=>a.id===x.agencyId);
  if(a){a.funds+=prize;a.reputation+=reputation;}
  else {const t=competitionTrainer(game,x.id);if(t){t.prizeMoney=(t.prizeMoney||0)+prize;t.reputation=(t.reputation||0)+reputation;}}
}

/** 국제 대회 출전 스냅샷 — 전원 Lv50, 등록 6마리, 같은 종·같은 도구 1개씩 (§5) */
export function snapshotEntry(game,t,{level=PWT.level,clauses=PWT.clauses,region=null,cap=false}={}){
  if(t.generated)outfitNpcTrainer(t);
  const species=new Set(),items=new Set(),party=[];
  for(const src of t.party){
    if(party.length>=PWT.rosterSize)break;
    const m=structuredClone(src);
    if(clauses?.includes('species')){const base=Dex.species.get(m.species).baseSpecies||m.species;if(species.has(base))continue;species.add(base);}
    if(clauses?.includes('item')&&m.item){if(items.has(m.item))m.item=null;else items.add(m.item);}
    /* 국제 대회는 전원 Lv50 고정, 지역 리그는 50 초과만 50 (cap) */
    if(level&&(!cap||m.level>level)){m.level=level;m.exp=expForLevel(level);}
    delete m.fieldState;delete m.training;party.push(m);
  }
  return {id:t.id,name:t.name,region:region||t.region||'kanto',agencyId:t.agencyId,agencyName:competitionAgency(game,t),party,
    definition:structuredClone({name:t.name,stats:t.stats,nature:t.nature,battlePolicy:t.battlePolicy,isYouth:false,legacyPro:true,regionalRole:t.regionalRole,badges:t.badges,keyStone:!!t.keyStone})};
}
export function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

/** 게임 한 판 — 이벤트(ev)의 matches에 쌓는다 */
export async function playMatch(game,ev,a,b,stage,region,onProgress,keepLog=true){
  const seed=Math.floor(game.rng()*0x7fffffff);
  let r;
  if(battleHooks.quick)r=battleHooks.quick(a,b,seed);
  else r=runBattle({trainerA:createTrainerAI({...a.definition,partyTactics:a.party.map(m=>m.tactics)},a.definition.nature?.style,makeRng(seed+1)),
    trainerB:createTrainerAI({...b.definition,partyTactics:b.party.map(m=>m.tactics)},b.definition.nature?.style,makeRng(seed+2)),teamA:partyToTeam(a.party),teamB:partyToTeam(b.party),seed});
  const draw=r.winner==null,winner=draw?(game.rng()<0.5?a:b):r.winner==='p1'?a:b;
  const m={id:`${ev.id}-${ev.matches.length+1}`,day:game.day,stage,region,aId:a.id,bId:b.id,winnerId:winner.id,draw,seed,
    log:keepLog?r.log:null,turns:r.turns,trainerName:a.name,gymName:b.name,agencyName:a.agencyName,opponentAgency:b.agencyName,
    eventName:`${ev.name} · ${stage}`,won:winner.id===a.id};
  ev.matches.push(m);
  if(keepLog&&ev.watchMode==='watch'&&(isDomestic(a.region)||isDomestic(b.region)))(game.pendingCupWatches??=[]).push(m.id);
  await onProgress({id:m.id,state:'done',label:m.eventName,detail:`${a.name} vs ${b.name} · ${winner.name} 승리${draw?' (무승부 추첨)':''}`});
  return m;
}
/** 시리즈 한 묶음 — 이벤트의 series에 쌓고 승자 엔트리를 돌려준다 */
export async function playSeries(game,ev,a,b,format,stage,region,onProgress,keepLog=true){
  ev.series??=[];
  const s=createSeries({id:`${ev.id}-s${ev.series.length+1}`,eventId:ev.id,stage,day:game.day,format,a,b});
  ev.series.push(s);
  await runSeries(s,a,b,(x,y,n)=>playMatch(game,ev,x,y,format==='bo1'?stage:`${stage} · ${n}게임`,region,onProgress,keepLog));
  return s.winnerId===a.id?a:b;
}
/** 저장 용량: 국제 대회는 지금 우리 소속 선수가 뛴 경기만 로그를 남긴다. 결과·대진·스코어는 전부 남는다 */
let logOwner=null;
const ours=e=>!!logOwner&&e.agencyId===logOwner;
const domesticLog=(a,b)=>ours(a)||ours(b);

/* ---------------- PWT 시즌 객체 ---------------- */

export function internationalSeason(game){
  const state=ensureInternational(game),year=seasonOf(game.day);
  let s=state.seasons.find(s=>s.season===year);
  /* 예전 저장에서 아직 시작 안 한 PWT는 새 구조로 올린다 (§16.1) */
  if(s&&!s.version&&s.status==='scheduled'){state.seasons=state.seasons.filter(x=>x!==s);s=null;}
  if(!s){
    const start=(year-1)*365+PWT.gymDay;
    const held=state.seasons.filter(x=>x.version===2&&!['not-held','missed'].includes(x.status)).length;
    s={id:`pwt-${year}`,name:`제${year}시즌 PWT`,kind:'pwt',version:2,season:year,start,lockUntil:(year-1)*365+PWT.lockEnd,
      status:game.reform&&year===1?'not-held':game.day>start?'missed':'scheduled',stage:'예선 대기',entrants:[],qualifiers:[],matches:[],series:[],viewed:[],
      processed:[],swiss:{},qualified:[],bracket:[],result:null,watchMode:'results'};
    if(s.status==='scheduled'){
      s.edition=held+1;
      s.host=INTERNATIONAL_REGIONS[(s.edition-1)%INTERNATIONAL_REGIONS.length].id;
      s.name=`제${s.edition}회 PWT`;
      game.league?.newsFeed?.unshift({day:game.day,kind:'pwt',text:`${s.name}는 ${regionName(s.host)}에서 열립니다.`});
    }
    state.seasons.push(s);
  }
  return s;
}

/* ---------------- Road to PWT (§7) ---------------- */

async function gymQualifiers(game,s,onProgress){
  await ensureOfficials(game);
  s.entrants=game.international.officials.filter(t=>['gym-leader','elite-four','champion'].includes(t.regionalRole)).map(t=>snapshotEntry(game,t));
  for(const r of game.international.regions){
    let pool=shuffle(r.gymIds.map(id=>s.entrants.find(t=>t.id===id)).filter(Boolean),game.rng);
    let round=1;
    while(pool.length>2){
      const next=[];
      for(let i=0;i<pool.length;i+=2)next.push(await playSeries(game,s,pool[i],pool[i+1],'bo1',`관장 예선 ${round}라운드`,r.id,onProgress,domesticLog(pool[i],pool[i+1])));
      pool=next;round++;
    }
    s.qualifiers.push({region:r.id,gymIds:pool.map(t=>t.id),championId:r.championId,eliteIds:[...r.eliteIds],groups:[],qualified:[]});
  }
  s.stage='파이널 예선 대기';s.status='qualifying';
}
async function finalQualifiers(game,s,onProgress){
  s.seeds={};s.seedOf={};
  for(const q of s.qualifiers){
    const six=shuffle([...q.gymIds,...q.eliteIds].map(id=>s.entrants.find(t=>t.id===id)).filter(Boolean),game.rng);
    const seconds=[],firsts=[];
    for(let i=0;i<2;i++){
      const members=six.slice(i*3,i*3+3),wins=Object.fromEntries(members.map(t=>[t.id,0]));
      for(let a=0;a<members.length;a++)for(let b=a+1;b<members.length;b++){
        const w=await playSeries(game,s,members[a],members[b],'bo1',`파이널 예선 ${i===0?'A':'B'}조`,q.region,onProgress,domesticLog(members[a],members[b]));
        wins[w.id]++;
      }
      // For a 1-1 cycle no head-to-head order exists: record an explicit seeded draw.
      const tie=new Set(Object.values(wins)).size===1;
      const order=tie?shuffle([...members],game.rng):[...members].sort((a,b)=>wins[b.id]-wins[a.id]);
      q.groups.push({ids:members.map(t=>t.id),wins,order:order.map(t=>t.id),tieBreak:tie?'동률 순환 · 추첨':null});
      firsts.push(order[0]);seconds.push(order[1]);
    }
    const last=await playSeries(game,s,seconds[0],seconds[1],'bo1','파이널 예선 최종 진출전',q.region,onProgress,domesticLog(seconds[0],seconds[1]));
    q.qualified=[firsts[0].id,firsts[1].id,last.id];
    /* 1시드 챔피언 · 2시드 A조 1위 · 3시드 B조 1위 · 4시드 최종 진출전 승자 */
    s.seeds[q.region]=[q.championId,...q.qualified];
    s.seeds[q.region].forEach((id,i)=>{s.seedOf[id]=i+1;});
  }
  const ids=Object.values(s.seeds).flat();
  if(new Set(ids).size!==INTERNATIONAL_REGIONS.length*4)throw new Error(`PWT 지방 대표는 중복 없이 ${INTERNATIONAL_REGIONS.length*4}명이어야 합니다.`);
  for(const id of ids){const e=s.entrants.find(t=>t.id===id);if(e)e.region=s.qualifiers.find(q=>s.seeds[q.region].includes(id)).region;}
  s.representatives=ids;
  /* 대표가 아닌 공식 인물은 이름만 남긴다 (예선 기록 표시용, 저장 용량) */
  s.entrants=s.entrants.map(e=>ids.includes(e.id)?e:{id:e.id,name:e.name,region:e.region,agencyName:e.agencyName,light:true});
  s.status='play-in';s.stage='플레이인 대기';
  game.league.newsFeed.unshift({day:game.day,kind:'pwt',text:`${s.name} 대표 확정 · 관동 ${s.seeds.kanto.map(id=>s.entrants.find(t=>t.id===id)?.name).join(', ')} / 성도 ${s.seeds.johto.map(id=>s.entrants.find(t=>t.id===id)?.name).join(', ')}`});
}

/* ---------------- 플레이인 · 스위스 · 녹아웃 (PWT·PWC 공통) ---------------- */

/** 플레이인 참가자: 직행 지방을 뺀 4시드 8명을 A·B조로 (§8.3) */
function setupPlayIn(game,s,directRegion){
  const fours=Object.entries(s.seeds).filter(([r])=>r!==directRegion).map(([,ids])=>ids[3]);
  shuffle(fours,game.rng);
  s.playIn={direct:directRegion,groups:[{id:'A',ids:fours.slice(0,4)},{id:'B',ids:fours.slice(4,8)}],passed:[],eliminated:[]};
}
async function playInDay(game,s,cfg,day,onProgress){
  const E=id=>s.entrants.find(t=>t.id===id);
  for(const g of s.playIn.groups){
    if(day===0){
      const [p1,p2,p3,p4]=g.ids.map(E);
      const o1=await playSeries(game,s,p1,p2,'bo3',`플레이인 ${g.id}조 개막전`,'international',onProgress,domesticLog(p1,p2));
      const o2=await playSeries(game,s,p3,p4,'bo3',`플레이인 ${g.id}조 개막전`,'international',onProgress,domesticLog(p3,p4));
      const l1=o1===p1?p2:p1,l2=o2===p3?p4:p3;
      const w=await playSeries(game,s,o1,o2,'bo3',`플레이인 ${g.id}조 승자전`,'international',onProgress,domesticLog(o1,o2));
      const l=await playSeries(game,s,l1,l2,'bo3',`플레이인 ${g.id}조 패자전`,'international',onProgress,domesticLog(l1,l2));
      g.first=w.id;g.winnersLoser=(w===o1?o2:o1).id;g.losersWinner=l.id;
      s.playIn.eliminated.push((l===l1?l2:l1).id);
    }else{
      const a=E(g.winnersLoser),b=E(g.losersWinner);
      const w=await playSeries(game,s,a,b,'bo3',`플레이인 ${g.id}조 최종전`,'international',onProgress,domesticLog(a,b));
      g.second=w.id;s.playIn.eliminated.push((w===a?b:a).id);
      s.playIn.passed.push(g.first,g.second);
    }
  }
  if(day===1){
    const ids=[...Object.values(s.seeds).flatMap(x=>x.slice(0,3)),s.seeds[s.playIn.direct][3],...s.playIn.passed];
    if(new Set(ids).size!==cfg.swissSize)throw new Error('스위스 입장은 중복 없이 32명이어야 합니다.');
    s.swissIds=shuffle([...ids],game.rng);
    s.swiss=Object.fromEntries(ids.map(id=>[id,{wins:0,losses:0}]));s.opponents=Object.fromEntries(ids.map(id=>[id,[]]));s.h2h={};
    s.tiebreakOrder=shuffle([...ids],game.rng);
    s.status='swiss';s.stage='스위스 대기';
    for(const id of s.playIn.eliminated)game.league.newsFeed.unshift({day:game.day,kind:s.kind,text:`${s.name} 플레이인 · ${E(id)?.name} 탈락`});
  }else s.stage='플레이인 최종전 대기';
}
async function swissRoundV2(game,s,cfg,round,onProgress){
  const E=id=>s.entrants.find(t=>t.id===id);
  const entries=s.swissIds.map(id=>({id,region:E(id).region,seed:s.seedOf[id]||4}));
  const played=new Set(s.series.filter(x=>x.stage.startsWith('스위스')).map(x=>[x.aId,x.bId].sort().join('|')));
  const pairs=swissPairsV2(entries,s.swiss,played,{round,pwtWinnerId:s.kind==='pwc'?s.pwtWinnerId:null});
  for(const p of pairs){
    const a=E(p.a.id),b=E(p.b.id);
    const w=await playSeries(game,s,a,b,p.format,`스위스 ${round}라운드 (${p.wins}-${p.losses})`,'international',onProgress,domesticLog(a,b));
    const l=w===a?b:a;
    s.swiss[w.id].wins++;s.swiss[l.id].losses++;
    s.opponents[a.id].push(b.id);s.opponents[b.id].push(a.id);s.h2h[`${w.id}|${l.id}`]=true;
  }
  s.stage=`스위스 ${round}라운드 완료`;
  if(round===5){
    const rank=rec=>swissTiebreak(s.swissIds.filter(id=>s.swiss[id].wins===rec[0]&&s.swiss[id].losses===rec[1]),
      {records:s.swiss,opponents:s.opponents,seedOf:s.seedOf,pwtWinnerId:s.kind==='pwc'?s.pwtWinnerId:null,h2h:s.h2h,tiebreakOrder:s.tiebreakOrder});
    const groups=[[3,0],[3,1],[3,2]].map(rank);
    const qualified=groups.flat();
    if(qualified.length!==cfg.knockoutSize)throw new Error('스위스 통과자는 16명이어야 합니다.');
    s.qualified=qualified;
    s.swissOrder=[...qualified,...[[2,3],[1,3],[0,3]].flatMap(rank)];
    const bracket=seedOrder(16).map(n=>qualified[n-1]);
    /* 16강 같은 지방 회피: 아래 시드를 같은 전적 그룹 안에서 바꾼다 (§12.3) */
    const groupOf=id=>groups.findIndex(g=>g.includes(id));
    for(let i=0;i<16;i+=2){
      const [x,y]=[bracket[i],bracket[i+1]];
      if(E(x).region!==E(y).region)continue;
      const low=qualified.indexOf(x)>qualified.indexOf(y)?i:i+1,hi=low===i?i+1:i;
      const partner=j=>bracket[j%2?j-1:j+1];
      const isLow=j=>qualified.indexOf(bracket[j])>qualified.indexOf(partner(j));
      const swap=bracket.findIndex((id,j)=>j!==low&&j!==hi&&isLow(j)&&groupOf(id)===groupOf(bracket[low])&&E(id).region!==E(bracket[hi]).region
        &&E(bracket[low]).region!==E(partner(j)).region);
      if(swap>=0)[bracket[low],bracket[swap]]=[bracket[swap],bracket[low]];
      else (s.notes??=[]).push(`16강 같은 지방 대결을 피할 수 없었습니다: ${E(x).name} vs ${E(y).name}`);
    }
    s.bracket=bracket;s.ko={round:0,done:[]};s.status='knockout';
  }
}
const KO_NAMES=['16강','8강','4강','결승'];
/** 녹아웃 하루치 — part는 그날 치를 쌍 범위 (PWC는 위쪽·아래쪽을 나눈다) */
async function knockoutDay(game,s,cfg,part,onProgress){
  const E=id=>s.entrants.find(t=>t.id===id);
  const r=s.ko.round,format=cfg.knockoutFormat[r],pairs=s.bracket.length/2,half=Math.ceil(pairs/2);
  const [from,to]=part===null?[0,pairs]:part===0?[0,half]:[half,pairs];
  for(let i=from;i<to;i++){
    const a=E(s.bracket[i*2]),b=E(s.bracket[i*2+1]);
    /* 저장 용량: 국내 선수 경기와 결승만 로그를 남긴다 */
    s.ko.done[i]=(await playSeries(game,s,a,b,format,KO_NAMES[r],'international',onProgress,domesticLog(a,b)||pairs===1)).id;
  }
  if(s.ko.done.filter(Boolean).length<pairs){s.stage=`${KO_NAMES[r]} 진행 중`;return;}
  const losers=s.bracket.filter(id=>!s.ko.done.includes(id));
  (s.koLosers??=[]).push(losers);
  s.bracket=[...s.ko.done];s.ko={round:r+1,done:[]};s.stage=`${KO_NAMES[r]} 완료`;
  if(s.bracket.length===1)finishWorld(game,s,cfg);
}
function finishWorld(game,s,cfg){
  const E=id=>s.entrants.find(t=>t.id===id);
  const champion=E(s.bracket[0]),runner=E(s.koLosers.at(-1)[0]);
  s.result={championId:champion.id,runnerId:runner.id,region:champion.region};s.status='completed';s.stage='대회 종료';
  const place={};
  place[champion.id]='champion';place[runner.id]='runner';
  const [r16,qf,sf]=s.koLosers;
  for(const id of sf||[])place[id]='semi';
  for(const id of qf||[])place[id]='quarter';
  for(const id of r16||[])place[id]='r16';
  for(const id of s.swissIds)place[id]??='swiss';
  for(const id of s.playIn?.eliminated||[])place[id]='playIn';
  s.placements=place;
  for(const [id,p] of Object.entries(place)){const [prize,rep]=cfg.payout[p];payCompetitionPrize(game,E(id),prize,rep);}
  game.international.honours.push({season:s.season,kind:s.kind,trainerId:champion.id,name:champion.name,region:champion.region});
  if(s.kind==='pwt')s.pwcAuto={trainerId:champion.id,region:champion.region};
}

/* ---------------- 예전 PWT (8지역, version 없음) — 진행 중이던 시즌만 끝까지 ---------------- */

async function legacyMatch(game,s,a,b,stage,onProgress){return E(s,(await playMatch(game,s,a,b,stage,'international',onProgress,true)).winnerId);}
const E=(s,id)=>s.entrants.find(t=>t.id===id);
async function legacyFinalQualifiers(game,s,onProgress){
  for(const q of s.qualifiers){
    const six=shuffle([...q.gymIds,...q.eliteIds].map(id=>E(s,id)),game.rng);
    const seconds=[];
    for(let i=0;i<2;i++){
      const members=six.slice(i*3,i*3+3),wins=Object.fromEntries(members.map(t=>[t.id,0]));
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)wins[(await legacyMatch(game,s,members[a],members[b],`파이널 예선 ${i===0?'A':'B'}조`,onProgress)).id]++;
      const tie=new Set(Object.values(wins)).size===1;
      const order=tie?shuffle([...members],game.rng):[...members].sort((a,b)=>wins[b.id]-wins[a.id]);
      q.groups.push({ids:members.map(t=>t.id),wins,order:order.map(t=>t.id),tieBreak:tie?'동률 순환 · 추첨':null});
      q.qualified.push(order[0].id);seconds.push(order[1]);
    }
    q.qualified.push((await legacyMatch(game,s,seconds[0],seconds[1],'파이널 예선 최종 진출전',onProgress)).id);
  }
  const ids=s.qualifiers.flatMap(q=>[q.championId,...q.qualified]);
  s.representatives=shuffle(ids.map(id=>E(s,id)),game.rng).map(t=>t.id);
  s.swiss=Object.fromEntries(ids.map(id=>[id,{wins:0,losses:0}]));s.status='swiss';s.stage='스위스 대기';
}
async function legacySwiss(game,s,round,onProgress){
  const entries=s.representatives.map(id=>E(s,id));
  for(const [a,b] of swissPairs(entries,s.swiss,s.matches.filter(m=>m.stage.startsWith('스위스')),round)){
    const w=await legacyMatch(game,s,a,b,`스위스 ${round}라운드`,onProgress);
    s.swiss[w.id].wins++;s.swiss[w.id===a.id?b.id:a.id].losses++;
  }
  s.stage=`스위스 ${round}라운드 완료`;
  if(round===5){
    const q=entries.filter(t=>s.swiss[t.id].wins===3).sort((a,b)=>s.swiss[a.id].losses-s.swiss[b.id].losses);
    s.qualified=q.map(t=>t.id);s.bracket=seedOrder(16).map(n=>q[n-1].id);s.status='knockout';
  }
}
async function legacyKnockout(game,s,onProgress){
  const size=s.bracket.length,next=[];
  for(let i=0;i<size;i+=2)next.push((await legacyMatch(game,s,E(s,s.bracket[i]),E(s,s.bracket[i+1]),size===2?'결승':`${size}강`,onProgress)).id);
  s.bracket=next;s.stage=size===2?'대회 종료':`${size}강 완료`;
  if(size===2){
    const final=s.matches.at(-1),champion=E(s,next[0]),runner=E(s,final.aId===champion.id?final.bId:final.aId);
    s.result={championId:champion.id,runnerId:runner.id,region:champion.region};s.status='completed';
    s.pwcAuto={trainerId:champion.id,region:champion.region};
    payCompetitionPrize(game,champion,PWT.prize,PWT.reputation);payCompetitionPrize(game,runner,PWT.runnerPrize,PWT.reputation);
    game.international.honours.push({season:s.season,kind:'pwt',trainerId:champion.id,name:champion.name,region:champion.region});
  }
}

/* ---------------- PWT 하루 진행 ---------------- */

export async function tickInternational(game,onProgress=async()=>{}){
  setLogOwner(game);
  const s=internationalSeason(game),d=dayInSeason(game.day);
  if(s.status==='missed'||s.status==='not-held'||s.processed.includes(d))return null;
  if(s.version!==2){
    if(d===PWT.finalQualifierDay&&s.status==='qualifying')await legacyFinalQualifiers(game,s,onProgress);
    else if(PWT.swissDays.includes(d)&&s.status==='swiss')await legacySwiss(game,s,PWT.swissDays.indexOf(d)+1,onProgress);
    else if(PWT.knockoutDays.includes(d)&&s.status==='knockout')await legacyKnockout(game,s,onProgress);
    else return null;
  }else{
    if(d===PWT.gymDay&&s.status==='scheduled')await gymQualifiers(game,s,onProgress);
    else if(d===PWT.finalQualifierDay&&s.status==='qualifying'){await finalQualifiers(game,s,onProgress);setupPlayIn(game,s,s.host);}
    else if(PWT.playInDays.includes(d)&&s.status==='play-in')await playInDay(game,s,PWT,PWT.playInDays.indexOf(d),onProgress);
    else if(PWT.swissDays.includes(d)&&s.status==='swiss')await swissRoundV2(game,s,PWT,PWT.swissDays.indexOf(d)+1,onProgress);
    else if(PWT.knockoutDays.includes(d)&&s.status==='knockout')await knockoutDay(game,s,PWT,null,onProgress);
    else return null;
  }
  s.processed.push(d);
  const text=s.result?`${s.name} · ${E(s,s.result.championId).name} 우승 · PWC 출전 보장`:`${s.name} · ${s.stage} · 일정에서 결과와 저장 관전을 확인하세요.`;
  game.league.newsFeed.unshift({day:game.day,kind:'pwt',text});return text;
}

/* ---------------- PWC (§11) ---------------- */

function setLogOwner(game){logOwner=game.playerAgencyId;}
export function pwcSeason(game,year=seasonOf(game.day)){
  const state=ensureInternational(game);
  let s=state.pwc.find(x=>x.season===year);
  if(!s){
    const start=(year-1)*365+PWC.registrationDay;
    s={id:`pwc-${year}`,name:`제${year}시즌 PWC`,kind:'pwc',version:2,season:year,start,lockUntil:(year-1)*365+PWC.lockEnd,
      status:game.reform&&year===1?'not-held':game.day>start?'missed':'scheduled',stage:'지역 리그 결과 대기',
      entrants:[],matches:[],series:[],viewed:[],processed:[],swiss:{},qualified:[],bracket:[],result:null,watchMode:'results'};
    state.pwc.push(s);
  }
  return s;
}

/**
 * 출전 명단 확정 (315일): 지역 리그 결과 시드 1~4 + PWT 우승자가 자기 지방 4장 밖이면 4시드를 가져간다.
 * @param leagueSeeds {region: [1시드…4시드]} — regional-league.js가 넘긴다
 */
export function registerPwc(game,s,leagueSeeds){
  const pwt=internationalSeason(game);
  const winner=pwt.result?.championId||null;
  const winnerRegion=winner?(pwt.entrants.find(t=>t.id===winner)?.region||pwt.result.region):null;
  s.seeds={};s.seedOf={};s.notes=[];
  for(const r of INTERNATIONAL_REGIONS){
    const seeds=[...(leagueSeeds[r.id]||[])];
    if(seeds.length!==4)throw new Error(`${r.name} PWC 시드가 4명이 아닙니다.`);
    if(winner&&r.id===winnerRegion&&!seeds.includes(winner)){
      const bumped=seeds[3];seeds[3]=winner;
      const n=id=>competitionTrainer(game,id)?.name||id;
      s.notes.push(`PWT 우승자 ${n(winner)}가 ${r.name} 4시드를 가져갔다. ${n(bumped)}(3·4위전 승자)는 PWC 출전이 무산됐다.`);
    }
    s.seeds[r.id]=seeds;seeds.forEach((id,i)=>{s.seedOf[id]=i+1;});
  }
  const ids=Object.values(s.seeds).flat();
  if(new Set(ids).size!==INTERNATIONAL_REGIONS.length*4)throw new Error('PWC 대표는 중복 없이 36명이어야 합니다.');
  s.entrants=Object.entries(s.seeds).flatMap(([region,list])=>list.map(id=>snapshotEntry(game,competitionTrainer(game,id),{region})));
  s.representatives=ids;s.pwtWinnerId=winner;
  setupPlayIn(game,s,winnerRegion||pwt.host||'kanto');
  s.status='play-in';s.stage='플레이인 대기';
  for(const text of s.notes)game.league.newsFeed.unshift({day:game.day,kind:'pwc',text});
  for(const r of ['kanto','johto'])game.league.newsFeed.unshift({day:game.day,kind:'pwc',text:`PWC ${regionName(r)} 대표: ${s.seeds[r].map(id=>s.entrants.find(t=>t.id===id).name).join(', ')}`});
}

export async function tickPwc(game,leagueSeedsFor,onProgress=async()=>{}){
  setLogOwner(game);
  const s=pwcSeason(game),d=dayInSeason(game.day);
  if(['missed','not-held','completed'].includes(s.status)||s.processed.includes(d))return null;
  if(d===PWC.registrationDay&&s.status==='scheduled'){
    const seeds=leagueSeedsFor(game,s.season);
    if(!seeds){s.status='missed';s.stage='지역 리그가 열리지 않아 미개최';return null;}
    registerPwc(game,s,seeds);
  }
  else if(PWC.playInDays.includes(d)&&s.status==='play-in')await playInDay(game,s,PWC,PWC.playInDays.indexOf(d),onProgress);
  else if(PWC.swissDays.includes(d)&&s.status==='swiss')await swissRoundV2(game,s,PWC,PWC.swissDays.indexOf(d)+1,onProgress);
  else if(s.status==='knockout'){
    const days=PWC.knockoutDays[s.ko.round];
    if(!days?.includes(d))return null;
    await knockoutDay(game,s,PWC,days.length===1?null:days.indexOf(d),onProgress);
  }
  else return null;
  s.processed.push(d);
  const text=s.result?`${s.name} · ${E(s,s.result.championId).name} 세계 챔피언!`:`${s.name} · ${s.stage}`;
  game.league.newsFeed.unshift({day:game.day,kind:'pwc',text});return text;
}

/** 국내 컵 경기 로그를 모두 남기는 기간 (일) — 그 뒤에는 우리 경기·결승만 [임시] */
export const CUP_LOG_DAYS = 30;
/**
 * 경기 로그 정리 (매일) — 결과·대진·시리즈 스코어는 늘 남기고, 저장 용량이 시즌마다 쌓이지 않게 한다.
 *   · 국내 컵: 끝난 지 CUP_LOG_DAYS일이 지나면 우리 소속 경기와 결승만 로그를 남긴다
 *   · 국제 대회·지역 리그: 지난 시즌 것은 우리 소속 경기와 결승·챔피언전만
 */
export function pruneOldLogs(game){
  const year=seasonOf(game.day),mine=new Set(game.league.agencies.find(a=>a.id===game.playerAgencyId)?.roster.map(t=>t.id)||[]);
  const ours=(ev,m)=>{const ent=id=>ev.entrants?.find?.(e=>e.id===id);return [m.aId,m.bId].some(id=>mine.has(id)||ent(id)?.agencyId===game.playerAgencyId);};
  const strip=(ev,isFinal)=>{for(const m of ev.matches||[])if(m.log&&!ours(ev,m)&&!isFinal(m)){m.log=null;m.pruned=true;}};
  const bigStage=m=>/결승|챔피언전/.test(m.stage||'');
  const st=game.international;
  for(const ev of [...(st?.seasons||[]),...(st?.pwc||[])])if(ev.season<year)strip(ev,bigStage);
  for(const s of game.regionalLeague?.seasons||[])if(s.season<year)for(const R of Object.values(s.regions||{}))strip(R,bigStage);
  /* 지난 시즌 대회는 결과·대진·이름만 — 출전 파티 스냅샷·경기 분석·스카우팅 보고서를 정리한다 */
  const light=e=>({id:e.id,name:e.name,agencyId:e.agencyId,agencyName:e.agencyName,region:e.region,light:true,...(e.definition?{definition:{isYouth:e.definition.isYouth,badges:e.definition.badges,regionalRole:e.definition.regionalRole}}:{})});
  const slim=ev=>{if(ev.slimmed||ev.season>=year)return;ev.entrants=(ev.entrants||[]).map(e=>e.light?e:light(e));delete ev.scouting;for(const m of ev.matches||[])delete m.analysis;ev.slimmed=true;};
  for(const ev of [...(st?.seasons||[]),...(st?.pwc||[]),...(game.competitions?.events||[])])if(ev.status==='completed'||ev.status==='cancelled'||ev.season<year)slim(ev);
  for(const s of game.regionalLeague?.seasons||[])if(s.season<year)for(const R of Object.values(s.regions||{}))slim({...R,season:s.season})||(R.entrants=(R.entrants||[]).map(e=>e.light?e:light(e)));
  for(const ev of game.competitions?.events||[]){
    if(ev.status!=='completed'||ev.date>game.day-CUP_LOG_DAYS||ev.logsPruned)continue;
    const last=Math.max(0,...(ev.matches||[]).map(m=>m.round||0));
    strip(ev,m=>m.round===last);ev.logsPruned=true;
  }
}
