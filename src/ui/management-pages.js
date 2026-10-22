import { pwtBreak } from '../data/international.js';
import { agencyOf, bagOf, fatigueOf, MANAGEMENT, IV_KEYS, IV_LABELS, buySupplies, trainingQuote, startTraining } from '../engine/pokemon-management.js';
import { badgeProgress } from '../engine/gym-progress.js';
import { GYMS } from '../data/gyms.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { monImage, escapeHtml as esc } from './management-widgets.js';
import { TYPE_KO } from './pokemon-panel.js';
import { BATTLE_POLICIES, policyId } from '../data/battle-policy.js';
import { renderBattleAnalysis } from './battle-analysis.js';
import { gameDate } from './management-widgets.js';
import { fixturesOf, gymStatus, bookingDays, bookGym, cancelFixture, GYM_BOOKING } from '../engine/gym-fixtures.js';
import { gymById } from '../data/gyms.js';

/* 체육관 화면 상태 — 지방 탭, 신청 중인 체육관/날짜 */
const gymUi = { region: 'kanto', gymId: null, day: null };
const ASSET = (import.meta.env?.BASE_URL ?? '/') + 'assets/';
const badgeImg = (g, earned = true) => `<img class="badge-img ${earned ? '' : 'missing'}" src="${ASSET}badges/${g.region === 'kanto' ? g.order : 8 + g.order}.png" alt="${g.badge}${earned ? '' : ' (미획득)'}" title="${g.badge}" width="32" height="32">`;
const K=s=>ko(SPECIES_KO,s);
export function fatigueIcon(t){const f=fatigueOf(t);return `<span class="fatigue ${f.color}" role="img" aria-label="${f.label}" title="${f.label} · 지면 떨어지고 이기면 돌아온다">${f.face}</span>`;}

export function renderSupport(game){
  return `<div class="page-h"><h2>트레이너 지원</h2><span class="muted">구입한 물품은 선택한 트레이너의 가방에 지급됩니다</span></div><p class="muted">몬스터볼은 포획 시도에 1개, 상처약은 탐험 중 HP가 부족할 때 1개씩 사용합니다. 상처약은 HP 20 회복이며 기절·상태이상·PP는 센터에서 치료합니다.</p><div id="management-notice" role="status"></div>
  ${agencyOf(game).roster.map(t=>`<section class="card support-card"><h3>${fatigueIcon(t)} ${esc(t.name)}의 가방</h3><div class="support-items">${Object.entries(MANAGEMENT.supplies).map(([key,def])=>`<div class="support-item"><img class="supply-icon pixel-item" src="${(import.meta.env?.BASE_URL??'/')}assets/items/${key==='pokeBall'?'poke-ball':'potion'}.png" alt="" aria-hidden="true" width="36" height="36"><h3>${def.name}</h3><p>보유 <b>${bagOf(t)[key]||0}</b>개 · 개당 ${def.price}</p><label>지급 수량<input class="supply-qty" type="number" min="1" max="999" value="1" data-owner="${t.id}" data-item="${key}" aria-label="${esc(t.name)} ${def.name} 지급 수량"></label><button data-buy="${key}" data-owner="${t.id}" ${agencyOf(game).funds<def.price?'disabled':''}>${def.price} 지불 · 1개 지급</button></div>`).join('')}</div></section>`).join('')}`;
}

