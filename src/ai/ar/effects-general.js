/**
 * 원작 AI_ChooseMove_OtherScores (+ Gen9 팩 덮어쓰기) — 모든 기술에 붙는 공통 보정.
 * 명중률 감점, 예상 피해·KO 가점, 느릴 때 선공기, 매직코트/매직가드, 구애 도구, 마지막 포켓몬 등.
 */
import { add } from './handlers.js';
import { MOVE_USELESS_SCORE } from './handlers.js';
import { isIneffective } from './battler.js';

const G = (name, fn) => add('generalMove', name, fn);
const GT = (name, fn) => add('generalMoveAgainstTarget', name, fn);

/* 얼어 있으면 녹이는 기술을 우선 */
G('thawing_move_when_frozen', (score, move, user, ai) => {
  if (ai.trainer.mediumSkill() && user.status === 'frz') {
    if (move.thawsUser()) score += 20;
    else if (user.checkForMove(m => m.thawsUser())) score -= 20;
  }
  return score;
});

/* 느린데 선공기 — 쓰러지기 직전이거나 이걸로 마무리할 수 있으면 */
GT('priority_move_against_faster_target', (score, move, user, target, ai) => {
  if (ai.trainer.highSkill() && target.fasterThan(user) && move.roughPriority(user) > 0) {
    if (ai.trainer.hasSkillFlag('HPAware') && user.hp < user.totalhp / 3) score += 8;
    if (move.damagingMove() && move.roughDamage() >= target.hp) score += 8;
    for (const b of ai.eachFoeBattler(user.side)) if (b.hasMoveWithFunction('ProtectUserSideFromPriorityMoves')) score -= 5;
  }
  return score;
});

/* 매직미러·매직코트로 되돌아올 변화기 */
GT('target_can_Magic_Coat_or_Bounce_move', (score, move, user, target, ai) => {
  if (move.statusMove() && move.canMagicCoat() && target.opposes(user) && (target.fasterThan(user) || !target.semiInvulnerable())) {
    if (!ai.battle.moldBreaker && target.hasActiveAbility('magicbounce')) score = MOVE_USELESS_SCORE;
    else if (target.hasMoveWithFunction('BounceBackProblemCausingStatusMoves') && target.canAttack() && !target.semiInvulnerable()) score -= 7;
  }
  return score;
});
G('any_foe_can_Magic_Coat_or_Bounce_move', (score, move, user, ai) => {
  if (move.statusMove() && move.canMagicCoat() && move.pbTarget().num === 0) {
    for (const b of ai.eachFoeBattler(user.side)) {
      if (user.fasterThan(b) && b.semiInvulnerable()) continue;
      if (b.hasActiveAbility('magicbounce') && !ai.battle.moldBreaker) { score = MOVE_USELESS_SCORE; break; }
      if (b.hasMoveWithFunction('BounceBackProblemCausingStatusMoves') && b.canAttack() && !b.semiInvulnerable()) { score -= 7; break; }
    }
  }
  return score;
});

/* 가로챌 수 있는 기술 */
G('any_battler_can_Snatch_move', (score, move, user, ai) => {
  if (move.statusMove() && move.canSnatch()) {
    for (const b of ai.eachBattler()) {
      if (b.index === user.index) continue;
      if (!b.hasMoveWithFunction('StealAndUseBeneficialStatusMove')) continue;
      score -= 7; break;
    }
  }
  return score;
});

/* 구애 도구로 묶일 기술 (Gen9 팩) */
G('good_move_for_choice_item', (score, move, user, ai) => {
  if (!ai.trainer.mediumSkill()) return score;
  if (!user.hasActiveItem(['choiceband', 'choicespecs', 'choicescarf']) && !user.hasActiveAbility('gorillatactics')) return score;
  if (move.statusMove() && move.functionCode !== 'UserTargetSwapItems') return score - 25;
  const type = move.roughType();
  for (const t of ai.gen.types.all()) if (t.exists && !ai.gen.getImmunity(type, [t.name])) score -= 8;
  if (move.accuracy() > 0) score -= Math.trunc(0.4 * (100 - move.accuracy()));
  if (move.pp <= 5) score -= 10;
  return score;
});

/* 어느 한쪽이 마지막 포켓몬이면 공격기 */
G('damaging_move_and_either_side_no_reserves', (score, move, user, ai) => {
  if (ai.trainer.mediumSkill() && move.damagingMove()) {
    const reserves = ai.pbAbleNonActiveCount(user.idxOwnSide());
    const foes = ai.pbAbleNonActiveCount(user.idxOpposingSide());
    if (ai.trainer.highSkill() && foes > reserves) return score;
    if (foes === 0) score += 10;
    else if (reserves === 0) score += 5;
  }
  return score;
});

