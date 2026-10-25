/**
 * 원작 AI_MoveEffects_Healing 이식 — 회복기·흡수기·씨뿌리기·자폭·멸망의노래·길동무.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BP = (code, fn) => add('moveBasePower', code, fn);

F('HealUserFullyAndFallAsleep', (move, user) => !user.canHeal() || user.asleep() || !user.canInflictStatus('slp', user, move, true));
E('HealUserFullyAndFallAsleep', (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) score -= 10;
    else score += 30 * (user.totalhp - user.hp) / user.totalhp;
  }
  if (user.status) score += user.wantsStatusProblem(user.status) ? -10 : 8;
  if (ai.trainer.mediumSkill()) score += user.wantsStatusProblem('slp') ? 10 : -8;
  return score;
});

F('HealUserHalfOfTotalHP', (move, user) => !user.canHeal());
E('HealUserHalfOfTotalHP', (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) return score - 10;
    score += 30 * (user.totalhp - user.hp) / user.totalhp;
  }
  return score;
});
copy('moveFailure', 'HealUserHalfOfTotalHP', 'HealUserDependingOnWeather', 'HealUserDependingOnSandstorm', 'HealUserHalfOfTotalHPLoseFlyingTypeThisTurn');
E('HealUserDependingOnWeather', (score, move, user, ai) => {
  score = handlers.applyMoveEffectScore('HealUserHalfOfTotalHP', score, move, user, ai, ai.battle);
  const w = user.effectiveWeather();
  if (['Sun', 'HarshSun'].includes(w)) score += 5;
  else if (!['None', 'StrongWinds'].includes(w)) score -= 10;
  return score;
});
E('HealUserDependingOnSandstorm', (score, move, user, ai) => {
  score = handlers.applyMoveEffectScore('HealUserHalfOfTotalHP', score, move, user, ai, ai.battle);
  if (user.effectiveWeather() === 'Sandstorm') score += 5;
  return score;
});
E('HealUserHalfOfTotalHPLoseFlyingTypeThisTurn', (score, move, user, ai) => handlers.applyMoveEffectScore('HealUserHalfOfTotalHP', score, move, user, ai, ai.battle));

FT('CureTargetStatusHealUserHalfOfTotalHP', (move, user, target) => !user.canHeal() || !target.status);
ET('CureTargetStatusHealUserHalfOfTotalHP', (score, move, user, target, ai) => {
  score = handlers.applyMoveEffectScore('HealUserHalfOfTotalHP', score, move, user, ai, ai.battle);
  return score + (target.wantsStatusProblem(target.status) ? 10 : -8);
});

const drainHeal = (score, user, ai, amount) => {
  if (user.hasActiveItem('bigroot')) score += 5;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    let heal = amount;
    if (user.hasActiveItem('bigroot')) heal *= 1.3;
    heal = Math.min(heal, user.totalhp - user.hp);
    if (heal > user.totalhp * 0.3) {
      if (user.hp < user.totalhp * 0.5) score += 20 * (user.totalhp - user.hp) / user.totalhp;
      score += 20 * heal / user.totalhp;
    }
  }
  return score;
};
FT('HealUserByTargetAttackLowerTargetAttack1', (move, user, target, ai) => (!ai.battle.moldBreaker && target.hasActiveAbility('contrary') ? target.statStageAtMax('atk') : target.statStageAtMin('atk')));
ET('HealUserByTargetAttackLowerTargetAttack1', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill()) score = ai.getScoreForTargetStatDrop(score, target, move.statDown);
  if (target.hasActiveAbility('liquidooze')) score -= 20;
  else if (user.canHeal()) score = drainHeal(score, user, ai, target.roughStat('atk'));
  return score;
});
const drainMove = frac => (score, move, user, target, ai) => {
  const dmg = move.roughDamage();
  if (target.hasActiveAbility('liquidooze')) { if (dmg < target.hp) score -= 20; }
  else if (user.canHeal()) score = drainHeal(score, user, ai, dmg * frac);
  return score;
};
ET('HealUserByHalfOfDamageDone', drainMove(0.5));
FT('HealUserByHalfOfDamageDoneIfTargetAsleep', (move, user, target) => !target.asleep());
copy('moveEffectAgainstTarget', 'HealUserByHalfOfDamageDone', 'HealUserByHalfOfDamageDoneIfTargetAsleep');
ET('HealUserByThreeQuartersOfDamageDone', drainMove(0.75));

FT('HealUserAndAlliesQuarterOfTotalHP', (move, user, target) => !target.canHeal());
ET('HealUserAndAlliesQuarterOfTotalHP', (score, move, user, target, ai) => {
  if (!target.canHeal()) return score;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp >= target.totalhp * 0.75) score -= 5;
    else score += 15 * (target.totalhp - target.hp) / target.totalhp;
  }
  return score;
});
FT('HealUserAndAlliesQuarterOfTotalHPCureStatus', (move, user, target) => !target.canHeal() && !target.status);
ET('HealUserAndAlliesQuarterOfTotalHPCureStatus', (score, move, user, target, ai) => {
  score = handlers.applyMoveEffectScore('HealUserAndAlliesQuarterOfTotalHP', score, move, user, ai, ai.battle);
  if (target.status) score += target.wantsStatusProblem(target.status) ? -10 : 10;
  return score;
});
FT('HealTargetHalfOfTotalHP', (move, user, target) => !target.canHeal());
ET('HealTargetHalfOfTotalHP', (score, move, user, target, ai) => {
  if (target.opposes(user)) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp >= target.totalhp * 0.5) score -= 10;
    else {
      let heal = target.totalhp * (move.pulseMove() && user.hasActiveAbility('megalauncher') ? 0.75 : 0.5);
      heal = Math.min(heal, target.totalhp - target.hp);
      score += 20 * (target.totalhp - target.hp) / target.totalhp + 20 * heal / target.totalhp;
    }
  }
  return score;
});
copy('moveFailureAgainstTarget', 'HealTargetHalfOfTotalHP', 'HealTargetDependingOnGrassyTerrain');
ET('HealTargetDependingOnGrassyTerrain', (score, move, user, target, ai) => {
  if (user.opposes(target)) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp >= target.totalhp * 0.5) score -= 10;
    else {
      let heal = ai.terrain === 'Grassy' ? Math.round(target.totalhp * 2 / 3) : target.totalhp * 0.5;
      heal = Math.min(heal, target.totalhp - target.hp);
      score += 20 * (target.totalhp - target.hp) / target.totalhp + 20 * heal / target.totalhp;
    }
  }
  return score;
});

F('HealUserPositionNextTurn', (move, user, ai) => ai.positionEffects(user.index).Wish > 0);
E('HealUserPositionNextTurn', (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) score -= 10;
    else score += 20 * (user.totalhp - user.hp) / user.totalhp;
  }
  return score;
});
F('StartHealUserEachTurn', (move, user) => user.effects.AquaRing);
E('StartHealUserEachTurn', (score, move, user) => score + 15 + (user.hasActiveItem('bigroot') ? 5 : 0));
F('StartHealUserEachTurnTrapUserInBattle', (move, user) => user.effects.Ingrain);
E('StartHealUserEachTurnTrapUserInBattle', (score, move, user) => score + 8 + (user.turnCount < 2 ? 15 : 0) + (user.hasActiveItem('bigroot') ? 5 : 0));
FT('StartDamageTargetEachTurnIfTargetAsleep', (move, user, target) => !target.asleep() || target.effects.Nightmare);
ET('StartDamageTargetEachTurnIfTargetAsleep', (score, move, user, target) => (target.statusCount <= 1 ? MOVE_USELESS_SCORE : score + 8 * target.statusCount));

/* 씨뿌리기 */
FT('StartLeechSeedTarget', (move, user, target) => target.effects.LeechSeed >= 0 || target.hasType('Grass') || !target.takesIndirectDamage());
ET('StartLeechSeedTarget', (score, move, user, target, ai) => {
  score += 15;
  if (user.turnCount < 2) score += 10;
  if (ai.trainer.mediumSkill()) {
    if (!user.checkForMove(m => m.damagingMove())) score += 10;
    if (ai.ableReserveCount(target.side) === 0) score += 8;
    if (target.hasActiveAbility('liquidooze')) score -= 20;
  }
  if (ai.trainer.highSkill()) {
    if (user.checkForMove(m => /^ProtectUser/.test(m.functionCode))) score += 10;
    if (target.hasMoveWithFunction('RemoveUserBindingAndEntryHazards')) score -= 15;
  }
  return score;
});

