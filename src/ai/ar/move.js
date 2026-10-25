/**
 * 어나더레드(Essentials v21.1) Battle::Move / AIMove 이식 — 기술 하나를 AI가 읽는 창.
 *
 * 기술의 효과는 원작 함수 코드(move-codes.gen.js)로 판단하고, 수치(위력·명중·우선도·분류·플래그)는 엔진 데이터를 쓴다.
 * 데미지 추정(rough_damage)은 원작 계산식을 그대로 따르되, 원작이 엔진 특성·도구 핸들러를 부르는 자리는
 * 같은 효과를 표로 옮겨 적었다 (엔진 이벤트는 부르지 않는다).
 */
import { AR_MOVES } from './move-codes.gen.js';
import { STAT_STAGE_MAXIMUM, stageRatio, effectiveness, typeMult } from './battler.js';

const FALLBACK_TARGET = { normal: 'NearOther', any: 'Other', adjacentFoe: 'NearFoe', randomNormal: 'RandomNearFoe',
  self: 'User', allySide: 'UserSide', foeSide: 'FoeSide', all: 'BothSides', allAdjacentFoes: 'AllNearFoes',
  allAdjacent: 'AllNearOthers', adjacentAlly: 'NearAlly', adjacentAllyOrSelf: 'UserOrNearAlly', allyTeam: 'UserSide',
  allies: 'UserAndAllies', scripted: 'NearOther' };

/** 원작 GameData::Target — 고를 수 있는 대상 수와 상대를 노릴 수 있는지 */
export const TARGETS = {
  None: { num: 0, foe: false }, User: { num: 0, foe: false }, UserSide: { num: 0, foe: false },
  FoeSide: { num: 0, foe: true }, BothSides: { num: 0, foe: true },
  NearAlly: { num: 1, foe: false }, UserOrNearAlly: { num: 1, foe: false },
  NearFoe: { num: 1, foe: true }, NearOther: { num: 1, foe: true }, Other: { num: 1, foe: true },
  RandomNearFoe: { num: 1, foe: true }, Foe: { num: 1, foe: true },
  AllAllies: { num: 2, foe: false }, UserAndAllies: { num: 2, foe: false },
  AllNearFoes: { num: 2, foe: true }, AllFoes: { num: 2, foe: true },
  AllNearOthers: { num: 2, foe: true }, AllBattlers: { num: 2, foe: true },
};

const PLATE_LIKE = item => item && (item.onPlate || item.onMemory || item.onDrive);
const STAT_KEY = { Physical: 'atk', Special: 'spa' };

/** 원작 Battle::Move 의 읽기 전용 자리 — 엔진 기술 데이터 + 원작 함수 코드 */
export class MoveData {
  constructor(gen, id, slot = null) {
    this.gen = gen;
    this.data = gen.moves.get(id);
    this.id = this.data.id;
    const [code = 'None', chance = '0', target, flags = ''] = (AR_MOVES[this.id] || '').split('|');
    this.functionCode = AR_MOVES[this.id] ? code : (this.data.category === 'Status' ? 'Unimplemented' : 'None');
    this.addlEffect = Number(chance) || 0;
    this.target = target || FALLBACK_TARGET[this.data.target] || 'NearOther';
    this.arFlags = new Set(flags.split(',').filter(Boolean));
    this.totalPp = slot?.maxpp ?? Math.floor((this.data.pp || 5) * 8 / 5);
    this.pp = slot?.pp ?? this.totalPp;
    this.disabled = !!slot?.disabled;
    this.estimated = !!slot?.estimated;
    const { up, down } = statChangesOf(this.data);
    this.statUp = up;
    this.statDown = down;
  }
  get name() { return this.data.name; }
  get type() { return this.data.type; }
  get power() { return this.data.basePower || (this.data.damage ? 1 : 0); }
  /** 원작 accuracy: 반드시 맞는 기술은 0 */
  get accuracy() { return this.data.accuracy === true ? 0 : this.data.accuracy; }
  get priority() { return this.data.priority || 0; }
  get category() { return this.data.category; }
  damagingMove() { return this.data.category !== 'Status'; }
  statusMove() { return this.data.category === 'Status'; }
  /* 4세대 이후 분류는 기술마다 고정 — 원작도 thisType 인자는 무시한다 */
  physicalMove() { return this.data.category === 'Physical'; }
  specialMove() { return this.data.category === 'Special'; }
  contactMove() { return !!this.data.flags.contact; }
  pbContactMove(user) { return this.contactMove() && !user?.hasActiveItem('punchingglove') || false; }
  soundMove() { return !!this.data.flags.sound; }
  punchingMove() { return !!this.data.flags.punch; }
  bitingMove() { return !!this.data.flags.bite; }
  pulseMove() { return !!this.data.flags.pulse; }
  bombMove() { return !!this.data.flags.bullet; }
  powderMove() { return !!this.data.flags.powder; }
  danceMove() { return !!this.data.flags.dance; }
  slicingMove() { return !!this.data.flags.slicing; }
  windMove() { return !!this.data.flags.wind; }
  healingMove() { return !!this.data.flags.heal; }
  recoilMove() { return !!this.data.recoil || /^Recoil/.test(this.functionCode) || this.functionCode === 'CrashDamageIfFailsUnusableInGravity'; }
  multiHitMove() { return !!this.data.multihit || /^Hit(Two|Three|Ten)/.test(this.functionCode); }
  flinchingMove() { return /Flinch/.test(this.functionCode) || (this.data.secondaries || []).some(s => s.volatileStatus === 'flinch'); }
  thawsUser() { return this.arFlags.has('ThawsUser') || !!this.data.flags.defrost; }
  electrocuteUser() { return this.arFlags.has('ElectrocuteUser'); }
  tramplesMinimize() { return this.arFlags.has('TramplesMinimize'); }
  highCriticalRate() { return (this.data.critRatio || 1) >= 2; }
  canMagicCoat() { return !!this.data.flags.reflectable; }
  canSnatch() { return !!this.data.flags.snatch; }
  canProtectAgainst() { return !!this.data.flags.protect; }
  canMirrorMove() { return this.arFlags.has('CanMirrorMove'); }
  usableWhenAsleep() { return !!this.data.sleepUsable; }
  ignoresSubstitute(user) { return !!this.data.flags.bypasssub || this.soundMove() || !!user?.hasActiveAbility('infiltrator'); }
  ignoresReflect() { return ['RemoveScreens', 'TypeIsUserSecondTypeRemoveScreens'].includes(this.functionCode); }
  isOHKO() { return !!this.data.ohko; }
  isFixedDamage() { return /^FixedDamage|^OHKO|LowerTargetHPToUserHP|UserFaintsFixedDamageUserHP|^Counter|BideThenReturn/.test(this.functionCode) || !!this.data.damage; }
  nonLethal() { return this.functionCode === 'CannotMakeTargetFaint'; }
  damageReducedByBurn() { return this.functionCode !== 'DoublePowerIfUserPoisonedBurnedParalyzed'; }
  hitsFlyingTargets() { return ['HitsTargetInSky', 'HitsTargetInSkyGroundsTarget', 'FlinchTargetDoublePowerIfTargetInSky', 'DoublePowerIfTargetInSky', 'ParalyzeTargetAlwaysHitsInRainHitsTargetInSky', 'ConfuseTargetAlwaysHitsInRainHitsTargetInSky', 'BindTargetDoublePowerIfTargetInSky'].includes(this.functionCode); }
  hitsDiggingTargets() { return ['DoublePowerIfTargetUnderground', 'RandomPowerDoublePowerIfTargetUnderground', 'OHKOHitsUndergroundTarget'].includes(this.functionCode); }
  hitsDivingTargets() { return ['DoublePowerIfTargetUnderwater', 'BindTargetDoublePowerIfTargetUnderwater'].includes(this.functionCode); }
  worksWithNoTargets() { return /^UserFaints/.test(this.functionCode); }
  powerMove() { return false; }
  /** 원작 pbTarget — 저주는 고스트 타입이 쓰면 상대 하나를 노린다 */
  targetCode(user) {
    if (this.functionCode === 'CurseTargetOrLowerUserSpd1RaiseUserAtkDef1' && user &&
      (user.hasType('Ghost') || (this.pbCalcType(user) === 'Ghost' && user.hasActiveAbility(['libero', 'protean'])))) return 'NearFoe';
    return this.target;
  }
  pbTarget(user) { return TARGETS[this.targetCode(user)] || TARGETS.NearOther; }
  pbPriority(user) { return this.priority; }

