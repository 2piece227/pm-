/**
 * 어나더레드(Essentials v21.1) AIBattler 이식 — 판단에 쓰는 포켓몬 한 마리의 창.
 *
 * 우리 쪽은 실제 엔진 포켓몬을 읽고(자기 파티는 다 안다), 상대 쪽은 공개 기록(OpponentModel)만 읽는다.
 * 원작 AI는 상대의 실제 기술·특성·스피드를 들여다보지만, 이 게임은 공개 정보만 쓴다:
 *   기술 = 이번 배틀에서 본 기술 + 종족·레벨로 추정한 공격기, 특성·도구 = 드러난 것(특성이 하나뿐인 종은 안다),
 *   능력치 = 종족값 추정(개체값 31·노력치 0·무보정). 엔진 이벤트는 절대 부르지 않는다.
 */
import { MoveData } from './move.js';

export const STAT_STAGE_MAXIMUM = 6;
export const STAGE_MUL = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
export const STAGE_DIV = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
export const ACC_MUL = [3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9];
export const ACC_DIV = [9, 8, 7, 6, 5, 4, 3, 3, 3, 3, 3, 3, 3];
export const stageRatio = (stat, stage) => {
  const i = Math.max(-6, Math.min(6, stage)) + 6;
  return ['accuracy', 'evasion'].includes(stat) ? ACC_MUL[i] / ACC_DIV[i] : STAGE_MUL[i] / STAGE_DIV[i];
};

const WEATHER = { sunnyday: 'Sun', desolateland: 'HarshSun', raindance: 'Rain', primordialsea: 'HeavyRain',
  sandstorm: 'Sandstorm', snow: 'Hail', hail: 'Hail', deltastream: 'StrongWinds' };
const TERRAIN = { electricterrain: 'Electric', grassyterrain: 'Grassy', mistyterrain: 'Misty', psychicterrain: 'Psychic' };
export const weatherOf = field => WEATHER[field.weather] || 'None';
export const terrainOf = field => TERRAIN[field.terrain] || 'None';

/** 이동 불가·반동 등 두 턴짜리 공격 중 공중/땅속/물속에 있는 상태 */
const SEMI_INVULNERABLE = { fly: 'TwoTurnAttackInvulnerableInSky', bounce: 'TwoTurnAttackInvulnerableInSkyParalyzeTarget',
  skydrop: 'TwoTurnAttackInvulnerableInSkyTargetCannotAct', dig: 'TwoTurnAttackInvulnerableUnderground',
  dive: 'TwoTurnAttackInvulnerableUnderwater', phantomforce: 'TwoTurnAttackInvulnerableRemoveProtections',
  shadowforce: 'TwoTurnAttackInvulnerableRemoveProtections' };

const dur = (v, fallback = 2) => (v ? (v.duration ?? v.time ?? fallback) : 0);
const flag = v => !!v;

/**
 * 원작 PBEffects 이름 → 엔진 volatile 읽기. 상대는 공개된 -start 메시지만 있으므로 남은 턴은 모르면 2로 본다.
 * 없는 이름을 읽으면 이식 누락이라 바로 알 수 있게 예외를 던진다.
 */
