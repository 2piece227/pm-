/**
 * PokeAPI 폼 번호표를 만든다 — `node tools/gen-pokeapi-forms.mjs`
 *
 * PokeAPI 스프라이트는 폼 그림을 이름이 아니라 번호로 저장한다 (메가리자몽X = 10034.gif).
 * 그래서 "6-mega-x" 같은 경로로는 BW 애니메이션 GIF를 못 찾았다. 쇼다운 종족 id → PokeAPI 번호.
 * 출처: PokeAPI CSV (data/v2/csv/pokemon.csv)
 */
import fs from 'node:fs';
import { Dex } from '@pkmn/dex';

const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv';
const rows = (await (await fetch(CSV)).text()).trim().split('\n').slice(1).map((l) => l.split(','));
const out = {};
for (const [id, name] of rows) {
  if (Number(id) < 10000) continue;
  const sp = Dex.species.get(name);
  if (sp?.exists && sp.forme && !out[sp.id]) out[sp.id] = Number(id);
}
const body = `/** **자동 생성 파일 — 직접 고치지 마라.** \`node tools/gen-pokeapi-forms.mjs\`로 다시 만든다.\n * 쇼다운 종족 id → PokeAPI 폼 번호 (스프라이트 파일명). 출처: PokeAPI CSV */\nexport const POKEAPI_FORM_ID = ${JSON.stringify(out)};\n`;
fs.writeFileSync(new URL('../src/data/pokeapi-forms.gen.js', import.meta.url), body);
console.log(`${Object.keys(out).length} forms`);
