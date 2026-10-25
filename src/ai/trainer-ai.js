/**
 * 트레이너 AI — 어나더레드(Pokémon Essentials v21.1 + Gen9 팩) 배틀 AI를 이 게임에 붙인 자리.
 *
 * 엔진(@pkmn/sim)이 "이 수를 두면 결과가 이렇다"를 계산하고, 이 레이어는 "어떤 수를 둘까"만 정한다.
 * 판단 본체는 src/ai/ar/ (원작 코드를 함수 코드 단위로 옮긴 것). 여기서는
 *   - 엔진 요청 → 원작 AI 입력 (상대는 공개 정보만: OpponentModel)
 *   - 원작 AI 결정 → 엔진 선택 문자열 ('move N' / 'switch N')
 *   - 판단 근거 기록 (관전 로그·경기 분석)
 * 만 한다.
 *
 * 1단계: 모든 트레이너가 원작 최상 실력(100)으로 둔다. 실력 차이·성격 ±·포켓몬별 전술 지시는
 * 다음 단계에서 이 위에 얹는다 (지금 지시 중에서는 '금지 기술'만 지킨다).
 */
import { ArAI } from './ar/ai.js';
import { OpponentModel } from './opponent-model.js';

/** 재현 가능한 시뮬을 위한 소형 PRNG (mulberry32) */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => a;
  return rng;
}

/** 상대 공개 정보를 읽을 때의 인지 능력 — 1단계는 원작 AI처럼 놓치지 않는다 */
const FULL_COGNITION = { judge: 20, ops: 20, focus: 20, know: 20, mental: 20 };

export class TrainerAI {
  constructor({ gen, name, stats, style, styleVec, policy = 'balanced', compliance = null, rng = Math.random, partyTactics = null, skill = 100 }) {
    this.gen = gen;
    this.name = name;
    this.stats = stats;
    this.style = style;
    this.sty = styleVec;
    this.policy = policy;
    this.compliance = compliance;
    this.rng = rng;
    this.partyTactics = partyTactics || [];
    this.core = new ArAI({ gen, rng, skill, name });
    this.tacticsByMon = new Map();
    this.party = null;
    this.reset();
  }

  /** 배틀 시작 시 원래 팀 순서의 엔진 포켓몬과 지시를 짝짓는다 (마지막 = 원작이 아껴 두는 포켓몬) */
  bindParty(pokemon, foeTeamSize = null) {
    this.party = pokemon;
    this.tacticsByMon = new Map(pokemon.map((p, i) => [p, this.partyTactics[i] || {}]));
    this.foeTeamSize = foeTeamSize;
  }
  tacticFor(p) { return this.tacticsByMon.get(p) || {}; }
  /** 메가진화 담당: 파티에 담당이 있으면 그 포켓몬만 (원작은 가능하면 바로 메가진화한다) */
  megaAllowedFor(p) {
    const anyDesignated = this.partyTactics.some(t => t?.mega);
    return !anyDesignated || !!this.tacticFor(p).mega;
  }

  reset() { this.opponent = new OpponentModel(); }
  onFaint() {}
  observeOutcome() {}
  endTurn() {}

  /** 상대 쪽 공개 정보 묶음 */
  foeInfo(battle, foeSideId) {
    const pub = this.opponent.public;
    pub.scan(battle.log);
    const current = pub.current(foeSideId);
    const records = [...pub.records.values()].filter(r => r.key.startsWith(foeSideId));
    const fainted = battle.log.filter(l => l.startsWith(`|faint|${foeSideId}`)).length;
    const teamSize = this.foeTeamSize ?? (records.length || 1);
    const remaining = Math.max(0, teamSize - fainted - (current && current.ratio > 0 ? 1 : 0));
    const benches = records.filter(r => r !== current && r.ratio > 0 && !r.transformed);
    return { record: current, benches, remaining, teamSize };
  }

