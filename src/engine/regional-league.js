/**
 * 지역 리그 (사천왕·챔피언) — docs/competition-v1.md §9, §21.3
 *
 *   8강(사천왕 4 vs 도전자 4, 3판 2선) → 4강 → 도전자 결정전 → 챔피언전(5판 3선, 챔피언은 여기만)
 *   4강 패자끼리 3·4위전 = PWC 시드 결정전
 *
 * 결과는 이번 시즌 PWC 지방 시드 1~4와 다음 시즌 직위를 정한다.
 * 직위 = 지역 리그 소속: 소속사 선수가 사천왕·챔피언이 되면 소속사를 떠나고 원 소속사는 보상금을 받는다.
 * 직위에서 내려오면 원 소속사가 스토브리그 동안 우선 협상권을 가진다.
 * 관동·성도는 전체 배틀·로그를 남기고, 나머지 7개 지방은 배틀만 돌린다(로그 없음).
 */
import { LEAGUE, POSITION, INTERNATIONAL_REGIONS, DOMESTIC_REGIONS, dayInSeason, seasonOf, regionName, isDomestic } from '../data/international.js';
import { GYMS } from '../data/gyms.js';
import { ensureOfficials, ensureInternational, competitionTrainer, snapshotEntry, playSeries, payCompetitionPrize, pruneOldLogs } from './international.js';
import { regionalRanking } from './regional-ranking.js';
import { isRegisteredPro, ensureSeats } from './career.js';
import { makeTrainerFor } from './league.js';

const POSITIONS = ['champion', 'elite-four', 'gym-leader'];
/** 이 시즌에 지역 리그가 열리나 — 개혁 모드 첫 시즌(유스 전용)은 프로가 없어 열리지 않는다 */
export const leagueHeld = (game, year = seasonOf(game.day)) => !(game.reform && year === 1);
/** 그 지방의 리그 날짜 — 관동·성도는 하루씩 어긋나고 나머지는 관동 날짜 */
export const leagueDay = (stage, region) => LEAGUE.days[stage][region] ?? LEAGUE.days[stage].kanto;

export function ensureLeagues(game) {
  game.regionalLeague ??= { version: 1, seasons: [] };
  return game.regionalLeague;
}
export function leagueSeason(game, year = seasonOf(game.day)) {
  const state = ensureLeagues(game);
  let s = state.seasons.find(x => x.season === year);
  if (!s) {
    const snapshot = (year - 1) * 365 + LEAGUE.snapshotDay;
    s = { season: year, status: !leagueHeld(game, year) ? 'not-held' : game.day > snapshot ? 'missed' : 'scheduled', regions: {}, appliedNextSeason: false };
    state.seasons.push(s);
  }
  return s;
}

/* ---------------- 도전자 선발 (279일 하루 끝, §9.3) ---------------- */

const fullBadges = (t, region) => GYMS.filter(g => g.region === region).every(g => (t.badges || []).includes(g.id));
/** 관동·성도 양쪽 자격자는 한 리그만 — 플레이어가 고른 곳, 아니면 8배지를 먼저 채운 지방, 기록 없으면 관동 */
export function leagueRegionOf(t) {
  const both = DOMESTIC_REGIONS.filter(r => fullBadges(t, r));
  if (both.length < 2) return both[0] || null;
  if (both.includes(t.leagueChoice)) return t.leagueChoice;
  const k = t.regionDone?.kanto, j = t.regionDone?.johto;
  return j != null && (k == null || j < k) ? 'johto' : 'kanto';
}
export function challengerEligible(t) {
  return isRegisteredPro(t) && !POSITIONS.includes(t.regionalRole) && t.regionalRole !== 'challenger' && (LEAGUE.allowGymLeaders || t.regionalRole !== 'gym-leader');
}

function domesticChallengers(game) {
  const ranking = regionalRanking(game);
  const pool = [...game.league.agencies.flatMap(a => a.roster), ...(game.personnel?.freeAgents || [])];
  const byId = new Map(pool.map(t => [t.id, t]));
  const out = { kanto: [], johto: [] };
  for (const row of ranking) {
    const t = byId.get(row.id);
    if (!t || !challengerEligible(t)) continue;
    const region = leagueRegionOf(t);
    if (region && out[region].length < LEAGUE.challengers) out[region].push(t.id);
  }
  return out;
}