  /** 원작 pbBaseType + pbCalcType — 특성·도구·날씨로 바뀌는 기술 타입 */
  pbBaseType(user) {
    const gen = this.gen, code = this.functionCode;
    const item = user?.itemActive?.() ? gen.items.get(user.itemId) : null;
    switch (code) {
      case 'TypeIsUserFirstType': return user?.pbTypes()[0] || this.type;
      case 'TypeDependsOnUserIVs': return user?.mon?.hpType || this.type;
      case 'TypeAndPowerDependOnUserBerry': return item?.naturalGift?.type || 'Normal';
      case 'TypeDependsOnUserPlate': case 'TypeDependsOnUserMemory': case 'TypeDependsOnUserDrive':
        return PLATE_LIKE(item) || 'Normal';
      case 'TypeDependsOnUserMorpekoFormRaiseUserSpeed1': return user?.species === 'morpekohangry' ? 'Dark' : this.type;
      case 'TypeAndPowerDependOnWeather': {
        const w = user?.effectiveWeather?.() || 'None';
        return { Sun: 'Fire', HarshSun: 'Fire', Rain: 'Water', HeavyRain: 'Water', Sandstorm: 'Rock', Hail: 'Ice' }[w] || 'Normal';
      }
      case 'TypeAndPowerDependOnTerrain': {
        const t = user?.ai?.terrain || 'None';
        return { Electric: 'Electric', Grassy: 'Grass', Misty: 'Fairy', Psychic: 'Psychic' }[t] || 'Normal';
      }
      case 'TypeIsUserSecondTypeRemoveScreens': case 'TypeIsUserSecondType': {
        const t = user?.mon?.species?.types || user?.typesRaw || [];
        return (user && /tauros|ogerpon/.test(user.species)) ? (t[1] || t[0] || this.type) : this.type;
      }
    }
    return this.type;
  }
  pbCalcType(user) {
    let ret = this.pbBaseType(user);
    if (user?.abilityActive?.()) {
      const ab = user.abilityId;
      if (ret === 'Normal' && { aerilate: 'Flying', galvanize: 'Electric', pixilate: 'Fairy', refrigerate: 'Ice' }[ab]) ret = { aerilate: 'Flying', galvanize: 'Electric', pixilate: 'Fairy', refrigerate: 'Ice' }[ab];
      else if (ab === 'normalize') ret = 'Normal';
      else if (ab === 'liquidvoice' && this.soundMove()) ret = 'Water';
    }
    if (user?.volatiles?.electrify) ret = 'Electric';
    return ret;
  }

  /** 원작 pbBaseAccuracy — 날씨로 반드시 맞거나 50%가 되는 기술 */
  pbBaseAccuracy(user, target) {
    const w = target?.effectiveWeather?.() || 'None';
    switch (this.functionCode) {
      case 'ParalyzeTargetAlwaysHitsInRainHitsTargetInSky': case 'ConfuseTargetAlwaysHitsInRainHitsTargetInSky':
        if (['Sun', 'HarshSun'].includes(w)) return 50;
        if (['Rain', 'HeavyRain'].includes(w)) return 0;
        break;
      case 'FreezeTargetAlwaysHitsInHail': if (w === 'Hail') return 0; break;
      case 'LowerTargetSpeed1AlwaysHitsInRain': case 'ParalyzeTargetAlwaysHitsInRain': case 'BurnTargetAlwaysHitsInRain':
        if (['Rain', 'HeavyRain'].includes(w)) return 0; break;
    }
    return this.accuracy;
  }
  pbCritialOverride() {
    if (['AlwaysCriticalHit', 'HitThreeTimesAlwaysCriticalHit'].includes(this.functionCode) || this.data.willCrit) return 1;
    return 0;
  }

