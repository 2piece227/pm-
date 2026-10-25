/**
 * 원작 AI_MoveEffects_ChangeMoveEffect 이식 — 저주·카운터·비축·따라하기 계열·매직코트·가로챔.
 */
import { add, handlers, MOVE_USELESS_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BP = (code, fn) => add('moveBasePower', code, fn);

E('RedirectAllMovesToUser', () => MOVE_USELESS_SCORE);
ET('RedirectAllMovesToTarget', () => MOVE_USELESS_SCORE);
BP('RandomlyDamageOrHealTarget', () => 50);
E('RandomlyDamageOrHealTarget', score => score - 10);
FT('HealAllyOrDamageFoe', (move, user, target) => !target.opposes(user) && !target.canHeal());
ET('HealAllyOrDamageFoe', (score, move, user, target, ai) => {
  if (target.opposes(user)) return score;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp >= target.totalhp * 0.5) score -= 10;
    else score += 20 * (target.totalhp - target.hp) / target.totalhp;
  }
  return score;
});

/* 저주 — 고스트면 상대에게 저주, 아니면 랭크 변화 */
const ghostCurse = (move, user) => user.hasType('Ghost') || (move.roughType() === 'Ghost' && user.hasActiveAbility(['libero', 'protean']));
F('CurseTargetOrLowerUserSpd1RaiseUserAtkDef1', (move, user) => {
  if (ghostCurse(move, user)) return false;
  for (let i = 0; i < move.statUp.length; i += 2) if (user.canRaiseStatStage(move.statUp[i], user, move)) return false;
  for (let i = 0; i < move.statDown.length; i += 2) if (user.canLowerStatStage(move.statDown[i], user, move)) return false;
  return true;
});
FT('CurseTargetOrLowerUserSpd1RaiseUserAtkDef1', (move, user, target) => {
  if (!ghostCurse(move, user)) return false;
  return target.effects.Curse || !target.takesIndirectDamage();
});
E('CurseTargetOrLowerUserSpd1RaiseUserAtkDef1', (score, move, user, ai) => {
  if (ghostCurse(move, user)) return score;
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (score === MOVE_USELESS_SCORE) return score;
  return ai.getScoreForTargetStatDrop(score, user, move.statDown, false);
});
ET('CurseTargetOrLowerUserSpd1RaiseUserAtkDef1', (score, move, user, target, ai) => {
  if (!ghostCurse(move, user)) return score;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp <= user.totalhp / 2) return MOVE_USELESS_SCORE;
  if (user.turnCount < 2) score += 10;
  if (ai.trainer.mediumSkill()) {
    if (!user.checkForMove(m => m.damagingMove())) score += 15;
    if (ai.ableReserveCount(target.side) === 0) score += 10;
  }
  if (ai.trainer.highSkill() && user.checkForMove(m => /^ProtectUser/.test(m.functionCode))) score += 5;
  return score;
});

/* 비밀의힘 — 싱글 필드 기본(풀숲 아님: 마비) */
ET('EffectDependsOnEnvironment', (score, move, user, target, ai) => {
  const code = { Electric: 'ParalyzeTarget', Grassy: 'SleepTarget', Misty: null, Psychic: null }[ai.terrain] ?? 'ParalyzeTarget';
  if (ai.terrain === 'Misty') return ai.getScoreForTargetStatDrop(score, target, ['spa', 1]);
  if (ai.terrain === 'Psychic') return ai.getScoreForTargetStatDrop(score, target, ['spe', 1]);
  return handlers.applyMoveEffectAgainstTargetScore(code, score, move, user, target, ai, ai.battle);
});
BP('HitsAllFoesAndPowersUpInPsychicTerrain', (power, move, user, target) => move.pbBaseDamage(power, user, target));

FT('TargetNextFireMoveDamagesTarget', (move, user, target) => target.effects.Powder);
ET('TargetNextFireMoveDamagesTarget', (score, move, user, target) => {
  if (!target.checkForMove(m => m.pbCalcType(target) === 'Fire')) return MOVE_USELESS_SCORE;
  score += 10;
  if (!target.checkForMove(m => m.pbCalcType(target) !== 'Fire')) score += 10;
  return score;
});
E('DoublePowerAfterFusionFlare', score => score);
E('DoublePowerAfterFusionBolt', score => score);
FT('PowerUpAllyMove', () => true);

