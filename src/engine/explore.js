/**
 * 탐험 — 지도에서 고른 곳으로 트레이너를 보내 **포켓몬을 잡거나 NPC와 싸운다.** (기획서 §3.10 / §6.3)
 *
 * 하루 6~8회 활동을 순서대로 처리해 결과가 글로 돌아온다. 관전은 없다:
 *   "1번도로에서 구구 Lv3을 잡았다" / "소년 지훈에게 이겼다 — 상금 48" /
 *   "파이리가 레벨 6이 되었다" / "체력이 부족해 포켓몬센터에 들렀다"
 *
 * 배틀은 실제 엔진(@pkmn/sim)으로 돌린다 — 결과만 안 보여줄 뿐이다.
 * 연패는 실력을 깎는다. 멘탈이 높을수록 덜 깎이고 빨리 회복한다 (§4.5).
 */
import { locationById, TRAINER_CLASSES } from '../data/routes.js';
import { createPokemon, gainExp, expFromFoe, toShowdownBlock, partyToTeam, realStats } from '../data/pokemon.js';
import { SPECIES_KO, MOVE_KO, ko, iGa, eulReul, eunNeun, euro, numIGa } from '../data/ko.js';
import { STAT_KEYS, effectiveStats } from '../data/agencies.js';
import { createTrainerAI, runBattle } from './run-battle.js';
import { curve } from '../ai/estimate.js';
import { fieldState, healParty, partyCondition } from './field-state.js';
import { bagOf, MANAGEMENT, evolvePokemon, evolutionOptions } from './pokemon-management.js';
import { outfitNpcTrainer } from './npc-loadout.js';
import { consumeBerries } from './shop.js';
import { recordBattle, addSteps } from './evolution.js';
import { SUPPLIES, BALL_KEYS, ballCount } from '../data/supplies.js';
import { CAPTURE_RATE } from '../data/items.gen.js';
import { SAFARI_RULES } from '../data/safari.js';
import { Dex } from '@pkmn/dex';
import { movePP } from './field-state.js';

export const EXPLORE_CONFIG = {
  day: { min: 6, max: 8, default: 6 },
  /* 포획 — 원작처럼 종별 포획률 대신, 레벨 차이와 파티 강함으로 대신한다 (1차 근사) */
  catch: {
    base: 0.55,          // 같은 레벨일 때
    perLevelDiff: 0.05,  // 내 파티 최고 레벨 − 야생 레벨, 한 레벨당
    min: 0.12,
    max: 0.92,
  },
  /* 경험치 — 이기면 원작 공식(expFromFoe), 지면 상대 레벨 × 계수의 위로 경험치 [임시값] */
  exp: { lossPerLevel: 6 },
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
  /* 컨디션은 패배로 무너진다 — 멘탈이 높을수록 덜 */
  trainer.fatigue = Math.min(100, (trainer.fatigue || 0) + MANAGEMENT.lossHit * Math.max(0.4, 1 - mental * 0.03));
  return hit;
}

export function applyWin(trainer) {
  const c = EXPLORE_CONFIG.streak;
  trainer.lossStreak = 0;
  const mental = curve(trainer.stats.mental);
  trainer.mentalDebuff = Math.max(0, (trainer.mentalDebuff || 0) - c.recoverOnWin * (0.6 + mental * 0.04));
  trainer.fatigue = Math.max(0, (trainer.fatigue || 0) - MANAGEMENT.winRecover);
}

/* ---------------- 배틀 ---------------- */

