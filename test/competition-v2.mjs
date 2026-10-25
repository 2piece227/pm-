/**
 * 대회 체계 개편 v1 검증 — docs/competition-v1.md §17
 * 규칙 검증은 배틀 대신 결과만 정하는 빠른 모드(battleHooks.quick)로 여러 시드를 돌리고,
 * 실제 배틀 경로·저장 복원·예전 저장 마이그레이션은 따로 확인한다.
 *   node test/competition-v2.mjs [시드 수]
 */
import assert from 'node:assert/strict';
import { createGame, playerAgency } from '../src/engine/game.js';
import * as I from '../src/engine/international.js';
import * as L from '../src/engine/regional-league.js';
import { PWT, PWC, LEAGUE, POSITION, INTERNATIONAL_REGIONS } from '../src/data/international.js';
import { GYMS } from '../src/data/gyms.js';
import { ensureSeason } from '../src/engine/season.js';
import { makeRng } from '../src/engine/run-battle.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { negotiatePersonnel } from '../src/engine/personnel.js';
import { createSeries, runSeries, counterLead } from '../src/engine/series.js';

const SEEDS = Number(process.argv[2] || 24);
const quick = (a, b, seed) => ({ winner: makeRng(seed)() < 0.5 ? 'p1' : 'p2', log: [], turns: 1 });
const kanto = GYMS.filter(x => x.region === 'kanto').map(x => x.id), johto = GYMS.filter(x => x.region === 'johto').map(x => x.id);
const regionIds = INTERNATIONAL_REGIONS.map(r => r.id);

/** 국내 프로들에게 배지·순위를 만들어 지역 리그 도전자가 나오게 한다 */
function seedRanking(g, pattern = i => (i % 3 === 0 ? [...kanto, ...johto] : i % 3 === 1 ? [...kanto] : [...johto])) {
  const pros = g.league.agencies.flatMap(a => a.roster).filter(t => !t.isYouth);
  pros.forEach((t, i) => { t.badges = pattern(i); });
  const ent = pros.map(t => ({ id: t.id, name: t.name, agencyName: 'x', definition: { isYouth: false, badges: t.badges } }));
  const matches = [];
  for (let i = 0; i + 1 < ent.length; i += 2) matches.push({ aId: ent[i].id, bId: ent[i + 1].id, winnerId: ent[i].id, round: 1, draw: false });
  ensureSeason(g).events.push({ id: `fake-city-${g.day}`, kind: 'city', season: Math.floor((g.day - 1) / 365) + 1, date: g.day, status: 'completed', ranking: true, rankingWeight: 1,
    entrants: ent, matches, result: { championId: ent[0]?.id, runnerId: ent[1]?.id } });
  return pros;
}
const dayList = year => {
  const o = (year - 1) * 365;
  const d = [PWT.gymDay, PWT.finalQualifierDay, ...PWT.playInDays, ...PWT.swissDays, ...PWT.knockoutDays, LEAGUE.snapshotDay,
    ...Object.values(LEAGUE.days).flatMap(x => [x.kanto, x.johto]), PWC.registrationDay, ...PWC.playInDays, ...PWC.swissDays, ...PWC.knockoutDays.flat()];
  return [...new Set(d)].sort((a, b) => a - b).map(x => o + x);
};
async function runYear(g, year) {
  g.day = (year - 1) * 365 + 1; await L.tickRegionalLeague(g);
  for (const day of dayList(year)) { g.day = day; await I.tickInternational(g); await L.tickRegionalLeague(g); await I.tickPwc(g, L.leagueSeedsFor); }
}