export function renderTraining(game){
  const box=agencyOf(game).box;
  return `<div class="page-h"><h2>포켓몬 트레이닝 센터</h2><span class="muted">박스에 있는 포켓몬의 개체값을 장기 훈련합니다</span></div><p class="muted">개체값 1포인트에 2일, 목표 값이 26 이상인 포인트는 3일이 걸립니다. 능력치를 하나씩 순서대로 훈련합니다. 훈련 중에는 파티에 합류할 수 없습니다.</p><div id="management-notice" role="status"></div>
  <div class="training-grid">${box.map((m,i)=>`<section class="card training-card"><header>${monImage(m.species)}<div><h3>${esc(K(m.species))}</h3><small>Lv.${m.level}</small></div></header>${m.training?`<p>진행 ${m.training.elapsed} / ${m.training.totalDays}일</p><progress value="${m.training.elapsed}" max="${m.training.totalDays}"></progress><p>남은 기간 ${m.training.totalDays-m.training.elapsed}일</p><div class="iv-values">${IV_KEYS.map(k=>`<span>${IV_LABELS[k]} <b>${m.ivs[k]} → ${m.training.targets[k]}</b></span>`).join('')}</div><button class="ghost" data-cancel-training="${i}">훈련 취소 · 달성한 값 유지</button>`:
  `<form class="training-form" data-box="${i}"><div class="iv-targets">${IV_KEYS.map(k=>`<label>${IV_LABELS[k]} <small>현재 ${m.ivs[k]}</small><input type="number" name="${k}" value="${m.ivs[k]}" min="${m.ivs[k]}" max="31" step="1" aria-label="${K(m.species)} ${IV_LABELS[k]} 목표"></label>`).join('')}</div><p class="training-quote">목표 개체값을 정해주세요.</p><button type="submit" disabled>훈련 배정</button></form>`}</section>`).join('')||'<section class="card"><p>박스에 포켓몬이 없습니다. 트레이너의 파티에서 박스로 보내거나 포획해 주세요.</p><button data-nav="box">박스 열기</button></section>'}</div>`;
}