const EFFECTS = {
  Substitute: (v, b) => (v.substitute ? (v.substitute.hp ?? Math.max(1, Math.floor(b.totalhp / 4))) : 0),
  LeechSeed: (v, b) => (v.leechseed ? 1 - b.index : -1),
  Confusion: v => dur(v.confusion),
  Taunt: v => dur(v.taunt),
  Encore: v => dur(v.encore),
  Disable: v => dur(v.disable),
  Torment: v => flag(v.torment),
  Attract: (v, b) => (v.attract ? 1 - b.index : -1),
  Yawn: v => dur(v.yawn),
  PerishSong: v => (v.perishsong ? (v.perishsong.duration ?? 3) : v.perish1 ? 1 : v.perish2 ? 2 : v.perish3 ? 3 : 0),
  Curse: v => flag(v.curse),
  Nightmare: v => flag(v.nightmare),
  Ingrain: v => flag(v.ingrain),
  AquaRing: v => flag(v.aquaring),
  Trapping: v => dur(v.partiallytrapped, 3),
  TrappingUser: (v, b) => (v.partiallytrapped ? 1 - b.index : -1),
  MeanLook: (v, b) => (v.trapped ? 1 - b.index : -1),
  JawLock: (v, b) => (v.jawlock ? 1 - b.index : -1),
  Octolock: (v, b) => (v.octolock ? 1 - b.index : -1),
  HealBlock: v => dur(v.healblock),
  Embargo: v => dur(v.embargo),
  FocusEnergy: v => (v.focusenergy ? 2 : v.dragoncheer ? 1 : 0),
  LaserFocus: v => dur(v.laserfocus, 1),
  Charge: v => dur(v.charge, 1),
  Minimize: v => flag(v.minimize),
  Foresight: v => flag(v.foresight),
  MiracleEye: v => flag(v.miracleeye),
  MagnetRise: v => dur(v.magnetrise, 5),
  Telekinesis: v => dur(v.telekinesis, 3),
  SmackDown: v => flag(v.smackdown),
  Roost: v => flag(v.roost),
  ProtectRate: v => (v.stall ? (v.stall.counter ?? 3) : 1),
  DestinyBond: v => flag(v.destinybond),
  DestinyBondPrevious: () => false,
  Grudge: v => flag(v.grudge),
  Rage: v => flag(v.rage),
  Bide: v => dur(v.bide),
  HyperBeam: v => (v.mustrecharge ? 1 : 0),
  Truant: v => flag(v.truant),
  Flinch: v => flag(v.flinch),
  Transform: (v, b) => b.transformed,
  Illusion: () => false,
  SkyDrop: () => -1,
  Stockpile: v => v.stockpile?.layers ?? (v.stockpile1 ? 1 : v.stockpile2 ? 2 : v.stockpile3 ? 3 : 0),
  ThroatChop: v => dur(v.throatchop),
  GlaiveRush: v => (v.glaiverush ? 1 : 0),
  SaltCure: v => flag(v.saltcure),
  TarShot: v => flag(v.tarshot),
  Imprison: v => flag(v.imprison),
  Powder: v => flag(v.powder),
  Electrify: v => flag(v.electrify),
  NoRetreat: v => flag(v.noretreat),
  Snatch: v => flag(v.snatch),
  MagicCoat: v => flag(v.magiccoat),
  LockOn: v => (v.lockon ? 2 : 0),
  LockOnPos: (v, b) => (v.lockon ? 1 - b.index : -1),
  MicleBerry: v => flag(v.micleberry),
  ChoiceBand: v => v.choicelock?.move || null,
  Outrage: v => (v.lockedmove ? 2 : 0),
  Uproar: v => dur(v.uproar),
  GastroAcid: v => flag(v.gastroacid),
  Endure: v => flag(v.endure),
  ExtraType: (v, b) => b.addedType || null,
  Type3: (v, b) => b.addedType || null,
  BurnUp: () => false,
  DoubleShock: () => false,
  FollowMe: () => 0,
  RagePowder: () => false,
  Spotlight: () => 0,
  Instruct: () => false,
  Quash: () => 0,
  Commander: () => false,
  TransformSpecies: () => null,
  WeightChange: () => 0,
  Toxic: (v, b) => b.toxicStage,
  Protect: v => flag(v.protect),
  KingsShield: v => flag(v.kingsshield),
  SpikyShield: v => flag(v.spikyshield),
  BanefulBunker: v => flag(v.banefulbunker),
  Obstruct: v => flag(v.obstruct),
  ShellTrap: v => flag(v.shelltrap),
  FocusPunch: v => flag(v.focuspunch),
  BeakBlast: v => flag(v.beakblast),
  Mimic: () => false,
  TwoTurnAttack: v => Object.keys(SEMI_INVULNERABLE).find(k => v[k]) || (v.twoturnmove ? v.twoturnmove.move : null),
  ExtraPursuit: () => false,
  Prankster: () => false,
  Rollout: v => dur(v.rollout, 0),
  FuryCutter: v => v.furycutter?.multiplier ?? 0,
  EchoedVoice: () => 0,
  Metronome: v => v.metronome?.lastMove ? v.metronome.numConsecutive ?? 0 : 0,
  Stockpile_Def: v => v.stockpile?.def ?? 0,
  Stockpile_SpDef: v => v.stockpile?.spd ?? 0,
  CriticalBoost: () => 0,
  Unburden: v => flag(v.unburden),
  SlowStart: v => dur(v.slowstart, 5),
  Trace: () => false,
  Ability_Suppressed: v => flag(v.gastroacid),
  Pursuit: () => false,
  PowerTrick: v => flag(v.powertrick),
  LastHPLost: (v, b) => b.lastHPLost,
};

export class AIBattler {
  /**
   * @param ai     AI 본체 (ar/ai.js)
   * @param index  0 = 이 AI가 조종하는 쪽, 1 = 상대 (싱글 배틀)
   */
  constructor(ai, index) {
    this.ai = ai;
    this.index = index;
    this.side = index & 1;
    const self = this;
    this.effects = new Proxy({}, { get(_, key) {
      if (typeof key !== 'string') return undefined;
      const read = EFFECTS[key];
      if (!read) throw new Error(`AI effect not mapped: ${key}`);
      return read(self.volatiles || {}, self);
    } });
  }

