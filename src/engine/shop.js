/**
 * 상점 · 소속사 창고 · 지닌 도구 · 기술머신
 *
 *   - 지닌 도구와 기술머신은 소속사 창고(agency.items / agency.tms)에 산다.
 *   - 도구는 포켓몬에게 지니게 하고(mon.item, 배틀 엔진에 그대로 들어간다) 빼면 창고로 돌아온다.
 *   - 기술머신은 9세대처럼 1회용. 쓰면 그 기술을 배운 기술 목록에 넣고 원하는 칸에 장착한다.
 *   - 배틀 뒤 소모: 원작처럼 먹은 열매만 사라진다. 다른 도구는 배틀이 끝나면 돌아온다 [임시값].
 */
import { Dex } from '@pkmn/dex';
import { HELD_ITEMS, TMS, EVO_ITEMS } from '../data/items.gen.js';
import { agencyOf, ownedMon } from './pokemon-management.js';
import { eulReul, ko, MOVE_KO } from '../data/ko.js';

const GEN = Dex.forGen(9);
const fail = msg => ({ ok: false, msg });
export const itemsOf = agency => (agency.items ??= {});
export const tmsOf = agency => (agency.tms ??= {});
export const itemKo = name => HELD_ITEMS[name]?.ko || EVO_ITEMS[name]?.ko || name;
/** 지니게 할 수 있는 도구 정보 (배틀 도구·메가스톤·진화 도구 중 지닐 수 있는 것) */
export const holdInfo = name => HELD_ITEMS[name] || (EVO_ITEMS[name]?.holdable ? { ...EVO_ITEMS[name], cat: 'evo' } : null);
export const TM_BY_MOVE = Object.fromEntries(TMS.map(t => [t.move, t]));

/* 키스톤(메가링) — 트레이너마다 하나. 원작에선 이야기로 받는 물건이라 가격은 [임시값] */
export const KEY_STONE = { name: '키스톤', price: 15000 };
export function buyKeyStone(game, trainerId) {
  const a = agencyOf(game), t = a.roster.find(x => x.id === trainerId);
  if (!t) return fail('우리 트레이너가 아닙니다.');
  if (t.keyStone) return fail(`${t.name}에게는 이미 키스톤이 있습니다.`);
  if (a.funds < KEY_STONE.price) return fail('자금이 부족합니다.');
  a.funds -= KEY_STONE.price; t.keyStone = true;
  return { ok: true, msg: `${t.name}에게 키스톤을 줬습니다. 이제 메가스톤을 지닌 포켓몬이 메가진화할 수 있습니다.` };
}

export function buyItem(game, name, qty = 1) {
  const def = HELD_ITEMS[name] || EVO_ITEMS[name], a = agencyOf(game);
  if (!def) return fail('파는 도구가 아닙니다.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) return fail('수량은 1~999개입니다.');
  const cost = def.price * qty;
  if (a.funds < cost) return fail('자금이 부족합니다.');
  a.funds -= cost; itemsOf(a)[name] = (itemsOf(a)[name] || 0) + qty;
  return { ok: true, msg: `${def.ko} ${qty}개 구입 · ${cost.toLocaleString()} 지불` };
}

export function buyTM(game, move, qty = 1) {
  const tm = TM_BY_MOVE[move], a = agencyOf(game);
  if (!tm) return fail('파는 기술머신이 아닙니다.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return fail('수량은 1~99개입니다.');
  const cost = tm.price * qty;
  if (a.funds < cost) return fail('자금이 부족합니다.');
  a.funds -= cost; tmsOf(a)[move] = (tmsOf(a)[move] || 0) + qty;
  return { ok: true, msg: `기술머신${String(tm.no).padStart(3, '0')} ${qty}개 구입 · ${cost.toLocaleString()} 지불` };
}

/** 지니게 한다 — 이미 들고 있던 도구는 창고로 */
export function giveItem(game, mon, name) {
  const a = agencyOf(game), bag = itemsOf(a);
  if (!ownedMon(game, mon)) return fail('우리 포켓몬이 아닙니다.');
  if (!holdInfo(name) || !(bag[name] > 0)) return fail('창고에 그 도구가 없습니다.');
  if (mon.item === name) return fail('이미 지니고 있습니다.');
  if (mon.item) bag[mon.item] = (bag[mon.item] || 0) + 1;
  bag[name]--; if (!bag[name]) delete bag[name];
  mon.item = name;
  return { ok: true, msg: `${eulReul(itemKo(name))} 지니게 했습니다.` };
}

export function takeItem(game, mon) {
  const a = agencyOf(game);
  if (!ownedMon(game, mon) || !mon.item) return fail('지닌 도구가 없습니다.');
  itemsOf(a)[mon.item] = (itemsOf(a)[mon.item] || 0) + 1;
  const name = mon.item; mon.item = null;
  return { ok: true, msg: `${eulReul(itemKo(name))} 창고로 돌려놨습니다.` };
}

/** 이 종이 이 기술머신을 쓸 수 있나 — 9세대 기술머신 기록 우선, SV에 없는 종은 역대 기술머신 기록 [임시값] */
const lsCache = new Map();
export async function tmLearnable(species) {
  const sp = GEN.species.get(species);
  if (!sp?.exists) return new Set();
  if (lsCache.has(sp.id)) return lsCache.get(sp.id);
  const ids = [sp.id, sp.changesFrom && GEN.species.get(sp.changesFrom).id].filter(Boolean);
  const out = new Set();
  for (const id of ids) {
    const ls = (await GEN.learnsets.get(id))?.learnset || {};
    for (const [mv, src] of Object.entries(ls)) if (src.some(s => /^\dM$/.test(s))) out.add(mv);
  }
  lsCache.set(sp.id, out);
  return out;
}

export async function teachTM(game, mon, move, slot) {
  const a = agencyOf(game), tms = tmsOf(a), mv = GEN.moves.get(move);
  if (!ownedMon(game, mon) || mon.training) return fail('훈련 중이거나 우리 포켓몬이 아닙니다.');
  if (!mv.exists || !(tms[move] > 0)) return fail('그 기술머신이 창고에 없습니다.');
  if ((mon.learned || []).includes(move) || mon.moves.includes(move)) return fail('이미 배운 기술입니다.');
  if (!(await tmLearnable(mon.species)).has(mv.id)) return fail('이 포켓몬은 그 기술머신을 쓸 수 없습니다.');
  if (!Number.isInteger(slot) || slot < 0 || slot > 3 || slot > mon.moves.length) return fail('앞쪽의 빈 기술 칸부터 채워주세요.');
  tms[move]--; if (!tms[move]) delete tms[move];
  mon.learned = [...new Set([...(mon.learned || []), move])];
  mon.moves[slot] = move;
  return { ok: true, msg: `기술머신으로 ${eulReul(ko(MOVE_KO, mv.name))} 가르쳤습니다.` };
}

/** 배틀 로그에서 우리 쪽이 먹은 열매를 지운다 (p1 = 우리) */
export function consumeBerries(party, log, side = 'p1') {
  const eaten = [];
  for (const line of (Array.isArray(log) ? log : String(log || '').split('\n'))) {
    const m = line.match(new RegExp(`^\\|-enditem\\|${side}[a-z]?: ([^|]+)\\|([^|]+)\\|\\[eat\\]`));
    if (!m) continue;
    const mon = party.find(x => x.item === m[2] && (x.nickname || x.species) === m[1].trim()) || party.find(x => x.item === m[2]);
    if (mon) { eaten.push({ species: mon.species, item: mon.item }); mon.item = null; }
  }
  return eaten;
}
