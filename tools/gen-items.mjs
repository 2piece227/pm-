/**
 * 상점·도구·기술 설명 데이터 생성기 — `src/data/items.gen.js`를 만든다.
 *
 * 출처 (CREDITS.md):
 *   - 기술·특성 설명(한국어): pagefaultgames/pokerogue-locales ko/move.json effect, ko/ability.json description
 *     없으면 PokeAPI move_flavor_text(한국어, 가장 최근 버전)
 *   - 도구 이름·설명·가격(한국어): PokeAPI items / item_names / item_flavor_text / item_categories
 *   - 기술머신 목록: PokeAPI machines (스칼렛·바이올렛 version_group 25, TM001~229)
 *   - 실제 효과·합법 여부: @pkmn/dex 9세대 (배틀 엔진과 같은 데이터)
 *
 * 실행: node tools/gen-items.mjs
 */
import fs from 'fs';
import path from 'path';
import { Dex } from '@pkmn/dex';

const OUT = path.join('src', 'data', 'items.gen.js');
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const LOC = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-locales/main/ko';
const KO = '3', SV = '25';

async function text(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); }
/** 따옴표·줄바꿈을 지원하는 CSV 파서 */
function parseCsv(src) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const csv = async (name) => parseCsv(await text(`${CSV}/${name}.csv`));
const clean = (s) => String(s || '').replace(/[\n\f\r­]+/g, ' ').replace(/\s+/g, ' ').trim();
const dexId = (s) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

const [items, itemNames, itemFlavor, categories, machines, moves, moveFlavor, versionGroups, locMove] = await Promise.all([
  csv('items'), csv('item_names'), csv('item_flavor_text'), csv('item_categories'), csv('machines'), csv('moves'), csv('move_flavor_text'), csv('version_groups'),
  text(`${LOC}/move.json`).then(JSON.parse),
]);
const locAbility = JSON.parse(await text(`${LOC}/ability.json`));
const vgOrder = Object.fromEntries(versionGroups.map(v => [v.id, Number(v.order)]));
const latestKo = (rows, key) => {
  const out = {};
  for (const r of rows) if (r.language_id === KO && (!out[r[key]] || vgOrder[r.version_group_id] > out[r[key]].o)) out[r[key]] = { o: vgOrder[r.version_group_id], t: clean(r.flavor_text) };
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.t]));
};

/* ---------- 기술 설명 ---------- */
const gen = Dex.forGen(9);
const pokeMoveId = Object.fromEntries(moves.map(m => [dexId(m.identifier), m.id]));
const moveFlavorKo = latestKo(moveFlavor, 'move_id');
const MOVE_DESC = {};
for (const mv of gen.moves.all()) {
  if (!mv.exists) continue;
  const loc = Object.entries(locMove).find(([k]) => dexId(k) === mv.id)?.[1]?.effect;
  const desc = clean(loc) || moveFlavorKo[pokeMoveId[mv.id]];
  if (desc) MOVE_DESC[mv.name] = desc;
}

/* ---------- 특성 설명 ---------- */
const ABILITY_DESC = {};
for (const ab of gen.abilities.all()) {
  if (!ab.exists) continue;
  const d = Object.entries(locAbility).find(([k]) => dexId(k) === ab.id)?.[1]?.description;
  if (d) ABILITY_DESC[ab.name] = clean(d);
}

/* ---------- 지닌 도구 ---------- */
const catName = Object.fromEntries(categories.map(c => [c.id, c.identifier]));
const koName = Object.fromEntries(itemNames.filter(r => r.local_language_id === KO).map(r => [r.item_id, r.name]));
const itemFlavorKo = latestKo(itemFlavor, 'item_id');
const pokeItem = Object.fromEntries(items.map(i => [dexId(i.identifier), i]));
/* 배틀에서 들고 쓰는 분류만 상점에 둔다 */
const HELD = {
  'held-items': 'battle', 'choice': 'battle', 'bad-held-items': 'battle', 'training': 'battle', 'species-specific': 'species',
  'type-enhancement': 'type', 'plates': 'type', 'jewels': 'type', 'memories': 'species',
  'medicine': 'berry', 'other': 'berry', 'in-a-pinch': 'berry', 'picky-healing': 'berry', 'type-protection': 'berry', 'baking-only': 'berry',
};
/* [임시값] 원작 가격이 0인 도구 — 분류별 기본가 */
const FALLBACK = { battle: 4000, species: 4000, type: 2000, berry: 200 };
const HELD_ITEMS = {};
for (const it of gen.items.all()) {
  if (!it.exists || it.isNonstandard || it.isPokeball || it.megaStone || it.zMove) continue;
  const p = pokeItem[it.id]; if (!p) continue;
  const cat = HELD[catName[p.category_id]]; if (!cat) continue;
  const ko = koName[p.id]; if (!ko) continue;
  const price = Number(p.cost) > 0 ? Number(p.cost) : FALLBACK[cat];
  HELD_ITEMS[it.name] = { ko, cat, price, icon: p.identifier, desc: itemFlavorKo[p.id] || "", estimated: !(Number(p.cost) > 0) };
}

/* ---------- 기술머신 (스칼렛·바이올렛) ---------- */
const moveById = Object.fromEntries(moves.map(m => [m.id, m.identifier]));
/* [임시값] SV 기술머신은 돈으로 사지 않는다(재료 제작). 위력·분류로 가격을 매긴다 */
const tmPrice = (mv) => mv.category === 'Status' ? 1500 : (mv.basePower || 0) <= 60 ? 2000 : mv.basePower <= 80 ? 3000 : mv.basePower <= 100 ? 5000 : 8000;
const TMS = machines.filter(m => m.version_group_id === SV).map(m => {
  const mv = gen.moves.get(dexId(moveById[m.move_id] || ''));
  return mv?.exists ? { no: Number(m.machine_number), move: mv.name, price: tmPrice(mv) } : null;
}).filter(Boolean).sort((a, b) => a.no - b.no);

const body = `/**
 * **자동 생성 파일 — 직접 고치지 마라.** \`node tools/gen-items.mjs\`로 다시 만든다.
 *
 *   기술 설명 ${Object.keys(MOVE_DESC).length}종 / 특성 설명 ${Object.keys(ABILITY_DESC).length}종 / 지닌 도구 ${Object.keys(HELD_ITEMS).length}종 / 기술머신 ${TMS.length}개
 *   출처: pokerogue-locales(ko move effect), PokeAPI CSV(도구 이름·설명·가격, SV 기술머신), @pkmn/dex 9세대
 *   estimated: true 인 도구 가격과 기술머신 가격은 [임시값]
 */
export const MOVE_DESC_KO = ${JSON.stringify(MOVE_DESC, null, 0)};
export const ABILITY_DESC_KO = ${JSON.stringify(ABILITY_DESC, null, 0)};
export const HELD_ITEMS = ${JSON.stringify(HELD_ITEMS, null, 0)};
export const TMS = ${JSON.stringify(TMS, null, 0)};
`;
fs.writeFileSync(OUT, body);
const cats = Object.values(HELD_ITEMS).reduce((n, i) => (n[i.cat] = (n[i.cat] || 0) + 1, n), {});
console.log(`wrote ${OUT}: moves ${Object.keys(MOVE_DESC).length}, items ${Object.keys(HELD_ITEMS).length} ${JSON.stringify(cats)}, TMs ${TMS.length}`);
