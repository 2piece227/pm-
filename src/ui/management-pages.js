import { agencyOf, bagOf, fatigueOf, MANAGEMENT, IV_KEYS, IV_LABELS, buySupplies, trainingQuote, startTraining } from '../engine/pokemon-management.js';
import { badgeProgress } from '../engine/gym-progress.js';
import { GYMS } from '../data/gyms.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { monImage, escapeHtml as esc } from './management-widgets.js';
import { TYPE_KO } from './pokemon-panel.js';
import { BATTLE_POLICIES, policyId } from '../data/battle-policy.js';
import { renderBattleAnalysis } from './battle-analysis.js';
const K=s=>ko(SPECIES_KO,s);
export function fatigueIcon(t){const f=fatigueOf(t);return `<span class="fatigue ${f.color}" role="img" aria-label="${f.label}" title="${f.label} · 휴식일에 회복">${f.face}</span>`;}

export function renderSupport(game){
  return `<div class="page-h"><h2>트레이너 지원</h2><span class="muted">구입한 물품은 선택한 트레이너의 가방에 지급됩니다</span></div><p class="muted">몬스터볼은 포획 시도에 1개, 상처약은 탐험 중 HP가 부족할 때 1개씩 사용합니다. 상처약은 HP 20 회복이며 기절·상태이상·PP는 센터에서 치료합니다.</p><div id="management-notice" role="status"></div>
  ${agencyOf(game).roster.map(t=>`<section class="card support-card"><h3>${fatigueIcon(t)} ${esc(t.name)}의 가방</h3><div class="support-items">${Object.entries(MANAGEMENT.supplies).map(([key,def])=>`<div class="support-item"><span class="supply-icon">${key==='pokeBall'?'◉':'✚'}</span><h3>${def.name}</h3><p>보유 <b>${bagOf(t)[key]||0}</b>개 · 개당 ${def.price}</p><label>지급 수량<input class="supply-qty" type="number" min="1" max="999" value="1" data-owner="${t.id}" data-item="${key}" aria-label="${esc(t.name)} ${def.name} 지급 수량"></label><button data-buy="${key}" data-owner="${t.id}" ${agencyOf(game).funds<def.price?'disabled':''}>${def.price} 지불 · 1개 지급</button></div>`).join('')}</div></section>`).join('')}`;
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
  const canChallenge=!!selected?.party.length&&!game.pendingStarter;
  return `<div class="page-h"><h2>체육관 순회</h2><span class="muted">관장 도전은 하루 일정 전체를 사용합니다</span></div><p class="muted">센터에서 준비한 뒤 도전하며, 하루 진행 후 관전이 자동으로 열립니다. 관동은 FRLG, 성도는 HGSS 첫 도전 파티입니다. 한 지방 배지 8개를 모으면 추가 계약이 열립니다.</p>
  <label class="gym-trainer">도전 트레이너<select id="gym-trainer">${roster.map(t=>`<option value="${t.id}" ${t.id===selected?.id?'selected':''}>${esc(t.name)} · 관동 ${badgeProgress(t).kanto}/8 · 성도 ${badgeProgress(t).johto}/8</option>`).join('')}</select></label><section class="card"><label>사전 운영 방침 · 관장전<select id="battle-policy" ${selected?'':'disabled'}>${Object.entries(BATTLE_POLICIES).map(([id,p])=>`<option value="${id}" ${policyId(selected?.battlePolicy)===id?'selected':''}>${p.name}</option>`).join('')}</select></label><p>${BATTLE_POLICIES[policyId(selected?.battlePolicy)].hint}</p><small class="muted">성향·순응도·판단력에 따라 반영됩니다. 배틀 중 명령이 아니며 탐험에는 아직 적용되지 않습니다.</small></section><div id="management-notice" role="status"></div>
  ${['kanto','johto'].map(region=>`<h3 class="gym-region">${region==='kanto'?'관동':'성도'}</h3><div class="gym-grid">${GYMS.filter(g=>g.region===region).map(g=>`<section class="card gym-card"><div class="gym-title"><span class="gym-badge">${g.order}</span><div><h3>${g.name} · ${TYPE_KO[g.type]}</h3><small>${g.source} · ${g.badge}</small></div></div><div class="gym-party">${g.party.map(p=>`<div>${monImage(p.species)}<b>${K(p.species)}</b><small>Lv.${p.level}</small></div>`).join('')}</div><p class="muted">획득: ${roster.filter(t=>(t.badges||[]).includes(g.id)).map(t=>esc(t.name)).join(', ')||'아직 없음'}</p><button data-gym="${g.id}" ${canChallenge?'':'disabled'}>${!canChallenge?'첫 파트너 선택 필요':game.actions[selected.id]===`gym:${g.id}`?'✓ 오늘 도전 배정됨':'관장전 일정 배정'}</button><details><summary>진심 파티 · 향후 PWT용</summary><small>${g.seriousSource}</small><p>${g.seriousParty.map(p=>`${K(p.species)} Lv.${p.level}`).join(' / ')}</p></details></section>`).join('')}</div>`).join('')}
  <h3>지난 관장전</h3>${(game.gymHistory||[]).slice(0,20).map(m=>`<button class="gym-history ghost" data-watch-gym="${m.id}">${m.day}일차 · ${esc(m.trainerName)} vs ${m.gymName} · ${m.won?'승리':'패배'} · 다시 보기</button>${renderBattleAnalysis(m.analysis)}`).join('')||'<p class="muted">첫 도전을 기다리고 있습니다.</p>'}`;
}

export function wireManagementPages(root,game,refresh,watch,selectTrainer=()=>{}){
  const policy=root.querySelector('#battle-policy');
  if(policy) policy.onchange=()=>{const t=agencyOf(game).roster.find(t=>t.id===root.querySelector('#gym-trainer')?.value);if(t){t.battlePolicy=policyId(policy.value);refresh();}};
  const gymTrainer=root.querySelector('#gym-trainer');if(gymTrainer)gymTrainer.onchange=()=>selectTrainer(gymTrainer.value);
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
  root.querySelectorAll('[data-gym]').forEach(b=>b.onclick=()=>{const id=root.querySelector('#gym-trainer')?.value;if(!id||game.pendingStarter||!agencyOf(game).roster.find(t=>t.id===id)?.party.length){notice('첫 파트너를 선택한 뒤 도전하세요.');return;}game.actions[id]=`gym:${b.dataset.gym}`;refresh();notice('체육관 도전을 배정했습니다. 계속을 누르면 준비 후 관전을 시작합니다.');});
  root.querySelectorAll('[data-watch-gym]').forEach(b=>b.onclick=()=>watch(b.dataset.watchGym));
}