/** 다른 7개 지방 도전자 — 매 시즌 생성 대표 [임시] */
async function generatedChallengers(game, region, year) {
  const [lo, hi] = LEAGUE.otherRegionStatRange;
  const ids = [];
  for (let i = 0; i < LEAGUE.challengers; i++) {
    const t = await makeTrainerFor({ id: `officials-${region.id}`, statRange: [lo, hi], rosterProfile: 'elite' }, `league-${year}-${region.id}-${i}`, game.rng,
      { name: `${region.name} 도전자 ${i + 1}` });
    Object.assign(t, { region: region.id, agencyId: `officials-${region.id}`, regionalRole: 'challenger', isYouth: false, legacyPro: true, generated: true });
    game.international.officials.push(t);
    ids.push(t.id);
  }
  return ids;
}

async function selectChallengers(game, s) {
  await ensureOfficials(game);
  const domestic = domesticChallengers(game);
  for (const region of game.international.regions) {
    const id = `league-${s.season}-${region.id}`;
    const challengers = DOMESTIC_REGIONS.includes(region.id) ? domestic[region.id] : await generatedChallengers(game, region, s.season);
    s.regions[region.id] = { id, name: `제${s.season}시즌 ${region.name} 리그`, region: region.id, status: 'running',
      challengers, seats: [...region.eliteIds], championId: region.championId, entrants: [], matches: [], series: [], rounds: {},
      viewed: [], watchMode: game.leagueWatch || 'results', notes: [] };
    if (isDomestic(region.id)) {
      const n = challengers.map(id => competitionTrainer(game, id)?.name);
      game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: `${region.name} 리그 도전자 확정: ${n.length ? n.join(', ') : '없음 — 사천왕끼리 4강부터'}` });
    }
  }
  s.status = 'running';
}

/* ---------------- 경기 ---------------- */

function entrant(game, R, id) {
  let e = R.entrants.find(x => x.id === id);
  if (!e) {
    /* 처음 나서는 날의 6마리·기술·도구를 마지막 리그 경기까지 고정 (§9.4) */
    e = snapshotEntry(game, competitionTrainer(game, id), { level: LEAGUE.level, clauses: LEAGUE.clauses, region: R.region, cap: true });
    R.entrants.push(e);
  }
  return e;
}
async function duel(game, R, aId, bId, stage, onProgress) {
  if (!aId || !bId) return { winnerId: aId || bId, loserId: null, bye: true };
  const a = entrant(game, R, aId), b = entrant(game, R, bId);
  /* 저장 용량: 지금 우리 소속 선수 경기와 관동·성도 챔피언전만 로그를 남긴다 */
  const mine = x => x.agencyId === game.playerAgencyId;
  const keep = mine(a) || mine(b) || (stage === 'final' && isDomestic(R.region));
  const w = await playSeries(game, R, a, b, LEAGUE.format[stage], STAGE_KO[stage], R.region, onProgress, keep);
  const loserId = w.id === a.id ? b.id : a.id;
  if (isDomestic(R.region)) {
    const sr = R.series.at(-1);
    game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: `${regionName(R.region)} 리그 ${STAGE_KO[stage]} · ${w.name} ${Math.max(sr.winsA, sr.winsB)}:${Math.min(sr.winsA, sr.winsB)} ${competitionTrainer(game, loserId)?.name || ''}` });
  }
  return { winnerId: w.id, loserId };
}
const STAGE_KO = { quarter: '8강', semi: '4강', decider: '도전자 결정전', final: '챔피언전', third: '3·4위전 (PWC 시드 결정전)' };

async function playStage(game, R, stage, onProgress) {
  const r = R.rounds;
  if (stage === 'quarter') {
    const [s1, s2, s3, s4] = R.seats, c = R.challengers;
    /* 위쪽: 1번석 vs 도전자 4위, 4번석 vs 도전자 1위 / 아래쪽: 2번석 vs 3위, 3번석 vs 2위 */
    r.quarter = [];
    for (const [a, b] of [[s1, c[3]], [s4, c[0]], [s2, c[2]], [s3, c[1]]]) r.quarter.push(await duel(game, R, a, b, 'quarter', onProgress));
  } else if (stage === 'semi') {
    const q = r.quarter;
    r.semi = [await duel(game, R, q[0].winnerId, q[1].winnerId, 'semi', onProgress), await duel(game, R, q[2].winnerId, q[3].winnerId, 'semi', onProgress)];
  } else if (stage === 'decider') {
    r.decider = await duel(game, R, r.semi[0].winnerId, r.semi[1].winnerId, 'decider', onProgress);
  } else if (stage === 'final') {
    r.final = await duel(game, R, r.decider.winnerId, R.championId, 'final', onProgress);
    crownChampion(game, R);
  } else if (stage === 'third') {
    r.third = await duel(game, R, r.semi[0].loserId, r.semi[1].loserId, 'third', onProgress);
    settle(game, R);
  }
}

/* ---------------- 결과 → 직위·시드·상금 ---------------- */

