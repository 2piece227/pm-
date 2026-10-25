/**
 * 원작 AI_Switch 의 ShouldSwitch / ShouldNotSwitch 핸들러 (+ Gen9 팩).
 * "빠질 이유"가 하나라도 있으면 교체를 검토하고, "남을 이유"가 있으면 접는다.
 * 원작은 랭크가 깎인 것만으로는 빠지지 않는다 — 랭크 하락은 아예 보지 않는다.
 */
import { add } from './handlers.js';
import { isSuperEffective, effectiveness } from './battler.js';

const S = (name, fn) => add('shouldSwitch', name, fn);
const N = (name, fn) => add('shouldNotSwitch', name, fn);

/* 멸망의노래 카운트 1 */
S('perish_song', b => b.effects.PerishSong === 1);

/* 턴 끝 피해가 크거나, 교체로 없앨 수 있는 지속 피해 */
S('significant_eor_damage', (b, reserves, ai) => {
  const eor = b.roughEndOfRoundDamage();
  if (eor >= b.hp / 2 || eor >= b.totalhp / 4) return true;
  if (ai.trainer.highSkill() && eor > 0) {
    if (b.effects.LeechSeed >= 0 && ai.rand(100) < 50) return true;
    if (b.effects.Nightmare) return true;
    if (b.effects.Curse) return true;
    if (b.status === 'psn' && b.statusCount > 0 && !b.hasActiveAbility('poisonheal')) {
      const poison = b.totalhp / 8, nextToxic = b.totalhp * (b.effects.Toxic + 1) / 16;
      if ((b.hp <= nextToxic && b.hp > poison) || nextToxic > poison * 2) return true;
    }
  }
  return false;
});

/* 자연회복·재생력 등 — 교체로 상태이상을 고치거나 회복 (Gen9 팩 판) */
S('cure_status_problem_by_switching_out', (b, reserves, ai) => {
  if (!b.abilityActive()) return false;
  const hazard = ai.calculateEntryHazardDamage(b, b.side);
  if (hazard >= b.hp) return false;
  const single = { immunity: ['psn'], insomnia: ['slp'], limber: ['par'], magmaarmor: ['frz'], vitalspirit: ['slp'], waterbubble: ['brn'], waterveil: ['brn'] }[b.abilityId];
  if (b.abilityId === 'naturalcure' || (single && single.includes(b.status))) {
    if (b.wantsStatusProblem(b.status)) return false;
    if (b.status === 'slp' && b.statusCount === 1) return false;
    if (hazard >= b.totalhp / 4) return false;
    if (b.status === 'psn' && !reserves.some(p => p.hasType('Poison'))) {
      if (ai.sides[b.side].ToxicSpikes === 2) return false;
      if (ai.sides[b.side].ToxicSpikes === 1 && b.statusCount === 0) return false;
    }
    if (b.hp >= b.totalhp / 2 && !['slp', 'frz'].includes(b.status)) return false;
    return ai.rand(100) < 70;
  }
  if (b.abilityId === 'regenerator') {
    if (hazard >= b.totalhp / 3) return false;
    if (b.hp >= b.totalhp / 2) return false;
    if (b.checkForMove(m => m.damagingMove()) && ai.eachFoeBattler(b.side).some(f => f.hp < f.totalhp / 3)) return false;
    return ai.rand(100) < 70;
  }
  return false;
});

/* 희망사항 회복을 더 필요로 하는 동료가 있다 */
S('wish_healing', (b, reserves, ai) => {
  const pos = ai.positionEffects(b.index);
  if (pos.Wish === 0) return false;
  const amt = pos.WishAmount;
  if (b.totalhp - b.hp >= amt * 2 / 3) return false;
  return reserves.some(p => {
    const hazard = ai.calculateEntryHazardDamage(p, b.side);
    if (hazard >= p.hp) return false;
    return p.totalhp - p.hp - hazard >= amt * 2 / 3;
  });
});

