/**
 * PWT · PWC 화면 — 개최지, 지방별 시드, 플레이인, 스위스, 녹아웃(시리즈 스코어) (docs/competition-v1.md §8·§11)
 */
import { internationalSeason, pwcSeason } from '../engine/international.js';
import { PWT, PWC, INTERNATIONAL_REGIONS, pwtBreak, regionName, isDomestic } from '../data/international.js';
import { escapeHtml as esc, gameDate } from './management-widgets.js';

const SEED_KO = ['1시드', '2시드', '3시드', '4시드'];
const KO_STAGES = ['16강', '8강', '4강', '결승'];

/** 시리즈 한 줄: 이름 2 : 1 이름 */
export function seriesLine(ev, x, name) {
  const cls = id => (x.winnerId === id ? 'win' : 'lose');
  /* 형식(3판 2선 등)은 라운드 제목에 적는다 — 줄에는 이름·점수만 */
  return `<div class="series-row"><b class="${cls(x.aId)}">${name(x.aId)}</b><span class="score">${x.winsA}:${x.winsB}</span><b class="${cls(x.bId)}">${name(x.bId)}</b></div>`;
}
function watchButtons(ev) {
  const logged = ev.matches.filter(m => m.log);
  if (!logged.length) return '<p class="muted">우리 소속 선수가 뛴 경기와 결승만 관전 기록이 남습니다. 나머지는 결과·대진만 남습니다.</p>';
  return logged.map(m => `<p>${gameDate(m.day)} · ${esc(m.stage)} · ${esc(m.trainerName)} vs ${esc(m.gymName)} <button class="ghost" data-cup-watch="${m.id}">${ev.viewed?.includes(m.id) ? '다시 관전' : '관전'}</button></p>`).join('');
}

function renderWorld(game, s, cfg) {
  const name = id => { const e = s.entrants.find(t => t.id === id); return e ? `${esc(e.name)}${isDomestic(e.region) ? '' : ` <small>${regionName(e.region)}</small>`}` : esc(id); };
  const title = s.kind === 'pwt' ? `${s.name}${s.host ? ` · 개최지 ${regionName(s.host)}` : ''}` : s.name;
  const statusText = { 'not-held': '개최하지 않는 시즌', missed: '지난 일정 · 다음 시즌부터', scheduled: '예정' }[s.status] || s.stage;
  let html = `<details class="card world-card" ${s.status !== 'completed' && s.status !== 'not-held' ? 'open' : ''}><summary><b>${esc(title)}</b> · ${esc(statusText)}${s.result ? ` · ${name(s.result.championId)} 우승` : ''}</summary>`;
  if (s.version !== 2) return html + `<p class="muted">예전 방식(8지역)으로 치른 대회입니다.</p>${s.result ? `<p>${name(s.result.championId)} 우승</p>` : ''}${watchButtons(s)}</details>`;
  for (const n of s.notes || []) html += `<p class="risk-note">${esc(n)}</p>`;
  /* 지방 대표 */
  if (s.seeds) html += `<h4>지방 대표</h4><div class="seed-table"><div class="seed-row head"><span>지방</span>${SEED_KO.map(x => `<span>${x}</span>`).join('')}</div>${INTERNATIONAL_REGIONS.map(r => `<div class="seed-row ${isDomestic(r.id) ? 'mine' : ''}"><span>${r.name}${s.playIn?.direct === r.id ? ' <small>직행</small>' : ''}</span>${(s.seeds[r.id] || []).map(id => `<span>${esc(s.entrants.find(t => t.id === id)?.name || id)}</span>`).join('')}</div>`).join('')}</div>`;
  /* 플레이인 */
  if (s.playIn) html += `<h4>플레이인 · ${s.kind === 'pwt' ? `개최지 ${regionName(s.playIn.direct)}` : `PWT 우승 지방 ${regionName(s.playIn.direct)}`} 4시드는 직행</h4>${s.playIn.groups.map(g => `<div class="playin-group"><b>${g.id}조</b> ${g.ids.map(name).join(' · ')}${s.series.filter(x => x.stage.startsWith(`플레이인 ${g.id}조`)).map(x => seriesLine(s, x, name)).join('')}${g.first ? `<p>통과: ${name(g.first)}${g.second ? `, ${name(g.second)}` : ''}</p>` : ''}</div>`).join('')}`;
  /* 스위스 */
  if (s.swissIds) {
    const rows = [...s.swissIds].sort((a, b) => s.swiss[b].wins - s.swiss[a].wins || s.swiss[a].losses - s.swiss[b].losses);
    html += `<details ${s.status === 'swiss' ? 'open' : ''}><summary>스위스 — 3승 진출 · 3패 탈락 (2승·2패가 걸린 경기는 3판 2선)</summary><div class="swiss-table">${rows.map(id => {
      const r = s.swiss[id], state = r.wins === 3 ? '진출' : r.losses === 3 ? '탈락' : '진행 중';
      return `<div class="swiss-row ${r.wins === 3 ? 'in' : r.losses === 3 ? 'out' : ''}"><span>${name(id)}</span><span>${SEED_KO[(s.seedOf[id] || 4) - 1]}</span><b>${r.wins}-${r.losses}</b><small>${state}</small></div>`;
    }).join('')}</div></details>`;
  }
  /* 녹아웃 */
  const ko = KO_STAGES.map(st => [st, s.series.filter(x => x.stage === st)]).filter(([, l]) => l.length);
  if (ko.length || s.status === 'knockout') html += `<h4>녹아웃 — ${s.kind === 'pwt' ? '전부 3판 2선' : '16강 3판 2선 · 8강부터 5판 3선'}</h4><div class="ko-rounds">${ko.map(([st, l]) => `<section><h5>${st}</h5>${l.map(x => seriesLine(s, x, name)).join('')}</section>`).join('')}</div>`;
  html += `<details><summary>관전 기록</summary>${watchButtons(s)}</details></details>`;
  return html;
}

