/**
 * 원작 AI_MoveEffects_SwitchingActing 이식 — 유턴·바톤터치·날려버리기·묶기·도발·앵콜·사슬묶기 등.
 */
import { add, copy, MOVE_USELESS_SCORE } from './handlers.js';
import { isIneffective, isResistant, isSuperEffective } from './battler.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);

F('FleeFromBattle', () => true);
E('FleeFromBattle', score => score - 20);

const reserveAce = (ai, user) => ai.trainer.hasSkillFlag('ReserveLastPokemon') && ai.ableReserveCount(user.side) === 1;
const pivotCommon = (score, user) => {
  if (user.effects.PerishSong > 0) score += 20;
  if (user.effects.Confusion > 1) score += 10;
  if (user.effects.Attract >= 0) score += 10;
  if (Object.values(user.stages).some(v => v >= 2)) score -= 15;
  else if (Object.values(user.stages).some(v => v < 0)) score += 10;
  const eor = user.roughEndOfRoundDamage();
  if (eor > 0) score += 15;
  if (eor < 0) score -= 15;
  return score;
};
const hazardsHere = (score, user) => {
  const s = user.ownSide();
  if (s.Spikes > 0) score -= 10;
  if (s.ToxicSpikes > 0) score -= 10;
  if (s.StealthRock) score -= 10;
  return score;
};

/* 순간이동(교체) */
F('SwitchOutUserStatusMove', (move, user, ai) => ai.ableReserveCount(user.side) === 0);
E('SwitchOutUserStatusMove', (score, move, user, ai) => {
  if (reserveAce(ai, user)) return MOVE_USELESS_SCORE;
  score = pivotCommon(score, user);
  if (!user.checkForMove(m => m.damagingMove())) score += 10;
  return hazardsHere(score, user);
});
/* 유턴·볼트체인지 */
E('SwitchOutUserDamagingMove', (score, move, user, ai) => {
  if (ai.ableReserveCount(user.side) === 0) return score;
  if (reserveAce(ai, user)) score -= 20;
  return hazardsHere(pivotCommon(score, user), user);
});
/* 막말내뱉기 */
FT('LowerTargetAtkSpAtk1SwitchOutUser', (move, user, target) => {
  for (let i = 0; i < move.statDown.length; i += 2) if (target.canLowerStatStage(move.statDown[i], user, move)) return false;
  return true;
});
ET('LowerTargetAtkSpAtk1SwitchOutUser', (score, move, user, target, ai) => ai.getScoreForTargetStatDrop(score, target, move.statDown, false));

/* 바톤터치 */
F('SwitchOutUserPassOnEffects', (move, user, ai) => ai.ableReserveCount(user.side) === 0);
E('SwitchOutUserPassOnEffects', (score, move, user, ai) => {
  if (reserveAce(ai, user)) score -= 20;
  if (user.effects.Confusion > 1) score -= 10;
  if (user.effects.Curse) score -= 15;
  if (user.effects.Embargo > 1) score -= 10;
  if (user.effects.GastroAcid) score -= 15;
  if (user.effects.HealBlock > 1) score -= 10;
  if (user.effects.LeechSeed >= 0) score -= 10;
  if (user.effects.PerishSong > 0) score -= 20;
  if (user.effects.AquaRing) score += 10;
  if (user.effects.FocusEnergy > 0) score += 10;
  if (user.effects.Ingrain) score += 10;
  if (user.effects.MagnetRise > 1) score += 8;
  if (user.effects.Substitute > 0) score += 10;
  const st = Object.values(user.stages);
  if (st.some(v => v >= 4)) score += 25;
  else if (st.some(v => v >= 2)) score += 15;
  else if (st.some(v => v < 0)) score -= 15;
  const eor = user.roughEndOfRoundDamage();
  if (eor > 0) score += 15;
  if (eor < 0) score -= 15;
  if (!user.checkForMove(m => m.damagingMove())) score += 15;
  return hazardsHere(score, user);
});