export function renderGyms(game,selectedId=null){
  const roster=agencyOf(game).roster;
  const selected=roster.find(t=>t.id===selectedId)||roster[0];
  const blocked=!selected?.party.length||!!game.pendingStarter;
  const booked=fixturesOf(game).filter(f=>f.status==='booked').sort((a,b)=>a.day-b.day);
  const earned=new Set(selected?.badges||[]);
  const target=gymUi.gymId&&gymById(gymUi.gymId);
  const targetStatus=target&&selected?gymStatus(game,selected,target.id):null;
  if(target&&!targetStatus?.ok){gymUi.gymId=null;}
  const days=gymUi.gymId&&selected?bookingDays(game,selected,gymUi.gymId):[];
  if(days.length&&!days.some(d=>d.ok&&d.day===gymUi.day))gymUi.day=days.find(d=>d.ok)?.day??null;
  return `<div class="page-h"><div><div class="eyebrow">GYM CIRCUIT</div><h2>체육관 순회</h2></div><span class="muted">날짜를 잡아 신청하면 체육관이 접수해. 그날은 탐험 대신 관장전을 치러.</span></div>
  ${pwtBreak(game)?'<p class="risk-note">PWT 기간이라 공식 체육관 도전이 휴회 중이야.</p>':''}
  <div class="gym-trainers" role="tablist" aria-label="도전 트레이너">${roster.map(t=>{const b=badgeProgress(t);return `<button class="gym-trainer-chip ${t.id===selected?.id?'on':''}" data-gym-trainer="${t.id}" role="tab" aria-pressed="${t.id===selected?.id}">${fatigueIcon(t)}<b>${esc(t.name)}</b><small>관동 ${b.kanto}/8 · 성도 ${b.johto}/8</small></button>`;}).join('')}</div>
  <div class="gym-top">
    <section class="card badge-case"><div class="section-heading"><h3>${esc(selected?.name||'')}의 배지 케이스</h3></div>${['kanto','johto'].map(r=>`<div class="badge-row"><span>${r==='kanto'?'관동':'성도'}</span>${GYMS.filter(g=>g.region===r).map(g=>badgeImg(g,earned.has(g.id))).join('')}</div>`).join('')}</section>
    <section class="card fixtures"><div class="section-heading"><h3>잡혀 있는 관장전</h3><span class="muted">${booked.length}경기</span></div>${booked.map(f=>{const g=gymById(f.gymId),t=roster.find(x=>x.id===f.trainerId);return `<div class="fixture-row">${badgeImg(g)}<div><b>${esc(t?.name||'')} vs ${g.name}</b><small>${gameDate(f.day)} · ${f.day}일차</small></div><span class="dd">${f.day===game.day?'오늘':`D-${f.day-game.day}`}</span><button class="ghost" data-fixture-cancel="${f.id}">취소</button></div>`;}).join('')||'<p class="muted">아직 잡힌 경기가 없어. 아래에서 체육관을 골라 날짜를 신청해.</p>'}</section>
  </div>
  <div id="management-notice" role="status"></div>
  <div class="gym-layout"><section>
    <nav class="gym-region-tabs">${['kanto','johto'].map(r=>`<button class="${gymUi.region===r?'selected':'ghost'}" data-gym-region="${r}">${r==='kanto'?'관동 · FRLG':'성도 · HGSS'}</button>`).join('')}</nav>
    <div class="gym-list">${GYMS.filter(g=>g.region===gymUi.region).map(g=>{const st=selected?gymStatus(game,selected,g.id):{ok:false,code:'none',text:''};const top=Math.max(...g.party.map(p=>p.level));return `<article class="gym-row ${st.code} ${gymUi.gymId===g.id?'picked':''}">${badgeImg(g)}<div class="gym-info"><b>${g.order}. ${g.name} <small>${TYPE_KO[g.type]}</small></b><small>${g.badge} · 관장 최고 Lv.${top}</small></div><div class="gym-party-mini">${g.party.map(p=>`<span>${monImage(p.species)}<small>${p.level}</small></span>`).join('')}</div><span class="gym-state ${st.code}">${st.code==='badge'?'✓ ':''}${st.text}</span><button data-gym-book="${g.id}" ${blocked||!st.ok||pwtBreak(game)?'disabled':''}>${st.code==='badge'?'획득 완료':st.code==='booked'?'접수됨':'일정 잡기'}</button></article>`;}).join('')}</div>
  </section>
  <aside class="card booking">${gymUi.gymId&&selected?(()=>{const g=gymById(gymUi.gymId);return `<div class="eyebrow">CHALLENGE REQUEST</div><h3>${g.name} 체육관에 도전 신청</h3><p class="muted">${esc(selected.name)} · 파티 ${selected.party.map(m=>`${K(m.species)} Lv.${m.level}`).join(', ')}</p>
    <div class="booking-party">${g.party.map(p=>`<div>${monImage(p.species)}<b>${K(p.species)}</b><small>Lv.${p.level}</small></div>`).join('')}</div>
    <h4>경기 날짜</h4><div class="day-chips">${days.map(d=>`<button class="day-chip ${d.day===gymUi.day?'on':''}" data-gym-day="${d.day}" ${d.ok?'':'disabled'} title="${d.reason||gameDate(d.day)}"><small>D-${d.day-game.day}</small><b>${gameDate(d.day).replace(/\s*\(.*\)/,'')}</b>${d.reason?`<i>${d.reason}</i>`:''}</button>`).join('')}</div>
    <label>사전 운영 방침 · 관장전<select id="battle-policy">${Object.entries(BATTLE_POLICIES).map(([id,p])=>`<option value="${id}" ${policyId(selected.battlePolicy)===id?'selected':''}>${p.name}</option>`).join('')}</select></label><p class="muted">${BATTLE_POLICIES[policyId(selected.battlePolicy)].hint}</p>
    <div class="booking-actions"><button class="ghost" data-gym-close>닫기</button><button data-gym-confirm ${gymUi.day?'':'disabled'}>${gymUi.day?`${gameDate(gymUi.day)} 도전 접수`:'가능한 날짜 없음'}</button></div>
    <small class="muted">${GYM_BOOKING.minLead}~${GYM_BOOKING.maxLead}일 뒤까지 신청 · 지면 ${GYM_BOOKING.rematchWait}일 뒤부터 재도전 · 경기 당일 센터에서 회복 후 출전</small>`;})():`<div class="eyebrow">HOW IT WORKS</div><h3>관장전 잡는 법</h3><ol class="howto"><li>위에서 트레이너를 골라.</li><li>체육관 옆 <b>일정 잡기</b>를 눌러 날짜를 정해.</li><li>체육관이 접수하면 그날 탐험 대신 관장전을 치르고, 끝나면 관전이 열려.</li></ol><p class="muted">배지를 이미 가진 체육관은 다시 신청할 수 없어. 한 지방 배지 8개를 모으면 프로 콜업을 결정할 수 있어.</p>`}</aside></div>
  <section class="card gym-history-card"><div class="section-heading"><h3>지난 관장전</h3></div>${(game.gymHistory||[]).slice(0,12).map(m=>`<div class="history-row"><span class="result ${m.won?'w':'l'}">${m.won?'승':'패'}</span><div><b>${esc(m.trainerName)} vs ${m.gymName}</b><small>${m.day}일차${m.firstWin?` · ${m.badge} 획득`:''}</small></div><button class="ghost" data-watch-gym="${m.id}">다시 보기</button></div>`).join('')||'<p class="muted">첫 도전을 기다리고 있어.</p>'}</section>`;
}

