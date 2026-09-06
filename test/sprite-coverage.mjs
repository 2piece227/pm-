/**
 * 스프라이트가 전부 **5세대(BW) 도트**로 잡히는지 확인한다.
 *
 * 왜 필요한가: 예전엔 BW 폴더에 없는 종을 `other/showdown/`으로 떨궜는데, 거기는
 * BW 도트가 아니라 최신 고해상도 스프라이트라 "고해상도를 축소한 것"처럼 보였다.
 * 지금은 후보를 BW 계열로만 줄 세우므로, 풀의 모든 종이 그 안에서 잡히는지 지킨다.
 */
import { POKEMON_POOL } from '../src/data/pokemon-pool.js';
import { spriteCandidates, canReadPixels } from '../src/ui/sprites.js';

const CONCURRENCY = 12;

const kindOf = (u) => (u.includes('/animated/') ? 'PA-애니'
  : u.includes('gen5ani') ? 'PS-애니'
    : u.includes('play.pokemon') ? 'PS-정지(여백)' : 'PA-정지');

async function firstHit(species, side) {
  for (const c of spriteCandidates(species, side)) {
    try {
      const r = await fetch(c.url);
      if (r.ok) return { ...c, kind2: kindOf(c.url) };
    } catch { /* 네트워크 실패는 다음 후보로 */ }
  }
  return null;
}

const jobs = [];
for (const e of POKEMON_POOL) for (const side of ['p1', 'p2']) jobs.push({ species: e.species, side, latest: !!e.latest });

const results = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    results.push({ ...j, hit: await firstHit(j.species, j.side) });
  }
}));

const tally = {};
for (const r of results) tally[r.hit ? r.hit.kind2 : '없음'] = (tally[r.hit ? r.hit.kind2 : '없음'] || 0) + 1;

console.log(`풀 ${POKEMON_POOL.length}종 x 앞뒤 = ${results.length}장`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`);

const missing = results.filter((r) => !r.hit);
console.log(missing.length === 0
  ? '\n✅ 전부 BW 도트로 잡힌다'
  : `\n❌ 스프라이트를 못 찾은 것 ${missing.length}건:\n   ${missing.map((r) => `${r.species} (${r.side === 'p1' ? '뒤' : '앞'})`).join('\n   ')}`);

/* 여백을 못 자르는 소스(쇼다운)는 위치 보정에 기대므로, 늘어나면 알아채야 한다 */
const padded = results.filter((r) => r.hit && r.hit.kind === 'static' && !canReadPixels(r.hit.url));
console.log(`\n여백 보정에 기대는 장수: ${padded.length}/${results.length}` +
  (padded.length ? ` (${[...new Set(padded.map((r) => r.species))].join(', ')})` : ''));
