/**
 * 지역 리그 화면 — 현 직위, 우리 선수의 도전 자격·리그 선택, 대진표(시리즈 스코어), 결과 (docs/competition-v1.md §9·§21)
 */
import { leagueSeason, leagueDay, leagueRegionOf, challengerEligible, ensureLeagues } from '../engine/regional-league.js';
import { competitionTrainer } from '../engine/international.js';
import { regionalRanking } from '../engine/regional-ranking.js';
import { LEAGUE, POSITION, DOMESTIC_REGIONS, INTERNATIONAL_REGIONS, regionName, isDomestic, dayInSeason } from '../data/international.js';
import { GYMS } from '../data/gyms.js';
import { escapeHtml as esc, gameDate } from './management-widgets.js';
import { seriesLine } from './international.js';

const STAGES = [['quarter', '8강', '3판 2선'], ['semi', '4강', '3판 2선'], ['decider', '도전자 결정전', '3판 2선'], ['final', '챔피언전', '5판 3선'], ['third', '3·4위전 (PWC 시드 결정전)', '3판 2선']];
const nameOf = (game, id) => esc(competitionTrainer(game, id)?.name || '—');

/** 관전 버튼이 찾을 수 있는 모든 대회 (국내 컵 · PWT · PWC · 지역 리그) */
export function watchableEvents(game) {
  const leagues = (game.regionalLeague?.seasons || []).flatMap(s => Object.values(s.regions || {}));
  return [...(game.competitions?.events || []), ...(game.international?.seasons || []), ...(game.international?.pwc || []), ...leagues];
}

function positions(game) {
  const regions = game.international?.regions || [];
  return DOMESTIC_REGIONS.map(id => {
    const r = regions.find(x => x.id === id);
    if (!r) return `<p><b>${regionName(id)}</b> · 첫 국제 대회 때 공식 인물이 정해집니다.</p>`;
    return `<div class="league-pos"><b>${r.name} 리그</b><span>챔피언 ${nameOf(game, r.championId)}</span>${r.eliteIds.map((e, i) => `<span>사천왕 ${i + 1}번석 ${e === r.championId ? '<i class="muted">챔피언 등극 · 다음 시즌 정리</i>' : nameOf(game, e)}</span>`).join('')}</div>`;
  }).join('');
}

/** 우리 프로의 도전 자격 — 시즌 순위·배지·리그 선택 */
function ourChallengers(game, s) {
  const roster = game.league.agencies.find(a => a.id === game.playerAgencyId).roster.filter(t => !t.isYouth);
  if (!roster.length) return '<p class="muted">등록 프로가 없습니다. 유스를 콜업하면 도전할 수 있습니다.</p>';
  const ranking = regionalRanking(game), open = s.status === 'scheduled' && dayInSeason(game.day) <= LEAGUE.snapshotDay;
  return roster.map(t => {
    const rank = ranking.findIndex(r => r.id === t.id), both = DOMESTIC_REGIONS.filter(r => GYMS.filter(g => g.region === r).every(g => (t.badges || []).includes(g.id)));
    const region = leagueRegionOf(t), ok = challengerEligible(t) && region && rank >= 0;
    const choice = both.length === 2 && open ? `<select data-league-choice="${t.id}">${DOMESTIC_REGIONS.map(r => `<option value="${r}" ${region === r ? 'selected' : ''}>${regionName(r)} 리그</option>`).join('')}</select>` : '';
    const why = !region ? '한 지방 배지 8개 필요' : rank < 0 ? '시즌 순위 없음 (공식전 출전 필요)' : !challengerEligible(t) ? '도전 자격 없음' : `${regionName(region)} 리그 · 시즌 순위 ${rank + 1}위`;
    return `<div class="assignment"><span>${esc(t.name)} · ${why}</span>${choice}<small class="muted">${ok ? '같은 리그 자격자 중 상위 4명이 도전' : ''}</small></div>`;
  }).join('');
}