  /** 엔진 포켓몬(우리 쪽) 또는 공개 기록(상대)으로 갱신 */
  refresh(src) {
    this.src = src;
    const gen = this.ai.gen;
    if (src.own) {
      const p = src.own;
      this.mon = p;
      this.species = p.species.id;
      this.baseSpecies = p.species.baseSpecies;
      this.name = p.name;
      this.level = p.level;
      this.hp = p.hp;
      this.totalhp = p.maxhp;
      this.fainted = !!p.fainted || p.hp <= 0;
      this.statusRaw = p.status || '';
      this.sleepLeft = p.status === 'slp' ? Math.max(1, p.statusState?.time ?? 1) : 0;
      this.toxicStage = p.status === 'tox' ? (p.statusState?.stage ?? 0) : 0;
      this.turnCount = p.activeTurns ?? 0;
      this.boosts = p.boosts;
      this.volatiles = p.volatiles;
      this.abilityRaw = p.volatiles.gastroacid ? '' : p.ability;
      this.abilityKnown = true;
      this.itemRaw = p.item;
      this.addedType = p.addedType || null;
      this.transformed = !!p.transformed;
      this.typesRaw = p.terastallized && p.terastallized !== 'Stellar' ? [p.terastallized]
        : p.types.filter(t => !(p.volatiles.roost && t === 'Flying'));
      this.rawStats = { ...p.storedStats };
      this.weightkg = (p.weighthg ?? p.species.weighthg ?? 0) / 10;
      this.gender = p.gender;
      this.lastMoveUsed = p.lastMove?.id || null;
      this.lastHPLost = p.hurtThisTurn ? (p.lastDamage || 0) : 0;
      this.movesUsed = new Set(p.moveSlots.filter(s => s.used).map(s => s.id));
      this.moves = p.moveSlots.map(s => new MoveData(gen, s.id, s));
      this.knowledge = null;
      this.isActive = true;
    } else {
      const view = src.view, rec = src.record;
      this.mon = null;
      const sp = gen.species.get(rec?.forme || rec?.species || view.name);
      this.species = sp.id;
      this.baseSpecies = sp.baseSpecies;
      this.name = view.name;
      this.level = view.level;
      this.totalhp = Math.max(1, Math.round(view.maxhp));
      this.hp = Math.max(0, Math.round(view.hp));
      this.fainted = this.hp <= 0;
      this.statusRaw = view.status || '';
      /* 잠듦 남은 턴은 비공개 — 공개 로그에서 잠든 채 보낸 턴 수로 어림한다 (최대 3턴) */
      this.sleepLeft = this.statusRaw === 'slp' ? Math.max(1, 3 - (rec?.sleptTurns || 0)) : 0;
      this.toxicStage = this.statusRaw === 'tox' ? (view.statusState?.stage ?? 0) : 0;
      this.turnCount = rec ? Math.max(0, this.ai.battle.turn - (rec.enteredTurn ?? this.ai.battle.turn)) : 0;
      this.boosts = view.boosts || {};
      this.volatiles = view.volatiles || {};
      /* 특성: 드러났으면 그것, 아니면 종족이 가질 수 있는 특성이 하나뿐일 때만 안다 */
      const options = [...new Set(Object.values(sp.abilities || {}).map(a => gen.abilities.get(a).id))];
      this.abilityRaw = view.ability || (options.length === 1 ? options[0] : '');
      this.abilityKnown = !!this.abilityRaw;
      this.itemRaw = view.item || '';
      this.addedType = null;
      this.transformed = !!rec?.transformed;
      this.typesRaw = view.getTypes();
      const base = sp.baseStats;
      const stat = k => Math.floor((2 * base[k] + 31) * this.level / 100) + 5;
      this.rawStats = { atk: stat('atk'), def: stat('def'), spa: stat('spa'), spd: stat('spd'), spe: stat('spe') };
      this.weightkg = sp.weightkg || 0;
      this.gender = '';
      this.lastMoveUsed = rec?.lastMove || null;
      this.lastHPLost = 0;
      this.moves = (view.moveSlots || []).map(s => new MoveData(gen, s.id, s));
      this.movesUsed = new Set((rec?.moves || []).map(n => gen.moves.get(n).id));
      this.knowledge = view.knowledge || null;
      this.isActive = true;
    }
    return this;
  }

  /* ---------- 원작 AIBattler 접근자 ---------- */
  get status() { return this.statusRaw === 'tox' ? 'psn' : this.statusRaw; }
  /** 원작 statusCount: 잠듦 = 남은 턴, 독 = 맹독이면 1 이상 */
  get statusCount() { return this.statusRaw === 'slp' ? this.sleepLeft : this.statusRaw === 'tox' ? 1 : 0; }
  get stages() { return this.boosts; }
  stage(stat) { return this.boosts?.[stat] || 0; }
  statStageAtMax(stat) { return this.stage(stat) >= STAT_STAGE_MAXIMUM; }
  statStageAtMin(stat) { return this.stage(stat) <= -STAT_STAGE_MAXIMUM; }
  hasLoweredStatStages() { return Object.values(this.boosts || {}).some(v => v < 0); }
  hasRaisedStatStages() { return Object.values(this.boosts || {}).some(v => v > 0); }
  get abilityId() { return this.abilityRaw; }
  get ability() { return this.abilityRaw; }
  get itemId() { return this.itemRaw; }
  get item() { return this.itemRaw; }
  opposes(other) { return other === undefined ? this.side === 1 : other.side !== this.side; }
  get wild() { return false; }
  isSpecies(id) { return this.species === id || this.ai.gen.species.get(this.baseSpecies).id === id; }
  idxOwnSide() { return this.side; }
  idxOpposingSide() { return 1 - this.side; }
  ownSide() { return this.ai.sides[this.side]; }
  opposingSide() { return this.ai.sides[1 - this.side]; }
  realHp() { return this.hp; }
  realTotalhp() { return this.totalhp; }

  pbTypes() {
    const t = [...this.typesRaw];
    if (this.addedType && !t.includes(this.addedType)) t.push(this.addedType);
    return t;
  }
  get types() { return this.pbTypes(); }
  hasType(type) { return !!type && this.pbTypes().includes(type); }
  /* 원작 Pokemon 쪽 이름 — 교체 후보와 같은 함수(압정 피해 등)에 넣을 수 있게 */
  hasAbility(a) { return Array.isArray(a) ? a.includes(this.abilityRaw) : this.abilityRaw === a; }
  hasItem(i) { return Array.isArray(i) ? i.includes(this.itemRaw) : this.itemRaw === i; }
  pbHasOtherType(type) { const t = this.pbTypes(); return t.length > 1 || t[0] !== type; }

