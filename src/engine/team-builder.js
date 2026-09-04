/**
 * 팀 조립 — 풀(pokemon-pool.js)에서 6마리를 뽑아 쇼다운 팀 텍스트를 만든다.
 *
 * SPEC §13-3단계("팀 빌딩 + 배틀 길이 튜닝")의 팀 빌딩 쪽.
 * 배틀 길이는 여기서 결정된다 — 2마리 무투자 파티는 4턴에 끝나고 기점기가
 * 한 번도 안 나오지만(§14), 6마리 + 노력치 투자로 가면 20턴대가 나오면서
 * 기점기·집중력·멘탈이 비로소 발동한다.
 */
import { POKEMON_POOL, toShowdownBlock } from '../data/pokemon-pool.js';

export const TEAM_SIZE = 6;

/**
 * 등급별로 어느 tier를 얼마나 섞을지. (SPEC §3.6 소속사 컨셉과 연결)
 *   대기업 = 최상위 위주 / 로켓단 = "조무래기 양성"이라 tier1 비중이 크다
 */
export const ROSTER_PROFILES = {
  elite: { weights: { 3: 6, 2: 3, 1: 0 }, evLevel: 1.0 },
  strong: { weights: { 3: 4, 2: 4, 1: 1 }, evLevel: 0.85 },
  mid: { weights: { 3: 2, 2: 5, 1: 2 }, evLevel: 0.6 },
  weak: { weights: { 3: 1, 2: 3, 1: 5 }, evLevel: 0.35 },
  grunt: { weights: { 3: 0, 2: 2, 1: 6 }, evLevel: 0.2 },
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

/**
 * 팀 하나 조립.
 * @param {() => number} rng  재현 가능한 난수
 * @param {string} profileName ROSTER_PROFILES 키
 * @returns {string} 쇼다운 팀 텍스트
 */
export function buildTeam(rng, profileName = 'mid') {
  const profile = ROSTER_PROFILES[profileName] || ROSTER_PROFILES.mid;
  const used = new Set();
  const picks = [];

  let guard = 0;
  while (picks.length < TEAM_SIZE && guard++ < 400) {
    const tier = pickTier(rng, profile.weights);
    const candidates = POKEMON_POOL.filter((p) => p.tier === tier && !used.has(p.species));
    if (!candidates.length) continue;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    used.add(pick.species);
    picks.push(pick);
  }

  /* 가중치가 치우쳐서 6마리를 못 채웠으면 남은 아무 종으로 채운다 */
  while (picks.length < TEAM_SIZE) {
    const rest = POKEMON_POOL.filter((p) => !used.has(p.species));
    if (!rest.length) break;
    const pick = rest[Math.floor(rng() * rest.length)];
    used.add(pick.species);
    picks.push(pick);
  }

  return picks.map((p) => toShowdownBlock(p, { evLevel: profile.evLevel })).join('\n\n');
}

/** 팀 텍스트에서 종족명만 뽑아온다 (UI 로스터 표시용) */
export function teamSpecies(teamText) {
  return teamText
    .split(/\n\n+/)
    .map((block) => block.trim().split('\n')[0])
    .filter(Boolean)
    .map((line) => line.split(' @')[0].trim());
}
