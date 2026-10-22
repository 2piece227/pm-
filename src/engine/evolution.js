/**
 * 진화 조건 — 9세대 데이터의 진화 방법 8종을 원작대로 판정한다.
 *
 *   level            레벨 (+시간·스탯·파티·날씨 조건)
 *   useItem          진화의 돌 등 도구 사용 (소속사 창고에서 1개 소모)
 *   trade            통신진화 → 연결의끈(PLA)으로 대신한다. 도구를 지닌 통신진화는 그 도구를 지닌 채로
 *   levelFriendship  친밀도 160 이상에서 레벨업 (8세대 이후 기준)
 *   levelHold        도구를 지닌 채 레벨업
 *   levelMove        그 기술을 익힌 채 레벨업
 *   levelExtra       파티 조건·자기장·페어리 기술+친밀도
 *   other            저승갓숭(분노의주먹 20회)·대도각참(대검귀 3마리 쓰러뜨리기)·타부자고(코인 999개)·
 *                    파오리→창파나이트(한 배틀 급소 3번)·대쓰여너(반동 294) 등은 배틀 기록으로 센다
 *
 * [임시값] 이 게임엔 시계·날씨·달이 없다. 낮/밤/비/보름달 조건은 "진화시키는 때를 대표가 고른다"로 본다
 * (그래서 둘 다 가능할 때 자동 진화는 하지 않고 대표가 고른다).
 */
import { Dex } from '@pkmn/dex';
import { realStats } from '../data/pokemon.js';

export const FRIENDSHIP_EVO = 160;
export const LINKING_CORD = 'Linking Cord';
const COUNTERS = {
  'Annihilape': { key: 'move:Rage Fist', need: 20, text: '분노의주먹 사용' },
  'Wyrdeer': { key: 'move:Psyshield Bash', need: 20, text: '배리어돌진 사용' },
  'Overqwil': { key: 'move:Barb Barrage', need: 20, text: '독침천발 사용' },
  'Kingambit': { key: 'koBisharp', need: 3, text: '상대 절각참 쓰러뜨리기' },
  'Basculegion': { key: 'recoil', need: 294, text: '쓰러지지 않고 받은 반동 데미지' },
  'Basculegion-F': { key: 'recoil', need: 294, text: '쓰러지지 않고 받은 반동 데미지' },
  'Pawmot': { key: 'steps', need: 1000, text: '함께 걸은 걸음 수' },
  'Brambleghast': { key: 'steps', need: 1000, text: '함께 걸은 걸음 수' },
  'Rabsca': { key: 'steps', need: 1000, text: '함께 걸은 걸음 수' },
  "Sirfetch’d": { key: 'crit3', need: 1, text: '한 배틀에서 급소 3번' },
  'Runerigus': { key: 'hp49', need: 1, text: '쓰러지지 않고 한 배틀에서 HP 49 이상 잃기' },
};
export const counterOf = (mon, key) => (mon.counters || {})[key] || 0;
export const friendshipOf = mon => mon.friendship ?? 70;

const ko = (table, s) => table?.[s] || s;

/**
 * @param mon
 * @param ctx { stock: {item: n}, party: mon[], itemKo: fn, moveKo: fn, typeOf: fn }
 * @returns [{species, method, need, ready, auto, consume?: {stock?: string, held?: true}}]
 */
