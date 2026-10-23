import { Dex } from '@pkmn/dex';
import { levelUpMoves, realStats } from '../data/pokemon.js';
import { fieldState } from './field-state.js';
import { SUPPLIES } from '../data/supplies.js';
import { evolutionChoices, consumeForEvolution } from './evolution.js';
import { HELD_ITEMS, EVO_ITEMS } from '../data/items.gen.js';
import { ko, MOVE_KO } from '../data/ko.js';

export const MANAGEMENT = {
  movePrice: 100, abilityPrice: 1000,
  supplies: SUPPLIES,   // 탐험 물품 45종 — data/supplies.js
  /* 컨디션 [임시값] — 패배가 주 원인. 활동·휴식은 곁가지다 (사용자 확정 2026-10-22)
     lossHit: 한 번 질 때 (멘탈이 높을수록 덜), winRecover: 이길 때 회복,
     activityFatigue: 활동 1회, restRecovery: 휴식한 날 추가 회복, dailyRecovery: 매일 자연 회복 */
  lossHit: 7, winRecover: 3, activityFatigue: 0.4, restRecovery: 4, dailyRecovery: 2,
};
export const IV_KEYS = ['hp','atk','def','spa','spd','spe'];
export const IV_LABELS = {hp:'HP',atk:'공격',def:'방어',spa:'특수공격',spd:'특수방어',spe:'스피드'};
export const agencyOf = game => game.league.agencies.find(a => a.id === game.playerAgencyId);
export const ownedMon = (game, mon) => agencyOf(game).box.includes(mon) || agencyOf(game).roster.some(t=>t.party.includes(mon));
export const bagOf = trainer => trainer.bag ??= {pokeBall:0,potion:0};
export const conditionOf = t => Math.round(100 - Math.min(100, t?.fatigue || 0));
export const fatigueOf = t => (t.fatigue || 0) < 35 ? {face:'☺',label:'컨디션 좋음',color:'fresh'} : (t.fatigue || 0) < 70 ? {face:'😐',label:'흔들림 · 패배 누적',color:'tired'} : {face:'😠',label:'슬럼프 · 연패',color:'exhausted'};
const fail = msg => ({ok:false,msg});

export function buySupplies(game, trainerId, item, count) {
  const agency=agencyOf(game), t=agency.roster.find(t=>t.id===trainerId), def=MANAGEMENT.supplies[item];
  if(!t||!def||!Number.isInteger(count)||count<1||count>999) return fail('지급 수량을 1~999개로 입력하세요.');
  const cost=def.price*count;
  if(agency.funds<cost) return fail('소속사 자금이 부족합니다.');
  agency.funds-=cost;bagOf(t)[item]=(bagOf(t)[item]||0)+count;
  return {ok:true,msg:`${t.name}에게 ${def.name} ${count}개 지급 · ${cost.toLocaleString()}`,cost};
}

export function changeMove(game, mon, slot, move) {
  if(!ownedMon(game,mon)||mon.training) return fail('훈련 중인 포켓몬은 변경할 수 없습니다.');
  if(!Number.isInteger(slot)||slot<0||slot>3||!(mon.learned||[]).includes(move)||!Dex.moves.get(move).exists) return fail('배운 기술 중에서 선택하세요.');
  if(mon.moves[slot]===move) return fail('이미 장착한 기술입니다.');
  if(mon.moves.includes(move)) return fail('같은 기술을 두 번 장착할 수 없습니다.');
  if(agencyOf(game).funds<MANAGEMENT.movePrice) return fail('자금이 부족합니다.');
  if(slot>mon.moves.length) return fail('앞쪽의 빈 기술 칸부터 채워주세요.');
  agencyOf(game).funds-=MANAGEMENT.movePrice;mon.moves[slot]=move;
  return {ok:true,msg:'기술을 변경했습니다.'};
}
export function changeAbility(game, mon, ability) {
  if(!ownedMon(game,mon)||mon.training) return fail('훈련 중에는 변경할 수 없습니다.');
  if(!Object.values(Dex.species.get(mon.species).abilities).includes(ability)||mon.ability===ability) return fail('변경 가능한 다른 특성을 선택하세요.');
  if(agencyOf(game).funds<MANAGEMENT.abilityPrice) return fail('자금이 부족합니다.');
  agencyOf(game).funds-=MANAGEMENT.abilityPrice;mon.ability=ability;
  return {ok:true,msg:'특성을 변경했습니다.'};
}