  /* 특성: 위액 등으로 무효화되면 없는 셈. 틀깨기 계열이 상대 특성을 지우는 건 ai.battle.moldBreaker가 따로 본다 */
  abilityActive() {
    if (!this.abilityRaw) return false;
    if (this.volatiles?.gastroacid) return false;
    if (this.ai.globalAbility('neutralizinggas') && this.abilityRaw !== 'neutralizinggas') return false;
    return true;
  }
  hasActiveAbility(ab) {
    if (!this.abilityActive()) return false;
    return Array.isArray(ab) ? ab.includes(this.abilityRaw) : this.abilityRaw === ab;
  }
  hasMoldBreaker() { return this.hasActiveAbility(['moldbreaker', 'teravolt', 'turboblaze', 'myceliummight']); }
  itemActive() {
    if (!this.itemRaw) return false;
    if (this.volatiles?.embargo || this.ai.battle.field.pseudoWeather?.magicroom) return false;
    if (this.hasActiveAbility('klutz')) return false;
    return true;
  }
  hasActiveItem(item) {
    if (!this.itemActive()) return false;
    return Array.isArray(item) ? item.includes(this.itemRaw) : this.itemRaw === item;
  }
  isBerry(item = this.itemRaw) { return !!item && !!this.ai.gen.items.get(item).isBerry; }
  isGem(item = this.itemRaw) { return !!item && !!this.ai.gen.items.get(item).isGem; }

  checkForMove(fn) {
    for (const m of this.moves) {
      if (m.pp === 0 && m.totalPp > 0) continue;
      if (fn(m)) return true;
    }
    return false;
  }
  hasDamagingMoveOfType(...types) { return this.checkForMove(m => m.damagingMove() && types.includes(m.pbCalcType(this))); }
  hasMoveWithFunction(...codes) { return this.checkForMove(m => codes.includes(m.functionCode)); }
  pbHasMove(id) { return this.moves.some(m => m.id === id); }
  pbGetMoveWithID(id) { return this.moves.find(m => m.id === id) || null; }
  get lastRegularMoveUsed() { return this.lastMoveUsed; }
  get lastMoveUsedType() { return this.lastMoveUsed ? this.ai.gen.moves.get(this.lastMoveUsed).type : null; }

  /* ---------- 능력치 ---------- */
  baseStat(stat) {
    if (this.volatiles?.powertrick && (stat === 'atk' || stat === 'def')) return this.rawStats[stat === 'atk' ? 'def' : 'atk'];
    return this.rawStats[stat];
  }
  /** 실효 스피드 — 마비·스카프·순풍·날씨 특성 포함 (원작 pbSpeed) */
  pbSpeed() {
    let speed = Math.floor(this.baseStat('spe') * stageRatio('spe', this.stage('spe')));
    const weather = this.effectiveWeather();
    if (this.abilityActive()) {
      const ab = this.abilityRaw;
      if ((ab === 'swiftswim' && ['Rain', 'HeavyRain'].includes(weather)) || (ab === 'chlorophyll' && ['Sun', 'HarshSun'].includes(weather)) ||
        (ab === 'sandrush' && weather === 'Sandstorm') || (ab === 'slushrush' && weather === 'Hail') ||
        (ab === 'surgesurfer' && this.ai.terrain === 'Electric')) speed *= 2;
      if (ab === 'quickfeet' && this.status) speed *= 1.5;
      if (ab === 'unburden' && this.volatiles?.unburden) speed *= 2;
      if (ab === 'slowstart' && this.volatiles?.slowstart) speed /= 2;
      if (['protosynthesis', 'quarkdrive'].includes(ab) && this.volatiles?.[ab]?.bestStat === 'spe') speed *= 1.5;
    }
    if (this.hasActiveItem('choicescarf')) speed *= 1.5;
    if (this.hasActiveItem(['ironball', 'machobrace', 'poweranklet', 'powerband', 'powerbelt', 'powerbracer', 'powerlens', 'powerweight'])) speed /= 2;
    if (this.hasActiveItem('quickpowder') && this.isSpecies('ditto') && !this.transformed) speed *= 2;
    if (this.ownSide().Tailwind > 0) speed *= 2;
    if (this.status === 'par' && !this.hasActiveAbility('quickfeet')) speed /= 2;
    return Math.max(1, Math.floor(speed));
  }
  roughStat(stat) {
    if (stat === 'spe' && this.ai.trainer.highSkill()) return this.pbSpeed();
    return Math.floor(this.baseStat(stat) * stageRatio(stat, this.stage(stat)));
  }
  fasterThan(other) {
    if (!other) return false;
    const mine = this.roughStat('spe'), theirs = other.roughStat('spe');
    return (mine > theirs) !== !!this.ai.battle.field.pseudoWeather?.trickroom;
  }
  pbWeight() {
    let w = this.weightkg;
    if (this.hasActiveAbility('heavymetal')) w *= 2;
    if (this.hasActiveAbility('lightmetal')) w /= 2;
    if (this.hasActiveItem('floatstone')) w /= 2;
    return Math.max(0.1, w) * 10;   // 원작은 0.1kg 단위
  }

