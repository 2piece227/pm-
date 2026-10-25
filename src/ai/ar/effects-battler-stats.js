/**
 * 원작 AI_MoveEffects_BattlerStats 이식 — 랭크를 올리고 내리는 기술.
 * 점수의 본체는 generic.js의 "올려도 쓸모가 있나 / 내려서 이득인가" 계산이다.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE, MOVE_BASE_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const BATTLE_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

/* ---------- 자신 랭크업 ---------- */
F('RaiseUserAttack1', (move, user) => move.statusMove() && !user.canRaiseStatStage(move.statUp[0], user, move));
E('RaiseUserAttack1', (score, move, user, ai) => ai.getScoreForTargetStatRaise(score, user, move.statUp));
const RAISE_SIMPLE = ['RaiseUserAttack2', 'RaiseUserAttack3', 'RaiseUserDefense1', 'RaiseUserDefense2', 'RaiseUserDefense3', 'RaiseUserSpAtk1', 'RaiseUserSpAtk2',
  'RaiseUserSpAtk3', 'RaiseUserSpDef1', 'RaiseUserSpDef2', 'RaiseUserSpDef3', 'RaiseUserSpeed1', 'RaiseUserSpeed2', 'RaiseUserSpeed3',
  'RaiseUserAccuracy1', 'RaiseUserAccuracy2', 'RaiseUserAccuracy3', 'RaiseUserEvasion1', 'RaiseUserEvasion2', 'RaiseUserEvasion3'];
copy('moveFailure', 'RaiseUserAttack1', ...RAISE_SIMPLE, 'RaiseUserDefense1CurlUpUser', 'RaiseUserSpDef1PowerUpElectricMove', 'RaiseUserSpeed2LowerUserWeight', 'RaiseUserEvasion2MinimizeUser');
copy('moveEffect', 'RaiseUserAttack1', ...RAISE_SIMPLE);

ET('RaiseUserAttack2IfTargetFaints', (score, move, user, target, ai) => (move.roughDamage() >= target.hp * 0.9 ? ai.getScoreForTargetStatRaise(score, user, move.statUp) : score));
copy('moveEffectAgainstTarget', 'RaiseUserAttack2IfTargetFaints', 'RaiseUserAttack3IfTargetFaints');

F('MaxUserAttackLoseHalfOfTotalHP', (move, user) => user.hp <= Math.max(Math.floor(user.totalhp / 2), 1) || !user.canRaiseStatStage('atk', user, move));
E('MaxUserAttackLoseHalfOfTotalHP', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, ['atk', 12]);
  if (ai.trainer.hasSkillFlag('HPAware')) score -= 60 * (1 - user.hp / user.totalhp);
  return score;
});
E('RaiseUserDefense1CurlUpUser', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (!user.volatiles?.defensecurl && user.hasMoveWithFunction('MultiTurnAttackPowersUpEachTurn')) score += 10;
  return score;
});
E('RaiseUserSpDef1PowerUpElectricMove', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (user.hasDamagingMoveOfType('Electric')) score += 10;
  return score;
});
E('RaiseUserSpeed2LowerUserWeight', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (ai.trainer.mediumSkill()) {
    const w = user.pbWeight();
    if (w > 1) {
      if (user.hasMoveWithFunction('PowerHigherWithUserHeavierThanTarget')) score -= 5;
      for (const b of ai.eachFoeBattler(user.side)) {
        if (b.hasMoveWithFunction('PowerHigherWithUserHeavierThanTarget')) score -= 5;
        if (b.hasMoveWithFunction('PowerHigherWithTargetWeight')) score += 5;
        if (b.hasMoveWithFunction('TwoTurnAttackInvulnerableInSkyTargetCannotAct') && w >= 2000 && w < 3000) score -= 10;
      }
    }
  }
  return score;
});
E('RaiseUserEvasion2MinimizeUser', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (ai.trainer.mediumSkill() && !user.effects.Minimize) {
    for (const b of ai.eachFoeBattler(user.side)) if (b.checkForMove(m => m.tramplesMinimize())) score -= 15;
  }
  return score;
});

