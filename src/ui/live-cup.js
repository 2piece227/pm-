/**
 * 대회 화면 — 대진 발표 뒤 개최일까지 상대를 보고 대비, 개최일에는 [계속]마다 라운드 하나 (유스컵)
 * (engine/season.js drawCup·startCup·liveCupStep). FM처럼 상대가 정해진 채로 며칠 준비한다.
 */
import { cupPairs, cupRoundLabel } from '../engine/season.js';
import { competitionTrainer } from '../engine/international.js';
import { findTrainer } from '../engine/league.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { escapeHtml as esc, monImage, gameDate } from './management-widgets.js';

const K = s => ko(SPECIES_KO, s);

/** 대회 날 [계속]이 무엇을 하는지 — 상단 버튼 글자 */
export function liveCupButtonLabel(e) {
  if (!e) return null;
  if (['scheduled', 'drawn', 'live'].includes(e.status)) return `${cupRoundLabel(e)} 진행 ▶`;
  return null;
}

/** 라운드별 대진 — 아직 안 치른 칸은 undefined(?) */
function roundsOf(e) {
  const draw = e.draw || e.slots || [];
  const total = Math.log2(draw.length || 2), rounds = [];
  let slots = draw;
  for (let r = 1; r <= total; r++) {
    const pairs = [];
    for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i], slots[i + 1]]);   // undefined = 아직 미정, null = 부전승
    rounds.push({ r, pairs });
    slots = pairs.map(([a, b]) => {
      if (a === undefined || b === undefined) return undefined;
      if (!a || !b) return a || b || null;
      const m = e.matches.find(m => m.round === r && [m.aId, m.bId].includes(a) && [m.aId, m.bId].includes(b));
      return m ? m.winnerId : undefined;
    });
  }
  return rounds;
}

