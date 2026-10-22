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
const speciesCsv = await csv('pokemon_species');
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

/* ---------- 진화 도구 — 진화의 돌·통신 도구·유대의 끈·모으령의 코인·사탕공예 등 ----------
   holdable: 9세대 데이터에 있는 도구라 지니게 할 수 있다(통신진화 도구는 지닌 채 유대의 끈을 쓴다) */
const EVO_FALLBACK = 3000, EVO_PRICE_OVERRIDE = { 'Gimmighoul Coin': 10 };   // [임시값]
const evoNames = new Set(['Black Augurite', 'Peat Block', 'Linking Cord', 'Gimmighoul Coin']);
for (const sp of gen.species.all()) if (sp.exists && sp.evoItem) evoNames.add(sp.evoItem);
for (const it of gen.items.all()) if (it.exists && / Sweet$/.test(it.name)) evoNames.add(it.name);
const EVO_ITEMS = {};
for (const name of [...evoNames].sort()) {
  const p = pokeItem[dexId(name)]; const dexItem = gen.items.get(name);
  const ko = p && koName[p.id]; if (!ko) { console.warn('evo item without ko', name); continue; }
  const price = EVO_PRICE_OVERRIDE[name] ?? (Number(p.cost) > 0 ? Number(p.cost) : EVO_FALLBACK);
  EVO_ITEMS[name] = { ko, price, icon: p.identifier, desc: itemFlavorKo[p.id] || '', holdable: !!dexItem?.exists, estimated: !!EVO_PRICE_OVERRIDE[name] || !(Number(p.cost) > 0) };
}

/* ---------- 메가스톤 — 9세대 데이터에선 과거/미래 도구라 따로 모은다. 원작 판매가가 없어 [임시값] ---------- */
const MEGA_PRICE = 10000;
for (const it of gen.items.all()) {
  if (!it.exists || !it.megaStone || it.isNonstandard === 'CAP') continue;   // CAP(팬메이드) 제외
  const p = pokeItem[it.id];
  const ko = p && koName[p.id];
  const mega = typeof it.megaStone === 'string' ? it.megaStone : Object.values(it.megaStone)[0];
  const evolves = gen.species.get(mega).baseSpecies;
  HELD_ITEMS[it.name] = { ko: ko || it.name, cat: 'mega', price: MEGA_PRICE, icon: p?.identifier || 'mega-ring', desc: (p && itemFlavorKo[p.id]) || '', estimated: true, mega, evolves, future: it.isNonstandard === 'Future', missingKo: !ko };
}

/* ---------- 탐험 물품 (트레이너 가방) — 볼·회복약·상태 회복·기력·PP ---------- */
const SUPPLY_IDS = ['poke-ball','great-ball','ultra-ball','premier-ball','luxury-ball','heal-ball','net-ball','dive-ball','nest-ball','repeat-ball','timer-ball','dusk-ball','quick-ball',
  'level-ball','lure-ball','moon-ball','friend-ball','love-ball','heavy-ball','fast-ball',
  'potion','super-potion','hyper-potion','max-potion','full-restore','fresh-water','soda-pop','lemonade','moomoo-milk','energy-powder','energy-root',
  'revive','max-revive','revival-herb','antidote','paralyze-heal','awakening','burn-heal','ice-heal','full-heal','heal-powder','ether','max-ether','elixir','max-elixir'];
const camel = id => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const SUPPLY_ITEMS = {};
for (const id of SUPPLY_IDS) {
  const p = items.find(i => i.identifier === id); if (!p) { console.warn('missing supply', id); continue; }
  SUPPLY_ITEMS[camel(id)] = { ko: koName[p.id] || id, price: Number(p.cost) || 0, icon: id, desc: itemFlavorKo[p.id] || '' };
}

/* ---------- 포획률 (원작 종족별 capture_rate) ---------- */
const CAPTURE_RATE = {};
for (const r of speciesCsv) { const sp = gen.species.get(dexId(r.identifier)); if (sp?.exists) CAPTURE_RATE[sp.name] = Number(r.capture_rate); }

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
export const SUPPLY_ITEMS = ${JSON.stringify(SUPPLY_ITEMS, null, 0)};
export const EVO_ITEMS = ${JSON.stringify(EVO_ITEMS, null, 0)};
export const CAPTURE_RATE = ${JSON.stringify(CAPTURE_RATE, null, 0)};
`;
fs.writeFileSync(OUT, body);
const cats = Object.values(HELD_ITEMS).reduce((n, i) => (n[i.cat] = (n[i.cat] || 0) + 1, n), {});
console.log(`evo items ${Object.keys(EVO_ITEMS).length}`);
console.log(`supplies ${Object.keys(SUPPLY_ITEMS).length}, capture rates ${Object.keys(CAPTURE_RATE).length}`);
console.log(`wrote ${OUT}: moves ${Object.keys(MOVE_DESC).length}, items ${Object.keys(HELD_ITEMS).length} ${JSON.stringify(cats)}, TMs ${TMS.length}`);