F('RaiseUserCriticalHitRate2', (move, user) => user.effects.FocusEnergy >= 2);
E('RaiseUserCriticalHitRate2', (score, move, user, ai) => {
  if (!user.checkForMove(m => m.damagingMove())) return MOVE_USELESS_SCORE;
  score += 15;
  if (ai.trainer.mediumSkill()) {
    if (user.itemActive() && (['razorclaw', 'scopelens'].includes(user.itemId) || (user.itemId === 'luckypunch' && user.isSpecies('chansey')) ||
      (['leek', 'stick'].includes(user.itemId) && (user.isSpecies('farfetchd') || user.isSpecies('sirfetchd'))))) score += 10;
    if (user.hasActiveAbility('sniper')) score += 10;
  }
  return score;
});

const anyRaise = (move, user) => {
  for (let i = 0; i < move.statUp.length; i += 2) if (user.canRaiseStatStage(move.statUp[i], user, move)) return true;
  return false;
};
F('RaiseUserAtkDef1', (move, user) => !move.damagingMove() && !anyRaise(move, user));
copy('moveEffect', 'RaiseUserAttack1', 'RaiseUserAtkDef1');
const MULTI = ['RaiseUserAtkDefAcc1', 'RaiseUserAtkSpAtk1', 'RaiseUserAtkSpAtk1Or2InSun', 'RaiseUserAtkSpd1', 'RaiseUserAtk1Spd2', 'RaiseUserAtkAcc1',
  'RaiseUserDefSpDef1', 'RaiseUserSpAtkSpDef1', 'RaiseUserSpAtkSpDefSpd1', 'RaiseUserMainStats1'];
copy('moveFailure', 'RaiseUserAtkDef1', ...MULTI);
copy('moveEffect', 'RaiseUserAtkDef1', ...MULTI);
E('RaiseUserAtkSpAtk1Or2InSun', (score, move, user, ai) => {
  const raises = [...move.statUp];
  if (['Sun', 'HarshSun'].includes(user.effectiveWeather())) { raises[1] = 2; raises[3] = 2; }
  return ai.getScoreForTargetStatRaise(score, user, raises);
});

F('LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2', (move, user) => {
  if (anyRaise(move, user)) return false;
  for (let i = 0; i < move.statDown.length; i += 2) if (user.canLowerStatStage(move.statDown[i], user, move)) return false;
  return true;
});
E('LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (score === MOVE_USELESS_SCORE) return score;
  return ai.getScoreForTargetStatDrop(score, user, move.statDown, false);
});

F('RaiseUserMainStats1LoseThirdOfTotalHP', (move, user, ai) => user.hp <= Math.max(Math.floor(user.totalhp / 3), 1) || handlers.moveWillFail('RaiseUserAtkDef1', move, user, ai, ai.battle));
E('RaiseUserMainStats1LoseThirdOfTotalHP', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (score === MOVE_USELESS_SCORE) return score;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp <= user.totalhp * 0.75) score -= 45 * (user.totalhp - user.hp) / user.totalhp;
  return score;
});
F('RaiseUserMainStats1TrapUserInBattle', (move, user, ai) => user.effects.NoRetreat || handlers.moveWillFail('RaiseUserAtkDef1', move, user, ai, ai.battle));
E('RaiseUserMainStats1TrapUserInBattle', (score, move, user, ai) => {
  score = ai.getScoreForTargetStatRaise(score, user, move.statUp);
  if (user.canBecomeTrapped() && ai.ableReserveCount(user.side) > 0) {
    const eor = user.roughEndOfRoundDamage();
    if (eor >= user.hp) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
    if (user.effects.PerishSong > 0 || user.effects.Attract >= 0 || eor > 0) score -= 15;
  }
  return score;
});

E('StartRaiseUserAtk1WhenDamaged', (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp <= user.totalhp / 3) return score;
  if (ai.statRaiseWorthwhile(user, 'atk')) score += 10;
  if (user.hasMoveWithFunction('PowerHigherWithUserPositiveStatStages')) score += 7;
  return score;
});

/* ---------- 자신 랭크다운 (인파이트·리프스톰 등) ---------- */
E('LowerUserAttack1', (score, move, user, ai) => ai.getScoreForTargetStatDrop(score, user, move.statDown));
copy('moveEffect', 'LowerUserAttack1', 'LowerUserAttack2', 'LowerUserDefense1', 'LowerUserDefense2', 'LowerUserSpAtk1', 'LowerUserSpAtk2',
  'LowerUserSpDef1', 'LowerUserSpDef2', 'LowerUserSpeed1', 'LowerUserSpeed2', 'LowerUserAtkDef1', 'LowerUserDefSpDef1', 'LowerUserDefSpDefSpd1');