  /** 원작 pbFixedDamage */
  pbFixedDamage(user, target) {
    switch (this.functionCode) {
      case 'FixedDamage20': return 20;
      case 'FixedDamage40': return 40;
      case 'FixedDamageHalfTargetHP': return Math.round(target.hp / 2);
      case 'FixedDamageUserLevel': return user.level;
      case 'FixedDamageUserLevelRandom': return user.level;
      case 'LowerTargetHPToUserHP': return target.hp - user.hp;
      case 'OHKO': case 'OHKOIce': case 'OHKOHitsUndergroundTarget': return target.totalhp;
      case 'UserFaintsFixedDamageUserHP': return user.hp;
    }
    if (this.data.damage === 'level') return user.level;
    if (typeof this.data.damage === 'number') return this.data.damage;
    return 1;
  }

  /** 원작 pbBaseDamage — 상황에 따라 바뀌는 위력 */
  pbBaseDamage(baseDmg, user, target) {
    const ai = user.ai;
    switch (this.functionCode) {
      case 'LowerTargetDefense1PowersUpInGravity': return ai.battle.field.pseudoWeather?.gravity ? Math.floor(baseDmg * 3 / 2) : baseDmg;
      case 'LowerTargetSpeed1WeakerInGrassyTerrain': return ai.terrain === 'Grassy' ? Math.round(baseDmg / 2) : baseDmg;
      case 'FlinchTargetDoublePowerIfTargetInSky': case 'DoublePowerIfTargetInSky':
        return target.inTwoTurnAttack('TwoTurnAttackInvulnerableInSky', 'TwoTurnAttackInvulnerableInSkyParalyzeTarget', 'TwoTurnAttackInvulnerableInSkyTargetCannotAct') ? baseDmg * 2 : baseDmg;
      case 'PowerHigherWithUserHP': return Math.max(Math.floor(150 * user.hp / user.totalhp), 1);
      case 'PowerLowerWithUserHP': {
        const n = Math.floor(48 * user.hp / user.totalhp);
        return n < 2 ? 200 : n < 5 ? 150 : n < 10 ? 100 : n < 17 ? 80 : n < 33 ? 40 : 20;
      }
      case 'PowerHigherWithTargetHP': return Math.max(Math.floor(120 * target.hp / target.totalhp), 1);
      case 'PowerHigherWithTargetHP100PowerRange': return Math.max(Math.floor(100 * target.hp / target.totalhp), 1);
      case 'PowerHigherWithUserHappiness': return 102;
      case 'PowerLowerWithUserHappiness': return 102;
      case 'PowerHigherWithUserPositiveStatStages': return 20 * (1 + Object.values(user.stages).reduce((s, v) => s + Math.max(0, v), 0));
      case 'PowerHigherWithTargetPositiveStatStages': return Math.min(20 * (3 + Object.values(target.stages).reduce((s, v) => s + Math.max(0, v), 0)), 200);
      case 'PowerHigherWithUserFasterThanTarget': {
        const n = Math.floor(user.pbSpeed() / Math.max(1, target.pbSpeed()));
        return n >= 4 ? 150 : n >= 3 ? 120 : n >= 2 ? 80 : n >= 1 ? 60 : 40;
      }
      case 'PowerHigherWithTargetFasterThanUser': return Math.max(Math.min(Math.floor(25 * target.pbSpeed() / Math.max(1, user.pbSpeed())), 150), 1);
      case 'PowerHigherWithTargetWeight': {
        const w = target.pbWeight();
        return w >= 2000 ? 120 : w >= 1000 ? 100 : w >= 500 ? 80 : w >= 250 ? 60 : w >= 100 ? 40 : 20;
      }
      case 'PowerHigherWithUserHeavierThanTarget': {
        const n = Math.floor(user.pbWeight() / Math.max(1, target.pbWeight()));
        return n >= 5 ? 120 : n >= 4 ? 100 : n >= 3 ? 80 : n >= 2 ? 60 : 40;
      }
      case 'DoublePowerIfTargetHPLessThanHalf': return target.hp <= target.totalhp / 2 ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfUserPoisonedBurnedParalyzed': return ['psn', 'brn', 'par'].includes(user.status) ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfTargetAsleepCureTarget':
        return target.asleep() && (target.effects.Substitute === 0 || this.ignoresSubstitute(user)) ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfTargetPoisoned': case 'DoublePowerIfTargetPoisonedPoisonTarget':
        return target.status === 'psn' && (target.effects.Substitute === 0 || this.ignoresSubstitute(user)) ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfTargetParalyzedCureTarget':
        return target.status === 'par' && (target.effects.Substitute === 0 || this.ignoresSubstitute(user)) ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfTargetStatusProblem': case 'DoublePowerIfTargetStatusProblemBurnTarget':
        return (target.status || target.hasActiveAbility('comatose')) && (target.effects.Substitute === 0 || this.ignoresSubstitute(user)) ? baseDmg * 2 : baseDmg;
      case 'DoublePowerInElectricTerrain': return ai.terrain === 'Electric' && target.affectedByTerrain() ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfUserLastMoveFailed': return user.mon?.moveLastTurnResult === false ? baseDmg * 2 : baseDmg;
      case 'DoublePowerIfAllyFaintedLastTurn': return user.mon?.side?.faintedLastTurn ? baseDmg * 2 : baseDmg;
      case 'TypeAndPowerDependOnUserBerry': {
        const it = user.itemActive() ? ai.gen.items.get(user.itemId) : null;
        return it?.naturalGift ? Math.max(it.naturalGift.basePower, 10) : 1;
      }
      case 'TypeAndPowerDependOnWeather': return user.effectiveWeather() !== 'None' ? baseDmg * 2 : baseDmg;
      case 'TypeAndPowerDependOnTerrain': return ai.terrain !== 'None' && user.affectedByTerrain() ? baseDmg * 2 : baseDmg;
      case 'MultiTurnAttackPowersUpEachTurn': return baseDmg;
      case 'UserFaintsPowersUpInMistyTerrainExplosive': return ai.terrain === 'Misty' ? Math.floor(baseDmg * 3 / 2) : baseDmg;
      case 'RemoveTargetItem': return target.item && !target.unlosableItem(target.item) ? Math.round(baseDmg * 1.5) : baseDmg;
      case 'ThrowUserItemAtTarget': {
        if (!user.item) return 0;
        return Math.max(ai.gen.items.get(user.item).fling?.basePower || 10, 10);
      }
      case 'HitsAllFoesAndPowersUpInPsychicTerrain': return ai.terrain === 'Psychic' && user.affectedByTerrain() ? Math.floor(baseDmg * 3 / 2) : baseDmg;
      case 'PowerDependsOnUserStockpile': return 100 * user.effects.Stockpile;
      case 'UsedAfterAllyRoundWithDoublePower': return baseDmg;
      case 'IncreasePowerEachFaintedAlly': { const n = ai.faintedAllies(user.side); return n > 0 ? baseDmg + 50 * n : baseDmg; }
      case 'IncreasePowerEachTimeHit': return Math.min(baseDmg + 50 * (user.mon?.timesAttacked || 0), 350);
      case 'IncreasePowerSuperEffective': return target.effectivenessOfTypeAgainstBattler(this.pbCalcType(user), user, this) > 1 ? baseDmg * 4 / 3 : baseDmg;
      case 'RandomlyDealsDoubleDamage': return baseDmg;
      case 'PledgeMove': return baseDmg;
    }
    return baseDmg;
  }
  /** 원작 pbModifyDamage — 숨은 상대에게 두 배 등 */
  pbModifyDamage(mult, user, target) {
    const ai = user.ai;
    switch (this.functionCode) {
      case 'RandomPowerDoublePowerIfTargetUnderground': case 'DoublePowerIfTargetUnderground':
        if (target.inTwoTurnAttack('TwoTurnAttackInvulnerableUnderground')) mult *= 2;
        if (ai.terrain === 'Grassy') mult /= 2;
        return mult;
      case 'DoublePowerIfTargetUnderwater': case 'BindTargetDoublePowerIfTargetUnderwater':
        return target.inTwoTurnAttack('TwoTurnAttackInvulnerableUnderwater') ? mult * 2 : mult;
    }
    return mult;
  }
}

