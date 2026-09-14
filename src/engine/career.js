import { CAREER } from '../data/career.js';
import { badgeProgress } from './gym-progress.js';
import { GYMS } from '../data/gyms.js';
import { buildParty, makeStarterParty } from './team-builder.js';

export const youthCount = agency => agency.roster.filter(t=>t.isYouth).length;
export const youthCapacity = agency => agency.youthCapacity ?? CAREER.youthCapacity;
export const proEligible = trainer => badgeProgress(trainer).best >= 8 || !!trainer.legacyPro;
export const isRegisteredPro = trainer => !trainer.isYouth && proEligible(trainer);
export function careerLabel(trainer) {
  if(trainer.isYouth) return proEligible(trainer) ? '콜업 가능 · 유스 등록' : '유스';
  return isRegisteredPro(trainer) ? '프로' : '자격 확인 필요';
}

/** New games only. Saves never have existing trainers replaced with presets. */
export async function setupCareerStart(game) {
  if(game.careerStartApplied)return;
  for(const agency of game.league.agencies){
    const preset=CAREER.starting[agency.tier]||CAREER.starting.indie;
    agency.youthCapacity=CAREER.youthCapacity;
    agency.roster=agency.roster.slice(0,preset.pros+preset.youths);
    const region=agency.id.includes('doraji')||agency.name.includes('도라지')?'johto':'kanto';
    for(const [i,t] of agency.roster.entries()){
      t.isYouth=i>=preset.pros;
      t.party=t.isYouth?await makeStarterParty(game.rng):await buildParty(game.rng,preset.profile);
      t.badges=t.isYouth?[]:GYMS.filter(g=>g.region===region).map(g=>g.id);
      t.careerOrigin='generated';
      t.contract={...t.contract,wage:Math.round(t.salary*CAREER.weeklySalaryFactor),years:3,startDay:1,proRaise:t.isYouth?100:0,badgeBonus:0};
      t.salary=t.contract.wage;
      t.promotionApplied=!t.isYouth;
    }
  }
  game.opening.done=true; // First youth tutorial is independent of recruitment eligibility.
  game.opening.tutorialContractNeeded=true;
  game.careerStartApplied=true;
}

/** Qualification does not change registration or wages until the manager calls up. */
export function markGraduation(game,trainer) {
  if(!trainer.isYouth||!proEligible(trainer)||trainer.graduation)return;
  trainer.graduation={qualifiedDay:game.day,decision:'pending'};
  game.league.newsFeed.unshift({day:game.day,kind:'graduation',trainerId:trainer.id,text:`${trainer.name}, 한 지방 배지 8개 달성. 콜업·판매·보류를 결정해주세요.`});
}
function owned(game,id){return game.league.agencies.find(a=>a.id===game.playerAgencyId)?.roster.find(t=>t.id===id);}
export function callUp(game,id){
  const t=owned(game,id);
  if(!t||!t.isYouth||!proEligible(t))return {ok:false,msg:'한 지방 배지 8개를 갖춘 소속 유스만 콜업할 수 있습니다.'};
  t.contract??={};
  if(!t.promotionApplied){
    const wage=t.contract.wage??t.salary??0;
    t.contract.wage=Math.round(wage*(1+Number(t.contract.proRaise||0)/100));
    t.salary=t.contract.wage;t.promotionApplied=true;
  }
  t.isYouth=false;
  t.graduation={...t.graduation,decision:'promoted',decidedDay:game.day};
  game.league.newsFeed.unshift({day:game.day,kind:'career',trainerId:id,text:`${t.name} 프로 콜업 · 주급 ${t.contract.wage} · 유스 슬롯 1개 개방`});
  return {ok:true,msg:'프로로 등록했습니다. 유스 슬롯이 비었습니다.'};
}
export function holdYouth(game,id){
  const t=owned(game,id);
  if(!t||!t.isYouth||!proEligible(t))return {ok:false,msg:'콜업 대상 유스가 아닙니다.'};
  t.graduation={...t.graduation,decision:'held',decidedDay:game.day};
  return {ok:true,msg:'유스 등록을 유지합니다. 트레이너 화면에서 다시 결정할 수 있습니다.'};
}

/** Concrete NPC bids, recalculated without consuming RNG; no guaranteed buyer. */
export function transferOffers(game,id){
  const t=owned(game,id);
  if(!t||!t.isYouth||!proEligible(t)||t.camp||game.pendingStarter?.trainerId===id)return [];
  const skill=Object.values(t.stats).reduce((n,v)=>n+v,0)/Object.keys(t.stats).length;
  const fee=Math.round((t.contract?.wage??t.salary??0)*CAREER.transfer.wageWeeks+skill*CAREER.transfer.skillFactor);
  return game.league.agencies.filter(a=>a.id!==game.playerAgencyId).flatMap(a=>{
    const wage=a.roster.reduce((n,t)=>n+(t.contract?.wage??t.salary??0),0);
    const room=youthCount(a)<youthCapacity(a)&&a.roster.length<CAREER.transfer.rosterLimit;
    const incomingWage=t.contract?.wage??t.salary??0;
    return room && a.funds-fee>=(wage+incomingWage)*CAREER.transfer.reserveWeeks ? [{agencyId:a.id,name:a.name,fee}] : [];
  });
}
export function sellYouth(game,id,buyerId,quotedFee){
  const seller=game.league.agencies.find(a=>a.id===game.playerAgencyId);
  const t=owned(game,id),offer=transferOffers(game,id).find(o=>o.agencyId===buyerId);
  if(!t||!offer||offer.fee!==quotedFee)return {ok:false,msg:'제안 조건이 달라졌거나 구매 여력이 없습니다. 다시 확인해주세요.'};
  const buyer=game.league.agencies.find(a=>a.id===buyerId);
  seller.funds+=offer.fee;buyer.funds-=offer.fee;
  seller.roster.splice(seller.roster.indexOf(t),1);buyer.roster.push(t);t.agencyId=buyer.id;
  delete game.actions[id];
  t.graduation={...t.graduation,decision:'transferred',decidedDay:game.day};
  const entry={day:game.day,trainerId:id,trainerName:t.name,from:seller.id,to:buyer.id,fee:offer.fee,party:t.party.map(m=>m.species)};
  (game.transfers??=[]).push(entry);
  game.league.newsFeed.unshift({day:game.day,kind:'career',text:`${t.name}, ${buyer.name}로 이적 · 이적료 ${offer.fee} · 동행 파티와 가방 포함`});
  return {ok:true,msg:`${buyer.name}로 이적했습니다. 이적료 ${offer.fee}를 받았습니다.`};
}
