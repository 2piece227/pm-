/**
 * 전술 보드 — 트레이너별 파티 순서와 포켓몬별 지시 (FM 선수별 지시처럼)
 * 지시 데이터·역할은 data/mon-tactics.js, AI 반영은 ai/mon-tactics.js
 */
import { Dex } from '@pkmn/dex';
import { SLIDERS, LOW_HP, MOVE_ORDERS, ROLES, tacticsOf, applyRole } from '../data/mon-tactics.js';
import { BATTLE_POLICIES, policyId } from '../data/battle-policy.js';
import { obedience } from '../ai/mon-tactics.js';
import { ko, SPECIES_KO, MOVE_KO } from '../data/ko.js';
import { monImage, escapeHtml as esc } from './management-widgets.js';
import { TYPE_KO } from './pokemon-panel.js';
import { HELD_ITEMS } from '../data/items.gen.js';

const ui = { pick: 0 };
const K = s => ko(SPECIES_KO, s), M = s => ko(MOVE_KO, s);
const CAT = { Physical: '물리', Special: '특수', Status: '변화' };

export function renderTacticsBoard(t) {
  if (!t.party.length) return '<p class="muted">파티가 없습니다.</p>';
  ui.pick = Math.min(ui.pick, t.party.length - 1);
  const m = t.party[ui.pick], tac = tacticsOf(m), obey = Math.round(obedience(t.stats, t.nature?.compliance) * 100);
  const isMegaHolder = HELD_ITEMS[m.item]?.cat === 'mega';
  const slider = s => `<div class="tb-slider"><span class="tb-sl-name">${s.name}</span><small>${s.low}</small><div class="tb-steps" role="radiogroup" aria-label="${s.name}">${[-2, -1, 0, 1, 2].map(v => `<button class="${tac[s.key] === v ? 'on' : ''} v${v}" data-tac="${s.key}" data-val="${v}" aria-pressed="${tac[s.key] === v}" title="${v}"></button>`).join('')}</div><small>${s.high}</small></div>`;
  return `<section class="tactics">
    <p class="live-hint">배틀 AI를 어나더레드 방식으로 새로 짓는 중입니다. 지금은 출전 순서·기술별 지시(<b>우선·자제·금지</b>)·메가진화 담당이 반영되고, 팀 운영 방침·역할·세부 지시 슬라이더는 다음 단계에서 다시 연결됩니다.</p>
    <div class="tb-team card"><div><h3>팀 운영 방침</h3><select id="battle-policy-tb">${Object.entries(BATTLE_POLICIES).map(([id, p]) => `<option value="${id}" ${policyId(t.battlePolicy) === id ? 'selected' : ''}>${p.name}</option>`).join('')}</select><p class="muted">${BATTLE_POLICIES[policyId(t.battlePolicy)].hint}</p></div>
      <div class="tb-obey"><small>지시 이행도</small><b>${obey}%</b><span class="cond-bar good"><i style="width:${obey}%"></i></span><small>순응도·판단력이 높을수록 지시를 잘 따릅니다</small></div></div>
    <div class="tb-layout">
      <aside class="tb-lineup card"><h3>출전 순서 <small>1번이 선봉</small></h3>
        ${t.party.map((p, i) => { const pt = tacticsOf(p); return `<div class="tb-slot ${i === ui.pick ? 'on' : ''}" data-pick="${i}" role="button" tabindex="0"><span class="tb-no">${i === 0 ? '선봉' : i + 1}</span>${monImage(p.species)}<div><b>${esc(K(p.species))}</b><small>Lv.${p.level} · ${ROLES[pt.role]?.name || '균형'}${pt.mega ? ' · 메가' : ''}</small></div><span class="tb-move"><button class="ghost" data-move-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="ghost" data-move-down="${i}" ${i === t.party.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></span></div>`; }).join('')}
      </aside>
      <section class="tb-detail card">
        <header class="tb-head">${monImage(m.species)}<div><small>포켓몬별 지시</small><h2>${esc(K(m.species))} <span>Lv.${m.level}</span></h2><p>${Dex.species.get(m.species).types.map(x => `<span class="move-type" data-type="${x}">${TYPE_KO[x]}</span>`).join(' ')}</p></div></header>
        <h4>역할</h4><div class="tb-roles">${Object.entries(ROLES).map(([id, r]) => `<button class="chip ${tac.role === id ? 'on' : ''}" data-role="${id}" title="${esc(r.desc)}">${r.name}</button>`).join('')}</div>
        <p class="muted tb-role-desc">${esc(ROLES[tac.role]?.desc || '')} 역할을 고르면 아래 지시가 채워지고, 하나씩 다시 바꿀 수 있습니다.</p>
        <h4>세부 지시</h4>${SLIDERS.map(slider).join('')}
        <div class="tb-row"><span class="tb-sl-name">체력이 낮을 때</span><div class="chips">${Object.entries(LOW_HP).map(([k, v]) => `<button class="chip ${tac.lowHp === k ? 'on' : ''}" data-lowhp="${k}">${v}</button>`).join('')}</div></div>
        <h4>기술별 지시</h4><div class="tb-moves">${m.moves.map(mv => { const d = Dex.moves.get(mv), o = tac.moves?.[d.id] || 'normal'; return `<div class="tb-mv"><span class="move-type" data-type="${d.type}">${TYPE_KO[d.type]}</span><b>${esc(M(mv))}</b><small>${CAT[d.category]}${d.basePower ? ` · 위력 ${d.basePower}` : ''}</small><div class="chips">${Object.entries(MOVE_ORDERS).map(([k, v]) => `<button class="chip ${o === k ? 'on' : ''} ${k}" data-moveorder="${d.id}" data-val="${k}">${v}</button>`).join('')}</div></div>`; }).join('')}</div>
        <h4>특수 전술</h4><div class="tb-special">
          <button class="chip ${tac.mega ? 'on' : ''}" data-mega ${isMegaHolder ? '' : 'disabled'} title="${isMegaHolder ? '파티에 담당이 있으면 이 포켓몬만 메가진화합니다' : '메가스톤을 지녀야 지정할 수 있습니다'}">메가진화 담당</button>
          <button class="chip" disabled title="다음 업데이트">테라스탈 담당 · 준비 중</button>
          <button class="chip" disabled title="다음 업데이트">다이맥스 담당 · 준비 중</button>
        </div>
      </section>
    </div></section>`;
}

export function wireTacticsBoard(root, t, refresh) {
  const m = () => t.party[ui.pick];
  const set = (key, val) => { const mon = m(); mon.tactics = { ...tacticsOf(mon), [key]: val }; refresh(); };
  root.querySelectorAll('[data-pick]').forEach(el => { el.onclick = e => { if (e.target.closest('button')) return; ui.pick = Number(el.dataset.pick); refresh(); }; });
  root.querySelectorAll('[data-move-up],[data-move-down]').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.moveUp ?? b.dataset.moveDown), j = b.dataset.moveUp != null ? i - 1 : i + 1;
    if (j < 0 || j >= t.party.length) return;
    [t.party[i], t.party[j]] = [t.party[j], t.party[i]]; ui.pick = j; refresh();
  });
  root.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { applyRole(m(), b.dataset.role); refresh(); });
  root.querySelectorAll('[data-tac]').forEach(b => b.onclick = () => set(b.dataset.tac, Number(b.dataset.val)));
  root.querySelectorAll('[data-lowhp]').forEach(b => b.onclick = () => set('lowHp', b.dataset.lowhp));
  root.querySelectorAll('[data-moveorder]').forEach(b => b.onclick = () => { const mon = m(), tac = tacticsOf(mon); const moves = { ...tac.moves }; if (b.dataset.val === 'normal') delete moves[b.dataset.moveorder]; else moves[b.dataset.moveorder] = b.dataset.val; mon.tactics = { ...tac, moves }; refresh(); });
  const mega = root.querySelector('[data-mega]');
  if (mega) mega.onclick = () => { const on = !tacticsOf(m()).mega; for (const p of t.party) if (p.tactics) p.tactics.mega = false; m().tactics = { ...tacticsOf(m()), mega: on }; refresh(); };
  const pol = root.querySelector('#battle-policy-tb'); if (pol) pol.onchange = () => { t.battlePolicy = policyId(pol.value); refresh(); };
}
