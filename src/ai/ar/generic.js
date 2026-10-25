/**
 * 원작 AI_ChooseMove_GenericEffects + AI_Utilities(특성·도구 평가) 이식.
 * 랭크 변화·날씨·필드의 공통 점수 계산 — 효과 핸들러가 불러 쓴다. ArAI.prototype에 붙는다.
 */
import { MOVE_USELESS_SCORE } from './handlers.js';
import { H, add, copy, handlers } from './handlers.js';
import { STAT_STAGE_MAXIMUM, stageRatio } from './battler.js';

const notUsingOtherAtk = m => m.functionCode !== 'UseUserDefenseInsteadOfUserAttack' && m.functionCode !== 'UseTargetAttackInsteadOfUserAttack';
const pairs = changes => { const out = []; for (let i = 0; i < changes.length; i += 2) out.push([changes[i], changes[i + 1]]); return out; };

export const GENERIC = {
  /** 원작 get_score_for_target_stat_raise */
  getScoreForTargetStatRaise(score, target, statChanges, wholeEffect = true, fixedChange = false, ignoreContrary = false) {
    if (this.move.damagingMove()) wholeEffect = false;
    let desire = 1;
    if (target.opposes(this.user) || (this.move.pbTarget(this.user).foe && target.index !== this.user.index)) desire = -1;
    if (!ignoreContrary && !fixedChange && !this.battle.moldBreaker && target.hasActiveAbility('contrary')) {
      if (desire > 0 && wholeEffect) return MOVE_USELESS_SCORE;
      return this.getScoreForTargetStatDrop(score, target, statChanges, wholeEffect, fixedChange, true);
    }
    const addEffect = this.move.getScoreChangeForAdditionalEffect(this.user, target);
    if (addEffect === -999) return score;
    if (target.roughEndOfRoundDamage() >= target.hp) return wholeEffect ? MOVE_USELESS_SCORE : score;
    if (!target.hasMoveWithFunction('PowerHigherWithUserPositiveStatStages')) {
      const aware = this.eachFoeBattler(target.side).some(b => !b.hasActiveAbility('unaware'));
      if (!aware) return wholeEffect ? MOVE_USELESS_SCORE : score;
    }
    const real = [];
    for (const [stat, n] of pairs(statChanges)) {
      if (!this.statRaiseWorthwhile(target, stat, fixedChange)) continue;
      let inc = n;
      if (!fixedChange && !this.battle.moldBreaker && target.hasActiveAbility('simple')) inc *= 2;
      inc = Math.min(inc, STAT_STAGE_MAXIMUM - target.stage(stat));
      if (inc > 0) real.push([stat, inc]);
    }
    if (!real.length) return wholeEffect ? MOVE_USELESS_SCORE : score;
    score += addEffect;
    score = this.getTargetStatRaiseScoreGeneric(score, target, real, desire);
    for (const [stat, inc] of real) score = this.getTargetStatRaiseScoreOne(score, target, stat, inc, desire);
    return score;
  },

  /** 원작 stat_raise_worthwhile? — 올려도 쓸모가 있나 */
  statRaiseWorthwhile(target, stat, fixedChange = false) {
    if (!fixedChange && !target.canRaiseStatStage(stat, this.user, this.move)) return false;
    if (target.hasMoveWithFunction('SwitchOutUserPassOnEffects', 'PowerHigherWithUserPositiveStatStages')) return true;
    switch (stat) {
      case 'atk': return target.checkForMove(m => m.physicalMove() && notUsingOtherAtk(m));
      case 'def':
        return this.eachFoeBattler(target.side).some(b => b.checkForMove(m => m.physicalMove() || m.functionCode === 'UseTargetDefenseInsteadOfTargetSpDef'));
      case 'spa': return target.checkForMove(m => m.specialMove());
      case 'spd':
        return this.eachFoeBattler(target.side).some(b => b.checkForMove(m => m.specialMove() && m.functionCode !== 'UseTargetDefenseInsteadOfTargetSpDef'));
      case 'spe':
        if (!target.hasMoveWithFunction('PowerHigherWithUserFasterThanTarget', 'PowerHigherWithUserPositiveStatStages')) {
          const mine = target.roughStat('spe');
          return this.eachFoeBattler(target.side).some(b => { const s = b.roughStat('spe'); return mine < s && mine * 2.5 > s; });
        }
        return true;
      case 'accuracy': {
        let min = 100;
        for (const m of target.moves) { if (m.accuracy === 0 || m.isOHKO()) continue; min = Math.min(min, m.accuracy); }
        if (min >= 90 && target.stage('accuracy') >= 0) return this.eachFoeBattler(target.side).some(b => b.stage('evasion') > 0);
        return true;
      }
    }
    return true;
  },

  getTargetStatRaiseScoreGeneric(score, target, changes, desire = 1) {
    const total = changes.reduce((s, c) => s + c[1], 0);
    if (this.user.turnCount < 2 && this.move.statusMove()) score += total * desire * 5;
    if (this.trainer.hasSkillFlag('HPAware')) {
      if (target.index !== this.user.index) score += total * desire * (Math.trunc(100 * this.user.hp / this.user.totalhp) - 50) / 8;
      score += total * desire * (Math.trunc(100 * target.hp / target.totalhp) - 50) / 8;
    }
    return score;
  },

  getTargetStatRaiseScoreOne(score, target, stat, increment, desire = 1) {
    const oldStage = target.stage(stat), newStage = oldStage + increment;
    let incMult = stageRatio(stat, newStage) / stageRatio(stat, oldStage) - 1;
    incMult *= desire;
    const sideMult = target.opposes(this.user) ? 1 : desire;
    switch (stat) {
      case 'atk':
        if (oldStage >= 2 && increment === 1) score -= 10 * sideMult;
        else score += (target.checkForMove(m => m.specialMove()) ? 8 : 12) * incMult;
        break;
      case 'def': case 'spd':
        if (oldStage >= 2 && increment === 1) score -= 10 * sideMult;
        else score += 10 * incMult;
        break;
      case 'spa':
        if (oldStage >= 2 && increment === 1) score -= 10 * sideMult;
        else score += (target.checkForMove(m => m.physicalMove() && notUsingOtherAtk(m)) ? 8 : 12) * incMult;
        break;
      case 'spe': {
        const mine = target.roughStat('spe');
        for (const b of this.eachFoeBattler(target.side)) {
          const s = b.roughStat('spe');
          if (s <= mine) continue;
          if (s > mine * 2.5) continue;
          score += (s < mine * (increment + 2) / 2 ? 15 : 8) * incMult;
          break;
        }
        if (target.hasMoveWithFunction('PowerHigherWithUserFasterThanTarget', 'PowerHigherWithUserPositiveStatStages')) score += 5 * incMult;
        for (const b of this.eachFoeBattler(target.side)) if (b.hasMoveWithFunction('PowerHigherWithTargetFasterThanUser')) score -= 5 * incMult;
        if (target.hasActiveAbility('speedboost')) score -= 15 * sideMult;
        break;
      }
      case 'accuracy':
        if (oldStage >= 2 && increment === 1) score -= 10 * sideMult;
        else {
          let min = 100;
          for (const m of target.moves) { if (m.accuracy === 0 || m.isOHKO()) continue; min = Math.min(min, m.accuracy); }
          min = min * stageRatio('accuracy', oldStage);
          if (min < 90) score += 10 * incMult;
        }
        break;
      case 'evasion':
        for (const b of this.eachFoeBattler(target.side)) if (b.roughEndOfRoundDamage() > 0) score += 5 * incMult;
        if (oldStage >= 2 && increment === 1) score -= 10 * sideMult;
        else score += 10 * incMult;
        break;
    }
    if (target.hasMoveWithFunction('PowerHigherWithUserPositiveStatStages')) score += 5 * increment * desire;
    for (const b of this.eachFoeBattler(target.side)) if (b.hasMoveWithFunction('PowerHigherWithTargetPositiveStatStages')) score -= 5 * increment * desire;
    return score;
  },

  /** 원작 get_score_for_target_stat_drop */
  getScoreForTargetStatDrop(score, target, statChanges, wholeEffect = true, fixedChange = false, ignoreContrary = false) {
    if (this.move.damagingMove()) wholeEffect = false;
    let desire = -1;
    if (target.opposes(this.user) || (this.move.pbTarget(this.user).foe && target.index !== this.user.index)) desire = 1;
    if (!ignoreContrary && !fixedChange && !this.battle.moldBreaker && target.hasActiveAbility('contrary')) {
      if (desire > 0 && wholeEffect) return MOVE_USELESS_SCORE;
      return this.getScoreForTargetStatRaise(score, target, statChanges, wholeEffect, fixedChange, true);
    }
    const addEffect = this.move.getScoreChangeForAdditionalEffect(this.user, target);
    if (addEffect === -999) return score;
    if (target.roughEndOfRoundDamage() >= target.hp) return wholeEffect ? MOVE_USELESS_SCORE : score;
    const aware = this.eachFoeBattler(target.side).some(b => !b.hasActiveAbility('unaware'));
    if (!aware) return wholeEffect ? MOVE_USELESS_SCORE : score;
    const real = [];
    for (const [stat, n] of pairs(statChanges)) {
      if (!this.statDropWorthwhile(target, stat, fixedChange)) continue;
      let dec = n;
      if (!fixedChange && !this.battle.moldBreaker && target.hasActiveAbility('simple')) dec *= 2;
      dec = Math.min(dec, STAT_STAGE_MAXIMUM + target.stage(stat));
      if (dec > 0) real.push([stat, dec]);
    }
    if (!real.length) return wholeEffect ? MOVE_USELESS_SCORE : score;
    score += addEffect;
    score = this.getTargetStatDropScoreGeneric(score, target, real, desire);
    for (const [stat, dec] of real) score = this.getTargetStatDropScoreOne(score, target, stat, dec, desire);
    return score;
  },

  /** 원작 stat_drop_worthwhile? */
  statDropWorthwhile(target, stat, fixedChange = false) {
    if (!fixedChange && !target.canLowerStatStage(stat, this.user, this.move)) return false;
    switch (stat) {
      case 'atk': return target.checkForMove(m => m.physicalMove() && notUsingOtherAtk(m));
      case 'def':
        return this.eachFoeBattler(target.side).some(b => b.checkForMove(m => m.physicalMove() || m.functionCode === 'UseTargetDefenseInsteadOfTargetSpDef'));
      case 'spa': return target.checkForMove(m => m.specialMove());
      case 'spd':
        return this.eachFoeBattler(target.side).some(b => b.checkForMove(m => m.specialMove() && m.functionCode !== 'UseTargetDefenseInsteadOfTargetSpDef'));
      case 'spe':
        if (!target.hasMoveWithFunction('PowerHigherWithUserFasterThanTarget', 'PowerHigherWithUserPositiveStatStages')) {
          const mine = target.roughStat('spe');
          return this.eachFoeBattler(target.side).some(b => { const s = b.roughStat('spe'); return mine > s && mine < s * 2.5; });
        }
        return true;
      case 'accuracy': return target.moves.some(m => m.accuracy > 0 && !m.isOHKO());
    }
    return true;
  },

  getTargetStatDropScoreGeneric(score, target, changes, desire = 1) {
    const total = changes.reduce((s, c) => s + c[1], 0);
    if (this.user.turnCount < 2 && this.move.statusMove()) score += total * desire * 5;
    if (this.trainer.hasSkillFlag('HPAware')) {
      if (target.index !== this.user.index) score += total * desire * (Math.trunc(100 * this.user.hp / this.user.totalhp) - 50) / 8;
      score += total * desire * (Math.trunc(100 * target.hp / target.totalhp) - 50) / 8;
    }
    /* 오기·승기 — 랭크가 떨어지면 오히려 강해진다 */
    if (target.opposes(this.user) && target.abilityActive() && ['competitive', 'defiant'].includes(target.abilityId)) score -= 10;
    return score;
  },

  getTargetStatDropScoreOne(score, target, stat, decrement, desire = 1) {
    const oldStage = target.stage(stat), newStage = oldStage - decrement;
    let decMult = stageRatio(stat, oldStage) / stageRatio(stat, newStage) - 1;
    decMult *= desire;
    const sideMult = target.opposes(this.user) ? 1 : desire;
    switch (stat) {
      case 'atk':
        if (oldStage <= -2 && decrement === 1) score -= 10 * sideMult;
        else score += (target.checkForMove(m => m.specialMove()) ? 8 : 12) * decMult;
        break;
      case 'def': case 'spd': case 'accuracy': case 'evasion':
        if (oldStage <= -2 && decrement === 1) score -= 10 * sideMult;
        else score += 10 * decMult;
        break;
      case 'spa':
        if (oldStage <= -2 && decrement === 1) score -= 10 * sideMult;
        else score += (target.checkForMove(m => m.physicalMove() && notUsingOtherAtk(m)) ? 8 : 12) * decMult;
        break;
      case 'spe': {
        const mine = target.roughStat('spe');
        for (const b of this.eachFoeBattler(target.side)) {
          const s = b.roughStat('spe');
          if (mine < s) continue;
          if (mine > s * 2.5) continue;
          score += (mine < s * 2 / (decrement + 2) ? 15 : 8) * decMult;
          break;
        }
        for (const b of this.eachFoeBattler(target.side)) if (b.hasMoveWithFunction('PowerHigherWithUserFasterThanTarget')) score += 5 * decMult;
        if (target.hasActiveAbility('speedboost')) score -= 15 * sideMult;
        break;
      }
    }
    if (target.hasMoveWithFunction('PowerHigherWithUserPositiveStatStages')) score += 5 * decrement * desire;
    for (const b of this.eachFoeBattler(target.side)) if (b.hasMoveWithFunction('PowerHigherWithTargetPositiveStatStages')) score -= 5 * decrement * desire;
    return score;
  },

  /** 원작 get_score_for_weather (+ Gen9 팩: 설경 얼음 방어·하드론/오리컬컴·하이드로스팀 등) */
  getScoreForWeather(weather, moveUser, starting = false) {
    if (this.globalAbility('airlock') || this.globalAbility('cloudnine')) return 0;
    let ret = 0;
    if (starting) {
      const ext = { Sun: 'heatrock', Rain: 'damprock', Sandstorm: 'smoothrock', Hail: 'icyrock' }[weather];
      if (ext && moveUser.hasActiveItem(ext)) ret += 4;
    }
    for (const b of this.eachBattler()) {
      const foe = b.opposes(moveUser);
      const sgn = v => (foe ? -v : v);
      switch (weather) {
        case 'Sun':
          if (b.hasDamagingMoveOfType('Fire')) ret += sgn(10);
          if (b.hasDamagingMoveOfType('Water')) ret += sgn(-10);
          if (b.hasMoveWithFunction('FreezeTarget', 'FreezeFlinchTarget')) ret += sgn(-5);
          break;
        case 'Rain':
          if (b.hasDamagingMoveOfType('Water')) ret += sgn(10);
          if (b.hasDamagingMoveOfType('Fire')) ret += sgn(-10);
          break;
        case 'Sandstorm':
          if (b.takesSandstormDamage()) ret += sgn(-10);
          if (b.hasType('Rock')) ret += sgn(10);
          break;
        case 'Hail':
          if (b.takesHailDamage()) ret += sgn(-10);
          if (b.hasType('Ice')) ret += sgn(10);   // 설경 방어 상승 (Gen9)
          break;
      }
      if (this.trainer.mediumSkill() && !b.hasActiveItem('utilityumbrella')) {
        const good = { Sun: ['chlorophyll', 'flowergift', 'forecast', 'harvest', 'leafguard', 'solarpower', 'orichalcumpulse', 'protosynthesis'],
          Rain: ['dryskin', 'forecast', 'hydration', 'raindish', 'swiftswim'], Sandstorm: ['sandforce', 'sandrush', 'sandveil'],
          Hail: ['forecast', 'icebody', 'slushrush', 'snowcloak'] }[weather];
        if (good && b.hasActiveAbility(good)) ret += sgn(5);
        if (weather === 'Sun' && b.hasActiveAbility(['orichalcumpulse', 'protosynthesis'])) ret += sgn(5);   // Gen9 팩이 한 번 더 더한다
        if (weather === 'Hail' && b.abilityId === 'iceface') ret += sgn(5);
        if (weather === 'Sun' && b.hasActiveAbility('dryskin')) ret += sgn(-5);
        const goodMoves = { Sun: ['HealUserDependingOnWeather', 'RaiseUserAtkSpAtk1Or2InSun', 'TwoTurnAttackOneTurnInSun', 'TypeAndPowerDependOnWeather'],
          Rain: ['ConfuseTargetAlwaysHitsInRainHitsTargetInSky', 'ParalyzeTargetAlwaysHitsInRainHitsTargetInSky', 'TypeAndPowerDependOnWeather'],
          Sandstorm: ['HealUserDependingOnSandstorm', 'TypeAndPowerDependOnWeather'],
          Hail: ['FreezeTargetAlwaysHitsInHail', 'StartWeakenDamageAgainstUserSideIfHail', 'TypeAndPowerDependOnWeather'] }[weather];
        if (goodMoves && b.hasMoveWithFunction(...goodMoves)) ret += sgn(5);
        const badMoves = { Sun: ['ConfuseTargetAlwaysHitsInRainHitsTargetInSky', 'ParalyzeTargetAlwaysHitsInRainHitsTargetInSky'],
          Rain: ['HealUserDependingOnWeather', 'TwoTurnAttackOneTurnInSun'], Sandstorm: ['HealUserDependingOnWeather', 'TwoTurnAttackOneTurnInSun'],
          Hail: ['HealUserDependingOnWeather', 'TwoTurnAttackOneTurnInSun'] }[weather];
        if (badMoves && b.hasMoveWithFunction(...badMoves)) ret += sgn(-5);
        const gen9Moves = { Sun: ['IncreasePowerInSunWeather'], Rain: ['LowerTargetSpeed1AlwaysHitsInRain', 'ParalyzeTargetAlwaysHitsInRain', 'BurnTargetAlwaysHitsInRain'] }[weather];
        if (gen9Moves && b.hasMoveWithFunction(...gen9Moves)) ret += sgn(5);
      }
    }
    return ret;
  },

  /** 원작 get_score_for_terrain (+ Gen9 팩: 쿼크차지·하드론엔진·라이징볼트류) */
  getScoreForTerrain(terrain, moveUser, starting = false) {
    let ret = 0;
    if (starting && terrain !== 'None' && moveUser.hasActiveItem('terrainextender')) ret += 4;
    for (const b of this.eachBattler()) {
      if (!b.affectedByTerrain()) continue;
      const sgn = v => (b.opposes(moveUser) ? -v : v);
      switch (terrain) {
        case 'Electric':
          if (!b.status) ret += sgn(8);
          if (b.effects.Yawn > 0) ret += sgn(10);
          if (b.hasDamagingMoveOfType('Electric')) ret += sgn(10);
          break;
        case 'Grassy':
          ret += sgn(8);
          if (b.hasDamagingMoveOfType('Grass')) ret += sgn(10);
          break;
        case 'Misty':
          if (!b.status || b.effects.Confusion === 0) ret += sgn(8);
          if (b.hasDamagingMoveOfType('Dragon')) ret += sgn(-10);
          break;
        case 'Psychic':
          if (b.checkForMove(m => m.priority > 0 && m.pbTarget().num === 1 && m.pbTarget().foe)) ret += sgn(-10);
          if (b.hasDamagingMoveOfType('Psychic')) ret += sgn(10);
          break;
      }
    }
    const seed = { Electric: 'electricseed', Grassy: 'grassyseed', Misty: 'mistyseed', Psychic: 'psychicseed' }[terrain];
    for (const b of this.eachBattler()) if (seed && b.hasActiveItem(seed)) ret += b.opposes(moveUser) ? -8 : 8;
    if (this.trainer.mediumSkill()) {
      const abils = { Electric: ['surgesurfer', 'quarkdrive', 'hadronengine'], Grassy: ['grasspelt'] }[terrain];
      const good = { Electric: ['DoublePowerInElectricTerrain', 'IncreasePowerInElectricTerrain'], Grassy: ['HealTargetDependingOnGrassyTerrain', 'HigherPriorityInGrassyTerrain'],
        Misty: ['UserFaintsPowersUpInMistyTerrainExplosive'], Psychic: ['HitsAllFoesAndPowersUpInPsychicTerrain'] }[terrain];
      const bad = { Grassy: ['DoublePowerIfTargetUnderground', 'LowerTargetSpeed1WeakerInGrassyTerrain', 'RandomPowerDoublePowerIfTargetUnderground'] }[terrain];
      for (const b of this.eachBattler()) {
        if (!b.affectedByTerrain()) continue;
        const sgn = v => (b.opposes(moveUser) ? -v : v);
        if (b.hasActiveAbility('mimicry')) ret += sgn(5);
        if (abils && b.hasActiveAbility(abils)) ret += sgn(8);
        if (b.hasMoveWithFunction('EffectDependsOnEnvironment', 'SetUserTypesBasedOnEnvironment', 'TypeAndPowerDependOnTerrain', 'UseMoveDependingOnEnvironment')) ret += sgn(5);
        if (good && b.hasMoveWithFunction(...good)) ret += sgn(5);
        if (bad && b.hasMoveWithFunction(...bad)) ret += sgn(-5);
      }
    }
    return ret;
  },

  /* ---------- 특성·도구의 가치 (원작 wants_ability? / wants_item?) ---------- */
  abilityRating(battler, ability) {
    let ret = ABILITY_RATING.get(ability) ?? 0;
    if (this.trainer.mediumSkill()) ret = handlers.modifyAbilityRanking(ability, ret, battler, this);
    return ret;
  },
  itemRating(battler, item) {
    item = item || '';
    let ret = ITEM_RATING.get(item) ?? 0;
    if (this.trainer.mediumSkill()) ret = handlers.modifyItemRanking(item, ret, battler, this);
    if (item && battler.hasMoveWithFunction('ThrowUserItemAtTarget')) {
      const fling = this.gen.items.get(item).fling?.basePower || 0;
      if (fling >= 80) ret += 1;
      if (fling >= 100) ret += 1;
      if (['flameorb', 'kingsrock', 'lightball', 'poisonbarb', 'razorfang', 'toxicorb'].includes(item)) ret += 1;
    }
    if (battler.hasMoveWithFunction('DoublePowerIfUserHasNoItem')) ret += item ? -1 : 1;
    return ret;
  },
  /** 원작 get_score_change_for_consuming_item (+ Gen9 팩) */
  consumeItemScore(b, item, tryPreserving = false) {
    let ret = 0;
    const berry = this.gen.items.get(item).isBerry, ripen = berry && b.hasActiveAbility('ripen');
    switch (item) {
      case 'oranberry': case 'berryjuice': case 'enigmaberry': case 'sitrusberry':
        ret += b.hp > b.totalhp * 0.75 ? -6 : 6; if (ripen) ret = Math.trunc(ret * 3 / 2); break;
      case 'aguavberry': case 'figyberry': case 'iapapaberry': case 'magoberry': case 'wikiberry':
        ret += b.hp > b.totalhp * (1 - 1 / 3) ? -6 : 6; if (ripen) ret = Math.trunc(ret * 3 / 2); break;
      case 'aspearberry': ret += b.status === 'frz' ? 6 : -6; break;
      case 'cheriberry': ret += b.status === 'par' ? 6 : -6; break;
      case 'chestoberry': ret += b.status === 'slp' ? 6 : -6; break;
      case 'pechaberry': ret += b.status === 'psn' ? 6 : -6; break;
      case 'rawstberry': ret += b.status === 'brn' ? 6 : -6; break;
      case 'persimberry': ret += b.effects.Confusion > 1 ? 6 : -6; break;
      case 'lumberry': ret += (b.status || b.effects.Confusion > 1) ? 6 : -6; break;
      case 'mentalherb':
        ret += (b.effects.Attract >= 0 || b.effects.Taunt > 1 || b.effects.Encore > 1 || b.effects.Torment || b.effects.Disable > 1 || b.effects.HealBlock > 1) ? 6 : -6; break;
      case 'apicotberry': case 'ganlonberry': case 'liechiberry': case 'petayaberry': case 'salacberry': case 'keeberry': case 'marangaberry': {
        const stat = { apicotberry: 'spd', ganlonberry: 'def', liechiberry: 'atk', petayaberry: 'spa', salacberry: 'spe', keeberry: 'def', marangaberry: 'spd' }[item];
        ret += this.statRaiseWorthwhile(b, stat) ? 8 : -8; if (ripen) ret = Math.trunc(ret * 3 / 2); break;
      }
      case 'starfberry': ret += 8; if (ripen) ret = Math.trunc(ret * 3 / 2); break;
      case 'whiteherb': ret += b.hasLoweredStatStages() ? 8 : -8; break;
      case 'micleberry': ret += this.statRaiseWorthwhile(b, 'accuracy', true) ? 6 : -6; break;
      case 'lansatberry': ret += b.effects.FocusEnergy < 2 ? 6 : -6; break;
      case 'leppaberry': ret += 6; if (ripen) ret = Math.trunc(ret * 3 / 2); break;
    }
    if (ret < 0 && !tryPreserving) ret = 0;
    return ret;
  },
};