export function renderLiveCup(game, e, { fresh = null } = {}) {
  if (!e) return '<section class="card"><p class="muted">볼 수 있는 대진이 없습니다.</p></section>';
  const trainer = id => findTrainer(game.league, id) || competitionTrainer(game, id);
  const ours = id => !!id && (e.entrants?.find(x => x.id === id) || trainer(id))?.agencyId === game.playerAgencyId;
  const name = id => id === undefined ? '<i class="muted">?</i>' : id ? esc(e.entrants?.find(x => x.id === id)?.name || trainer(id)?.name || id) : '<i class="muted">부전승</i>';
  const started = ['live', 'completed'].includes(e.status), today = e.date === game.day;
  const stage = e.status === 'completed' ? '대회 종료' : e.status === 'cancelled' ? '참가자 부족 · 취소'
    : e.status === 'drawn' ? (today ? '오늘 개최' : `대진 발표 · 개최 D-${e.date - game.day}`) : e.matches.length ? `${cupRoundLabel(e, e.round - 1)} 종료` : '경기 시작 전';
  const total = Math.log2((e.draw || e.slots || [1, 1]).length);
  const label = r => { const left = total - r + 1; return left <= 1 ? '결승' : left === 2 ? '준결승' : left === 3 ? '8강' : `${2 ** left}강`; };
  const bracket = roundsOf(e).map(({ r, pairs }) => `<section class="bk-round"><h5>${label(r)}</h5>${pairs.map(([a, b]) => {
    const m = e.matches.find(m => m.round === r && [m.aId, m.bId].includes(a) && [m.aId, m.bId].includes(b));
    const cls = id => `${m ? (m.winnerId === id ? 'win' : 'lose') : ''} ${ours(id) ? 'mine' : ''}`;
    return `<article class="bk-match ${fresh === 'round' && m?.round === e.round - 1 ? 'just' : ''}"><div class="bk-side ${cls(a)}"><b>${name(a)}</b></div><div class="bk-side ${cls(b)}"><b>${name(b)}</b></div>${m ? `<footer><span>${m.turns || '?'}턴${m.draw ? ' · 무승부 추첨' : ''}</span><button class="ghost" data-cup-watch="${m.id}">${e.viewed?.includes(m.id) ? '다시 보기' : '관전'}</button></footer>` : ''}</article>`;
  }).join('')}</section>`).join('');

  /* 우리 선수의 다음 경기 — 상대 파티(개최 전에는 지금 파티, 개최 뒤에는 확정 파티), 우리 선봉·전술 */
  const next = ['drawn', 'live'].includes(e.status) ? cupPairs(e).filter(([a, b]) => ours(a) || ours(b)) : [];
  const prep = next.map(([a, b]) => {
    const me = ours(a) ? a : b, foe = me === a ? b : a, t = trainer(me);
    const rival = foe ? (started ? e.entrants.find(x => x.id === foe) : trainer(foe)) : null;
    const rivalParty = rival ? (started ? rival.party : rival.party.slice(0, e.rosterSize)) : [];
    /* 개최 전: 지금 파티 앞 6마리가 출전 / 개최 뒤: 대회 표식이 붙은 출전 포켓몬 */
    const order = started
      ? t.party.filter(m => m._cupKey?.startsWith(`${e.id}:`))
      : t.party.slice(0, e.rosterSize);
    const lead = (m, i) => i === 0 ? '' : started
      ? `<button class="ghost" data-live-lead="${t.id}" data-key="${esc(m._cupKey)}">선봉으로</button>`
      : `<button class="ghost" data-live-lead="${t.id}" data-index="${t.party.indexOf(m)}">선봉으로</button>`;
    return `<article class="card live-prep"><div class="eyebrow">${started ? '다음 경기' : '첫 상대'} · ${cupRoundLabel(e)}${started ? '' : ` · ${gameDate(e.date)}`}</div>
      <h3>${esc(t.name)} vs ${rival ? esc(rival.name) : '부전승'}</h3>
      ${rival ? `<p class="muted">${esc(rival.agencyName || game.league.agencies.find(x => x.id === rival.agencyId)?.name || '')} · ${started ? '확정 출전 파티' : '현재 파티 (개최일에 확정)'}</p><div class="live-party foe">${rivalParty.map(m => `<span>${monImage(m.species)}<small>${esc(K(m.species))} Lv.${m.level}</small></span>`).join('')}</div>` : '<p>상대가 없어 다음 라운드로 올라갑니다.</p>'}
      <h4>우리 출전 순서 <small class="muted">${started ? '맨 앞이 선봉 · 등록 6마리·기술·도구는 대회 중 고정' : '맨 앞이 선봉 · 개최일의 파티 앞 6마리가 출전합니다'}</small></h4>
      <div class="live-party mine">${order.map((m, i) => `<span class="${i === 0 ? 'lead' : ''}">${monImage(m.species)}<small>${i === 0 ? '선봉 · ' : ''}${esc(K(m.species))} Lv.${m.level}</small>${lead(m, i)}</span>`).join('')}</div>
      <button class="ghost" data-live-tactics="${t.id}">포켓몬별 전술 지시 고치기</button></article>`;
  }).join('');

  const champion = e.result && e.entrants.find(x => x.id === e.result.championId);
  const out = e.status === 'live' && e.entrants.some(x => ours(x.id)) && !next.length ? '<p class="muted">우리 선수는 모두 탈락했습니다. [계속]으로 남은 경기를 진행합니다.</p>' : '';
  const hint = today && ['drawn', 'live'].includes(e.status) && e.live !== false && ['youth', 'youth-final'].includes(e.kind) && next.length
    ? `<p class="live-hint">위 [${cupRoundLabel(e)} 진행 ▶]을 누르면 이 라운드를 치릅니다. 우리 경기는 관전 화면이 열립니다.</p>`
    : e.status === 'drawn' && !today ? `<p class="live-hint">개최까지 ${e.date - game.day}일 — 상대 파티를 보고 우리 파티·선봉·전술을 준비하세요.</p>` : '';
  return `<div class="page-h"><div><div class="eyebrow">${e.kind === 'youth' || e.kind === 'youth-final' ? 'YOUTH CUP' : 'CUP'} · ${gameDate(e.date)}</div><h2>${esc(e.name)}</h2></div><span class="live-stage">${stage}</span></div>
  ${champion ? `<section class="card live-champ"><div class="eyebrow">CHAMPION</div><h2>${esc(champion.name)}</h2><p>${esc(champion.agencyName || '')} · 우승${ours(champion.id) ? ' — 축하합니다!' : ''}</p>${today ? '<p class="muted">[계속]을 누르면 오늘 남은 일정을 진행합니다.</p>' : ''}</section>` : ''}
  ${hint}${prep}${out}
  <section class="card"><h3>대진표</h3><div class="bracket live-bracket">${bracket}</div></section>`;
}

export function wireLiveCup(root, game, { refresh, openTactics }) {
  root.querySelectorAll('[data-live-lead]').forEach(b => b.onclick = () => {
    const t = findTrainer(game.league, b.dataset.liveLead);
    const i = b.dataset.key ? t?.party.findIndex(m => m._cupKey === b.dataset.key) : Number(b.dataset.index);
    if (t && i > 0) { const [m] = t.party.splice(i, 1); t.party.unshift(m); refresh(); }
  });
  root.querySelectorAll('[data-live-tactics]').forEach(b => b.onclick = () => openTactics(b.dataset.liveTactics));
}
