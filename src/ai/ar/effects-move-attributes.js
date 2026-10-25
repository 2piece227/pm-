/**
 * 원작 AI_MoveEffects_MoveAttributes 이식 — 고정 피해·일격기·변동 위력·급소·방어 계열·반동·벽.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE } from './handlers.js';
import { effectiveness, isIneffective } from './battler.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BP = (code, fn) => add('moveBasePower', code, fn);
const fixed = (power, move, user, target) => move.pbFixedDamage(user, target);
const base = (power, move, user, target) => move.pbBaseDamage(power, user, target);
const modify = (power, move, user, target) => Math.round(power * move.pbModifyDamage(1, user, target));

for (const c of ['FixedDamage20', 'FixedDamage40', 'FixedDamageHalfTargetHP', 'FixedDamageUserLevel', 'LowerTargetHPToUserHP']) BP(c, fixed);
BP('FixedDamageUserLevelRandom', (power, move, user) => user.level);
FT('LowerTargetHPToUserHP', (move, user, target) => user.hp >= target.hp);

FT('OHKO', (move, user, target, ai) => target.level > user.level || (!ai.battle.moldBreaker && target.hasActiveAbility('sturdy')));
BP('OHKO', (power, move, user, target) => target.hp);
ET('OHKO', (score, move, user, target, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware') && user.checkForMove(m => m.damagingMove() && !m.isOHKO())) {
    if (target.hp <= target.totalhp / 2) score -= 12;
    if (target.hp <= target.totalhp / 4) score -= 8;
  }
  return score;
});
FT('OHKOIce', (move, user, target, ai) => target.hasType('Ice') || handlers.moveWillFailAgainstTarget('OHKO', move, user, target, ai, ai.battle));
copy('moveBasePower', 'OHKO', 'OHKOIce', 'OHKOHitsUndergroundTarget');
copy('moveEffectAgainstTarget', 'OHKO', 'OHKOIce', 'OHKOHitsUndergroundTarget');
copy('moveFailureAgainstTarget', 'OHKO', 'OHKOHitsUndergroundTarget');

ET('DamageTargetAlly', score => score);

for (const c of ['PowerHigherWithUserHP', 'PowerLowerWithUserHP', 'PowerHigherWithTargetHP', 'PowerHigherWithUserHappiness', 'PowerLowerWithUserHappiness',
  'PowerHigherWithUserPositiveStatStages', 'PowerHigherWithTargetPositiveStatStages', 'PowerHigherWithUserFasterThanTarget', 'PowerHigherWithTargetFasterThanUser',
  'PowerHigherWithTargetWeight', 'PowerHigherWithUserHeavierThanTarget', 'DoublePowerIfTargetHPLessThanHalf', 'DoublePowerIfUserPoisonedBurnedParalyzed',
  'DoublePowerIfTargetAsleepCureTarget', 'DoublePowerIfTargetPoisoned', 'DoublePowerIfTargetParalyzedCureTarget', 'DoublePowerIfTargetStatusProblem',
  'DoublePowerIfTargetInSky', 'DoublePowerInElectricTerrain', 'DoublePowerIfUserLastMoveFailed', 'DoublePowerIfAllyFaintedLastTurn',
  'TypeDependsOnUserIVs', 'TypeAndPowerDependOnWeather', 'TypeAndPowerDependOnTerrain']) BP(c, base);

BP('PowerHigherWithLessPP', (power, move) => {
  if (move.pp === 0 && move.totalPp > 0) return 0;
  const dmgs = [200, 80, 60, 50, 40];
  return dmgs[Math.min(move.pp - 1, dmgs.length - 1)];
});
FT('PowerHigherWithTargetWeight', () => false);
FT('PowerHigherWithUserHeavierThanTarget', () => false);

BP('PowerHigherWithConsecutiveUse', (power, move, user) => power << user.effects.FuryCutter);
E('PowerHigherWithConsecutiveUse', (score, move, user) => {
  if (user.effects.FuryCutter > 0) score += 10;
  if (user.hasActiveItem('metronome')) score += 7;
  return score;
});
BP('PowerHigherWithConsecutiveUseOnUserSide', (power, move, user) => power * (user.ownSide().EchoedVoiceCounter + 1));

BP('RandomPowerDoublePowerIfTargetUnderground', (power, move, user, target) => modify(71, move, user, target));
ET('DoublePowerIfTargetAsleepCureTarget', (score, move, user, target) => {
  if (target.status === 'slp' && target.statusCount > 1) score += target.wantsStatusProblem('slp') ? 15 : -10;
  return score;
});
ET('DoublePowerIfTargetParalyzedCureTarget', (score, move, user, target) => {
  if (target.status === 'par') score += target.wantsStatusProblem('par') ? 15 : -10;
  return score;
});
BP('DoublePowerIfUserHasNoItem', (power, move, user) => (!user.item || user.hasActiveItem('flyinggem') ? power * 2 : power));
BP('DoublePowerIfTargetUnderwater', modify);
BP('DoublePowerIfTargetUnderground', modify);

E('DoublePowerIfUserLostHPThisTurn', (score, move, user, ai) => {
  for (const b of ai.eachFoeBattler(user.side)) { if (user.fasterThan(b) || !b.canAttack()) continue; score += 8; }
  return score;
});
ET('DoublePowerIfTargetLostHPThisTurn', score => score);
ET('DoublePowerIfTargetActed', (score, move, user, target) => (target.fasterThan(user) ? score + 10 : score));
ET('DoublePowerIfTargetNotActed', (score, move, user, target) => (user.fasterThan(target) ? score + 10 : score));

E('EnsureNextCriticalHit', (score, move, user) => {
  if (user.effects.LaserFocus > 0) return MOVE_USELESS_SCORE;
  let crit = user.ownSide().LuckyChant > 0 ? -1 : 0;
  if (crit >= 0 && user.abilityActive() && user.abilityId === 'superluck') crit += 1;
  if (crit >= 0 && user.itemActive() && ['scopelens', 'razorclaw'].includes(user.itemId)) crit += 1;
  if (crit >= 0 && crit < 50) crit = Math.min(crit + user.effects.FocusEnergy, 3);
  if (crit < 0 || crit >= 3) return MOVE_USELESS_SCORE;
  if (user.checkForMove(m => m.damagingMove() && m.functionCode !== 'AlwaysCriticalHit')) score += 15;
  return score;
});
F('StartPreventCriticalHitsAgainstUserSide', (move, user) => user.ownSide().LuckyChant > 0);
E('StartPreventCriticalHitsAgainstUserSide', (score, move, user, ai) => {
  const immune = ai.eachSameSideBattler(user.side).every(b => b.hasActiveAbility(['battlearmor', 'shellarmor']));
  if (immune) return MOVE_USELESS_SCORE;
  for (const b of ai.eachFoeBattler(user.side)) {
    let crit = 0;
    if (b.hasActiveAbility('superluck')) crit += 1;
    if (b.hasActiveItem(['scopelens', 'razorclaw'])) crit += 1;
    crit += b.effects.FocusEnergy;
    if (b.checkForMove(m => m.highCriticalRate())) crit += 1;
    if (b.checkForMove(m => m.pbCritialOverride() > 0)) crit = 99;
    crit = Math.min(crit, 3);
    if (crit > 0) score += 8 * crit;
    if (b.effects.LaserFocus > 0) score += 10;
  }
  return score;
});

FT('CannotMakeTargetFaint', (move, user, target) => target.hp === 1);

E('UserEnduresFaintingThisTurn', (score, move, user, ai) => {
  if (user.roughEndOfRoundDamage() > 0) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) { if (!b.canAttack()) continue; score += 5; useless = false; }
  if (useless) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp >= user.totalhp / 2) score -= 15;
    else if (user.hp <= user.totalhp / 4) score += 8;
  }
  score -= (user.effects.ProtectRate - 1) * 8;
  return score;
});

/* 흙놀이·물놀이 */
const sportScore = type => (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp <= user.totalhp / 2) score -= Math.trunc(20 * (0.75 - user.hp / user.totalhp));
  let any = false;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.hasDamagingMoveOfType(type)) continue;
    score += 15;
    if (!b.checkForMove(m => m.damagingMove() && m.pbCalcType(b) !== type)) score += 7;
    any = true;
  }
  if (!any) return MOVE_USELESS_SCORE;
  for (const b of ai.eachSameSideBattler(user.side)) {
    if (!b.hasDamagingMoveOfType(type)) continue;
    score -= 10;
    if (!b.checkForMove(m => m.damagingMove() && m.pbCalcType(b) !== type)) score -= 5;
  }
  return score;
};
F('StartWeakenElectricMoves', (move, user, ai) => !!ai.battle.field.pseudoWeather?.mudsport);
E('StartWeakenElectricMoves', sportScore('Electric'));
F('StartWeakenFireMoves', (move, user, ai) => !!ai.battle.field.pseudoWeather?.watersport);
E('StartWeakenFireMoves', sportScore('Fire'));