/* 상대가 가루를 알면 불꽃 기술 자제 */
GT('target_can_powder_fire_moves', (score, move, user, target, ai) => {
  if (ai.trainer.highSkill() && move.roughType() === 'Fire' && target.hasMoveWithFunction('TargetNextFireMoveDamagesTarget') && target.fasterThan(user)) score -= 5;
  return score;
});

/* 상대가 전기화·플라스마샤워로 전기 무효를 노릴 수 있으면 */
GT('target_can_make_moves_Electric_and_be_immune', (score, move, user, target, ai) => {
  if (!ai.trainer.highSkill()) return score;
  if (!target.hasMoveWithFunction('TargetMovesBecomeElectric') && !(move.roughType() === 'Normal' && target.hasMoveWithFunction('NormalMovesBecomeElectric'))) return score;
  if (!ai.pokemonCanAbsorbMove(target, move, 'Electric') && !isIneffective(target.effectivenessOfTypeAgainstBattler('Electric', user))) return score;
  const p = move.roughPriority(user);
  if (p > 0 || (p === 0 && target.fasterThan(user))) score -= 5;
  return score;
});

/* 공중·땅속에 숨은 상대 */
GT('target_semi_invulnerable', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill() && move.roughAccuracy() > 0 && target.semiInvulnerable()) {
    if (user.hasActiveAbility('noguard') || target.hasActiveAbility('noguard')) return score;
    const p = move.roughPriority(user);
    if (p > 0 || (p === 0 && user.fasterThan(target))) {
      let miss = true;
      if (ai.trainer.highSkill()) {
        if (target.inTwoTurnAttack('TwoTurnAttackInvulnerableInSky', 'TwoTurnAttackInvulnerableInSkyParalyzeTarget', 'TwoTurnAttackInvulnerableInSkyTargetCannotAct')) { if (move.hitsFlyingTargets()) miss = false; }
        else if (target.inTwoTurnAttack('TwoTurnAttackInvulnerableUnderground')) { if (move.hitsDiggingTargets()) miss = false; }
        else if (target.inTwoTurnAttack('TwoTurnAttackInvulnerableUnderwater')) { if (move.hitsDivingTargets()) miss = false; }
      }
      if (miss) score = MOVE_USELESS_SCORE;
    }
  }
  return score;
});

/* 명중률 — 90 미만이면 깎는다 */
GT('predicted_accuracy', (score, move) => {
  const acc = Math.trunc(move.roughAccuracy());
  if (acc < 90) score -= Math.trunc(0.25 * (100 - acc));
  return score;
});

/* 예상 피해 — 남은 HP 대비 최대 +30, 쓰러뜨리면 +10, 옹골참·기합의띠를 연속기로 넘으면 +8 */
GT('predicted_damage', (score, move, user, target, ai) => {
  if (move.damagingMove()) {
    const dmg = move.roughDamage();
    if (target.effects.Substitute > 0) {
      score += Math.trunc(Math.min(15 * dmg / target.effects.Substitute, 20));
    } else {
      score += Math.trunc(Math.min(25 * dmg / Math.max(1, target.hp), 30));
      if (ai.trainer.hasSkillFlag('HPAware') && dmg > target.hp * 1.1) {
        score += 10;
        if (move.multiHitMove() && target.hp === target.totalhp && (target.hasActiveAbility('sturdy') || target.hasActiveItem('focussash'))) score += 8;
      }
    }
  }
  return score;
});

/* 왕의징표석·악취 — 풀죽음 (Gen9 팩: 다이맥스·면역 고려) */
GT('external_flinching_effects', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill() && move.damagingMove() && !move.flinchingMove() && user.fasterThan(target) && target.effects.Substitute === 0) {
    if (user.hasActiveItem(['kingsrock', 'razorfang']) || user.hasActiveAbility('stench')) {
      if (!(target.hasActiveAbility(['innerfocus', 'shielddust']) && !ai.battle.moldBreaker)) {
        score += 8;
        if (move.multiHitMove()) score += 5;
      }
    }
  }
  return score;
});

/* 얼어 있는 상대를 녹이는 기술 (Gen9 팩의 원문 그대로 — 사용자 상태를 본다) */
GT('thawing_move_against_frozen_target', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill() && user.status === 'frz') {
    if (move.roughType() === 'Fire' || move.thawsUser()) score -= 20;
  }
  return score;
});