/** 실제 엔진으로 한 판. 결과는 승패 + 남은 체력만 쓴다 */
function fight(trainer, myParty, foe, foeParty, seed) {
  const me = createTrainerAI({ name: trainer.name, stats: effectiveStats(trainer), keyStone: trainer.keyStone, nature: trainer.nature, partyTactics: myParty.map(m => m.tactics) }, trainer.nature?.style || '균형형', rngFrom(seed));
  const them = createTrainerAI({ name: foe.name, stats: foe.stats }, '균형형', rngFrom(seed + 1));
  const r = runBattle({
    trainerA: me, trainerB: them,
    teamA: partyToTeam(myParty), teamB: partyToTeam(foeParty),
    seed, initialState: { p1: myParty.map(fieldState) },
  });
  myParty.forEach((mon, i) => { mon.fieldState = { ...r.hpAfter.p1[i], pp: { ...mon.fieldState?.pp, ...r.hpAfter.p1[i].pp } }; });
  consumeBerries(myParty, r.log);
  recordBattle(myParty, r.log, 'p1');
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

/** 쓰러뜨린 상대들로 원작 공식 경험치를 준다 — 받는 쪽 레벨마다 양이 다르다 */
async function giveFoeExp(trainer, foes, isTrainer, lines) {
  const party = trainer.party || [];
  if (!party.length) return;
  const gains = party.map(mon => foes.reduce((n, f) => n + expFromFoe(f, mon.level, { trainer: isTrainer }), 0));
  const lo = Math.min(...gains), hi = Math.max(...gains);
  lines.push(`파티 경험치 +${lo === hi ? lo : `${lo}~${hi}`} 획득.`);
  await applyExp(trainer, party.map((mon, i) => [mon, gains[i]]), lines);
}

async function giveExp(trainer, amount, lines) {
  const party = trainer.party || [];
  if (!party.length) return;
  const each = Math.round(amount / party.length);
  lines.push(`파티 경험치 +${each}씩 획득.`);
  await applyExp(trainer, party.map(mon => [mon, each]), lines);
}

async function applyExp(trainer, pairs, lines) {
  for (const [mon, each] of pairs) {
    const r = await gainExp(mon, each);
    if (r.levels) {
      lines.push(`${iGa(K(mon.species))} 레벨 ${numIGa(mon.level)} 되었다.`);
      for (const mv of r.learned) lines.push(`${eunNeun(K(mon.species))} ${eulReul(ko(MOVE_KO, mv))} 배웠다!`);
      /* 배운 기술 목록에 쌓아둔다 — 플레이어가 나중에 골라 쓴다 */
      mon.learned = [...new Set([...(mon.learned || []), ...r.learned])];
    }
  }
}

/* ---------------- 볼 · 포획 (원작 공식) ---------------- */

const WATER = /수로|바다|섬|호수|강|해변|연못/, CAVE = /동굴|터널|산|굴|챔피언로드/;
/** [임시값] 배틀로 약하게 만든 뒤 던질 때 남은 HP 비율 (퀵볼은 첫 턴이라 가득) */
const WEAKENED_HP = 0.25;

/** 9세대 볼 배율. 숫자 또는 {mod, rateAdd, hp} */
export function ballModifier(key, ctx) {
  const b = SUPPLIES[key]?.ball, sp = Dex.species.get(ctx.wild.species);
  if (typeof b === 'number') return { mod: b };
  switch (b) {
    case 'net': return { mod: sp.types.some(t => t === 'Water' || t === 'Bug') ? 3.5 : 1 };
    case 'dive': return { mod: WATER.test(ctx.loc?.name || '') ? 3.5 : 1 };
    case 'nest': return { mod: Math.max(1, (41 - ctx.wild.level) / 10) };
    case 'repeat': return { mod: ctx.owned.has(sp.baseSpecies || sp.name) ? 3.5 : 1 };
    case 'timer': return { mod: Math.min(4, 1 + (ctx.turns || 0) * 1229 / 4096) };
    case 'dusk': return { mod: CAVE.test(ctx.loc?.name || '') ? 3 : 1 };
    case 'quick': return { mod: 5, hp: 1 };
    case 'level': { const r = ctx.myTop / Math.max(1, ctx.wild.level); return { mod: r >= 4 ? 8 : r >= 2 ? 4 : r > 1 ? 2 : 1 }; }
    case 'lure': return { mod: WATER.test(ctx.loc?.name || '') ? 4 : 1 };
    case 'moon': return { mod: sp.evos.some(n => Dex.species.get(n).evoItem === 'Moon Stone') ? 4 : 1 };
    case 'love': return { mod: ctx.party.some(m => m.species === ctx.wild.species && m.gender && ctx.wild.gender && m.gender !== ctx.wild.gender) ? 8 : 1 };
    case 'heavy': { const w = sp.weightkg; return { mod: 1, rateAdd: w >= 300 ? 30 : w >= 200 ? 20 : w >= 100 ? 0 : -20 }; }
    case 'fast': return { mod: sp.baseStats.spe >= 100 ? 4 : 1 };
    default: return { mod: 1 };
  }
}

/** 5세대 이후 포획 공식 — 흔들림 4번 */
export function captureChance(rate, mod, hpFrac, statusBonus = 1) {
  const a = (3 - 2 * hpFrac) / 3 * rate * mod * statusBonus;
  if (a >= 255) return 1;
  const b = 65536 / Math.pow(255 / Math.max(1e-6, a), 0.1875);
  return Math.pow(b / 65536, 4);
}

/** 가방의 볼 중에서 고른다: 75% 이상 잡히는 가장 싼 볼, 없으면 가장 잘 잡히는 볼 */
function chooseBall(game, trainer, wild, loc, myTop, turns) {
  const bag = bagOf(trainer);
  const a = game.league.agencies.find(x => x.id === game.playerAgencyId);
  const owned = new Set([...(a?.box || []), ...(a?.roster || []).flatMap(t => t.party)].map(m => Dex.species.get(m.species).baseSpecies || m.species));
  const ctx = { wild, loc, myTop, turns, owned, party: trainer.party };
  const base = CAPTURE_RATE[wild.species] ?? CAPTURE_RATE[Dex.species.get(wild.species).baseSpecies] ?? 45;
  const opts = BALL_KEYS.filter(k => bag[k] > 0).map(k => {
    const m = ballModifier(k, ctx);
    const rate = Math.max(1, Math.min(255, base + (m.rateAdd || 0)));
    return { key: k, name: SUPPLIES[k].name, price: SUPPLIES[k].price, p: captureChance(rate, m.mod, m.hp ?? WEAKENED_HP) };
  });
  return opts.filter(o => o.p >= 0.75).sort((x, y) => x.price - y.price)[0] || opts.sort((x, y) => y.p - x.p || x.price - y.price)[0];
}

/* ---------------- 탐험 중 도구 사용 ---------------- */

const has = (bag, kind, pred = () => true) => Object.keys(SUPPLIES).filter(k => SUPPLIES[k].kind === kind && bag[k] > 0 && pred(SUPPLIES[k])).sort((x, y) => SUPPLIES[x].price - SUPPLIES[y].price);
const take = (bag, key) => { bag[key]--; return SUPPLIES[key]; };

/** 쓸 수 있는 도구가 있으면 하나 쓴다 (기력 회복 → 상태이상 → PP → HP). 없으면 null → 센터 */
function useFieldItem(trainer, health) {
  const bag = bagOf(trainer), party = trainer.party;
  const fs = party.map(m => { m.fieldState = fieldState(m); return m.fieldState; });
  /* 쓰러진 포켓몬 */
  const downIdx = fs.findIndex(s => s.hp <= 0);
  if (downIdx >= 0) {
    const key = has(bag, 'revive')[0];
    if (key) { const d = take(bag, key), s = fs[downIdx]; s.hp = Math.max(1, Math.floor(s.maxhp * d.hp)); s.status = '';
      return { key, text: `${K(party[downIdx].species)}에게 ${d.name} 사용 · 기력을 되찾았다! HP ${s.hp}` }; }
  }
  /* 상태이상 */
  const stIdx = fs.findIndex(s => s.hp > 0 && s.status);
  if (stIdx >= 0) {
    const st = fs[stIdx].status;
    const key = has(bag, 'cure', d => d.cures === 'all' || d.cures.includes(st)).sort((x, y) => Number(SUPPLIES[x].cures === 'all') - Number(SUPPLIES[y].cures === 'all'))[0]
      || has(bag, 'heal', d => d.cures === 'all')[0];
    if (key) { const d = take(bag, key); fs[stIdx].status = ''; if (d.kind === 'heal') fs[stIdx].hp = fs[stIdx].maxhp;
      return { key, text: `${K(party[stIdx].species)}에게 ${d.name} 사용 · 상태이상이 나았다` }; }
  }
  /* PP */
  const ppIdx = party.findIndex((m, i) => fs[i].hp > 0 && m.moves.every(mv => movePP(m, mv).current === 0));
  if (ppIdx >= 0) {
    const key = has(bag, 'pp')[0];
    if (key) { const d = take(bag, key), m = party[ppIdx];
      for (const mv of (d.all ? m.moves : [m.moves[0]])) { const id = Dex.moves.get(mv).id, max = movePP(m, mv).max; fs[ppIdx].pp[id] = d.pp === 'full' ? max : Math.min(max, (fs[ppIdx].pp[id] ?? max) + d.pp); }
      return { key, text: `${K(m.species)}에게 ${d.name} 사용 · PP를 회복했다` }; }
  }
  /* HP — 모자란 만큼에 가장 알맞은 회복약 */
  if (health.ratio < EXPLORE_CONFIG.center.visitBelow) {
    const alive = fs.map((s, i) => [s, i]).filter(([s]) => s.hp > 0).sort((x, y) => x[0].hp / x[0].maxhp - y[0].hp / y[0].maxhp)[0];
    if (alive) {
      const [s, i] = alive, need = s.maxhp - s.hp, amt = d => d.hp === 'full' ? Infinity : d.hp;
      const heals = has(bag, 'heal', d => !d.cures);
      const key = heals.filter(k => amt(SUPPLIES[k]) >= need).sort((x, y) => amt(SUPPLIES[x]) - amt(SUPPLIES[y]))[0] || heals.sort((x, y) => amt(SUPPLIES[y]) - amt(SUPPLIES[x]))[0];
      if (key) { const d = take(bag, key), healed = Math.min(amt(d), need); s.hp += healed;
        return { key, text: `${K(party[i].species)}에게 ${d.name} 1개 사용 · HP ${healed} 회복` }; }
    }
  }
  return null;
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
      const pick = chooseBall(game, trainer, wild, loc, myTop, battleResult.turns);
      bagOf(trainer)[pick.key]--;
      lines.push(`${pick.name} 1개 사용.`);
      if (rng() < pick.p) {
        wild.caughtOnDay = game.day;
        wild.ball = pick.key;
        if (pick.key === 'healBall') delete wild.fieldState;
        wild.learned = [...wild.moves];
        out.caught = wild;
        lines.push(`${eulReul(K(w.species))} 잡았다! (Lv${level}) → 소속사 박스로 보냈다.`);
        await giveFoeExp(trainer, [wild], false, lines);
      } else {
        lines.push(`${eunNeun(K(w.species))} 볼에서 빠져나와 달아났다.`);
        await giveFoeExp(trainer, [wild], false, lines);
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
    /* 현지 트레이너는 원작처럼 도구 없이, 기술만 배운 것 중 쓸 만한 4개로 */
    outfitNpcTrainer({ party: foeParty }, { items: false });

    lines.push(`${cls.name} ${iGa(npc.name)} 승부를 걸어왔다! (${npc.party.map(([sp, lv]) => `${K(sp)} Lv${lv}`).join(', ')})`);
    const foe = { name: `${cls.name} ${npc.name}`, stats: npcStats(npcLevel) };
    battleResult = fight(trainer, trainer.party.filter(m => fieldState(m).hp > 0), foe, foeParty, seed);
    const iWon = battleResult.winner === 'p1';

    if (iWon) {
      /* 이미 이긴 상대와의 재대결은 상금 10% — 같은 길만 돌며 돈을 불리지 못하게 [임시값] */
      const money = Math.round(cls.money * npcLevel * (fresh.length ? 1 : 0.1));
      out.money = money;
      out.won = true;
      trainer.beaten[`${loc.id}:${npc.name}`] = true;
      trainer.record.wins = (trainer.record.wins || 0) + 1;
      lines.push(`${cls.name} ${npc.name}에게 이겼다! 상금 ${money.toLocaleString()}.`);
      applyWin(trainer);
      await giveFoeExp(trainer, foeParty, true, lines);
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

/* ---------------- 사파리존 (data/safari.js) ---------------- */

/** 활동 시각 — 09:00~18:00을 활동 수로 나눈다 */
const slotTime = (slot, budget) => `${String(9 + Math.floor((slot - 1) * 9 / budget)).padStart(2, '0')}:${String(Math.floor(((slot - 1) * 540 / budget) % 60)).padStart(2, '0')}`;

/**
 * 사파리존 하루 — 입장료를 내고 사파리볼 30개로 만나는 포켓몬마다 볼을 던진다.
 * 배틀·경험치·상금·센터 없음. 못 잡으면 스피드가 빠를수록 잘 도망친다. 남은 볼은 반납.
 * 입장료는 out.money(음수)로 돌려줘 하루 정산이 자금에서 뺀다.
 */
async function exploreSafari(game, trainer, location, budget, onActivity, out) {
  const R = SAFARI_RULES;
  const agency = game.league.agencies.find(x => x.id === game.playerAgencyId);
  if (agency && agency.funds < R.fee) { out.lines.push(`입장료 ₽${R.fee.toLocaleString()}가 모자라 사파리존에 들어가지 못했다.`); return out; }
  out.money -= R.fee;
  out.safari = { fee: R.fee, thrown: 0 };
  out.lines.push(`입장료 ₽${R.fee.toLocaleString()}를 내고 사파리볼 ${R.balls}개를 받았다. (일반 몬스터볼은 쓸 수 없다)`);
  const rng = game.rng;
  let balls = R.balls;
  for (let slot = 1; slot <= budget; slot++) {
    if (balls <= 0) { out.lines.push('사파리볼을 다 써서 밖으로 나왔다.'); break; }
    const before = trainer.party.map(fieldState);
    const w = weighted(rng, location.wild);
    const level = between(rng, w.min, w.max);
    const wild = await createPokemon({ species: w.species, level, rng });
    const sp = Dex.species.get(w.species);
    const rate = CAPTURE_RATE[w.species] ?? CAPTURE_RATE[sp.baseSpecies] ?? 45;
    const p = captureChance(rate, R.ballMod, 1);   // 배틀하지 않아 HP는 가득
    const flee = Math.min(R.flee.max, R.flee.base + sp.baseStats.spe / R.flee.perSpeed);
    const lines = [`야생 ${iGa(K(w.species))} 나타났다! (Lv${level})`];
    let thrown = 0, caught = false, fled = false;
    while (balls > 0 && !caught && !fled) {
      balls--; thrown++;
      if (rng() < p) caught = true;
      else if (rng() < flee) fled = true;
    }
    out.safari.thrown += thrown;
    if (caught) {
      wild.caughtOnDay = game.day;
      wild.ball = 'safariBall';
      wild.learned = [...wild.moves];
      out.catches.push(wild);
      lines.push(`사파리볼 ${thrown}개를 던져 ${eulReul(K(w.species))} 잡았다! → 소속사 박스로 보냈다.`);
    } else if (fled) lines.push(`사파리볼 ${thrown}개를 던졌지만 ${eunNeun(K(w.species))} 도망쳤다…`);
    else lines.push(`사파리볼을 모두 던졌지만 ${eulReul(K(w.species))} 잡지 못했다.`);
    addSteps(trainer.party);
    trainer.fatigue = Math.min(100, (trainer.fatigue || 0) + MANAGEMENT.activityFatigue);
    const event = { kind: 'safari', slot, time: slotTime(slot, budget), lines, money: 0, caught: caught ? wild : null,
      before, after: trainer.party.map(fieldState) };
    out.events.push(event);
    out.lines.push(`[${event.time} · ${slot}/${budget}] ${lines.join(' ')}`);
    await onActivity(event, budget);
  }
  if (balls > 0) out.lines.push(`남은 사파리볼 ${balls}개는 반납했다.`);
  out.lines.push(`사파리존 종료 — ${out.events.length}회 만남, 포획 ${out.catches.length}마리, 입장료 ₽${R.fee.toLocaleString()}.`);
  return out;
}

/** A day is an activity budget; healing consumes exactly the same slot as an encounter. */
export async function explore(game, trainer, locationId, mode, { activities = EXPLORE_CONFIG.day.default, onActivity = async () => {} } = {}) {
  const location = locationById(locationId);
  const budget = Math.max(6, Math.min(8, Math.round(Number(activities) || 6)));
  const out = { location, lines: [`${trainer.name}: ${location?.name || '목적지'} 탐험을 시작했다.`],
    events: [], catches: [], money: 0, won: null, wins: 0, losses: 0, centers: 0, budget };
  if (!location || !trainer.party?.length || !['catch', 'battle', 'mixed'].includes(mode)) {
    out.lines.push('탐험할 장소·파티·활동을 확인해 주세요.'); return out;
  }
  /* 사파리존은 배정한 활동과 상관없이 사파리볼 포획만 한다 */
  if (location.kind === 'safari') return exploreSafari(game, trainer, location, budget, onActivity, out);
  const modes = mode === 'mixed' ? ['catch', 'battle'] : [mode];
  const available = modes.filter(m => m === 'catch' ? location.wild.length : location.trainers.length);
  if (!available.length) { out.lines.push('이 장소에서는 지정한 활동을 할 수 없습니다.'); return out; }
  let encounters = 0;
  for (let slot = 1; slot <= budget; slot++) {
    if (!available.some(m=>m==='battle'||ballCount(bagOf(trainer))>0)) {out.lines.push('몬스터볼이 없어 포획을 중단하고 복귀했다. 상점에서 물품을 지급하세요.');break;}
    const before = trainer.party.map(fieldState);
    const health = partyCondition(trainer);
    let event;
    const used = (health.ratio < EXPLORE_CONFIG.center.visitBelow || health.fainted || health.status || health.exhausted) ? useFieldItem(trainer, health) : null;
    if (used) {
      event = { kind: 'item', item: used.key, lines: [`${used.text} (활동 1회)`], money: 0 };
    } else if (health.ratio < EXPLORE_CONFIG.center.visitBelow || health.fainted || health.status || health.exhausted) {
      const reason = health.fainted ? '쓰러진 포켓몬이 있어' : health.status ? '상태이상 치료가 필요해' : health.exhausted ? '기술 PP가 부족해' : '체력이 부족해';
      healParty(trainer);
      out.centers++;
      event = { kind: 'center', lines: [`${reason} 포켓몬센터에 들렀다. HP·상태이상·PP를 모두 회복했다. (활동 1회)`], money: 0 };
    } else {
      const todayModes=available.filter(m=>m==='battle'||ballCount(bagOf(trainer))>0);
      const kind = todayModes[encounters++ % todayModes.length];
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
    addSteps(trainer.party);   // 함께 걸은 걸음 (파모트·꽃거롱·골든파리 진화)
    for(const mon of trainer.party) if(mon.autoEvolve){
      const ready=evolutionOptions(mon,game).filter(e=>e.auto);
      if(ready.length===1){const r=await evolvePokemon(mon,ready[0].species,game);if(r.ok)event.lines.push(`${K(r.before)} → ${K(r.after)} 진화!`);}
    }
    event.before = before;
    event.after = trainer.party.map(fieldState);
    trainer.fatigue=Math.min(100,(trainer.fatigue||0)+MANAGEMENT.activityFatigue);
    out.events.push(event);
    out.lines.push(`[${event.time} · ${slot}/${budget}] ${event.lines.join(' ')}`);
    await onActivity(event, budget);
  }
  /* 하루 함께 다니면 친밀도 +1 (평온의방울 2) [임시값] */
  if (out.events.length) for (const m of trainer.party) m.friendship = Math.min(255, (m.friendship ?? 70) + (m.item === 'Soothe Bell' ? 2 : 1));
  out.lines.push(`탐험 종료 — ${out.events.length}회 활동, ${out.wins}승 ${out.losses}패, 포획 ${out.catches.length}마리, 센터 ${out.centers}회, 상금 ${out.money}.${available.includes('catch')&&!(ballCount(bagOf(trainer))>0)?' 몬스터볼이 없어 포획은 못 했다.':''}`);
  return out;
}