/** 엔진 기술 데이터 → 원작 statUp/statDown 배열 [stat, n, stat, n …] */
function statChangesOf(data) {
  const up = [], down = [];
  const push = boosts => { for (const [k, v] of Object.entries(boosts || {})) (v > 0 ? up : down).push(k, Math.abs(v)); };
  if (data.id === 'curse') { up.push('atk', 1, 'def', 1); down.push('spe', 1); return { up, down }; }
  if (data.boosts) push(data.boosts);
  if (data.self?.boosts) push(data.self.boosts);
  for (const s of data.secondaries || []) { if (s.self?.boosts) push(s.self.boosts); if (s.boosts) push(s.boosts); }
  return { up, down };
}

/* ---------------- 데미지 계산에 들어가는 특성·도구 (원작 AbilityEffects/ItemEffects DamageCalc 핸들러의 표) ---------------- */

const TYPE_BOOST_ITEMS = {
  Bug: ['silverpowder', 'insectplate'], Dark: ['blackglasses', 'dreadplate'], Dragon: ['dragonfang', 'dracoplate'],
  Electric: ['magnet', 'zapplate'], Fairy: ['pixieplate', 'fairyfeather'], Fighting: ['blackbelt', 'fistplate'],
  Fire: ['charcoal', 'flameplate'], Flying: ['sharpbeak', 'skyplate'], Ghost: ['spelltag', 'spookyplate'],
  Grass: ['miracleseed', 'meadowplate', 'roseincense'], Ground: ['softsand', 'earthplate'], Ice: ['nevermeltice', 'icicleplate'],
  Normal: ['silkscarf', 'blankplate'], Poison: ['poisonbarb', 'toxicplate'], Psychic: ['twistedspoon', 'mindplate', 'oddincense'],
  Rock: ['hardstone', 'stoneplate', 'rockincense'], Steel: ['metalcoat', 'ironplate'], Water: ['mysticwater', 'splashplate', 'seaincense', 'waveincense'],
};
const ORBS = { adamantorb: ['dialga', ['Dragon', 'Steel']], adamantcrystal: ['dialga', ['Dragon', 'Steel']],
  lustrousorb: ['palkia', ['Dragon', 'Water']], lustrousglobe: ['palkia', ['Dragon', 'Water']],
  griseousorb: ['giratina', ['Dragon', 'Ghost']], griseouscore: ['giratina', ['Dragon', 'Ghost']] };