/* 리플렉터·빛의장막·오로라베일 */
const lowHpPenalty = (score, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware') && ai.pbAbleNonActiveCount(user.idxOwnSide()) === 0 && user.hp <= user.totalhp / 2)
    score -= Math.trunc(20 * (0.75 - user.hp / user.totalhp));
  return score;
};
F('StartWeakenPhysicalDamageAgainstUserSide', (move, user) => user.ownSide().Reflect > 0);
E('StartWeakenPhysicalDamageAgainstUserSide', (score, move, user, ai) => {
  if (user.ownSide().AuroraVeil > 0) return MOVE_USELESS_SCORE;
  score = lowHpPenalty(score, user, ai);
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.checkForMove(m => m.physicalMove())) continue;
    score += 10;
    if (!b.checkForMove(m => m.specialMove())) score += 8;
  }
  if (user.hasActiveItem('lightclay')) score += 5;
  return score;
});
F('StartWeakenSpecialDamageAgainstUserSide', (move, user) => user.ownSide().LightScreen > 0);
E('StartWeakenSpecialDamageAgainstUserSide', (score, move, user, ai) => {
  if (user.ownSide().AuroraVeil > 0) return MOVE_USELESS_SCORE;
  score = lowHpPenalty(score, user, ai);
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.checkForMove(m => m.specialMove())) continue;
    score += 10;
    if (!b.checkForMove(m => m.physicalMove())) score += 8;
  }
  if (user.hasActiveItem('lightclay')) score += 5;
  return score;
});
F('StartWeakenDamageAgainstUserSideIfHail', (move, user) => user.ownSide().AuroraVeil > 0 || user.effectiveWeather() !== 'Hail');
E('StartWeakenDamageAgainstUserSideIfHail', (score, move, user, ai) => {
  if (user.ownSide().Reflect > 0 && user.ownSide().LightScreen > 0) return MOVE_USELESS_SCORE;
  score = lowHpPenalty(score, user, ai);
  if (user.hasActiveItem('lightclay')) score += 5;
  return score + 15;
});
E('RemoveScreens', (score, move, user, ai) => {
  const foe = user.opposingSide();
  if (foe.Reflect > 1 || foe.AuroraVeil > 1) for (const b of ai.eachSameSideBattler(user.side)) if (b.checkForMove(m => m.physicalMove())) score += 10;
  if (foe.LightScreen > 1 || foe.AuroraVeil > 1) for (const b of ai.eachSameSideBattler(user.side)) if (b.checkForMove(m => m.specialMove())) score += 10;
  return score;
});