/** 소속사 선수가 리그 소속이 된다 — 원 소속사는 보상금 (§21.3) */
export function joinLeague(game, t, region, role) {
  const agency = game.league.agencies.find(a => a.roster.includes(t));
  const officials = ensureInternational(game).officials;
  if (agency) {
    agency.roster = agency.roster.filter(x => x !== t);
    const pay = POSITION.compensation[role] || 0;
    agency.funds += pay;
    t.formerAgencyId = agency.id;
    delete t.proSeat; delete game.actions?.[t.id];
    ensureSeats(agency);
    game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: `${t.name}, ${regionName(region)} 리그 ${role === 'champion' ? '챔피언' : '사천왕'}으로 리그와 계약 · ${agency.name}에 보상금 ${pay.toLocaleString()}` });
  }
  if (game.personnel?.freeAgents?.includes(t)) game.personnel.freeAgents = game.personnel.freeAgents.filter(x => x !== t);
  if (!officials.includes(t)) officials.push(t);
  Object.assign(t, { region, agencyId: `officials-${region}`, regionalRole: role, freeAgent: false });
  delete t.rofr;
}

/** 직위를 잃는다 — 원 소속사 우선 협상(스토브리그), 없으면 FA. 다른 7개 지방은 풀에서 빠진다 */
export function leaveLeague(game, t, region) {
  const state = ensureInternational(game);
  state.officials = state.officials.filter(x => x !== t);
  delete t.regionalRole;
  if (!isDomestic(region)) return;
  game.personnel ??= { version: 1, freeAgents: [], history: [], notices: [] };
  Object.assign(t, { agencyId: null, freeAgent: true });
  const former = game.league.agencies.find(a => a.id === t.formerAgencyId);
  if (former && former.id !== game.playerAgencyId) {
    /* NPC 원 소속사는 바로 재계약한다 (프로 자리가 있으면) */
    const pros = former.roster.filter(isRegisteredPro).length;
    if (pros < 3) {
      former.roster.push(t); t.agencyId = former.id; t.freeAgent = false; ensureSeats(former);
      game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: `${t.name}, 사천왕에서 물러나 원 소속사 ${former.name}로 돌아갔다` });
      return;
    }
  }
  if (former) t.rofr = { agencyId: former.id, until: (seasonOf(game.day) - 1) * 365 + POSITION.rightOfFirstRefusalUntil };
  game.personnel.freeAgents.push(t);
  game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: former?.id === game.playerAgencyId
    ? `${t.name}, 사천왕 자리에서 물러났습니다. 스토브리그(${POSITION.rightOfFirstRefusalUntil}일차)까지 우리 소속사가 우선 협상권을 가집니다.`
    : `${t.name}, 사천왕 자리에서 물러나 FA 시장에 나왔다` });
}

/** 챔피언 타이틀은 챔피언전 당일 바로 넘어간다 (§9.6) */
function crownChampion(game, R) {
  const region = game.international.regions.find(r => r.id === R.region);
  const winner = competitionTrainer(game, R.rounds.final.winnerId), old = competitionTrainer(game, R.championId);
  const defended = winner === old;
  R.defended = defended;
  if (!defended) {
    if (old) old.regionalRole = 'elite-four';   // 전 챔피언은 다음 시즌 사천왕 1번석 (그때까지 직위는 유지)
    joinLeague(game, winner, R.region, 'champion');
    region.championId = winner.id;
  }
  if (isDomestic(R.region)) game.league.newsFeed.unshift({ day: game.day, kind: 'league', text: defended ? `${winner.name}, ${regionName(R.region)} 챔피언 방어 성공` : `${winner.name}, ${regionName(R.region)} 챔피언 등극!` });
}

function settle(game, R) {
  const r = R.rounds;
  const finalLoser = r.final.loserId, deciderLoser = r.decider.loserId;
  R.results = { champion: r.final.winnerId, runner: finalLoser, decider: deciderLoser, thirdWin: r.third.winnerId, thirdLose: r.third.loserId,
    quarter: r.quarter.map(x => x.loserId).filter(Boolean) };
  /* 이번 시즌 PWC 시드 (§9.5) */
  R.pwcSeeds = [R.results.champion, finalLoser, deciderLoser, R.results.thirdWin];
  /* 다음 시즌 사천왕 석 (§9.6) */
  R.nextSeats = [finalLoser, deciderLoser, R.results.thirdWin, R.results.thirdLose];
  R.status = 'completed';
  /* 저장 용량: 다른 7개 지방은 결과만 남기고 출전 스냅샷은 이름만 */
  if (!isDomestic(R.region)) R.entrants = R.entrants.map(e => ({ id: e.id, name: e.name, region: e.region, agencyName: e.agencyName, light: true }));
  const P = LEAGUE.payout, pay = (id, [prize, rep], extra = 0) => { const t = competitionTrainer(game, id); if (t) payCompetitionPrize(game, { id, agencyId: t.agencyId }, prize, rep + extra); };
  pay(R.results.champion, P.champion, R.defended ? P.defendBonusRep : 0);
  pay(finalLoser, P.runner); pay(deciderLoser, P.decider); pay(R.results.thirdWin, P.thirdWin); pay(R.results.thirdLose, P.thirdLose);
  for (const id of R.results.quarter) pay(id, P.quarter);
  if (isDomestic(R.region)) game.league.newsFeed.unshift({ day: game.day, kind: 'league',
    text: `PWC ${regionName(R.region)} 대표: ${R.pwcSeeds.map(id => competitionTrainer(game, id)?.name).join(', ')}` });
}