/* ---------- 원작 BASE_ABILITY_RATINGS / BASE_ITEM_RATINGS (+ Gen9 팩) ---------- */
const listToMap = table => {
  const m = new Map();
  for (const [val, ids] of Object.entries(table)) for (const id of ids) if (!m.has(id)) m.set(id, Number(val));
  return m;
};
export const ABILITY_RATING = listToMap({
  10: ['deltastream', 'desolateland', 'hugepower', 'moody', 'parentalbond', 'powerconstruct', 'primordialsea', 'purepower', 'shadowtag', 'stancechange', 'wonderguard'],
  9: ['arenatrap', 'drizzle', 'drought', 'imposter', 'magicbounce', 'magicguard', 'magnetpull', 'sandstream', 'speedboost', 'orichalcumpulse', 'hadronengine'],
  8: ['adaptability', 'aerilate', 'contrary', 'disguise', 'dragonsmaw', 'electricsurge', 'galvanize', 'grassysurge', 'illusion', 'libero', 'mistysurge', 'multiscale', 'multitype', 'noguard', 'poisonheal', 'pixilate', 'prankster', 'protean', 'psychicsurge', 'refrigerate', 'regenerator', 'rkssystem', 'serenegrace', 'shadowshield', 'sheerforce', 'simple', 'snowwarning', 'technician', 'transistor', 'waterbubble', 'thermalexchange'],
  7: ['beastboost', 'bulletproof', 'compoundeyes', 'download', 'furcoat', 'hustle', 'icescales', 'intimidate', 'levitate', 'lightningrod', 'megalauncher', 'moldbreaker', 'moxie', 'naturalcure', 'sapsipper', 'shedskin', 'skilllink', 'soulheart', 'stormdrain', 'teravolt', 'thickfat', 'tintedlens', 'toughclaws', 'triage', 'turboblaze', 'unburden', 'voltabsorb', 'waterabsorb', 'eartheater', 'toxicdebris', 'protosynthesis', 'quarkdrive', 'supersweetsyrup', 'mindseye'],
  6: ['battlebond', 'chlorophyll', 'comatose', 'darkaura', 'dryskin', 'fairyaura', 'filter', 'flashfire', 'forecast', 'galewings', 'guts', 'infiltrator', 'ironbarbs', 'ironfist', 'mirrorarmor', 'motordrive', 'neuroforce', 'prismarmor', 'queenlymajesty', 'reckless', 'roughskin', 'sandrush', 'schooling', 'scrappy', 'shieldsdown', 'solidrock', 'stakeout', 'stamina', 'steelworker', 'strongjaw', 'sturdy', 'swiftswim', 'toxicboost', 'trace', 'unaware', 'victorystar', 'supremeoverlord', 'seedsower', 'opportunist'],
  5: ['aftermath', 'airlock', 'analytic', 'berserk', 'blaze', 'cloudnine', 'competitive', 'corrosion', 'dancer', 'dazzling', 'defiant', 'flareboost', 'fluffy', 'gooey', 'harvest', 'heatproof', 'innardsout', 'liquidvoice', 'marvelscale', 'mummy', 'neutralizinggas', 'overcoat', 'overgrow', 'pressure', 'quickfeet', 'rockhead', 'sandspit', 'shielddust', 'slushrush', 'swarm', 'tanglinghair', 'torrent', 'armortail', 'rockypayload', 'sharpness', 'lingeringaroma', 'cudchew', 'toxicchain', 'poisonpuppeteer'],
  4: ['angerpoint', 'baddreams', 'cheekpouch', 'clearbody', 'cursedbody', 'earlybird', 'effectspore', 'flamebody', 'flowergift', 'fullmetalbody', 'gorillatactics', 'hydration', 'iceface', 'immunity', 'insomnia', 'justified', 'merciless', 'pastelveil', 'poisonpoint', 'poisontouch', 'ripen', 'sandforce', 'soundproof', 'static', 'surgesurfer', 'sweetveil', 'synchronize', 'vitalspirit', 'watercompaction', 'waterveil', 'whitesmoke', 'wonderskin', 'purifyingsalt', 'wellbakedbody', 'angershell', 'electromorphosis', 'windpower'],
  3: ['aromaveil', 'aurabreak', 'cottondown', 'dauntlessshield', 'emergencyexit', 'gluttony', 'gulpmissile', 'hypercutter', 'icebody', 'intrepidsword', 'limber', 'liquidooze', 'longreach', 'magician', 'owntempo', 'pickpocket', 'raindish', 'rattled', 'sandveil', 'screencleaner', 'sniper', 'snowcloak', 'solarpower', 'steamengine', 'stickyhold', 'superluck', 'unnerve', 'wimpout', 'windrider', 'hospitality', 'tabletsofruin', 'swordofruin', 'vesselofruin', 'beadsofruin'],
  2: ['battlearmor', 'colorchange', 'cutecharm', 'damp', 'grasspelt', 'hungerswitch', 'innerfocus', 'leafguard', 'lightmetal', 'mimicry', 'oblivious', 'powerspot', 'propellertail', 'punkrock', 'shellarmor', 'stalwart', 'steadfast', 'steelyspirit', 'suctioncups', 'tangledfeet', 'wanderingspirit', 'weakarmor'],
  1: ['bigpecks', 'keeneye', 'magmaarmor', 'pickup', 'rivalry', 'stench', 'embodyaspectteal', 'embodyaspecthearthflame', 'embodyaspectwellspring', 'embodyaspectcornerstone', 'terashift', 'terashell', 'teraformzero'],
  0: ['anticipation', 'asonechillingneigh', 'asonegrimneigh', 'ballfetch', 'battery', 'chillingneigh', 'curiousmedicine', 'flowerveil', 'forewarn', 'friendguard', 'frisk', 'grimneigh', 'healer', 'honeygather', 'illuminate', 'minus', 'plus', 'powerofalchemy', 'quickdraw', 'receiver', 'runaway', 'symbiosis', 'telepathy', 'unseenfist'],
  '-1': ['defeatist', 'heavymetal', 'klutz', 'normalize', 'perishbody', 'stall', 'zenmode'],
  '-2': ['slowstart', 'truant'],
});
const BERRIES_RESIST = ['babiriberry', 'chartiberry', 'chilanberry', 'chopleberry', 'cobaberry', 'colburberry', 'habanberry', 'kasibberry', 'kebiaberry', 'occaberry', 'passhoberry', 'payapaberry', 'rindoberry', 'roseliberry', 'shucaberry', 'tangaberry', 'wacanberry', 'yacheberry'];
const GEMS = ['buggem', 'darkgem', 'dragongem', 'electricgem', 'fairygem', 'fightinggem', 'firegem', 'flyinggem', 'ghostgem', 'grassgem', 'groundgem', 'icegem', 'normalgem', 'poisongem', 'psychicgem', 'rockgem', 'steelgem', 'watergem'];
const TYPE_BOOSTERS = ['blackbelt', 'blackglasses', 'charcoal', 'dragonfang', 'hardstone', 'magnet', 'metalcoat', 'miracleseed', 'mysticwater', 'nevermeltice', 'poisonbarb', 'sharpbeak', 'silkscarf', 'silverpowder', 'softsand', 'spelltag', 'twistedspoon',
  'dracoplate', 'dreadplate', 'earthplate', 'fistplate', 'flameplate', 'icicleplate', 'insectplate', 'ironplate', 'meadowplate', 'mindplate', 'pixieplate', 'skyplate', 'splashplate', 'spookyplate', 'stoneplate', 'toxicplate', 'zapplate',
  'oddincense', 'rockincense', 'roseincense', 'seaincense', 'waveincense'];
