/**
 * 원작 AI_MoveEffects_Items 이식 (+ Gen9 팩의 쪼아대기 덮어쓰기) — 도둑질·트릭·탁쳐서떨구기·던지기·나무열매.
 * 상대 도구는 드러난 것만 안다 — 모르면 '도구 없음'으로 본다.
 */
import { add, handlers, MOVE_USELESS_SCORE } from './handlers.js';

const F = (code, fn) => add('moveFailure', code, fn);
const FT = (code, fn) => add('moveFailureAgainstTarget', code, fn);
const E = (code, fn) => add('moveEffect', code, fn);
const ET = (code, fn) => add('moveEffectAgainstTarget', code, fn);
const sticky = (target, ai) => target.hasActiveAbility('stickyhold') && !ai.battle.moldBreaker;

ET('UserTakesTargetItem', (score, move, user, target, ai) => {
  if (user.item) return score;
  if (!target.item || target.unlosableItem(target.item)) return score;
  if (user.unlosableItem(target.item)) return score;
  if (target.effects.Substitute > 0) return score;
  if (sticky(target, ai)) return score;
  let userDiff = user.wantsItem(target.itemId) - user.wantsItem('');
  if (!user.itemActive()) userDiff = 0;
  let targetDiff = target.wantsItem('') - target.wantsItem(target.itemId);
  if (!target.itemActive()) targetDiff = 0;
  return score + userDiff * 4 - targetDiff * 4;
});
FT('TargetTakesUserItem', (move, user, target) => !user.item || user.unlosableItem(user.item) || !!target.item || target.unlosableItem(user.item));
ET('TargetTakesUserItem', (score, move, user, target) => {
  let userDiff = user.wantsItem('') - user.wantsItem(user.itemId);
  if (!user.itemActive()) userDiff = 0;
  let targetDiff = target.wantsItem(user.itemId) - target.wantsItem('');
  if (!target.itemActive()) targetDiff = 0;
  return score + userDiff * 4 - targetDiff * 4;
});
FT('UserTargetSwapItems', (move, user, target, ai) => (!user.item && !target.item) || user.unlosableItem(user.item) || user.unlosableItem(target.item) ||
  target.unlosableItem(target.item) || target.unlosableItem(user.item) || sticky(target, ai));
