/**
 * 파티 조립 — **개체를 만들어 넣는다.** 완성품을 찍어내지 않는다.
 *
 * 예전엔 노력치까지 박힌 Lv50 6마리를 한 번에 뱉었다. 그러면 육성 층이 통째로 사라진다.
 * 지금은 `data/pokemon.js`가 레벨에 맞춰 개체를 만들고, 여기서는 **누가 몇 마리를
 * 어느 레벨로 갖고 있는가**만 정한다.
 *
 * 플레이어 트레이너는 스타터 한 마리(Lv5)로 시작한다 — 나머지는 직접 키워서 늘린다.
 */
import { SPECIES_POOL, STARTERS } from '../data/species-pool.js';
import { createPokemon, partyToTeam } from '../data/pokemon.js';

export const TEAM_SIZE = 6;

/**
 * 등급별로 어느 tier를 얼마나 섞을지 + 파티 규모·레벨대.
 * NPC는 "이미 굴러가는 세상"이라 처음부터 어느 정도 키워져 있다 (§0.1-4).
 */
export const ROSTER_PROFILES = {
  elite: { weights: { 3: 6, 2: 3, 1: 0 }, size: 6, level: [42, 50] },
  strong: { weights: { 3: 4, 2: 4, 1: 1 }, size: 6, level: [36, 44] },
  mid: { weights: { 3: 2, 2: 5, 1: 2 }, size: 5, level: [28, 38] },
  weak: { weights: { 3: 1, 2: 3, 1: 5 }, size: 4, level: [20, 30] },
  grunt: { weights: { 3: 0, 2: 2, 1: 6 }, size: 4, level: [16, 24] },
  /* 플레이어가 데려오는 유스 — 스타터 한 마리부터 (아래 makeStarterParty) */
  youth: { weights: { 3: 0, 2: 1, 1: 4 }, size: 1, level: [5, 5] },
};

/** 가중치에 따라 tier 하나를 고른다 */
function pickTier(rng, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [tier, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return Number(tier);
  }
  return 2;
}

const pickLevel = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * 파티 하나 조립. **비동기다** — 레벨업 기술표를 받아와야 한다.
 * @returns {Promise<object[]>} 포켓몬 개체 배열
 */
export async function buildParty(rng, profileName = 'mid') {
  const profile = ROSTER_PROFILES[profileName] || ROSTER_PROFILES.mid;
  const used = new Set();
  const party = [];

  let guard = 0;
  while (party.length < profile.size && guard++ < 400) {
    const tier = pickTier(rng, profile.weights);
    const cands = SPECIES_POOL.filter((p) => p.tier === tier && !used.has(p.species));
    if (!cands.length) continue;
    const pick = cands[Math.floor(rng() * cands.length)];
    used.add(pick.species);
    const mon = await createPokemon({ species: pick.species, level: pickLevel(rng, profile.level), rng });
    if (mon) party.push(mon);
  }

  /* 가중치가 치우쳐서 못 채웠으면 남은 아무 종으로 */
  while (party.length < profile.size) {
    const rest = SPECIES_POOL.filter((p) => !used.has(p.species));
    if (!rest.length) break;
    const pick = rest[Math.floor(rng() * rest.length)];
    used.add(pick.species);
    const mon = await createPokemon({ species: pick.species, level: pickLevel(rng, profile.level), rng });
    if (mon) party.push(mon);
  }

  return party;
}

/** 새 트레이너가 받는 스타터 한 마리 — 여기서부터 직접 키운다 */
export async function makeStarterParty(rng, speciesName = null) {
  const pick = speciesName
    ? { species: speciesName }
    : STARTERS[Math.floor(rng() * STARTERS.length)];
  const mon = await createPokemon({ species: pick.species, level: 5, rng });
  return mon ? [mon] : [];
}

/** 파티 → 배틀 엔진용 쇼다운 팀 텍스트 */
export const teamTextOf = partyToTeam;

/** 파티에서 종족명만 (UI 표시용) */
export const partySpecies = (party) => (party || []).map((m) => m.species);