  prepare(battle, sideId) {
    const foeSideId = sideId === 'p1' ? 'p2' : 'p1';
    const foe = this.opponent.view(battle, foeSideId, this.gen, FULL_COGNITION, this.rng);
    const info = this.foeInfo(battle, foeSideId);
    this.core.request = battle[sideId].activeRequest;
    this.core.setUp(battle, sideId, foe, info, this.party);
    return foe;
  }

  /**
   * 일반 턴의 행동 결정 (원작 pbDefaultChooseEnemyCommand).
   * @returns {{choice: string, think: object|null}}
   */
  chooseAction(battle, sideId) {
    const side = battle[sideId];
    const request = side.activeRequest;
    const foe = this.prepare(battle, sideId);
    if (!foe) return { choice: 'default', think: null };
    const core = this.core;
    /* 1) 교체할 이유가 있나 */
    let decision = core.chooseToSwitchOut(false, request);
    let choices = [];
    /* 2) 기술 점수 → 한계선 → 고르기 (다 나쁘면 교체 재시도) */
    if (!decision) {
      choices = core.getMoveScores(request);
      /* 전술 지시 '금지' 기술은 후보에서 뺀다 (다 금지면 그대로) */
      const mine = this.tacticFor(side.active[0]);
      const allowed = choices.filter(c => mine.moves?.[c.id] !== 'ban');
      if (allowed.length && allowed.length < choices.length) choices = allowed;
      decision = core.chooseMove(choices, request);
    }
    return this.finish(decision, choices, side, battle);
  }

  finish(decision, choices, side, battle) {
    const core = this.core;
    let choice = 'default';
    if (decision?.kind === 'switch') choice = `switch ${side.pokemon.indexOf(decision.mon) + 1}`;
    else if (decision?.choice) choice = `move ${decision.choice.index + 1}`;
    const total = choices.reduce((s, c) => s + (c.weight || 0), 0);
    const options = choices.map(c => {
      const m = core.moveData(c.id);
      return { kind: 'move', label: m.name, moveId: m.id, score: c.score, prob: total ? (c.weight || 0) / total : 0,
        category: m.category, accuracy: m.accuracy || 100, basePower: m.power, functionCode: m.functionCode,
        role: m.healingMove() ? 'heal' : m.damagingMove() ? 'attack' : m.statUp.length && m.target === 'User' ? 'setup' : 'status',
        typeEffect: m.damagingMove() && core.battlers[1] && !core.battlers[1].fainted ? core.battlers[1].effectivenessOfTypeAgainstBattler(m.pbCalcType(core.user), core.user, m) : null };
    });
    let selected = decision?.choice ? choices.indexOf(decision.choice) : -1;
    if (decision?.kind === 'switch') {
      options.push({ kind: 'switch', label: decision.mon.name, score: Math.round(decision.rating ?? 0), prob: 1, reason: decision.reason, safer: true });
      selected = options.length - 1;
      for (const o of options) if (o.kind === 'move') o.prob = 0;
    }
    return {
      choice,
      think: {
        trainer: this.name, ai: 'anotherred', skill: core.trainer.skill,
        threshold: decision?.threshold ?? null, temperature: 0,
        options, selected, reason: decision?.reason || null, batonPass: !!decision?.batonPass,
        stay: core.log.find(l => l.kind === 'stay') || null,
        knowledge: core.battlers[1]?.knowledge || null,
      },
    };
  }

  /** 쓰러져서 내보낼 때 — 원작 pbDefaultChooseNewEnemy */
  chooseForcedSwitch(battle, sideId) {
    const side = battle[sideId];
    this.prepare(battle, sideId);
    const r = this.core.chooseForcedReplacement();
    if (!r) return { choice: 'default', think: null };
    return {
      choice: `switch ${side.pokemon.indexOf(r.mon) + 1}`,
      think: { trainer: this.name, ai: 'anotherred', forced: true, temperature: 0, selected: Math.max(0, r.ratings.findIndex(x => x.name === r.mon.name)),
        options: r.ratings.map(x => ({ kind: 'switch', label: x.name, score: Math.round(x.rating), prob: x.name === r.mon.name ? 1 : 0 })) },
    };
  }
}
