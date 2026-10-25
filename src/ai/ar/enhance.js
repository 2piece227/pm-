/**
 * 원작(Essentials v21.1) AI 위에 얹는 보강 — 예전 자체 AI(작업55까지)의 장점을 옮겼다.
 *
 * 원작 AI가 약했던 자리 (작업57 점검, PROGRESS 참고):
 *   1. 부가효과를 발동 확률과 상관없이 쳐준다 — 10% 화상(+31)이 반감 화염방사를 효과 굉장한 기술보다 위로 올린다.
 *   2. 데미지 몫이 작다(최대 +30, KO +10) — 효과 점수에 쉽게 묻힌다. 예전 AI는 기대 데미지%에 비례했다.
 *   3. 랭크업을 "써먹을 수 있나" 보지 않는다 — 이번 턴에 쓰러질 상황에서도 칼춤을 쌓는다.
 *      예전 AI: 랭크업 가치 = (배율−1) × 최대타 × 남은 턴, 이번 턴에 쓰러질 것 같으면 세팅 금지.
 *   4. 마지막 포켓몬 아끼기가 2마리 파티에서는 자발 교체를 통째로 막는다.
 *   5. 교대 후보를 상대 직전 기술·내 기술 위력만으로 고른다 — 예전 AI는 주는 피해 − 받는 피해로 골랐다.
 *   6. (꺼 둠) 예전 AI의 위험도 교체 — 옮겨 봤지만 이득이 없었다.
 * 각 항목은 ENHANCE에서 끌 수 있다 (끄면 원작 그대로). 값은 [임시값] — `node tools/ai-bench.mjs`로 쟀다
 * (작업57: 옛 AI 능력치 15 상대 57→64%, 20 상대 44→49%, 보강 vs 원작 56%, 각 624판).
 */
import { AIMove } from './move.js';
import { isIneffective } from './battler.js';

export const ENHANCE = {
  /** 1. 공격기의 부가효과 점수 × 발동 확률 */
  effectChance: true,
  /** 2. 예상 데미지 점수 (원작 25 / 30 / KO 10) */
  damage: { on: true, per: 50, cap: 50, ko: 25 },
  /** 3. 써먹을 수 없는 변화기는 무의미 점수로 (이번 턴에 쓰러지거나, 이번 턴에 이미 쓰러뜨릴 수 있을 때) */
  setupSense: true,
  /** 4. 마지막 포켓몬 아끼기는 파티가 이 수 이상일 때만 */
  reserveLastMinParty: 3,
  /** 5. 쓰러져 내보낼 때 상성(주는 피해 − 받는 피해)을 더한다 */
  matchupReplacement: true,
  /** 3b. 예전 AI 랭크업 가치: (배율−1) × (써먹을 턴−1) − 1 을 점수로 (±cap) */
  setupValue: { on: true, per: 20, cap: 30 },
  /** 6. 이번 턴에 한 방에 쓰러지는데 받아낼 동료가 있으면 교체 (받는 피해가 동료 HP의 이 비율 미만) */
  /* 측정에서 이득이 없어(옛 AI 상대 −1~−6%p) 기본은 끈다 */
  threatSwitch: { on: false, safe: 0.5 },
};

/** 원작 rough_damage는 최대 난수(1.0) — 평균(0.925)으로 고쳐서 "쓰러뜨리나"를 본다 */
const AVG_ROLL = 0.925;

/** 공격기 부가효과의 발동 확률 (보강을 끄거나 확정 효과면 1) */
export const addlChance = (move) => {
  if (!ENHANCE.effectChance || !move.damagingMove()) return 1;
  const p = move.addlEffect;
  return p > 0 && p < 100 ? p / 100 : 1;
};
/* 반동은 확률이 아니라서 반동 기술 핸들러 전체에는 곱하지 않는다 — 플레어드라이브·볼트태클의
   화상·마비 부분만 반동 핸들러 안에서 addlChance를 곱한다 (effects-move-attributes.js recoil) */
