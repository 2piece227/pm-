/**
 * 어나더레드(Pokémon Essentials v21.1 + Gen9 팩) 배틀 AI 이식 — 본체.
 *
 * 흐름 (원작 pbDefaultChooseEnemyCommand):
 *   1) 교체할 이유가 있나 (ShouldSwitch 핸들러) → 막는 이유는 없나 (ShouldNotSwitch) → 가장 좋은 교체 대상
 *   2) 기술마다 점수: 기본 100 → 실패 예측(20)/무의미(60) → 함수 코드 효과 → 공통 보정
 *   3) 최고점 × 한계선(0.6+0.35√(실력/100)) 아래는 버리고 남은 차이만큼의 비율로 고른다
 *      실력이 높으면 쓸 만한 기술이 없을 때(최고점 ≤ 60 등) 교체를 다시 시도한다
 *
 * 원작과 다른 점은 하나 — 상대 정보는 공개된 것만 쓴다 (battler.js 머리말).
 */
import { AIBattler, PartyMon, weatherOf, terrainOf, effectiveness, isIneffective, isSuperEffective } from './battler.js';
import { MoveData, AIMove } from './move.js';
import { handlers, MOVE_FAIL_SCORE, MOVE_USELESS_SCORE, MOVE_BASE_SCORE } from './handlers.js';
import { GENERIC } from './generic.js';
import { ENHANCE, effectScale, turnOutlook, setupSenseScore, setupValueScore, matchupBonus } from './enhance.js';
import './effects-general.js';
import './effects-switch.js';
import './effects-misc.js';
import './effects-battler-stats.js';
import './effects-battler-other.js';
import './effects-move-attributes.js';
import './effects-multi-hit.js';
import './effects-healing.js';
import './effects-items.js';
import './effects-change-move.js';
import './effects-switching-acting.js';
import './effects-gen9.js';

export { MOVE_FAIL_SCORE, MOVE_USELESS_SCORE, MOVE_BASE_SCORE };

/** 원작 AITrainer — 실력값과 실력 플래그 */
export class AITrainer {
  constructor(skill = 100, flags = []) {
    this.skill = skill;
    const f = [...flags];
    if (skill > 0) f.push('PredictMoveFailure', 'ScoreMoves', 'PreferMultiTargetMoves');
    if (skill >= 32) f.push('ConsiderSwitching', 'HPAware');
    if (skill < 32) f.push('UsePokemonInOrder');
    else if (skill >= 100) f.push('ReserveLastPokemon');
    this.flags = f.filter(x => !f.includes(`Anti${x}`));
  }
  hasSkillFlag(flag) { return this.flags.includes(flag); }
  mediumSkill() { return this.skill >= 32; }
  highSkill() { return this.skill >= 48; }
  bestSkill() { return this.skill >= 100; }
}

/** 원작 Battle::Battler 부족분의 쪽 효과 이름 → 엔진 sideConditions */
function sideEffects(side) {
  const sc = side.sideConditions || {};
  const turns = k => (sc[k] ? (sc[k].duration ?? 5) : 0);
  return {
    StealthRock: !!sc.stealthrock, Spikes: sc.spikes ? (sc.spikes.layers || 1) : 0,
    ToxicSpikes: sc.toxicspikes ? (sc.toxicspikes.layers || 1) : 0, StickyWeb: !!sc.stickyweb, Steelsurge: !!sc.gmaxsteelsurge,
    Reflect: turns('reflect'), LightScreen: turns('lightscreen'), AuroraVeil: turns('auroraveil'),
    Tailwind: turns('tailwind'), Safeguard: turns('safeguard'), Mist: turns('mist'), LuckyChant: turns('luckychant'),
    QuickGuard: !!sc.quickguard, WideGuard: !!sc.wideguard, CraftyShield: !!sc.craftyshield, MatBlock: !!sc.matblock,
    Rainbow: 0, SeaOfFire: 0, Swamp: 0, EchoedVoiceCounter: 0, EchoedVoiceUsed: false, LastRoundFainted: -1, Round: false,
    Cannonade: 0, VineLash: 0, Volcalith: 0, Wildfire: 0,
  };
}

