/** All candidates use one weighted utility model; preferences are data, not hard vetoes. */
export const OFFER_FIELDS = [
  {key:'wage',label:'주급',unit:'/주',min:1,max:60,step:1,hint:'매주 지급하는 고정 보장 급여.'},
  {key:'signing',label:'영입 개런티',unit:'',min:0,max:20000,step:50,hint:'계약 체결 시 한 번 지급. 주급과 별도로 평가합니다.'},
  {key:'proRaise',label:'프로 승급 시 급여 인상률',unit:'%',min:0,max:250,step:10,hint:'150% 인상은 기존 주급의 2.5배입니다.'},
  {key:'badgeBonus',label:'뱃지 달성 보너스',unit:'/개',min:0,max:400,step:20,hint:'새 배지를 획득할 때마다 지급.'},
  {key:'years',label:'계약 기간',unit:'년',min:1,max:6,step:1,hint:'후보가 원하는 계약 기간에 가까울수록 만족합니다.'},
];
export const DEFAULT_OFFER={wage:8,signing:0,proRaise:0,badgeBonus:0,years:3};
export const CONTRACT_MODEL={acceptAt:.92,weightPower:2,maxSurplus:4};
const FIELD_KO={reputation:'소속사 평판',...Object.fromEntries(OFFER_FIELDS.map(f=>[f.key,f.label]))};
export const validOffer=o=>!!o&&OFFER_FIELDS.every(f=>Number.isInteger(o[f.key])&&o[f.key]>=f.min&&o[f.key]<=f.max);
function satisfaction(pref,value,key){
  if(pref.kind==='near')return Math.max(0,1-Math.abs(value-pref.want)/Math.max(1,pref.want))**2;
  if(pref.want<=0)return 1;
  const ratio=Math.max(0,value/pref.want);
  // Missing a preferred term hurts sharply. Generous terms compensate with diminishing returns.
  return ratio<1?ratio**2:key==='reputation'?1:Math.min(CONTRACT_MODEL.maxSurplus,1+Math.log2(ratio));
}
export function evaluateOffer(candidate,offer,agency){
  if(!validOffer(offer))return {accept:false,score:0,afford:false,weak:[],reasons:['계약 조건을 허용 범위의 정수로 입력해주세요.']};
  const values={...offer,reputation:agency?.reputation??0};
  const breakdown=Object.entries(candidate.pref).filter(([,p])=>p.weight>0).map(([key,p])=>{
    const sat=satisfaction(p,values[key]??0,key),weight=p.weight**CONTRACT_MODEL.weightPower;
    return {key,label:FIELD_KO[key]||key,sat,weight,want:p.want,kind:p.kind,contribution:sat*weight,shortfall:Math.max(0,1-sat)*weight};
  });
  const total=breakdown.reduce((n,p)=>n+p.weight,0),score=total?breakdown.reduce((n,p)=>n+p.contribution,0)/total:1;
  const weak=breakdown.filter(p=>p.sat<.9).sort((a,b)=>b.shortfall-a.shortfall);
  const strong=breakdown.filter(p=>p.sat>1).sort((a,b)=>(b.sat-1)*b.weight-(a.sat-1)*a.weight);
  const afford=(agency?.funds??0)>=offer.signing,accept=afford&&score>=CONTRACT_MODEL.acceptAt;
  let reasons;
  if(!afford) reasons=['영입 개런티를 지급할 소속사 자금이 부족합니다.'];
  else if(accept) reasons=[weak.length&&strong.length?`${weak[0].label}은 아쉽지만, ${strong[0].label} 조건이 충분히 보상해 줍니다. 이 조건으로 계약하겠습니다.`:'제 선호에 맞는 조건입니다. 계약하겠습니다.'];
  else reasons=[...weak.slice(0,2).map(p=>p.key==='reputation'?'소속사 평판이 기대보다 낮습니다. 다른 조건에서 더 보상받고 싶습니다.':p.kind==='near'?`계약 기간은 ${p.want}년을 선호합니다.`:`${p.label}을 특히 중요하게 봅니다. 현재 조건은 부족합니다.`),'조건을 조정해 다시 이야기해 주세요.'];
  return {accept,score,afford,weak,breakdown,reasons};
}
/** The candidate opens with their preferred terms, adjusted for this agency's reputation. */
export function candidateProposal(candidate,agency){
  const offer=Object.fromEntries(OFFER_FIELDS.map(f=>[f.key,Math.max(f.min,Math.min(f.max,Math.round(candidate.pref[f.key]?.want??DEFAULT_OFFER[f.key])))]));
  // Reputation is not editable. Ask for more compensation where this candidate values it most.
  const money=OFFER_FIELDS.filter(f=>f.key!=='years'&&candidate.pref[f.key]?.weight>0).sort((a,b)=>candidate.pref[b.key].weight-candidate.pref[a.key].weight||(['signing','wage','proRaise','badgeBonus'].indexOf(a.key)-['signing','wage','proRaise','badgeBonus'].indexOf(b.key)));
  for(let i=0;i<1000&&!evaluateOffer(candidate,offer,{...agency,funds:Infinity}).accept;i++){
    const f=money.find(f=>offer[f.key]<f.max);if(!f)break;
    offer[f.key]=Math.min(f.max,offer[f.key]+f.step);
  }
  return offer;
}
export function contractFrom(offer,day=1){
  if(!validOffer(offer))throw new Error('계약 조건이 올바르지 않습니다.');
  return {kind:'youth',...Object.fromEntries(OFFER_FIELDS.map(f=>[f.key,offer[f.key]])),signedOnDay:day,buyout:null};
}
