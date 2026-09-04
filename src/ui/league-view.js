/**
 * 리그 탭 UI — 최소 구성. (SPEC §3, §5.2)
 *
 * 새로 디자인하지 않고 배틀 시뮬 탭의 패턴(.panel / table / .note / button)을 그대로 쓴다.
 * 배틀 관전은 battle-view.js를 공유하므로 리그 배틀도 같은 화면에서 재생된다.
 */
import {
  createLeague, advanceWeek, standings, allTrainers, trainerRating,
  findTrainer, findAgency, runMatch, LEAGUE_CONFIG, LOCAL_TOURNAMENT_TIERS,
} from '../engine/league.js';
import { teamSpecies } from '../engine/team-builder.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { playBattleLog, resetScene, say } from './battle-view.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let league = null;
let selectedAgencyId = null;
let selectedTournamentId = null;
let replaying = false;

/* ---------------- 순위표 ---------------- */
function renderStandings() {
  const rows = standings(league)
    .map(
      (s, i) =>
        `<tr class="lg-row${s.id === selectedAgencyId ? ' on' : ''}" data-agency="${s.id}">` +
        `<td class="n">${i + 1}</td>` +
        `<td>${esc(s.name)}${s.isPlayer ? ' <b style="color:var(--gold)">★</b>' : ''}</td>` +
        `<td><span class="sub">${esc(s.tierLabel)}</span></td>` +
        `<td class="n">${s.reputation}</td>` +
        `<td class="n">${s.funds.toLocaleString()}</td>` +
        `<td class="n">${s.titles}</td>` +
        `<td class="n">${s.wins}-${s.losses}</td></tr>`
    )
    .join('');

  $('lg-standings').innerHTML =
    '<table><tr><th>#</th><th>소속사</th><th>등급</th><th>평판</th><th>자금</th><th>우승</th><th>승-패</th></tr>' +
    rows + '</table>' +
    `<div class="note" style="margin-top:6px">${league.week}주차 진행됨 · 대회 ${league.tournaments.length}개 개최 · 행을 클릭하면 로스터가 보입니다</div>`;

  $('lg-standings').querySelectorAll('.lg-row').forEach((tr) => {
    tr.onclick = () => { selectedAgencyId = tr.dataset.agency; renderStandings(); renderRoster(); };
  });
}

/* ---------------- 로스터 ---------------- */
function renderRoster() {
  if (!selectedAgencyId) {
    $('lg-roster').innerHTML = '<div class="note">순위표에서 소속사를 클릭하세요.</div>';
    return;
  }
  const a = findAgency(league, selectedAgencyId);
  const rows = a.roster
    .map((t) => {
      const s = t.stats;
      const mons = teamSpecies(t.team).map((sp) => ko(SPECIES_KO, sp)).join(', ');
      return (
        `<tr><td>${esc(t.name)}</td>` +
        `<td class="n">${trainerRating(t).toFixed(1)}</td>` +
        `<td class="n"><span class="sub">${s.judge}/${s.ops}/${s.focus}/${s.know}/${s.mental}</span></td>` +
        `<td class="n">${t.record.titles}</td>` +
        `<td class="n">${t.record.wins}-${t.record.losses}</td>` +
        `<td><span class="sub">${esc(mons)}</span></td></tr>`
      );
    })
    .join('');

  $('lg-roster').innerHTML =
    `<div style="font-weight:800;margin-bottom:4px">${esc(a.name)} <span class="sub" style="font-weight:400">${esc(a.tierLabel)} · ${esc(a.concept)}</span></div>` +
    '<table><tr><th>트레이너</th><th>레이팅</th><th>판단/운영/집중/지식/멘탈</th><th>우승</th><th>승-패</th><th>파티</th></tr>' +
    rows + '</table>';
}

/* ---------------- 대회 목록 / 경기 목록 ---------------- */
function renderTournaments() {
  const recent = league.tournaments.slice(-9).reverse();
  if (!recent.length) {
    $('lg-tournaments').innerHTML = '<div class="note">아직 열린 대회가 없습니다. "다음 주 진행"을 누르세요.</div>';
    $('lg-matches').innerHTML = '';
    return;
  }
  const rows = recent
    .map((t) => {
      const champ = findTrainer(league, t.result?.championId);
      const agency = champ ? findAgency(league, champ.agencyId) : null;
      return (
        `<tr class="lg-row${t.id === selectedTournamentId ? ' on' : ''}" data-tour="${t.id}">` +
        `<td class="n">${t.week}주</td>` +
        `<td>${esc(t.tierLabel)}</td>` +
        `<td class="n">${t.entrants.length}명</td>` +
        `<td>${champ ? `${esc(champ.name)} <span class="sub">(${esc(agency.name)})</span>` : '<span class="sub">유찰</span>'}</td>` +
        `</tr>`
      );
    })
    .join('');

  $('lg-tournaments').innerHTML =
    '<table><tr><th>주차</th><th>등급</th><th>참가</th><th>우승</th></tr>' + rows + '</table>' +
    '<div class="note" style="margin-top:6px">대회를 클릭하면 경기 목록이 보입니다</div>';

  $('lg-tournaments').querySelectorAll('.lg-row').forEach((tr) => {
    tr.onclick = () => { selectedTournamentId = tr.dataset.tour; renderTournaments(); renderMatches(); };
  });
}

