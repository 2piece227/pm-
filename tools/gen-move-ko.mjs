/**
 * 기술 한글 이름표 생성기 — `src/data/move-ko.gen.js`를 만든다.
 *
 * 왜 생성하나:
 *   손으로 적던 표는 73개뿐이라 8·9세대 기술이 자막에 영문으로 떴고, 그나마도
 *   7개가 틀려 있었다 (제트헤드 → 사념의박치기, 놓치지않기 → 기습 …).
 *   PokeRogue 로케일은 953개 전부를 갖고 있고 공식 명칭을 따른다.
 *
 * 출처: pagefaultgames/pokerogue-locales (ko/move.json) — CREDITS.md 참고.
 * 타입은 @pkmn/dex에서 직접 읽는다.
 *
 * 실행: node tools/gen-move-ko.mjs
 */
import fs from 'fs';
import path from 'path';
import { Dex } from '@pkmn/dex';

const SRC = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-locales/main/ko/move.json';
const OUT = path.join('src', 'data', 'move-ko.gen.js');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`로케일을 받지 못했다: HTTP ${res.status}`);
const loc = await res.json();

/** 로케일 키(camelCase) → 정식 영문 기술명. dex가 모르는 키는 버린다 */
const rows = [];
const unknown = [];
for (const [key, v] of Object.entries(loc)) {
  const ko = v?.name;
  if (!ko) continue;
  const mv = Dex.moves.get(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase());
  if (!mv.exists) { unknown.push(key); continue; }
  rows.push({ en: mv.name, ko, type: mv.type.toLowerCase() });
}
rows.sort((a, b) => a.en.localeCompare(b.en));

/** 키 표기 — 식별자로 쓸 수 있으면 그대로, 아니면 따옴표 (JSON이 이스케이프한다) */
const k = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s));
const v = (s) => JSON.stringify(s);

const head = `/**
 * **자동 생성 파일 — 직접 고치지 마라.** \`node tools/gen-move-ko.mjs\`로 다시 만든다.
 *
 * 기술 ${rows.length}종의 한글 이름과 타입.
 *   - 이름: pagefaultgames/pokerogue-locales의 ko/move.json (공식 명칭을 따른다)
 *   - 타입: @pkmn/dex
 *
 * 손으로 고칠 게 생기면 ko.js의 MOVE_KO_OVERRIDE에 적는다. 그쪽이 이 표를 덮어쓴다.
 */

export const MOVE_KO_ALL = {
${rows.map((r) => `  ${k(r.en)}: ${v(r.ko)},`).join(String.fromCharCode(10))}
};

export const MOVE_TYPE_ALL = {
${rows.map((r) => `  ${k(r.en)}: ${v(r.type)},`).join(String.fromCharCode(10))}
};
`;

fs.writeFileSync(OUT, head, 'utf8');
console.log(`${OUT} — 기술 ${rows.length}종 기록`);
if (unknown.length) console.log(`dex가 모르는 로케일 키 ${unknown.length}개 건너뜀: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? ' …' : ''}`);