export class ArAI {
  constructor({ gen, rng = Math.random, skill = 100, flags = [], name = '' }) {
    this.gen = gen;
    this.rng = rng;
    this.name = name;
    this.trainer = new AITrainer(skill, flags);
    this.handlers = handlers;
    this.battlers = [new AIBattler(this, 0), new AIBattler(this, 1)];
    this.log = [];
  }
  /** 원작 pbAIRandom */
  rand(x) { return Math.floor(this.rng() * x); }

  /**
   * 이번 결정에 쓸 상태를 맞춘다.
   * @param battle   엔진 배틀 (우리 쪽 정보와 필드·공개 로그만 읽는다)
   * @param sideId   'p1' | 'p2'
   * @param foe      OpponentModel.view 결과 (상대 현재 포켓몬 공개 정보)
   * @param foeInfo  { record, benches(공개 기록), remaining(남은 수), teamSize }
   * @param partyOrder 원래 파티 순서 (마지막 = 아껴 둘 포켓몬)
   */
  setUp(battle, sideId, foe, foeInfo, partyOrder) {
    this.battle = { turn: battle.turn, field: battle.field, moldBreaker: false };
    this.engine = battle;
    this.sideId = sideId;
    const side = battle[sideId], foeSide = battle[sideId === 'p1' ? 'p2' : 'p1'];
    this.side = side;
    this.foeSide = foeSide;
    this.weather = weatherOf(battle.field);
    if (['Sun', 'HarshSun', 'Rain', 'HeavyRain', 'Sandstorm', 'Hail'].includes(this.weather) &&
      [side.active[0], foeSide.active[0]].some(p => p && ['cloudnine', 'airlock'].includes(p.ability))) this.weather = 'None';
    this.terrain = terrainOf(battle.field);
    this.sides = [sideEffects(side), sideEffects(foeSide)];
    this.foeInfo = foeInfo;
    this.partyOrder = partyOrder || side.pokemon;
    this.user = this.battlers[0].refresh({ own: side.active[0] });
    if (foe) this.battlers[1].refresh({ view: foe, record: foeInfo.record });
    else Object.assign(this.battlers[1], { fainted: true, isActive: false, abilityRaw: '', volatiles: {}, boosts: {}, moves: [] });
    this.target = null;
    this.log = [];
  }

  /* ---------- 원작 AI_Utilities ---------- */
  eachBattler() { return this.battlers.filter(b => b && !b.fainted); }
  eachFoeBattler(side) { return this.eachBattler().filter(b => b.side !== side); }
  eachSameSideBattler(side) { return this.eachBattler().filter(b => b.side === side); }
  eachAlly() { return []; }
  globalAbility(ab) { return this.battlers.some(b => b.isActive && !b.fainted && b.abilityRaw === ab && !b.volatiles?.gastroacid); }
  foeHasActiveAbility(b, list) { return this.eachFoeBattler(b.side).some(f => f.hasActiveAbility(list)); }
  /** 교체해 나올 수 있는 동료 수 (상대는 공개된 남은 수) */
  ableReserveCount(side) {
    if (side === 0) return this.side.pokemon.filter(p => p !== this.side.active[0] && !p.fainted && p.hp > 0).length;
    return this.foeInfo.remaining;
  }
  pbAbleNonActiveCount(side) { return this.ableReserveCount(side); }
  faintedAllies(side) {
    if (side === 0) return this.side.pokemon.filter(p => p.fainted || p.hp <= 0).length;
    return Math.max(0, (this.foeInfo.teamSize || 0) - this.foeInfo.remaining - 1);
  }
  positionEffects(index) {
    const slot = (index === 0 ? this.side : this.foeSide).slotConditions?.[0] || {};
    const b = this.battlers[index];
    return { Wish: slot.wish ? (slot.wish.duration ?? 1) : 0, WishAmount: slot.wish?.hp || Math.floor((b?.totalhp || 0) / 2),
      FutureSightCounter: slot.futuremove ? (slot.futuremove.duration ?? 2) : 0 };
  }
  moveData(id) { return new MoveData(this.gen, id); }
  /** 우리 쪽 교체 후보 (엔진 포켓몬, 다 안다) */
  reserves() {
    return this.side.pokemon.filter(p => p !== this.side.active[0] && !p.fainted && p.hp > 0).map(p => new PartyMon(this, { own: p }));
  }
  /** 상대 쪽 남은 포켓몬 — 본 적 있는 건 공개 기록, 아직 안 나온 건 '?' */
  foeParty() {
    const seen = (this.foeInfo.benches || []).map(r => new PartyMon(this, { record: r }));
    const unseen = Math.max(0, this.foeInfo.remaining - seen.length);
    return [...seen, ...Array.from({ length: unseen }, () => new PartyMon(this, { unseen: true }))];
  }
  partyOf(side) { return side === 0 ? this.reserves() : this.foeParty(); }

