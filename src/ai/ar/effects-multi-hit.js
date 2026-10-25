/**
 * 원작 AI_MoveEffects_MultiHit 이식 — 연속기·두 턴 기술·파괴광선류·구르기·참기.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BP = (code, fn) => add('moveBasePower', code, fn);
const apply = (code, score, move, user, target, ai) => handlers.applyMoveEffectAgainstTargetScore(code, score, move, user, target, ai, ai.battle);

const numHits = move => {
  const c = move.functionCode;
  if (/^HitTwoTimes/.test(c)) return 2;
  if (/^HitThreeTimes/.test(c)) return 3;
  if (c === 'HitTenTimes') return 10;
  const mh = move.data?.multihit;
  return Array.isArray(mh) ? mh[1] : mh || 1;
};
const subBreak = (score, move, user, target, hits) => {
  if (target.effects.Substitute > 0 && !move.ignoresSubstitute(user)) {
    const dmg = move.roughDamage();
    if (target.effects.Substitute < dmg * (hits - 1) / hits) score += 10;
  }
  return score;
};

BP('HitTwoTimes', (power, move) => power * numHits(move));
ET('HitTwoTimes', (score, move, user, target) => subBreak(score, move, user, target, numHits(move)));
copy('moveBasePower', 'HitTwoTimes', 'HitTwoTimesPoisonTarget', 'HitTwoTimesFlinchTarget', 'HitThreeTimesAlwaysCriticalHit', 'HitThreeTimes');
ET('HitTwoTimesPoisonTarget', (score, move, user, target, ai) => {
  score = apply('HitTwoTimes', score, move, user, target, ai);
  const p = apply('PoisonTarget', 0, move, user, target, ai);
  if (p !== MOVE_USELESS_SCORE) score += p;
  return score;
});
ET('HitTwoTimesFlinchTarget', (score, move, user, target, ai) => apply('FlinchTarget', apply('HitTwoTimes', score, move, user, target, ai), move, user, target, ai));
BP('HitTwoTimesTargetThenTargetAlly', power => power * 2);
BP('HitThreeTimesPowersUpWithEachHit', power => power * 6);
ET('HitThreeTimesPowersUpWithEachHit', (score, move, user, target) => {
  if (target.effects.Substitute > 0 && !move.ignoresSubstitute(user) && target.effects.Substitute < move.roughDamage() / 2) score += 10;
  return score;
});
copy('moveEffectAgainstTarget', 'HitTwoTimes', 'HitThreeTimesAlwaysCriticalHit', 'HitThreeTimes');

BP('HitTwoToFiveTimes', (power, move, user) => (user.hasActiveAbility('skilllink') ? power * 5 : user.hasActiveItem('loadeddice') ? power * 4.5 : Math.floor(power * 31 / 10)));
ET('HitTwoToFiveTimes', (score, move, user, target) => subBreak(score, move, user, target, user.hasActiveAbility('skilllink') ? 5 : 3));
BP('HitTwoToFiveTimesOrThreeForAshGreninja', (power, move, user) => (user.species === 'greninjaash' ? 20 * 3 : user.hasActiveAbility('skilllink') ? power * 5 : Math.floor(power * 31 / 10)));
copy('moveEffectAgainstTarget', 'HitTwoToFiveTimes', 'HitTwoToFiveTimesOrThreeForAshGreninja');
copy('moveBasePower', 'HitTwoToFiveTimes', 'HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1');
ET('HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1', (score, move, user, target, ai) => {
  score = apply('HitTwoToFiveTimes', score, move, user, target, ai);
  score = ai.getScoreForTargetStatRaise(score, user, ['spe', 1], false);
  return ai.getScoreForTargetStatDrop(score, user, ['def', 1], false);
});
/* 집단구타 — 상태이상 없는 동료 수만큼 */
const beatUpTeam = ai => ai.side.pokemon.filter(p => !p.fainted && p.hp > 0 && !p.status);
F('HitOncePerUserTeamMember', (move, user, ai) => beatUpTeam(ai).length === 0);
BP('HitOncePerUserTeamMember', (power, move, user, target, ai) => beatUpTeam(ai).reduce((s, p) => s + 5 + Math.floor(p.species.baseStats.atk / 10), 0));
ET('HitOncePerUserTeamMember', (score, move, user, target, ai) => subBreak(score, move, user, target, Math.max(1, beatUpTeam(ai).length)));

E('AttackAndSkipNextTurn', (score, move, user, ai) => (ai.trainer.hasSkillFlag('HPAware') && user.hp >= user.totalhp / 2 ? score - 10 : score));