function userAbilityMods(m, user, target, move, baseDmg, type, ai) {
  const ab = user.abilityId, phys = move.physicalMove(), spec = move.specialMove();
  const lowHp = user.hp <= user.totalhp / 3;
  const weather = user.effectiveWeather();
  switch (ab) {
    case 'blaze': if (lowHp && type === 'Fire') m.attack *= 1.5; break;
    case 'overgrow': if (lowHp && type === 'Grass') m.attack *= 1.5; break;
    case 'torrent': if (lowHp && type === 'Water') m.attack *= 1.5; break;
    case 'swarm': if (lowHp && type === 'Bug') m.attack *= 1.5; break;
    case 'defeatist': if (user.hp <= user.totalhp / 2) m.attack /= 2; break;
    case 'dragonsmaw': if (type === 'Dragon') m.attack *= 1.5; break;
    case 'transistor': if (type === 'Electric') m.attack *= 1.3; break;
    case 'rockypayload': if (type === 'Rock') m.attack *= 1.5; break;
    case 'steelworker': if (type === 'Steel') m.attack *= 1.5; break;
    case 'steelyspirit': if (type === 'Steel') m.power *= 1.5; break;
    case 'flareboost': if (user.status === 'brn' && spec) m.power *= 1.5; break;
    case 'toxicboost': if (user.status === 'psn' && phys) m.power *= 1.5; break;
    case 'flashfire': if (user.volatiles?.flashfire && type === 'Fire') m.attack *= 1.5; break;
    case 'flowergift': if (['Sun', 'HarshSun'].includes(weather) && phys) m.attack *= 1.5; break;
    case 'gorillatactics': if (phys) m.attack *= 1.5; break;
    case 'guts': if (user.status && phys) m.attack *= 1.5; break;
    case 'hugepower': case 'purepower': if (phys) m.attack *= 2; break;
    case 'hustle': if (phys) m.attack *= 1.5; break;
    case 'ironfist': if (move.punchingMove()) m.power *= 1.2; break;
    case 'megalauncher': if (move.pulseMove()) m.power *= 1.5; break;
    case 'strongjaw': if (move.bitingMove()) m.power *= 1.5; break;
    case 'sharpness': if (move.slicingMove()) m.power *= 1.5; break;
    case 'toughclaws': if (move.contactMove()) m.power *= 4 / 3; break;
    case 'punkrock': if (move.soundMove()) m.attack *= 1.3; break;
    case 'reckless': if (move.recoilMove()) m.power *= 1.2; break;
    case 'rivalry':
      if (user.gender && target.gender && user.gender !== 'N' && target.gender !== 'N') m.power *= user.gender === target.gender ? 1.25 : 0.75;
      break;
    case 'sandforce': if (weather === 'Sandstorm' && ['Rock', 'Ground', 'Steel'].includes(type)) m.power *= 1.3; break;
    case 'sheerforce': if (move.addlEffect > 0) m.power *= 1.3; break;
    case 'slowstart': if (user.volatiles?.slowstart && phys) m.attack /= 2; break;
    case 'solarpower': if (['Sun', 'HarshSun'].includes(weather) && spec) m.attack *= 1.5; break;
    case 'technician': if (baseDmg <= 60) m.power *= 1.5; break;
    case 'waterbubble': if (type === 'Water') m.attack *= 2; break;
    case 'supremeoverlord': { const n = Math.min(5, ai.faintedAllies(user.side)); if (n > 0) m.power *= 1 + 0.1 * n; break; }
    case 'orichalcumpulse': if (['Sun', 'HarshSun'].includes(weather) && phys) m.attack *= 4 / 3; break;
    case 'hadronengine': if (ai.terrain === 'Electric' && spec) m.attack *= 4 / 3; break;
    case 'protosynthesis': case 'quarkdrive': {
      const best = user.volatiles?.[ab]?.bestStat;
      if ((best === 'atk' && phys) || (best === 'spa' && spec)) m.attack *= 1.3;
      break;
    }
  }
}
function targetAbilityMods(m, user, target, move, type, mold) {
  const ab = target.abilityId, phys = move.physicalMove(), spec = move.specialMove();
  const se = target.effectivenessOfTypeAgainstBattler(type, user, move) > 1;
  if (!mold) {
    switch (ab) {
      case 'dryskin': if (type === 'Fire') m.power *= 1.25; break;
      case 'filter': case 'solidrock': if (se) m.final *= 0.75; break;
      case 'flowergift': if (['Sun', 'HarshSun'].includes(target.effectiveWeather()) && spec) m.defense *= 1.5; break;
      case 'fluffy': if (move.contactMove() && !user.hasActiveItem('punchingglove')) m.final /= 2; if (type === 'Fire') m.final *= 2; break;
      case 'furcoat': if (phys) m.defense *= 2; break;
      case 'grasspelt': if (target.ai.terrain === 'Grassy' && phys) m.defense *= 1.5; break;
      case 'heatproof': if (type === 'Fire') m.power /= 2; break;
      case 'icescales': if (spec) m.final /= 2; break;
      case 'marvelscale': if (target.status && phys) m.defense *= 1.5; break;
      case 'multiscale': if (target.hp === target.totalhp) m.final /= 2; break;
      case 'punkrock': if (move.soundMove()) m.final /= 2; break;
      case 'thickfat': if (type === 'Fire' || type === 'Ice') m.power /= 2; break;
      case 'waterbubble': if (type === 'Fire') m.final /= 2; break;
      case 'purifyingsalt': if (type === 'Ghost') m.attack /= 2; break;
      case 'protosynthesis': case 'quarkdrive': {
        const best = target.volatiles?.[ab]?.bestStat;
        if ((best === 'def' && phys) || (best === 'spd' && spec)) m.defense *= 1.3;
        break;
      }
    }
  }
  /* 무시되지 않는 특성 */
  if (ab === 'prismarmor' && se) m.final *= 0.75;
  if (ab === 'shadowshield' && target.hp === target.totalhp) m.final /= 2;
}
function userItemMods(m, user, target, move, baseDmg, type) {
  const it = user.itemId, phys = move.physicalMove(), spec = move.specialMove();
  if (TYPE_BOOST_ITEMS[type]?.includes(it)) { m.power *= 1.2; return; }
  if (it === `${type.toLowerCase()}gem`) { m.power *= 1.3; return; }
  if (ORBS[it]) { const [sp, types] = ORBS[it]; if (user.isSpecies(sp) && types.includes(type)) m.power *= 1.2; return; }
  switch (it) {
    case 'choiceband': if (phys) m.attack *= 1.5; break;
    case 'choicespecs': if (spec) m.attack *= 1.5; break;
    case 'muscleband': if (phys) m.power *= 1.1; break;
    case 'wiseglasses': if (spec) m.power *= 1.1; break;
    case 'punchingglove': if (move.punchingMove()) m.power *= 1.1; break;
    case 'lightball': if (user.isSpecies('pikachu')) m.attack *= 2; break;
    case 'thickclub': if ((user.isSpecies('cubone') || user.isSpecies('marowak')) && phys) m.attack *= 2; break;
    case 'deepseatooth': if (user.isSpecies('clamperl') && spec) m.attack *= 2; break;
    case 'souldew': if ((user.isSpecies('latios') || user.isSpecies('latias')) && ['Psychic', 'Dragon'].includes(type)) m.power *= 1.2; break;
  }
}
function targetItemMods(m, user, target, move) {
  const it = target.itemId, phys = move.physicalMove(), spec = move.specialMove();
  switch (it) {
    case 'assaultvest': if (spec) m.defense *= 1.5; break;
    case 'eviolite': if (target.ai.gen.species.get(target.species).nfe) m.defense *= 1.5; break;
    case 'deepseascale': if (target.isSpecies('clamperl') && spec) m.defense *= 2; break;
    case 'metalpowder': if (target.isSpecies('ditto') && !target.transformed && phys) m.defense *= 2; break;
  }
}

