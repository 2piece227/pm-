/**
 * 포켓몬별 전술 지시를 AI 점수에 얹는다. (data/mon-tactics.js)
 * 지시는 명령이 아니라 성향 보정이다 — 트레이너의 순응도·판단력만큼만 따른다(obedience).
 */
import { TACTIC_SCALE as S } from '../data/mon-tactics.js';

/** 순응도(0..1)·판단력에 따른 지시 이행도. 0.36~1 */
export function obedience(stats, compliance) {
  const c = Number.isFinite(compliance) ? Math.max(0, Math.min(1, compliance)) : 0.5;
  return (0.4 + 0.6 * c) * (0.6 + 0.4 * Math.max(0, Math.min(1, (stats?.judge ?? 10) / 20)));
}

/**
 * @param option   AI 후보 { kind, role, accuracy, label(move name), basePower, slotId }
 * @param mine     지금 나와 있는 포켓몬의 전술 (없으면 {})
 * @param bench    교체 후보의 전술 (교체 옵션일 때)
 * @param ctx      { hpRatio, aliveBench }
 */
export function tacticAdjustment(option, mine = {}, bench = {}, ctx = {}) {
  let adj = 0;
  const low = (ctx.hpRatio ?? 1) <= S.lowHp;
  if (option.kind === 'switch') {
    adj += (mine.switchOut || 0) * S.switchOut;
    adj += (bench.switchIn || 0) * S.switchIn;
    if (low && mine.lowHp === 'preserve') adj += S.lowHpPreserve;
    if (low && mine.lowHp === 'fight') adj -= S.lowHpFight;
    /* 에이스는 남은 동료가 있으면 아껴 둔다 */
    if (bench.role === 'ace' && (ctx.aliveBench || 0) > 1) adj -= S.aceHold;
    return adj;
  }
  const order = mine.moves?.[option.moveId];
  if (order === 'prefer') adj += S.prefer;
  if (order === 'avoid') adj -= S.avoid;
  /* 랭크업 지시는 '안전할 때' — 이번 턴에 쓰러질 상황(점수가 크게 음수)이면 절반만 */
  if (option.role === 'setup') adj += (mine.setup || 0) * S.setup * ((option.score ?? 0) <= -35 && (mine.setup || 0) > 0 ? 0.5 : 1);
  else if (option.role === 'status') adj += (mine.status || 0) * S.status;
  else if (option.role === 'attack') {
    const aim = mine.aim || 0;
    if (aim > 0) adj += aim * (option.basePower || 0) * S.aimPower;
    if (aim < 0) adj += aim * (100 - (option.accuracy ?? 100)) * S.aimAccuracy;
    if (low && mine.lowHp === 'fight') adj += S.lowHpFight * 0.3;
  }
  return adj;
}

/** 금지 기술은 후보에서 뺀다 (다 금지면 원래대로 둔다) */
export const isBanned = (option, mine = {}) => option.kind === 'move' && mine.moves?.[option.moveId] === 'ban';
