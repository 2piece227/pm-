/**
 * 회귀 테스트: 브래킷에 기록된 승자 == 관전(재생) 결과.
 *
 * 원래 버그: runMatch()가 트레이너의 "현재" 컨디션/스탯을 매번 새로 읽어서,
 * 대회가 끝난 뒤(컨디션 -30, 훈련 성장) 관전하면 다른 승자가 나왔다.
 * 기록은 정태윤 승인데 관전하면 최태윤이 이기는 식. 55경기 중 20% 이상 어긋났다.
 *
 *   node test/replay-consistency.mjs
 */
import assert from 'node:assert/strict';
import { createLeague, advanceWeek, findTrainer, replayMatch } from '../src/engine/league.js';

// Legacy replay compatibility is tested directly; active gameplay no longer hosts tournaments.
const game = { league: await createLeague({ seed: 20260905 }) };
for (let week = 0; week < 2; week++) advanceWeek(game.league);
for (const a of game.league.agencies) for (const t of a.roster) {
  t.stats.judge = 1;
  t.party.forEach(m=>{ m.level = 5; });
}

let total = 0, mismatch = 0, turnMismatch = 0;
for (const tour of game.league.tournaments) {
  for (const m of tour.matches) {
    total++;
    const r = replayMatch(m);
    if (r.winnerId !== m.winnerId) {
      mismatch++;
      const a = findTrainer(game.league, m.aId), b = findTrainer(game.league, m.bId);
      console.log(`❌ ${tour.name} ${m.roundLabel} ${a?.name} vs ${b?.name}`);
    }
    if (r.turns !== m.turns) turnMismatch++;
  }
}
console.log(`\n총 ${total}경기 — 승자 불일치 ${mismatch}건 / 턴수 불일치 ${turnMismatch}건`);
assert(total > 0, 'no replay fixtures were exercised');
if (mismatch === 0 && turnMismatch === 0) {
  console.log('✅ 브래킷과 관전 결과가 완전히 일치');
} else {
  console.log('❌ 불일치 발생 — 스냅샷 재생이 깨졌다');
  process.exit(1);
}