export const ITEM_RATING = listToMap({
  10: ['eviolite', 'focussash', 'lifeorb', 'thickclub'],
  9: ['assaultvest', 'blacksludge', 'choiceband', 'choicescarf', 'choicespecs', 'deepseatooth', 'leftovers'],
  8: ['leek', 'stick', 'throatspray', 'weaknesspolicy'],
  7: ['expertbelt', 'lightball', 'lumberry', 'powerherb', 'rockyhelmet', 'sitrusberry'],
  6: ['kingsrock', 'liechiberry', 'lightclay', 'petayaberry', 'razorfang', 'redcard', 'salacberry', 'shellbell', 'whiteherb', ...BERRIES_RESIST, ...GEMS,
    'adamantorb', 'griseousorb', 'lustrousorb', 'souldew', 'aguavberry', 'figyberry', 'iapapaberry', 'magoberry', 'wikiberry',
    'legendplate', 'boosterenergy', 'adamantcrystal', 'lustrousglobe', 'griseouscore', 'wellspringmask', 'hearthflamemask', 'cornerstonemask'],
  5: ['custapberry', 'deepseascale', 'ejectbutton', 'focusband', 'jabocaberry', 'keeberry', 'lansatberry', 'marangaberry', 'mentalherb', 'metronome', 'muscleband', 'quickclaw', 'razorclaw', 'rowapberry', 'scopelens', 'wiseglasses',
    ...TYPE_BOOSTERS, 'damprock', 'heatrock', 'icyrock', 'smoothrock', 'terrainextender', 'blankplate', 'punchingglove', 'loadeddice', 'fairyfeather'],
  4: ['adrenalineorb', 'apicotberry', 'blunderpolicy', 'chestoberry', 'ejectpack', 'enigmaberry', 'ganlonberry', 'heavydutyboots', 'roomservice', 'safetygoggles', 'shedshell', 'starfberry'],
  3: ['bigroot', 'brightpowder', 'laxincense', 'leppaberry', 'persimberry', 'protectivepads', 'utilityumbrella', 'aspearberry', 'cheriberry', 'pechaberry', 'rawstberry', 'hopoberry', 'mirrorherb', 'covertcloak'],
  2: ['absorbbulb', 'berryjuice', 'cellbattery', 'gripclaw', 'luminousmoss', 'micleberry', 'oranberry', 'snowball', 'widelens', 'zoomlens', 'electricseed', 'grassyseed', 'mistyseed', 'psychicseed', 'clearamulet'],
  1: ['airballoon', 'bindingband', 'destinyknot', 'floatstone', 'luckypunch', 'metalpowder', 'quickpowder', 'burndrive', 'chilldrive', 'dousedrive', 'shockdrive'],
  0: ['smokeball'],
  '-5': ['fullincense', 'laggingtail', 'ringtarget'],
  '-6': ['machobrace', 'poweranklet', 'powerband', 'powerbelt', 'powerbracer', 'powerlens', 'powerweight'],
  '-7': ['flameorb', 'ironball', 'toxicorb'],
  '-9': ['stickybarb'],
});