export function renderInternational(game) {
  const pwt = internationalSeason(game), pwc = pwcSeason(game), offset = (pwt.season - 1) * 365;
  const roster = game.league.agencies.find(a => a.id === game.playerAgencyId).roster;
  const past = [...game.international.seasons].filter(s => s !== pwt).reverse();
  const pastPwc = [...(game.international.pwc || [])].filter(s => s !== pwc).reverse();
  return `<section class="card"><h3>국제 대회 · PWT · PWC</h3>
  <p>PWT: 관장 예선 ${gameDate(offset + PWT.gymDay)} → 지방 최종전 ${gameDate(offset + PWT.finalQualifierDay)} → 플레이인 ${gameDate(offset + PWT.playInDays[0])} → 스위스 ${gameDate(offset + PWT.swissDays[0])} → 결승 ${gameDate(offset + PWT.knockoutDays.at(-1))}</p>
  <p>PWC: 지역 리그 결과로 지방 시드 1~4 → 등록 ${gameDate(offset + PWC.registrationDay)} → 플레이인 ${gameDate(offset + PWC.playInDays[0])} → 결승 ${gameDate(offset + PWC.knockoutDays.at(-1)[0])}</p>
  <p class="muted">9개 지방(관동·성도 따로)마다 챔피언 1시드, 지방 최종전 A조·B조 1위가 2·3시드, 최종 진출전 승자가 4시드입니다. 4시드 8명은 플레이인(GSL)을 거칩니다. 국제 경기는 레벨 ${PWT.level}로 맞추고 같은 포켓몬·같은 도구는 1개씩입니다. PWT 우승자는 PWC 출전이 보장됩니다.</p>
  <p>${pwtBreak(game) ? 'PWT 기간: 공식 체육관 도전 휴회.' : '공식 체육관은 PWT 기간(130~159일)에 휴회합니다.'}</p>
  <label>우리 경기 진행<select id="pwt-watch-mode"><option value="results" ${pwt.watchMode === 'results' ? 'selected' : ''}>결과만 보기</option><option value="watch" ${pwt.watchMode === 'watch' ? 'selected' : ''}>우리 경기 자동 관전</option></select></label>
  ${pwtBreak(game) ? `<h4>유스 경기 분석 견학</h4>${roster.filter(t => t.isYouth && !t.camp).map(t => `<p>${esc(t.name)} <button data-pwt-study="${t.id}">${game.actions[t.id] === 'pwt-study' ? '✓ 오늘 견학 배정됨' : '오늘 경기 분석 견학 배정'}</button></p>`).join('') || '<p>견학 가능한 유스가 없습니다.</p>'}` : ''}
  ${renderWorld(game, pwt, PWT)}${renderWorld(game, pwc, PWC)}
  ${past.length || pastPwc.length ? `<details><summary>지난 국제 대회</summary>${[...past.map(s => renderWorld(game, s, PWT)), ...pastPwc.map(s => renderWorld(game, s, PWC))].join('')}</details>` : ''}</section>`;
}
export function wireInternational(root, game, refresh) {
  const mode = root.querySelector('#pwt-watch-mode');
  if (mode) mode.onchange = () => { const v = mode.value === 'watch' ? 'watch' : 'results'; internationalSeason(game).watchMode = v; pwcSeason(game).watchMode = v; refresh(); };
  root.querySelectorAll('[data-pwt-study]').forEach(b => b.onclick = () => {
    const t = game.league.agencies.find(a => a.id === game.playerAgencyId).roster.find(t => t.id === b.dataset.pwtStudy);
    if (pwtBreak(game) && t?.isYouth && !t.camp) { game.actions[t.id] = 'pwt-study'; refresh(); }
  });
}
