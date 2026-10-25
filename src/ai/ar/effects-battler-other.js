/**
 * 원작 AI_MoveEffects_BattlerOther 이식 — 상태이상·풀죽음·혼란·헤롱헤롱·타입/특성 바꾸기·공중부양.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE } from './handlers.js';
import { effectiveness, isIneffective, isSuperEffective, isResistant, isNormalEffective } from './battler.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const rainy = t => ['Rain', 'HeavyRain'].includes(t.effectiveWeather());
const healerAlly = (ai, target) => ai.eachSameSideBattler(target.side).some(b => b.index !== target.index && b.hasActiveAbility('healer'));

/* ---------- 잠듦 ---------- */
FT('SleepTarget', (move, user, target) => move.statusMove() && !target.canSleep(user, move));
ET('SleepTarget', (score, move, user, target, ai) => {
  const useless = move.statusMove() ? MOVE_USELESS_SCORE : score;
  if (target.effects.Yawn > 0) return useless;
  if (target.hasActiveItem(['chestoberry', 'lumberry'])) return useless;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return useless;
  if (target.canSleep(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return useless;
    score += addEffect;
    score += 15;
    for (const b of ai.eachSameSideBattler(user.side)) {
      if (b.hasMoveWithFunction('DoublePowerIfTargetAsleepCureTarget', 'DoublePowerIfTargetStatusProblem', 'HealUserByHalfOfDamageDoneIfTargetAsleep', 'StartDamageTargetEachTurnIfTargetAsleep')) score += 5;
      if (b.hasActiveAbility('baddreams')) score += 10;
    }
    if (target.hasActiveAbility('earlybird')) score -= 10;
    if (target.hasActiveAbility('marvelscale')) score -= 8;
    if (target.checkForMove(m => m.usableWhenAsleep())) score -= 8;
    if (target.hasActiveAbility('shedskin')) score -= 8;
    else if (target.hasActiveAbility('hydration') && rainy(target)) score -= 15;
    if (healerAlly(ai, target)) score -= 8;
  }
  return score;
});
F('SleepTargetIfUserDarkrai', (move, user) => !user.isSpecies('darkrai'));
FT('SleepTargetIfUserDarkrai', (move, user, target) => move.statusMove() && !target.canSleep(user, move));
copy('moveEffectAgainstTarget', 'SleepTarget', 'SleepTargetIfUserDarkrai', 'SleepTargetChangeUserMeloettaForm');
FT('SleepTargetNextTurn', (move, user, target) => target.effects.Yawn > 0 || !target.canSleep(user, move));
copy('moveEffectAgainstTarget', 'SleepTarget', 'SleepTargetNextTurn');

/* ---------- 독 ---------- */
FT('PoisonTarget', (move, user, target) => move.statusMove() && !target.canPoison(user, move));
ET('PoisonTarget', (score, move, user, target, ai) => {
  const useless = move.statusMove() ? MOVE_USELESS_SCORE : score;
  if (target.hasActiveAbility('poisonheal')) return useless;
  if (target.hasActiveItem(['pechaberry', 'lumberry'])) return useless;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return useless;
  if (target.canPoison(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return useless;
    score += addEffect;
    score += 15;
    if (ai.trainer.hasSkillFlag('HPAware')) score += 15 * target.hp / target.totalhp;
    for (const b of ai.eachSameSideBattler(user.side)) {
      if (b.hasMoveWithFunction('DoublePowerIfTargetPoisoned', 'DoublePowerIfTargetStatusProblem', 'DoublePowerIfTargetPoisonedPoisonTarget', 'DoublePowerIfTargetStatusProblemBurnTarget')) score += 5;
      if (b.hasActiveAbility('merciless')) score += 10;
    }
    if (target.hasActiveAbility(['guts', 'marvelscale', 'quickfeet', 'toxicboost'])) score -= 8;
    if (target.hasActiveAbility('poisonheal')) score -= 25;
    if (target.hasActiveAbility('synchronize') && user.canSynchronize('psn', target)) score -= 20;
    if (target.hasMoveWithFunction('DoublePowerIfUserPoisonedBurnedParalyzed', 'CureUserBurnPoisonParalysis')) score -= 5;
    if (target.checkForMove(m => m.functionCode === 'GiveUserStatusToTarget' && user.canPoison(target, m))) score -= 15;
    if (!target.takesIndirectDamage()) score -= 20;
    if (target.hasActiveAbility('shedskin')) score -= 8;
    else if (target.hasActiveAbility('hydration') && rainy(target)) score -= 15;
    if (healerAlly(ai, target)) score -= 8;
  }
  return score;
});
FT('PoisonTargetLowerTargetSpeed1', (move, user, target) => !target.canPoison(user, move) && !target.canLowerStatStage('spe', user, move));
ET('PoisonTargetLowerTargetSpeed1', (score, move, user, target, ai) => {
  const poison = handlers.applyMoveEffectAgainstTargetScore('PoisonTarget', 0, move, user, target, ai, ai.battle);
  if (poison !== MOVE_USELESS_SCORE) score += poison;
  return ai.getScoreForTargetStatDrop(score, target, move.statDown, false);
});
copy('moveFailureAgainstTarget', 'PoisonTarget', 'BadPoisonTarget');
copy('moveEffectAgainstTarget', 'PoisonTarget', 'BadPoisonTarget');

/* ---------- 마비 ---------- */
FT('ParalyzeTarget', (move, user, target) => move.statusMove() && !target.canParalyze(user, move));
ET('ParalyzeTarget', (score, move, user, target, ai) => {
  const useless = move.statusMove() ? MOVE_USELESS_SCORE : score;
  if (target.hasActiveItem(['cheriberry', 'lumberry'])) return useless;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return useless;
  if (target.canParalyze(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return useless;
    score += addEffect;
    score += 10;
    if (target.fasterThan(user) && target.roughStat('spe') < user.roughStat('spe') * 2) score += 15;
    if (target.effects.Confusion > 1) score += 7;
    if (target.effects.Attract >= 0) score += 7;
    for (const b of ai.eachSameSideBattler(user.side)) if (b.hasMoveWithFunction('DoublePowerIfTargetParalyzedCureTarget', 'DoublePowerIfTargetStatusProblem', 'DoublePowerIfTargetStatusProblemBurnTarget')) score += 5;
    if (target.hasActiveAbility(['guts', 'marvelscale', 'quickfeet'])) score -= 8;
    if (target.hasActiveAbility('synchronize') && user.canSynchronize('par', target)) score -= 20;
    if (target.hasMoveWithFunction('DoublePowerIfUserPoisonedBurnedParalyzed', 'CureUserBurnPoisonParalysis')) score -= 5;
    if (target.checkForMove(m => m.functionCode === 'GiveUserStatusToTarget' && user.canParalyze(target, m))) score -= 15;
    if (target.hasActiveAbility('shedskin')) score -= 8;
    else if (target.hasActiveAbility('hydration') && rainy(target)) score -= 15;
    if (healerAlly(ai, target)) score -= 8;
  }
  return score;
});
FT('ParalyzeTargetIfNotTypeImmune', (move, user, target) => {
  if (isIneffective(target.effectivenessOfTypeAgainstBattler(move.roughType(), user, move))) return true;
  return move.statusMove() && !target.canParalyze(user, move);
});
copy('moveEffectAgainstTarget', 'ParalyzeTarget', 'ParalyzeTargetIfNotTypeImmune', 'ParalyzeTargetAlwaysHitsInRainHitsTargetInSky');

const combo = (a, b) => (score, move, user, target, ai) => {
  const s1 = handlers.applyMoveEffectAgainstTargetScore(a, 0, move, user, target, ai, ai.battle);
  const s2 = handlers.applyMoveEffectAgainstTargetScore(b, 0, move, user, target, ai, ai.battle);
  if (s1 === MOVE_USELESS_SCORE && s2 === MOVE_USELESS_SCORE) return MOVE_USELESS_SCORE;
  if (s1 !== MOVE_USELESS_SCORE) score += s1;
  if (s2 !== MOVE_USELESS_SCORE) score += s2;
  return score;
};
ET('ParalyzeFlinchTarget', combo('ParalyzeTarget', 'FlinchTarget'));

/* ---------- 화상 ---------- */
FT('BurnTarget', (move, user, target) => move.statusMove() && !target.canBurn(user, move));
ET('BurnTarget', (score, move, user, target, ai) => {
  const useless = move.statusMove() ? MOVE_USELESS_SCORE : score;
  if (target.hasActiveItem(['rawstberry', 'lumberry'])) return useless;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return useless;
  if (target.canBurn(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return useless;
    score += addEffect;
    score += 15;
    if (!target.hasActiveAbility('guts') && target.checkForMove(m => m.physicalMove())) {
      score += 8;
      if (!target.checkForMove(m => m.specialMove())) score += 8;
    }
    for (const b of ai.eachSameSideBattler(user.side)) if (b.hasMoveWithFunction('DoublePowerIfTargetStatusProblem', 'DoublePowerIfTargetStatusProblemBurnTarget')) score += 5;
    if (target.hasActiveAbility(['flareboost', 'guts', 'marvelscale', 'quickfeet'])) score -= 8;
    if (target.hasActiveAbility('heatproof')) score -= 5;
    if (target.hasActiveAbility('synchronize') && user.canSynchronize('brn', target)) score -= 20;
    if (target.hasMoveWithFunction('DoublePowerIfUserPoisonedBurnedParalyzed', 'CureUserBurnPoisonParalysis')) score -= 5;
    if (target.checkForMove(m => m.functionCode === 'GiveUserStatusToTarget' && user.canBurn(target, m))) score -= 15;
    if (!target.takesIndirectDamage()) score -= 20;
    if (target.hasActiveAbility('shedskin')) score -= 8;
    else if (target.hasActiveAbility('hydration') && rainy(target)) score -= 15;
    if (healerAlly(ai, target)) score -= 8;
  }
  return score;
});
ET('BurnFlinchTarget', combo('BurnTarget', 'FlinchTarget'));

/* ---------- 얼음 ---------- */
FT('FreezeTarget', (move, user, target) => move.statusMove() && !target.canFreeze(user, move));
ET('FreezeTarget', (score, move, user, target, ai) => {
  const useless = move.statusMove() ? MOVE_USELESS_SCORE : score;
  if (target.hasActiveItem(['aspearberry', 'lumberry'])) return useless;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return useless;
  if (target.canFreeze(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return useless;
    score += addEffect;
    score += 15;
    for (const b of ai.eachSameSideBattler(user.side)) if (b.hasMoveWithFunction('DoublePowerIfTargetStatusProblem', 'DoublePowerIfTargetStatusProblemBurnTarget')) score += 5;
    if (target.hasActiveAbility('marvelscale')) score -= 8;
    if (target.checkForMove(m => m.thawsUser())) score -= 15;
    if (target.hasActiveAbility('shedskin')) score -= 8;
    else if (target.hasActiveAbility('hydration') && rainy(target)) score -= 15;
    if (healerAlly(ai, target)) score -= 8;
  }
  return score;
});
copy('moveEffectAgainstTarget', 'FreezeTarget', 'FreezeTargetSuperEffectiveAgainstWater', 'FreezeTargetAlwaysHitsInHail');
ET('FreezeFlinchTarget', combo('FreezeTarget', 'FlinchTarget'));

ET('ParalyzeBurnOrFreezeTarget', (score, move, user, target, ai) => {
  if (target.hasActiveItem('lumberry')) return score;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && rainy(target)) return score;
  for (const code of ['ParalyzeTarget', 'BurnTarget', 'FreezeTarget']) {
    const s = handlers.applyMoveEffectAgainstTargetScore(code, 0, move, user, target, ai, ai.battle);
    if (s !== MOVE_USELESS_SCORE) score += s / 3;
  }
  return score;
});

/* ---------- 사이코시프트 ---------- */
F('GiveUserStatusToTarget', (move, user) => !user.status);
FT('GiveUserStatusToTarget', (move, user, target) => !target.canInflictStatus(user.status, user, move));
ET('GiveUserStatusToTarget', (score, move, user, target, ai) => {
  if (!user.wantsStatusProblem(user.status)) score += 15;
  const code = { slp: 'SleepTarget', par: 'ParalyzeTarget', psn: 'PoisonTarget', brn: 'BurnTarget', frz: 'FreezeTarget' }[user.status];
  if (code) {
    const s = handlers.applyMoveEffectAgainstTargetScore(code, score, move, user, target, ai, ai.battle);
    if (s !== MOVE_USELESS_SCORE) return s;
  }
  return score;
});

F('CureUserBurnPoisonParalysis', (move, user) => !['brn', 'psn', 'par'].includes(user.status));
E('CureUserBurnPoisonParalysis', (score, move, user) => (user.wantsStatusProblem(user.status) ? MOVE_USELESS_SCORE : score + 20));

F('CureUserPartyStatus', (move, user, ai) => !ai.side.pokemon.some(p => !p.fainted && p.hp > 0 && p.status));
E('CureUserPartyStatus', (score, move, user, ai) => {
  score = 100;
  for (const p of ai.side.pokemon) {
    if (p.fainted || !p.status) continue;
    if (p.status === 'slp' && (p.statusState?.time ?? 2) === 1) continue;
    score += 12;
  }
  return score;
});

ET('CureTargetBurn', (score, move, user, target) => {
  const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
  if (addEffect === -999) return score;
  if (target.status === 'brn') {
    score -= addEffect;
    score += target.wantsStatusProblem('brn') ? 15 : -10;
  }
  return score;
});

F('StartUserSideImmunityToInflictedStatus', (move, user) => user.ownSide().Safeguard > 0);
E('StartUserSideImmunityToInflictedStatus', (score, move, user, ai) => {
  if (ai.terrain === 'Misty' && ((ai.battle.field.terrainState?.duration ?? 2) > 1)) {
    if (ai.eachSameSideBattler(user.side).every(b => b.affectedByTerrain())) return MOVE_USELESS_SCORE;
  }
  if (ai.pbAbleNonActiveCount(user.idxOpposingSide()) === 0) return score - 20;
  for (const b of ai.eachSameSideBattler(user.side)) score += 15;
  return score;
});

/* ---------- 풀죽음 ---------- */
ET('FlinchTarget', (score, move, user, target, ai) => {
  if (target.fasterThan(user) || target.effects.Substitute > 0) return score;
  if (target.hasActiveAbility('innerfocus') && !ai.battle.moldBreaker) return score;
  const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
  if (addEffect === -999) return score;
  score += addEffect;
  score += 15;
  if (target.status === 'par' || target.effects.Confusion > 1 || target.effects.Attract >= 0) score += 8;
  return score;
});
copy('moveEffectAgainstTarget', 'FlinchTarget', 'FlinchTargetFailsIfUserNotAsleep');
F('FlinchTargetFailsIfNotUserFirstTurn', (move, user) => user.turnCount > 0);
copy('moveEffectAgainstTarget', 'FlinchTarget', 'FlinchTargetFailsIfNotUserFirstTurn');
add('moveBasePower', 'FlinchTargetDoublePowerIfTargetInSky', (power, move, user, target) => move.pbBaseDamage(power, user, target));
copy('moveEffectAgainstTarget', 'FlinchTarget', 'FlinchTargetDoublePowerIfTargetInSky');

/* ---------- 혼란·헤롱헤롱 ---------- */
FT('ConfuseTarget', (move, user, target) => move.statusMove() && !target.canConfuse(user, move));
ET('ConfuseTarget', (score, move, user, target, ai) => {
  if (target.hasActiveItem('persimberry')) return score;
  if (target.canConfuse(user, move)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return score;
    score += addEffect;
    score += 10;
    if (ai.trainer.hasSkillFlag('HPAware')) score += 20 * target.hp / target.totalhp;
    if (target.status === 'par' || target.effects.Attract >= 0) score += 8;
    if (target.hasActiveAbility('tangledfeet')) score -= 15;
  }
  return score;
});
copy('moveEffectAgainstTarget', 'ConfuseTarget', 'ConfuseTargetAlwaysHitsInRainHitsTargetInSky');

FT('AttractTarget', (move, user, target) => move.statusMove() && !target.canAttract(user));
ET('AttractTarget', (score, move, user, target) => {
  if (target.canAttract(user)) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return score;
    score += addEffect;
    score += 15;
    if (target.status === 'par' || target.effects.Confusion > 1) score += 8;
    if (target.hasActiveItem('destinyknot') && user.canAttract(target)) score -= 15;
    if (move.statusMove() && user.hasActiveAbility('cutecharm')) score -= 15;
  }
  return score;
});

/* ---------- 타입 바꾸기 ---------- */
const envType = ai => ({ Electric: 'Electric', Grassy: 'Grass', Misty: 'Fairy', Psychic: 'Psychic' }[ai.terrain] || 'Normal');
F('SetUserTypesBasedOnEnvironment', (move, user, ai) => !user.canChangeType() || !user.pbHasOtherType(envType(ai)));
E('SetUserTypesBasedOnEnvironment', (score, move, user, ai) => {
  const t = envType(ai);
  if (user.hasDamagingMoveOfType(t)) score += 14;
  for (const type of user.pbTypes()) if (type !== t && user.hasDamagingMoveOfType(type)) score -= 14;
  return score;
});

FT('SetUserTypesToResistLastAttack', (move, user, target, ai) => {
  if (!user.canChangeType()) return true;
  const last = target.lastMoveUsedType;
  if (!target.lastMoveUsed || !last) return true;
  return !ai.gen.types.all().some(t => t.exists && !user.hasType(t.name) && isResistant(effectiveness(ai.gen, last, [t.name])));
});
ET('SetUserTypesToResistLastAttack', (score, move, user, target) => {
  const eff = user.effectivenessOfTypeAgainstBattler(target.lastMoveUsedType, target);
  if (isIneffective(eff)) return MOVE_USELESS_SCORE;
  if (isSuperEffective(eff)) return score + 15;
  if (isNormalEffective(eff)) return score + 10;
  return score + 5;
});

FT('SetUserTypesToTargetTypes', (move, user, target) => {
  if (!user.canChangeType()) return true;
  if (!target.pbTypes().length) return true;
  return user.pbTypes().join() === target.pbTypes().join();
});

F('SetUserTypesToUserMoveType', (move, user) => {
  if (!user.canChangeType()) return true;
  const m = user.moves[0];
  return !m || user.hasType(m.type);
});
ET('SetUserTypesToUserMoveType', (score, move, user) => {
  const m = user.moves[0];
  if (m && !user.hasType(m.type) && user.hasDamagingMoveOfType(m.type)) score += 14;
  return score;
});

const typeTargetScore = (type, withResist) => (score, move, user, target, ai) => {
  for (const b of ai.eachFoeBattler(target.side)) for (const m of b.moves) {
    if (!m.damagingMove()) continue;
    const eff = effectiveness(ai.gen, m.pbCalcType(b), [type]);
    if (isSuperEffective(eff)) score += 10;
    else if (withResist && isResistant(eff)) score -= 5;
    else if (isIneffective(eff)) score -= 10;
  }
  return score;
};
const failsTypeChange = (move, user, target) => !target.canChangeType() || target.effects.Substitute > 0 && !move.ignoresSubstitute(user) ||
  (move.functionCode === 'SetTargetTypesToPsychic' && target.pbTypes().join() === 'Psychic') ||
  (move.functionCode === 'SetTargetTypesToWater' && target.pbTypes().join() === 'Water') ||
  (move.functionCode === 'AddGhostTypeToTarget' && target.hasType('Ghost')) ||
  (move.functionCode === 'AddGrassTypeToTarget' && target.hasType('Grass'));
FT('SetTargetTypesToPsychic', failsTypeChange);
ET('SetTargetTypesToPsychic', typeTargetScore('Psychic', false));
copy('moveFailureAgainstTarget', 'SetTargetTypesToPsychic', 'SetTargetTypesToWater', 'AddGhostTypeToTarget', 'AddGrassTypeToTarget');
ET('SetTargetTypesToWater', typeTargetScore('Water', false));
ET('AddGhostTypeToTarget', typeTargetScore('Ghost', true));
ET('AddGrassTypeToTarget', typeTargetScore('Grass', true));

F('UserLosesFireType', (move, user) => !user.hasType('Fire'));

/* ---------- 특성 바꾸기 ---------- */
const abilityChange = (getOld, getNew, sideAware = true) => (score, move, user, target) => {
  const holder = getOld === 'user' ? user : target;
  if (!holder.abilityActive()) return MOVE_USELESS_SCORE;
  const oldR = holder.wantsAbility(holder.abilityId);
  const newR = holder.wantsAbility(getNew(user, target));
  const side = sideAware ? (target.opposes(user) ? 1 : -1) : 1;
  if (oldR > newR) score += 5 * side * Math.max(oldR - newR, 3);
  else if (oldR < newR) score -= 5 * side * Math.max(newR - oldR, 3);
  return score;
};
const failsAbilityTarget = (move, user, target) => target.unstoppableAbility() || (target.effects.Substitute > 0 && !move.ignoresSubstitute(user));
FT('SetTargetAbilityToSimple', (move, user, target) => failsAbilityTarget(move, user, target) || target.abilityId === 'simple' || target.abilityId === 'truant');
ET('SetTargetAbilityToSimple', abilityChange('target', () => 'simple'));
FT('SetTargetAbilityToInsomnia', (move, user, target) => failsAbilityTarget(move, user, target) || target.abilityId === 'insomnia' || target.abilityId === 'truant');
ET('SetTargetAbilityToInsomnia', abilityChange('target', () => 'insomnia'));
FT('SetUserAbilityToTargetAbility', (move, user, target) => user.unstoppableAbility() || !target.abilityId || target.ungainableAbility() || user.abilityId === target.abilityId);
ET('SetUserAbilityToTargetAbility', abilityChange('user', (u, t) => t.abilityId, false));
FT('SetTargetAbilityToUserAbility', (move, user, target) => !user.ability || user.abilityId === target.abilityId || user.ungainableAbility() ||
  ['powerofalchemy', 'receiver', 'trace'].includes(user.abilityId) || failsAbilityTarget(move, user, target) || target.abilityId === 'truant');
ET('SetTargetAbilityToUserAbility', abilityChange('target', u => u.abilityId));
FT('UserTargetSwapAbilities', (move, user, target) => !user.ability || user.unstoppableAbility() || user.ungainableAbility() || user.abilityId === 'wonderguard' ||
  !target.abilityId || target.unstoppableAbility() || target.ungainableAbility() || target.abilityId === 'wonderguard');
ET('UserTargetSwapAbilities', (score, move, user, target) => {
  if (!user.abilityActive() && !target.abilityActive()) return MOVE_USELESS_SCORE;
  let userDiff = user.wantsAbility(target.abilityId) - user.wantsAbility(user.abilityId);
  if (!user.abilityActive()) userDiff = 0;
  let targetDiff = target.wantsAbility(user.abilityId) - target.wantsAbility(target.abilityId);
  if (!target.abilityActive()) targetDiff = 0;
  const side = target.opposes(user) ? 1 : -1;
  if (userDiff > targetDiff) score += 5 * side * Math.max(userDiff - targetDiff, 3);
  else if (targetDiff < userDiff) score -= 5 * side * Math.max(targetDiff - userDiff, 3);
  return score;
});
FT('NegateTargetAbility', (move, user, target) => target.unstoppableAbility() || target.effects.GastroAcid || (target.effects.Substitute > 0 && !move.ignoresSubstitute(user)));
const negateScore = (score, move, user, target) => {
  const r = target.wantsAbility(target.abilityId);
  const side = target.opposes(user) ? 1 : -1;
  if (r > 0) score += 5 * side * Math.max(r, 3);
  else if (r < 0) score -= 5 * side * Math.max(Math.abs(r), 3);
  return score;
};
ET('NegateTargetAbility', (score, move, user, target) => (!target.abilityActive() ? MOVE_USELESS_SCORE : negateScore(score, move, user, target)));
ET('NegateTargetAbilityIfTargetActed', (score, move, user, target) => {
  if (target.effects.Substitute > 0) return score;
  if (target.unstoppableAbility() || !target.abilityActive()) return score;
  if (user.fasterThan(target)) return score;
  return negateScore(score, move, user, target);
});

/* ---------- 공중부양·텔레키네시스·중력 ---------- */
F('StartUserAirborne', (move, user) => user.hasActiveItem('ironball') || user.effects.Ingrain || user.effects.SmackDown || user.effects.MagnetRise > 0);
E('StartUserAirborne', (score, move, user, ai) => {
  if (user.hasType('Flying') || user.hasActiveAbility('levitate') || user.hasActiveItem('airballoon') || user.effects.Telekinesis > 0) return MOVE_USELESS_SCORE;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.hasDamagingMoveOfType('Ground')) continue;
    if (isResistant(user.effectivenessOfTypeAgainstBattler('Ground', b))) continue;
    score += 10;
  }
  if (ai.trainer.mediumSkill() && ai.terrain !== 'None') score -= 8;
  return score;
});
FT('StartTargetAirborneAndAlwaysHitByMoves', (move, user, target) => target.hasActiveItem('ironball') || target.effects.Telekinesis > 0 || target.effects.Ingrain || target.effects.SmackDown ||
  ['diglett', 'dugtrio', 'sandygast', 'palossand'].some(s => target.isSpecies(s)) || target.species === 'gengarmega');
ET('StartTargetAirborneAndAlwaysHitByMoves', (score, move, user, target, ai) => {
  if (target.hasType('Flying') || target.hasActiveAbility('levitate') || target.hasActiveItem('airballoon')) return MOVE_USELESS_SCORE;
  for (const b of ai.eachFoeBattler(target.side)) {
    for (const m of b.moves) {
      const acc = ai.trainer.mediumSkill() ? m.pbBaseAccuracy(b, target) : m.accuracy;
      if (acc < 90 && acc !== 0) score += 5;
      if (acc <= 50 && acc !== 0) score += 5;
    }
    if (!b.hasDamagingMoveOfType('Ground')) continue;
    if (isResistant(target.effectivenessOfTypeAgainstBattler('Ground', b))) continue;
    score -= 7;
  }
  if (ai.trainer.mediumSkill() && ai.terrain !== 'None') score += 8;
  return score;
});
ET('HitsTargetInSkyGroundsTarget', (score, move, user, target, ai) => {
  if (target.effects.Substitute > 0) return score;
  if (!target.airborne()) {
    if (target.fasterThan(user) || !target.inTwoTurnAttack('TwoTurnAttackInvulnerableInSky', 'TwoTurnAttackInvulnerableInSkyParalyzeTarget')) return score;
  }
  score += 10;
  for (const b of ai.eachFoeBattler(target.side)) if (b.hasDamagingMoveOfType('Ground')) score += 8;
  if (ai.trainer.mediumSkill() && ai.terrain !== 'None') score -= 8;
  return score;
});
F('StartGravity', (move, user, ai) => !!ai.battle.field.pseudoWeather?.gravity);
E('StartGravity', (score, move, user, ai) => {
  for (const b of ai.eachBattler()) {
    if (b.airborne()) {
      let change = 10;
      if (ai.trainer.mediumSkill() && ai.terrain !== 'None') change -= 8;
      score += user.opposes(b) ? change : -change;
      for (const b2 of ai.eachFoeBattler(b.side)) if (b2.hasDamagingMoveOfType('Ground')) score += user.opposes(b2) ? -8 : 8;
    }
    if (b.checkForMove(m => m.accuracy < 85)) score += user.opposes(b) ? -8 : 8;
    if (user.fasterThan(b) && b.inTwoTurnAttack('TwoTurnAttackInvulnerableInSky', 'TwoTurnAttackInvulnerableInSkyParalyzeTarget', 'TwoTurnAttackInvulnerableInSkyTargetCannotAct')) score += user.opposes(b) ? 10 : -10;
  }
  return score;
});

/* ---------- 변신 (Gen9 팩) ---------- */
FT('TransformUserIntoTarget', (move, user, target) => user.effects.Transform || target.effects.Transform || target.effects.Illusion);
ET('TransformUserIntoTarget', score => score - 5);