/* ---------- 상대 랭크업 (뽐내기 등) ---------- */
FT('RaiseTargetAttack1', (move, user, target) => move.statusMove() && !target.canRaiseStatStage('atk', user, move));
ET('RaiseTargetAttack1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['atk', 1]));
const raiseConfuse = (stat, n) => [
  (move, user, target) => !target.canRaiseStatStage(stat, user, move) && !target.canConfuse(user, move),
  (score, move, user, target, ai) => {
    if (!target.hasActiveAbility('contrary') || ai.battle.moldBreaker) { if (!target.canConfuse(user, move)) return MOVE_USELESS_SCORE; }
    score = ai.getScoreForTargetStatRaise(score, target, [stat, n], false);
    return handlers.applyMoveEffectAgainstTargetScore('ConfuseTarget', score, move, user, target, ai, ai.battle);
  }];
{ const [f, e] = raiseConfuse('atk', 2); FT('RaiseTargetAttack2ConfuseTarget', f); ET('RaiseTargetAttack2ConfuseTarget', e); }
{ const [f, e] = raiseConfuse('spa', 1); FT('RaiseTargetSpAtk1ConfuseTarget', f); ET('RaiseTargetSpAtk1ConfuseTarget', e); }
FT('RaiseTargetSpDef1', (move, user, target) => !target.canRaiseStatStage('spd', user, move));
ET('RaiseTargetSpDef1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['spd', 1]));
FT('RaiseTargetRandomStat2', (move, user, target) => !BATTLE_STATS.some(s => target.canRaiseStatStage(s, user, move)));
ET('RaiseTargetRandomStat2', (score, move, user, target, ai) => {
  if (!ai.battle.moldBreaker && target.hasActiveAbility('contrary')) return MOVE_USELESS_SCORE;
  if (target.roughEndOfRoundDamage() >= target.hp) return MOVE_USELESS_SCORE;
  if (target.index !== user.index) score -= 7;
  if (target.hasActiveAbility('simple')) score += 10;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp >= target.totalhp * 0.7) score += 10;
    else score += Math.trunc(50 * (target.hp / target.totalhp - 0.6));
  }
  if (target.hasMoveWithFunction('PowerHigherWithUserPositiveStatStages')) score += 10;
  for (const b of ai.eachFoeBattler(target.side)) if (b.hasMoveWithFunction('PowerHigherWithTargetPositiveStatStages')) score -= 8;
  return score;
});
FT('RaiseTargetAtkSpAtk2', (move, user, target) => !target.canRaiseStatStage('atk', user, move) && !target.canRaiseStatStage('spa', user, move));
ET('RaiseTargetAtkSpAtk2', (score, move, user, target, ai) => (target.opposes(user) ? MOVE_USELESS_SCORE : ai.getScoreForTargetStatRaise(score, target, ['atk', 2, 'spa', 2])));

/* ---------- 상대 랭크다운 ---------- */
FT('LowerTargetAttack1', (move, user, target) => move.statusMove() && move.statDown.length > 0 && !target.canLowerStatStage(move.statDown[0], user, move));
ET('LowerTargetAttack1', (score, move, user, target, ai) => ai.getScoreForTargetStatDrop(score, target, move.statDown));
const LOWER = ['LowerTargetAttack1BypassSubstitute', 'LowerTargetAttack2', 'LowerTargetAttack3', 'LowerTargetDefense1', 'LowerTargetDefense1PowersUpInGravity',
  'LowerTargetDefense2', 'LowerTargetDefense3', 'LowerTargetSpAtk1', 'LowerTargetSpAtk2', 'LowerTargetSpAtk3', 'LowerTargetSpDef1', 'LowerTargetSpDef2',
  'LowerTargetSpDef3', 'LowerTargetSpeed1', 'LowerTargetSpeed1WeakerInGrassyTerrain', 'LowerTargetSpeed2', 'LowerTargetSpeed3', 'LowerTargetAccuracy1',
  'LowerTargetAccuracy2', 'LowerTargetAccuracy3', 'LowerTargetEvasion1', 'LowerTargetEvasion2', 'LowerTargetEvasion3'];