  /* ---------- 상태 판정 (원작 Battler 메서드의 읽기 전용 근사) ---------- */
  effectiveWeather() {
    let w = this.ai.weather;
    if (['Sun', 'Rain', 'HarshSun', 'HeavyRain'].includes(w) && this.hasActiveItem('utilityumbrella')) w = 'None';
    return w;
  }
  airborne() {
    if (this.hasActiveItem('ironball')) return false;
    if (this.ai.battle.field.pseudoWeather?.gravity) return false;
    if (this.volatiles?.ingrain || this.volatiles?.smackdown) return false;
    if (this.hasType('Flying')) return true;
    if (this.hasActiveAbility('levitate') && !this.ai.battle.moldBreaker) return true;
    if (this.hasActiveItem('airballoon')) return true;
    if (this.volatiles?.magnetrise || this.volatiles?.telekinesis) return true;
    return false;
  }
  affectedByTerrain() { return !this.airborne() && !this.semiInvulnerable(); }
  semiInvulnerable() { return Object.keys(SEMI_INVULNERABLE).some(k => this.volatiles?.[k]); }
  inTwoTurnAttack(...codes) {
    const k = Object.keys(SEMI_INVULNERABLE).find(key => this.volatiles?.[key]);
    if (k) return codes.includes(SEMI_INVULNERABLE[k]);
    const mv = this.volatiles?.twoturnmove?.move;
    return !!mv && codes.includes(new MoveData(this.ai.gen, mv).functionCode);
  }
  usingMultiTurnAttack() { return !!(this.volatiles?.twoturnmove || this.volatiles?.lockedmove || this.volatiles?.rollout || this.volatiles?.uproar || this.volatiles?.bide); }
  takesIndirectDamage() { return !this.hasActiveAbility('magicguard'); }
  takesSandstormDamage() {
    if (!this.takesIndirectDamage()) return false;
    if (['Rock', 'Ground', 'Steel'].some(t => this.hasType(t))) return false;
    if (this.hasActiveAbility(['overcoat', 'sandforce', 'sandrush', 'sandveil'])) return false;
    if (this.hasActiveItem('safetygoggles')) return false;
    return !this.semiInvulnerable();
  }
  takesHailDamage() { return false; }   // 9세대 설경은 피해가 없다
  canHeal() { return this.hp < this.totalhp && !this.volatiles?.healblock; }
  canConsumeBerry() { return !this.ai.foeHasActiveAbility(this, ['unnerve', 'asoneglastrier', 'asonespectrier']); }
  paralyzed() { return this.status === 'par'; }
  asleep() { return this.status === 'slp' || this.hasActiveAbility('comatose'); }
  canChangeType() { return !this.hasActiveAbility(['multitype', 'rkssystem']) && !this.volatiles?.terastallized; }
  unstoppableAbility() { return ['multitype', 'stancechange', 'schooling', 'comatose', 'shieldsdown', 'disguise', 'rkssystem', 'battlebond', 'powerconstruct', 'iceface', 'gulpmissile', 'asoneglastrier', 'asonespectrier', 'zerotohero', 'commander', 'terashift'].includes(this.abilityRaw); }
  ungainableAbility() { return ['trace', 'forecast', 'flowergift', 'imposter', 'illusion', 'zenmode', 'receiver', 'powerofalchemy', 'hungerswitch', 'neutralizinggas', 'protosynthesis', 'quarkdrive', 'wonderguard'].includes(this.abilityRaw) || this.unstoppableAbility(); }
  unlosableItem(item) { const it = this.ai.gen.items.get(item); return !!(it.megaStone || it.zMove || it.onPlate || it.onMemory || it.onDrive || /mask$/.test(it.id)); }
  affectedByPowder() { return !this.hasType('Grass') && !this.hasActiveAbility('overcoat') && !this.hasActiveItem('safetygoggles'); }
  affectedByContactEffect() { return !this.hasActiveItem('protectivepads') && !this.hasActiveAbility('longreach'); }
  trappedInBattle() { return !!(this.volatiles?.trapped || this.volatiles?.partiallytrapped || this.volatiles?.ingrain || this.volatiles?.octolock || this.volatiles?.jawlock || this.volatiles?.noretreat); }

