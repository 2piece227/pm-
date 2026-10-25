/**
 * 어나더레드 Gen9 팩 AI (AI_Move_Rankings · AI_New_Move_Rankings) 이식 — 8·9세대 기술과 기존 핸들러 보강.
 * 기존 핸들러에 한두 줄 더한 부분(글레이브러시 뒤 방어, 제로투히어로 교체)은 원래 핸들러를 감싸서 더한다.
 * 원작 팩은 불꽃몸부림(버닝벙커) 점수를 실수로 독침방어 자리에 덮어썼는데, 여기서는 제자리(ProtectUserBurningBulwark)에 둔다.
 */
import { H, add, copy, handlers, MOVE_USELESS_SCORE, MOVE_BASE_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BP = (code, fn) => add('moveBasePower', code, fn);
const apply = (code, score, move, user, target, ai) => handlers.applyMoveEffectAgainstTargetScore(code, score, move, user, target, ai, ai.battle);
const zeroToHero = b => b.hasActiveAbility('zerotohero') && b.species === 'palafin';
/** 원래 핸들러 결과에 더한다 (무의미 판정이면 그대로) */
const extend = (kind, code, extra) => {
  const base = H[kind].get(code);
  if (!base) return;
  add(kind, code, (score, ...args) => {
    const s = base(score, ...args);
    const v = s ?? score;
    return v === MOVE_USELESS_SCORE ? v : extra(v, ...args);
  });
};

/* ---------- 기존 핸들러 보강 ---------- */
for (const code of ['ProtectUser', 'ProtectUserBanefulBunker', 'ProtectUserFromDamagingMovesKingsShield', 'ProtectUserFromDamagingMovesObstruct',
  'ProtectUserFromTargetingMovesSpikyShield', 'ProtectUserSideFromMultiTargetDamagingMoves'])
  extend('moveEffect', code, (score, move, user) => (user.effects.GlaiveRush > 0 ? score + 20 : score));
extend('moveEffect', 'ProtectUserSideFromPriorityMoves', (score, move, user) => (user.effects.GlaiveRush > 0 ? score + 10 : score));
for (const code of ['SwitchOutUserStatusMove', 'SwitchOutUserDamagingMove', 'SwitchOutUserPassOnEffects'])
  extend('moveEffect', code, (score, move, user) => (zeroToHero(user) ? score + 20 : score));
E('LowerTargetAtkSpAtk1SwitchOutUser', (score, move, user, ai) => (ai.ableReserveCount(user.side) > 0 && zeroToHero(user) ? score + 20 : score));
extend('moveEffectAgainstTarget', 'SwitchOutTargetStatusMove', (score, move, user, target) => (zeroToHero(target) ? score - 20 : score));
extend('moveEffectAgainstTarget', 'SwitchOutTargetDamagingMove', (score, move, user, target) => (zeroToHero(target) ? score - 20 : score));
{
  const base = H.moveEffectAgainstTarget.get('SwitchOutTargetDamagingMove');
  ET('SwitchOutTargetDamagingMove', (score, move, user, target, ai) => (!ai.battle.moldBreaker && target.hasActiveAbility('guarddog') ? score : base(score, move, user, target, ai)));
}
extend('moveEffectAgainstTarget', 'OHKO', (score, move, user, target) => (target.effects.GlaiveRush > 0 ? score + 20 : score));
copy('moveEffectAgainstTarget', 'OHKO', 'OHKOIce', 'OHKOHitsUndergroundTarget');
{
  const base = H.moveFailure.get('HealUserFullyAndFallAsleep');
  F('HealUserFullyAndFallAsleep', (move, user, ai, battle) => user.hasActiveAbility('purifyingsalt') || base(move, user, ai, battle));
}
for (const code of ['SetTargetAbilityToUserAbility', 'UserTargetSwapAbilities']) {
  const base = H.moveFailureAgainstTarget.get(code);
  FT(code, (move, user, target, ai, battle) => (code === 'UserTargetSwapAbilities' ? user : target).hasActiveItem('abilityshield') || base(move, user, target, ai, battle));
}

/* ---------- 레전드 아르세우스 기술 ---------- */
ET('PoisonParalyzeOrSleepTarget', (score, move, user, target, ai) => {
  if (target.hasActiveItem('lumberry')) return score;
  if (target.fasterThan(user) && target.hasActiveAbility('hydration') && ['Rain', 'HeavyRain'].includes(target.effectiveWeather())) return score;
  for (const code of ['PoisonTarget', 'ParalyzeTarget', 'SleepTarget']) {
    const s = apply(code, 0, move, user, target, ai);
    if (s !== MOVE_USELESS_SCORE) score += s / 3;
  }
  return score;
});
BP('DoublePowerIfTargetPoisonedPoisonTarget', (power, move, user, target) => move.pbBaseDamage(power, user, target));
ET('DoublePowerIfTargetPoisonedPoisonTarget', (score, move, user, target, ai) => { const s = apply('PoisonTarget', 0, move, user, target, ai); return s !== MOVE_USELESS_SCORE ? score + s : score; });
BP('DoublePowerIfTargetStatusProblemBurnTarget', (power, move, user, target) => move.pbBaseDamage(power, user, target));
ET('DoublePowerIfTargetStatusProblemBurnTarget', (score, move, user, target, ai) => { const s = apply('BurnTarget', 0, move, user, target, ai); return s !== MOVE_USELESS_SCORE ? score + s : score; });
F('SplintersTargetGen8AddSpikesGen9', (move, user) => user.opposingSide().Spikes >= 3);
E('SplintersTargetGen8AddSpikesGen9', (score, move, user, ai) => {
  score += 15;
  const s = handlers.applyMoveEffectScore('AddSpikesToFoeSide', score, move, user, ai, ai.battle);
  return s !== MOVE_USELESS_SCORE ? score + s : score;
});
F('SplintersTargetGen8AddStealthRocksGen9', (move, user) => user.opposingSide().StealthRock);
E('SplintersTargetGen8AddStealthRocksGen9', (score, move, user, ai) => {
  score += 15;
  const s = handlers.applyMoveEffectScore('AddStealthRocksToFoeSide', score, move, user, ai, ai.battle);
  return s !== MOVE_USELESS_SCORE ? score + s : score;
});
copy('moveFailureAgainstTarget', 'LowerTargetDefense1', 'LowerTargetDefense1FlinchTarget');
ET('LowerTargetDefense1FlinchTarget', (score, move, user, target, ai) => {
  const f = apply('FlinchTarget', 0, move, user, target, ai);
  if (f !== MOVE_USELESS_SCORE) score += f;
  return ai.getScoreForTargetStatDrop(score, target, ['def', 1], false);
});
F('RaiseUserAtkDefSpd1', (move, user) => {
  if (move.damagingMove()) return false;
  for (let i = 0; i < move.statUp.length; i += 2) if (user.canRaiseStatStage(move.statUp[i], user, move)) return false;
  return true;
});
/* 원작 팩은 '대상 점수' 표에 복사해 사실상 효과 점수가 없다 — 그대로 둔다 */
FT('RaiseUserSpAtkSpDef1CureStatus', (move, user, target) => {
  for (let i = 0; i < move.statUp.length; i += 2) if (user.canRaiseStatStage(move.statUp[i], user, move)) return false;
  return !target.status;
});
ET('RaiseUserSpAtkSpDef1CureStatus', (score, move, user, target, ai) => {
  if (target.status) score += target.wantsStatusProblem(target.status) ? -10 : 10;
  score = ai.getScoreForTargetStatRaise(score, user, ['spa', 1], false);
  return ai.getScoreForTargetStatDrop(score, user, ['spd', 1], false);
});

/* ---------- 스칼렛·바이올렛 기술 ---------- */
copy('moveEffect', 'RemoveScreens', 'TypeIsUserSecondTypeRemoveScreens');
for (const c of ['IncreasePowerEachFaintedAlly', 'IncreasePowerEachTimeHit', 'IncreasePowerSuperEffective']) BP(c, (power, move, user, target) => move.pbBaseDamage(power, user, target));
copy('moveBasePower', 'HitTwoTimes', 'HitThreeTimes');
copy('moveEffectAgainstTarget', 'HitTwoTimes', 'HitThreeTimes');
BP('HitTenTimes', (power, move, user) => (user.hasActiveItem('loadeddice') ? power * 7 : power * 10));
ET('HitTenTimes', (score, move, user, target) => {
  if (target.effects.Substitute > 0 && !move.ignoresSubstitute(user) && target.effects.Substitute < move.roughDamage() / 2) score += 10;
  return score;
});
ET('CrashDamageIfFailsConfuseTarget', (score, move, user, target, ai) => {
  if (user.takesIndirectDamage()) score -= Math.trunc(0.6 * (100 - move.roughAccuracy()));
  return apply('ConfuseTarget', score, move, user, target, ai);
});
ET('UserVulnerableUntilNextAction', (score, move, user, target, ai) => (ai.trainer.highSkill() && user.checkForMove(m => /^ProtectUser/.test(m.functionCode)) ? score + 20 : score));
add('generalMove', 'protect_after_glaive_rush', (score, move, user, ai) => {
  if (ai.trainer.highSkill() && user.effects.GlaiveRush > 0) {
    if (['ProtectUser', 'ProtectUserBanefulBunker', 'ProtectUserFromDamagingMovesKingsShield', 'ProtectUserFromDamagingMovesObstruct',
      'ProtectUserFromTargetingMovesSpikyShield', 'ProtectUserSideFromDamagingMovesIfUserFirstTurn', 'ProtectUserBurningBulwark'].includes(move.functionCode)) score += 20;
    else if (['ProtectUserSideFromPriorityMoves', 'ProtectUserSideFromMultiTargetDamagingMoves'].includes(move.functionCode)) score += 15;
  }
  return score;
});
/* 기가톤해머 — 연속 사용 불가 */
F('CantSelectConsecutiveTurns', (move, user) => user.lastMoveUsed === move.id);
ET('CantSelectConsecutiveTurns', (score, move, user) => (user.hasActiveItem(['choiceband', 'choicespecs', 'choicescarf']) || user.hasActiveAbility('gorillatactics') || user.effects.Encore > 0 ? score - 40 : score));
copy('moveEffect', 'LowerUserSpAtk1', 'AddMoneyGainedFromBattleLowerUserSpAtk1');
F('UserLosesElectricType', (move, user) => !user.hasType('Electric'));
ET('StartSaltCureTarget', (score, move, user, target, ai) => {
  if (target.effects.SaltCure) return score;
  if (target.turnCount < 2) score += 20;
  if (target.takesIndirectDamage()) score += 10;
  const eor = target.roughEndOfRoundDamage();
  if (eor > 0) score += 10; else if (eor < 0) score -= 10;
  if (ai.trainer.mediumSkill()) {
    if (!user.checkForMove(m => m.damagingMove())) score += 10;
    if (ai.ableReserveCount(target.side) === 0) score += 8;
  }
  if (ai.trainer.highSkill() && user.checkForMove(m => /^ProtectUser/.test(m.functionCode))) score += 10;
  return score;
});
/* 실크트랩·불꽃몸부림 — 방어 계열 */
const protectWith = extra => (score, move, user, ai) => {
  if (user.effects.ProtectRate >= 4) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.canProtectAgainst())) continue;
    if (b.hasActiveAbility('unseenfist') && b.checkForMove(m => m.contactMove())) continue;
    useless = false;
    score += 7;
    score = extra(score, b, move, user, ai);
    const tt = b.effects.TwoTurnAttack;
    if (tt && ai.gen.moves.get(tt).flags?.protect) score += 15;
    const d = b.roughEndOfRoundDamage();
    if (d > 0) score += 8; else if (d < 0) score -= 8;
  }
  if (useless) return MOVE_USELESS_SCORE;
  const d = user.roughEndOfRoundDamage();
  if (d >= user.hp) return MOVE_USELESS_SCORE;
  if (d > 0) score -= 8; else if (d < 0) score += 8;
  score -= (user.effects.ProtectRate - 1) * 15;
  if (user.effects.GlaiveRush > 0) score += 20;
  return score;
};
E('ProtectUserFromDamagingMovesSilkTrap', protectWith((score, b, move, user, ai) => {
  if (b.affectedByContactEffect() && b.checkForMove(m => m.contactMove())) score += ai.getScoreForTargetStatDrop(0, b, ['spe', 1], false) / 2;
  return score;
}));
E('ProtectUserBurningBulwark', protectWith((score, b, move, user, ai) => {
  if (b.checkForMove(m => m.contactMove())) {
    const s = handlers.applyMoveEffectAgainstTargetScore('BurnTarget', 0, move, user, b, ai, ai.battle);
    if (s !== MOVE_USELESS_SCORE) score += s / 2;
  }
  return score;
}));
ET('RaiseUserStat1Commander', score => score);
FT('RaiseTargetAtkLowerTargetDef2', (move, user, target) => !target.canRaiseStatStage('atk', target, move) && !target.canLowerStatStage('def', target, move));
ET('RaiseTargetAtkLowerTargetDef2', (score, move, user, target, ai) => {
  score = ai.getScoreForTargetStatRaise(score, target, ['atk', 2], false);
  return ai.getScoreForTargetStatDrop(score, target, ['def', 2], false);
});
F('RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP', (move, user) => user.hp <= Math.max(Math.floor(user.totalhp / 2), 1) || !['atk', 'spa', 'spe'].some(s => user.canRaiseStatStage(s, user, move)));
E('RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, ['atk', 2, 'spa', 2, 'spe', 2]);
  if (ai.trainer.hasSkillFlag('HPAware')) score -= 60 * (1 - user.hp / user.totalhp);
  return score;
});
const hazardsOn = s => s.Spikes > 0 || s.ToxicSpikes > 0 || s.StealthRock || s.StickyWeb || s.Steelsurge;
FT('RaiseUserAtkSpd1RemoveHazardsSubstitutes', (move, user, target, ai) => {
  if (['atk', 'spe'].some(s => user.canRaiseStatStage(s, user, move))) return false;
  if (hazardsOn(user.ownSide()) || hazardsOn(user.opposingSide())) return false;
  return !ai.eachBattler().some(b => b.effects.Substitute > 0);
});
E('RaiseUserAtkSpd1RemoveHazardsSubstitutes', (score, move, user, ai) => {
  score = handlers.applyMoveEffectScore('RaiseUserAtkSpd1', score, move, user, ai, ai.battle);
  if (ai.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
    const s = user.ownSide();
    if (s.Spikes > 0) score += 15; if (s.ToxicSpikes > 0) score += 15; if (s.StealthRock) score += 20; if (s.StickyWeb) score += 15;
  }
  if (ai.pbAbleNonActiveCount(user.idxOpposingSide()) > 0) {
    const s = user.opposingSide();
    if (s.Spikes > 0) score -= 15; if (s.ToxicSpikes > 0) score -= 15; if (s.StealthRock) score -= 20; if (s.StickyWeb) score -= 15;
  }
  for (const b of ai.eachFoeBattler(user.side)) if (b.effects.Substitute > 0) score += 10;
  for (const b of ai.eachSameSideBattler(user.side)) if (b.effects.Substitute > 0) score -= 10;
  return score;
});
E('RemoveUserBindingAndEntryHazardsPoisonTarget', (score, move, user, ai) => {
  if (user.effects.Trapping > 0) score += 10;
  if (user.effects.LeechSeed >= 0) score += 15;
  if (ai.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
    const s = user.ownSide();
    if (s.Spikes > 0) score += 15; if (s.ToxicSpikes > 0) score += 15; if (s.StealthRock) score += 20; if (s.StickyWeb) score += 15;
  }
  for (const b of ai.eachFoeBattler(user.side)) {
    const p = handlers.applyMoveEffectAgainstTargetScore('PoisonTarget', 0, move, user, b, ai, ai.battle);
    if (p !== MOVE_USELESS_SCORE) score += p;
  }
  return score;
});
copy('moveEffect', 'RemoveTerrain', 'RemoveTerrainIceSpinner');
F('SwitchOutUserStartHailWeather', (move, user, ai) => ai.ableReserveCount(user.side) === 0 && ['HarshSun', 'HeavyRain', 'StrongWinds', 'Hail'].includes(ai.weather));
E('SwitchOutUserStartHailWeather', (score, move, user, ai) => {
  const sw = handlers.applyMoveEffectScore('SwitchOutUserStatusMove', score, move, user, ai, ai.battle);
  if (sw !== MOVE_USELESS_SCORE) score += sw;
  const hail = handlers.applyMoveEffectScore('StartHailWeather', score, move, user, ai, ai.battle);
  if (hail !== MOVE_USELESS_SCORE) score += hail;
  return score;
});
F('UserMakeSubstituteSwitchOut', (move, user) => user.effects.Substitute > 0 || user.hp <= Math.max(Math.floor(user.totalhp / 2), 1));
E('UserMakeSubstituteSwitchOut', (score, move, user, ai) => {
  const sw = handlers.applyMoveEffectScore('SwitchOutUserStatusMove', 0, move, user, ai, ai.battle);
  if (sw !== MOVE_USELESS_SCORE) score += sw;
  const sub = handlers.applyMoveEffectScore('UserMakeSubstitute', 0, move, user, ai, ai.battle);
  if (sub !== MOVE_USELESS_SCORE) score += sub;
  return score;
});
FT('SetUserAlliesAbilityToTargetAbility', (move, user, target) => !target.abilityId || target.ungainableAbility() || user.abilityId === target.abilityId || user.unstoppableAbility());
ET('SetUserAlliesAbilityToTargetAbility', (score, move, user, target, ai) => {
  for (const b of ai.eachSameSideBattler(user.side)) {
    if (!b.abilityActive()) continue;
    const o = b.wantsAbility(b.abilityId), n = b.wantsAbility(target.abilityId);
    if (o > n) score += 5 * Math.max(o - n, 3);
    else if (o < n) score -= 5 * Math.max(n - o, 3);
  }
  return score;
});
F('RevivePokemonHalfHP', (move, user, ai) => !ai.side.pokemon.some(p => p.fainted || p.hp <= 0));
E('RevivePokemonHalfHP', (score, move, user, ai) => MOVE_BASE_SCORE + 12 * ai.side.pokemon.filter(p => p.fainted || p.hp <= 0).length);
copy('moveFailureAgainstTarget', 'BurnTarget', 'StarmobileBurnTarget');
copy('moveEffectAgainstTarget', 'BurnTarget', 'StarmobileBurnTarget');
copy('moveFailureAgainstTarget', 'ParalyzeTarget', 'StarmobileParalyzeTarget');
copy('moveEffectAgainstTarget', 'ParalyzeTarget', 'StarmobileParalyzeTarget');
copy('moveFailureAgainstTarget', 'ConfuseTarget', 'StarmobileConfuseTarget');
copy('moveEffectAgainstTarget', 'ConfuseTarget', 'StarmobileConfuseTarget');
copy('moveFailureAgainstTarget', 'PoisonTarget', 'StarmobilePoisonTarget');
copy('moveEffectAgainstTarget', 'PoisonTarget', 'StarmobilePoisonTarget');
copy('moveFailureAgainstTarget', 'SleepTarget', 'StarmobileSleepTarget');
copy('moveEffectAgainstTarget', 'SleepTarget', 'StarmobileSleepTarget');
ET('IncreasePowerInSunWeather', (score, move, user) => (['Sun', 'HarshSun'].includes(user.effectiveWeather()) ? score + 20 : score));
ET('IncreasePowerInElectricTerrain', (score, move, user, target, ai) => (ai.terrain === 'Electric' && user.affectedByTerrain() ? score + 20 : score));
ET('HealUserByHalfOfDamageDoneBurnTarget', (score, move, user, target, ai) => {
  score = apply('HealUserByHalfOfDamageDone', score, move, user, target, ai);
  const b = apply('BurnTarget', 0, move, user, target, ai);
  return b !== MOVE_USELESS_SCORE ? score + b : score;
});
ET('LowerTargetSpeedOverTime', (score, move, user, target) => score + 5 * (6 - 3));
ET('TwoTurnAttackOneTurnInRainRaiseUserSpAtk1', (score, move, user, target, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, ['spa', 1], false);
  if (['Rain', 'HeavyRain'].includes(user.effectiveWeather())) return score;
  return apply('TwoTurnAttack', score, move, user, target, ai);
});
FT('RaiseAlliesCriticalHitRate1DragonTypes2', () => true);
ET('ConfuseTargetIfTargetStatsRaisedThisTurn', (score, move, user, target, ai) => {
  if (!target.mon?.statsRaisedThisTurn || !target.canConfuse(user, move)) return score;
  return score + apply('ConfuseTarget', score, move, user, target, ai);
});
copy('moveBasePower', 'PowerHigherWithUserHP', 'PowerHigherWithTargetHP100PowerRange');
BP('PowerHigherWithTargetHP100PowerRange', (power, move, user, target) => move.pbBaseDamage(power, user, target));
ET('CrashDamageIfFails', (score, move, user, target, ai) => apply('CrashDamageIfFailsUnusableInGravity', score, move, user, target, ai));
FT('DisableTargetHealingMoves2Turns', (move, user, target) => target.effects.HealBlock > 0);
ET('DisableTargetHealingMoves2Turns', (score, move, user, target) => (target.checkForMove(m => m.healingMove()) || target.hasActiveItem('leftovers') || (target.hasActiveItem('blacksludge') && target.hasType('Poison')) ? score + 10 : score));
FT('FlinchTargetFailsIfTargetNotUsingPriorityMove', (move, user, target) => !target.canAttack() && !target.checkForMove(m => m.pbPriority(target) > 0));
ET('FlinchTargetFailsIfTargetNotUsingPriorityMove', (score, move, user, target, ai) => {
  if (!target.checkForMove(m => m.damagingMove() && m.priority > 0)) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp <= target.totalhp / 2) score -= 10;
    if (target.hp <= target.totalhp / 4) score -= 10;
  }
  const f = apply('FlinchTarget', 0, move, user, target, ai);
  return f !== MOVE_USELESS_SCORE ? score + f : score;
});
