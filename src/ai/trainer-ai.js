/**
 * 트레이너 AI 레이어 — 직접 만들어야 하는 유일한 부분. (SPEC §5.2)
 *
 * 엔진(@pkmn/sim)이 "이 수를 두면 결과가 이렇다"를 계산하고,
 * 이 레이어는 "어떤 수를 둘까"만 담당한다. 두 레이어는 절대 섞지 않는다.
 *
 * 점수식은 프로토타입(trainer_sim_v2.html)에서 검증된 것을 그대로 옮겼다.
 *   공격기 = 상성뺀_기대데미지% × 체감상성 × 스타일가중치 (+42 KO 보너스)
 *   기점기 = (배율−1) × 최대타 × 남은턴 − 이번턴_손해
 *   교체   = (위험도 − 임계값) × 30 + (현재피해 − 벤치피해) × 0.42
 */
import {
  bestDamagePct,
  curve,
  hpPct,
  neutralDamagePct,
  realDamagePct,
  selfBoostsOf,
  shortfallEffect,
  stageMul,
  typeEff,
} from './estimate.js';

/** 재현 가능한 시뮬을 위한 소형 PRNG (mulberry32) */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KO_BONUS = 42;
const MAX_STAT = 20;

export class TrainerAI {
  constructor({ gen, name, stats, style, styleVec, rng = Math.random }) {
    this.gen = gen;
    this.name = name;
    this.stats = stats;
    this.style = style;
    this.sty = styleVec;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.shock = 0;       // 아군이 쓰러진 직후 남은 동요 턴 수
    this.justSwitched = false;
  }

  /** 아군이 쓰러졌다 — 멘탈 스탯이 작동할 구간을 연다 */
  onFaint() {
    this.shock = 2;
  }

  /** 턴 종료 정리 */
  endTurn(switched) {
    this.shock = Math.max(0, this.shock - 1);
    this.justSwitched = switched;
  }