export function evolutionChoices(mon, ctx = {}) {
  const stock = ctx.stock || {}, party = ctx.party || [], iko = ctx.itemKo || (s => s), mko = ctx.moveKo || (s => s);
  const lv = mon.level, held = mon.item, training = !!mon.training;
  const out = [];
  for (const name of Dex.species.get(mon.species).evos) {
    const n = Dex.species.get(name);
    if (!n.exists || n.isNonstandard === 'CAP') continue;
    const cond = n.evoCondition || '';
    const opt = { species: n.name, method: n.evoType || 'level', level: n.evoLevel, need: '', ready: false, auto: false };
    const lvOk = !n.evoLevel || lv >= n.evoLevel;
    const timeNote = /during the day/.test(cond) ? ' · 낮' : /at night/.test(cond) ? ' · 밤' : /evening/.test(cond) ? ' · 해질녘' : '';
    switch (opt.method) {
      case 'level': {
        opt.need = `Lv.${n.evoLevel}${timeNote}`;
        let extra = true;
        if (/Atk stat > its Def/.test(cond)) { const s = realStats(mon); extra = s.atk > s.def; opt.need += ' · 공격 > 방어'; }
        else if (/Atk stat < its Def/.test(cond)) { const s = realStats(mon); extra = s.atk < s.def; opt.need += ' · 공격 < 방어'; }
        else if (/Atk stat equal/.test(cond)) { const s = realStats(mon); extra = s.atk === s.def; opt.need += ' · 공격 = 방어'; }
        else if (/Dark-type in the party/.test(cond)) { extra = party.some(m => m !== mon && Dex.species.get(m.species).types.includes('Dark')); opt.need += ' · 파티에 악타입'; }
        else if (/during rain/.test(cond)) opt.need += ' · 비 오는 날';
        else if (/upside-down/.test(cond)) opt.need += ' · 기기를 거꾸로';
        else if (/special Rockruff/.test(cond)) opt.need += ' · 특별한 암멍이';
        opt.ready = lvOk && extra;
        opt.auto = opt.ready && !timeNote && !/rain|upside/.test(cond);
        break;
      }
      case 'useItem': {
        const item = n.evoItem || (/Black Augurite/.test(cond) ? 'Black Augurite' : null);
        opt.need = `${iko(item)} 사용`;
        opt.ready = (stock[item] || 0) > 0; opt.consume = { stock: item };
        break;
      }
      case 'trade': {
        const partner = /with a (\w+)/.exec(cond)?.[1];
        opt.need = `${iko(LINKING_CORD)} 사용${n.evoItem ? ` · ${iko(n.evoItem)}을(를) 지닌 채` : ''}${partner ? ' (원작은 서로 맞교환)' : ''}`;
        opt.ready = (stock[LINKING_CORD] || 0) > 0 && (!n.evoItem || held === n.evoItem);
        opt.consume = { stock: LINKING_CORD, held: !!n.evoItem };
        break;
      }
      case 'levelFriendship': {
        const f = friendshipOf(mon);
        opt.need = `친밀도 ${f}/${FRIENDSHIP_EVO}${timeNote}`;
        opt.ready = f >= FRIENDSHIP_EVO; opt.auto = opt.ready && !timeNote;
        break;
      }
      case 'levelHold': {
        opt.need = `${iko(n.evoItem)}을(를) 지닌 채 레벨업${timeNote}`;
        opt.ready = held === n.evoItem; opt.consume = { held: true };
        break;
      }
      case 'levelMove': {
        opt.need = `${mko(n.evoMove)}을(를) 익힌 채 레벨업`;
        opt.ready = mon.moves.includes(n.evoMove) && lvOk; opt.auto = opt.ready;
        break;
      }
      case 'levelExtra': {
        if (/Remoraid/.test(cond)) { opt.need = '파티에 총어'; opt.ready = party.some(m => m.species === 'Remoraid'); }
        else if (/magnetic field/.test(cond)) { opt.need = `${iko('Thunder Stone')} 사용 (8세대 이후)`; opt.ready = (stock['Thunder Stone'] || 0) > 0; opt.consume = { stock: 'Thunder Stone' }; }
        else if (/Fairy-type move/.test(cond)) {
          const fairy = mon.moves.some(m => Dex.moves.get(m).type === 'Fairy'), f = friendshipOf(mon);
          opt.need = `페어리 기술 익힘 · 친밀도 ${f}/${FRIENDSHIP_EVO}`; opt.ready = fairy && f >= FRIENDSHIP_EVO;
        } else { opt.need = cond; opt.ready = lvOk; }
        opt.auto = opt.ready && !opt.consume;
        break;
      }
      case 'other': {
        const c = COUNTERS[n.name];
        if (c) {
          const have = counterOf(mon, c.key);
          opt.need = `${c.text} ${Math.min(have, c.need)}/${c.need}${n.name === 'Kingambit' ? ' (대장의징표는 생략)' : ''}`;
          opt.ready = have >= c.need; opt.auto = opt.ready;
        } else if (n.name === 'Gholdengo') {
          const coins = stock['Gimmighoul Coin'] || 0;
          opt.need = `${iko('Gimmighoul Coin')} ${Math.min(coins, 999)}/999 · 레벨업`; opt.ready = coins >= 999; opt.consume = { stock: 'Gimmighoul Coin', count: 999 };
        } else if (n.name === 'Ursaluna') {
          opt.need = `${iko('Peat Block')} 사용 · 보름달 밤`; opt.ready = (stock['Peat Block'] || 0) > 0; opt.consume = { stock: 'Peat Block' };
        } else if (n.name === 'Alcremie') {
          const sweet = held && / Sweet$/.test(held);
          opt.need = '사탕공예를 지닌 채 빙글빙글 돌기'; opt.ready = !!sweet; opt.consume = { held: true };
        } else if (/^Urshifu/.test(n.name)) {
          const f = friendshipOf(mon);
          opt.need = `${n.name === 'Urshifu' ? '악의 탑' : '물의 탑'} 제패 · 친밀도 ${f}/${FRIENDSHIP_EVO} (탑 대신)`; opt.ready = f >= FRIENDSHIP_EVO;
        } else { opt.need = cond; opt.ready = false; }
        break;
      }
      default: opt.need = cond || opt.method;
    }
    if (training) { opt.ready = false; opt.auto = false; }
    out.push(opt);
  }
  return out;
}

