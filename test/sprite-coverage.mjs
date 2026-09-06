/**
 * 스프라이트가 전부 **움직이는 5세대(BW) 도트**로 잡히는지 확인한다.
 *
 * 두 번 데인 자리다:
 *   1) BW 폴더에 없는 종을 `other/showdown/`으로 떨궜는데 거기는 BW 도트가 아니라
 *      최신 고해상도 스프라이트였다 → "고해상도를 축소한 것"처럼 보였다.
 *   2) 그걸 고치고 나니 최신 세대만 정지컷이라 움직이는 애와 안 움직이는 애가 섞였다.
 *
 * 지금은 포켓로그의 BW 애니메이션 시트를 먼저 쓰고, 없을 때만 GIF/PNG로 떨어진다.
 */
import { POKEMON_POOL } from '../src/data/pokemon-pool.js';
import { sheetPaths, parseAtlas, SHEET_REPO } from '../src/ui/sprite-anim.js';
import { spriteCandidates } from '../src/ui/sprites.js';

const CONCURRENCY = 8;

async function json(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch { /* 재시도 */ }
    await new Promise((s) => setTimeout(s, 250));
  }
  return null;
}

/** 런타임과 같은 순서로 시트를 찾는다 */
async function findSheet(species, side) {
  let still = null;
  for (const [path, ms] of sheetPaths(species, side)) {
    const raw = await json(`${SHEET_REPO}/${path}.json`);
    if (!raw) continue;
    const a = parseAtlas(raw, ms);
    if (!a) continue;
    if (a.frames.length > 1) return { path, frames: a.frames.length, size: `${a.w}x${a.h}` };
    still ??= { path, frames: 1, size: `${a.w}x${a.h}` };
  }
  return still;
}

/** 시트가 없을 때 떨어지는 예전 경로 */
async function findFallback(species, side) {
  for (const c of spriteCandidates(species, side)) {
    try { const r = await fetch(c.url); if (r.ok) return c; } catch { /* 다음 후보 */ }
  }
  return null;
}

const jobs = [];
for (const e of POKEMON_POOL) for (const side of ['p1', 'p2']) jobs.push({ species: e.species, side });

const results = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    const sheet = await findSheet(j.species, j.side);
    results.push({ ...j, sheet, fallback: sheet ? null : await findFallback(j.species, j.side) });
  }
}));

const animated = results.filter((r) => r.sheet && r.sheet.frames > 1);
const stillOnly = results.filter((r) => r.sheet && r.sheet.frames === 1);
const viaFallback = results.filter((r) => !r.sheet && r.fallback);
const missing = results.filter((r) => !r.sheet && !r.fallback);

console.log(`풀 ${POKEMON_POOL.length}종 x 앞뒤 = ${results.length}장`);
console.log(`  시트 애니메이션   ${animated.length}`);
console.log(`  시트 정지컷       ${stillOnly.length}` +
  (stillOnly.length ? ` (${[...new Set(stillOnly.map((r) => r.species))].join(', ')})` : ''));
console.log(`  GIF/PNG 폴백      ${viaFallback.length}` +
  (viaFallback.length ? ` (${[...new Set(viaFallback.map((r) => r.species))].join(', ')})` : ''));

console.log(missing.length === 0
  ? '\n✅ 전부 BW 도트로 잡힌다'
  : `\n❌ 스프라이트를 못 찾은 것 ${missing.length}건:\n   ${missing.map((r) => `${r.species} (${r.side === 'p1' ? '뒤' : '앞'})`).join('\n   ')}`);

const pct = Math.round((animated.length / results.length) * 100);
console.log(`\n움직이는 비율 ${animated.length}/${results.length} (${pct}%)`);