/* 카운터·미러코트·메탈버스트 */
const counter = (test, prefer) => (score, move, user, ai) => {
  let has = false;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (prefer === 'any' && user.fasterThan(b)) continue;
    if (!b.checkForMove(m => test(m) && (user.effects.Substitute === 0 || m.ignoresSubstitute(b)))) continue;
    has = true;
    if (prefer === 'atk' && b.roughStat('atk') > b.roughStat('spa')) score += 5;
    if (prefer === 'spa' && b.roughStat('spa') > b.roughStat('atk')) score += 5;
    if (ai.trainer.mediumSkill() && b.lastMoveUsed) {
      const md = ai.gen.moves.get(b.lastMoveUsed);
      if ((prefer === 'atk' && md.category === 'Physical') || (prefer === 'spa' && md.category === 'Special') || (prefer === 'any' && md.category !== 'Status')) score += 8;
    }
    if (b.effects.Taunt > 0) score += 5;
  }
  return has ? score : MOVE_USELESS_SCORE;
};
BP('CounterPhysicalDamage', () => 60);
E('CounterPhysicalDamage', counter(m => m.physicalMove(), 'atk'));
BP('CounterSpecialDamage', () => 60);
E('CounterSpecialDamage', counter(m => m.specialMove(), 'spa'));
BP('CounterDamagePlusHalf', () => 60);
E('CounterDamagePlusHalf', counter(m => m.damagingMove(), 'any'));

/* 비축하기·토해내기·꿀꺽 */
F('UserAddStockpileRaiseDefSpDef1', (move, user) => user.effects.Stockpile >= 3);
E('UserAddStockpileRaiseDefSpDef1', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, ['def', 1, 'spd', 1], false);
  if (user.hasMoveWithFunction('PowerDependsOnUserStockpile', 'HealUserDependingOnUserStockpile')) score += [10, 10, 8, 5][user.effects.Stockpile];
  return score;
});
F('PowerDependsOnUserStockpile', (move, user) => user.effects.Stockpile === 0);
BP('PowerDependsOnUserStockpile', (power, move, user, target) => move.pbBaseDamage(power, user, target));
E('PowerDependsOnUserStockpile', (score, move, user) => (user.effects.Stockpile < 2 ? score - 5 : score));
F('HealUserDependingOnUserStockpile', (move, user) => user.effects.Stockpile === 0 || (!user.canHeal() && user.effects.Stockpile_Def === 0 && user.effects.Stockpile_SpDef === 0));
E('HealUserDependingOnUserStockpile', (score, move, user, ai) => {
  if (!user.canHeal()) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) return score - 10;
    score += 20 * (user.totalhp - user.hp) / user.totalhp;
  }
  if (user.effects.Stockpile < 2) score -= 5;
  return score;
});
E('GrassPledge', score => score);
E('FirePledge', score => score);
E('WaterPledge', score => score);

/* 따라하기 계열 */
F('UseLastMoveUsed', (move, user, ai) => !ai.engine.lastMove);
FT('UseLastMoveUsedByTarget', (move, user, target, ai) => !target.lastRegularMoveUsed || !ai.moveData(target.lastRegularMoveUsed).canMirrorMove());
FT('UseMoveTargetIsAboutToUse', (move, user, target) => !target.checkForMove(m => m.damagingMove()));
ET('UseMoveTargetIsAboutToUse', (score, move, user, target) => {
  if (target.fasterThan(user)) return MOVE_USELESS_SCORE;
  if (target.checkForMove(m => m.statusMove())) score -= 8;
  return score;
});
F('UseRandomMoveFromUserParty', (move, user, ai) => !ai.reserves().some(p => p.moves.length > 0));
F('UseRandomUserMoveIfAsleep', (move, user) => !user.moves.some(m => m.id !== move.id && !m.usableWhenAsleep()));

E('BounceBackProblemCausingStatusMoves', (score, move, user, ai) => {
  if (user.hasActiveAbility('magicbounce')) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.statusMove() && m.canMagicCoat())) continue;
    score += 5; useless = false;
  }
  if (useless) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 2) score -= Math.trunc(20 * (1 - user.hp / user.totalhp));
  return score;
});
E('StealAndUseBeneficialStatusMove', (score, move, user, ai) => {
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.statusMove() && m.canSnatch())) continue;
    score += 5; useless = false;
  }
  if (useless) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 2) score -= Math.trunc(20 * (1 - user.hp / user.totalhp));
  return score;
});

F('ReplaceMoveThisBattleWithTargetLastMoveUsed', (move, user) => user.effects.Transform || !user.pbHasMove(move.id));
FT('ReplaceMoveThisBattleWithTargetLastMoveUsed', (move, user, target) => {
  if (!user.fasterThan(target)) return false;
  const last = target.lastRegularMoveUsed;
  return !last || user.pbHasMove(last);
});
ET('ReplaceMoveThisBattleWithTargetLastMoveUsed', (score, move, user, target) => score - 10 + (user.fasterThan(target) ? 5 : 0));
FT('ReplaceMoveWithTargetLastMoveUsed', (move, user, target) => {
  if (!user.fasterThan(target)) return false;
  const last = target.lastRegularMoveUsed;
  return !last || user.pbHasMove(last);
});
