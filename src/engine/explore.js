/**
 * 탐험 — 지도에서 고른 곳으로 트레이너를 보내 **포켓몬을 잡거나 NPC와 싸운다.** (기획서 §3.10 / §6.3)
 *
 * 하루 6~10회 활동을 순서대로 처리해 결과가 글로 돌아온다. 관전은 없다:
 *   "1번도로에서 구구 Lv3을 잡았다" / "소년 지훈에게 이겼다 — 상금 48" /
 *   "파이리가 레벨 6이 되었다" / "체력이 부족해 포켓몬센터에 들렀다"
 *
 * 배틀은 실제 엔진(@pkmn/sim)으로 돌린다 — 결과만 안 보여줄 뿐이다.
 * 연패는 실력을 깎는다. 멘탈이 높을수록 덜 깎이고 빨리 회복한다 (§4.5).
 */
import { locationById, TRAINER_CLASSES } from '../data/routes.js';
import { createPokemon, gainExp, toShowdownBlock, partyToTeam, realStats } from '../data/pokemon.js';
import { SPECIES_KO, MOVE_KO, ko, iGa, eulReul, eunNeun, euro, numIGa } from '../data/ko.js';
import { STAT_KEYS, effectiveStats } from '../data/agencies.js';
import { createTrainerAI, runBattle } from './run-battle.js';
import { curve } from '../ai/estimate.js';
import { fieldState, healParty, partyCondition } from './field-state.js';

export const EXPLORE_CONFIG = {
  day: { min: 6, max: 10, default: 8 },
  /* 포획 — 원작처럼 종별 포획률 대신, 레벨 차이와 파티 강함으로 대신한다 (1차 근사) */
  catch: {
    base: 0.55,          // 같은 레벨일 때
    perLevelDiff: 0.05,  // 내 파티 최고 레벨 − 야생 레벨, 한 레벨당
    min: 0.12,
    max: 0.92,
    expOnCatch: 0.6,     // 잡으면 그 야생의 경험치 60%
  },
  /* 경험치 — 원작 공식을 단순화: 상대 레벨 × 계수 */
  exp: { wildPerLevel: 22, trainerPerLevel: 34, lossPerLevel: 6 },
  /* 센터 — 파티 체력이 이 아래로 떨어지면 들른다 */
  center: { visitBelow: 0.5 },
  /* 연패 페널티 (§4.5) — 멘탈이 낮을수록 세게, 오래 간다 */
  streak: { perLoss: 0.9, cap: 6, recoverOnWin: 0.5, mentalSoftens: 0.06 },
  /* 야생 배틀에서 트레이너가 AI 판단에 쓰는 "야생" 쪽 스탯 */
  wildStats: { judge: 4, ops: 2, focus: 6, know: 3, mental: 8 },
};

/* ---------------- 유틸 ---------------- */

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const weighted = (rng, list) => {
  const total = list.reduce((a, w) => a + (w.rate || 1), 0);
  let r = rng() * total;
  for (const w of list) { r -= (w.rate || 1); if (r <= 0) return w; }
  return list[list.length - 1];
};
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const topLevel = (party) => Math.max(1, ...(party || []).map((m) => m.level));
const K = (s) => ko(SPECIES_KO, s);

/** NPC 트레이너의 실력 — 도로 레벨대에서 대충 따라간다 */
function npcStats(level) {
  const base = 5 + level / 5;
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.min(18, base);
  return out;
}

/* ---------------- 연패 (§4.5) ---------------- */

/**
 * 졌을 때: 멘탈이 낮을수록 실력이 더 깎인다.
 * mentalDebuff는 effectiveStats()에서 전 스탯에 빠진다.
 */
export function applyLoss(trainer) {
  const c = EXPLORE_CONFIG.streak;
  trainer.lossStreak = (trainer.lossStreak || 0) + 1;
  const mental = curve(trainer.stats.mental);
  const hit = c.perLoss * Math.max(0.3, 1 - mental * c.mentalSoftens);
  trainer.mentalDebuff = Math.min(c.cap, (trainer.mentalDebuff || 0) + hit);
  return hit;
}

export function applyWin(trainer) {
  const c = EXPLORE_CONFIG.streak;
  trainer.lossStreak = 0;
  const mental = curve(trainer.stats.mental);
  trainer.mentalDebuff = Math.max(0, (trainer.mentalDebuff || 0) - c.recoverOnWin * (0.6 + mental * 0.04));
}

/* ---------------- 배틀 ---------------- */

/** 실제 엔진으로 한 판. 결과는 승패 + 남은 체력만 쓴다 */
function fight(trainer, myParty, foe, foeParty, seed) {
  const me = createTrainerAI({ name: trainer.name, stats: effectiveStats(trainer) }, trainer.nature?.style || '균형형', rngFrom(seed));
  const them = createTrainerAI({ name: foe.name, stats: foe.stats }, '균형형', rngFrom(seed + 1));
  const r = runBattle({
    trainerA: me, trainerB: them,
    teamA: partyToTeam(myParty), teamB: partyToTeam(foeParty),
    seed, initialState: { p1: myParty.map(fieldState) },
  });
  myParty.forEach((mon, i) => { mon.fieldState = { ...r.hpAfter.p1[i], pp: { ...mon.fieldState?.pp, ...r.hpAfter.p1[i].pp } }; });
  return r;
}