/* ---------- 두 턴 기술 ---------- */
ET('TwoTurnAttack', (score, move, user, target, ai) => {
  if (user.hasActiveItem('powerherb')) return score;
  if (user.hasActiveAbility('truant')) return MOVE_USELESS_SCORE;
  if (user.roughEndOfRoundDamage() >= user.hp) return MOVE_USELESS_SCORE;
  score -= 10;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 2) score -= 10;
  if (ai.trainer.highSkill() && !(user.hasActiveAbility('unseenfist') && move.contactMove())) {
    let protect = false;
    if (move.pbTarget().num > 1 && target.hasMoveWithFunction('ProtectUserSideFromMultiTargetDamagingMoves')) protect = true;
    if (move.canProtectAgainst()) {
      if (target.hasMoveWithFunction('ProtectUser', 'ProtectUserFromTargetingMovesSpikyShield', 'ProtectUserBanefulBunker')) protect = true;
      if (move.damagingMove() && target.hasMoveWithFunction('ProtectUserFromDamagingMovesKingsShield', 'ProtectUserFromDamagingMovesObstruct')) protect = true;
      if (move.roughPriority(user) > 0 && target.hasMoveWithFunction('ProtectUserSideFromPriorityMoves')) protect = true;
    }
    if (protect) score -= 20;
  }
  return score;
});
BP('TwoTurnAttackOneTurnInSun', (power, move, user) => {
  /* 솔라빔 — 햇살 아닌 날씨에서는 위력 절반 */
  const w = user.effectiveWeather();
  return !['None', 'Sun', 'HarshSun', 'StrongWinds'].includes(w) ? Math.floor(power / 2) : power;
});
ET('TwoTurnAttackOneTurnInSun', (score, move, user, target, ai) => (['Sun', 'HarshSun'].includes(user.effectiveWeather()) ? score : apply('TwoTurnAttack', score, move, user, target, ai)));
const twoTurnThen = code => (score, move, user, target, ai) => {
  score = apply('TwoTurnAttack', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  return apply(code, score, move, user, target, ai);
};
ET('TwoTurnAttackParalyzeTarget', twoTurnThen('ParalyzeTarget'));
ET('TwoTurnAttackBurnTarget', twoTurnThen('BurnTarget'));
ET('TwoTurnAttackFlinchTarget', twoTurnThen('FlinchTarget'));
F('TwoTurnAttackRaiseUserSpAtkSpDefSpd2', (move, user, ai) => handlers.moveWillFail('RaiseUserAtkDef1', move, user, ai, ai.battle));
ET('TwoTurnAttackRaiseUserSpAtkSpDefSpd2', (score, move, user, target, ai) => {
  score = apply('TwoTurnAttack', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  return ai.getScoreForTargetStatRaise(score, user, move.statUp);
});
const twoTurnRaise = code => (score, move, user, target, ai) => {
  score = apply('TwoTurnAttack', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  return handlers.applyMoveEffectScore(code, score, move, user, ai, ai.battle);
};
ET('TwoTurnAttackChargeRaiseUserDefense1', twoTurnRaise('RaiseUserDefense1'));
ET('TwoTurnAttackChargeRaiseUserSpAtk1', twoTurnRaise('RaiseUserSpAtk1'));
const semiInvuln = test => (score, move, user, target, ai) => {
  score = apply('TwoTurnAttack', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  for (const b of ai.eachFoeBattler(user.side)) score += b.checkForMove(test) ? -10 : 8;
  return score;
};
ET('TwoTurnAttackInvulnerableUnderground', semiInvuln(m => m.hitsDiggingTargets()));
ET('TwoTurnAttackInvulnerableUnderwater', semiInvuln(m => m.hitsDivingTargets()));
ET('TwoTurnAttackInvulnerableInSky', semiInvuln(m => m.hitsFlyingTargets()));
ET('TwoTurnAttackInvulnerableInSkyParalyzeTarget', (score, move, user, target, ai) => {
  score = apply('TwoTurnAttackInvulnerableInSky', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  return apply('ParalyzeTarget', score, move, user, target, ai);
});
add('moveFailureAgainstTarget', 'TwoTurnAttackInvulnerableInSkyTargetCannotAct', (move, user, target) => !target.opposes(user) ||
  (target.effects.Substitute > 0 && !move.ignoresSubstitute(user)) || target.hasType('Flying') || target.pbWeight() >= 2000 || target.semiInvulnerable());
copy('moveEffectAgainstTarget', 'TwoTurnAttackInvulnerableInSky', 'TwoTurnAttackInvulnerableInSkyTargetCannotAct');
ET('TwoTurnAttackInvulnerableRemoveProtections', (score, move, user, target, ai) => {
  score = apply('TwoTurnAttack', score, move, user, target, ai);
  if (score === MOVE_USELESS_SCORE) return score;
  return apply('RemoveProtections', score + 8, move, user, target, ai);
});

BP('MultiTurnAttackPowersUpEachTurn', (power, move, user, target) => move.pbBaseDamage(power, user, target) * 2);
BP('MultiTurnAttackBideThenReturnDoubleDamage', () => 40);
E('MultiTurnAttackBideThenReturnDoubleDamage', (score, move, user, ai) => {
  const has = ai.eachFoeBattler(user.side).some(b => !(b.status === 'slp' && b.statusCount > 2) && b.status !== 'frz' && b.checkForMove(m => m.damagingMove()));
  if (!has) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp <= user.totalhp / 4) return MOVE_USELESS_SCORE;
    if (user.hp <= user.totalhp / 2) score -= 15;
    if (user.hp <= user.totalhp * 3 / 4) score -= 8;
  }
  return score;
});