/* HP를 깎는 기술 (강철빔·미스트볼 등) */
const sacrifice = (base, hpFrom = 0.75) => (score, move, user, ai) => {
  score -= base;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (hpFrom === 0.75) { if (user.hp >= user.totalhp * 0.75) score += 15; if (user.hp <= user.totalhp * 0.25) score += 15; }
    else { if (user.hp >= user.totalhp * 0.5) score -= 10; if (user.hp <= user.totalhp * 0.25) score += 20; }
  }
  if (ai.trainer.highSkill()) {
    const reserves = ai.pbAbleNonActiveCount(user.idxOwnSide()), foes = ai.pbAbleNonActiveCount(user.idxOpposingSide());
    if (reserves === 0) score += 30;
    else if (foes === 0) score += 20;
  }
  return score;
};
E('UserLosesHalfOfTotalHP', sacrifice(15, 0.75));
F('UserLosesHalfOfTotalHPExplosive', (move, user, ai) => !ai.battle.moldBreaker && ai.globalAbility('damp'));
copy('moveEffect', 'UserLosesHalfOfTotalHP', 'UserLosesHalfOfTotalHPExplosive');
copy('moveFailure', 'UserLosesHalfOfTotalHPExplosive', 'UserFaintsExplosive', 'UserFaintsPowersUpInMistyTerrainExplosive');
E('UserFaintsExplosive', sacrifice(20, 0.5));
BP('UserFaintsPowersUpInMistyTerrainExplosive', (power, move, user, target, ai) => (ai.terrain === 'Misty' ? Math.floor(power * 3 / 2) : power));
copy('moveEffect', 'UserFaintsExplosive', 'UserFaintsPowersUpInMistyTerrainExplosive', 'UserFaintsFixedDamageUserHP');
BP('UserFaintsFixedDamageUserHP', (power, move, user) => user.hp);