/* ---------- 특성 순위 보정 (원작 AbilityRanking + Gen9 팩) ---------- */
const abilityIf = (ids, fn) => { for (const id of ids) add('abilityRanking', id, fn); };
abilityIf(['blaze'], (a, s, b) => (b.hasDamagingMoveOfType('Fire') ? s : 0));
abilityIf(['cutecharm', 'rivalry'], (a, s, b) => (b.gender === 'N' ? 0 : s));
abilityIf(['friendguard', 'healer', 'symbiosis', 'telepathy'], () => 0);
abilityIf(['galewings'], (a, s, b) => (b.checkForMove(m => m.type === 'Flying') ? s : 0));
abilityIf(['hugepower', 'purepower'], (a, s, b, ai) => (ai.statRaiseWorthwhile(b, 'atk', true) ? s : 0));
abilityIf(['ironfist'], (a, s, b) => (b.checkForMove(m => m.punchingMove()) ? s : 0));
abilityIf(['liquidvoice'], (a, s, b) => (b.checkForMove(m => m.soundMove()) ? s : 0));
abilityIf(['megalauncher'], (a, s, b) => (b.checkForMove(m => m.pulseMove()) ? s : 0));
abilityIf(['overgrow'], (a, s, b) => (b.hasDamagingMoveOfType('Grass') ? s : 0));
abilityIf(['prankster'], (a, s, b) => (b.checkForMove(m => m.statusMove()) ? s : 0));
abilityIf(['punkrock'], (a, s, b) => (b.checkForMove(m => m.damagingMove() && m.soundMove()) ? s : 1));
abilityIf(['reckless'], (a, s, b) => (b.checkForMove(m => m.recoilMove()) ? s : 0));
abilityIf(['rockhead'], (a, s, b) => (b.checkForMove(m => m.recoilMove() && m.functionCode !== 'CrashDamageIfFailsUnusableInGravity') ? s : 0));
abilityIf(['runaway'], (a, s) => s);
abilityIf(['sandforce'], (a, s, b) => (b.hasDamagingMoveOfType('Ground', 'Rock', 'Steel') ? s : 2));
abilityIf(['skilllink'], (a, s, b) => (b.checkForMove(m => m.functionCode === 'HitTwoToFiveTimes') ? s : 0));
abilityIf(['steelworker'], (a, s, b) => (b.hasDamagingMoveOfType('Steel') ? s : 0));
abilityIf(['swarm'], (a, s, b) => (b.hasDamagingMoveOfType('Bug') ? s : 0));
abilityIf(['torrent'], (a, s, b) => (b.hasDamagingMoveOfType('Water') ? s : 0));
abilityIf(['triage'], (a, s, b) => (b.checkForMove(m => m.healingMove()) ? s : 0));
abilityIf(['rockypayload'], (a, s, b) => (b.hasDamagingMoveOfType('Rock') ? s : 0));
abilityIf(['sharpness'], (a, s, b) => (b.checkForMove(m => m.slicingMove()) ? s : 0));
abilityIf(['supremeoverlord'], (a, s, b, ai) => ai.faintedAllies(b.side));
abilityIf(['angershell'], (a, s, b) => (b.hp > b.totalhp / 2 ? s : 0));
abilityIf(['cudchew'], (a, s, b) => (b.item && b.isBerry() ? s : 0));
abilityIf(['orichalcumpulse'], (a, s, b) => (b.checkForMove(m => m.physicalMove()) && ['Sun', 'HarshSun'].includes(b.effectiveWeather()) ? s : s - 1));
abilityIf(['hadronengine'], (a, s, b, ai) => (b.checkForMove(m => m.specialMove()) && ai.terrain === 'Electric' ? s : s - 1));
abilityIf(['poisonpuppeteer'], (a, s, b) => (b.checkForMove(m => ['PoisonTarget', 'BadPoisonTarget', 'PoisonTargetLowerTargetSpeed1', 'CategoryDependsOnHigherDamagePoisonTarget', 'HitTwoTimesPoisonTarget', 'DoublePowerIfTargetPoisonedPoisonTarget', 'RemoveUserBindingAndEntryHazardsPoisonTarget', 'StarmobilePoisonTarget', 'ProtectUserBanefulBunker', 'PoisonParalyzeOrSleepTarget'].includes(m.functionCode)) ? s : 0));