  gauss() {
    let u = 0;
    let v = 0;
    while (!u) u = this.rng();
    while (!v) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * 판단력·집중력·멘탈이 합쳐진 softmax 온도. 낮을수록 최적수에 가깝다.
   * 원 스탯이 아니라 curve() 통과값을 쓴다 (SPEC §4.2, v3) — 20을 기준점으로
   * 상단 구간(17~20) 차이를 벌리고, 20 초과(네임드용)는 계속 이득이 붙는다.
   */
  temperature(turn) {
    const s = this.stats;
    const j = curve(s.judge);
    const fo = curve(s.focus);
    const me = curve(s.mental);
    let T = 1.2 + shortfallEffect(MAX_STAT - j, 0.62);
    const settled = fo / 2;
    /* 두 배율 다 max(0, ...)로 묶는다 — curve()로 20을 크게 넘는 네임드는 원 공식대로면
       배율이 음수로 뒤집혀 "멘탈이 좋을수록 동요 시 더 나쁜 수를 고른다"는 역설이 생긴다.
       0에서 멈추면 최악의 경우 "동요를 완전히 무시한다"가 되어 의도와 맞는다. */
    if (turn > settled) {
      const fatigue = 1 + (turn - settled) * ((MAX_STAT + 1 - fo) * 0.035 + 0.02);
      T *= Math.max(0, fatigue);
    }
    if (this.shock > 0) {
      const rattled = 1 + (MAX_STAT - me) * 0.07 * this.shock;
      T *= Math.max(0, rattled);
    }
    return Math.max(0.12, T);
  }

  /**
   * 지식 스탯 — 상성 판정에 노이즈를 얹는다. 낮으면 0배/4배를 오판한다.
   * curve() 초과분(20 넘는 네임드용 수치)은 오판 억제 효과가 완만하게 이어지도록
   * 기울기를 .075→.03으로 낮춘다 — 계속 좋아지되 체감 한계가 있다는 뜻.
   */
  perceive(trueEff) {
    const k = curve(this.stats.know);
    const n = (MAX_STAT - k) * (k < MAX_STAT ? 0.075 : 0.03);
    if (n <= 0) return trueEff;
    if (trueEff === 0) return Math.min(1.2, Math.abs(this.gauss()) * n * 1.4);
    return Math.max(0, trueEff * (1 + this.gauss() * n));
  }

  softmaxPick(scores, T) {
    const max = Math.max(...scores);
    const exps = scores.map((v) => Math.exp((v - max) / Math.max(0.05, T)));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((v) => v / sum);
    let r = this.rng();
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r <= acc) return { index: i, probs };
    }
    return { index: probs.length - 1, probs };
  }

  /* ---------------- 행동 선택 ---------------- */

  /**
   * 일반 턴의 행동 결정.
   * @returns {{choice: string, think: string|null}}
   */
  chooseAction(battle, sideId) {
    const gen = this.gen;
    const side = battle[sideId];
    const foeSide = battle[sideId === 'p1' ? 'p2' : 'p1'];
    const request = side.activeRequest;
    const me = side.active[0];
    const foe = foeSide.active[0];
    const active = request.active[0];

    const opts = [];

    /* 남은 턴 추정 — 기점기의 가치는 "앞으로 몇 턴이나 써먹느냐"로 결정된다.
       1턴만 보는 탐욕적 점수를 쓰면 기점기가 구조적으로 저평가되어 절대 선택되지 않는다. */
    const myBest = bestDamagePct(gen, me, foe);
    const foeBest = bestDamagePct(gen, foe, me);
    const turnsToKO = myBest > 0 ? Math.ceil(hpPct(foe) / myBest) : 9;
    const turnsSurvive = foeBest > 0 ? Math.ceil(hpPct(me) / foeBest) : 9;
    const R = Math.max(0, Math.min(turnsToKO, turnsSurvive, 6));

    active.moves.forEach((rm, i) => {
      if (rm.disabled) return;
      const move = gen.moves.get(rm.id);
      if (!move) return;
      opts.push({
        kind: 'move',
        label: move.name, // 영문 id 그대로. 한글 변환은 표시 레이어의 몫이다.
        choice: `move ${i + 1}`,
        score: this.scoreMove(move, me, foe, { myBest, R, turnsSurvive, turnsToKO }),
      });
    });

    if (!active.trapped && !active.maybeTrapped) {
      for (const opt of this.switchOptions(battle, sideId)) {
        const bench = side.pokemon[opt.slot - 1];
        opts.push({
          kind: 'switch',
          label: bench.name,
          choice: `switch ${opt.slot}`,
          score: this.scoreSwitch(me, foe, bench),
        });
      }
    }

    if (!opts.length) return { choice: 'default', think: null };

    const T = this.temperature(battle.turn);
    const { index, probs } = this.softmaxPick(opts.map((o) => o.score), T);
    return {
      choice: opts[index].choice,
      think: this.formatThink(T, opts, probs),
    };
  }

  scoreMove(move, me, foe, ctx) {
    const gen = this.gen;
    const sty = this.sty;

    if (move.category !== 'Status') {
      /* 상성을 뺀 맨몸 데미지에 "체감" 상성을 곱한다 — 이 순서를 뒤집으면 지식 스탯이 죽는다 */
      const trueEff = typeEff(gen, move.type, foe.getTypes());
      const felt = this.perceive(trueEff);
      const adj = neutralDamagePct(me, foe, move) * felt;
      let score = adj * (move.category === 'Physical' ? sty.phys : sty.spec);
      if (adj >= hpPct(foe)) score += KO_BONUS;
      return score;
    }

    /* 고스트 저주: 랭크업기가 아니라 자기 HP 절반을 태워 상대에게 턴당 25% 도트 */
    if (move.id === 'curse' && me.getTypes().includes('Ghost')) {
      if (foe.volatiles?.curse || me.hp <= me.maxhp / 2) return -40;
      const foeBest = bestDamagePct(gen, foe, me);
      const survAfter = foeBest > 0 ? Math.ceil((hpPct(me) - 50) / foeBest) : 9;
      const ticks = Math.max(0, Math.min(survAfter, ctx.turnsToKO, 5));
      return (25 * ticks - ctx.myBest) * sty.status;
    }

    /* 능력치 상승기: (배율−1) × 최대타 × 남은턴 − 이번 턴 손해 */
    const boosts = selfBoostsOf(move);
    const key = boosts
      ? Object.keys(boosts).find((k) => (k === 'atk' || k === 'spa') && boosts[k] > 0)
      : null;
    if (!key || ctx.R <= 1) return -25;
    if (ctx.turnsSurvive <= 1) return -40; // 이번 턴에 죽을 것 같으면 세팅 금지

    const cur = me.boosts[key] || 0;
    const next = Math.min(6, cur + boosts[key]);
    const mult = stageMul(next) / stageMul(cur);
    return (ctx.myBest * (mult - 1) * (ctx.R - 1) - ctx.myBest) * sty.status;
  }

  scoreSwitch(me, foe, bench) {
    const gen = this.gen;
    let incMe = 0;
    let incBench = 0;
    for (const slot of foe.moveSlots) {
      const mv = gen.moves.get(slot.id);
      if (!mv || mv.category === 'Status') continue;
      incMe = Math.max(incMe, realDamagePct(gen, foe, me, mv));
      incBench = Math.max(incBench, realDamagePct(gen, foe, bench, mv));
    }
    const feltMe = this.perceive(incMe / 100) * 100;
    const feltBench = this.perceive(incBench / 100) * 100;

    const risk = feltMe / Math.max(1, hpPct(me));
    const threshold = 0.85 + (MAX_STAT - curve(this.stats.ops)) * 0.06;

    let score = (risk - threshold) * 30 + (feltMe - feltBench) * 0.42;
    score *= this.sty.sw;
    if (this.justSwitched) score -= 26;
    return score;
  }

  /** 쓰러져서 강제로 내보내야 할 때 — 누구를 내보낼지도 판단력이 관여한다 */
  chooseForcedSwitch(battle, sideId) {
    const side = battle[sideId];
    const foe = battle[sideId === 'p1' ? 'p2' : 'p1'].active[0];
    const opts = this.switchOptions(battle, sideId).map((opt) => {
      const bench = side.pokemon[opt.slot - 1];
      let score = 0;
      if (foe) {
        const out = bestDamagePct(this.gen, bench, foe);
        const inc = bestDamagePct(this.gen, foe, bench);
        score = this.perceive(out / 100) * 100 - this.perceive(inc / 100) * 100 * 0.8;
      }
      return { kind: 'switch', label: `→${bench.name}`, choice: `switch ${opt.slot}`, score };
    });

    if (!opts.length) return { choice: 'default', think: null };
    const T = this.temperature(battle.turn);
    const { index, probs } = this.softmaxPick(opts.map((o) => o.score), T);
    return { choice: opts[index].choice, think: this.formatThink(T, opts, probs) };
  }

  switchOptions(battle, sideId) {
    const request = battle[sideId].activeRequest;
    const out = [];
    request.side.pokemon.forEach((p, i) => {
      if (p.active) return;
      if (/ fnt$/.test(p.condition) || p.condition === '0 fnt') return;
      out.push({ slot: i + 1 });
    });
    return out;
  }

  /** 판단 근거 — 구조화된 데이터만 뱉는다. 문자열 조립/번역은 표시 레이어가 한다. */
  formatThink(T, opts, probs) {
    return {
      trainer: this.name,
      temperature: T,
      options: opts.map((o, i) => ({ kind: o.kind, label: o.label, prob: probs[i] })),
    };
  }
}
