/**
 * 한글 이름표 생성기 — `src/data/ko.gen.js`를 만든다.
 *
 * 왜 생성하나:
 *   손으로 적던 표는 풀에 있는 것만 채워져 있어서, 종을 하나 늘릴 때마다 자막이 조용히
 *   영문으로 떨어졌다. 기술 표에서는 틀린 이름까지 7개 나왔다. 이제 전부 출처에서 가져온다.
 *
 * 출처: pagefaultgames/pokerogue-locales (ko/move.json, ko/pokemon.json, ko/ability.json)
 *       타입은 @pkmn/dex에서 직접 읽는다. — CREDITS.md 참고
 *
 * 손으로 고칠 게 있으면 ko.js의 *_OVERRIDE에 적는다. 그쪽이 이 표를 덮어쓴다.
 * 실행: node tools/gen-ko.mjs
 */
import fs from 'fs';
import path from 'path';
import { Dex } from '@pkmn/dex';

const BASE = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-locales/main/ko';
const OUT = path.join('src', 'data', 'ko.gen.js');

const get = async (f) => {
  const r = await fetch(`${BASE}/${f}`);
  if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
  return r.json();
};
const [locMove, locMon, locAbility] = await Promise.all([
  get('move.json'), get('pokemon.json'), get('ability.json'),
]);

/** 로케일 키(camelCase) → dex id */
const dexId = (key) => key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/* ---------- 기술 ---------- */
const moves = [];
for (const [key, v] of Object.entries(locMove)) {
  const ko = v?.name;
  if (!ko) continue;
  const mv = Dex.moves.get(dexId(key));
  if (!mv.exists) continue;
  moves.push({ en: mv.name, ko, type: mv.type.toLowerCase() });
}
moves.sort((a, b) => a.en.localeCompare(b.en));

/* ---------- 종족 ---------- */
/* 로케일은 기본 종만 갖고 있다. 폼 변형(랜드로스(영물) 등)은 ko.js의 OVERRIDE에서 다룬다 */
const species = [];
for (const [key, ko] of Object.entries(locMon)) {
  if (typeof ko !== 'string' || !ko) continue;
  const sp = Dex.species.get(dexId(key));
  if (!sp.exists) continue;
  species.push({ en: sp.name, ko, types: sp.types.map((t) => t.toLowerCase()) });
}
species.sort((a, b) => a.en.localeCompare(b.en));

/* 폼 변형의 타입은 기본 종과 다를 수 있으니 dex에서 따로 훑는다 */
const formeTypes = [];
for (const sp of Dex.species.all()) {
  if (!sp.exists || !sp.baseSpecies || sp.baseSpecies === sp.name) continue;
  formeTypes.push({ en: sp.name, types: sp.types.map((t) => t.toLowerCase()) });
}
formeTypes.sort((a, b) => a.en.localeCompare(b.en));

/* ---------- 특성 ---------- */
const abilities = [];
for (const [key, v] of Object.entries(locAbility)) {
  const ko = v?.name;
  if (!ko) continue;
  const ab = Dex.abilities.get(dexId(key));
  if (!ab.exists) continue;
  abilities.push({ en: ab.name, ko });
}
abilities.sort((a, b) => a.en.localeCompare(b.en));

/* ---------- 출력 ---------- */
const k = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s));
const v = (s) => JSON.stringify(s);
const table = (name, rows, pick) =>
  `export const ${name} = {\n${rows.map((r) => `  ${k(r.en)}: ${v(pick(r))},`).join('\n')}\n};\n`;

const out = `/**
 * **자동 생성 파일 — 직접 고치지 마라.** \`node tools/gen-ko.mjs\`로 다시 만든다.
 *
 *   기술 ${moves.length}종 / 종족 ${species.length}종 / 폼 변형 타입 ${formeTypes.length}건 / 특성 ${abilities.length}종
 *
 *   - 이름: pagefaultgames/pokerogue-locales (공식 명칭을 따른다)
 *   - 타입: @pkmn/dex
 *
 * 손으로 고칠 게 생기면 ko.js의 *_OVERRIDE에 적는다. 그쪽이 이 표를 덮어쓴다.
 */

${table('MOVE_KO_ALL', moves, (r) => r.ko)}
${table('MOVE_TYPE_ALL', moves, (r) => r.type)}
${table('SPECIES_KO_ALL', species, (r) => r.ko)}
${table('SPECIES_TYPES_ALL', [...species, ...formeTypes], (r) => (r.types || []).join('/'))}
${table('ABILITY_KO_ALL', abilities, (r) => r.ko)}`;

fs.writeFileSync(OUT, out, 'utf8');
console.log(`${OUT} — 기술 ${moves.length} / 종족 ${species.length} / 폼 ${formeTypes.length} / 특성 ${abilities.length}`);