  /** 원작 pokemon_can_absorb_move? (+ Gen9 팩: 흙먹기·노릇노릇바디·바람타기) */
  pokemonCanAbsorbMove(pkmn, move, type) {
    if (pkmn instanceof AIBattler && !pkmn.abilityActive()) return false;
    const ab = pkmn.abilityId;
    switch (ab) {
      case 'eartheater': return type === 'Ground';
      case 'wellbakedbody': return type === 'Fire';
      case 'windrider': return !!move.windMove?.();
      case 'bulletproof': return !!move.bombMove?.();
      case 'flashfire': return type === 'Fire';
      case 'lightningrod': case 'motordrive': case 'voltabsorb': return type === 'Electric';
      case 'sapsipper': return type === 'Grass';
      case 'soundproof': return !!move.soundMove?.();
      case 'stormdrain': case 'waterabsorb': case 'dryskin': return type === 'Water';
      case 'wonderguard': return !isSuperEffective(effectiveness(this.gen, type, pkmn instanceof AIBattler ? pkmn.pbTypes() : pkmn.types));
    }
    return false;
  }
  /** 원작 pokemon_can_be_poisoned? (독압정) */
  pokemonCanBePoisoned(pkmn) {
    if (this.terrain === 'Misty') return false;
    if (pkmn.hasType('Poison') || pkmn.hasType('Steel')) return false;
    if (pkmn.hasAbility(['immunity', 'pastelveil', 'purifyingsalt'])) return false;
    if (pkmn.hasAbility('flowerveil') && pkmn.hasType('Grass')) return false;
    if (pkmn.hasAbility('leafguard') && ['Sun', 'HarshSun'].includes(this.weather)) return false;
    if (pkmn.hasAbility('comatose')) return false;
    return true;
  }
  /** 원작 pokemon_airborne? */
  pokemonAirborne(pkmn) {
    if (pkmn.hasItem('ironball')) return false;
    if (this.battle.field.pseudoWeather?.gravity) return false;
    if (pkmn.hasType('Flying')) return true;
    if (pkmn.hasAbility('levitate')) return true;
    if (pkmn.hasItem('airballoon')) return true;
    return false;
  }

  /* ---------- 원작 AI_ChooseMove ---------- */
  moveScoreThreshold() { return 0.6 + 0.35 * Math.sqrt(Math.min(this.trainer.skill, 100) / 100); }

  /** 이 기술을 지금 고를 수 있나 (PP·사슬묶기 등은 엔진 요청이 알려 준다) */
  choosableMoves(request) {
    const active = request.active[0];
    return active.moves.map((rm, i) => ({ rm, i })).filter(({ rm }) => !rm.disabled && !(rm.pp === 0 && rm.maxpp > 0));
  }