/* ---------- 방어 계열 ---------- */
const twoTurnProtectable = b => {
  const tt = b.effects.TwoTurnAttack;
  return !!tt && !!b.ai.gen.moves.get(tt).flags?.protect;
};
const eorAdjust = (score, b) => { const d = b.roughEndOfRoundDamage(); if (d > 0) score += 8; else if (d < 0) score -= 8; return score; };
const userEor = (score, user) => {
  const d = user.roughEndOfRoundDamage();
  if (d >= user.hp) return null;
  if (d > 0) score -= 8; else if (d < 0) score += 8;
  return score;
};
const protectFamily = ({ damagingOnly = false, extra = null, after = null }) => (score, move, user, ai) => {
  if (user.effects.ProtectRate >= 4) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => (!damagingOnly || m.damagingMove()) && m.canProtectAgainst())) continue;
    if (b.hasActiveAbility('unseenfist') && b.checkForMove(m => m.contactMove())) continue;
    useless = false;
    score += 7;
    if (extra) score = extra(score, b, move, user, ai);
    if (twoTurnProtectable(b)) score += 15;
    score = eorAdjust(score, b);
  }
  if (useless) return MOVE_USELESS_SCORE;
  const s = userEor(score, user);
  if (s === null) return MOVE_USELESS_SCORE;
  score = s - (user.effects.ProtectRate - 1) * 15;
  if (after) score = after(score, user);
  return score;
};
E('ProtectUser', protectFamily({}));
E('ProtectUserBanefulBunker', protectFamily({ extra: (score, b, move, user, ai) => {
  if (b.checkForMove(m => m.contactMove())) {
    const p = handlers.applyMoveEffectAgainstTargetScore('PoisonTarget', 0, move, user, b, ai, ai.battle);
    if (p !== MOVE_USELESS_SCORE) score += p / 2;
  }
  return score;
} }));
E('ProtectUserFromDamagingMovesKingsShield', protectFamily({ damagingOnly: true, extra: (score, b, move, user, ai) => {
  if (b.affectedByContactEffect() && b.checkForMove(m => m.contactMove())) score += ai.getScoreForTargetStatDrop(0, b, ['atk', 1], false) / 2;
  return score;
}, after: (score, user) => (user.species === 'aegislash' && user.abilityId === 'stancechange' ? score + 10 : score) }));
E('ProtectUserFromDamagingMovesObstruct', protectFamily({ damagingOnly: true, extra: (score, b, move, user, ai) => {
  if (b.affectedByContactEffect() && b.checkForMove(m => m.contactMove())) score += ai.getScoreForTargetStatDrop(0, b, ['def', 2], false) / 2;
  return score;
} }));
E('ProtectUserFromTargetingMovesSpikyShield', protectFamily({ extra: (score, b) => (b.affectedByContactEffect() && b.checkForMove(m => m.contactMove()) ? score + 5 : score) }));