/** 시드에서 난수 생성기 — run-battle의 makeRng와 같은 식이지만 순환 import를 피한다 */
function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

/* ---------------- 경험치 배분 ---------------- */

async function giveExp(trainer, amount, lines) {
  const party = trainer.party || [];
  if (!party.length) return;
  const each = Math.round(amount / party.length);
  lines.push(`파티 경험치 +${each}씩 획득.`);
  for (const mon of party) {
    const before = mon.level;
    const r = await gainExp(mon, each);
    if (r.levels) {
      lines.push(`${iGa(K(mon.species))} 레벨 ${numIGa(mon.level)} 되었다.`);
      for (const mv of r.learned) lines.push(`${eunNeun(K(mon.species))} ${eulReul(ko(MOVE_KO, mv))} 배웠다!`);
      /* 배운 기술 목록에 쌓아둔다 — 플레이어가 나중에 골라 쓴다 */
      mon.learned = [...new Set([...(mon.learned || []), ...r.learned])];
    }
  }
}

/* ---------------- 탐험 본체 ---------------- */

/**
 * 하루치 탐험을 굴린다.
 *
 * @param {object} game
 * @param {object} trainer
 * @param {string} locationId
 * @param {'catch'|'battle'} mode
 * @returns {Promise<{ lines: string[], won: boolean|null, caught: object|null, money: number }>}
 */
async function encounter(game, trainer, locationId, mode, slot) {
  const loc = locationById(locationId);
  const lines = [];
  const out = { lines, won: null, caught: null, money: 0, location: loc };
  if (!loc) { lines.push('갈 수 없는 곳이다.'); return out; }
  if (!trainer.party?.length) { lines.push('데리고 갈 포켓몬이 없다.'); return out; }

  const rng = game.rng;
  const seed = (game.seed ^ (game.day * 7919) ^ hashStr(trainer.id + locationId) ^ (slot * 104729)) >>> 0;


  /* 권장 레벨보다 한참 낮으면 위험하다고 알려준다 (막지는 않는다) */
  const myTop = topLevel(trainer.party);
  if (myTop + 4 < loc.level[0]) lines.push(`권장 레벨 ${loc.level[0]}~${loc.level[1]} — 지금 파티에는 벅차다.`);

  let battleResult = null;

  if (mode === 'catch') {
    if (!loc.wild.length) {
      lines.push('여기서는 야생 포켓몬이 나오지 않는다.');
      return out;
    }
    const w = weighted(rng, loc.wild);
    const level = between(rng, w.min, w.max);
    const wild = await createPokemon({ species: w.species, level, rng });
    lines.push(`야생 ${iGa(K(w.species))} 나타났다! (Lv${level})`);

    /* 먼저 한 판 붙어 약하게 만든다 — 실제 엔진 */
    const foe = { name: '야생', stats: EXPLORE_CONFIG.wildStats };
    battleResult = fight(trainer, trainer.party.filter(m => fieldState(m).hp > 0), foe, [wild], seed);
    const iWon = battleResult.winner === 'p1';

    if (!iWon) {
      lines.push(`${K(w.species)}에게 밀려 도망쳤다…`);
      out.won = false;
      applyLoss(trainer);
      await giveExp(trainer, level * EXPLORE_CONFIG.exp.lossPerLevel, lines);
    } else {
      const c = EXPLORE_CONFIG.catch;
      const p = Math.max(c.min, Math.min(c.max, c.base + (myTop - level) * c.perLevelDiff));
      if (rng() < p) {
        wild.caughtOnDay = game.day;
        wild.learned = [...wild.moves];
        out.caught = wild;
        lines.push(`${eulReul(K(w.species))} 잡았다! (Lv${level}) → 소속사 박스로 보냈다.`);
        await giveExp(trainer, level * EXPLORE_CONFIG.exp.wildPerLevel * c.expOnCatch, lines);
      } else {
        lines.push(`${eunNeun(K(w.species))} 볼에서 빠져나와 달아났다.`);
        await giveExp(trainer, level * EXPLORE_CONFIG.exp.wildPerLevel * 0.4, lines);
      }
      out.won = true;
      applyWin(trainer);
    }
  } else {
    /* 아직 안 이긴 NPC부터, 다 이겼으면 아무나 다시 */
    if (!loc.trainers.length) {
      lines.push('여기서는 싸울 트레이너가 없다.');
      return out;
    }
    trainer.beaten ??= {};
    const fresh = loc.trainers.filter((t) => !trainer.beaten[`${loc.id}:${t.name}`]);
    const npc = pick(rng, fresh.length ? fresh : loc.trainers);
    if (!fresh.length) lines.push('현지 트레이너와 재대결했다.');
    const cls = TRAINER_CLASSES[npc.cls] || { name: npc.cls, money: 16 };
    const npcLevel = Math.max(...npc.party.map(([, lv]) => lv));
    const foeParty = [];
    for (const [sp, lv] of npc.party) foeParty.push(await createPokemon({ species: sp, level: lv, rng }));

    lines.push(`${cls.name} ${iGa(npc.name)} 승부를 걸어왔다! (${npc.party.map(([sp, lv]) => `${K(sp)} Lv${lv}`).join(', ')})`);
    const foe = { name: `${cls.name} ${npc.name}`, stats: npcStats(npcLevel) };
    battleResult = fight(trainer, trainer.party.filter(m => fieldState(m).hp > 0), foe, foeParty, seed);
    const iWon = battleResult.winner === 'p1';

    if (iWon) {
      const money = cls.money * npcLevel;
      out.money = money;
      out.won = true;
      trainer.beaten[`${loc.id}:${npc.name}`] = true;
      trainer.record.wins = (trainer.record.wins || 0) + 1;
      lines.push(`${cls.name} ${npc.name}에게 이겼다! 상금 ${money.toLocaleString()}.`);
      applyWin(trainer);
      await giveExp(trainer, npcLevel * EXPLORE_CONFIG.exp.trainerPerLevel * npc.party.length, lines);
    } else {
      out.won = false;
      trainer.record.losses = (trainer.record.losses || 0) + 1;
      const hit = applyLoss(trainer);
      lines.push(`${cls.name} ${npc.name}에게 졌다… (${battleResult.turns}턴)`);
      if (trainer.lossStreak >= 2) {
        lines.push(`${trainer.lossStreak}연패. 자신감이 흔들린다 (실력 −${trainer.mentalDebuff.toFixed(1)}).`);
      }
      await giveExp(trainer, npcLevel * EXPLORE_CONFIG.exp.lossPerLevel, lines);
    }
  }

  out.hpBefore = battleResult?.hpBefore.p1;
  out.hpAfter = battleResult?.hpAfter.p1;
  out.turns = battleResult?.turns || 0;

  return out;
}