ET('UserFaintsLowerTargetAtkSpAtk2', (score, move, user, target, ai) => {
  score -= 20;
  score = ai.getScoreForTargetStatDrop(score, target, move.statDown);
  if (score === MOVE_USELESS_SCORE) return score;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) score -= 10;
    if (user.hp <= user.totalhp * 0.25) score += 20;
  }
  if (ai.trainer.highSkill() && ai.pbAbleNonActiveCount(user.idxOwnSide()) > 0 && ai.pbAbleNonActiveCount(user.idxOpposingSide()) === 0) score += 20;
  return score;
});
F('UserFaintsHealAndCureReplacement', (move, user, ai) => ai.ableReserveCount(user.side) === 0);
E('UserFaintsHealAndCureReplacement', (score, move, user, ai) => {
  score -= 20;
  if (ai.trainer.mediumSkill()) {
    const need = ai.side.pokemon.some(p => p !== ai.side.active[0] && !p.fainted && (p.hp < p.maxhp * 0.75 || p.status));
    if (!need) return MOVE_USELESS_SCORE;
    score += 10;
  }
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp * 0.5) score -= 10;
    if (user.hp <= user.totalhp * 0.25) score += 20;
  }
  if (ai.trainer.highSkill() && ai.pbAbleNonActiveCount(user.idxOwnSide()) > 0 && ai.pbAbleNonActiveCount(user.idxOpposingSide()) === 0) score += 20;
  return score;
});
copy('moveFailure', 'UserFaintsHealAndCureReplacement', 'UserFaintsHealAndCureReplacementRestorePP');
copy('moveEffect', 'UserFaintsHealAndCureReplacement', 'UserFaintsHealAndCureReplacementRestorePP');

/* 멸망의노래 */
FT('StartPerishCountsForAllBattlers', (move, user, target, ai) => {
  if (target.effects.PerishSong > 0) return true;
  if (!target.abilityActive()) return false;
  return target.abilityId === 'soundproof' && target.index !== user.index;
});
E('StartPerishCountsForAllBattlers', (score, move, user, ai) => {
  score -= 15;
  if (ai.trainer.mediumSkill()) {
    let allies = 0, foes = 0, highHp = 0;
    for (const b of ai.eachBattler()) {
      if (handlers.moveWillFailAgainstTarget('StartPerishCountsForAllBattlers', move, user, b, ai, ai.battle)) continue;
      if (b.opposes(user)) { foes++; if (b.hp >= b.totalhp * 0.75) highHp++; } else allies++;
    }
    if (foes === 0) return MOVE_USELESS_SCORE;
    if (allies === 0) score += 15;
    score -= 15 * allies;
    score += 20 * foes;
    if (ai.trainer.hasSkillFlag('HPAware')) score += 10 * highHp;
  }
  if (ai.trainer.highSkill()) {
    const reserves = ai.pbAbleNonActiveCount(user.idxOwnSide()), foes = ai.pbAbleNonActiveCount(user.idxOpposingSide());
    if (foes === 0) score += 25;
    else if (reserves === 0) score -= 15;
  }
  return score;
});

/* 길동무·원한 */
/* 7세대 이후 연속 사용 불가 */
F('AttackerFaintsIfUserFaints', (move, user) => user.lastMoveUsed === 'destinybond');
const lastStand = (score, move, user, ai) => {
  score -= 25;
  let faster = 0;
  for (const b of ai.eachFoeBattler(user.side)) if (user.fasterThan(b)) faster++;
  if (faster === 0) return score;
  score += 7 * faster;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp <= user.totalhp * 0.4) score += 20;
    if (user.hp <= user.totalhp * 0.25) score += 10;
    if (user.hp <= user.totalhp * 0.1) score += 15;
  }
  return score;
};
E('AttackerFaintsIfUserFaints', lastStand);
E('SetAttackerMovePPTo0IfUserFaints', lastStand);