export const effectScale = (move) => (/Recoil/.test(move.functionCode) ? 1 : addlChance(move));

/**
 * attacker가 defender에게 이번 턴에 줄 수 있는 가장 큰 피해 (명중 반영 전 최대 난수, 원작 rough_damage).
 * 원작 계산을 그대로 쓰려고 ai.user/ai.target을 잠깐 바꿔 끼운다.
 * @returns {{ best: number, priority: number }}
 */
export function bestDamage(ai, attacker, defender) {
  const save = { user: ai.user, target: ai.target, move: ai.move, mold: ai.battle.moldBreaker };
  let best = 0, priority = 0;
  try {
    ai.user = attacker; ai.target = defender;
    ai.battle.moldBreaker = attacker.hasMoldBreaker();
    for (const data of attacker.moves || []) {
      if (!data.damagingMove() || (data.pp === 0 && data.totalPp > 0) || data.disabled) continue;
      const m = new AIMove(ai, data);
      ai.move = m;
      if (isIneffective(defender.effectivenessOfTypeAgainstBattler(m.roughType(), attacker, m))) continue;
      if (ai.immuneByAbility(attacker, defender, m)) continue;
      const acc = m.roughAccuracy();
      if (acc < 50) continue;
      const dmg = m.roughDamage();
      if (dmg > best) best = dmg;
      if (m.roughPriority(attacker) > 0 && dmg > priority) priority = dmg;
    }
  } catch {
    /* 정보가 모자라 계산이 안 되면 보강 없이 원작대로 */
  } finally {
    ai.user = save.user; ai.target = save.target; ai.move = save.move; ai.battle.moldBreaker = save.mold;
  }
  return { best, priority };
}

/** 이번 턴의 위험·기회 — 결정 하나에 한 번만 잰다 */
export function turnOutlook(ai) {
  const user = ai.user, foe = ai.battlers[1];
  if (!foe || foe.fainted) return null;
  const threat = bestDamage(ai, foe, user);
  const reach = bestDamage(ai, user, foe);
  const holdsOn = user.hp === user.totalhp && (user.hasActiveAbility('sturdy') || user.hasActiveItem('focussash'));
  return {
    /* 상대 한 방에 내가 쓰러진다 */
    dies: !holdsOn && threat.best * AVG_ROLL >= user.hp,
    /* 내가 먼저 움직이지 못한다 */
    slower: foe.fasterThan(user),
    /* 이번 턴에 내 공격으로 상대를 쓰러뜨릴 수 있다 */
    canKO: reach.best * AVG_ROLL >= foe.hp,
    threat: threat.best, reach: reach.best,
    /* 지금 최대타로 몇 번 맞으면 쓰러지나 / 몇 번 때려야 쓰러뜨리나 (예전 AI의 turnsSurvive·turnsToKO) */
    survive: threat.best > 0 ? Math.ceil(user.hp / (threat.best * AVG_ROLL)) : 9,
    toKO: reach.best > 0 ? Math.ceil(foe.hp / (reach.best * AVG_ROLL)) : 9,
  };
}

const PROTECTS = /^Protect|^UserEnduresFaintingThisTurn|^ProtectUser/;
const selfBoost = (move) => move.statusMove() && move.statUp.length > 0 && ['User', 'UserSide', 'UserAndAllies'].includes(move.target);

/**
 * 3. 써먹을 수 없는 변화기 → 무의미 점수.
 *   - 랭크업: 이번 턴에 상대 한 방에 쓰러지거나, 이미 이번 턴에 쓰러뜨릴 수 있으면 쌓을 이유가 없다.
 *   - 그 밖의 변화기: 상대가 더 빠르고 한 방에 쓰러뜨리면 쓰기도 전에 쓰러진다 (방어 계열은 제외).
 */