const trappingAnother = (b, ai) => ai.battlers.some(x => x.effects.JawLock === b.index || x.effects.MeanLook === b.index ||
  x.effects.Octolock === b.index || x.effects.TrappingUser === b.index);

/* 하품 — 곧 잠든다 */
S('yawning', (b, reserves, ai) => {
  if (b.effects.Yawn === 0 || !b.canSleepYawn()) return false;
  if (b.wantsStatusProblem('slp')) return false;
  if (b.abilityActive()) {
    if (['insomnia', 'naturalcure', 'regenerator', 'shedskin'].includes(b.abilityId)) return false;
    if (b.abilityId === 'hydration' && ['Rain', 'HeavyRain'].includes(b.effectiveWeather())) return false;
  }
  if (b.hasActiveItem(['chestoberry', 'lumberry']) && b.canConsumeBerry()) return false;
  if (b.hasActiveAbility(['earlybird', 'marvelscale'])) return false;
  if (ai.trainer.highSkill() && trappingAnother(b, ai)) return false;
  if (Object.values(b.stages).some(v => v >= 2)) return false;
  return true;
});

/* 잠들어 한동안 못 깬다 */
S('asleep', (b, reserves, ai) => {
  if (b.status !== 'slp' || b.statusCount <= 2) return false;
  if (b.wantsStatusProblem('slp')) return false;
  if (b.hasActiveAbility('marvelscale')) return false;
  if (b.checkForMove(m => m.functionCode === 'HealUserFullyAndFallAsleep')) return false;
  if (ai.trainer.highSkill() && trappingAnother(b, ai)) return false;
  if (Object.values(b.stages).some(v => v >= 2)) return false;
  if (ai.rand(100) < 50) return false;
  return true;
});

/* 쓸 수 있는 기술이 하나도 없다 (도발·사슬묶기·PP 0 등) */
S('battler_is_useless', (b, reserves, ai) => {
  if (!ai.trainer.mediumSkill()) return false;
  if (b.turnCount < 2) return false;
  if (ai.choosableMoves(ai.request).length > 0) return false;
  if (b.effects.DestinyBond || b.effects.Grudge) return false;
  if (b.effects.Substitute) {
    const hidden = !ai.eachFoeBattler(b.side).some(f => f.checkForMove(m => m.ignoresSubstitute(f)));
    if (hidden) return false;
  }
  return true;
});

/* 상대 특성이 내 공격을 다 흡수한다 — 동료는 때릴 수 있을 때만 */
S('foe_absorbs_all_moves_with_its_ability', (b, reserves, ai) => {
  if (b.turnCount < 2) return false;
  if (b.hasMoldBreaker()) return false;
  let canDamage = false;
  for (const f of ai.eachFoeBattler(b.side)) {
    if (ai.trainer.highSkill() && f.roughEndOfRoundDamage() > 0) { canDamage = true; break; }
    for (const m of b.moves) {
      if (m.statusMove()) continue;
      if (['IgnoreTargetAbility', 'CategoryDependsOnHigherDamageIgnoreTargetAbility'].includes(m.functionCode)) { canDamage = true; break; }
      if (!ai.pokemonCanAbsorbMove(f, m, m.pbCalcType(b))) { canDamage = true; break; }
    }
    if (canDamage) break;
  }
  if (canDamage) return false;
  return reserves.some(p => ai.eachFoeBattler(b.side).some(f => p.moves.some(m => !m.statusMove() &&
    (['IgnoreTargetAbility', 'CategoryDependsOnHigherDamageIgnoreTargetAbility'].includes(m.functionCode) || !ai.pokemonCanAbsorbMove(f, m, m.type)))));
});

