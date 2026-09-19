import { internationallyLocked } from '../data/international.js';
import { PERSONNEL as P, COACH_CANDIDATES } from '../data/personnel.js';
import { SEASON } from '../data/season.js';
import { seasonDate } from './season.js';
import { youthCount, youthCapacity } from './career.js';
import { YOUTH_CANDIDATES } from '../data/youth-candidates.js';
import { candidateProposal, evaluateOffer, contractFrom } from './contract.js';
import { STAT_KEYS } from '../data/agencies.js';
import { STAT_KO } from '../data/styles.js';

export const offseason=game=>seasonDate(game.day).phase.id==='offseason';
const player=game=>game.league.agencies.find(a=>a.id===game.playerAgencyId);
const owned=(game,id)=>player(game).roster.find(t=>t.id===id);
export function ensurePersonnel(game){
  game.personnel??={version:1,freeAgents:[],history:[],notices:[]};
  for(const a of game.league.agencies){
    a.coaches??=[];
    for(const t of a.roster){
      t.contract??={};
      if(!Number.isFinite(t.contract.endsOn))t.contract.endsOn=Math.max((game.day||1)+P.noticeDays,(t.contract.signedOnDay??t.contract.startDay??game.day??1)+Math.max(1,t.contract.years||1)*SEASON.days);
    }
  }
  return game.personnel;
}
export function personnelCandidate(t){
  const fixed=YOUTH_CANDIDATES.find(c=>`y-${c.id}`===t.id);
  if(fixed)return {...fixed,pref:structuredClone(fixed.pref)};
  const pref={reputation:{want:25,weight:1,kind:'more'},wage:{want:Math.max(8,Math.min(60,t.contract?.wage??t.salary??12)),weight:3,kind:'more'},
    signing:{want:150,weight:2,kind:'more'},proRaise:{want:t.isYouth?100:0,weight:t.isYouth?2:0,kind:'more'},badgeBonus:{want:t.isYouth?30:0,weight:t.isYouth?1:0,kind:'more'},years:{want:3,weight:2,kind:'near'}};
  return {id:t.id,name:t.name,pref};
}
export function contractProposal(game,t){return candidateProposal(personnelCandidate(t),player(game));}
function room(a,t){return a.roster.length<P.rosterLimit&&(!t.isYouth||youthCount(a)<youthCapacity(a));}
export function transferQuote(game,id){
  if(internationallyLocked(game,id))return null;
  const state=ensurePersonnel(game),free=state.freeAgents.find(t=>t.id===id);
  if(free)return {trainer:free,fee:0,from:null};
  for(const a of game.league.agencies){
    if(a.id===game.playerAgencyId||a.roster.length<=1)continue;
    const t=a.roster.find(t=>t.id===id);
    if(t&&!t.camp)return {trainer:t,fee:Math.round((t.contract.wage??t.salary??12)*P.transferWages),from:a.id};
  }
  return null;
}
export function negotiatePersonnel(game,id,offer,{renew=false,quotedFee=0}={}){
  ensurePersonnel(game);
  const a=player(game),q=renew?null:transferQuote(game,id),t=renew?owned(game,id):q?.trainer;
  if(!t||t.camp||game.pendingStarter)return {ok:false,msg:'현재 계약을 진행할 수 없습니다.'};
  if(t.lastPersonnelAgreementDay===game.day)return {ok:false,msg:'오늘 이미 계약을 체결했습니다.'};
  if(renew&&!offseason(game)&&t.contract.endsOn-game.day>P.renewLead)return {ok:false,msg:'비시즌 또는 만료90일 전부터 재협상합니다.'};
  if(!renew&&((q.from&&!offseason(game))||!room(a,t)||q.fee!==quotedFee))return {ok:false,msg:'비시즌·정원·현재 이적료를 다시 확인하세요.'};
  const fee=q?.fee||0,result=evaluateOffer(personnelCandidate(t),offer,{...a,funds:a.funds-fee});
  if(!result.accept)return {ok:false,msg:result.reasons.join(' ')};
  // All checks precede the single financial/ownership commit.
  const previous=t.contract;
  a.funds-=fee+offer.signing;
  if(!renew){
    if(q.from){const seller=game.league.agencies.find(a=>a.id===q.from);seller.funds+=fee;seller.roster=seller.roster.filter(x=>x.id!==id);}
    else game.personnel.freeAgents=game.personnel.freeAgents.filter(x=>x.id!==id);
    a.roster.push(t);t.agencyId=a.id;
  }
  t.contract={...previous,...contractFrom(offer,game.day),kind:t.isYouth?'youth':'pro',endsOn:game.day+offer.years*SEASON.days};t.salary=offer.wage;
  t.lastPersonnelAgreementDay=game.day;
  const text=`${t.name} ${renew?'재계약':'영입'} · 주급${offer.wage} · ${offer.years}년 · 개런티${offer.signing}${fee?` · 이적료${fee}`:''}`;
  game.personnel.history.unshift({day:game.day,kind:renew?'renew':'transfer',trainerId:id,text});
  game.league.newsFeed.unshift({day:game.day,kind:'personnel',text});
  return {ok:true,msg:text};
}
export function releaseQuote(game,id){const t=owned(game,id);return t?Math.round((t.contract?.wage??t.salary??0)*P.releaseWeeks):null;}
function toFreeAgent(game,a,t){a.roster=a.roster.filter(x=>x.id!==t.id);t.agencyId=null;t.coachAssigned=null;delete game.actions[t.id];delete t.camp;game.personnel.freeAgents.push(t);}
export function releaseContract(game,id,fee){
  ensurePersonnel(game);const a=player(game),t=owned(game,id);
  if(!offseason(game)||!t||internationallyLocked(game,id)||t.camp||game.pendingStarter||fee!==releaseQuote(game,id)||a.funds<fee)return {ok:false,msg:'비시즌·계약 상태·정산금을 확인하세요.'};
  a.funds-=fee;toFreeAgent(game,a,t);
  const text=`${t.name} 계약 해지 · 정산금${fee} · 현재 파티와 가방을 보유한 자유계약 선수로 전환`;
  game.personnel.history.unshift({day:game.day,kind:'release',trainerId:id,text});game.league.newsFeed.unshift({day:game.day,kind:'personnel',text});
  return {ok:true,msg:text};
}
export function hireCoach(game,id){
  ensurePersonnel(game);const a=player(game),c=COACH_CANDIDATES.find(c=>c.id===id);
  if(!offseason(game)||!c||a.coaches.some(x=>x.id===id)||a.coaches.length>=P.coachCapacity||a.funds<c.signing)return {ok:false,msg:'비시즌·코치 정원·자금을 확인하세요.'};
  a.funds-=c.signing;a.coaches.push({...c,endsOn:game.day+SEASON.days});return {ok:true,msg:`${c.name} 1년 계약 · 주급${c.wage}`};
}
export function assignCamp(game,id,stat,coachId){
  ensurePersonnel(game);const a=player(game),t=owned(game,id),c=a.coaches.find(c=>c.id===coachId&&c.endsOn>game.day+P.campDays-1);
  if(a.roster.some(x=>x.camp&&x.coachAssigned===coachId))return {ok:false,msg:'이 코치는 다른 캠프를 지도 중입니다.'};
  if(game.competitions?.events.some(e=>e.status==='scheduled'&&e.date>=game.day&&e.date<game.day+P.campDays&&e.registrations.includes(id)))return {ok:false,msg:'등록한 유스컵 일정과 겹칩니다. 등록을 먼저 취소하세요.'};
  if(!offseason(game)||seasonDate(game.day+P.campDays-1).phase.id!=='offseason'||!t||t.camp||!c||!STAT_KEYS.includes(stat)||a.funds<P.campFee||game.pendingStarter||t.contract.endsOn<=game.day+P.campDays-1||t.stats[stat]>=t.potential[stat])return {ok:false,msg:'비시즌 안에 완료 가능한 캠프·계약·코치·성장 여력을 확인하세요.'};
  a.funds-=P.campFee;t.coachAssigned=c.id;t.camp={stat,remaining:P.campDays,gain:P.campGain+c.bonus,coachName:c.name};delete game.actions[id];return {ok:true,msg:`${t.name} ${P.campDays}일 캠프 배정`};
}
export function tickCamp(t){
  const c=t.camp;if(!c)return null;
  const before=t.stats[c.stat];t.stats[c.stat]=Math.min(t.potential[c.stat],before+c.gain);t.fatigue=Math.max(0,(t.fatigue||0)-5);c.remaining--;
  const text=`${t.name} · ${c.coachName} 캠프 ${c.remaining?'진행':'완료'} · ${STAT_KO[c.stat]} +${(t.stats[c.stat]-before).toFixed(2)}${c.remaining?` · ${c.remaining}일 남음`:''}`;
  if(!c.remaining){delete t.camp;t.coachAssigned=null;}
  return text;
}
export function tickPersonnel(game){
  const state=ensurePersonnel(game);
  for(const a of game.league.agencies){
    a.coaches=a.coaches.filter(c=>c.endsOn>game.day);
    for(const t of [...a.roster]){
      const left=t.contract.endsOn-game.day;
      const notice=`${t.id}:${t.contract.endsOn}`;
      if(a.id===game.playerAgencyId&&left<=P.noticeDays&&left>0&&!state.notices.includes(notice)){state.notices.push(notice);game.league.newsFeed.unshift({day:game.day,kind:'personnel',text:`${t.name} 계약 만료까지 ${left}일 · 계약·스태프에서 재협상하세요. 만료 시 파티·가방과 함께 자유계약 전환.`});}
      if(left>0)continue;
      if(a.id!==game.playerAgencyId&&a.funds>=(t.contract.wage??t.salary??0)*P.reserveWeeks){t.contract.endsOn=game.day+SEASON.days;t.contract.signedOnDay=game.day;t.contract.years=1;continue;}
      toFreeAgent(game,a,t);const text=`${t.name} 계약 만료 · 현재 파티·가방과 함께 자유계약 전환`;
      state.history.unshift({day:game.day,kind:'expired',trainerId:t.id,text});game.league.newsFeed.unshift({day:game.day,kind:'personnel',text});
    }
  }
}