/** 원작 Battle::Move::CRITICAL_HIT_RATIOS (7세대 이후) */
const CRITICAL_HIT_RATIOS = [24, 8, 2, 1];

/**
 * 원작 AIMove — 지금 평가 중인 기술. 사용자·대상은 ai.user / ai.target 이다.
 * MoveData의 성질은 그대로 꺼내 쓸 수 있게 위임한다.
 */
export class AIMove {
  constructor(ai, data) {
    this.ai = ai;
    this.move = data;
    return new Proxy(this, { get(t, key) { if (key in t) return t[key]; const v = t.move[key]; return typeof v === 'function' ? v.bind(t.move) : v; } });
  }
  get functionCode() { return this.move.functionCode; }
  get id() { return this.move.id; }
  get name() { return this.move.name; }
  get type() { return this.move.type; }

  roughType() { return this.ai.trainer.mediumSkill() ? this.move.pbCalcType(this.ai.user) : this.move.type; }
  /** 원작 rough_priority — 짓궂은마음·질풍날개·힐링시프트 포함 */
  roughPriority(user) {
    let ret = this.move.priority;
    if (user.abilityActive()) {
      const ab = user.abilityId;
      if (ab === 'prankster' && this.move.statusMove()) ret += 1;
      if (ab === 'galewings' && user.hp === user.totalhp && this.move.pbCalcType(user) === 'Flying') ret += 1;
      if (ab === 'triage' && this.move.healingMove()) ret += 3;
    }
    if (this.move.functionCode === 'HigherPriorityInGrassyTerrain' && this.ai.terrain === 'Grassy' && user.affectedByTerrain()) ret += 1;
    return ret;
  }
  targetsMultipleBattlers() { return false; }

  basePower() {
    let ret = this.move.power;
    if (ret === 1) ret = 60;
    if (!this.ai.trainer.mediumSkill()) return ret;
    return this.ai.handlers.getBasePower(this.functionCode, ret, this, this.ai.user, this.ai.target, this.ai, this.ai.battle);
  }

  /** 원작 rough_critical_hit_stage */
  roughCriticalHitStage() {
    const user = this.ai.user, target = this.ai.target;
    if (target.ownSide().LuckyChant > 0) return -1;
    let crit = 0;
    if (user.abilityActive()) {
      if (user.abilityId === 'superluck') crit += 1;
      if (user.abilityId === 'merciless' && target.status === 'psn') crit = 99;
    }
    if (!this.ai.battle.moldBreaker && target.hasActiveAbility(['battlearmor', 'shellarmor'])) return -1;
    if (user.itemActive()) {
      if (['scopelens', 'razorclaw'].includes(user.itemId)) crit += 1;
      if (['leek', 'stick'].includes(user.itemId) && (user.isSpecies('farfetchd') || user.isSpecies('sirfetchd'))) crit += 2;
      if (user.itemId === 'luckypunch' && user.isSpecies('chansey')) crit += 2;
    }
    if (this.move.pbCritialOverride(user, target) === 1) return 99;
    if (crit > 50) return 99;
    if (user.effects.LaserFocus > 0) return 99;
    if (this.move.highCriticalRate()) crit += (this.move.data.critRatio || 2) - 1;
    crit += user.effects.FocusEnergy;
    return Math.min(crit, CRITICAL_HIT_RATIOS.length - 1);
  }

