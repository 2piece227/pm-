/**
 * 유스컵 직접 진행 화면 — 대진 추첨 → 라운드마다 [계속] → 우리 경기 관전 → 라운드 사이에 선봉·전술 조정
 * (engine/season.js liveCupStep). FM처럼 대회 날을 한 단계씩 넘긴다.
 */
import { cupPairs, cupRoundLabel } from '../engine/season.js';
import { competitionTrainer } from '../engine/international.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { escapeHtml as esc, monImage } from './management-widgets.js';

const K = s => ko(SPECIES_KO, s);

/** 지금 [계속]을 누르면 무엇을 하는지 — 상단 버튼 글자 */
export function liveCupButtonLabel(e) {
  if (!e) return null;
  if (e.status === 'scheduled') return '대진 추첨 ▶';
  if (e.status === 'live') return `${cupRoundLabel(e)} 진행 ▶`;
  return null;
}

function roundsOf(e) {
  const draw = e.draw || e.slots || [];
  const total = Math.log2(draw.length || 2), rounds = [];
  let slots = draw;
  for (let r = 1; r <= total; r++) {
    const pairs = [];
    for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i] ?? null, slots[i + 1] ?? null]);
    rounds.push({ r, pairs });
    slots = pairs.map(([a, b]) => {
      if (!a || !b) return a || b || null;
      const m = e.matches.find(m => m.round === r && [m.aId, m.bId].includes(a) && [m.aId, m.bId].includes(b));
      return m ? m.winnerId : undefined;   // 아직 안 치름
    });
  }
  return rounds;
}

export function renderLiveCup(game, e, { fresh = null } = {}) {
  if (!e) return '<section class="card"><p class="muted">오늘 직접 진행할 대회가 없습니다.</p></section>';
  const ours = id => e.entrants.find(x => x.id === id)?.agencyId === game.playerAgencyId;
  const name = id => id === undefined ? '<i class="muted">?</i>' : id ? esc(e.entrants.find(x => x.id === id)?.name || id) : '<i class="muted">부전승</i>';
  const stage = e.status === 'completed' ? '대회 종료' : e.status === 'cancelled' ? '참가자 부족 · 취소' : e.round === 1 && !e.matches.length ? '대진 추첨 완료' : `${cupRoundLabel(e, e.round - 1)} 종료`;
  const total = Math.log2((e.draw || e.slots || [1, 1]).length);
  const label = r => { const left = total - r + 1; return left === 1 ? '결승' : left === 2 ? '준결승' : left === 3 ? '8강' : `${2 ** left}강`; };
  let reveal = 0;
  const bracket = roundsOf(e).map(({ r, pairs }) => `<section class="bk-round"><h5>${label(r)}</h5>${pairs.map(([a, b]) => {
    const m = e.matches.find(m => m.round === r && [m.aId, m.bId].includes(a) && [m.aId, m.bId].includes(b));
    const cls = id => `${m ? (m.winnerId === id ? 'win' : 'lose') : ''} ${ours(id) ? 'mine' : ''}`;
    const delay = fresh === 'draw' && r === 1 ? ` style="animation-delay:${(reveal++) * 0.32}s"` : '';
    return `<article class="bk-match ${fresh === 'draw' && r === 1 ? 'draw-in' : ''} ${fresh === 'round' && m?.round === e.round - 1 ? 'just' : ''}"${delay}><div class="bk-side ${cls(a)}"><b>${name(a)}</b></div><div class="bk-side ${cls(b)}"><b>${name(b)}</b></div>${m ? `<footer><span>${m.turns || '?'}턴${m.draw ? ' · 무승부 추첨' : ''}</span><button class="ghost" data-cup-watch="${m.id}">${e.viewed?.includes(m.id) ? '다시 보기' : '관전'}</button></footer>` : ''}</article>`;
  }).join('')}</section>`).join('');

  /* 우리 선수의 다음 경기 — 상대 파티 공개, 선봉·전술 조정 */
  const next = e.status === 'live' ? cupPairs(e).filter(([a, b]) => ours(a) || ours(b)) : [];
  const prep = next.map(([a, b]) => {
    const me = ours(a) ? a : b, foe = me === a ? b : a;
    const t = competitionTrainer(game, me), entry = e.entrants.find(x => x.id === me), rival = e.entrants.find(x => x.id === foe);
    const order = entry.party.map(m => t.party.find(p => p._cupKey && p._cupKey === m._cupKey)).filter(Boolean)
      .sort((x, y) => t.party.indexOf(x) - t.party.indexOf(y));
    return `<article class="card live-prep"><div class="eyebrow">다음 경기 · ${cupRoundLabel(e)}</div>
      <h3>${esc(t.name)} vs ${rival ? esc(rival.name) : '부전승'}</h3>
      ${rival ? `<p class="muted">${esc(rival.agencyName || '')}</p><div class="live-party foe">${rival.party.map(m => `<span>${monImage(m.species)}<small>${esc(K(m.species))} Lv.${m.level}</small></span>`).join('')}</div>` : '<p>상대가 없어 다음 라운드로 올라갑니다.</p>'}
      <h4>우리 출전 순서 <small class="muted">맨 앞이 선봉 · 기술·도구는 대회 중 고정</small></h4>
      <div class="live-party mine">${order.map((m, i) => `<span class="${i === 0 ? 'lead' : ''}">${monImage(m.species)}<small>${i === 0 ? '선봉 · ' : ''}${esc(K(m.species))} Lv.${m.level}</small>${i ? `<button class="ghost" data-live-lead="${t.id}" data-key="${esc(m._cupKey)}">선봉으로</button>` : ''}</span>`).join('')}</div>
      <button class="ghost" data-live-tactics="${t.id}">포켓몬별 전술 지시 고치기</button></article>`;
  }).join('');

  const champion = e.result && e.entrants.find(x => x.id === e.result.championId);
  const out = e.status === 'live' && e.entrants.some(x => ours(x.id)) && !next.length ? '<p class="muted">우리 선수는 모두 탈락했습니다. [계속]으로 남은 경기를 진행합니다.</p>' : '';
  return `<div class="page-h"><div><div class="eyebrow">YOUTH CUP · LIVE</div><h2>${esc(e.name)}</h2></div><span class="live-stage">${stage}</span></div>
  ${champion ? `<section class="card live-champ"><div class="eyebrow">CHAMPION</div><h2>${esc(champion.name)}</h2><p>${esc(champion.agencyName || '')} · 우승${ours(champion.id) ? ' — 축하합니다!' : ''}</p><p class="muted">[계속]을 누르면 오늘 남은 일정을 진행합니다.</p></section>` : ''}
  ${e.status === 'live' ? `<p class="live-hint">위 [${cupRoundLabel(e)} 진행 ▶]을 누르면 이 라운드를 치릅니다. 우리 경기는 관전 화면이 열립니다.</p>` : ''}
  ${prep}${out}
  <section class="card"><h3>대진표</h3><div class="bracket live-bracket">${bracket}</div></section>`;
}

export function wireLiveCup(root, game, { refresh, openTactics }) {
  root.querySelectorAll('[data-live-lead]').forEach(b => b.onclick = () => {
    const t = competitionTrainer(game, b.dataset.liveLead), i = t?.party.findIndex(m => m._cupKey === b.dataset.key);
    if (t && i > 0) { const [m] = t.party.splice(i, 1); t.party.unshift(m); refresh(); }
  });
  root.querySelectorAll('[data-live-tactics]').forEach(b => b.onclick = () => openTactics(b.dataset.liveTactics));
}