  /** 원작 pbGetMoveScores — [기술 번호, 점수, 대상, 이유] */
  getMoveScores(request) {
    const choices = [];
    /* 보강 3: 이번 턴에 쓰러지나·쓰러뜨리나 (결정 하나에 한 번) */
    const outlook = ENHANCE.setupSense || ENHANCE.setupValue.on ? turnOutlook(this) : null;
    for (const { rm, i } of this.choosableMoves(request)) {
      const data = new MoveData(this.gen, rm.id, { pp: rm.pp, maxpp: rm.maxpp });
      this.setUpMoveCheck(data);
      if (this.trainer.hasSkillFlag('PredictMoveFailure') && this.predictMoveFailure()) {
        choices.push({ index: i, id: data.id, score: MOVE_FAIL_SCORE, target: -1, why: 'fail' });
        continue;
      }
      const t = data.pbTarget(this.user);
      if (t.num === 0) {
        choices.push({ index: i, id: data.id, score: this.getMoveScore(), target: -1 });
      } else if (t.num === 1) {
        const target = this.targetFor(data.targetCode(this.user));
        if (!target) continue;   // 고를 대상이 없다 (싱글에서 아군 지정 기술)
        choices.push({ index: i, id: data.id, score: this.getMoveScore([target]), target: target.index });
      } else {
        const targets = this.targetsFor(data.targetCode(this.user));
        choices.push({ index: i, id: data.id, score: this.getMoveScore(targets), target: -1 });
      }
      const c = choices.at(-1);
      if (c && c.index === i) {
        const valued = setupValueScore(c.score, this.move, this.user, outlook);
        const s = setupSenseScore(valued, this.move, outlook, MOVE_USELESS_SCORE);
        if (s !== valued) c.why = 'no_setup';
        c.score = Math.trunc(s);
      }
    }
    this.outlook = outlook;
    this.battle.moldBreaker = false;
    return choices;
  }
  targetFor(code) {
    if (code === 'NearAlly') return null;
    if (code === 'UserOrNearAlly') return this.user;
    const foe = this.battlers[1];
    return foe.fainted ? null : foe;
  }
  targetsFor(code) {
    const foe = this.battlers[1].fainted ? [] : [this.battlers[1]];
    switch (code) {
      case 'AllAllies': return [];
      case 'UserAndAllies': return [this.user];
      case 'AllBattlers': return [this.user, ...foe];
      default: return foe;
    }
  }
  setUpMoveCheck(data) {
    this.battle.moldBreaker = this.user.hasMoldBreaker() || ['IgnoreTargetAbility', 'CategoryDependsOnHigherDamageIgnoreTargetAbility'].includes(data.functionCode);
    this.move = new AIMove(this, data);
  }
  setUpMoveCheckTarget(target) { this.target = target; }