F('ProtectUserSideFromDamagingMovesIfUserFirstTurn', (move, user) => user.turnCount > 0);
E('ProtectUserSideFromDamagingMovesIfUserFirstTurn', (score, move, user, ai) => {
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.damagingMove() && m.canProtectAgainst())) continue;
    if (b.hasActiveAbility('unseenfist') && b.checkForMove(m => m.contactMove())) continue;
    useless = false;
    score += 7;
    if (twoTurnProtectable(b)) score += 15;
    score = eorAdjust(score, b);
  }
  if (useless) return MOVE_USELESS_SCORE;
  const s = userEor(score, user);
  if (s === null) return MOVE_USELESS_SCORE;
  return s + 25;
});
F('ProtectUserSideFromStatusMoves', (move, user) => user.ownSide().CraftyShield);
E('ProtectUserSideFromStatusMoves', (score, move, user, ai) => {
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.statusMove() && m.pbTarget().foe && m.pbTarget().num === 1)) continue;
    useless = false;
    score += 5;
    score = eorAdjust(score, b);
  }
  if (useless) return MOVE_USELESS_SCORE;
  const s = userEor(score, user);
  return s === null ? MOVE_USELESS_SCORE : s;
});
F('ProtectUserSideFromPriorityMoves', (move, user) => user.ownSide().QuickGuard);
E('ProtectUserSideFromPriorityMoves', (score, move, user, ai) => {
  if (user.effects.ProtectRate >= 4) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.canAttack()) continue;
    if (!b.checkForMove(m => m.pbPriority(b) > 0 && m.canProtectAgainst())) continue;
    useless = false;
    score += 7;
    score = eorAdjust(score, b);
  }
  if (useless) return MOVE_USELESS_SCORE;
  const s = userEor(score, user);
  if (s === null) return MOVE_USELESS_SCORE;
  return s - (user.effects.ProtectRate - 1) * 15;
});
F('ProtectUserSideFromMultiTargetDamagingMoves', (move, user) => user.ownSide().WideGuard);
E('ProtectUserSideFromMultiTargetDamagingMoves', (score, move, user, ai) => {
  if (user.effects.ProtectRate >= 4) return MOVE_USELESS_SCORE;
  let useless = true;
  for (const b of ai.eachBattler()) {
    if (b.index === user.index || !b.canAttack()) continue;
    if (!b.checkForMove(m => m.pbTarget().num > 1)) continue;
    useless = false;
    score += 7;
    const d = b.roughEndOfRoundDamage();
    if (d > 0) score += b.opposes(user) ? 8 : -8;
    else if (d < 0) score -= b.opposes(user) ? 8 : -8;
  }
  if (useless) return MOVE_USELESS_SCORE;
  const s = userEor(score, user);
  if (s === null) return MOVE_USELESS_SCORE;
  return s - (user.effects.ProtectRate - 1) * 15;
});
const PROTECTS = ['ProtectUser', 'ProtectUserBanefulBunker', 'ProtectUserFromDamagingMovesKingsShield', 'ProtectUserFromDamagingMovesObstruct',
  'ProtectUserFromTargetingMovesSpikyShield', 'ProtectUserFromDamagingMovesSilkTrap', 'ProtectUserFromDamagingMovesBurningBulwark',
  'ProtectUserSideFromStatusMoves', 'ProtectUserSideFromDamagingMovesIfUserFirstTurn'];
