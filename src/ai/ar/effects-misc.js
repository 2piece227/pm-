/**
 * 원작 AI_MoveEffects_Misc 이식 — 날씨·필드·흩뿌리기·대타출동·고속스핀 등.
 */
import { add, copy, handlers, MOVE_USELESS_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);

E('DoesNothingCongratulations', () => MOVE_USELESS_SCORE);
copy('moveEffect', 'DoesNothingCongratulations', 'DoesNothingFailsIfNoAlly', 'DoesNothingUnusableInGravity', 'DoubleMoneyGainedFromBattle');

F('FailsIfNotUserFirstTurn', (move, user) => user.turnCount > 0);
E('FailsIfNotUserFirstTurn', score => score + 25);

F('FailsIfUserHasUnusedMove', (move, user) => {
  let another = false, unused = false;
  for (const m of user.moves) {
    if (m.id === move.id) continue;
    another = true;
    if (user.movesUsed?.has(m.id)) continue;
    unused = true; break;
  }
  return !another || unused;
});
F('FailsIfUserNotConsumedBerry', (move, user) => !user.mon?.ateBerry);
FT('FailsIfTargetHasNoItem', (move, user, target) => !target.item || !target.itemActive());
FT('FailsUnlessTargetSharesTypeWithUser', (move, user, target) => !user.pbTypes().some(t => target.pbTypes().includes(t)));

ET('FailsIfUserDamagedThisTurn', (score, move, user, target, ai) => {
  let userFaster = 0, foeFaster = 0;
  for (const b of ai.eachFoeBattler(user.side)) { if (user.fasterThan(b)) userFaster++; else foeFaster++; }
  if (userFaster === 0) return MOVE_USELESS_SCORE;
  if (foeFaster === 0) score += 15;
  if (ai.trainer.highSkill()) {
    if (!target.canAttack()) score += 15;
    else if (target.effects.Confusion > 1 || target.effects.Attract === user.index) score += 10;
    else if (target.paralyzed()) score += 5;
  }
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp <= target.totalhp / 2) score -= 10;
    if (target.hp <= target.totalhp / 4) score -= 10;
  }
  return score;
});

ET('FailsIfTargetActed', (score, move, user, target, ai) => {
  if (target.fasterThan(user)) return MOVE_USELESS_SCORE;
  if (!target.checkForMove(m => m.damagingMove())) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware')) {
    if (target.hp <= target.totalhp / 2) score -= 10;
    if (target.hp <= target.totalhp / 4) score -= 10;
  }
  return score;
});

ET('CrashDamageIfFailsUnusableInGravity', (score, move, user) => {
  if (user.takesIndirectDamage()) score -= Math.trunc(0.6 * (100 - move.roughAccuracy()));
  return score;
});

/* ---------- 날씨 ---------- */
const WEATHER_OF_CODE = { StartSunWeather: 'Sun', StartRainWeather: 'Rain', StartSandstormWeather: 'Sandstorm', StartHailWeather: 'Hail' };
F('StartSunWeather', (move, user, ai) => ['HarshSun', 'HeavyRain', 'StrongWinds', WEATHER_OF_CODE[move.functionCode] || 'Sun'].includes(ai.weather));
copy('moveFailure', 'StartSunWeather', 'StartRainWeather', 'StartSandstormWeather', 'StartHailWeather');
const weatherScore = weather => (score, move, user, ai) => {
  if (ai.globalAbility('airlock') || ai.globalAbility('cloudnine')) return MOVE_USELESS_SCORE;
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 2) score -= 10;
  if (ai.trainer.highSkill() && ai.weather !== 'None') score -= ai.getScoreForWeather(ai.weather, user);
  score += ai.getScoreForWeather(weather, user, true);
  return score;
};
E('StartSunWeather', weatherScore('Sun'));
E('StartRainWeather', weatherScore('Rain'));
E('StartSandstormWeather', weatherScore('Sandstorm'));
E('StartHailWeather', weatherScore('Hail'));