/** 문자열 → 32비트 해시 (시드용) */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A day is an activity budget; healing consumes exactly the same slot as an encounter. */
export async function explore(game, trainer, locationId, mode, { activities = EXPLORE_CONFIG.day.default, onActivity = async () => {} } = {}) {
  const location = locationById(locationId);
  const budget = Math.max(6, Math.min(10, Math.round(Number(activities) || 8)));
  const out = { location, lines: [`${trainer.name}: ${location?.name || '목적지'} 탐험을 시작했다.`],
    events: [], catches: [], money: 0, won: null, wins: 0, losses: 0, centers: 0, budget };
  if (!location || !trainer.party?.length || !['catch', 'battle', 'mixed'].includes(mode)) {
    out.lines.push('탐험할 장소·파티·활동을 확인해 주세요.'); return out;
  }
  const modes = mode === 'mixed' ? ['catch', 'battle'] : [mode];
  const available = modes.filter(m => m === 'catch' ? location.wild.length : location.trainers.length);
  if (!available.length) { out.lines.push('이 장소에서는 지정한 활동을 할 수 없습니다.'); return out; }
  let encounters = 0;
  for (let slot = 1; slot <= budget; slot++) {
    const before = trainer.party.map(fieldState);
    const health = partyCondition(trainer);
    let event;
    if (health.ratio < EXPLORE_CONFIG.center.visitBelow || health.fainted || health.status || health.exhausted) {
      const reason = health.fainted ? '쓰러진 포켓몬이 있어' : health.status ? '상태이상 치료가 필요해' : health.exhausted ? '기술 PP가 부족해' : '체력이 부족해';
      healParty(trainer);
      out.centers++;
      event = { kind: 'center', lines: [`${reason} 포켓몬센터에 들렀다. HP·상태이상·PP를 모두 회복했다. (활동 1회)`], money: 0 };
    } else {
      const kind = available[encounters++ % available.length];
      const r = await encounter(game, trainer, locationId, kind, slot);
      event = { kind, lines: r.lines, won: r.won, money: r.money, caught: r.caught, turns: r.turns,
        battleBefore: r.hpBefore, battleAfter: r.hpAfter };
      out.money += r.money;
      if (r.caught) out.catches.push(r.caught);
      if (r.won === true) out.wins++;
      if (r.won === false) out.losses++;
      out.won = r.won;
    }
    event.slot = slot;
    // Slots span 09:00–18:00; duration is a management abstraction, not battle turn time.
    event.time = `${String(9 + Math.floor((slot-1)*9/budget)).padStart(2,'0')}:${String(Math.floor(((slot-1)*540/budget)%60)).padStart(2,'0')}`;
    event.before = before;
    event.after = trainer.party.map(fieldState);
    out.events.push(event);
    out.lines.push(`[${event.time} · ${slot}/${budget}] ${event.lines.join(' ')}`);
    await onActivity(event, budget);
  }
  out.lines.push(`탐험 종료 — ${out.events.length}회 활동, ${out.wins}승 ${out.losses}패, 포획 ${out.catches.length}마리, 센터 ${out.centers}회, 상금 ${out.money}.`);
  return out;
}