/* 상대의 센 기술을 흡수할 동료가 있다 (위력 70 이상, 30%) */
S('absorb_foe_move', (b, reserves, ai) => {
  if (!ai.trainer.mediumSkill()) return false;
  if (b.stage('evasion') >= 3) return false;
  if (ai.globalAbility('neutralizinggas')) return false;
  const foeMoves = [];
  for (const f of ai.eachFoeBattler(b.side)) for (const m of f.moves) {
    if (m.statusMove()) continue;
    foeMoves.push([m.isOHKO() ? 100 : m.power, m.pbCalcType(f), m]);
  }
  if (!foeMoves.length) return false;
  let chosen;
  if (ai.trainer.highSkill()) { foeMoves.sort((x, y) => x[0] - y[0]); chosen = foeMoves[foeMoves.length - 1]; }
  else chosen = foeMoves[ai.rand(foeMoves.length)];
  const [power, type, move] = chosen;
  if (power < 70) return false;
  if (ai.pokemonCanAbsorbMove(b, move, type)) return false;
  if (reserves.some(p => ai.pokemonCanAbsorbMove(p, move, type))) {
    if (ai.rand(100) < 70) return false;
    return true;
  }
  return false;
});

/* 제로투히어로 — 빠졌다 돌아오면 변신 (Gen9 팩) */
S('zero_to_hero_ability', (b, reserves, ai) => {
  if (!b.abilityActive() || b.abilityId !== 'zerotohero') return false;
  if (b.species !== 'palafin') return false;
  if (ai.calculateEntryHazardDamage(b, b.side) >= b.hp) return false;
  const pivots = ['SwitchOutUserStatusMove', 'SwitchOutUserDamagingMove', 'SwitchOutUserPassOnEffects', 'LowerTargetAtkSpAtk1SwitchOutUser', 'StartHailWeatherSwitchOutUser', 'UserMakeSubstituteSwitchOut'];
  const hasPivot = ai.choosableMoves(ai.request).some(({ rm }) => pivots.includes(ai.moveData(rm.id).functionCode));
  return !hasPivot && (ai.trainer.highSkill() || ai.rand(100) < 70);
});

/* HP 절반 미만에 상대가 직전에 효과가 굉장한 큰 기술을 썼다 */
S('high_damage_from_foe', (b, reserves, ai) => {
  if (!ai.trainer.highSkill()) return false;
  if (b.hp >= b.totalhp / 2) return false;
  for (const f of ai.eachFoeBattler(b.side)) {
    if (Math.abs(f.level - b.level) > 5) continue;
    if (!f.lastMoveUsed) continue;
    const md = ai.gen.moves.get(f.lastMoveUsed);
    if (!md.exists || md.category === 'Status') continue;
    const eff = b.effectivenessOfTypeAgainstBattler(md.type, f);
    if (!isSuperEffective(eff) || md.basePower < 70) continue;
    if (ai.rand(100) < (md.basePower > 90 ? 50 : 25)) return true;
  }
  return false;
});

/* ---------- 남을 이유 ---------- */

/* 돌아올 때 압정에 쓰러진다 — 빠지면 못 쓰니 남아서 싸운다 */
N('lethal_entry_hazards', (b, reserves, ai) => {
  if (ai.calculateEntryHazardDamage(b, b.side) < b.hp) return false;
  if (reserves.some(p => p.moves.some(m => m.functionCode === 'RemoveUserBindingAndEntryHazards'))) return false;
  return true;
});

/* 효과가 굉장한 기술이 있다 (50%) */
N('battler_has_super_effective_move', (b, reserves, ai) => {
  if (b.effects.PerishSong === 1) return false;
  let has = false;
  for (const m of b.moves) {
    if (m.pp === 0 && m.totalPp > 0) continue;
    if (m.statusMove()) continue;
    const type = ai.trainer.mediumSkill() ? m.pbCalcType(b) : m.type;
    if (ai.eachFoeBattler(b.side).some(f => isSuperEffective(f.effectivenessOfTypeAgainstBattler(type, b, m)))) { has = true; break; }
  }
  return has && ai.rand(100) < 50;
});

/* 랭크를 +4 이상 쌓았다 (깎인 랭크는 세지 않는다) */
N('battler_has_very_raised_stats', b => Object.values(b.stages).reduce((s, v) => s + Math.max(0, v), 0) >= 4);

export { effectiveness };