/* ---------------- 1. 규칙 검증: 여러 시드 × 2시즌 ---------------- */
I.battleHooks.quick = quick;
let checked = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = await createGame({ seed: 9000 + seed, agencyChoiceId: 'player-major', careerStart: true });
  g.opening.tutorialContractNeeded = false;
  for (const year of [1, 2]) {
    g.day = (year - 1) * 365 + 2; seedRanking(g);
    await runYear(g, year);
    const s = I.internationalSeason(g), p = I.pwcSeason(g), ls = L.leagueSeason(g);
    /* PWT */
    assert.equal(s.status, 'completed');
    assert.equal(s.host, regionIds[(s.edition - 1) % 9], '개최지 순환');
    assert.equal(new Set(s.representatives).size, 36);
    for (const r of regionIds) assert.equal(s.seeds[r].length, 4);
    const fours = Object.entries(s.seeds).filter(([r]) => r !== s.host).map(([, x]) => x[3]).sort();
    assert.deepEqual(s.playIn.groups.flatMap(x => x.ids).sort(), fours, '플레이인 = 개최지 제외 4시드 8명');
    assert.equal(s.playIn.passed.length, 4);
    const swissIn = new Set([...Object.values(s.seeds).flatMap(x => x.slice(0, 3)), s.seeds[s.host][3], ...s.playIn.passed]);
    assert.deepEqual(new Set(s.swissIds), swissIn);
    for (const w of [s, p]) {
      const sw = w.series.filter(x => x.stage.startsWith('스위스'));
      assert.equal(sw.filter(x => x.format === 'bo1').length, 40); assert.equal(sw.filter(x => x.format === 'bo3').length, 26);
      const r1 = sw.filter(x => x.stage.startsWith('스위스 1라운드'));
      const E = id => w.entrants.find(t => t.id === id);
      assert(r1.every(x => E(x.aId).region !== E(x.bId).region), '1라운드 같은 지방 대결 없음');
      assert(r1.every(x => !(w.seedOf[x.aId] === 1 && w.seedOf[x.bId] === 1)), '1라운드 챔피언끼리 없음');
      const rec = id => `${w.swiss[id].wins}-${w.swiss[id].losses}`;
      assert.deepEqual(['3-0', '3-1', '3-2'].map(k => w.qualified.filter(id => rec(id) === k).length), [4, 6, 6]);
      const ko = w.series.filter(x => ['16강', '8강', '4강', '결승'].includes(x.stage));
      assert.equal(ko.length, 15);
      const want = w.kind === 'pwt' ? Array(15).fill('bo3') : [...Array(8).fill('bo3'), ...Array(7).fill('bo5')];
      assert.deepEqual(ko.map(x => x.format), want);
      for (const x of ko) { const need = x.format === 'bo3' ? 2 : 3; assert.equal(Math.max(x.winsA, x.winsB), need); assert(x.games.length <= need * 2 - 1); }
    }
    /* 지역 리그 */
    const domesticChallengers = ['kanto', 'johto'].flatMap(r => ls.regions[r].challengers);
    assert.equal(new Set(domesticChallengers).size, domesticChallengers.length, '관동·성도 동시 자격자는 한 리그만');
    for (const r of regionIds) {
      const R = ls.regions[r];
      assert.equal(R.status, 'completed');
      assert.equal(new Set([...R.nextSeats, R.results.champion]).size, 5, '다음 시즌 챔피언 1 + 사천왕 4');
      assert(R.series.every(x => x.format === (x.stage === '챔피언전' ? 'bo5' : 'bo3')));
    }
    /* PWC */
    assert.equal(p.status, 'completed');
    assert.equal(new Set(p.representatives).size, 36);
    assert(p.representatives.includes(s.result.championId), 'PWT 우승자는 PWC에 반드시 나간다');
    assert(!p.playIn.groups.flatMap(x => x.ids).includes(s.result.championId), 'PWT 우승자는 플레이인에 안 들어간다');
    const wRegion = s.entrants.find(t => t.id === s.result.championId).region;
    assert.equal(p.playIn.direct, wRegion);
    if (!ls.regions[wRegion].pwcSeeds.includes(s.result.championId)) assert.equal(p.seeds[wRegion][3], s.result.championId, '4시드 대체');
    const r1w = p.series.find(x => x.stage.startsWith('스위스 1라운드') && [x.aId, x.bId].includes(p.pwtWinnerId));
    if (r1w) { const o = r1w.aId === p.pwtWinnerId ? r1w.bId : r1w.aId; assert.equal(p.seedOf[o] || 4, 4, 'PWT 우승자 1라운드 상대는 4시드 등급'); }
    checked++;
  }
  /* 다음 시즌 1일차: 직위 반영 */
  g.day = 2 * 365 + 1; await L.tickRegionalLeague(g);
  for (const r of g.international.regions) {
    const roles = [r.championId, ...r.eliteIds];
    assert.equal(new Set(roles).size, 5);
    for (const id of roles) { const t = I.competitionTrainer(g, id); assert(t && g.international.officials.includes(t), '직위자는 리그 소속'); }
    for (const id of r.eliteIds) assert.equal(I.competitionTrainer(g, id).regionalRole, 'elite-four');
    assert.equal(I.competitionTrainer(g, r.championId).regionalRole, 'champion');
  }
  assert(!g.international.officials.some(t => t.regionalRole === 'challenger'), '직위를 못 얻은 생성 도전자는 정리');
  assert(!g.league.agencies.some(a => a.roster.some(t => ['champion', 'elite-four'].includes(t.regionalRole))), '사천왕·챔피언은 소속사에 없다');
}
console.log(`PASS 규칙: ${SEEDS}시드 × 2시즌 (${checked}회) — PWT·PWC 36명·시드·플레이인·스위스 40/26·녹아웃 형식, 지역 리그 5석, 직위 이동`);