function renderMatches() {
  const t = league.tournaments.find((x) => x.id === selectedTournamentId);
  if (!t) { $('lg-matches').innerHTML = ''; return; }

  const rows = t.matches
    .map((m, i) => {
      const a = findTrainer(league, m.aId);
      const b = findTrainer(league, m.bId);
      const aAg = findAgency(league, a?.agencyId);
      const bAg = findAgency(league, b?.agencyId);
      const aWon = m.winnerId === m.aId;
      const nm = (t2, ag, won) =>
        `<span style="${won ? 'font-weight:800' : 'opacity:.65'}">${esc(t2?.name || '?')}</span>` +
        ` <span class="sub">${esc(ag?.name || '')}</span>`;
      return (
        `<tr><td><span class="sub">${esc(m.roundLabel)}</span></td>` +
        `<td>${nm(a, aAg, aWon)} vs ${nm(b, bAg, !aWon)}</td>` +
        `<td class="n"><span class="sub">${m.turns}턴</span></td>` +
        `<td><button class="ghost lg-watch" data-i="${i}" style="padding:3px 9px;font-size:11px">관전</button></td></tr>`
      );
    })
    .join('');

  $('lg-matches').innerHTML =
    `<div style="font-weight:800;margin:8px 0 4px">${esc(t.name)} <span class="sub" style="font-weight:400">우승상금 ${t.prize.champion.money} · 평판 +${t.prize.champion.reputation}</span></div>` +
    '<table><tr><th>라운드</th><th>대진</th><th>길이</th><th></th></tr>' + rows + '</table>';

  $('lg-matches').querySelectorAll('.lg-watch').forEach((btn) => {
    btn.onclick = () => watchMatch(t, Number(btn.dataset.i));
  });
}

/* ---------------- 관전 ---------------- */
async function watchMatch(tournament, index) {
  if (replaying) return;
  replaying = true;
  const m = tournament.matches[index];
  const a = findTrainer(league, m.aId);
  const b = findTrainer(league, m.bId);

  /* 저장해둔 시드로 같은 배틀을 그대로 다시 돌린다 — 로그를 들고 있을 필요가 없다 */
  const replay = runMatch(league, m.aId, m.bId, m.seed, { collectLog: true });

  document.querySelector('.tab[data-tab="sim"]').click();
  resetScene();
  say(`${tournament.name} ${m.roundLabel} — ${a.name} vs ${b.name}`);
  await playBattleLog(replay.log, { p1: a.name, p2: b.name }, Number($('speed').value));
  const w = findTrainer(league, replay.winnerId);
  say(`▶ ${w ? w.name : '무승부'} 승리! (${replay.turns}턴)`);
  replaying = false;
}

/* ---------------- 시즌 진행 ---------------- */
function renderNews() {
  const items = league.newsFeed.slice(0, 8);
  $('lg-news').innerHTML = items.length
    ? items.map((n) => `<div><span class="sub">${n.week}주차</span> ${esc(n.text)}</div>`).join('')
    : '<div class="note">아직 소식이 없습니다.</div>';
}

function renderAll() {
  renderStandings();
  renderRoster();
  renderTournaments();
  renderNews();
}

async function nextWeek(weeks = 1) {
  const btns = [$('lg-next'), $('lg-season'), $('lg-reset')];
  btns.forEach((b) => (b.disabled = true));
  for (let i = 0; i < weeks; i++) {
    advanceWeek(league);
    $('lg-status').textContent = `${league.week}주차 진행 중...`;
    renderAll();
    await new Promise((r) => setTimeout(r, 0)); // 화면 갱신 틈을 준다
  }
  $('lg-status').textContent = `${league.week}주차까지 진행됨`;
  btns.forEach((b) => (b.disabled = false));
}

function resetLeague() {
  league = createLeague({ seed: Date.now() & 0x7fffffff });
  selectedAgencyId = league.agencies.find((a) => a.isPlayer)?.id || league.agencies[0].id;
  selectedTournamentId = null;
  $('lg-status').textContent = '새 리그 생성됨 (0주차)';
  $('lg-matches').innerHTML = '';
  renderAll();
}

export function initLeagueView() {
  league = createLeague({ seed: 20260904 });
  selectedAgencyId = league.agencies.find((a) => a.isPlayer)?.id || league.agencies[0].id;

  $('lg-next').onclick = () => nextWeek(1);
  $('lg-season').onclick = () => nextWeek(LEAGUE_CONFIG.seasonWeeks);
  $('lg-reset').onclick = resetLeague;

  $('lg-tiers').innerHTML = LOCAL_TOURNAMENT_TIERS.map(
    (t) => `${t.label}(레이팅 ${t.ratingBand[0]}~${t.ratingBand[1] === 999 ? '∞' : t.ratingBand[1]})`
  ).join(' · ');

  $('lg-status').textContent = `${league.agencies.length}개 소속사 · 트레이너 ${allTrainers(league).length}명 · 0주차`;
  renderAll();
}