  /** 상태이상을 걸 수 있나 — 원작 pbCanInflictStatus? (메시지 없음) */
  canInflictStatus(status, user, move, ignoreStatus = false) {
    if (this.fainted) return false;
    const self = user && user.index === this.index;
    if (!ignoreStatus && (this.status || this.hasActiveAbility('comatose'))) return false;
    if (status === 'slp' && !self && this.ai.battle.field.pseudoWeather?.uproar) return false;
    const mold = !!user && !self && this.ai.battle.moldBreaker;
    /* 대타출동 — 변화기로 거는 상태이상은 막는다 */
    if (!self && this.volatiles?.substitute && move?.statusMove() && !move.ignoresSubstitute(user)) return false;
    /* 타입 면역 */
    if (status === 'slp') { /* 없음 */ }
    if (status === 'psn' || status === 'tox') {
      if ((this.hasType('Poison') || this.hasType('Steel')) && !(user?.hasActiveAbility('corrosion'))) return false;
    }
    if (status === 'brn' && this.hasType('Fire')) return false;
    if (status === 'par' && this.hasType('Electric')) return false;
    if (status === 'frz' && (this.hasType('Ice') || ['Sun', 'HarshSun'].includes(this.effectiveWeather()))) return false;
    /* 필드 */
    const terrain = this.ai.terrain;
    if (this.affectedByTerrain()) {
      if (terrain === 'Electric' && status === 'slp') return false;
      if (terrain === 'Misty') return false;
    }
    /* 특성 */
    if (!mold && this.abilityActive()) {
      const ab = this.abilityRaw;
      const blocks = { slp: ['insomnia', 'vitalspirit', 'sweetveil'], psn: ['immunity', 'pastelveil'], tox: ['immunity', 'pastelveil'],
        brn: ['waterveil', 'waterbubble', 'thermalexchange'], par: ['limber'], frz: ['magmaarmor'] }[status] || [];
      if (blocks.includes(ab)) return false;
      if (['leafguard'].includes(ab) && ['Sun', 'HarshSun'].includes(this.effectiveWeather())) return false;
      if (ab === 'flowerveil' && this.hasType('Grass')) return false;
      if (ab === 'purifyingsalt') return false;
    }
    /* 신비의부적 */
    if (!self && this.ownSide().Safeguard > 0 && !user?.hasActiveAbility('infiltrator')) return false;
    return true;
  }
  canSleep(user, move) { return this.canInflictStatus('slp', user, move); }
  canSleepYawn() { return this.canInflictStatus('slp', null, null); }
  canPoison(user, move) { return this.canInflictStatus('psn', user, move); }
  canBurn(user, move) { return this.canInflictStatus('brn', user, move); }
  canParalyze(user, move) { return this.canInflictStatus('par', user, move); }
  canFreeze(user, move) { return this.canInflictStatus('frz', user, move); }
  /** 싱크로 — 상대에게 받은 상태이상을 되돌려 줄 수 있나 */
  canSynchronize(status, target) { return target.canInflictStatus(status, this, null); }
  canConfuse(user, move) {
    if (this.fainted || this.volatiles?.confusion) return false;
    const self = user && user.index === this.index;
    if (!self && this.volatiles?.substitute && move?.statusMove() && !move.ignoresSubstitute(user)) return false;
    if (!(user && this.ai.battle.moldBreaker) && this.hasActiveAbility('owntempo')) return false;
    if (this.affectedByTerrain() && this.ai.terrain === 'Misty') return false;
    if (!self && this.ownSide().Safeguard > 0 && !user?.hasActiveAbility('infiltrator')) return false;
    return true;
  }
  canConfuseSelf() { return this.canConfuse(this, null); }
  canAttract(user) {
    if (this.fainted || this.volatiles?.attract) return false;
    if (!user || user.fainted) return false;
    const g1 = this.gender, g2 = user.gender;
    if (!g1 || !g2 || g1 === 'N' || g2 === 'N' || g1 === g2) return false;
    if (!this.ai.battle.moldBreaker && this.hasActiveAbility(['oblivious', 'aromaveil'])) return false;
    return true;
  }

  /** 랭크를 올릴 수 있나 — 원작 pbCanRaiseStatStage? */
  canRaiseStatStage(stat, user, move) {
    if (this.fainted) return false;
    if (this.hasActiveAbility('contrary') && !this.ai.battle.moldBreaker) return this.canLowerStatStage(stat, user, move, true);
    return !this.statStageAtMax(stat);
  }
  /** 랭크를 내릴 수 있나 — 원작 pbCanLowerStatStage? */
  canLowerStatStage(stat, user, move, ignoreContrary = false) {
    if (this.fainted) return false;
    if (!ignoreContrary && this.hasActiveAbility('contrary') && !this.ai.battle.moldBreaker) return this.canRaiseStatStage(stat, user, move);
    const self = user && user.index === this.index;
    if (!self) {
      if (this.volatiles?.substitute && !(move?.ignoresSubstitute(user))) return false;
      if (this.ownSide().Mist > 0 && !user?.hasActiveAbility('infiltrator')) return false;
      const mold = this.ai.battle.moldBreaker;
      if (!mold && this.hasActiveAbility(['clearbody', 'whitesmoke', 'fullmetalbody'])) return false;
      if (!mold && this.hasActiveAbility('hypercutter') && stat === 'atk') return false;
      if (!mold && this.hasActiveAbility('bigpecks') && stat === 'def') return false;
      if (!mold && this.hasActiveAbility(['keeneye', 'mindseye']) && stat === 'accuracy') return false;
      if (!mold && this.hasActiveAbility('flowerveil') && this.hasType('Grass')) return false;
      if (this.hasActiveItem('clearamulet')) return false;
    }
    return !this.statStageAtMin(stat);
  }

  /** 원작 can_attack? — 이번 턴에 확실히 못 움직이는 경우만 false */
  canAttack() {
    if (this.effects.HyperBeam > 0) return false;
    if (this.status === 'slp' && this.statusCount > 1) return false;
    if (this.status === 'frz') return false;
    if (this.effects.Truant && this.hasActiveAbility('truant')) return false;
    if (this.effects.Flinch) return false;
    return true;
  }
  /** 교체할 수 있는 동료가 있나 */
  canSwitchLax() { return this.ai.ableReserveCount(this.side) > 0; }
  /** 원작 can_become_trapped? */
  canBecomeTrapped() {
    if (this.fainted) return false;
    if (this.hasActiveItem('shedshell')) return false;
    if (this.hasType('Ghost')) return false;
    if (this.trappedInBattle()) return false;
    return true;
  }

