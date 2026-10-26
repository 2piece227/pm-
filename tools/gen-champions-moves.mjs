/**
 * 포켓몬 챔피언스 기술표 생성기 — `node tools/gen-champions-moves.mjs`
 *
 * 챔피언스는 레벨이 없는 대전 게임이라 "그 종이 쓸 수 있는 기술 목록"만 있다(전부 9M).
 * 이 게임에서는 그 목록을 기술머신으로 가르칠 수 있는 기술에 더하고, 강한 NPC가 기술을 고를 때도 쓴다.
 * 레벨업 기술은 지금처럼 9세대(SV, SV에 없는 종은 그 종이 마지막으로 나온 세대) 표를 쓴다.
 *
 * 출처: smogon/pokemon-showdown `data/mods/champions/learnsets.ts` (MIT). CREDITS.md 참고.
 * 용량을 줄이려고 기술 id를 번호로 바꿔 종마다 "번호,번호,…" 문자열로 저장한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'champions-moves.gen.js');

const r = await fetch(SRC);
if (!r.ok) throw new Error(`${SRC}: ${r.status}`);
const text = await r.text();

/* 맨 바깥 항목(탭 하나 들여쓰기)마다 learnset 블록의 기술 이름만 모은다 */
const table = {};
for (const m of text.matchAll(/\n\t([a-z0-9]+): \{\n\t\tlearnset: \{\n([\s\S]*?)\n\t\t\},/g)) {
  const moves = [...m[2].matchAll(/^\t\t\t([a-z0-9]+): \[/gm)].map(x => x[1]);
  if (moves.length) table[m[1]] = moves;
}
const species = Object.keys(table);
if (species.length < 100) throw new Error(`종이 너무 적다 (${species.length}) — 원본 형식이 바뀌었나?`);

const moveIds = [...new Set(species.flatMap(s => table[s]))].sort();
const index = new Map(moveIds.map((id, i) => [id, i]));
const packed = Object.fromEntries(species.map(s => [s, table[s].map(id => index.get(id).toString(36)).join(',')]));

fs.writeFileSync(OUT, `/**
 * **자동 생성 파일 — 직접 고치지 마라.** \`node tools/gen-champions-moves.mjs\`로 다시 만든다.
 * 포켓몬 챔피언스에서 종마다 쓸 수 있는 기술 (${species.length}종, 기술 ${moveIds.length}개).
 * 출처: smogon/pokemon-showdown data/mods/champions/learnsets.ts (MIT)
 */
const MOVES = ${JSON.stringify(moveIds)};
const PACKED = ${JSON.stringify(packed)};
const cache = new Map();
/** 쇼다운 종 id → 기술 id 목록 (챔피언스에 없는 종은 빈 배열) */
export function championsMoves(speciesId) {
  if (!cache.has(speciesId)) cache.set(speciesId, PACKED[speciesId] ? PACKED[speciesId].split(',').map(n => MOVES[parseInt(n, 36)]) : []);
  return cache.get(speciesId);
}
export const CHAMPIONS_SPECIES = Object.keys(PACKED);
`);
console.log(`${species.length}종, 기술 ${moveIds.length}개 → ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);