export function wireManagementPages(root,game,refresh,watch,selectTrainer=()=>{}){
  const chosen=()=>root.querySelector('[data-gym-trainer][aria-pressed="true"]')?.dataset.gymTrainer;
  const policy=root.querySelector('#battle-policy');
  if(policy) policy.onchange=()=>{const t=agencyOf(game).roster.find(t=>t.id===chosen());if(t){t.battlePolicy=policyId(policy.value);refresh();}};
  root.querySelectorAll('[data-gym-trainer]').forEach(b=>b.onclick=()=>{gymUi.gymId=null;selectTrainer(b.dataset.gymTrainer);});
  root.querySelectorAll('[data-gym-region]').forEach(b=>b.onclick=()=>{gymUi.region=b.dataset.gymRegion;refresh();});
  root.querySelectorAll('[data-gym-book]').forEach(b=>b.onclick=()=>{gymUi.gymId=b.dataset.gymBook;gymUi.day=null;refresh();});
  root.querySelectorAll('[data-gym-day]').forEach(b=>b.onclick=()=>{gymUi.day=Number(b.dataset.gymDay);refresh();});
  const closeBooking=root.querySelector('[data-gym-close]');if(closeBooking)closeBooking.onclick=()=>{gymUi.gymId=null;refresh();};
  const confirmBooking=root.querySelector('[data-gym-confirm]');
  if(confirmBooking)confirmBooking.onclick=()=>{const r=bookGym(game,chosen(),gymUi.gymId,gymUi.day);if(r.ok){gymUi.gymId=null;refresh();}const n=root.isConnected?root.querySelector('#management-notice'):null;if(n)n.textContent=r.msg;else if(document.querySelector('#management-notice'))document.querySelector('#management-notice').textContent=r.msg;};
  root.querySelectorAll('[data-fixture-cancel]').forEach(b=>b.onclick=()=>{const r=cancelFixture(game,b.dataset.fixtureCancel);refresh();const n=document.querySelector('#management-notice');if(n)n.textContent=r.msg;});
  const notice=msg=>{const node=root.querySelector('#management-notice');if(node)node.textContent=msg;};
  root.querySelectorAll('.supply-qty').forEach(input=>input.oninput=()=>{
    const button=input.closest('.support-item').querySelector('button');const n=Number(input.value),def=MANAGEMENT.supplies[input.dataset.item];
    button.textContent=`${(n*def.price).toLocaleString()} 지불 · ${n}개 지급`;
    button.disabled=!Number.isInteger(n)||n<1||n>999||n*def.price>agencyOf(game).funds;
  });
  root.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{const qty=Number(b.closest('.support-item').querySelector('input').value);const r=buySupplies(game,b.dataset.owner,b.dataset.buy,qty);if(r.ok)refresh();notice(r.msg);});
  root.querySelectorAll('.training-form').forEach(form=>{
    const mon=agencyOf(game).box[Number(form.dataset.box)];
    const targets=()=>Object.fromEntries(IV_KEYS.map(k=>[k,Number(form.elements[k].value)]));
    form.oninput=()=>{const q=trainingQuote(mon,targets());form.querySelector('.training-quote').textContent=q.ok?`${q.points}포인트 향상 · 총 ${q.days}일`:q.msg;form.querySelector('button').disabled=!q.ok;};
    form.onsubmit=e=>{e.preventDefault();const r=startTraining(game,mon,targets());if(r.ok)refresh();notice(r.msg);};
  });
  root.querySelectorAll('[data-cancel-training]').forEach(b=>b.onclick=()=>{delete agencyOf(game).box[Number(b.dataset.cancelTraining)].training;refresh();});
  root.querySelectorAll('[data-watch-gym]').forEach(b=>b.onclick=()=>watch(b.dataset.watchGym));
}