/* ---------- 도구 순위 보정 (원작 ItemRanking + Gen9 팩) ---------- */
const itemIf = (ids, fn) => { for (const id of ids) add('itemRanking', id, fn); };
const species = (b, ...ids) => ids.some(id => b.isSpecies(id));
itemIf(['adamantorb', 'adamantcrystal'], (i, s, b) => (species(b, 'dialga') && b.hasDamagingMoveOfType('Dragon', 'Steel') ? s : 0));
itemIf(['lustrousorb', 'lustrousglobe'], (i, s, b) => (species(b, 'palkia') && b.hasDamagingMoveOfType('Dragon', 'Water') ? s : 0));
itemIf(['griseousorb', 'griseouscore'], (i, s, b) => (species(b, 'giratina') && b.hasDamagingMoveOfType('Dragon', 'Ghost') ? s : 0));
itemIf(['aguavberry', 'figyberry', 'iapapaberry', 'magoberry', 'wikiberry'], (i, s) => s);
itemIf(['assaultvest'], (i, s, b, ai) => (ai.trainer.highSkill() && !b.checkForMove(m => m.statusMove() && m.functionCode !== 'UseMoveTargetIsAboutToUse') ? s + 1 : s));
itemIf(['berryjuice'], (i, s, b) => Math.max(10 - Math.floor(b.totalhp / 15), 1));
itemIf(['bigroot'], (i, s, b) => (b.checkForMove(m => ['HealUserByHalfOfDamageDone', 'HealUserByHalfOfDamageDoneIfTargetAsleep', 'HealUserByThreeQuartersOfDamageDone', 'HealUserByTargetAttackLowerTargetAttack1', 'StartLeechSeedTarget'].includes(m.functionCode)) ? s : 0));
itemIf(['bindingband', 'gripclaw'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'BindTarget') ? s : 0));
itemIf(['blacksludge'], (i, s, b) => (b.hasType('Poison') ? s : -9));
itemIf(['chestoberry'], (i, s, b, ai) => (ai.trainer.highSkill() && b.hasMoveWithFunction('HealUserFullyAndFallAsleep') ? s + 1 : s));
itemIf(['choiceband', 'muscleband'], (i, s, b) => (b.checkForMove(m => m.physicalMove()) ? s : 0));
itemIf(['choicespecs', 'wiseglasses'], (i, s, b) => (b.checkForMove(m => m.specialMove()) ? s : 0));
itemIf(['deepseascale'], (i, s, b) => (species(b, 'clamperl') ? s : 0));
itemIf(['damprock'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartRainWeather') ? s : 0));
itemIf(['deepseatooth'], (i, s, b) => (species(b, 'clamperl') && b.checkForMove(m => m.specialMove()) ? s : 0));
itemIf(['electricseed'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartElectricTerrain') ? s : 0));
itemIf(['eviolite'], (i, s, b, ai) => (ai.gen.species.get(b.species).nfe ? s : 0));
itemIf(['flameorb'], (i, s, b) => (b.status ? 0 : b.wantsStatusProblem('brn') ? 7 : s));
itemIf(['fullincense', 'laggingtail'], (i, s, b, ai) => (ai.trainer.highSkill() && b.hasActiveAbility('analytic') ? 7 : s));
itemIf(['grassyseed'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartGrassyTerrain') ? s : 0));
itemIf(['heatrock'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartSunWeather') ? s : 0));
itemIf(['icyrock'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartHailWeather') ? s : 0));
itemIf(['ironball'], (i, s, b) => (b.hasMoveWithFunction('ThrowUserItemAtTarget') ? 0 : s));
itemIf(['kingsrock', 'razorfang'], (i, s, b, ai) => (ai.trainer.highSkill() && b.checkForMove(m => m.multiHitMove()) ? s + 1 : s));
itemIf(['leek', 'stick'], (i, s, b) => (species(b, 'farfetchd', 'sirfetchd') && b.checkForMove(m => m.damagingMove()) ? s : 0));
itemIf(['lightball'], (i, s, b) => (species(b, 'pikachu') && b.checkForMove(m => m.damagingMove()) ? s : 0));
itemIf(['lightclay'], (i, s, b) => (b.checkForMove(m => ['StartWeakenPhysicalDamageAgainstUserSide', 'StartWeakenSpecialDamageAgainstUserSide', 'StartWeakenDamageAgainstUserSideIfHail'].includes(m.functionCode)) ? s : 0));
itemIf(['luckypunch'], (i, s, b) => (species(b, 'chansey') ? s : 0));
itemIf(['metalpowder', 'quickpowder'], (i, s, b) => (species(b, 'ditto') && !b.transformed ? s : 0));
itemIf(['mistyseed'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartMistyTerrain') ? s : 0));
itemIf(['oranberry'], (i, s, b) => Math.max(10 - Math.floor(b.totalhp / 8), 1));
itemIf(['powerherb'], (i, s, b) => (b.checkForMove(m => /^TwoTurnAttack/.test(m.functionCode) && m.functionCode !== 'TwoTurnAttackInvulnerableInSkyTargetCannotAct') ? s : 0));
itemIf(['psychicseed'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartPsychicTerrain') ? s : 0));
itemIf(['ringtarget'], (i, s, b, ai) => (b.pbTypes().some(t => ai.gen.types.all().some(at => !ai.gen.getImmunity(at.name, [t]))) ? s : 0));
itemIf(['smoothrock'], (i, s, b) => (b.checkForMove(m => m.functionCode === 'StartSandstormWeather') ? s : 0));
itemIf(['souldew'], (i, s, b) => (!species(b, 'latias', 'latios') ? 0 : b.hasDamagingMoveOfType('Psychic', 'Dragon') ? s : 0));
itemIf(['terrainextender'], (i, s, b) => (b.checkForMove(m => ['StartElectricTerrain', 'StartGrassyTerrain', 'StartMistyTerrain', 'StartPsychicTerrain'].includes(m.functionCode)) ? s : 0));
itemIf(['thickclub'], (i, s, b) => (species(b, 'cubone', 'marowak') && b.checkForMove(m => m.physicalMove()) ? s : 0));
itemIf(['throatspray'], (i, s, b) => (b.checkForMove(m => m.soundMove()) ? s : 0));
itemIf(['toxicorb'], (i, s, b) => (b.status ? 0 : b.wantsStatusProblem('psn') ? 7 : s));
itemIf(['whiteherb'], (i, s, b, ai) => (ai.trainer.highSkill() && b.hasMoveWithFunction('LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2') ? s + 1 : s));
itemIf(['zoomlens'], (i, s, b, ai) => {
  if (!ai.trainer.highSkill()) return s;
  if (b.stage('accuracy') < 0) s += 1;
  if (b.moves.some(m => m.accuracy !== 0 && !m.isOHKO() && m.accuracy <= 70)) s += 1;
  return s;
});
itemIf(['boosterenergy'], (i, s, b) => (['protosynthesis', 'quarkdrive'].includes(b.abilityId) ? s : 0));
itemIf(['blankplate'], (i, s, b) => (b.hasDamagingMoveOfType('Normal') ? s : 0));
itemIf(['punchingglove'], (i, s, b) => (b.checkForMove(m => m.punchingMove()) ? s : 0));
itemIf(['loadeddice'], (i, s, b, ai) => (ai.trainer.highSkill() && b.checkForMove(m => m.multiHitMove()) ? 1 : 0));
itemIf(['fairyfeather'], (i, s, b) => (b.hasDamagingMoveOfType('Fairy') ? s : 0));
itemIf(['wellspringmask', 'hearthflamemask', 'cornerstonemask'], (i, s, b) => (species(b, 'ogerpon') && b.hasDamagingMoveOfType(...b.pbTypes()) ? s : 0));
const BOOSTER_TYPE = { silverpowder: 'Bug', insectplate: 'Bug', blackglasses: 'Dark', dreadplate: 'Dark', dragonfang: 'Dragon', dracoplate: 'Dragon',
  magnet: 'Electric', zapplate: 'Electric', pixieplate: 'Fairy', blackbelt: 'Fighting', fistplate: 'Fighting', charcoal: 'Fire', flameplate: 'Fire',
  sharpbeak: 'Flying', skyplate: 'Flying', spelltag: 'Ghost', spookyplate: 'Ghost', miracleseed: 'Grass', meadowplate: 'Grass', roseincense: 'Grass',
  softsand: 'Ground', earthplate: 'Ground', nevermeltice: 'Ice', icicleplate: 'Ice', silkscarf: 'Normal', poisonbarb: 'Poison', toxicplate: 'Poison',
  twistedspoon: 'Psychic', mindplate: 'Psychic', oddincense: 'Psychic', hardstone: 'Rock', stoneplate: 'Rock', rockincense: 'Rock',
  metalcoat: 'Steel', ironplate: 'Steel', mysticwater: 'Water', splashplate: 'Water', seaincense: 'Water', waveincense: 'Water' };
H.itemRankingIf.push([item => !!BOOSTER_TYPE[item], (item, s, b) => (b.hasDamagingMoveOfType(BOOSTER_TYPE[item]) ? s : 0)]);
H.itemRankingIf.push([item => GEMS.includes(item), (item, s, b) => {
  const type = item.replace(/gem$/, ''); const t = type[0].toUpperCase() + type.slice(1);
  return b.hasDamagingMoveOfType(t) ? s : 0;
}]);
export { copy };