function bracket(game, R) {
  const name = id => nameOf(game, id);
  const rows = STAGES.map(([st, label, fmt]) => {
    const list = [R.rounds[st]].flat().filter(Boolean);
    const series = R.series.filter(x => x.stage === label);
    const day = leagueDay(st, R.region);
    if (!list.length) return `<section><h5>${label} <small>${fmt} · ${day}일차</small></h5><p class="muted">대기</p></section>`;
    return `<section><h5>${label} <small>${fmt}</small></h5>${list.map(x => x.bye ? `<div class="series-row"><b class="win">${name(x.winnerId)}</b> 부전승</div>` : '').join('')}${series.map(x => seriesLine(R, x, name)).join('')}</section>`;
  }).join('');
  const res = R.results ? `<p><b>PWC 시드</b> ${R.pwcSeeds.map((id, i) => `${i + 1}. ${name(id)}`).join(' · ')}</p><p><b>다음 시즌 사천왕</b> ${R.nextSeats.map((id, i) => `${i + 1}번석 ${name(id)}`).join(' · ')}</p>` : '';
  return `<div class="ko-rounds league-bracket">${rows}</div>${res}`;
}

export function renderRegionalLeague(game) {
  const s = leagueSeason(game), year = s.season, offset = (year - 1) * 365;
  const head = `<p>도전자 확정 ${gameDate(offset + LEAGUE.snapshotDay)} → 8강 ${gameDate(offset + LEAGUE.days.quarter.kanto)} → 챔피언전 ${gameDate(offset + LEAGUE.days.final.kanto)} → 3·4위전 ${gameDate(offset + LEAGUE.days.third.kanto)} (성도는 하루 뒤)</p>
  <p class="muted">해당 지방 배지 8개를 가진 등록 프로 중 시즌 순위 상위 4명이 사천왕에게 도전합니다. 챔피언은 챔피언전에만 나옵니다. 사천왕·챔피언이 되면 소속사를 떠나 리그 소속이 되고, 원 소속사는 보상금(사천왕 ${POSITION.compensation['elite-four'].toLocaleString()} · 챔피언 ${POSITION.compensation.champion.toLocaleString()})을 받습니다. 직위에서 내려오면 원 소속사가 스토브리그(${POSITION.rightOfFirstRefusalUntil}일차)까지 우선 협상권을 가집니다. 사천왕·챔피언은 시티컵에 못 나가고 로컬컵·타입컵에는 나갑니다.</p>`;
  let body = '';
  if (s.status === 'not-held') body = '<p class="muted">2026 시즌은 프로가 없어 지역 리그가 열리지 않습니다. 첫 지역 리그는 2027 시즌입니다.</p>';
  else if (s.status === 'missed') body = '<p class="muted">이번 시즌 도전자 확정일이 지나 다음 시즌부터 열립니다.</p>';
  else if (s.status === 'scheduled') body = `<h4>우리 프로의 도전 자격</h4>${ourChallengers(game, s)}`;
  else {
    body = DOMESTIC_REGIONS.map(r => { const R = s.regions[r]; return R ? `<details class="card" open><summary><b>${esc(R.name)}</b> · 도전자 ${R.challengers.map(id => nameOf(game, id)).join(', ') || '없음'}</summary>${bracket(game, R)}</details>` : ''; }).join('');
    const others = INTERNATIONAL_REGIONS.filter(r => !isDomestic(r.id)).map(r => { const R = s.regions[r.id]; return R?.results ? `<p>${r.name} · 챔피언 ${nameOf(game, R.results.champion)} · PWC ${R.pwcSeeds.map(id => nameOf(game, id)).join(', ')}</p>` : `<p>${r.name} · 진행 중</p>`; }).join('');
    body += `<details><summary>다른 지방 리그</summary>${others}</details>`;
  }
  const past = ensureLeagues(game).seasons.filter(x => x.season < year && x.status === 'running');
  return `<section class="card"><h3>지역 리그 · 사천왕 · 챔피언</h3>${positions(game)}${head}${body}${past.length ? `<details><summary>지난 지역 리그</summary>${past.reverse().map(p => DOMESTIC_REGIONS.map(r => p.regions[r] ? `<h5>${esc(p.regions[r].name)}</h5>${bracket(game, p.regions[r])}` : '').join('')).join('')}</details>` : ''}</section>`;
}
export function wireRegionalLeague(root, game, refresh) {
  root.querySelectorAll('[data-league-choice]').forEach(sel => sel.onchange = () => {
    const t = game.league.agencies.find(a => a.id === game.playerAgencyId).roster.find(x => x.id === sel.dataset.leagueChoice);
    if (t && DOMESTIC_REGIONS.includes(sel.value)) { t.leagueChoice = sel.value; refresh(); }
  });
}
