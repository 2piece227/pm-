/**
 * 배틀 구동기 — 엔진과 AI를 잇는 얇은 층.
 *
 * 엔진: @pkmn/sim (난수·급소·명중·랭크·다단히트·특성·도구·상태이상·우선도 전부 구현돼 있다)
 * AI  : src/ai/trainer-ai.js
 *
 * 출력은 표시 로직을 전혀 포함하지 않는다. 프로토콜 로그 + 통계만 뱉고,
 * 텍스트로 뿌릴지 애니메이션으로 재생할지는 표시 레이어가 결정한다. (SPEC §1-3)
 */
import { Battle, Dex, Teams } from '@pkmn/sim';
import { TrainerAI, makeRng } from '../ai/trainer-ai.js';
import { STYLES } from '../data/styles.js';

const GEN = Dex.forGen(9);
const SIDES = ['p1', 'p2'];

export function createTrainerAI(def, style, rng) {
  return new TrainerAI({
    gen: GEN,
    name: def.name,
    stats: def.stats,
    style,
    styleVec: STYLES[style] || STYLES['균형형'],
    policy: def.battlePolicy,
    compliance: def.nature?.compliance,
    rng,
  });
}

/**
 * 배틀 1회 실행.
 * @returns {{winner:'p1'|'p2'|null, turns:number, log:string[], think:object[], stats:object}}
 */
export function runBattle({ trainerA, trainerB, teamA, teamB, seed, collectThink = false, initialState = null }) {
  const rngSeed = seed ?? Math.floor(Math.random() * 0x7fffffff);
  const battle = new Battle({
    formatid: 'gen9customgame',
    seed: [rngSeed & 0xffff, (rngSeed >> 8) & 0xffff, (rngSeed >> 16) & 0xffff, rngSeed & 0xff],
  });

  /* 승자 판정이 이름 비교라 두 이름이 같으면 안 된다 */
  const nameA = trainerA.name;
  const nameB = trainerB.name === nameA ? `${trainerB.name} (2)` : trainerB.name;
  battle.setPlayer('p1', { name: nameA, team: Teams.pack(Teams.import(teamA)) });
  battle.setPlayer('p2', { name: nameB, team: Teams.pack(Teams.import(teamB)) });

  // Keep original identity/order: Showdown swaps side.pokemon on every switch.
  const originalParty = Object.fromEntries(SIDES.map(side => [side, [...battle[side].pokemon]]));
  for (const side of SIDES) for (const [i, p] of originalParty[side].entries()) {
    const state = initialState?.[side]?.[i];
    if (!state) continue;
    if (Number.isFinite(state.hp)) p.hp = Math.max(1, Math.min(p.maxhp, state.hp));
    if (state.status) p.setStatus(state.status, p, null, true);
    for (const slot of p.moveSlots) if (Number.isFinite(state.pp?.[slot.id])) {
      slot.pp = Math.max(0, Math.min(slot.maxpp, state.pp[slot.id]));
    }
  }
  const stateOf = p => ({ species: p.set.species, hp: p.hp, maxhp: p.maxhp, fainted: !!p.fainted,
    status: p.status, pp: Object.fromEntries(p.moveSlots.map(m => [m.id, m.pp])) });
  const hpBefore = Object.fromEntries(SIDES.map(side => [side, originalParty[side].map(stateOf)]));

  const ai = { p1: trainerA, p2: trainerB };
  trainerA.reset();
  trainerB.reset();

  const think = [];
  const fainted = { p1: 0, p2: 0 };
  // 계측: 기점기(랭크업)를 실제로 선택했는지 — SPEC §8-(1)의 핵심 지표
  const setupUsed = { p1: 0, p2: 0 };
  const switches = { p1: 0, p2: 0 };

  let guard = 0;
  while (!battle.ended && guard++ < 400) {
    const choices = { p1: 'default', p2: 'default' };
    const switchedThisTurn = { p1: false, p2: false };

    for (const side of SIDES) {
      const req = battle[side].activeRequest;
      if (!req || req.wait) {
        choices[side] = '';
        continue;
      }
      if (req.teamPreview) {
        choices[side] = 'default';
        continue;
      }
      if (req.forceSwitch) {
        const d = ai[side].chooseForcedSwitch(battle, side);
        choices[side] = d.choice;
        if (collectThink && d.think) think.push({ turn: battle.turn, side, think: d.think });
        continue;
      }
      const d = ai[side].chooseAction(battle, side);
      choices[side] = d.choice;
      if (collectThink && d.think) think.push({ turn: battle.turn, side, think: d.think });

      if (d.choice.startsWith('switch')) {
        switchedThisTurn[side] = true;
        switches[side]++;
      } else if (d.choice.startsWith('move')) {
        const idx = Number(d.choice.split(' ')[1]) - 1;
        const rm = req.active[0].moves[idx];
        const mv = rm && GEN.moves.get(rm.id);
        if (mv && mv.category === 'Status' && mv.boosts && mv.target === 'self') {
          setupUsed[side]++;
        }
      }
    }

    battle.makeChoices(choices.p1, choices.p2);

    /* 쓰러진 개체 수가 늘었으면 멘탈 스탯이 작동할 구간을 연다 */
    for (const side of SIDES) {
      const n = battle[side].pokemon.filter((p) => p.fainted).length;
      if (n > fainted[side]) ai[side].onFaint();
      fainted[side] = n;
      ai[side].endTurn(switchedThisTurn[side]);
    }
  }

  /* 동시 기절(까칠한피부 반동 등)은 엔진이 규칙대로 승자를 정한다 — 직접 판정하면 무승부로 새어나간다 */
  const winner =
    battle.winner === battle.p1.name ? 'p1' : battle.winner === battle.p2.name ? 'p2' : null;

  /* 끝난 뒤 양쪽 파티의 남은 체력 — 탐험에서 "센터에 들렀다"를 판단하는 데 쓴다 */
  const hpAfter = {};
  for (const side of SIDES) {
    hpAfter[side] = originalParty[side].map(stateOf);
  }

  return {
    winner,
    turns: battle.turn,
    log: battle.log.slice(),
    think,
    stats: { setupUsed, switches },
    hpAfter,
    hpBefore,
  };
}

/** N회 반복 시뮬 — 밸런스 튜닝용 (SPEC §8) */
export function runBulk({ trainerA, trainerB, teamA, teamB, count = 100, seed = 1 }) {
  const acc = {
    count,
    p1: 0,
    p2: 0,
    draw: 0,
    totalTurns: 0,
    setupUsed: { p1: 0, p2: 0 },
    switches: { p1: 0, p2: 0 },
    battlesWithSetup: { p1: 0, p2: 0 },
  };

  for (let i = 0; i < count; i++) {
    const r = runBattle({ trainerA, trainerB, teamA, teamB, seed: seed + i * 7919 });
    if (r.winner === 'p1') acc.p1++;
    else if (r.winner === 'p2') acc.p2++;
    else acc.draw++;
    acc.totalTurns += r.turns;
    for (const s of SIDES) {
      acc.setupUsed[s] += r.stats.setupUsed[s];
      acc.switches[s] += r.stats.switches[s];
      if (r.stats.setupUsed[s] > 0) acc.battlesWithSetup[s]++;
    }
  }

  acc.avgTurns = acc.totalTurns / count;
  return acc;
}

export { makeRng, GEN };
