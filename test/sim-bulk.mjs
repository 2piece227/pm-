/**
 * 헤드리스 대량 시뮬 — SPEC §8 검증 항목을 실엔진에서 다시 돌린다.
 *   node test/sim-bulk.mjs [횟수]
 */
import { createTrainerAI, runBattle, runBulk, makeRng } from '../src/engine/run-battle.js';
import { TRAINERS } from '../src/data/trainers.js';
import { TEAM_PRESETS } from '../src/data/teams.js';

const N = Number(process.argv[2] || 300);

function mk(defOverride, style, seed) {
  return createTrainerAI({ ...TRAINERS.A, ...defOverride }, style, makeRng(seed));
}

function bulk(label, aDef, aStyle, bDef, bStyle, preset) {
  const teams = TEAM_PRESETS[preset];
  const A = createTrainerAI(aDef, aStyle, makeRng(12345));
  const B = createTrainerAI(bDef, bStyle, makeRng(54321));
  const r = runBulk({ trainerA: A, trainerB: B, teamA: teams.A, teamB: teams.B, count: N, seed: 1 });
  const pct = (n) => ((n / N) * 100).toFixed(1);
  console.log(
    `${label.padEnd(42)} ${pct(r.p1).padStart(5)}% : ${pct(r.p2).padStart(5)}%` +
      `  | 평균 ${r.avgTurns.toFixed(1)}턴` +
      `  | 기점기 사용 배틀 A ${pct(r.battlesWithSetup.p1)}% B ${pct(r.battlesWithSetup.p2)}%` +
      `  | 교체 ${(r.switches.p1 / N).toFixed(1)}/${(r.switches.p2 / N).toFixed(1)}`
  );
  return r;
}

const FULL = { judge: 20, ops: 20, focus: 20, know: 20, mental: 20 };
const WEAK = { judge: 7, ops: 7, focus: 7, know: 7, mental: 7 };

console.log(`\n=== 실엔진(@pkmn/sim) + 트레이너 AI · ${N}회/조건 ===\n`);

console.log('--- 1. 스탯이 승률을 움직이는가 (SPEC §8: 7→20에서 36.8%→84.5%) ---');
bulk('약체(7) 난천 vs 만점 단델 [proto]', { ...TRAINERS.A, stats: WEAK }, '대면형', { ...TRAINERS.B, stats: FULL }, '기점형', 'proto');
bulk('원본(18/19/18/17/20) vs 만점 [proto]', TRAINERS.A, '대면형', TRAINERS.B, '기점형', 'proto');
bulk('만점 vs 만점 [proto]', { ...TRAINERS.A, stats: FULL }, '대면형', { ...TRAINERS.B, stats: FULL }, '기점형', 'proto');

console.log('\n--- 2. 배틀 길이 · 기점기 발현 (SPEC §8-(1): proto는 평균 4.4턴, 기점기 0%) ---');
bulk('기점형 vs 기점형 [proto]', { ...TRAINERS.A, stats: FULL }, '기점형', { ...TRAINERS.B, stats: FULL }, '기점형', 'proto');
bulk('기점형 vs 기점형 [tuned]', { ...TRAINERS.A, stats: FULL }, '기점형', { ...TRAINERS.B, stats: FULL }, '기점형', 'tuned');
bulk('대면형 vs 대면형 [tuned]', { ...TRAINERS.A, stats: FULL }, '대면형', { ...TRAINERS.B, stats: FULL }, '대면형', 'tuned');
bulk('기점형 vs 대면형 [tuned]', { ...TRAINERS.A, stats: FULL }, '기점형', { ...TRAINERS.B, stats: FULL }, '대면형', 'tuned');

console.log('\n--- 3. 지식 스탯: 리자몽에게 지진(무효기)을 날리는가 ---');
for (const know of [20, 17, 12, 6]) {
  const A = createTrainerAI({ ...TRAINERS.A, stats: { ...FULL, know } }, '대면형', makeRng(999));
  const B = createTrainerAI({ ...TRAINERS.B, stats: FULL }, '기점형', makeRng(888));
  let immuneHits = 0;
  let battles = 0;
  for (let i = 0; i < N; i++) {
    const r = runBattle({
      trainerA: A, trainerB: B,
      teamA: TEAM_PRESETS.proto.A, teamB: TEAM_PRESETS.proto.B,
      seed: 4242 + i * 7919,
    });
    battles++;
    for (let j = 0; j < r.log.length; j++) {
      if (r.log[j].startsWith('|-immune|p2')) immuneHits++;
    }
  }
  console.log(`  지식 ${String(know).padStart(2)} → 무효기 사용 ${immuneHits}회 / ${battles}배틀`);
}

console.log('\n--- 4. 단일 배틀 로그 샘플 (판단 근거 포함) ---');
{
  const A = createTrainerAI({ ...TRAINERS.A, stats: FULL }, '기점형', makeRng(7));
  const B = createTrainerAI({ ...TRAINERS.B, stats: FULL }, '대면형', makeRng(8));
  const r = runBattle({
    trainerA: A, trainerB: B,
    teamA: TEAM_PRESETS.tuned.A, teamB: TEAM_PRESETS.tuned.B,
    seed: 20260903, collectThink: true,
  });
  console.log(`  승자: ${r.winner} / ${r.turns}턴`);
  r.think.slice(0, 8).forEach((t) => {
    const opts = t.think.options.map((o) => `${o.label} ${Math.round(o.prob * 100)}%`).join(' / ');
    console.log(`  T${t.turn} [${t.think.trainer} T=${t.think.temperature.toFixed(2)}] ${opts}`);
  });
}

console.log('');