copy('moveFailureAgainstTarget', 'LowerTargetAttack1', ...LOWER);
copy('moveEffectAgainstTarget', 'LowerTargetAttack1', ...LOWER);
add('moveBasePower', 'LowerTargetDefense1PowersUpInGravity', (power, move, user, target) => move.pbBaseDamage(power, user, target));
add('moveBasePower', 'LowerTargetSpeed1WeakerInGrassyTerrain', (power, move, user, target) => move.pbBaseDamage(power, user, target));

FT('LowerTargetSpAtk2IfCanAttract', (move, user, target, ai) => {
  if (move.statusMove() && !target.canLowerStatStage(move.statDown[0], user, move)) return true;
  if (!user.gender || !target.gender || user.gender === 'N' || target.gender === 'N' || user.gender === target.gender) return true;
  return !ai.battle.moldBreaker && target.hasActiveAbility('oblivious');
});
copy('moveEffectAgainstTarget', 'LowerTargetAttack1', 'LowerTargetSpAtk2IfCanAttract');

FT('LowerTargetSpeed1MakeTargetWeakerToFire', (move, user, target) => {
  if (!target.effects.TarShot) return false;
  return move.statusMove() && !target.canLowerStatStage(move.statDown[0], user, move);
});
ET('LowerTargetSpeed1MakeTargetWeakerToFire', (score, move, user, target, ai) => {
  score = ai.getScoreForTargetStatDrop(score, target, move.statDown);
  if (!target.effects.TarShot) {
    const eff = target.effectivenessOfTypeAgainstBattler('Fire');
    if (eff > 0 && user.hasDamagingMoveOfType('Fire')) score += 10 * eff;
  }
  return score;
});

/* 안개제거 (Gen9 팩: 거다이강철술 포함) */
FT('LowerTargetEvasion1RemoveSideEffects', (move, user, target, ai) => {
  const ts = target.ownSide(), to = target.opposingSide();
  if (ts.AuroraVeil > 0 || ts.LightScreen > 0 || ts.Reflect > 0 || ts.Mist > 0 || ts.Safeguard > 0) return false;
  if (ts.StealthRock || ts.Steelsurge || ts.Spikes > 0 || ts.ToxicSpikes > 0 || ts.StickyWeb) return false;
  if (to.StealthRock || to.Steelsurge || to.Spikes > 0 || to.ToxicSpikes > 0 || to.StickyWeb) return false;
  if (ai.terrain !== 'None') return false;
  return move.statusMove() && !target.canLowerStatStage(move.statDown[0], user, move);
});
ET('LowerTargetEvasion1RemoveSideEffects', (score, move, user, target, ai) => {
  if (!target.opposes(user)) return MOVE_USELESS_SCORE;
  score = ai.getScoreForTargetStatDrop(score, target, move.statDown);
  const ts = target.ownSide(), to = target.opposingSide();
  if (ts.AuroraVeil > 1 || ts.Reflect > 1 || ts.LightScreen > 1 || ts.Mist > 1 || ts.Safeguard > 1) score += 10;
  if (target.canSwitchLax() && (ts.Spikes > 0 || ts.ToxicSpikes > 0 || ts.StealthRock || ts.Steelsurge || ts.StickyWeb)) score -= 15;
  if (user.canSwitchLax() && (to.Spikes > 0 || to.ToxicSpikes > 0 || to.StealthRock || to.Steelsurge || to.StickyWeb)) score += 15;
  if (ai.terrain !== 'None') score -= ai.getScoreForTerrain(ai.terrain, user);
  return score;
});

FT('LowerTargetAtkDef1', (move, user, target) => {
  if (!move.statusMove()) return false;
  for (let i = 0; i < move.statDown.length; i += 2) if (target.canLowerStatStage(move.statDown[i], user, move)) return false;
  return true;
});
copy('moveEffectAgainstTarget', 'LowerTargetAttack1', 'LowerTargetAtkDef1');
copy('moveFailureAgainstTarget', 'LowerTargetAtkDef1', 'LowerTargetAtkSpAtk1');
copy('moveEffectAgainstTarget', 'LowerTargetAtkDef1', 'LowerTargetAtkSpAtk1');
FT('LowerPoisonedTargetAtkSpAtkSpd1', (move, user, target, ai) => target.status !== 'psn' || handlers.moveWillFailAgainstTarget('LowerTargetAtkSpAtk1', move, user, target, ai, ai.battle));
copy('moveEffectAgainstTarget', 'LowerTargetAtkSpAtk1', 'LowerPoisonedTargetAtkSpAtkSpd1');