/* 날려버리기·울부짖기 */
FT('SwitchOutTargetStatusMove', (move, user, target, ai) => (!ai.battle.moldBreaker && target.hasActiveAbility('suctioncups')) || target.effects.Ingrain || ai.ableReserveCount(target.side) === 0);
ET('SwitchOutTargetStatusMove', (score, move, user, target, ai) => {
  if (target.effects.PerishSong > 0) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware') && target.hp <= target.totalhp / 3) score -= 10;
  const st = Object.values(target.stages);
  if (st.some(v => v >= 2)) score += 15; else if (st.some(v => v < 0)) score -= 15;
  const eor = target.roughEndOfRoundDamage();
  if (eor > 0) score -= 15;
  if (eor < 0) score += 15;
  const s = target.ownSide();
  if (s.Spikes > 0) score += 10;
  if (s.ToxicSpikes > 0) score += 10;
  if (s.StealthRock) score += 10;
  return score;
});
/* 드래곤테일·배대뒤치기 (Gen9 팩 판) */
ET('SwitchOutTargetDamagingMove', (score, move, user, target, ai) => {
  if (!ai.battle.moldBreaker && target.hasActiveAbility('suctioncups')) return score;
  if (target.effects.Ingrain) return score;
  if (ai.ableReserveCount(target.side) === 0) return score;
  if (target.effects.Substitute > 0) return score;
  if (target.effects.PerishSong > 0) score -= 20;
  const st = Object.values(target.stages);
  if (st.some(v => v >= 2)) score += 15; else if (st.some(v => v < 0)) score -= 15;
  const eor = target.roughEndOfRoundDamage();
  if (eor > 0) score -= 15;
  if (eor < 0) score += 15;
  const s = target.ownSide();
  if (s.Spikes > 0) score += 10;
  if (s.ToxicSpikes > 0) score += 10;
  if (s.StealthRock) score += 10;
  return score;
});

/* 묶기 계열 */
ET('BindTarget', (score, move, user, target, ai) => {
  if (target.effects.Trapping > 0) return score;
  if (target.effects.Substitute > 0) return score;
  if (user.hasActiveItem(['bindingband', 'gripclaw'])) score += 5;
  if (target.takesIndirectDamage()) score += 10;
  if (target.canBecomeTrapped()) {
    score += 8;
    const eor = target.roughEndOfRoundDamage();
    if (eor > 0) score += 10; else if (eor < 0) score -= 10;
    if (target.effects.PerishSong > 0) score += 15;
  }
  if ((target.canBecomeTrapped() || target.takesIndirectDamage()) && ai.trainer.mediumSkill() && target.hasMoveWithFunction('RemoveUserBindingAndEntryHazards')) score -= 10;
  return score;
});
add('moveBasePower', 'BindTargetDoublePowerIfTargetUnderwater', (power, move, user, target) => Math.round(power * move.pbModifyDamage(1, user, target)));
copy('moveEffectAgainstTarget', 'BindTarget', 'BindTargetDoublePowerIfTargetUnderwater');

/* 검은눈빛·거미집 */
FT('TrapTargetInBattle', (move, user, target) => {
  if (move.damagingMove()) return false;
  return target.effects.MeanLook >= 0 || target.hasType('Ghost');
});
const trapScore = (score, move, user, target, ai, allowAddEffect = true) => {
  if (!target.canBecomeTrapped() || ai.ableReserveCount(target.side) === 0) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
  const eor = target.roughEndOfRoundDamage();
  if (eor >= target.hp) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
  if (ai.trainer.mediumSkill() && target.hasMoveWithFunction('RemoveUserBindingAndEntryHazards')) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
  if (allowAddEffect) {
    const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
    if (addEffect === -999) return score;
    score += addEffect;
  }
  if (target.effects.PerishSong > 0 || target.effects.Attract >= 0 || target.effects.Confusion > 0 || eor > 0) score += 15;
  return score;
};
ET('TrapTargetInBattle', (score, move, user, target, ai) => trapScore(score, move, user, target, ai));
copy('moveFailureAgainstTarget', 'TrapTargetInBattle', 'TrapTargetInBattleMainEffect');
copy('moveEffectAgainstTarget', 'TrapTargetInBattle', 'TrapTargetInBattleMainEffect');
FT('TrapTargetInBattleLowerTargetDefSpDef1EachTurn', (move, user, target) => {
  if (move.damagingMove()) return false;
  return target.effects.Octolock >= 0 || target.hasType('Ghost');
});
ET('TrapTargetInBattleLowerTargetDefSpDef1EachTurn', (score, move, user, target, ai) => {
  score = ai.getScoreForTargetStatDrop(score, target, ['def', 1, 'spd', 1], false);
  if (target.canBecomeTrapped() && ai.ableReserveCount(target.side) > 0) {
    const eor = target.roughEndOfRoundDamage();
    if (eor >= target.hp) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
    if (target.hasMoveWithFunction('RemoveUserBindingAndEntryHazards')) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
    if (target.effects.PerishSong > 0 || target.effects.Attract >= 0 || target.effects.Confusion > 0 || eor > 0) score += 15;
  }
  return score;
});
ET('TrapUserAndTargetInBattle', (score, move, user, target, ai) => {
  if (target.canBecomeTrapped() && ai.ableReserveCount(target.side) > 0) {
    const eor = target.roughEndOfRoundDamage();
    if (eor >= target.hp) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
    if (ai.trainer.mediumSkill() && target.hasMoveWithFunction('RemoveUserBindingAndEntryHazards')) return move.damagingMove() ? score : MOVE_USELESS_SCORE;
    if (target.effects.PerishSong > 0 || target.effects.Attract >= 0 || target.effects.Confusion > 0 || eor > 0) score += 15;
  }
  return score;
});
F('TrapAllBattlersInBattleForOneTurn', (move, user, ai) => !!ai.battle.field.pseudoWeather?.fairylock);
E('TrapAllBattlersInBattleForOneTurn', score => score - 10);

