/**
 * 디버그 모드 — 대표 이름을 '비통한비버통'으로 시작하면 켜진다 (game.debug).
 * 자금은 늘 가득 차 있고, 실험용 도구(포켓몬 추가·레벨·배지·잠금 해제·날짜 건너뛰기)를 쓸 수 있다.
 * 일반 게임에는 아무 영향이 없다.
 */
import { createPokemon, gainExp, expForLevel } from '../data/pokemon.js';
import { Dex } from '@pkmn/dex';
import { ko, SPECIES_KO } from '../data/ko.js';
import { GYMS } from '../data/gyms.js';
import { HELD_ITEMS, TMS, EVO_ITEMS } from '../data/items.gen.js';
import { SUPPLIES } from '../data/supplies.js';
import { agencyOf, bagOf, evolutionOptions } from './pokemon-management.js';

export const DEBUG_NAME = '비통한비버통';
export const DEBUG_FUNDS = 999_999_999;
export const isDebug = game => !!game?.debug;
const fail = msg => ({ ok: false, msg });
const roster = game => agencyOf(game).roster;

export function enableDebug(game) {
  game.debug = { version: 1, unlockReform: false };
  refillFunds(game);
}
/** 자금은 줄어도 바로 다시 찬다 — 화면을 그릴 때와 하루가 끝날 때 */
export function refillFunds(game) {
  if (isDebug(game)) agencyOf(game).funds = DEBUG_FUNDS;
}
export function toggleDebug(game, key) {
  if (!isDebug(game) || !(key in game.debug)) return fail('없는 설정입니다.');
  game.debug[key] = !game.debug[key];
  return { ok: true, msg: `${key} ${game.debug[key] ? '켜짐' : '꺼짐'}` };
}

/** 원하는 포켓몬을 원하는 레벨로 박스에 */
export async function debugAddPokemon(game, species, level) {
  const sp = Dex.species.get(species);
  if (!sp.exists || sp.num <= 0) return fail('없는 포켓몬입니다.');
  if (!Number.isInteger(level) || level < 1 || level > 100) return fail('레벨은 1~100입니다.');
  const mon = await createPokemon({ species: sp.name, level, rng: game.rng });
  if (!mon) return fail('만들 수 없는 포켓몬입니다.');
  mon.caughtOnDay = game.day;
  agencyOf(game).box.push(mon);
  return { ok: true, msg: `${ko(SPECIES_KO, sp.name)} Lv.${level}을(를) 박스에 넣었습니다.` };
}

/** 트레이너 파티 전원을 이 레벨로 — 올릴 때는 기술도 배우고, 내릴 때는 레벨만 바꾼다 */
export async function debugPartyLevel(game, trainerId, level) {
  const t = roster(game).find(x => x.id === trainerId);
  if (!t) return fail('트레이너를 고르세요.');
  if (!Number.isInteger(level) || level < 1 || level > 100) return fail('레벨은 1~100입니다.');
  for (const m of t.party) {
    if (level > m.level) await gainExp(m, expForLevel(level) - m.exp);
    else { m.level = level; m.exp = expForLevel(level); }
    delete m.fieldState;
  }
  return { ok: true, msg: `${t.name}의 파티를 Lv.${level}로 맞췄습니다. 진화는 포켓몬 관리에서 하세요.` };
}

/** 배지: 'kanto' | 'johto' | 'all' | 'none' */
export function debugBadges(game, trainerId, which) {
  const t = roster(game).find(x => x.id === trainerId);
  if (!t) return fail('트레이너를 고르세요.');
  if (which === 'none') { t.badges = []; delete t.lastBadgeDay; }
  else {
    const ids = GYMS.filter(g => which === 'all' || g.region === which).map(g => g.id);
    t.badges = [...new Set([...(t.badges || []), ...ids])];
  }
  return { ok: true, msg: `${t.name} 배지 ${t.badges.length}개` };
}

/** 트레이닝 센터 훈련을 목표값으로 바로 끝낸다 */
export function debugFinishTraining(game) {
  let n = 0;
  for (const m of agencyOf(game).box) {
    const job = m.training; if (!job) continue;
    if (job.v === 2) { Object.assign(m.ivs, job.targets); Object.assign(m.evs, job.evTargets); }
    else for (const s of job.steps.slice(job.index)) m.ivs[s.stat] = s.value;
    delete m.training; n++;
  }
  return { ok: true, msg: n ? `${n}마리 훈련을 바로 끝냈습니다.` : '훈련 중인 포켓몬이 없습니다.' };
}

/** 창고에 모든 지닌 도구·진화 도구·기술머신 99개, 트레이너 모두에게 키스톤과 물품 99개 */
export function debugGiveAll(game) {
  const a = agencyOf(game);
  a.items ??= {}; a.tms ??= {};
  for (const k of Object.keys(HELD_ITEMS)) a.items[k] = 99;
  for (const k of Object.keys(EVO_ITEMS)) a.items[k] = 99;
  for (const t of TMS) a.tms[t.move] = 99;
  for (const t of a.roster) { t.keyStone = true; const bag = bagOf(t); for (const k of Object.keys(SUPPLIES)) bag[k] = 99; }
  return { ok: true, msg: '모든 도구·기술머신 99개, 키스톤, 탐험 물품을 지급했습니다.' };
}

/** 진화 가능한 포켓몬 수 (안내용) */
export const evolvableCount = game => [...agencyOf(game).box, ...roster(game).flatMap(t => t.party)].filter(m => evolutionOptions(m, game).length).length;