ET('RemoveProtections', (score, move, user, target) => (target.checkForMove(m => PROTECTS.includes(m.functionCode)) ? score + 7 : score));
copy('moveEffectAgainstTarget', 'RemoveProtections', 'RemoveProtectionsBypassSubstitute');
F('HoopaRemoveProtectionsBypassSubstituteLowerUserDef1', (move, user) => user.species !== 'hoopaunbound');
ET('HoopaRemoveProtectionsBypassSubstituteLowerUserDef1', (score, move, user, target, ai) => {
  score = handlers.applyMoveEffectAgainstTargetScore('RemoveProtections', score, move, user, target, ai, ai.battle);
  return ai.getScoreForTargetStatDrop(score, user, move.statDown, false);
});

/* ---------- 반동 ---------- */
const recoil = (div, also = null) => (score, move, user, target, ai) => {
  if (user.takesIndirectDamage() && !user.hasActiveAbility('rockhead')) {
    const dmg = move.roughDamage() / div;
    if (dmg >= user.hp) {
      const reserves = ai.pbAbleNonActiveCount(user.idxOwnSide()), foes = ai.pbAbleNonActiveCount(user.idxOpposingSide());
      if (reserves <= foes) return MOVE_USELESS_SCORE;
    }
    score -= 25 * Math.min(dmg, user.hp) / user.hp;
  } else if (!also) return score;
  if (also) {
    const s = handlers.applyMoveEffectAgainstTargetScore(also, 0, move, user, target, ai, ai.battle);
    if (s !== MOVE_USELESS_SCORE) score += s;
  }
  return score;
};
ET('RecoilQuarterOfDamageDealt', recoil(4));
ET('RecoilThirdOfDamageDealtParalyzeTarget', recoil(3, 'ParalyzeTarget'));
ET('RecoilThirdOfDamageDealtBurnTarget', recoil(3, 'BurnTarget'));
ET('RecoilHalfOfDamageDealt', recoil(2));

BP('EffectivenessIncludesFlyingType', (power, move, user, target, ai) => Math.round(power * effectiveness(ai.gen, 'Flying', target.pbTypes())));
copy('moveEffectAgainstTarget', 'PoisonTarget', 'CategoryDependsOnHigherDamagePoisonTarget');