/* 카운터 계열 (트랩셸) */
F('UsedAfterUserTakesPhysicalDamage', (move, user, ai) => !ai.eachFoeBattler(user.side).some(b => b.checkForMove(m => m.physicalMove())));
E('UsedAfterUserTakesPhysicalDamage', (score, move, user, ai) => {
  if (user.effects.Substitute > 0) return MOVE_USELESS_SCORE;
  if (!ai.eachFoeBattler(user.side).some(b => b.checkForMove(m => m.specialMove()))) score += 10;
  return score - 10;
});
E('UsedAfterAllyRoundWithDoublePower', score => score);
ET('TargetActsNext', () => MOVE_USELESS_SCORE);
ET('TargetActsLast', () => MOVE_USELESS_SCORE);
FT('TargetUsesItsLastUsedMoveAgain', (move, user, target) => target.usingMultiTurnAttack());
ET('TargetUsesItsLastUsedMoveAgain', (score, move, user, target) => (target.opposes(user) ? MOVE_USELESS_SCORE : score));

/* 트릭룸 */
E('StartSlowerBattlersActFirst', (score, move, user, ai) => {
  const ally = [], foe = [];
  for (const b of ai.eachBattler()) {
    let s = b.roughStat('spe');
    const side = b.opposes(user) ? user.opposingSide() : user.ownSide();
    if (side.Tailwind > 1) s *= 2;
    if (side.Swamp > 1) s /= 2;
    (b.opposes(user) ? foe : ally).push(s);
  }
  if (!ally.length || !foe.length) return MOVE_USELESS_SCORE;
  let a = ally, f = foe;
  if ((ai.battle.field.pseudoWeather?.trickroom?.duration ?? 0) > 1) { a = a.map(v => 100000 - v); f = f.map(v => 100000 - v); }
  if (Math.min(...a) > Math.max(...f)) return MOVE_USELESS_SCORE;
  if (Math.min(...f) > Math.max(...a)) return score + 20;
  const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  return avg(a) < avg(f) ? score + 10 : score - 10;
});

/* 원한·으스스한주문 (Gen9 팩 판 포함) */
ET('LowerPPOfTargetLastMoveBy3', (score, move, user, target) => {
  const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
  if (addEffect === -999) return score;
  if (user.fasterThan(target)) {
    const last = target.pbGetMoveWithID(target.lastRegularMoveUsed);
    if (last && last.totalPp > 0 && !last.estimated) {
      score += addEffect;
      if (last.pp <= 3) return score + 20;
      if (last.pp <= 5) return score + 10;
      if (last.pp > 9) return score - 10;
    }
  }
  return score;
});
FT('LowerPPOfTargetLastMoveBy4', (move, user, target) => !target.checkForMove(m => m.id === target.lastRegularMoveUsed));
ET('LowerPPOfTargetLastMoveBy4', (score, move, user, target) => {
  if (user.fasterThan(target)) {
    const last = target.pbGetMoveWithID(target.lastRegularMoveUsed);
    if (last) {
      if (last.pp <= 4) return score + 20;
      if (last.pp <= 6) return score + 10;
      if (last.pp > 10) return score - 10;
    }
  }
  return score - 10;
});

