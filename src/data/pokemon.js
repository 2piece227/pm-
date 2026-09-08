/**
 * 포켓몬 개체 — **직접 키운다.** (기획서 §6.2 포켓몬 훈련관 / §2 코어 루프)
 *
 * 예전엔 팀 빌더가 "노력치까지 다 박힌 Lv50 6마리"를 그냥 찍어냈다. 그러면 육성이라는
 * 층이 통째로 없어진다 — FM으로 치면 유스 없이 완성된 1군만 주는 셈이다.
 * 여기서는 **레벨 5짜리 한 마리부터** 시작해서 경험치로 올리고, 레벨에 맞춰 기술을 배운다.
 *
 * 원본 데이터는 전부 `@pkmn/dex`에서 온다 — 종족값·특성·레벨업 기술표를 손으로 안 적는다.
 * 배틀 엔진에 넘길 땐 `toShowdownBlock()`으로 그때그때 텍스트를 만든다.
 */
import { Dex } from '@pkmn/dex';

const GEN = Dex.forGen(9);

/** 레벨업 기술표 캐시 — 종족당 한 번만 받아온다 */
const learnsetCache = new Map();

/** 성격 — 배틀에 실제로 영향이 있는 것만 골라 쓴다 */
const NATURES = [
  'Adamant', 'Modest', 'Jolly', 'Timid', 'Bold', 'Impish', 'Careful', 'Calm',
  'Naughty', 'Rash', 'Hasty', 'Relaxed', 'Serious', 'Hardy', 'Quirky',
];

/** 최대 레벨 */
export const MAX_LEVEL = 100;

/**
 * 경험치 곡선 — 원작 medium-fast(레벨^3)을 그대로 쓴다.
 * 초반엔 금방 오르고 뒤로 갈수록 확 느려지는 곡선이 육성 리듬을 만든다.
 */
export const expForLevel = (lv) => Math.pow(Math.max(1, lv), 3);
export const levelFromExp = (exp) => {
  let lv = 1;
  while (lv < MAX_LEVEL && expForLevel(lv + 1) <= exp) lv += 1;
  return lv;
};

/** 종족의 레벨업 기술표를 받아온다. `[{ move, level }]`, 레벨 오름차순 */
export async function levelUpMoves(speciesName) {
  const sp = GEN.species.get(speciesName);
  if (!sp?.exists) return [];
  const key = sp.id;
  if (learnsetCache.has(key)) return learnsetCache.get(key);

  const p = (async () => {
    try {
      /* 폼 변형은 자기 표가 없을 수 있어 기본 종까지 훑는다 */
      const ids = [sp.id, sp.baseSpecies && GEN.species.get(sp.baseSpecies)?.id].filter(Boolean);
      for (const id of ids) {
        const ls = await GEN.learnsets.get(id);
        const table = ls?.learnset;
        if (!table) continue;
        const out = [];
        for (const [move, sources] of Object.entries(table)) {
          for (const s of sources) {
            const m = /^9L(\d+)$/.exec(s);
            if (m) out.push({ move: GEN.moves.get(move).name, level: Number(m[1]) });
          }
        }
        if (out.length) return out.sort((a, b) => a.level - b.level);
      }
    } catch { /* 못 받아오면 아래 폴백 */ }
    return [];
  })();

  learnsetCache.set(key, p);
  return p;
}

/** 그 레벨에서 들고 있을 기술 4개 — 원작처럼 **가장 최근에 배운 것부터** 채운다 */
export function movesAtLevel(table, level) {
  const learned = table.filter((m) => m.level <= level).map((m) => m.move);
  const uniq = [...new Set(learned)];
  return uniq.slice(-4);
}

/**
 * 개체 하나를 만든다.
 *
 * 노력치(evs)는 **비워둔 채로 시작한다** — 훈련으로 쌓이는 값이라 처음부터 박아두면
 * 육성할 게 없어진다. 개체값(ivs)은 태어날 때 정해지는 숨김값이라 여기서 굴린다.
 */