/* 맞으면 발동하는 상대 특성·도구 (까칠한피부·울퉁불퉁멧 등) */
const ON_BEING_HIT_ABILITIES = new Set(['aftermath', 'angerpoint', 'angershell', 'berserk', 'colorchange', 'cottondown', 'cursedbody', 'cutecharm', 'effectspore',
  'electromorphosis', 'flamebody', 'gooey', 'gulpmissile', 'illusion', 'innardsout', 'ironbarbs', 'justified', 'mummy', 'lingeringaroma', 'perishbody',
  'poisonpoint', 'rattled', 'roughskin', 'sandspit', 'seedsower', 'stamina', 'static', 'steamengine', 'tanglinghair', 'thermalexchange', 'toxicdebris',
  'wanderingspirit', 'watercompaction', 'weakarmor', 'windpower', 'pickpocket', 'emergencyexit', 'wimpout', 'berserk']);
const ON_BEING_HIT_ITEMS = new Set(['absorbbulb', 'airballoon', 'cellbattery', 'enigmaberry', 'jabocaberry', 'keeberry', 'luminousmoss', 'marangaberry',
  'rockyhelmet', 'rowapberry', 'snowball', 'weaknesspolicy', 'redcard', 'ejectbutton', 'ejectpack']);
GT('trigger_target_ability_or_item_upon_hit', (score, move, user, target, ai) => {
  if (ai.trainer.highSkill() && move.damagingMove() && target.effects.Substitute === 0) {
    if (target.abilityActive() && ON_BEING_HIT_ABILITIES.has(target.abilityId) && (!user.hasActiveAbility('sheerforce') || move.addlEffect === 0)) score += 8;
    if (target.itemActive() && ON_BEING_HIT_ITEMS.has(target.itemId)) score += 8;
  }
  return score;
});

/* 내 특성이 맞힐 때 발동 (독수·매지션·자기과신 등) */
const ON_DEALING_HIT = new Set(['poisontouch', 'toxicchain']);
const ON_END_OF_USING_MOVE = new Set(['beastboost', 'chillingneigh', 'grimneigh', 'asonechillingneigh', 'asonegrimneigh', 'magician', 'moxie', 'battlebond']);
GT('trigger_user_ability_upon_hit', (score, move, user, target, ai) => {
  if (ai.trainer.highSkill() && user.abilityActive() && move.damagingMove() && target.effects.Substitute === 0) {
    if ((ON_DEALING_HIT.has(user.abilityId) && move.contactMove()) || ON_END_OF_USING_MOVE.has(user.abilityId)) score += 8;
  }
  return score;
});

/* 길동무·원한을 쓴 상대를 쓰러뜨리지 않는다 */
GT('knocking_out_a_destiny_bonder_or_grudger', (score, move, user, target, ai) => {
  if ((ai.trainer.hasSkillFlag('HPAware') || ai.trainer.highSkill()) && move.damagingMove() && (target.effects.DestinyBond || target.effects.Grudge)) {
    const p = move.roughPriority(user);
    if (p > 0 || (p === 0 && user.fasterThan(target))) {
      if (move.roughDamage() > target.hp * 1.1) {
        if (target.effects.DestinyBond) { score -= 20; if (ai.pbAbleNonActiveCount(user.idxOwnSide()) === 0) score -= 10; }
        else if (target.effects.Grudge) { score -= 15; if (ai.pbAbleNonActiveCount(user.idxOwnSide()) === 0) score -= 7; }
      }
    }
  }
  return score;
});

/* 분노 중인 상대 */
GT('damaging_a_raging_target', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill() && target.effects.Rage && move.damagingMove()) {
    if (ai.trainer.hasSkillFlag('HPAware') && (move.roughDamage() + target.roughEndOfRoundDamage()) * 2 > target.hp * 1.1) return score;
    score -= 10;
  }
  return score;
});

/* 참는 중인 상대 */
GT('damaging_a_biding_target', (score, move, user, target, ai) => {
  if (ai.trainer.mediumSkill() && target.effects.Bide > 0 && move.damagingMove()) {
    if (!isIneffective(user.effectivenessOfTypeAgainstBattler('Normal', target))) {
      if (ai.trainer.hasSkillFlag('HPAware')) {
        const dmg = move.roughDamage();
        let eor = target.roughEndOfRoundDamage();
        let hits = target.effects.Bide - 1;
        eor *= hits;
        if (user.fasterThan(target)) hits += 1;
        if (dmg * hits + eor > target.hp * 1.1) return score;
      }
      score -= 20;
    }
  }
  return score;
});

/* 상대에게 무희가 있으면 춤 기술 자제 */
G('dance_move_against_dancer', (score, move, user, ai) => {
  if (move.danceMove()) for (const b of ai.eachFoeBattler(user.side)) if (b.hasActiveAbility('dancer')) score -= 10;
  return score;
});
