import { youthCount, youthCapacity, proEligible, careerLabel, transferOffers, callUp, holdYouth, sellYouth } from '../engine/career.js';
import { escapeHtml as esc } from './management-widgets.js';
import { ko, SPECIES_KO } from '../data/ko.js';
export function renderCareer(game,t){
 const agency=game.league.agencies.find(a=>a.id===game.playerAgencyId);
 const ready=t.isYouth&&proEligible(t),wage=t.contract?.wage??t.salary??0;
 return `<section class="card career-panel"><h3>선수 등록 · ${careerLabel(t)}</h3><p>소속사 유스 ${youthCount(agency)} / ${youthCapacity(agency)}명</p>
 ${ready?`<p>한 지방 배지 8개를 모았습니다. 프로 자격은 확보했지만 콜업 전까지 유스 정원을 사용하며 프로 전용 대회에는 나갈 수 없습니다.</p>
 <button data-callup="${t.id}">프로 콜업 · 주급 ${t.promotionApplied?wage:Math.round(wage*(1+(t.contract?.proRaise||0)/100))}</button>
 <button class="ghost" data-hold-youth="${t.id}" ${t.graduation?.decision==='held'?'disabled':''}>${t.graduation?.decision==='held'?'보류 중 · 유스 자리 유지':'결정 보류'}</button>
 <details><summary>판매 제안 확인</summary><p>이적 시 트레이너의 현재 파티 ${t.party.map(m=>esc(ko(SPECIES_KO,m.species))).join(', ')}와 가방도 함께 이동합니다. 소속사 박스는 남습니다. 제안은 현재 구매 여력을 기준으로 합니다.</p>
 ${transferOffers(game,t.id).map(o=>`<div class="assignment"><div><b>${esc(o.name)}</b><p>이적료 ${o.fee.toLocaleString()} · 기존 계약 유지</p></div><button data-sell-youth="${t.id}" data-buyer="${o.agencyId}" data-fee="${o.fee}">파티 포함 이적 확정</button></div>`).join('')||'<p>현재 구매 여력이 있는 소속사의 제안이 없습니다.</p>'}</details>`:
 t.isYouth?'<p>한 지방의 배지 8개를 모으면 콜업·판매·보류를 결정할 수 있습니다.</p>':`<p>프로 등록 상태입니다. 유스 정원을 사용하지 않습니다.${t.legacyPro?' 기존 저장의 프로 등록을 유지했습니다.':''}</p>`}
 <p id="career-notice" role="status"></p></section>`;
}
export function wireCareer(root,game,refresh){
 const done=result=>{if(result.ok)refresh();else{const n=root.querySelector('#career-notice');if(n)n.textContent=result.msg;}};
 root.querySelectorAll('[data-callup]').forEach(b=>b.onclick=()=>done(callUp(game,b.dataset.callup)));
 root.querySelectorAll('[data-hold-youth]').forEach(b=>b.onclick=()=>done(holdYouth(game,b.dataset.holdYouth)));
 root.querySelectorAll('[data-sell-youth]').forEach(b=>b.onclick=()=>done(sellYouth(game,b.dataset.sellYouth,b.dataset.buyer,Number(b.dataset.fee))));
}