  /** 원작 pbPredictMoveFailure */
  predictMoveFailure() {
    const user = this.user, move = this.move;
    if (user.asleep() && user.statusCount > 1 && !move.usableWhenAsleep()) return true;
    if (!user.asleep() && move.usableWhenAsleep()) return true;
    if (this.weather === 'HeavyRain' && move.roughType() === 'Fire' && move.damagingMove()) return true;
    if (this.weather === 'HarshSun' && move.roughType() === 'Water' && move.damagingMove()) return true;
    if (handlers.moveWillFail(move.functionCode, move, user, this, this.battle)) return true;
    return false;
  }
  /** 원작 pbPredictMoveFailureAgainstTarget (+ Gen9 팩: 테일아머·교만·황금몸) */
  predictMoveFailureAgainstTarget() {
    const user = this.user, target = this.target, move = this.move;
    if (handlers.moveWillFailAgainstTarget(move.functionCode, move, user, target, this, this.battle)) return true;
    const priority = move.roughPriority(user);
    if (this.terrain === 'Psychic' && target.affectedByTerrain() && target.opposes(user) && priority > 0) return true;
    if (this.immuneByAbility(user, target, move)) return true;
    if (priority > 0 && target.opposes(user) && this.eachSameSideBattler(target.side).some(b => b.hasActiveAbility(['dazzling', 'queenlymajesty', 'armortail']))) return true;
    const type = move.roughType();
    if (move.damagingMove() && isIneffective(target.effectivenessOfTypeAgainstBattler(type, user, move))) return true;
    if (move.statusMove() && user.hasActiveAbility('prankster') && target.hasType('Dark') && target.opposes(user)) return true;
    if (move.damagingMove() && type === 'Ground' && target.airborne() && !move.hitsFlyingTargets()) return true;
    if (move.powderMove() && !target.affectedByPowder()) return true;
    if (target.effects.Substitute > 0 && move.statusMove() && !move.ignoresSubstitute(user) && user.index !== target.index) return true;
    if (move.statusMove() && target.hasActiveAbility('goodasgold') && !user.hasActiveAbility('myceliummight') && user.index !== target.index) return true;
    return false;
  }
  /** 원작 pbImmunityByAbility — 흡수·무효 특성 (틀깨기는 무시) */
  immuneByAbility(user, target, move) {
    if (user.index === target.index || this.battle.moldBreaker || !target.abilityActive()) return false;
    const type = move.roughType();
    if (this.pokemonCanAbsorbMove(target, move, type)) return true;
    if (target.abilityId === 'levitate' && type === 'Ground' && move.damagingMove() && !move.hitsFlyingTargets()) return true;
    if (target.abilityId === 'telepathy') return false;
    if (target.abilityId === 'overcoat' && move.powderMove()) return true;
    return false;
  }

  /** 원작 pbGetMoveScore */
  getMoveScore(targets = null) {
    let score = MOVE_BASE_SCORE;
    if (targets) {
      score = 0;
      let affected = 0;
      const orig = this.move.move;
      for (const target of targets) {
        this.setUpMoveCheck(orig);
        this.setUpMoveCheckTarget(target);
        const t = this.getMoveScoreAgainstTarget();
        if (t < 0) continue;
        score += t;
        affected++;
      }
      if (affected === 0) score = this.trainer.hasSkillFlag('PredictMoveFailure') ? MOVE_USELESS_SCORE : MOVE_BASE_SCORE;
      if (affected === 0 && this.trainer.hasSkillFlag('PredictMoveFailure')) {
        if (!this.move.worksWithNoTargets()) return MOVE_FAIL_SCORE;
      } else {
        if (affected > 1) score /= affected;
        if (this.trainer.hasSkillFlag('PreferMultiTargetMoves') && affected > 1) score += (affected - 1) * 10;
      }
    }
    if (this.trainer.hasSkillFlag('ScoreMoves')) {
      const before = score;
      score = handlers.applyMoveEffectScore(this.move.functionCode, score, this.move, this.user, this, this.battle);
      /* 보강 1: 공격기의 부가효과(원시의힘 전능력 상승 10% 등)는 발동 확률만큼만 */
      if (score !== MOVE_USELESS_SCORE) score = before + (score - before) * effectScale(this.move);
      score = handlers.applyGeneralMoveScoreModifiers(score, this.move, this.user, this, this.battle);
    }
    score = Math.trunc(score);
    return Math.max(0, score);
  }
  /** 원작 pbGetMoveScoreAgainstTarget — -1이면 이 대상에게는 안 통한다 */
  getMoveScoreAgainstTarget() {
    if (this.trainer.hasSkillFlag('PredictMoveFailure') && this.predictMoveFailureAgainstTarget()) return -1;
    let score = MOVE_BASE_SCORE;
    if (this.trainer.hasSkillFlag('ScoreMoves')) {
      score = handlers.applyMoveEffectAgainstTargetScore(this.move.functionCode, MOVE_BASE_SCORE, this.move, this.user, this.target, this, this.battle);
      /* 보강 1: 화염방사 화상 10% 같은 부가효과는 발동 확률만큼만 */
      if (score !== MOVE_USELESS_SCORE) score = MOVE_BASE_SCORE + (score - MOVE_BASE_SCORE) * effectScale(this.move);
      score = handlers.applyGeneralMoveAgainstTargetScoreModifiers(score, this.move, this.user, this.target, this, this.battle);
    }
    const t = this.move.pbTarget(this.user);
    if (t.foe && !this.target.opposes(this.user) && this.target.index !== this.user.index) {
      if (score === MOVE_USELESS_SCORE) return -1;
      score = Math.trunc(1.85 * MOVE_BASE_SCORE - score);
    }
    return score;
  }