/* ---------- 필드 ---------- */
const terrainScore = terrain => (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 2) score -= 10;
  if (ai.trainer.highSkill() && ai.terrain !== 'None') score -= ai.getScoreForTerrain(ai.terrain, user);
  score += ai.getScoreForTerrain(terrain, user, true);
  return score;
};
for (const t of ['Electric', 'Grassy', 'Misty', 'Psychic']) {
  F(`Start${t}Terrain`, (move, user, ai) => ai.terrain === t);
  E(`Start${t}Terrain`, terrainScore(t));
}
F('RemoveTerrain', (move, user, ai) => ai.terrain === 'None');
E('RemoveTerrain', (score, move, user, ai) => score - ai.getScoreForTerrain(ai.terrain, user));

/* ---------- 흩뿌리기 — 상대 남은 포켓몬 수만큼 (안 나온 포켓몬은 받는다고 본다) ---------- */
const foeReserves = (ai, user, filter) => ai.partyOf(user.idxOpposingSide()).filter(p => p.able() && (!ai.trainer.mediumSkill() || p.unseen || filter(p)));
F('AddSpikesToFoeSide', (move, user) => user.opposingSide().Spikes >= 3);
E('AddSpikesToFoeSide', (score, move, user, ai) => {
  const n = foeReserves(ai, user, p => !p.hasItem('heavydutyboots') && !ai.pokemonAirborne(p) && !p.hasAbility('magicguard')).length;
  if (!n) return MOVE_USELESS_SCORE;
  return score + Math.min([10, 7, 5][user.opposingSide().Spikes] * n, 30);
});
F('AddToxicSpikesToFoeSide', (move, user) => user.opposingSide().ToxicSpikes >= 2);
E('AddToxicSpikesToFoeSide', (score, move, user, ai) => {
  const n = foeReserves(ai, user, p => !p.hasItem('heavydutyboots') && !ai.pokemonAirborne(p) && ai.pokemonCanBePoisoned(p)).length;
  if (!n) return MOVE_USELESS_SCORE;
  return score + Math.min([8, 5][user.opposingSide().ToxicSpikes] * n, 30);
});
F('AddStealthRocksToFoeSide', (move, user) => user.opposingSide().StealthRock);
E('AddStealthRocksToFoeSide', (score, move, user, ai) => {
  const n = foeReserves(ai, user, p => !p.hasItem('heavydutyboots') && !p.hasAbility('magicguard')).length;
  if (!n) return MOVE_USELESS_SCORE;
  return score + Math.min(10 * n, 30);
});
F('AddStickyWebToFoeSide', (move, user) => user.opposingSide().StickyWeb);
E('AddStickyWebToFoeSide', (score, move, user, ai) => {
  const n = foeReserves(ai, user, p => !p.hasItem('heavydutyboots') && !ai.pokemonAirborne(p)).length;
  if (!n) return MOVE_USELESS_SCORE;
  return score + Math.min(8 * n, 30);
});

/* ---------- 코트체인지 ---------- */
const SIDE_NUM = ['AuroraVeil', 'LightScreen', 'Mist', 'Rainbow', 'Reflect', 'Safeguard', 'SeaOfFire', 'Swamp', 'Tailwind', 'Spikes', 'ToxicSpikes'];
const SIDE_BOOL = ['StealthRock', 'StickyWeb'];
F('SwapSideEffects', (move, user, ai) => !ai.sides.some(s => SIDE_NUM.some(e => s[e] !== 0) || SIDE_BOOL.some(e => s[e])));
const notEmpty = v => ![0, false, null, undefined].includes(v);
const over1 = v => ![0, 1, false, null, undefined].includes(v);
E('SwapSideEffects', (score, move, user, ai) => {
  if (ai.trainer.mediumSkill()) {
    for (const e of ['Spikes', 'StealthRock', 'StickyWeb', 'ToxicSpikes', 'Steelsurge', 'Cannonade', 'VineLash', 'Volcalith', 'Wildfire']) {
      if (notEmpty(user.ownSide()[e])) score += 10;
      if (over1(user.opposingSide()[e])) score -= 10;
    }
    if (ai.trainer.highSkill()) {
      for (const e of ['AuroraVeil', 'LightScreen', 'Mist', 'Rainbow', 'Reflect', 'Safeguard', 'SeaOfFire', 'Swamp', 'Tailwind']) {
        if (over1(user.opposingSide()[e])) score += 10;
        if (notEmpty(user.ownSide()[e])) score -= 10;
      }
    }
  }
  return score;
});

