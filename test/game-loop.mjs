/**
 * 하루 단위 게임 루프 검증.
 * 자금 압박이 실제로 압박인지, 성장이 체감되는지, 컨디션 로테이션이 강제되는지를 본다.
 *   node test/game-loop.mjs [일수]
 */
import {
  createGame, advanceDay, assignAction, playerAgency, playerRoster,
  tournamentOn, upcomingTournaments, dailyUpkeep, trainerRating, placementOf,
} from '../src/engine/game.js';
import { STAT_KEYS } from '../src/data/agencies.js';

const DAYS = Number(process.argv[2] || 42);

/** 간단한 자동 플레이어: 대회 있으면 자격되는 최고 레이팅부터 내보내고, 나머지는 훈련/휴식 */
function autoPlay(game) {
  const tier = tournamentOn(game.day);
  const roster = [...playerRoster(game)].sort((a, b) => trainerRating(b) - trainerRating(a));
  for (const t of roster) {
    const canEnter = tier && t.condition >= 35 &&
      trainerRating(t) >= tier.ratingBand[0] && trainerRating(t) <= tier.ratingBand[1];
    if (canEnter) assignAction(game, t.id, `enter:${tier.id}`);
    else if (t.condition >= 55) {
      /* 가장 낮은 스탯을 훈련 */
      const worst = STAT_KEYS.reduce((a, b) => (t.stats[a] < t.stats[b] ? a : b));
      assignAction(game, t.id, `train:${worst}`);
    } else assignAction(game, t.id, 'rest');
  }
}

const game = await createGame({ seed: 20260905 });
const p = playerAgency(game);
console.log(`=== ${p.name} (${p.tierLabel}) ===`);
console.log(`시작 자금 ${p.funds} · 일일 경비 ${dailyUpkeep(game)} · 트레이너 ${p.roster.length}명\n`);

const before = p.roster.map((t) => ({
  name: t.name,
  stats: { ...t.stats },
  pot: { ...t.potential },
  rating: trainerRating(t),
}));
console.log('시작 로스터:');
for (const b of before) {
  console.log(`  ${b.name.padEnd(8)} 레이팅 ${b.rating.toFixed(1)} · 스탯 ${STAT_KEYS.map((k) => b.stats[k].toFixed(0)).join('/')}` +
    ` · 잠재 ${STAT_KEYS.map((k) => b.pot[k].toFixed(0)).join('/')}`);
}

console.log(`\n=== ${DAYS}일 진행 ===`);
let entries = 0, titles = 0;
for (let i = 0; i < DAYS; i++) {
  autoPlay(game);
  const r = await advanceDay(game);
  if (r.tournament) {
    const mine = r.myResults;
    entries += mine.length;
    titles += mine.filter((m) => m.placement === '우승').length;
    if (mine.length) {
      console.log(
        `D${String(r.day).padStart(2)} ${r.tournament.tierLabel.padEnd(2)}컵 · 참가 ${r.tournament.entrants.length}명` +
        ` | 내 선수: ${mine.map((m) => `${m.name} ${m.placement}`).join(', ')}` +
        ` | 자금 ${playerAgency(game).funds}`
      );
    }
  }
  if (game.gameOver) { console.log(`\n💀 ${r.day}일차 파산: ${game.gameOver.reason}`); break; }
}

const after = playerAgency(game);
console.log(`\n=== ${DAYS}일 후 ===`);
console.log(`자금 ${after.funds} · 평판 ${after.reputation} · 일일 경비 ${dailyUpkeep(game)}`);
console.log(`대회 출전 ${entries}회 · 우승 ${titles}회`);

console.log('\n성장 확인 (시작 → 현재):');
for (const t of after.roster) {
  const b = before.find((x) => x.name === t.name);
  if (!b) { console.log(`  ${t.name.padEnd(8)} (영입)`); continue; }
  const d = STAT_KEYS.map((k) => (t.stats[k] - b.stats[k]));
  const total = d.reduce((x, y) => x + y, 0);
  console.log(
    `  ${t.name.padEnd(8)} ${STAT_KEYS.map((k) => t.stats[k].toFixed(1)).join('/')}` +
    ` (합계 +${total.toFixed(1)}) · 레이팅 ${b.rating.toFixed(1)} → ${trainerRating(t).toFixed(1)}` +
    ` · 컨디션 ${Math.round(t.condition)}`
  );
}

console.log('\n시장 매물:');
for (const m of game.market) {
  console.log(`  ${m.trainer.name.padEnd(8)} 레이팅 ${trainerRating(m.trainer).toFixed(1)} · 이적료 ${m.fee} · 급여 ${m.trainer.salary}`);
}
console.log('');
