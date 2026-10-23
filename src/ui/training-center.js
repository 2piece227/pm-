/**
 * 트레이닝 센터 — 포켓몬 챔피언스의 능력 화면처럼: 육각형 능력 그래프 + 능력치 막대(성격 보정 빨강/파랑) + 성격 표
 * 개체값·노력치는 계획을 짜서 일수를 쓰고, 성격은 민트로 바로 바꾼다.
 */
import { Dex } from '@pkmn/dex';
import { agencyOf, IV_KEYS, IV_LABELS, TRAINING, trainingQuote, startTraining, applyMint } from '../engine/pokemon-management.js';
import { realStats } from '../data/pokemon.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { monImage, escapeHtml as esc } from './management-widgets.js';
import { NATURE_KO } from './pokemon-panel.js';

const K = s => ko(SPECIES_KO, s);
const SHORT = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
const NAT_STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
const NEUTRAL = ['Hardy', 'Docile', 'Serious', 'Bashful', 'Quirky'];
/** 화면 상태 — 고른 포켓몬과 짜고 있는 계획 (다시 그려도 유지) */
const ui = { key: null, plan: null, nature: null };

function allMons(game) {
  const a = agencyOf(game), out = a.box.map((m, i) => ({ key: `b${i}`, mon: m, where: '박스', box: true }));
  for (const t of a.roster) t.party.forEach((m, i) => out.push({ key: `p${t.id}:${i}`, mon: m, where: t.name, box: false }));
  return out;
}
const natureOf = name => Dex.natures.get(name);
function natureByStats(plus, minus) {
  if (plus === minus) return NEUTRAL[NAT_STATS.indexOf(plus)];
  return Dex.natures.all().find(n => n.plus === plus && n.minus === minus)?.name;
}
const planFor = mon => ({ ivs: { ...mon.ivs }, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...mon.evs } });

/** 육각형 그래프 — 지금(채움)과 훈련 뒤(점선) */
function hexagon(now, after, top) {
  const order = ['hp', 'atk', 'def', 'spe', 'spd', 'spa'], R = 88, C = 110;
  const ang = k => -Math.PI / 2 + order.indexOf(k) * Math.PI / 3;
  const pt = (k, v) => { const d = R * Math.min(1, v / top); return `${(C + Math.cos(ang(k)) * d).toFixed(1)},${(C + Math.sin(ang(k)) * d).toFixed(1)}`; };
  const ring = f => order.map(k => pt(k, top * f)).join(' ');
  const lab = k => `<text x="${(C + Math.cos(ang(k)) * (R + 14)).toFixed(1)}" y="${(C + Math.sin(ang(k)) * (R + 14) + 4).toFixed(1)}">${SHORT[k]}</text>`;
  return `<svg class="tc-hex" viewBox="0 0 220 220" aria-hidden="true">${[1, .75, .5, .25].map(f => `<polygon class="ring" points="${ring(f)}"/>`).join('')}<polygon class="now" points="${order.map(k => pt(k, now[k])).join(' ')}"/><polygon class="after" points="${order.map(k => pt(k, after[k])).join(' ')}"/>${order.map(lab).join('')}</svg>`;
}

function statRows(mon, plan, nature) {
  const before = realStats(mon), after = realStats({ ...mon, ivs: plan.ivs, evs: plan.evs, nature }), nat = natureOf(nature);
  const top = Math.max(...Object.values(after), ...Object.values(before));
  const base = Dex.species.get(mon.species).baseStats, used = IV_KEYS.reduce((n, k) => n + plan.evs[k], 0);
  const mark = k => nat.plus === k ? 'plus' : nat.minus === k ? 'minus' : '';
  return { before, after, top, used, html: IV_KEYS.map(k => `<div class="tc-row ${mark(k)}" data-stat="${k}">
    <span class="tc-name">${SHORT[k]}${nat.plus === k ? ' <i>▲</i>' : nat.minus === k ? ' <i>▼</i>' : ''}<small>종족값 ${base[k]}</small></span>
    <span class="tc-val"><b>${after[k]}</b>${after[k] !== before[k] ? `<small>${before[k]} →</small>` : ''}</span>
    <span class="tc-bar"><em style="width:${(after[k] / top * 100).toFixed(1)}%"></em><i style="width:${(Math.min(before[k], after[k]) / top * 100).toFixed(1)}%"></i></span>
    <span class="tc-iv"><small>개체값</small><button class="ghost" data-iv-step="${k}" data-d="-1" ${plan.ivs[k] <= mon.ivs[k] ? 'disabled' : ''} aria-label="${IV_LABELS[k]} 개체값 내리기">−</button><b class="${plan.ivs[k] === 31 ? 'max' : ''}">${plan.ivs[k]}</b><button class="ghost" data-iv-step="${k}" data-d="1" ${plan.ivs[k] >= 31 ? 'disabled' : ''} aria-label="${IV_LABELS[k]} 개체값 올리기">＋</button><button class="ghost tc-max" data-iv-max="${k}" ${plan.ivs[k] >= 31 ? 'disabled' : ''}>최고</button></span>
    <span class="tc-ev"><small>노력치</small><input type="range" min="0" max="${TRAINING.evStat}" step="4" value="${plan.evs[k]}" data-ev="${k}" aria-label="${IV_LABELS[k]} 노력치"><b>${plan.evs[k]}</b></span></div>`).join('') };
}