/** 진화에 쓴 도구를 치운다 */
export function consumeForEvolution(opt, mon, stock) {
  const c = opt.consume; if (!c) return;
  if (c.stock) { stock[c.stock] -= c.count || 1; if (stock[c.stock] <= 0) delete stock[c.stock]; }
  if (c.held) mon.item = null;
}

/* ---------------- 배틀 기록으로 세는 진화 조건 ---------------- */

const nameOf = m => { const sp = Dex.species.get(m.species); return [m.nickname, sp.name, sp.baseSpecies].filter(Boolean); };
const findMon = (party, name) => party.find(m => nameOf(m).includes(name));

/** 배틀 로그 한 판을 읽어 우리 쪽(side) 포켓몬의 진화 카운터를 올린다 */
export function recordBattle(party, log, side = 'p1') {
  const lines = Array.isArray(log) ? log : String(log || '').split('\n');
  const foe = side === 'p1' ? 'p2' : 'p1';
  const hp = new Map(), crits = new Map(), lost = new Map(), fainted = new Set();
  let lastUser = null;
  const bump = (mon, key, n = 1) => { mon.counters ??= {}; mon.counters[key] = (mon.counters[key] || 0) + n; };
  const ident = s => /^(p[12])[a-c]?: (.+)$/.exec(s || '');
  for (const line of lines) {
    const p = line.split('|'); const type = p[1];
    if (type === 'switch' || type === 'drag') {
      const id = ident(p[2]); if (id?.[1] === side) { const m = findMon(party, id[2]); const cur = Number((p[4] || '').split('/')[0]); if (m && Number.isFinite(cur)) hp.set(m, cur); }
    } else if (type === 'move') {
      const id = ident(p[2]);
      if (id?.[1] === side) { const m = findMon(party, id[2]); lastUser = m || null; if (m) bump(m, `move:${p[3]}`); }
      else lastUser = null;
    } else if (type === '-crit') {
      const id = ident(p[2]); if (id?.[1] === foe && lastUser) crits.set(lastUser, (crits.get(lastUser) || 0) + 1);
    } else if (type === '-damage' || type === '-heal') {
      const id = ident(p[2]); if (id?.[1] !== side) continue;
      const m = findMon(party, id[2]); if (!m) continue;
      const cur = /^0 fnt/.test(p[3] || '') ? 0 : Number((p[3] || '').split('/')[0]);
      const before = hp.get(m);
      if (Number.isFinite(cur) && Number.isFinite(before) && cur < before) {
        lost.set(m, (lost.get(m) || 0) + before - cur);
        if (type === '-damage' && line.includes('[from] Recoil')) bump(m, 'recoil', before - cur);
      }
      if (Number.isFinite(cur)) hp.set(m, cur);
    } else if (type === 'faint') {
      const id = ident(p[2]);
      if (id?.[1] === foe && /^Bisharp/.test(id[2]) && lastUser && Dex.species.get(lastUser.species).name === 'Bisharp') bump(lastUser, 'koBisharp');
      if (id?.[1] === side) { const m = findMon(party, id[2]); if (m) { fainted.add(m); if (m.counters?.recoil) m.counters.recoil = 0; } }
    }
  }
  for (const [m, n] of crits) if (n >= 3) { m.counters ??= {}; m.counters.crit3 = 1; }
  for (const [m, n] of lost) if (n >= 49 && !fainted.has(m)) { m.counters ??= {}; m.counters.hp49 = 1; }
}

/** 탐험 활동 1회 = 함께 걷기 100걸음 [임시값] */
export function addSteps(party, steps = 100) { for (const m of party) { m.counters ??= {}; m.counters.steps = (m.counters.steps || 0) + steps; } }