/* 사슬묶기·트집·앵콜·도발·회복봉인·지옥찌르기·봉인 */
const aromaVeil = (target, ai) => !ai.battle.moldBreaker && ai.eachSameSideBattler(target.side).some(b => b.hasActiveAbility('aromaveil'));
const choiceLocked = target => target.effects.ChoiceBand || target.hasActiveItem(['choiceband', 'choicespecs', 'choicescarf']) || target.hasActiveAbility('gorillatactics');
FT('DisableTargetLastMoveUsed', (move, user, target, ai) => {
  if (target.effects.Disable > 0 || !target.lastRegularMoveUsed) return true;
  if (aromaVeil(target, ai)) return true;
  return !target.checkForMove(m => m.id === target.lastRegularMoveUsed);
});
ET('DisableTargetLastMoveUsed', (score, move, user, target, ai) => {
  if (target.hasActiveItem('mentalherb')) return MOVE_USELESS_SCORE;
  score += 5;
  if (choiceLocked(target)) score += 10;
  if (ai.gen.moves.get(target.lastRegularMoveUsed).category !== 'Status') score += 8;
  return score;
});
FT('DisableTargetUsingSameMoveConsecutively', (move, user, target, ai) => target.effects.Torment || aromaVeil(target, ai));
ET('DisableTargetUsingSameMoveConsecutively', (score, move, user, target) => {
  if (target.hasActiveItem('mentalherb')) return MOVE_USELESS_SCORE;
  score += 10;
  if (choiceLocked(target)) score += 10;
  return score;
});
FT('DisableTargetUsingDifferentMove', (move, user, target, ai) => {
  if (target.effects.Encore > 0) return true;
  if (!target.lastRegularMoveUsed) return true;
  if (['struggle', 'encore', 'mimic', 'mirrormove', 'sketch', 'transform', 'assist', 'copycat', 'mefirst', 'metronome', 'sleeptalk', 'naturepower'].includes(target.lastRegularMoveUsed)) return true;
  if (target.effects.ShellTrap) return true;
  if (aromaVeil(target, ai)) return true;
  return !target.checkForMove(m => m.id === target.lastRegularMoveUsed);
});
ET('DisableTargetUsingDifferentMove', (score, move, user, target, ai) => {
  if (target.hasActiveItem('mentalherb')) return MOVE_USELESS_SCORE;
  if (user.fasterThan(target)) {
    const md = ai.moveData(target.lastRegularMoveUsed);
    if (md.statusMove()) score += ['User', 'BothSides'].includes(md.target) ? 10 : 8;
    else if (['NearOther', 'Other'].includes(md.target)) {
      const eff = user.effectivenessOfTypeAgainstBattler(md.type, target);
      if (isIneffective(eff)) score += 20;
      else if (isResistant(eff)) score += 15;
      else if (isSuperEffective(eff)) score -= 8;
      else score += 8;
    }
  } else score += 10;
  return score;
});
FT('DisableTargetStatusMoves', (move, user, target, ai) => target.effects.Taunt > 0 || aromaVeil(target, ai) || (!ai.battle.moldBreaker && target.hasActiveAbility('oblivious')));
ET('DisableTargetStatusMoves', (score, move, user, target) => {
  if (!target.checkForMove(m => m.statusMove())) return MOVE_USELESS_SCORE;
  if (target.status === 'slp' && target.statusCount > (target.fasterThan(user) ? 2 : 1)) {
    if (!target.checkForMove(m => m.statusMove() && m.usableWhenAsleep())) return MOVE_USELESS_SCORE;
  }
  if (!target.effects.ChoiceBand && (target.hasActiveItem(['choiceband', 'choicespecs', 'choicescarf']) || target.hasActiveAbility('gorillatactics'))) return MOVE_USELESS_SCORE;
  for (const m of target.moves) if (m.statusMove() && (m.pp > 0 || m.totalPp === 0)) score += 5;
  const protects = ['ProtectUser', 'ProtectUserSideFromPriorityMoves', 'ProtectUserSideFromMultiTargetDamagingMoves', 'UserEnduresFaintingThisTurn',
    'ProtectUserSideFromDamagingMovesIfUserFirstTurn', 'ProtectUserSideFromStatusMoves', 'ProtectUserFromDamagingMovesKingsShield',
    'ProtectUserFromDamagingMovesObstruct', 'ProtectUserFromTargetingMovesSpikyShield', 'ProtectUserBanefulBunker'];
  if (target.checkForMove(m => m.statusMove() && protects.includes(m.functionCode))) score += 10;
  return score;
});
FT('DisableTargetHealingMoves', (move, user, target, ai) => target.effects.HealBlock > 0 || aromaVeil(target, ai));
ET('DisableTargetHealingMoves', (score, move, user, target) => {
  if (!target.checkForMove(m => m.healingMove()) && !target.hasActiveItem('leftovers') && !(target.hasActiveItem('blacksludge') && target.hasType('Poison'))) return MOVE_USELESS_SCORE;
  return score + 10;
});
ET('DisableTargetSoundMoves', (score, move, user, target) => {
  if (target.effects.ThroatChop > 1) return score;
  if (!target.checkForMove(m => m.soundMove())) return score;
  const addEffect = move.getScoreChangeForAdditionalEffect(user, target);
  if (addEffect === -999) return score;
  return score + addEffect + 8;
});
F('DisableTargetMovesKnownByUser', (move, user) => user.effects.Imprison);
ET('DisableTargetMovesKnownByUser', (score, move, user, target, ai) => {
  const mine = user.moves.map(m => m.id);
  const affected = ai.eachFoeBattler(user.side).some(b => b.checkForMove(m => mine.includes(m.id))) ? 1 : 0;
  if (!affected) return MOVE_USELESS_SCORE;
  return score + 8 * affected;
});