  /** 상태이상이 오히려 이득인가 — 원작 wants_status_problem? (+ Gen9 팩) */
  wantsStatusProblem(newStatus) {
    if (!newStatus) return true;
    const ai = this.ai;
    if (this.abilityActive()) {
      switch (this.abilityRaw) {
        case 'guts': if (!['slp', 'frz'].includes(newStatus) && ai.statRaiseWorthwhile(this, 'atk', true)) return true; break;
        case 'marvelscale': if (ai.statRaiseWorthwhile(this, 'def', true)) return true; break;
        case 'quickfeet': if (!['slp', 'frz'].includes(newStatus) && ai.statRaiseWorthwhile(this, 'spe', true)) return true; break;
        case 'flareboost': if (newStatus === 'brn' && ai.statRaiseWorthwhile(this, 'spa', true)) return true; break;
        case 'toxicboost': if (newStatus === 'psn' && ai.statRaiseWorthwhile(this, 'atk', true)) return true; break;
        case 'poisonheal': if (newStatus === 'psn') return true; break;
        case 'magicguard': if (newStatus === 'psn' || (newStatus === 'brn' && !ai.statRaiseWorthwhile(this, 'atk', true))) return true; break;
      }
    }
    if (newStatus === 'slp' && this.checkForMove(m => m.usableWhenAsleep())) return true;
    if (this.hasMoveWithFunction('DoublePowerIfUserPoisonedBurnedParalyzed') && ['psn', 'brn', 'par'].includes(newStatus)) return true;
    return false;
  }

  /** 턴 끝에 받을 피해 (음수 = 회복) — 원작 rough_end_of_round_damage (+ 소금절이) */
  roughEndOfRoundDamage() {
    const ai = this.ai, total = this.totalhp, field = ai.battle.field;
    const frac = n => Math.max(Math.floor(total / n), 1);
    let ret = 0;
    let weather = this.effectiveWeather();
    if (field.weatherState?.duration === 1) weather = 'None';
    if (weather === 'Sandstorm' && this.takesSandstormDamage()) ret += frac(16);
    switch (this.abilityActive() ? this.abilityRaw : '') {
      case 'dryskin':
        if (['Sun', 'HarshSun'].includes(weather) && this.takesIndirectDamage()) ret += frac(8);
        if (['Rain', 'HeavyRain'].includes(weather) && this.canHeal()) ret -= frac(8);
        break;
      case 'icebody': if (weather === 'Hail' && this.canHeal()) ret -= frac(16); break;
      case 'raindish': if (['Rain', 'HeavyRain'].includes(weather) && this.canHeal()) ret -= frac(16); break;
      case 'solarpower': if (['Sun', 'HarshSun'].includes(weather) && this.takesIndirectDamage()) ret += frac(8); break;
    }
    const wish = ai.positionEffects(this.index);
    if (wish.Wish === 1 && this.canHeal()) ret -= wish.WishAmount;
    if (ai.terrain === 'Grassy' && this.affectedByTerrain() && this.canHeal()) ret -= frac(16);
    if (this.hasActiveItem('blacksludge')) {
      if (this.hasType('Poison')) { if (this.canHeal()) ret -= frac(16); }
      else if (this.takesIndirectDamage()) ret += frac(8);
    } else if (this.hasActiveItem('leftovers') && this.canHeal()) ret -= frac(16);
    const bigRoot = x => Math.max(this.hasActiveItem('bigroot') ? Math.floor(x * 1.3) : x, 1);
    if (this.effects.AquaRing && this.canHeal()) ret -= bigRoot(Math.floor(total / 16));
    if (this.effects.Ingrain && this.canHeal()) ret -= bigRoot(Math.floor(total / 16));
    if (this.effects.LeechSeed >= 0) {
      if (this.takesIndirectDamage()) ret += frac(8);
    } else {
      for (const b of ai.eachBattler()) {
        if (b.index === this.index || b.effects.LeechSeed !== this.index) continue;
        ret -= bigRoot(Math.max(Math.min(Math.floor(b.totalhp / 8), b.hp), 1));
      }
    }
    if (this.status === 'psn') {
      if (this.hasActiveAbility('poisonheal')) { if (this.canHeal()) ret -= frac(8); }
      else if (this.takesIndirectDamage()) {
        const mult = this.statusCount > 0 ? Math.min(this.effects.Toxic + 1, 16) : 2;
        ret += Math.max(Math.floor(mult * total / 16), 1);
      }
    } else if (this.status === 'brn') {
      if (this.takesIndirectDamage()) {
        let amt = Math.floor(total / 16);
        if (this.hasActiveAbility('heatproof')) amt = Math.round(amt / 2);
        ret += Math.max(amt, 1);
      }
    }
    if (this.effects.Curse && this.takesIndirectDamage()) ret += frac(4);
    if (this.effects.Trapping > 1 && this.takesIndirectDamage()) {
      const binder = ai.battlers[1 - this.index];
      ret += Math.max(Math.floor(total / (binder?.hasActiveItem('bindingband') ? 6 : 8)), 1);
    }
    if (this.effects.PerishSong === 1) return 999999;
    if (this.asleep() && this.statusCount > 1 && this.takesIndirectDamage()) {
      for (const b of ai.eachBattler()) if (b.index !== this.index && b.hasActiveAbility('baddreams')) ret += frac(8);
    }
    if (this.hasActiveItem('stickybarb') && this.takesIndirectDamage()) ret += frac(8);
    if (this.effects.SaltCure) ret += (this.hasType('Water') || this.hasType('Steel')) ? frac(4) : frac(8);
    return ret;
  }