/** 다음 시즌 1일차: 사천왕 석 변경 · 직위 상실 · FA 전환 (§9.6) */
function applyNextSeason(game, prev) {
  for (const R of Object.values(prev.regions)) {
    if (R.status !== 'completed') continue;
    const region = game.international.regions.find(r => r.id === R.region);
    const keep = new Set([...R.nextSeats, region.championId]);
    for (const id of region.eliteIds) if (!keep.has(id)) { const t = competitionTrainer(game, id); if (t) leaveLeague(game, t, R.region); }
    for (const id of R.nextSeats) {
      const t = competitionTrainer(game, id);
      if (t && t.regionalRole !== 'elite-four') joinLeague(game, t, R.region, 'elite-four');
      else if (t) t.regionalRole = 'elite-four';
    }
    region.eliteIds = [...R.nextSeats];
  }
  /* 직위를 못 얻은 생성 도전자는 정리한다 */
  const state = ensureInternational(game);
  state.officials = state.officials.filter(t => t.regionalRole !== 'challenger');
  prev.appliedNextSeason = true;
}

/** PWC 등록일에 쓰는 지방별 시드 — 9개 지방 리그가 다 끝났을 때만 */
export function leagueSeedsFor(game, year) {
  const s = ensureLeagues(game).seasons.find(x => x.season === year);
  if (!s || s.status !== 'running') return null;
  const out = {};
  for (const r of INTERNATIONAL_REGIONS) { const R = s.regions[r.id]; if (R?.status !== 'completed') return null; out[r.id] = R.pwcSeeds; }
  return out;
}

/** 오늘 지역 리그 경기가 있는 소속사 선수 (그날은 다른 활동을 못 한다) */
export function leagueParticipantsToday(game) {
  const out = new Set(), d = dayInSeason(game.day);
  const s = ensureLeagues(game).seasons.find(x => x.season === seasonOf(game.day));
  if (s?.status !== 'running') return out;
  for (const R of Object.values(s.regions)) {
    if (!isDomestic(R.region)) continue;
    const today = ['quarter', 'semi', 'decider', 'final', 'third'].some(st => leagueDay(st, R.region) === d && !R.rounds[st]);
    if (!today) continue;
    const out1 = new Set(Object.values(R.rounds).flat().map(x => x?.loserId).filter(Boolean));
    for (const id of [...R.challengers, ...R.seats, R.championId]) if (!out1.has(id)) out.add(id);
  }
  return out;
}

/* ---------------- 하루 진행 ---------------- */

export async function tickRegionalLeague(game, onProgress = async () => {}) {
  pruneOldLogs(game);   // 매일: 오래된 경기 로그 정리 (결과는 유지)
  const year = seasonOf(game.day), d = dayInSeason(game.day);
  /* 1일차: 지난 시즌 결과로 직위 반영 */
  if (d === 1) {
    const prev = ensureLeagues(game).seasons.find(x => x.season === year - 1);
    if (prev?.status === 'running' && !prev.appliedNextSeason) { await ensureOfficials(game); applyNextSeason(game, prev); }
  }
  const s = leagueSeason(game, year);
  if (['not-held', 'missed'].includes(s.status)) return null;
  if (d === LEAGUE.snapshotDay && s.status === 'scheduled') { await selectChallengers(game, s); return '지역 리그 도전자 확정'; }
  if (s.status !== 'running') return null;
  const done = [];
  for (const R of Object.values(s.regions)) {
    for (const stage of ['quarter', 'semi', 'decider', 'final', 'third']) {
      if (leagueDay(stage, R.region) !== d || R.rounds[stage]) continue;
      await playStage(game, R, stage, onProgress);
      if (isDomestic(R.region)) done.push(`${regionName(R.region)} 리그 ${STAGE_KO[stage]}`);
    }
  }
  return done.length ? done.join(' · ') : null;
}