export function setupSenseScore(score, move, outlook, useless) {
  if (!ENHANCE.setupSense || !outlook || !move.statusMove()) return score;
  if (PROTECTS.test(move.functionCode)) return score;
  if (selfBoost(move) && (outlook.dies || outlook.canKO)) return Math.min(score, useless);
  if (outlook.dies && outlook.slower) return Math.min(score, useless);
  return score;
}

const STAGE = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
/**
 * 3b. 예전 AI 랭크업 가치 — 공격·특공을 올리는 기술만. 써먹을 턴 R = min(버티는 턴, 쓰러뜨리는 턴, 6).
 * 가치 = (배율−1)×(R−1) − 1 (이번 턴 공격 하나를 포기하는 값). 0보다 크면 원작 점수에 더하고, 작으면 뺀다.
 */
export function setupValueScore(score, move, user, outlook) {
  const cfg = ENHANCE.setupValue;
  if (!cfg.on || !outlook || !selfBoost(move) || score <= 60) return score;
  const ups = move.statUp;
  let mult = 1;
  for (let i = 0; i < ups.length; i += 2) {
    if (!['atk', 'spa'].includes(ups[i])) continue;
    if (!user.checkForMove(m => (ups[i] === 'atk' ? m.physicalMove() : m.specialMove()))) continue;
    const cur = user.stage(ups[i]), next = Math.min(6, cur + ups[i + 1]);
    mult = Math.max(mult, STAGE(next) / STAGE(cur));
  }
  if (mult <= 1) return score;
  const R = Math.max(0, Math.min(outlook.survive, outlook.toKO, 6));
  const gain = (mult - 1) * (R - 1) - 1;
  return score + Math.max(-cfg.cap, Math.min(cfg.cap, cfg.per * gain));
}

/**
 * 6. 예전 AI의 위험도 교체 — 이번 턴에 상대 한 방에 쓰러지고, 먼저 쓰러뜨리지도 못하는데,
 * 상대 최대타를 HP의 절반 미만으로 받아낼 동료가 있으면 빠진다. (원작 ShouldSwitch 핸들러로 등록)
 */
export function threatenedWithSafeReserve(ai, battler, reserves) {
  if (!ENHANCE.threatSwitch.on || battler.index !== 0) return false;
  const o = turnOutlook(ai);
  if (!o || !o.dies) return false;
  if (o.canKO && !o.slower) return false;   // 먼저 쓰러뜨린다
  const foe = ai.battlers[1], seat = ai.battlers[0], saved = seat.mon;
  try {
    for (const p of reserves) {
      if (!p.mon) continue;
      const hazard = ai.calculateEntryHazardDamage(p, 0);
      seat.refresh({ own: p.mon });
      const inc = bestDamage(ai, foe, seat).best + hazard;
      if (inc < seat.hp * ENHANCE.threatSwitch.safe) return true;
    }
  } catch {
    return false;
  } finally {
    seat.refresh({ own: saved });
  }
  return false;
}

/**
 * 5. 교대 후보 상성 — 예전 AI의 (주는 피해 − 0.8 × 받는 피해)를 남은 HP 비율로 환산해 더한다.
 * 후보는 우리 쪽 엔진 포켓몬이라 다 알지만, 원작 계산식이 AIBattler를 쓰니 잠깐 그 자리에 앉혀 잰다.
 */
export function matchupBonus(ai, pkmn) {
  if (!ENHANCE.matchupReplacement || !pkmn.mon) return 0;
  const foe = ai.battlers[1];
  if (!foe || foe.fainted) return 0;
  const seat = ai.battlers[0], saved = seat.mon;
  try {
    seat.refresh({ own: pkmn.mon });
    const out = Math.min(1, bestDamage(ai, seat, foe).best / Math.max(1, foe.hp));
    const inc = Math.min(1, bestDamage(ai, foe, seat).best / Math.max(1, seat.hp));
    return 40 * out - 32 * inc;
  } catch {
    return 0;
  } finally {
    if (saved) seat.refresh({ own: saved });
  }
}