/** Level-only evolutions are actionable. Other canonical conditions are shown, never bypassed. */
/** 진화 후보 — 9세대 진화 방법 전부 (engine/evolution.js). game을 주면 창고 도구·파티 조건까지 본다 */
export function evolutionOptions(mon, game = null) {
  const agency = game ? agencyOf(game) : null;
  const party = agency?.roster.find(t => t.party.includes(mon))?.party || [];
  return evolutionChoices(mon, { stock: agency ? (agency.items ??= {}) : {}, party, itemKo: n => HELD_ITEMS[n]?.ko || EVO_ITEMS[n]?.ko || n, moveKo: n => ko(MOVE_KO, n) })
    .map(o => ({ ...o, reason: o.need }));
}
export async function evolvePokemon(mon, target, game = null) {
  if(!evolutionOptions(mon, game).some(e=>e.species===target&&e.ready)) return fail('아직 진화 조건을 충족하지 않았습니다.');
  const before=mon.species;
  const table=await levelUpMoves(target);
  // Recheck after async loading to prevent stale/double confirmations.
  const opt=evolutionOptions(mon, game).find(e=>e.species===target&&e.ready);
  if(mon.species!==before||!opt) return fail('포켓몬 상태가 바뀌었습니다.');
  if(opt.consume) consumeForEvolution(opt, mon, game ? (agencyOf(game).items ??= {}) : {});
  const old=Dex.species.get(before), next=Dex.species.get(target);
  const abilitySlot=Object.keys(old.abilities).find(k=>old.abilities[k]===mon.ability)||'0';
  mon.fieldState=fieldState(mon);
  mon.species=next.name;mon.ability=next.abilities[abilitySlot]||next.abilities[0];
  mon.learned=[...new Set([...(mon.learned||mon.moves),...table.filter(m=>m.level<=mon.level).map(m=>m.move)])];
  mon.fieldState=fieldState(mon);
  return {ok:true,before,after:mon.species,msg:'진화했습니다!'};
}

/* ---------------- 트레이닝 센터 (2026-10-23 개편) ----------------
 * 개체값: 한 마리를 0에서 6V로 만드는 데 최대 10일, 보통 개체(평균 15.5)는 7일 안팎 — 오를수록 덜 걸린다(제곱근).
 * 노력치: 510을 통째로 다시 짜도 최대 3일. 개체값 → 노력치 순서로 한 번에 배정한다.
 * 성격: 민트로 바로 바꾼다(원작 SV 델리버드 상점 가격 ₽20,000). [임시값] 일수 곡선 */
export const TRAINING = { ivMaxDays: 10, ivFullPoints: 186, evMaxDays: 3, evTotal: 510, evStat: 252, mintPrice: 20000 };
export const ivDaysFor = points => points > 0 ? Math.max(1, Math.round(TRAINING.ivMaxDays * Math.sqrt(points / TRAINING.ivFullPoints))) : 0;
export const evDaysFor = change => change > 0 ? Math.min(TRAINING.evMaxDays, Math.max(1, Math.ceil(TRAINING.evMaxDays * change / TRAINING.evTotal))) : 0;
const evSum = evs => IV_KEYS.reduce((n, k) => n + (evs[k] || 0), 0);

