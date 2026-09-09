/**
 * 브래킷 자체가 일관적인지 검증한다.
 * SPEC §14-6은 "승자/패자 변수 대입이 뒤바뀌어 패자가 진출한다"고 추정했으므로,
 * 그 가설이 맞는지(=기록이 오염됐는지) 직접 확인한다.
 *
 *   node test/bracket-integrity.mjs
 */
import assert from 'node:assert/strict';
import { createLeague, advanceWeek, findTrainer } from '../src/engine/league.js';

// Only preserved legacy records; the game loop has no tournament entry point.
const game = { league: await createLeague({ seed: 20260905 }) };
for (let week = 0; week < 2; week++) advanceWeek(game.league);

let problems = 0;
let checked = 0;

for (const tour of game.league.tournaments) {
  const byRound = {};
  for (const m of tour.matches) (byRound[m.round] ||= []).push(m);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  for (const m of tour.matches) {
    checked++;
    // (1) 승자는 반드시 두 참가자 중 하나여야 한다
    if (m.winnerId !== m.aId && m.winnerId !== m.bId) {
      console.log(`❌ ${tour.name} ${m.roundLabel}: 승자가 참가자가 아님`); problems++;
    }
    // (2) 패자는 승자가 아닌 쪽이어야 한다
    const expectedLoser = m.winnerId === m.aId ? m.bId : m.aId;
    if (m.loserId !== expectedLoser) {
      console.log(`❌ ${tour.name} ${m.roundLabel}: loserId가 승자의 반대편이 아님`); problems++;
    }
  }

  // (3) 다음 라운드에 나온 사람은 이전 라운드에서 이긴 사람이어야 한다
  for (let i = 1; i < rounds.length; i++) {
    const prev = byRound[rounds[i - 1]];
    const next = byRound[rounds[i]];
    const prevWinners = new Set(prev.map((m) => m.winnerId));
    const prevLosers = new Set(prev.map((m) => m.loserId));
    for (const m of next) {
      for (const id of [m.aId, m.bId]) {
        if (prevLosers.has(id) && !prevWinners.has(id)) {
          const t = findTrainer(game.league, id);
          console.log(`❌ ${tour.name} ${m.roundLabel}: 직전 라운드 패자(${t?.name})가 진출함`);
          problems++;
        }
      }
    }
  }

  // (4) 우승자는 결승 승자여야 한다
  const final = tour.matches.find((m) => m.roundLabel === '결승');
  if (final && tour.result.championId !== final.winnerId) {
    console.log(`❌ ${tour.name}: 우승자 != 결승 승자`); problems++;
  }
}

console.log(`\n대회 ${game.league.tournaments.length}개 / ${checked}경기 검사`);
assert(checked > 0, 'no bracket fixtures were exercised');
if (problems === 0) {
  console.log('✅ 브래킷 기록은 일관적 — 승자만 진출, 우승자 = 결승 승자');
  console.log('   (SPEC §14-6의 "승자/패자 대입이 뒤바뀜" 가설은 해당 없음)');
} else {
  console.log(`❌ ${problems}건 문제`);
  process.exit(1);
}