function natureGrid(mon, nature) {
  return `<table class="tc-nat"><thead><tr><th>▲ \\ ▼</th>${NAT_STATS.map(k => `<th>${SHORT[k]}</th>`).join('')}</tr></thead><tbody>${NAT_STATS.map(p => `<tr><th>${SHORT[p]}</th>${NAT_STATS.map(m => { const n = natureByStats(p, m); return `<td><button class="${n === nature ? 'on' : ''} ${n === mon.nature ? 'now' : ''}" data-nature="${n}" title="${NATURE_KO[n] || n}">${NATURE_KO[n] || n}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
}

export function renderTraining(game) {
  const list = allMons(game);
  const sel = list.find(x => x.key === ui.key) || list.find(x => x.box) || list[0];
  if (!sel) return `<div class="page-h"><h2>포켓몬 트레이닝 센터</h2></div><section class="card"><p>포켓몬이 없습니다. 지도에서 포획을 배정해 주세요.</p><button data-nav="map">탐험 지도 열기</button></section>`;
  if (ui.key !== sel.key || !ui.plan) { ui.key = sel.key; ui.plan = planFor(sel.mon); ui.nature = sel.mon.nature; }
  const mon = sel.mon, plan = ui.plan, job = mon.training, locked = !!job || !sel.box;
  const rows = statRows(mon, plan, ui.nature), q = trainingQuote(mon, plan), funds = agencyOf(game).funds;
  const nat = natureOf(ui.nature), cur = natureOf(mon.nature);
  return `<div class="page-h"><div><div class="eyebrow">TRAINING CENTER</div><h2>포켓몬 트레이닝 센터</h2></div><span class="muted">개체값 6V 최대 10일(보통 7일 안팎) · 노력치 최대 3일 · 성격은 민트로 바로</span></div><div id="management-notice" role="status"></div>
  <div class="tc-layout">
    <aside class="card tc-list">${['박스', '파티'].map(g => { const xs = list.filter(x => (g === '박스') === x.box); return xs.length ? `<h4>${g}</h4>${xs.map(x => `<button class="tc-pick ${x.key === sel.key ? 'on' : ''}" data-tc-pick="${x.key}">${monImage(x.mon.species)}<span><b>${esc(K(x.mon.species))}</b><small>Lv.${x.mon.level}${x.box ? '' : ` · ${esc(x.where)}`}</small></span>${x.mon.training ? `<i class="tc-busy">${x.mon.training.totalDays - x.mon.training.elapsed}일</i>` : ''}</button>`).join('')}` : ''; }).join('')}</aside>
    <section class="card tc-main">
      <header class="tc-head">${monImage(mon.species)}<div><h2>${esc(K(mon.species))} <small>Lv.${mon.level}</small></h2><p><span class="tc-nature">${esc(NATURE_KO[mon.nature] || mon.nature)}${cur.plus ? ` · ${SHORT[cur.plus]}▲ ${SHORT[cur.minus]}▼` : ' · 보정 없음'}</span>${mon.natureOrig ? ` <small class="muted">원래 성격 ${esc(NATURE_KO[mon.natureOrig] || mon.natureOrig)} · 민트 적용</small>` : ''}</p><p class="muted tc-legend"><i class="sw now"></i>지금 <i class="sw after"></i>훈련 뒤</p></div>${hexagon(rows.before, rows.after, rows.top)}</header>
      ${job ? `<div class="tc-job"><b>훈련 중 · ${job.elapsed} / ${job.totalDays}일</b><progress value="${job.elapsed}" max="${job.totalDays}"></progress><small>${job.v === 2 ? `개체값 ${job.ivDays}일 → 노력치 ${job.evDays}일 · 지금 ${job.elapsed < job.ivDays ? '개체값' : '노력치'} 단계` : '개편 전에 배정한 훈련'}</small><button class="ghost" data-tc-cancel>훈련 취소 · 오른 값은 유지</button></div>` : ''}
      <div class="tc-rows ${locked ? 'locked' : ''}">${rows.html}</div>
      <div class="tc-foot"><span class="tc-pool">노력치 <b>${rows.used}</b> / ${TRAINING.evTotal}<i style="width:${(rows.used / TRAINING.evTotal * 100).toFixed(1)}%"></i></span>
        <button class="ghost" data-tc-allmax ${locked ? 'disabled' : ''}>개체값 모두 최고</button><button class="ghost" data-tc-evreset ${locked ? 'disabled' : ''}>노력치 0으로</button><button class="ghost" data-tc-revert>되돌리기</button>
        <span class="tc-quote">${!sel.box ? '파티에 있는 포켓몬은 성격만 바꿀 수 있습니다. 개체값·노력치 훈련은 박스로 옮긴 뒤에 하세요.' : job ? '훈련이 끝나면 새 계획을 짤 수 있습니다.' : q.ok ? `개체값 +${q.points} · ${q.ivDays}일 / 노력치 변경 ${q.evChange} · ${q.evDays}일 = <b>총 ${q.days}일</b>` : esc(q.msg)}</span>
        <button data-tc-start ${locked || !q.ok ? 'disabled' : ''}>훈련 배정</button></div>
    </section>
    <section class="card tc-mint"><div class="section-heading"><h3>성격 · 민트</h3><small class="muted">▲ 1.1배 · ▼ 0.9배 · 바로 적용</small></div>${natureGrid(mon, ui.nature)}
      <p class="tc-mint-pick">${ui.nature === mon.nature ? '바꿀 성격을 표에서 고르세요. 고르면 왼쪽 능력치에 미리 반영됩니다.' : `<b>${esc(NATURE_KO[mon.nature] || mon.nature)} → ${esc(NATURE_KO[ui.nature] || ui.nature)}</b> ${nat.plus ? `(${SHORT[nat.plus]}▲ ${SHORT[nat.minus]}▼)` : '(보정 없음)'}`}</p>
      <button data-tc-mint ${ui.nature === mon.nature || funds < TRAINING.mintPrice ? 'disabled' : ''}>민트 사용 · ₽${TRAINING.mintPrice.toLocaleString()}</button><small class="muted">소속사 자금 ₽${funds.toLocaleString()} · 가격은 원작(SV) 상점가</small></section>
  </div>`;
}

export function wireTraining(root, game, refresh) {
  const sel = allMons(game).find(x => x.key === ui.key); if (!sel) return;
  const notice = msg => { const n = root.querySelector('#management-notice'); if (n) n.textContent = msg; };
  const on = (q, fn) => { const b = root.querySelector(q); if (b) b.onclick = fn; };
  root.querySelectorAll('[data-tc-pick]').forEach(b => b.onclick = () => { ui.key = b.dataset.tcPick; ui.plan = null; refresh(); });
  root.querySelectorAll('[data-iv-step]').forEach(b => b.onclick = () => { const k = b.dataset.ivStep; ui.plan.ivs[k] = Math.max(sel.mon.ivs[k], Math.min(31, ui.plan.ivs[k] + Number(b.dataset.d))); refresh(); });
  root.querySelectorAll('[data-iv-max]').forEach(b => b.onclick = () => { ui.plan.ivs[b.dataset.ivMax] = 31; refresh(); });
  root.querySelectorAll('[data-ev]').forEach(input => {
    /* 끄는 동안은 숫자만, 놓으면 다시 그린다 — 합계 510을 넘으면 남은 만큼만 */
    const clamp = () => {
      const k = input.dataset.ev, room = TRAINING.evTotal - IV_KEYS.reduce((n, x) => n + (x === k ? 0 : ui.plan.evs[x]), 0);
      const v = Math.max(0, Math.min(Number(input.value), room));
      ui.plan.evs[k] = v - v % 4; input.value = ui.plan.evs[k]; input.nextElementSibling.textContent = ui.plan.evs[k];
    };
    input.oninput = clamp; input.onchange = () => { clamp(); refresh(); };
  });
  on('[data-tc-allmax]', () => { for (const k of IV_KEYS) ui.plan.ivs[k] = 31; refresh(); });
  on('[data-tc-evreset]', () => { for (const k of IV_KEYS) ui.plan.evs[k] = 0; refresh(); });
  on('[data-tc-revert]', () => { ui.plan = planFor(sel.mon); ui.nature = sel.mon.nature; refresh(); });
  on('[data-tc-start]', () => { const r = startTraining(game, sel.mon, ui.plan); if (r.ok) ui.plan = null; refresh(); notice(r.msg); });
  on('[data-tc-cancel]', () => { delete sel.mon.training; ui.plan = null; refresh(); notice('훈련을 취소했습니다. 그때까지 오른 값은 남습니다.'); });
  root.querySelectorAll('[data-nature]').forEach(b => b.onclick = () => { ui.nature = b.dataset.nature; refresh(); });
  on('[data-tc-mint]', () => { const r = applyMint(game, sel.mon, ui.nature); refresh(); notice(r.msg); });
}