/* ---------- 대타출동 ---------- */
F('UserMakeSubstitute', (move, user) => user.effects.Substitute > 0 || user.hp <= Math.max(Math.floor(user.totalhp / 4), 1));
E('UserMakeSubstitute', (score, move, user, ai) => {
  if (ai.trainer.hasSkillFlag('HPAware')) score += Math.round(10 * user.hp / user.totalhp);
  for (const b of ai.eachFoeBattler(user.side)) if (!b.checkForMove(m => m.ignoresSubstitute(b))) score += 5;
  if (user.lastHPLost >= user.totalhp / 4) score += 7;
  return score;
});

/* ---------- 고속스핀 (Gen9 팩: 거다이강철술도) ---------- */
E('RemoveUserBindingAndEntryHazards', (score, move, user, ai) => {
  score = handlers.applyMoveEffectScore('RaiseUserSpeed1', score, move, user, ai, ai.battle);
  if (user.effects.Trapping > 0) score += 10;
  if (user.effects.LeechSeed >= 0) score += 15;
  if (ai.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
    const s = user.ownSide();
    if (s.Spikes > 0) score += 15;
    if (s.ToxicSpikes > 0) score += 15;
    if (s.StealthRock) score += 20;
    if (s.Steelsurge) score += 20;
    if (s.StickyWeb) score += 15;
  }
  return score;
});

FT('AttackTwoTurnsLater', (move, user, target, ai) => target.index !== 0 ? false : ai.positionEffects(target.index).FutureSightCounter > 0);
E('AttackTwoTurnsLater', (score, move, user, ai) => (ai.pbAbleNonActiveCount(user.idxOwnSide()) === 0 ? score - 20 : score));

F('UserSwapsPositionsWithAlly', () => true);
E('UserSwapsPositionsWithAlly', score => score - 30);

E('BurnAttackerBeforeUserActs', (score, move, user, ai) => {
  for (const b of ai.eachFoeBattler(user.side)) {
    if (!b.affectedByContactEffect()) continue;
    if (!b.canBurn(user, move)) continue;
    if (ai.trainer.highSkill() && !b.checkForMove(m => m.pbContactMove(b))) continue;
    score += 10;
  }
  return score;
});

E('AllBattlersLoseHalfHPUserSkipsNextTurn', (score, move, user, ai) => {
  let foeLost = 0, allyLost = 0;
  for (const b of ai.eachBattler()) {
    if (b.hp === 1) continue;
    if (b.opposes(user)) foeLost += Math.floor(b.hp / 2); else allyLost += Math.floor(b.hp / 2);
  }
  score += 20 * foeLost / Math.max(1, allyLost);
  score -= 20 * allyLost / Math.max(1, foeLost);
  return handlers.applyMoveEffectScore('AttackAndSkipNextTurn', score, move, user, ai, ai.battle);
});

E('UserLosesHalfHP', (score, move, user, ai) => handlers.applyMoveEffectScore('UserLosesHalfOfTotalHP', score, move, user, ai, ai.battle));

F('RemoveAllScreensAndSafeguard', (move, user, ai) => !ai.sides.some(s => s.AuroraVeil > 0 || s.LightScreen > 0 || s.Reflect > 0 || s.Safeguard > 0));
E('RemoveAllScreensAndSafeguard', (score, move, user, ai) => {
  const foe = user.opposingSide();
  if (foe.AuroraVeil <= 1 && foe.LightScreen <= 1 && foe.Reflect <= 1 && foe.Safeguard <= 1) return MOVE_USELESS_SCORE;
  score = handlers.applyMoveEffectScore('RemoveScreens', score, move, user, ai, ai.battle);
  for (const b of ai.eachFoeBattler(user.side)) { score -= handlers.applyMoveEffectScore('RemoveScreens', 0, move, b, ai, ai.battle); break; }
  if (foe.Safeguard > 0) score += 10;
  if (user.ownSide().Safeguard > 0) score -= 10;
  return score;
});
