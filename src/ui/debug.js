/**
 * 디버그 화면 — game.debug가 켜진 게임에서만 메뉴에 보인다 (engine/debug.js)
 */
import { DEBUG_FUNDS, debugAddPokemon, debugPartyLevel, debugBadges, debugFinishTraining, debugGiveAll, toggleDebug, refillFunds } from '../engine/debug.js';
import { agencyOf } from '../engine/pokemon-management.js';
import { advanceDay } from '../engine/game.js';
import { SPECIES_KO } from '../data/ko.js';
import { escapeHtml as esc } from './management-widgets.js';

const KO_TO_EN = Object.fromEntries(Object.entries(SPECIES_KO).map(([en, ko]) => [ko, en]));
const ui = { trainerId: null, busy: false };

export function renderDebug(game) {
  const roster = agencyOf(game).roster;
  const sel = roster.find(t => t.id === ui.trainerId) || roster[0];
  ui.trainerId = sel?.id || null;
  const flag = (key, label, hint) => `<label class="dbg-flag"><input type="checkbox" data-dbg-flag="${key}" ${game.debug[key] ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`;
  return `<div class="page-h"><div><div class="eyebrow">DEBUG MODE</div><h2>디버그 · 실험실</h2></div><span class="muted">자금은 늘 ₽${DEBUG_FUNDS.toLocaleString()}로 다시 찹니다. 이 저장에서만 켜져 있습니다.</span></div>
  <div id="debug-notice" role="status" class="dbg-notice"></div>
  <div class="dbg-grid">
    <section class="card"><h3>포켓몬 추가</h3><p class="muted">한글 또는 영문 이름 · 레벨을 넣으면 박스에 들어갑니다.</p>
      <div class="dbg-row"><input id="dbg-species" list="dbg-species-list" placeholder="예: 리자몽 / Charizard" autocomplete="off"><input id="dbg-level" type="number" min="1" max="100" value="50"><button data-dbg="add">박스에 넣기</button></div>
      <datalist id="dbg-species-list">${Object.values(SPECIES_KO).map(n => `<option value="${esc(n)}">`).join('')}</datalist></section>
    <section class="card"><h3>트레이너</h3>
      <div class="dbg-row"><select id="dbg-trainer">${roster.map(t => `<option value="${t.id}" ${t.id === sel?.id ? 'selected' : ''}>${esc(t.name)} · 파티 ${t.party.length} · 배지 ${(t.badges || []).length}</option>`).join('')}</select></div>
      <div class="dbg-row"><input id="dbg-party-level" type="number" min="1" max="100" value="50"><button data-dbg="level" ${sel ? '' : 'disabled'}>파티 레벨 맞추기</button></div>
      <div class="dbg-row"><button class="ghost" data-dbg-badges="kanto">관동 배지 8개</button><button class="ghost" data-dbg-badges="johto">성도 배지 8개</button><button class="ghost" data-dbg-badges="all">16개 전부</button><button class="ghost" data-dbg-badges="none">배지 초기화</button></div></section>
    <section class="card"><h3>규칙 풀기</h3>
      ${flag('unlockReform', '리그 개혁 잠금 해제', '2026 시즌에도 프로 콜업·영입 가능')}
      ${flag('noGymWait', '관장전 대기 없음', '배지 후 21일·패배 후 재도전 대기 무시')}</section>
    <section class="card"><h3>바로 하기</h3>
      <div class="dbg-row"><button data-dbg="give">모든 도구·기술머신·키스톤 지급</button><button class="ghost" data-dbg="train">훈련 즉시 완료</button></div>
      <div class="dbg-row"><input id="dbg-days" type="number" min="1" max="120" value="7"><button data-dbg="skip" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '진행 중…' : '일 빠르게 진행'}</button></div>
      <p class="muted">빠르게 진행은 그날 배정·대회·관장전을 모두 실제로 계산합니다.</p>
      <a class="ghost dbg-link" href="${(import.meta.env?.BASE_URL ?? '/')}trainer_sim_v2.html" target="_blank" rel="noopener">예전 배틀 시뮬 프로토타입 열기 ↗</a></section>
  </div>`;
}

export function wireDebug(root, game, refresh) {
  if (!root.querySelector('.dbg-grid')) return;
  const note = msg => { const n = root.querySelector('#debug-notice'); if (n) n.textContent = msg; };
  const done = r => { refillFunds(game); refresh(); note(r.msg); };
  const tid = () => root.querySelector('#dbg-trainer')?.value;
  const sel = root.querySelector('#dbg-trainer'); if (sel) sel.onchange = () => { ui.trainerId = sel.value; refresh(); };
  root.querySelectorAll('[data-dbg-flag]').forEach(b => b.onchange = () => done(toggleDebug(game, b.dataset.dbgFlag)));
  root.querySelectorAll('[data-dbg-badges]').forEach(b => b.onclick = () => done(debugBadges(game, tid(), b.dataset.dbgBadges)));
  root.querySelectorAll('[data-dbg]').forEach(b => b.onclick = async () => {
    const k = b.dataset.dbg;
    if (k === 'add') { const raw = root.querySelector('#dbg-species').value.trim(); done(await debugAddPokemon(game, KO_TO_EN[raw] || raw, Number(root.querySelector('#dbg-level').value))); }
    if (k === 'level') done(await debugPartyLevel(game, tid(), Number(root.querySelector('#dbg-party-level').value)));
    if (k === 'give') done(debugGiveAll(game));
    if (k === 'train') done(debugFinishTraining(game));
    if (k === 'skip') {
      const n = Math.max(1, Math.min(120, Number(root.querySelector('#dbg-days').value) || 1));
      ui.busy = true; refresh();
      let ran = 0;
      try { for (; ran < n && !game.gameOver; ran++) await advanceDay(game); }
      catch (e) { ui.busy = false; done({ msg: `${ran}일 진행 후 멈춤: ${e.message}` }); return; }
      ui.busy = false; done({ msg: `${ran}일 진행했습니다.` });
    }
  });
}