ET('UserTargetSwapItems', (score, move, user, target, ai) => {
  let userDiff = user.wantsItem(target.itemId) - user.wantsItem(user.itemId);
  if (!user.itemActive()) userDiff = 0;
  let targetDiff = target.wantsItem(user.itemId) - target.wantsItem(target.itemId);
  if (!target.itemActive()) targetDiff = 0;
  score += userDiff * 4 - targetDiff * 4;
  if (user.lastMoveUsed && ai.moveData(user.lastMoveUsed).functionCode === move.functionCode) score -= 15;
  return score;
});
F('RestoreUserConsumedItem', (move, user) => !user.mon?.lastItem || !!user.item);
E('RestoreUserConsumedItem', (score, move, user) => {
  if (!user.itemActive() && user.item) return MOVE_USELESS_SCORE;
  return score + (user.wantsItem(user.mon?.lastItem) - user.wantsItem('')) * 4;
});
add('moveBasePower', 'RemoveTargetItem', (power, move, user, target) => move.pbBaseDamage(power, user, target));
ET('RemoveTargetItem', (score, move, user, target, ai) => {
  if (!target.item || target.unlosableItem(target.item)) return score;
  if (target.effects.Substitute > 0) return score;
  if (sticky(target, ai)) return score;
  if (!target.itemActive()) return score;
  return score - (target.wantsItem('') - target.wantsItem(target.itemId)) * 4;
});
ET('DestroyTargetBerryOrGem', (score, move, user, target, ai) => {
  if (!target.item || (!target.isBerry() && !target.isGem())) return score;
  if (user.unlosableItem(target.item)) return score;
  if (target.effects.Substitute > 0) return score;
  if (sticky(target, ai)) return score;
  if (!target.itemActive()) return score;
  return score - (target.wantsItem('') - target.wantsItem(target.itemId)) * 4;
});
FT('CorrodeTargetItem', (move, user, target) => !target.item || target.unlosableItem(target.item) || target.effects.Substitute > 0 || target.hasActiveAbility('stickyhold'));
ET('CorrodeTargetItem', (score, move, user, target) => {
  let diff = target.wantsItem('') - target.wantsItem(target.itemId);
  if (!target.itemActive()) diff = 0;
  return score + diff * 4;
});
FT('StartTargetCannotUseItem', (move, user, target) => target.effects.Embargo > 0);
ET('StartTargetCannotUseItem', (score, move, user, target) => {
  if (!target.item || !target.itemActive()) return MOVE_USELESS_SCORE;
  const s = target.wantsItem(target.itemId);
  if (s <= 0) return MOVE_USELESS_SCORE;
  return score + s * 2;
});
E('StartNegateHeldItems', (score, move, user, ai) => {
  const room = ai.battle.field.pseudoWeather?.magicroom;
  if (room?.duration === 1) return undefined;
  let any = false, total = 0;
  for (const b of ai.eachBattler()) {
    if (!b.item) continue;
    if (ai.trainer.mediumSkill()) {
      if (room) { if (b.effects.Embargo > 0 || b.hasActiveAbility('klutz')) continue; }
      else if (!b.itemActive()) continue;
    }
    any = true;
    const w = b.wantsItem(b.itemId);
    total += b.opposes(user) ? w : -w;
  }
  if (!any) return MOVE_USELESS_SCORE;
  if (room) { if (total >= 0) return MOVE_USELESS_SCORE; return score - Math.max(total, -5) * 4; }
  if (total <= 0) return MOVE_USELESS_SCORE;
  return score + Math.min(total, 5) * 4;
});
const berryExtras = (b, ai) => {
  let s = 0;
  if (ai.trainer.mediumSkill()) {
    if (b.canHeal() && b.hp < b.totalhp / 2 && b.hasActiveAbility('cheekpouch')) s += 8;
    if (b.hasActiveAbility('harvest') || b.hasMoveWithFunction('RestoreUserConsumedItem')) s += 8;
    if (!b.canConsumeBerry()) s += 5;
    if (!b.mon?.ateBerry && b.hasMoveWithFunction('FailsIfUserNotConsumedBerry')) s += 5;
    if (b.hasActiveAbility('unburden')) s += 5;
  }
  return s;
};
F('UserConsumeBerryRaiseDefense2', (move, user) => !user.item || !user.isBerry() || !user.itemActive());
E('UserConsumeBerryRaiseDefense2', (score, move, user, ai) => {
  const raise = handlers.applyMoveEffectScore('RaiseUserDefense2', 0, move, user, ai, ai.battle);
  if (raise !== MOVE_USELESS_SCORE) score += raise;
  score += user.getScoreChangeForConsumingItem(user.itemId, true);
  return score + berryExtras(user, ai);
});
FT('AllBattlersConsumeBerry', (move, user, target) => !target.item || !target.isBerry() || target.semiInvulnerable());
ET('AllBattlersConsumeBerry', (score, move, user, target, ai) => {
  const change = target.getScoreChangeForConsumingItem(target.itemId, !target.opposes(user)) + berryExtras(target, ai);
  return score + (target.opposes(user) ? -change : change);
});
/* 쪼아대기·벌레먹음 (Gen9 팩 판) */
ET('UserConsumeTargetBerry', (score, move, user, target, ai) => {
  if (!target.item || !target.isBerry()) return score;
  if (user.unlosableItem(target.item)) return score;
  if (target.effects.Substitute > 0) return score;
  if (sticky(target, ai)) return score;
  score += user.getScoreChangeForConsumingItem(target.itemId);
  if (ai.trainer.mediumSkill()) {
    if (user.canHeal() && user.hp < user.totalhp / 2 && user.hasActiveAbility('cheekpouch')) score += 8;
    if (!user.mon?.ateBerry && user.hasMoveWithFunction('FailsIfUserNotConsumedBerry')) score += 5;
    if (target.hasActiveAbility('unburden')) score -= 5;
  }
  return score - (target.wantsItem('') - target.wantsItem(target.itemId)) * 3;
});
F('ThrowUserItemAtTarget', (move, user, ai) => {
  if (!user.item || !user.itemActive() || user.unlosableItem(user.item)) return true;
  if (user.isBerry() && !user.canConsumeBerry()) return true;
  return !ai.gen.items.get(user.item).fling;
});
add('moveBasePower', 'ThrowUserItemAtTarget', (power, move, user, target) => move.pbBaseDamage(power, user, target));
ET('ThrowUserItemAtTarget', (score, move, user, target, ai) => {
  const apply = code => handlers.applyMoveEffectAgainstTargetScore(code, score, move, user, target, ai, ai.battle);
  switch (user.itemId) {
    case 'poisonbarb': case 'toxicorb': score = apply('PoisonTarget'); break;
    case 'flameorb': score = apply('BurnTarget'); break;
    case 'lightball': score = apply('ParalyzeTarget'); break;
    case 'kingsrock': case 'razorfang': score = apply('FlinchTarget'); break;
    default: score -= target.getScoreChangeForConsumingItem(user.itemId);
  }
  if (ai.trainer.mediumSkill()) {
    if (user.isBerry() && target.hasMoveWithFunction('FailsIfUserNotConsumedBerry')) score -= 5;
    if (user.hasActiveAbility('unburden')) score += 5;
  }
  return score + (user.wantsItem('') - user.wantsItem(user.itemId)) * 2;
});