export async function createPokemon({ species, level = 5, rng = Math.random, nickname = null }) {
  const sp = GEN.species.get(species);
  if (!sp?.exists) return null;

  const table = await levelUpMoves(sp.name);
  const abilities = Object.values(sp.abilities || {}).filter(Boolean);

  return {
    species: sp.name,
    nickname,
    level,
    exp: expForLevel(level),
    /* 개체값 0~31 — 같은 종이라도 개체차가 난다 */
    ivs: Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe']
      .map((k) => [k, Math.floor(rng() * 32)])),
    /* 노력치 — 훈련으로 쌓는다 (§6.2) */
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    nature: NATURES[Math.floor(rng() * NATURES.length)],
    ability: abilities[Math.floor(rng() * abilities.length)] || abilities[0] || 'Pressure',
    item: null,
    moves: movesAtLevel(table, level),
    happiness: 70,
    caughtOnDay: null,
  };
}

/**
 * 경험치를 넣는다. 레벨이 오르면 새로 배운 기술을 알려준다.
 * @returns {{ levels: number, learned: string[] }}
 */
export async function gainExp(mon, amount) {
  const before = mon.level;
  mon.exp += Math.max(0, Math.round(amount));
  const after = levelFromExp(mon.exp);
  if (after === before) return { levels: 0, learned: [] };

  mon.level = after;
  const table = await levelUpMoves(mon.species);
  const now = movesAtLevel(table, after);
  const learned = now.filter((m) => !mon.moves.includes(m));
  mon.moves = now;
  return { levels: after - before, learned };
}

/** 훈련으로 노력치를 넣는다 — 한 스탯 252 / 총합 510이 상한 (원작과 같다) */
export function addEv(mon, stat, amount) {
  const total = Object.values(mon.evs).reduce((a, b) => a + b, 0);
  const room = Math.min(252 - mon.evs[stat], 510 - total, amount);
  if (room <= 0) return 0;
  mon.evs[stat] += room;
  return room;
}

/** 표시용 실제 능력치 (원작 공식) */
export function realStats(mon) {
  const sp = GEN.species.get(mon.species);
  const nat = GEN.natures.get(mon.nature);
  const out = {};
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    const base = sp.baseStats[k];
    const iv = mon.ivs[k] ?? 0;
    const ev = Math.floor((mon.evs[k] ?? 0) / 4);
    if (k === 'hp') {
      out.hp = Math.floor(((2 * base + iv + ev) * mon.level) / 100) + mon.level + 10;
    } else {
      let v = Math.floor(((2 * base + iv + ev) * mon.level) / 100) + 5;
      if (nat?.plus === k) v = Math.floor(v * 1.1);
      if (nat?.minus === k) v = Math.floor(v * 0.9);
      out[k] = v;
    }
  }
  return out;
}

/** 배틀 엔진에 넘길 쇼다운 팀 텍스트 한 덩어리 */
const STAT_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

export function toShowdownBlock(mon) {
  const evs = Object.entries(mon.evs).filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${STAT_LABEL[k]}`).join(' / ');
  const ivs = Object.entries(mon.ivs)
    .map(([k, v]) => `${v} ${STAT_LABEL[k]}`).join(' / ');

  const lines = [
    `${mon.nickname ? `${mon.nickname} (${mon.species})` : mon.species}${mon.item ? ` @ ${mon.item}` : ''}`,
    `Ability: ${mon.ability}`,
    `Level: ${mon.level}`,
  ];
  if (evs) lines.push(`EVs: ${evs}`);
  lines.push(`${mon.nature} Nature`);
  lines.push(`IVs: ${ivs}`);
  for (const m of (mon.moves.length ? mon.moves : ['Tackle'])) lines.push(`- ${m}`);
  return lines.join('\n');
}

/** 파티 전체 → 쇼다운 팀 텍스트 */
export const partyToTeam = (party) => party.map(toShowdownBlock).join('\n\n');
