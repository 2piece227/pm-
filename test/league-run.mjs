/**
 * 리그가 실제로 돌아가는지 확인. (SPEC §3, §13-7단계)
 *   node test/league-run.mjs [주차]
 */
import {
  createLeague, runSeason, standings, allTrainers, trainerRating,
  findTrainer, findAgency, LEAGUE_CONFIG, LOCAL_TOURNAMENT_TIERS,
} from '../src/engine/league.js';

const WEEKS = Number(process.argv[2] || LEAGUE_CONFIG.seasonWeeks);

console.log('=== 리그 생성 ===');
const league = createLeague({ seed: 20260904 });
console.log(`${league.name} · 소속사 ${league.agencies.length}개 · 트레이너 ${allTrainers(league).length}명\n`);

for (const a of league.agencies) {
  const ratings = a.roster.map(trainerRating);
  const avg = ratings.reduce((x, y) => x + y, 0) / ratings.length;
  console.log(
    `${a.name.padEnd(12)} [${a.tierLabel.padEnd(6)}] 평판 ${String(a.reputation).padStart(3)}` +
    ` | 평균레이팅 ${avg.toFixed(1)} (${ratings.map((r) => r.toFixed(0)).join('/')})`
  );
}

console.log('\n=== 대회 등급별 출전 자격 분포 (§3.5 자연 필터링) ===');
for (const tier of LOCAL_TOURNAMENT_TIERS) {
  const [lo, hi] = tier.ratingBand;
  const eligible = allTrainers(league).filter((t) => {
    const r = trainerRating(t);
    return r >= lo && r <= hi;
  });
  const byAgency = {};
  for (const t of eligible) {
    const a = findAgency(league, t.agencyId);
    byAgency[a.name] = (byAgency[a.name] || 0) + 1;
  }
  console.log(
    `  ${tier.label} (레이팅 ${lo}~${hi === 999 ? '∞' : hi}) 자격자 ${eligible.length}명 — ` +
    Object.entries(byAgency).map(([n, c]) => `${n} ${c}`).join(', ')
  );
}

console.log(`\n=== ${WEEKS}주 시즌 진행 ===`);
const t1 = Date.now();
const tours = runSeason(league, WEEKS);
const ms = Date.now() - t1;
const totalMatches = tours.reduce((n, t) => n + t.matches.length, 0);
console.log(`${tours.length}개 대회 / 총 ${totalMatches}경기 / ${ms}ms\n`);

console.log('=== 등급별 우승자 분포 ===');
for (const tier of LOCAL_TOURNAMENT_TIERS) {
  const ts = tours.filter((t) => t.tierId === tier.id);
  const champs = {};
  let empty = 0;
  for (const t of ts) {
    if (!t.result.championId) { empty++; continue; }
    const c = findTrainer(league, t.result.championId);
    const a = findAgency(league, c.agencyId);
    champs[a.name] = (champs[a.name] || 0) + 1;
  }
  const avgEntrants = (ts.reduce((n, t) => n + t.entrants.length, 0) / ts.length).toFixed(1);
  console.log(
    `  ${tier.label}: 평균 참가 ${avgEntrants}명` + (empty ? ` (유찰 ${empty}회)` : '') +
    ` — 우승 ${Object.entries(champs).map(([n, c]) => `${n} ${c}회`).join(', ') || '없음'}`
  );
}

console.log('\n=== 최종 순위표 ===');
console.log('순위 소속사             등급        평판    자금   우승 준우승   승-패');
standings(league).forEach((s, i) => {
  console.log(
    `${String(i + 1).padStart(2)}  ${(s.name + (s.isPlayer ? ' ★' : '')).padEnd(18)}` +
    `${s.tierLabel.padEnd(10)}${String(s.reputation).padStart(5)}` +
    `${String(s.funds).padStart(8)}${String(s.titles).padStart(5)}${String(s.runnerUps).padStart(5)}` +
    `   ${s.wins}-${s.losses}`
  );
});

console.log('\n=== 개인 성적 상위 6명 ===');
allTrainers(league)
  .sort((a, b) => b.record.titles - a.record.titles || b.record.wins - a.record.wins)
  .slice(0, 6)
  .forEach((t) => {
    const a = findAgency(league, t.agencyId);
    console.log(
      `  ${t.name.padEnd(8)} ${a.name.padEnd(12)} 우승 ${t.record.titles}회` +
      ` ${t.record.wins}승 ${t.record.losses}패 · 레이팅 ${trainerRating(t).toFixed(1)}`
    );
  });

console.log('\n=== 부전승 버그 회귀 확인 ===');
const suspicious = allTrainers(league).filter((t) => t.record.wins === 0 && t.record.titles + t.record.losses > 0 && t.record.titles > 0);
console.log(suspicious.length === 0
  ? '  OK — 0승인데 우승한 트레이너 없음'
  : `  ❌ ${suspicious.map((t) => t.name).join(', ')}`);
console.log('');