  /** 원작 rough_damage (+ Gen9 팩: 재앙 특성·하이드로스팀·설경 방어·글레이브러시) */
  roughDamage() {
    let baseDmg = this.basePower();
    if (this.move.isFixedDamage()) return baseDmg;
    const ai = this.ai, user = ai.user, target = ai.target, move = this.move;
    const calcType = this.roughType();
    const critStage = this.roughCriticalHitStage();
    const isCritical = critStage >= CRITICAL_HIT_RATIOS.length || (critStage >= 0 && CRITICAL_HIT_RATIOS[critStage] <= 2);
    const mold = ai.battle.moldBreaker;
    /* 공격 쪽 능력치 */
    let phys = move.physicalMove();
    if (['CategoryDependsOnHigherDamagePoisonTarget', 'CategoryDependsOnHigherDamageIgnoreTargetAbility'].includes(this.functionCode))
      phys = user.roughStat('atk') > user.roughStat('spa');
    const view = { physicalMove: () => phys, specialMove: () => !phys };
    let atkStat = phys ? 'atk' : 'spa', atkSrc = user;
    if (this.functionCode === 'UseUserDefenseInsteadOfUserAttack') atkStat = 'def';
    if (this.functionCode === 'UseTargetAttackInsteadOfUserAttack') atkSrc = target;
    let atk = atkSrc.baseStat(atkStat), atkStage = atkSrc.stage(atkStat);
    if (!target.hasActiveAbility('unaware') || mold) {
      if (isCritical && atkStage < 0) atkStage = 0;
      atk = Math.floor(atk * stageRatio(atkStat, atkStage));
    }
    let defStat = phys ? 'def' : 'spd';
    if (this.functionCode === 'UseTargetDefenseInsteadOfTargetSpDef') defStat = 'def';
    if (ai.battle.field.pseudoWeather?.wonderroom) defStat = defStat === 'def' ? 'spd' : 'def';
    let defense = target.baseStat(defStat), defStage = this.functionCode === 'IgnoreTargetDefSpDefEvaStatStages' ? 0 : target.stage(defStat);
    if (!user.hasActiveAbility('unaware') || mold) {
      if (isCritical && defStage > 0) defStage = 0;
      defense = Math.floor(defense * stageRatio(defStat, defStage));
    }
    const m = { power: 1, attack: 1, defense: 1, final: 1 };
    const medium = ai.trainer.mediumSkill(), high = ai.trainer.highSkill();
    /* 전역 특성 */
    if (medium && ((ai.globalAbility('darkaura') && calcType === 'Dark') || (ai.globalAbility('fairyaura') && calcType === 'Fairy')))
      m.power *= ai.globalAbility('aurabreak') ? 3 / 4 : 4 / 3;
    if (medium) {
      ['tabletsofruin', 'swordofruin', 'vesselofruin', 'beadsofruin'].forEach((ab, i) => {
        if (!ai.globalAbility(ab)) return;
        const cat = i < 2 ? phys : !phys;
        if (i % 2 === 0 && !user.hasActiveAbility(ab)) { if (cat) m.attack *= 0.75; }
        else if (i % 2 === 1 && !target.hasActiveAbility(ab)) { if (cat) m.defense *= 0.75; }
      });
    }
    /* 특성 */
    if (user.abilityActive()) {
      switch (user.abilityId) {
        case 'aerilate': case 'galvanize': case 'pixilate': case 'refrigerate': if (move.type === 'Normal') m.power *= 1.2; break;
        case 'analytic':
          if (this.roughPriority(user) <= 0) { let faster = false; for (const b of ai.eachBattler()) if (b.index !== user.index && user.fasterThan(b)) { faster = true; break; } if (!faster) m.power *= 1.3; }
          break;
        case 'neuroforce': if (target.effectivenessOfTypeAgainstBattler(calcType, user, move) > 1) m.final *= 1.25; break;
        case 'normalize': m.power *= 1.2; break;
        case 'sniper': if (isCritical) m.final *= 1.5; break;
        case 'tintedlens': { const e = target.effectivenessOfTypeAgainstBattler(calcType, user, move); if (e > 0 && e < 1) m.final *= 2; break; }
        default: userAbilityMods(m, user, target, Object.assign(Object.create(move), view), baseDmg, calcType, ai);
      }
    }
    if (target.abilityActive()) targetAbilityMods(m, user, target, Object.assign(Object.create(move), view), calcType, mold);
    /* 도구 */
    if (user.itemActive()) {
      if (user.itemId === 'expertbelt') { if (target.effectivenessOfTypeAgainstBattler(calcType, user, move) > 1) m.final *= 1.2; }
      else if (user.itemId === 'lifeorb') m.final *= 1.3;
      else userItemMods(m, user, target, Object.assign(Object.create(move), view), baseDmg, calcType);
    }
    if (target.itemActive() && target.item && !target.isBerry()) targetItemMods(m, user, target, Object.assign(Object.create(move), view));
    if (user.hasActiveAbility('parentalbond')) m.power *= 1.25;
    if (medium && user.effects.Charge > 0 && calcType === 'Electric') m.power *= 2;
    if (medium) {
      const pw = ai.battle.field.pseudoWeather || {};
      if (calcType === 'Electric' && pw.mudsport) m.power /= 3;
      if (calcType === 'Fire' && pw.watersport) m.power /= 3;
      const t = ai.terrain;
      if (t === 'Electric' && calcType === 'Electric' && user.affectedByTerrain()) m.power *= 1.3;
      if (t === 'Electric' && this.functionCode === 'IncreasePowerInElectricTerrain' && user.affectedByTerrain()) m.power *= 1.5;
      if (t === 'Grassy' && calcType === 'Grass' && user.affectedByTerrain()) m.power *= 1.3;
      if (t === 'Psychic' && calcType === 'Psychic' && user.affectedByTerrain()) m.power *= 1.3;
      if (t === 'Misty' && calcType === 'Dragon' && target.affectedByTerrain()) m.power /= 2;
    }
    /* 날씨 */
    if (medium) {
      switch (user.effectiveWeather()) {
        case 'Sun': case 'HarshSun':
          if (calcType === 'Fire') m.final *= 1.5;
          else if (calcType === 'Water') m.final *= this.functionCode === 'IncreasePowerInSunWeather' ? 1.5 : 0.5;
          break;
        case 'Rain': case 'HeavyRain':
          if (calcType === 'Fire') m.final /= 2; else if (calcType === 'Water') m.final *= 1.5;
          break;
        case 'Sandstorm':
          if (target.hasType('Rock') && !phys && this.functionCode !== 'UseTargetDefenseInsteadOfTargetSpDef') m.defense *= 1.5;
          break;
        case 'Hail':
          if (target.hasType('Ice') && (phys || this.functionCode === 'UseTargetDefenseInsteadOfTargetSpDef')) m.defense *= 1.5;
          break;
      }
    }
    if (isCritical) m.final *= 1.5;
    if (calcType && user.hasType(calcType)) m.final *= user.hasActiveAbility('adaptability') ? 2 : 1.5;
    m.final *= target.effectivenessOfTypeAgainstBattler(calcType, user, move);
    if (high && user.status === 'brn' && phys && move.damageReducedByBurn() && !user.hasActiveAbility('guts')) m.final /= 2;
    /* 벽 */
    if (medium && !move.ignoresReflect() && !isCritical && !user.hasActiveAbility('infiltrator')) {
      const side = target.ownSide();
      if (side.AuroraVeil > 0) m.final /= 2;
      else if (side.Reflect > 0 && phys) m.final /= 2;
      else if (side.LightScreen > 0 && !phys) m.final /= 2;
    }
    if (medium && target.effects.Minimize && move.tramplesMinimize()) m.final *= 2;
    if (high && target.effects.GlaiveRush > 0) m.final *= 2;
    m.final = move.pbModifyDamage(m.final, user, target);
    baseDmg = Math.max(Math.round(baseDmg * m.power), 1);
    atk = Math.max(Math.round(atk * m.attack), 1);
    defense = Math.max(Math.round(defense * m.defense), 1);
    let damage = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * baseDmg * atk / defense) / 50) + 2;
    damage = Math.max(Math.round(damage * m.final), 1);
    let ret = Math.floor(damage);
    if (move.nonLethal() && ret >= target.hp) ret = target.hp - 1;
    return ret;
  }

  accuracy() {
    return this.ai.trainer.mediumSkill() ? this.move.pbBaseAccuracy(this.ai.user, this.ai.target) : this.move.accuracy;
  }

  /** 원작 rough_accuracy (+ 글레이브러시) */
  roughAccuracy() {
    const ai = this.ai, user = ai.user, target = ai.target, move = this.move;
    if (ai.trainer.mediumSkill() && target.effects.GlaiveRush > 0) return 100;
    if (move.isOHKO()) {
      let ret = this.accuracy() + user.level - target.level;
      if (this.functionCode === 'OHKOIce' && !user.hasType('Ice')) ret -= 10;
      return Math.max(ret, 0);
    }
    if (ai.trainer.mediumSkill()) {
      if (target.effects.Telekinesis > 0) return 100;
      if (target.effects.Minimize && move.tramplesMinimize()) return 100;
    }
    const baseAcc = this.accuracy();
    if (baseAcc === 0) return 100;
    const mods = { base: baseAcc, accStage: user.stage('accuracy'), evaStage: target.stage('evasion'), accMult: 1, evaMult: 1 };
    this.applyRoughAccuracyModifiers(user, target, this.roughType(), mods);
    if (mods.base < 0) return 0;
    if (mods.base === 0) return 100;
    const acc = Math.round(100 * stageRatio('accuracy', mods.accStage) * mods.accMult);
    const eva = Math.max(1, Math.round(100 * stageRatio('evasion', mods.evaStage) * mods.evaMult));
    return mods.base * acc / eva;
  }
  applyRoughAccuracyModifiers(user, target, type, mods) {
    const ai = this.ai, move = this.move, mold = ai.battle.moldBreaker;
    if (user.abilityActive()) {
      switch (user.abilityId) {
        case 'compoundeyes': mods.accMult *= 1.3; break;
        case 'hustle': if (move.physicalMove()) mods.accMult *= 0.8; break;
        case 'victorystar': mods.accMult *= 1.1; break;
        case 'noguard': mods.base = 0; break;
        case 'keeneye': case 'mindseye': if (mods.evaStage > 0) mods.evaStage = 0; break;
        case 'unaware': mods.evaStage = 0; break;
      }
    }
    if (target.abilityActive()) {
      if (target.abilityId === 'noguard') mods.base = 0;
      if (!mold) {
        switch (target.abilityId) {
          case 'unaware': mods.accStage = 0; break;
          case 'sandveil': if (target.effectiveWeather() === 'Sandstorm') mods.evaMult *= 1.25; break;
          case 'snowcloak': if (target.effectiveWeather() === 'Hail') mods.evaMult *= 1.25; break;
          case 'tangledfeet': if (target.effects.Confusion > 0) mods.evaMult *= 1.2; break;
          case 'wonderskin': if (move.statusMove() && mods.base > 50) mods.base = 50; break;
        }
      }
    }
    if (user.itemActive()) {
      if (user.itemId === 'zoomlens') { if (this.roughPriority(user) <= 0 && target.fasterThan(user)) mods.accMult *= 1.2; }
      else if (user.itemId === 'widelens') mods.accMult *= 1.1;
    }
    if (target.itemActive() && ['brightpowder', 'laxincense'].includes(target.itemId)) mods.evaMult *= 1.1;
    if (ai.battle.field.pseudoWeather?.gravity) mods.accMult *= 5 / 3;
    if (ai.trainer.mediumSkill()) {
      if (user.effects.MicleBerry) mods.accMult *= 1.2;
      if ((target.effects.Foresight || target.effects.MiracleEye) && mods.evaStage > 0) mods.evaStage = 0;
    }
    if (this.functionCode === 'IgnoreTargetDefSpDefEvaStatStages') mods.evaStage = 0;
    if (ai.trainer.mediumSkill() && user.effects.LockOn > 0 && user.effects.LockOnPos === target.index) mods.base = 0;
    if (ai.trainer.mediumSkill() && this.functionCode === 'BadPoisonTarget' && move.statusMove() && user.hasType('Poison')) mods.base = 0;
  }

  /**
   * 원작 get_score_change_for_additional_effect
   *   0: 보통 / -999: 부가효과가 지워진다 (우격다짐·인분) / 그 밖: 더할 점수
   */
  getScoreChangeForAdditionalEffect(user, target = null) {
    if (this.move.addlEffect === 0) return 0;
    if (user.hasActiveAbility('sheerforce')) return -999;
    if (target && user.index !== target.index && target.hasActiveAbility('shielddust') && !this.ai.battle.moldBreaker) return -999;
    if (target && user.index !== target.index && target.hasActiveItem('covertcloak')) return -999;
    if (this.move.addlEffect < 100 && user.hasActiveAbility('serenegrace')) return 5;
    return 0;
  }
}

export { effectiveness, typeMult, STAT_STAGE_MAXIMUM, STAT_KEY };
