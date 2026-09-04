/**
 * SPEC §13-3단계 "팀 빌딩 + 배틀 길이 튜닝" 합격 확인.
 *
 * 합격 기준(PROGRESS.md Q1 참고): 턴 수 자체가 목표가 아니라,
 * "배틀이 충분히 길어져서 기점기·집중력·멘탈이 실제로 발동하는가"를 본다.
 * §14에서 2마리 무투자 파티는 평균 4.4턴 / 기점기 0회 / 집중력·멘탈 발동 불가였다.
 *
 *   node test/battle-tuning.mjs [횟수]
 */
import { createTrainerAI, runBattle, makeRng } from '../src/engine/run-battle.js';
import { buildTeam, ROSTER_PROFILES } from '../src/engine/team-builder.js';
import { TrainerAI } from '../src/ai/trainer-ai.js';

const N = Number(process.argv[2] || 100);
const FULL = { judge: 20, ops: 20, focus: 20, know: 20, mental: 20 };

/* 집중력(장기전 감쇠)·멘탈(동요) 분기가 실제로 발동했는지 계측 —
   프로덕션 코드는 안 건드리고 테스트에서만 감싼다. */
const fired = { focus: 0, mental: 0, calls: 0 };
const origTemp = TrainerAI.prototype.temperature;
TrainerAI.prototype.temperature = function (turn) {
  fired.calls++;
  const settled = (20 * Math.pow(Math.max(0, this.stats.focus) / 20, 1.8)) / 2;
  if (turn > settled) fired.focus++;
  if (this.shock > 0) fired.mental++;
  return origTemp.call(this, turn);
};

function trial(label, profA, profB, statsA = FULL, statsB = FULL) {
  Object.assign(fired, { focus: 0, mental: 0, calls: 0 });
  const A = createTrainerAI({ name: 'A', stats: statsA }, '균형형', makeRng(11));
  const B = createTrainerAI({ name: 'B', stats: statsB }, '균형형', makeRng(22));
  const teamRng = makeRng(7);

  let winA = 0, turns = 0, setup = 0, switches = 0, battlesWithSetup = 0, maxTurns = 0;
  for (let i = 0; i < N; i++) {
    const teamA = buildTeam(teamRng, profA);
    const teamB = buildTeam(teamRng, profB);
    const r = runBattle({ trainerA: A, trainerB: B, teamA, teamB, seed: 1000 + i * 7919 });
    if (r.winner === 'p1') winA++;
    turns += r.turns;
    maxTurns = Math.max(maxTurns, r.turns);
    const s = r.stats.setupUsed.p1 + r.stats.setupUsed.p2;
    setup += s;
    if (s > 0) battlesWithSetup++;
    switches += r.stats.switches.p1 + r.stats.switches.p2;
  }
  console.log(
    `${label.padEnd(30)} 승률 ${((winA / N) * 100).toFixed(1).padStart(5)}%` +
    ` | 평균 ${(turns / N).toFixed(1).padStart(5)}턴 (최장 ${maxTurns})` +
    ` | 기점기 ${(setup / N).toFixed(2)}회/배틀, 배틀의 ${((battlesWithSetup / N) * 100).toFixed(0)}%` +
    ` | 교체 ${(switches / N).toFixed(1)}` +
    ` | 집중력발동 ${((fired.focus / fired.calls) * 100).toFixed(0)}%` +
    ` 멘탈발동 ${((fired.mental / fired.calls) * 100).toFixed(0)}%`
  );
}

console.log(`\n=== §13-3단계 배틀 튜닝 확인 · 조건당 ${N}회 ===\n`);
console.log('--- 등급별 팀으로 배틀이 성립하는가 ---');
for (const prof of Object.keys(ROSTER_PROFILES)) trial(`${prof} vs ${prof}`, prof, prof);

console.log('\n--- 등급 차이가 승률로 나타나는가 (팀 전력 축) ---');
trial('elite vs grunt', 'elite', 'grunt');
trial('elite vs mid', 'elite', 'mid');
trial('mid vs weak', 'mid', 'weak');

console.log('\n--- 같은 팀 등급에서 트레이너 실력이 승률을 움직이는가 (AI 축) ---');
const WEAK_T = { judge: 7, ops: 7, focus: 7, know: 7, mental: 7 };
const MID_T = { judge: 14, ops: 14, focus: 14, know: 14, mental: 14 };
trial('만점 vs 약체(7)  [mid팀]', 'mid', 'mid', FULL, WEAK_T);
trial('만점 vs 중간(14) [mid팀]', 'mid', 'mid', FULL, MID_T);
trial('만점 vs 만점     [mid팀]', 'mid', 'mid', FULL, FULL);
console.log('');