/** @param plan {ivs, evs} — 예전 호출처럼 개체값 목표만 넘겨도 된다 */
export function trainingQuote(mon, plan) {
  if (plan && !plan.ivs && !plan.evs) plan = { ivs: plan };
  const ivs = { ...mon.ivs, ...(plan?.ivs || {}) }, evs = { ...mon.evs, ...(plan?.evs || {}) };
  if (IV_KEYS.some(k => !Number.isInteger(ivs[k]) || ivs[k] < mon.ivs[k] || ivs[k] > 31)) return fail('개체값은 현재 값 이상, 최대 31까지 정하세요.');
  if (IV_KEYS.some(k => !Number.isInteger(evs[k]) || evs[k] < 0 || evs[k] > TRAINING.evStat)) return fail(`노력치는 능력치마다 0~${TRAINING.evStat}입니다.`);
  if (evSum(evs) > TRAINING.evTotal) return fail(`노력치 합계는 ${TRAINING.evTotal}까지입니다.`);
  const points = IV_KEYS.reduce((n, k) => n + ivs[k] - mon.ivs[k], 0);
  const evChange = IV_KEYS.reduce((n, k) => n + Math.abs(evs[k] - (mon.evs[k] || 0)), 0);
  if (!points && !evChange) return fail('올릴 개체값이나 바꿀 노력치를 정하세요.');
  const ivDays = ivDaysFor(points), evDays = evDaysFor(evChange);
  return { ok: true, ivs, evs, points, evChange, ivDays, evDays, days: ivDays + evDays };
}
export function startTraining(game, mon, plan) {
  if (!agencyOf(game).box.includes(mon) || mon.training) return fail('박스에 있고 훈련 중이 아닌 포켓몬을 선택하세요.');
  const q = trainingQuote(mon, plan); if (!q.ok) return q;
  mon.training = { v: 2, from: { ivs: { ...mon.ivs }, evs: { ...mon.evs } }, targets: q.ivs, evTargets: q.evs, ivDays: q.ivDays, evDays: q.evDays, elapsed: 0, totalDays: q.days, startedDay: game.day };
  return { ok: true, msg: `${q.days}일 훈련을 배정했습니다. (개체값 ${q.ivDays}일 · 노력치 ${q.evDays}일)` };
}
export function tickTraining(game) {
  const lines = [];
  for (const mon of agencyOf(game).box) {
    const job = mon.training; if (!job) continue;
    job.elapsed++;
    if (job.v === 2) {
      /* 개체값 구간 — 날마다 목표 쪽으로 비례해서 오른다 (취소해도 오른 만큼은 남는다) */
      if (job.elapsed <= job.ivDays) {
        const f = job.elapsed / job.ivDays;
        for (const k of IV_KEYS) mon.ivs[k] = job.from.ivs[k] + Math.round((job.targets[k] - job.from.ivs[k]) * f);
        if (job.elapsed === job.ivDays) lines.push({ species: mon.species, text: `개체값 훈련 완료 · ${IV_KEYS.map(k => `${IV_LABELS[k]} ${mon.ivs[k]}`).join(' / ')}` });
      } else {
        const f = (job.elapsed - job.ivDays) / job.evDays;
        for (const k of IV_KEYS) mon.evs[k] = Math.round((job.from.evs[k] || 0) + (job.evTargets[k] - (job.from.evs[k] || 0)) * f);
        if (job.elapsed === job.totalDays) lines.push({ species: mon.species, text: `노력치 훈련 완료 · ${IV_KEYS.filter(k => mon.evs[k]).map(k => `${IV_LABELS[k]} ${mon.evs[k]}`).join(' / ') || '노력치 없음'}` });
      }
    } else {
      /* 개편 전 저장의 훈련 — 1포인트씩 */
      const step = job.steps[job.index]; step.remaining = (step.remaining ?? step.days) - 1;
      if (step.remaining <= 0) { mon.ivs[step.stat] = step.value; job.index++; lines.push({ species: mon.species, text: `${IV_LABELS[step.stat]} 개체값 ${step.value} 달성` }); }
      if (job.index < job.steps.length) continue;
    }
    if (job.elapsed >= job.totalDays || (job.v !== 2)) { delete mon.training; lines.push({ species: mon.species, text: '트레이닝 센터 훈련 완료 · 파티 합류 가능' }); }
  }
  return lines;
}

/** 민트 — 능력 보정만 바뀌는 원작과 달리 여기서는 성격 자체를 바꾸고, 원래 성격은 기록해둔다. 즉시 적용 */
export function applyMint(game, mon, nature) {
  const agency = agencyOf(game);
  if (!ownedMon(game, mon)) return fail('우리 포켓몬이 아닙니다.');
  if (!Dex.natures.get(nature).exists) return fail('없는 성격입니다.');
  if (mon.nature === nature) return fail('이미 그 성격입니다.');
  if (agency.funds < TRAINING.mintPrice) return fail(`자금이 부족합니다. 민트는 ₽${TRAINING.mintPrice.toLocaleString()}입니다.`);
  agency.funds -= TRAINING.mintPrice;
  mon.natureOrig ??= mon.nature;
  mon.nature = nature;
  if (mon.natureOrig === nature) delete mon.natureOrig;
  return { ok: true, msg: `민트를 먹였습니다. 성격 보정이 바로 바뀌었습니다. (−₽${TRAINING.mintPrice.toLocaleString()})` };
}