/* ---------------- 2. 도전자 0명 · 직위 계약 · 우선 협상권 ---------------- */
{
  const g = await createGame({ seed: 4242, agencyChoiceId: 'player-major', careerStart: true });
  g.opening.tutorialContractNeeded = false;
  seedRanking(g, () => []);   // 아무도 배지 8개가 없다
  await runYear(g, 1);
  const R = L.leagueSeason(g).regions.kanto;
  assert.equal(R.challengers.length, 0); assert.equal(R.status, 'completed');
  assert(R.rounds.quarter.every(x => x.bye), '도전자 없으면 사천왕 8강 부전승');

  const a = playerAgency(g), t = a.roster.find(x => !x.isYouth), before = a.funds;
  L.joinLeague(g, t, 'kanto', 'champion');
  assert(!a.roster.includes(t)); assert.equal(a.funds - before, POSITION.compensation.champion); assert.equal(t.formerAgencyId, a.id);
  assert.equal(I.competitionAgency(g, t), '관동 리그');
  g.day = 365 + 1;
  L.leaveLeague(g, t, 'kanto');
  assert(g.personnel.freeAgents.includes(t)); assert.equal(t.rofr.agencyId, a.id);
  const other = g.league.agencies.find(x => x.id !== a.id);
  g.playerAgencyId = other.id;   // 다른 소속사 입장에서는 우선 협상 기간에 못 데려간다
  assert.match(negotiatePersonnel(g, t.id, { wage: 10, years: 1, signing: 0, proRaise: 0, badgeBonus: 0 }).msg, /우선 협상/);
  g.playerAgencyId = a.id;
  console.log('PASS 도전자 0명 리그, 챔피언 계약·보상금, 우선 협상권');
}

/* ---------------- 3. 시리즈: 실제 배틀 경로와 게임 사이 선봉 조정 ---------------- */
{
  I.battleHooks.quick = null;
  const g = await createGame({ seed: 77, agencyChoiceId: 'player-major', careerStart: true });
  await I.ensureOfficials(g);
  const [x, y] = g.international.regions[0].eliteIds.map(id => I.snapshotEntry(g, I.competitionTrainer(g, id)));
  const ev = { id: 'test-series', name: '시리즈 확인', matches: [], series: [], watchMode: 'results' };
  await I.playSeries(g, ev, x, y, 'bo5', '확인', 'kanto', async () => {}, true);
  const sr = ev.series[0];
  assert.equal(Math.max(sr.winsA, sr.winsB), 3); assert(sr.games.length >= 3 && sr.games.length <= 5);
  assert(ev.matches.every(m => m.seriesId === sr.id && m.log?.length));
  assert.deepEqual(counterLead([{ species: 'Charmander', moves: ['Ember'] }, { species: 'Squirtle', moves: ['Water Gun'] }], 'Charmander'), [1, 0], '불꽃 선봉에 물 타입을 올린다');
  console.log(`PASS 실제 배틀 5판 3선 ${sr.winsA}:${sr.winsB} · 조정 ${sr.adjustments.length}회`);
  I.battleHooks.quick = quick;
}

/* ---------------- 4. 저장 복원: 스위스 중간에 저장해도 같은 결과 ---------------- */
{
  const g = await createGame({ seed: 31337, agencyChoiceId: 'player-major', careerStart: true });
  g.opening.tutorialContractNeeded = false;
  const days = dayList(1).filter(d => d <= PWT.knockoutDays.at(-1));
  for (const d of days.filter(d => d <= PWT.swissDays[2])) { g.day = d; await I.tickInternational(g); }
  const copy = restoreGame(snapshotGame(g));
  for (const d of days.filter(d => d > PWT.swissDays[2])) { g.day = d; copy.day = d; await I.tickInternational(g); await I.tickInternational(copy); }
  assert.equal(JSON.stringify(I.internationalSeason(g)), JSON.stringify(I.internationalSeason(copy)));
  console.log('PASS 스위스 3라운드 뒤 저장·불러오기 → 결과 동일');
}

/* ---------------- 5. 예전 저장(관동·성도 통합 8지역) 마이그레이션 ---------------- */
{
  const g = await createGame({ seed: 5150, agencyChoiceId: 'player-major', careerStart: true });
  await I.ensureOfficials(g);
  const st = g.international, kantoR = st.regions.find(r => r.id === 'kanto'), johtoR = st.regions.find(r => r.id === 'johto');
  /* 예전 모양으로 되돌린다: 관동·성도 통합(관장 16), 사천왕·챔피언은 통합 지방 소속 */
  st.officials = st.officials.filter(t => !johtoR.eliteIds.includes(t.id) && t.id !== johtoR.championId);
  for (const t of st.officials) if (['kanto', 'johto'].includes(t.region)) t.region = 'kanto-johto';
  st.regions = [{ id: 'kanto-johto', name: '관동·성도', gymIds: [...kantoR.gymIds, ...johtoR.gymIds], eliteIds: kantoR.eliteIds, championId: kantoR.championId },
    ...st.regions.filter(r => !['kanto', 'johto'].includes(r.id))];
  const keepIds = [...kantoR.eliteIds, kantoR.championId];
  await I.ensureOfficials(g);
  assert.equal(st.regions.length, 9);
  const k2 = st.regions.find(r => r.id === 'kanto'), j2 = st.regions.find(r => r.id === 'johto');
  assert.deepEqual([...k2.eliteIds, k2.championId], keepIds, '기존 사천왕·챔피언 id 유지, 관동으로');
  assert.equal(k2.gymIds.length, 8); assert.equal(j2.gymIds.length, 8); assert.equal(j2.eliteIds.length, 4);
  assert(st.officials.every(t => t.region !== 'kanto-johto'));
  console.log('PASS 예전 저장 관동·성도 분리 (관장 8+8, 기존 사천왕·챔피언 → 관동, 성도 신규 생성)');
}