  /**
   * 원작 pbChooseMove — 한계선 아래는 버리고 남은 차이 비율로 고른다.
   * @returns { kind:'move', choice } | { kind:'switch', … } (쓸 기술이 다 나쁘면 교체 시도)
   */
  chooseMove(choices, request) {
    if (!choices.length) return { kind: 'move', choice: null, choices, threshold: 0 };
    const maxScore = Math.max(0, ...choices.map(c => c.score));
    if (this.trainer.highSkill() && this.user.canSwitchLax() && !request.active[0].trapped && !request.active[0].maybeTrapped) {
      let bad = false;
      if (maxScore <= MOVE_USELESS_SCORE) bad = true;
      else if (maxScore < MOVE_BASE_SCORE * this.moveScoreThreshold() && this.user.turnCount > 2) bad = this.rand(100) < 80;
      if (bad) {
        const sw = this.chooseToSwitchOut(true);
        if (sw) return { ...sw, reason: 'terrible_moves', choices, threshold: Math.floor(maxScore * this.moveScoreThreshold()) };
      }
    }
    const threshold = Math.floor(maxScore * this.moveScoreThreshold());
    for (const c of choices) c.weight = Math.max(c.score - threshold, 0);
    const total = choices.reduce((s, c) => s + c.weight, 0);
    let pick = choices[0];
    if (total > 0) {
      let r = this.rand(total);
      for (const c of choices) { r -= c.weight; if (r < 0) { pick = c; break; } }
    }
    return { kind: 'move', choice: pick, choices, threshold, total };
  }

  /* ---------- 원작 AI_Switch ---------- */
  /** 원작 pbChooseToSwitchOut — 교체할 거면 { kind:'switch', partyIndex | batonPass } */
  chooseToSwitchOut(terribleMoves = false, request = this.request) {
    if (!request || request.active?.[0]?.trapped || request.active?.[0]?.maybeTrapped) return null;
    if (this.trainer.highSkill()) {
      if (!this.eachFoeBattler(this.user.side).some(b => b.canAttack())) return null;
    }
    let reason = 'terrible_moves';
    if (!terribleMoves) {
      if (!this.trainer.hasSkillFlag('ConsiderSwitching')) return null;
      const reserves = this.reserves();
      if (!reserves.length) return null;
      reason = handlers.shouldSwitch(this.user, reserves, this, this.battle);
      if (reason && this.trainer.mediumSkill()) {
        const veto = handlers.shouldNotSwitch(this.user, reserves, this, this.battle);
        if (veto) { this.log.push({ kind: 'stay', reason: veto, wanted: reason }); reason = null; }
      }
      if (!reason) return null;
    }
    const idx = this.chooseBestReplacement(terribleMoves);
    if (!idx) return null;
    /* 원작처럼 바톤터치가 있으면 그것으로 빠진다 */
    const moves = request.active[0].moves;
    const baton = moves.findIndex(m => !m.disabled && m.pp !== 0 && new MoveData(this.gen, m.id).functionCode === 'SwitchOutUserPassOnEffects');
    if (baton >= 0) return { kind: 'move', choice: { index: baton, id: moves[baton].id, score: null, target: -1 }, reason, batonPass: true, to: idx.mon };
    return { kind: 'switch', mon: idx.mon, rating: idx.rating, reason, ratings: idx.ratings };
  }

