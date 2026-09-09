import { Dex } from '@pkmn/dex';
import { spriteCandidates } from './sprites.js';
import { STARTERS } from '../data/species-pool.js';
import { SPECIES_KO, MOVE_KO, ko } from '../data/ko.js';
import { levelUpMoves, movesAtLevel } from '../data/pokemon.js';
import * as sfx from './sfx.js';

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const gameDate = (day) => {
  const d = new Date(Date.UTC(2026, 2, day));
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${['일','월','화','수','목','금','토'][d.getUTCDay()]})`;
};
export const monImage = (species, cls = '') => `<img class="pixel-mon ${cls}" data-species="${escapeHtml(species)}" src="${spriteCandidates(species, 'p2')[0]?.url || ''}" alt="${escapeHtml(ko(SPECIES_KO, species))}" referrerpolicy="no-referrer">`;
export function wireMonImages(root) {
  root.querySelectorAll('img[data-species]').forEach(img => {
    const candidates = spriteCandidates(img.dataset.species, 'p2');
    let i = 0;
    img.onerror = () => {
      if (++i < candidates.length) img.src = candidates[i].url;
      else { img.onerror = null; img.classList.add('unavailable'); }
    };
    if (img.complete && !img.naturalWidth) img.onerror();
  });
}

/** A real choice, followed by explicit confirmation; no party is created until confirmed. */
export async function chooseStarter(trainerName) {
  const tables = await Promise.all(STARTERS.map(s => levelUpMoves(s.species)));
  return new Promise(resolve => {
    let selected = 0, confirming = false;
    const dialog = document.createElement('dialog');
    dialog.className = 'partner-dialog';
    dialog.setAttribute('aria-label', '첫 파트너 포켓몬 선택');
    const tips = ['풀과 독 타입의 든든한 동료. 씨앗과 함께 조금씩 자라납니다.', '꼬리의 불꽃처럼 힘차게 자라는 동료. 앞으로의 성장이 기대됩니다.', '단단한 등껍질을 가진 물 타입의 동료. 차분하게 함께 출발합니다.'];
    function draw() {
      const s = STARTERS[selected];
      dialog.innerHTML = `<div class="eyebrow">새로운 동료 · PARTNER SELECTION</div>
        <h2>어떤 포켓몬과 함께할까요?</h2><p class="muted">${escapeHtml(trainerName)}의 첫 여정은 레벨 5에서 시작합니다.</p>
        <div class="partner-stage">${STARTERS.map((m, i) => `<button class="partner-option ${i === selected ? 'selected' : ''}" data-partner="${i}" aria-pressed="${i === selected}" ${confirming ? 'disabled' : ''}>
          <span class="partner-number">0${i + 1}</span><span class="partner-platform">${monImage(m.species)}<span class="pokeball"></span></span><b>${m.ko}</b><span class="type-tag type-${i}">${m.type}</span></button>`).join('')}</div>
        <div class="partner-dialogue"><span class="speaker">파트너 안내</span><strong>${confirming ? `${s.ko}와 함께 출발할까요?` : tips[selected]}</strong>
        <p>Lv. 5 · ${movesAtLevel(tables[selected], 5).map(m => ko(MOVE_KO, m)).join(' / ')}</p></div>
        <div class="dialog-actions"><span class="muted">← → 선택 · Enter 확인</span>${confirming ? '<button class="ghost" data-reselect>다시 고르기</button>' : ''}<button data-confirm>${confirming ? `${s.ko}와 출발하기` : `${s.ko} 선택`}</button></div>`;
      wireMonImages(dialog);
      dialog.querySelectorAll('[data-partner]').forEach(b => b.onclick = () => select(Number(b.dataset.partner)));
      dialog.querySelector('[data-reselect]')?.addEventListener('click', () => { confirming = false; draw(); });
      dialog.querySelector('[data-confirm]').onclick = confirm;
      dialog.querySelector('[data-confirm]').focus();
    }
    function select(i) { selected = (i + STARTERS.length) % STARTERS.length; sfx.unlock(); sfx.playCry(Dex.species.get(STARTERS[selected].species).num); draw(); }
    function confirm() {
      if (!confirming) { confirming = true; draw(); return; }
      const species = STARTERS[selected].species;
      dialog.close(); dialog.remove(); resolve(species);
    }
    dialog.addEventListener('cancel', e => { e.preventDefault(); confirming = false; draw(); });
    dialog.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !confirming) { e.preventDefault(); select(selected + (e.key === 'ArrowLeft' ? -1 : 1)); }
    });
    document.body.append(dialog); dialog.showModal(); draw();
  });
}

/** Progress is driven by completed engine stages, never fabricated result labels. */
export function dayProgress(day) {
  const dialog = document.createElement('dialog');
  dialog.className = 'day-dialog';
  dialog.setAttribute('aria-label', '하루 진행');
  dialog.innerHTML = `<div class="eyebrow">진행 중 · ${gameDate(day)}</div><h2>오늘의 이야기를 만들고 있습니다</h2>
    <p class="muted">트레이너의 활동과 소속사 소식을 정리합니다.</p><div class="day-track"><i></i></div>
    <div class="day-events" aria-live="polite"></div><div class="day-footer">결과가 준비되면 일일 보고서로 이동합니다.</div>`;
  dialog.addEventListener('cancel', e => e.preventDefault());
  document.body.append(dialog); dialog.showModal();
  const rows = new Map();
  let progress = 8;
  return {
    async update(event) {
      let row = rows.get(event.id);
      if (!row) { row = document.createElement('div'); row.className = 'day-event'; rows.set(event.id, row); dialog.querySelector('.day-events').append(row); }
      row.classList.toggle('done', event.state === 'done');
      row.innerHTML = `<span class="event-marker">${event.state === 'done' ? '✓' : ''}</span><div><b>${escapeHtml(event.label)}</b><p>${escapeHtml(event.detail || '')}</p></div>`;
      const stageProgress = event.state === 'done' ? ({activities:68,league:80,finance:90,reports:100}[event.id] || 0) : 0;
      progress = Math.max(progress, event.progress || 0, stageProgress);
      dialog.querySelector('.day-track i').style.width = `${progress}%`;
      row.scrollIntoView({ block: 'nearest' });
      // Yield between simulation stages so the browser can display actual progress.
      await new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 240));
    },
    close() { dialog.close(); dialog.remove(); },
  };
}