F('EnsureNextMoveAlwaysHits', (move, user) => user.effects.LockOn > 0);
ET('EnsureNextMoveAlwaysHits', (score, move, user, target, ai) => {
  if (user.hasActiveAbility('noguard') || target.hasActiveAbility('noguard')) return MOVE_USELESS_SCORE;
  if (target.effects.Telekinesis > 0) return MOVE_USELESS_SCORE;
  for (const m of user.moves) {
    if (target.effects.Minimize && m.tramplesMinimize()) continue;
    const acc = ai.trainer.mediumSkill() ? m.pbBaseAccuracy(user, target) : m.accuracy;
    if (acc < 90 && acc !== 0) score += 5;
    if (acc <= 50 && acc !== 0) score += 8;
    if (m.isOHKO()) score += 8;
  }
  if (target.stage('evasion') > 0) score += 5 * target.stage('evasion');
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (user.hp < user.totalhp / 2) score -= 10;
    if (target.hp < target.totalhp / 2) score -= 8;
  }
  return score;
});
ET('StartNegateTargetEvasionStatStageAndGhostImmunity', (score, move, user, target, ai) => {
  if (target.effects.Foresight || user.hasActiveAbility('scrappy')) return MOVE_USELESS_SCORE;
  if (target.hasType('Ghost')) for (const m of user.moves) if (m.damagingMove() && isIneffective(effectiveness(ai.gen, m.pbCalcType(user), ['Ghost']))) score += 10;
  if (target.stage('evasion') > 0) score += 10 * target.stage('evasion');
  return score;
});
ET('StartNegateTargetEvasionStatStageAndDarkImmunity', (score, move, user, target, ai) => {
  if (target.effects.MiracleEye) return MOVE_USELESS_SCORE;
  if (target.hasType('Dark')) for (const m of user.moves) if (m.damagingMove() && isIneffective(effectiveness(ai.gen, m.pbCalcType(user), ['Dark']))) score += 10;
  if (target.stage('evasion') > 0) score += 10 * target.stage('evasion');
  return score;
});

F('TypeAndPowerDependOnUserBerry', (move, user, ai) => {
  if (!user.item || !user.isBerry() || !user.itemActive()) return true;
  return !ai.gen.items.get(user.item).naturalGift;
});
BP('TypeAndPowerDependOnUserBerry', (power, move, user, target) => { const r = move.pbBaseDamage(1, user, target); return r === 1 ? 0 : r; });

F('TypeDependsOnUserMorpekoFormRaiseUserSpeed1', (move, user) => !user.isSpecies('morpeko'));

FT('TargetMovesBecomeElectric', (move, user, target) => !user.fasterThan(target));
ET('TargetMovesBecomeElectric', (score, move, user, target) => {
  let elec = user.effectivenessOfTypeAgainstBattler('Electric', target);
  if (target.hasType('Electric')) elec *= 1.5;
  if (user.hasActiveAbility(['lightningrod', 'motordrive', 'voltabsorb'])) elec = 0;
  let oldBetter = 0, elecBetter = 0;
  for (const m of target.moves) {
    if (!m.damagingMove()) continue;
    const t = m.pbCalcType(target);
    if (t === 'Electric') continue;
    let eff = user.effectivenessOfTypeAgainstBattler(t, target, m);
    if (target.hasType(t)) eff *= 1.5;
    if (t === 'Fire' && user.hasActiveAbility('flashfire')) eff = 0;
    if (t === 'Grass' && user.hasActiveAbility('sapsipper')) eff = 0;
    if (t === 'Water' && user.hasActiveAbility(['stormdrain', 'waterabsorb'])) eff = 0;
    if (eff > elec) elecBetter++; else if (eff < elec) oldBetter++;
  }
  if (elecBetter === 0 || elecBetter < oldBetter) return MOVE_USELESS_SCORE;
  return score + 10 * (elecBetter - oldBetter);
});
E('NormalMovesBecomeElectric', (score, move, user, ai) => {
  const base = user.hasActiveAbility(['lightningrod', 'motordrive', 'voltabsorb']) ? 0 : 1;
  let normalBetter = 0, elecBetter = 0;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (move.roughPriority(b) <= 0 && b.fasterThan(user)) continue;
    if (!b.hasDamagingMoveOfType('Normal')) continue;
    let eff = user.effectivenessOfTypeAgainstBattler('Normal', b);
    if (b.hasType('Normal')) eff *= 1.5;
    let e = user.effectivenessOfTypeAgainstBattler('Electric', b);
    if (b.hasType('Electric')) e *= 1.5;
    e *= base;
    if (eff > e) elecBetter++; else if (eff < e) normalBetter++;
  }
  if (elecBetter === 0 || elecBetter < normalBetter) return move.statusMove() ? MOVE_USELESS_SCORE : score;
  return score + 10 * (elecBetter - normalBetter);
});