/* 아군 대상 (싱글에서는 대개 실패) */
FT('RaiseAlliesAtkDef1', (move, user, target) => !target.canRaiseStatStage('atk', user, move) && !target.canRaiseStatStage('def', user, move));
ET('RaiseAlliesAtkDef1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['atk', 1, 'def', 1]));
F('RaisePlusMinusUserAndAlliesAtkSpAtk1', (move, user, ai) => !ai.eachSameSideBattler(user.side).some(b => b.hasActiveAbility(['minus', 'plus']) && (b.canRaiseStatStage('atk', user, move) || b.canRaiseStatStage('spa', user, move))));
FT('RaisePlusMinusUserAndAlliesAtkSpAtk1', (move, user, target) => !target.hasActiveAbility(['minus', 'plus']) || (!target.canRaiseStatStage('atk', user, move) && !target.canRaiseStatStage('spa', user, move)));
E('RaisePlusMinusUserAndAlliesAtkSpAtk1', (score, move, user, ai) => {
  if (move.target !== 'UserSide') return score;
  for (const b of ai.eachSameSideBattler(user.side)) score = ai.getScoreForTargetStatRaise(score, b, ['atk', 1, 'spa', 1], false);
  return score;
});
ET('RaisePlusMinusUserAndAlliesAtkSpAtk1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['atk', 1, 'spa', 1]));
F('RaisePlusMinusUserAndAlliesDefSpDef1', (move, user, ai) => !ai.eachSameSideBattler(user.side).some(b => b.hasActiveAbility(['minus', 'plus']) && (b.canRaiseStatStage('def', user, move) || b.canRaiseStatStage('spd', user, move))));
FT('RaisePlusMinusUserAndAlliesDefSpDef1', (move, user, target) => !target.hasActiveAbility(['minus', 'plus']) || (!target.canRaiseStatStage('def', user, move) && !target.canRaiseStatStage('spd', user, move)));
E('RaisePlusMinusUserAndAlliesDefSpDef1', (score, move, user, ai) => {
  if (move.target !== 'UserSide') return score;
  for (const b of ai.eachSameSideBattler(user.side)) score = ai.getScoreForTargetStatRaise(score, b, ['def', 1, 'spd', 1], false);
  return score;
});
ET('RaisePlusMinusUserAndAlliesDefSpDef1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['def', 1, 'spd', 1]));
FT('RaiseGroundedGrassBattlersAtkSpAtk1', (move, user, target) => !target.hasType('Grass') || target.airborne() || target.semiInvulnerable() ||
  (!target.canRaiseStatStage('atk', user, move) && !target.canRaiseStatStage('spa', user, move)));
ET('RaiseGroundedGrassBattlersAtkSpAtk1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['atk', 1, 'spa', 1]));
FT('RaiseGrassBattlersDef1', (move, user, target) => !target.hasType('Grass') || target.semiInvulnerable() || !target.canRaiseStatStage('def', user, move));
ET('RaiseGrassBattlersDef1', (score, move, user, target, ai) => ai.getScoreForTargetStatRaise(score, target, ['def', 1]));

/* ---------- 랭크 맞바꾸기·복사·뒤집기·초기화 ---------- */
const swapStages = stats => (score, move, user, target, ai) => {
  const raises = [], drops = [];
  for (const s of stats) {
    const d = target.stage(s) - user.stage(s);
    if (d > 0) raises.push(s, d); else if (d < 0) drops.push(s, d);
  }
  if (!raises.length) return MOVE_USELESS_SCORE;
  score = ai.getScoreForTargetStatRaise(score, user, raises, false, true);
  score = ai.getScoreForTargetStatDrop(score, target, raises, false, true);
  if (drops.length) {
    score = ai.getScoreForTargetStatDrop(score, user, drops, false, true);
    score = ai.getScoreForTargetStatRaise(score, target, drops, false, true);
  }
  return score;
};
ET('UserTargetSwapAtkSpAtkStages', swapStages(['atk', 'spa']));
ET('UserTargetSwapDefSpDefStages', swapStages(['def', 'spd']));
ET('UserTargetSwapStatStages', swapStages(BATTLE_STATS));
ET('UserCopyTargetStatStages', (score, move, user, target, ai) => {
  const raises = [], drops = [];
  for (const s of BATTLE_STATS) {
    const d = target.stage(s) - user.stage(s);
    if (d > 0) raises.push(s, d); else if (d < 0) drops.push(s, d);
  }
  if (!raises.length) return MOVE_USELESS_SCORE;
  score = ai.getScoreForTargetStatRaise(score, user, raises, false, true);
  if (drops.length) score = ai.getScoreForTargetStatDrop(score, user, drops, false, true);
  if (user.effects.FocusEnergy > 0 && target.effects.FocusEnergy === 0) score -= 5;
  else if (user.effects.FocusEnergy === 0 && target.effects.FocusEnergy > 0) score += 5;
  if (user.effects.LaserFocus > 0 && target.effects.LaserFocus === 0) score -= 5;
  else if (user.effects.LaserFocus === 0 && target.effects.LaserFocus > 0) score += 5;
  return score;
});
ET('UserStealTargetPositiveStatStages', (score, move, user, target, ai) => {
  const raises = [];
  for (const s of BATTLE_STATS) if (target.stage(s) > 0) raises.push(s, target.stage(s));
  if (raises.length) {
    score = ai.getScoreForTargetStatRaise(score, user, raises, false);
    score = ai.getScoreForTargetStatDrop(score, target, raises, false, true);
  }
  return score;
});
FT('InvertTargetStatStages', (move, user, target) => !target.hasLoweredStatStages() && !target.hasRaisedStatStages());
ET('InvertTargetStatStages', (score, move, user, target, ai) => {
  const raises = [], drops = [];
  for (const s of BATTLE_STATS) {
    if (target.stage(s) > 0) drops.push(s, target.stage(s) * 2);
    else if (target.stage(s) < 0) raises.push(s, target.stage(s) * 2);
  }
  if (!drops.length) return MOVE_USELESS_SCORE;
  if (raises.length) score = ai.getScoreForTargetStatRaise(score, target, raises, false, true);
  return ai.getScoreForTargetStatDrop(score, target, drops, false, true);
});
const resetScore = (score, b, ai) => {
  const raises = [], drops = [];
  for (const s of BATTLE_STATS) {
    if (b.stage(s) > 0) drops.push(s, b.stage(s));
    else if (b.stage(s) < 0) raises.push(s, b.stage(s));
  }
  if (raises.length) score = ai.getScoreForTargetStatRaise(score, b, raises, false, true);
  if (drops.length) score = ai.getScoreForTargetStatDrop(score, b, drops, false, true);
  return score;
};
ET('ResetTargetStatStages', (score, move, user, target, ai) => resetScore(score, target, ai));
F('ResetAllBattlersStatStages', (move, user, ai) => !ai.eachBattler().some(b => b.hasLoweredStatStages() || b.hasRaisedStatStages()));
E('ResetAllBattlersStatStages', (score, move, user, ai) => { for (const b of ai.eachBattler()) score = resetScore(score, b, ai); return score; });

F('StartUserSideImmunityToStatStageLowering', (move, user) => user.ownSide().Mist > 0);
E('StartUserSideImmunityToStatStageLowering', (score, move, user, ai) => {
  let has = false;
  for (const b of ai.eachFoeBattler(user.side)) {
    if (b.checkForMove(m => (m.statusMove() && m.statDown.length > 0 && m.pbTarget().foe) ||
      ['LowerPoisonedTargetAtkSpAtkSpd1', 'PoisonTargetLowerTargetSpeed1', 'HealUserByTargetAttackLowerTargetAttack1'].includes(m.functionCode))) { score += 15; has = true; }
  }
  return has ? score : MOVE_USELESS_SCORE;
});

/* ---------- 파워트릭·스피드스왑·파워셰어·가드셰어·아픔나누기 ---------- */
E('UserSwapBaseAtkDef', (score, move, user, ai) => {
  if (user.effects.PowerTrick) return MOVE_USELESS_SCORE;
  const atk = user.baseStat('atk'), def = user.baseStat('def');
  if (atk === def) return MOVE_USELESS_SCORE;
  if (def > atk) {
    if (!ai.statRaiseWorthwhile(user, 'atk', true)) return MOVE_USELESS_SCORE;
    score += Math.trunc(40 * (def / atk - 1));
    if (!ai.statDropWorthwhile(user, 'def', true)) score += 5;
  } else {
    if (!ai.statRaiseWorthwhile(user, 'def', true)) return MOVE_USELESS_SCORE;
    if (ai.statDropWorthwhile(user, 'atk', true)) return MOVE_USELESS_SCORE;
    score += Math.trunc(40 * (atk / def - 1));
  }
  return score;
});
ET('UserTargetSwapBaseSpeed', (score, move, user, target, ai) => {
  const us = user.baseStat('spe'), ts = target.baseStat('spe');
  if (us === ts) return MOVE_USELESS_SCORE;
  if ((ai.battle.field.pseudoWeather?.trickroom?.duration ?? 0) > 1) {
    if (ts > us) return MOVE_USELESS_SCORE;
    return score + Math.trunc(40 * (us / ts - 1));
  }
  if (us > ts) return MOVE_USELESS_SCORE;
  return score + Math.trunc(40 * (ts / us - 1));
});
const average = (a, b) => (score, move, user, target, ai) => {
  const ua = user.baseStat(a), ub = user.baseStat(b), ta = target.baseStat(a), tb = target.baseStat(b);
  if (ua >= ta && ub >= tb) return MOVE_USELESS_SCORE;
  let matters = false;
  for (const [stat, u, t] of [[a, ua, ta], [b, ub, tb]]) {
    if (t > u) {
      if (ai.statRaiseWorthwhile(user, stat, true) || ai.statDropWorthwhile(target, stat, true)) { score += Math.trunc(40 * (t / u - 1)); matters = true; }
    } else if (t < u) {
      if (ai.statDropWorthwhile(user, stat, true) || ai.statRaiseWorthwhile(target, stat, true)) { score -= Math.trunc(40 * (u / t - 1)); matters = true; }
    }
  }
  return matters ? score : MOVE_USELESS_SCORE;
};
ET('UserTargetAverageBaseAtkSpAtk', average('atk', 'spa'));
ET('UserTargetAverageBaseDefSpDef', average('def', 'spd'));
ET('UserTargetAverageHP', (score, move, user, target) => {
  if (user.hp >= target.hp) return MOVE_USELESS_SCORE;
  const mult = (user.hp + target.hp) / (2 * user.hp);
  if (mult >= 1.2) score += Math.trunc(10 * mult);
  return score;
});

/* ---------- 순풍·원더룸 ---------- */
F('StartUserSideDoubleSpeed', (move, user) => user.ownSide().Tailwind > 0);
E('StartUserSideDoubleSpeed', (score, move, user, ai) => {
  if (ai.trainer.mediumSkill() && (ai.battle.field.pseudoWeather?.trickroom?.duration ?? 0) > 1) return MOVE_USELESS_SCORE;
  const ally = [], foe = [];
  for (const b of ai.eachBattler()) (b.opposes(user) ? foe : ally).push(b.roughStat('spe'));
  if (Math.min(...ally) > Math.max(...foe)) return MOVE_USELESS_SCORE;
  let outspeeds = 0;
  for (const a of ally) for (const f of foe) if (f > a && f < a * 2) outspeeds++;
  if (outspeeds === 0) return MOVE_USELESS_SCORE;
  return score + 8 + 10 * outspeeds;
});
E('StartSwapAllBattlersBaseDefensiveStats', (score, move, user, ai) => {
  let matters = false;
  for (const b of ai.eachBattler()) {
    const d = b.baseStat('def'), sd = b.baseStat('spd');
    if (d === sd) continue;
    let change = 0;
    if (d > sd) {
      if (ai.statDropWorthwhile(b, 'def', true)) { change -= Math.trunc(20 * (d / sd - 1)); matters = true; }
      if (ai.statRaiseWorthwhile(b, 'spd', true)) { change += Math.trunc(20 * (d / sd - 1)); matters = true; }
    } else {
      if (ai.statDropWorthwhile(b, 'spd', true)) { change -= Math.trunc(20 * (sd / d - 1)); matters = true; }
      if (ai.statRaiseWorthwhile(b, 'def', true)) { change += Math.trunc(20 * (sd / d - 1)); matters = true; }
    }
    score += b.opposes(user) ? -change : change;
  }
  if (!matters || score <= MOVE_BASE_SCORE) return MOVE_USELESS_SCORE;
  return score;
});