  /** 타입 상성 — 원작 effectiveness_of_type_against_battler (곱셈 배율: 0, 0.25 … 4) */
  effectivenessOfTypeAgainstBattler(type, user = null, move = null) {
    if (!type) return 1;
    if (type === 'Ground' && this.hasType('Flying') && this.hasActiveItem('ironball')) return 1;
    const gen = this.ai.gen;
    let ret = 1;
    for (const defType of this.pbTypes()) {
      let mult = typeMult(gen, type, defType);
      if (mult === 0) {
        if (this.hasActiveItem('ringtarget')) mult = 1;
        if ((user?.hasActiveAbility(['scrappy', 'mindseye']) || this.effects.Foresight) && defType === 'Ghost') mult = 1;
        if (this.effects.MiracleEye && defType === 'Dark') mult = 1;
      } else if (mult > 1 && this.effectiveWeather() === 'StrongWinds' && defType === 'Flying') mult = 1;
      if (!this.airborne() && defType === 'Flying' && type === 'Ground') mult = 1;
      if (move) {
        if (move.functionCode === 'HitsTargetInSkyGroundsTarget' && type === 'Ground' && defType === 'Flying') mult = 1;
        if (move.functionCode === 'FreezeTargetSuperEffectiveAgainstWater' && defType === 'Water') mult = 2;
      }
      ret *= mult;
    }
    if (this.effects.TarShot && type === 'Fire') ret *= 2;
    return ret;
  }

  /** 이 특성을 가지면 얼마나 좋은가 (-10~+10) — 원작 wants_ability? */
  wantsAbility(ability = '') { return this.ai.abilityRating(this, ability); }
  /** 이 도구를 지니면 얼마나 좋은가 (-10~+10) — 원작 wants_item? */
  wantsItem(item = '') { return this.ai.itemRating(this, item); }
  getScoreChangeForConsumingItem(item, tryPreserving = false) { return this.ai.consumeItemScore(this, item, tryPreserving); }
}

/** 공격 타입 1개 대 방어 타입 1개 배율 */
export function typeMult(gen, atk, def) {
  if (!gen.types.get(def)?.exists) return 1;
  if (!gen.getImmunity(atk, [def])) return 0;
  return Math.pow(2, gen.getEffectiveness(atk, [def]));
}
export const effectiveness = (gen, atk, defTypes) => defTypes.reduce((m, t) => m * typeMult(gen, atk, t), 1);
export const isIneffective = e => e === 0;
export const isSuperEffective = e => e > 1;
export const isResistant = e => e > 0 && e < 1;
export const isNormalEffective = e => e === 1;

/**
 * 교체 후보·상대 남은 포켓몬 (원작 Pokemon 객체 자리). 우리 쪽은 엔진 포켓몬,
 * 상대 쪽은 본 적 있는 공개 기록 또는 아직 안 나온 '?' 자리다.
 */
export class PartyMon {
  constructor(ai, { own = null, record = null, unseen = false } = {}) {
    this.ai = ai;
    const gen = ai.gen;
    if (own) {
      this.mon = own;
      this.species = own.species.id;
      this.hp = own.hp; this.totalhp = own.maxhp;
      this.types = [...own.types];
      this.abilityId = own.ability; this.itemId = own.item;
      this.statusRaw = own.status || '';
      this.statusCount = own.status === 'slp' ? (own.statusState?.time ?? 1) : own.status === 'tox' ? 1 : 0;
      this.moves = own.moveSlots.map(s => new MoveData(gen, s.id, s));
      this.level = own.level;
      this.fainted = !!own.fainted || own.hp <= 0;
    } else if (record) {
      const sp = gen.species.get(record.forme || record.species);
      this.species = sp.id;
      this.totalhp = Math.floor((2 * sp.baseStats.hp + 31) * record.level / 100) + record.level + 10;
      this.hp = Math.round((record.ratio ?? 1) * this.totalhp);
      this.types = [...sp.types];
      const options = [...new Set(Object.values(sp.abilities || {}).map(a => gen.abilities.get(a).id))];
      this.abilityId = record.ability || (options.length === 1 ? options[0] : '');
      this.itemId = record.item || '';
      this.statusRaw = record.status || '';
      this.statusCount = 0;
      this.moves = record.moves.map(n => new MoveData(gen, gen.moves.get(n).id));
      this.level = record.level;
      this.fainted = (record.ratio ?? 1) <= 0;
    } else {
      this.unseen = true;
      this.species = ''; this.hp = 1; this.totalhp = 1; this.types = []; this.abilityId = ''; this.itemId = '';
      this.statusRaw = ''; this.statusCount = 0; this.moves = []; this.level = 1; this.fainted = false;
    }
  }
  get status() { return this.statusRaw === 'tox' ? 'psn' : this.statusRaw; }
  able() { return !this.fainted && this.hp > 0; }
  hasType(t) { return this.types.includes(t); }
  hasAbility(a) { return Array.isArray(a) ? a.includes(this.abilityId) : this.abilityId === a; }
  hasItem(i) { return Array.isArray(i) ? i.includes(this.itemId) : this.itemId === i; }
  isSpecies(id) { return this.species === id; }
}