  /** 원작 choose_best_replacement_pokemon — 엔진 포켓몬을 돌려준다 */
  chooseBestReplacement(terribleMoves = false) {
    const last = this.partyOrder[this.partyOrder.length - 1];
    let reserves = [];
    for (const p of this.partyOrder) {
      if (p === this.side.active[0] || p.fainted || p.hp <= 0) continue;
      /* 보강 4: 2마리 파티는 아낄 포켓몬밖에 없어 자발 교체가 통째로 막힌다 — 3마리 이상일 때만 */
      if (this.trainer.hasSkillFlag('ReserveLastPokemon') && p === last && this.partyOrder.length >= ENHANCE.reserveLastMinParty) {
        if (!terribleMoves || reserves.length > 0) continue;
      }
      reserves.push({ mon: p, rating: 100 });
      if (this.trainer.hasSkillFlag('UsePokemonInOrder') && reserves.length > 0) break;
    }
    if (!reserves.length) return null;
    for (const r of reserves) r.rating = this.rateReplacement(new PartyMon(this, { own: r.mon }), r.rating);
    reserves.sort((a, b) => b.rating - a.rating);
    if (this.trainer.highSkill() && !terribleMoves && reserves[0].rating < 100) return null;
    return { mon: reserves[0].mon, rating: reserves[0].rating, ratings: reserves.map(r => ({ name: r.mon.name, rating: r.rating })) };
  }
  /** 쓰러져서 내보낼 때 — 원작 pbDefaultChooseNewEnemy (아껴 둔 포켓몬도 마지막엔 낸다) */
  chooseForcedReplacement() {
    const r = this.chooseBestReplacement(true);
    return r;
  }

  /** 원작 rate_replacement_pokemon */
  rateReplacement(pkmn, score) {
    const hazard = this.calculateEntryHazardDamage(pkmn, 0);
    if (hazard >= pkmn.hp) score -= 50;
    else if (hazard > 0) score -= 50 * hazard / pkmn.hp;
    if (!pkmn.hasItem('heavydutyboots') && !this.pokemonAirborne(pkmn)) {
      if (this.sides[0].ToxicSpikes > 0 && this.pokemonCanBePoisoned(pkmn)) score -= 20;
      if (this.sides[0].StickyWeb) score -= 15;
    }
    for (const b of this.eachFoeBattler(this.user.side)) {
      if (!b.lastMoveUsed) continue;
      const md = this.gen.moves.get(b.lastMoveUsed);
      if (!md.exists || md.category === 'Status') continue;
      score -= md.basePower * effectiveness(this.gen, md.type, pkmn.types) / 5;
    }
    for (const m of pkmn.moves) {
      if (m.power === 0 || (m.pp === 0 && m.totalPp > 0)) continue;
      for (const b of this.eachFoeBattler(this.user.side)) {
        if (this.pokemonCanAbsorbMove(b, m, m.type)) continue;
        score += m.power * effectiveness(this.gen, m.type, b.pbTypes()) / 10;
      }
    }
    const pos = this.positionEffects(0);
    if (pos.Wish > 0 && pkmn.totalhp - pkmn.hp > pos.WishAmount * 2 / 3) score += 20 * Math.min(pkmn.totalhp - pkmn.hp, pos.WishAmount) / pkmn.totalhp;
    if (this.user.effects.PerishSong === 1) score += 20;
    /* 보강 5: 이 포켓몬이 지금 상대에게 주는 피해와 받는 피해 */
    score += matchupBonus(this, pkmn);
    return score;
  }
  /** 원작 calculate_entry_hazard_damage */
  calculateEntryHazardDamage(pkmn, side) {
    if (pkmn.hasAbility('magicguard') || pkmn.hasItem('heavydutyboots')) return 0;
    let ret = 0;
    const s = this.sides[side];
    if (s.StealthRock) {
      const eff = effectiveness(this.gen, 'Rock', pkmn.types);
      if (eff > 0) ret += pkmn.totalhp * eff / 8;
    }
    if (s.Spikes > 0 && !this.pokemonAirborne(pkmn)) ret += pkmn.totalhp / [8, 6, 4][s.Spikes - 1];
    return Math.floor(ret);
  }
}

Object.assign(ArAI.prototype, GENERIC);
