import { ensurePersonnel, offseason, contractProposal, negotiatePersonnel, transferQuote, releaseQuote, releaseContract, hireCoach, assignCamp } from '../engine/personnel.js';
import { PERSONNEL as P, COACH_CANDIDATES } from '../data/personnel.js';
import { OFFER_FIELDS } from '../engine/contract.js';
import { STAT_KO } from '../data/styles.js';
import { escapeHtml as esc } from './management-widgets.js';
import { ko, SPECIES_KO } from '../data/ko.js';

export function renderPersonnel(game){
  const state=ensurePersonnel(game),a=game.league.agencies.find(a=>a.id===game.playerAgencyId);
  const availableCoaches=a.coaches.filter(c=>c.endsOn>game.day+P.campDays-1&&!a.roster.some(t=>t.camp&&t.coachAssigned===c.id));
  const candidates=[...state.freeAgents,...game.league.agencies.filter(x=>x.id!==a.id).flatMap(x=>x.roster)].filter(t=>transferQuote(game,t.id));
  return `<div class="page-h"><h2>계약 · 스태프</h2><span>${offseason(game)?'비시즌':'시즌 진행 중'}</span></div>
  <p>이적·해지·코치 계약·캠프는 비시즌에 진행합니다. 자유계약 영입은 연중 가능하며, 재계약은 비시즌 또는 만료90일 전부터 가능합니다. 파티·가방은 트레이너와 함께 이동하고 소속사 박스는 남습니다.</p><p role="status" id="personnel-message"></p>
  <section class="card"><h3>소속 계약</h3>${a.roster.map(t=>`<article class="card"><h4>${esc(t.name)} · ${t.isYouth?'유스':'프로'}</h4><p>주급 ${t.contract.wage??t.salary} · 만료 ${t.contract.endsOn}일차 (${Math.max(0,t.contract.endsOn-game.day)}일 남음)${t.camp?` · 캠프 ${t.camp.remaining}일 남음`:''}</p><button data-negotiate="${t.id}" data-renew="true" ${t.lastPersonnelAgreementDay===game.day||t.camp||(!offseason(game)&&t.contract.endsOn-game.day>P.renewLead)?'disabled':''}>${t.lastPersonnelAgreementDay===game.day?'오늘 계약 완료':'재계약 협상'}</button><details><summary>계약 해지 조건</summary><p>정산금 ${releaseQuote(game,t.id)}. 현재 파티와 가방을 보유한 자유계약 선수로 전환합니다.</p><button data-release="${t.id}" data-fee="${releaseQuote(game,t.id)}" ${offseason(game)&&!t.camp?'':'disabled'}>정산금 지급 · 계약 해지 확정</button></details></article>`).join('')||'<p>소속 트레이너가 없습니다. 아래 자유계약 선수를 확인하세요.</p>'}</section>
  <section class="card"><h3>이적 · 자유계약</h3><label>이름 검색<input id="personnel-search" type="search"></label>${candidates.map(t=>{const q=transferQuote(game,t.id);return `<article class="card personnel-candidate" data-name="${esc(t.name)}"><h4>${esc(t.name)} · ${q.from?esc(game.league.agencies.find(a=>a.id===q.from).name):'자유계약'}</h4><p>이적료 ${q.fee} · ${t.party.map(m=>`${ko(SPECIES_KO,m.species)} Lv.${m.level}`).join(' / ')}</p><button data-negotiate="${t.id}" data-renew="false" ${q.from&&!offseason(game)?'disabled':''}>선수의 계약 제안 듣기</button></article>`;}).join('')}</section>
  <section class="card"><h3>코치 계약 · ${a.coaches.length}/${P.coachCapacity}</h3>${a.coaches.map(c=>`<p>${c.name} · 주급 ${c.wage} · 만료 ${c.endsOn}일차</p>`).join('')}${COACH_CANDIDATES.map(c=>`<p>${c.name} · 주급${c.wage} · 개런티${c.signing} · 1년 <button data-coach="${c.id}" ${!offseason(game)||a.coaches.some(x=>x.id===c.id)||a.funds<c.signing?'disabled':''}>코치 계약</button></p>`).join('')}
  <h3>비시즌 캠프</h3><p>트레이너 능력 훈련 · ${P.campDays}일간 다른 활동 대신 참가 · 참가비${P.campFee}. 코치는 동시에 한 명의 캠프를 지도합니다. 파티 경험치·IV 훈련과는 별도입니다.</p><label>트레이너<select id="camp-trainer">${a.roster.filter(t=>!t.camp).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><label>훈련 능력<select id="camp-stat">${Object.entries(STAT_KO).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>코치<select id="camp-coach">${availableCoaches.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></label>${availableCoaches.length?'':'<p>지도 가능한 코치가 없습니다. 캠프 종료 또는 코치 계약을 확인하세요.</p>'}<button id="camp-start" ${offseason(game)&&availableCoaches.length&&a.roster.some(t=>!t.camp)?'':'disabled'}>참가비 지급 · 캠프 배정</button></section>
  <section class="card"><h3>계약 기록</h3>${state.history.slice(0,30).map(h=>`<p>${h.day}일차 · ${esc(h.text)}</p>`).join('')||'<p>기록이 없습니다.</p>'}</section>`;
}
function negotiate(game,id,renew,refresh){
  const a=game.league.agencies.find(a=>a.id===game.playerAgencyId),q=renew?null:transferQuote(game,id),t=renew?a.roster.find(t=>t.id===id):q?.trainer;if(!t)return;
  const offer=contractProposal(game,t),dialog=document.createElement('dialog');dialog.className='card';dialog.style.cssText='width:min(560px,92vw);max-height:85vh;overflow:auto;background:#202738;color:#eee';
  dialog.innerHTML=`<h2>${esc(t.name)} · 계약 협상</h2><div role="log"><p><b>${esc(t.name)}</b>: 주급${offer.wage}, 개런티${offer.signing}, ${offer.years}년을 원합니다.</p></div>${OFFER_FIELDS.map(f=>`<label style="display:block;margin:12px 0">${f.label}<input style="display:block;width:100%" aria-label="${f.label}" data-offer="${f.key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${offer[f.key]}"></label>`).join('')}<p>${renew?'기존 기간은 새 계약으로 대체됩니다.':'현재 파티·가방과 함께 영입합니다.'} 이적료${q?.fee||0} + 개런티는 성사 시 한 번 지급됩니다.</p><button id="personnel-propose">이 조건으로 제안</button> <button id="personnel-close">협상 닫기</button>`;
  document.body.append(dialog);dialog.showModal();
  dialog.querySelector('#personnel-close').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  dialog.querySelector('#personnel-propose').onclick=()=>{
    for(const input of dialog.querySelectorAll('[data-offer]'))offer[input.dataset.offer]=Number(input.value);
    const proposal=document.createElement('p');proposal.textContent=`대표: 주급 ${offer.wage}, 개런티 ${offer.signing}, ${offer.years}년을 제안합니다.`;dialog.querySelector('[role=log]').append(proposal);
    const r=negotiatePersonnel(game,id,offer,{renew,quotedFee:q?.fee||0});
    const line=document.createElement('p');line.textContent=`${t.name}: ${r.ok?'계약하겠습니다.':r.msg}`;dialog.querySelector('[role=log]').append(line);
    if(r.ok){const summary=document.createElement('p');summary.textContent=r.msg;dialog.querySelector('[role=log]').append(summary);dialog.querySelector('#personnel-propose').disabled=true;dialog.querySelectorAll('input').forEach(i=>i.disabled=true);refresh();}
  };
}
export function wirePersonnel(root,game,refresh){
  const show=r=>{refresh();const el=root.querySelector('#personnel-message');if(el)el.textContent=r.msg;};
  root.querySelectorAll('[data-negotiate]').forEach(b=>b.onclick=()=>negotiate(game,b.dataset.negotiate,b.dataset.renew==='true',refresh));
  root.querySelectorAll('[data-release]').forEach(b=>b.onclick=()=>show(releaseContract(game,b.dataset.release,Number(b.dataset.fee))));
  root.querySelectorAll('[data-coach]').forEach(b=>b.onclick=()=>show(hireCoach(game,b.dataset.coach)));
  const search=root.querySelector('#personnel-search');if(search)search.oninput=()=>root.querySelectorAll('.personnel-candidate').forEach(el=>el.hidden=!el.dataset.name.includes(search.value.trim()));
  const camp=root.querySelector('#camp-start');if(camp)camp.onclick=()=>show(assignCamp(game,root.querySelector('#camp-trainer').value,root.querySelector('#camp-stat').value,root.querySelector('#camp-coach').value));
}
