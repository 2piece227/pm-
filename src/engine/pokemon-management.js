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
  ivDays: 1, highIvDays: 2,   // [임시값] 개체값 1포인트당 일수 (26 이상은 더 오래) — 2026-10-23 절반으로 단축
  /* 컨디션 [임시값] — 패배가 주 원인. 활동·휴식은 곁가지다 (사용자 확정 2026-10-22)
     lossHit: 한 번 질 때 (멘탈이 높을수록 덜), winRecover: 이길 때 회복,
     activityFatigue: 활동 1회, restRecovery: 휴식한 날 추가 회복, dailyRecovery: 매일 자연 회복 */
  lossHit: 9, winRecover: 3, activityFatigue: 0.4, restRecovery: 4, dailyRecovery: 2,
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

export function trainingQuote(mon, targets) {
  if(!targets||IV_KEYS.some(k=>!Number.isInteger(targets[k])||targets[k]<mon.ivs[k]||targets[k]>31)) return fail('현재 개체값 이상, 최대 31까지 목표를 설정하세요.');
  const steps=[];
  for(const k of IV_KEYS) for(let value=mon.ivs[k]+1;value<=targets[k];value++) steps.push({stat:k,value,days:value>=26?MANAGEMENT.highIvDays:MANAGEMENT.ivDays});
  if(!steps.length) return fail('올릴 개체값을 하나 이상 선택하세요.');
  return {ok:true,steps,days:steps.reduce((n,s)=>n+s.days,0),points:steps.length};
}
export function startTraining(game, mon, targets) {
  if(!agencyOf(game).box.includes(mon)||mon.training) return fail('박스에 있고 훈련 중이 아닌 포켓몬을 선택하세요.');
  const quote=trainingQuote(mon,targets);if(!quote.ok)return quote;
  mon.training={targets:{...targets},steps:quote.steps,index:0,elapsed:0,totalDays:quote.days,startedDay:game.day};
  return {ok:true,msg:`${quote.days}일 훈련을 배정했습니다.`};
}
export function tickTraining(game) {
  const lines=[];
  for(const mon of agencyOf(game).box) {
    const job=mon.training;if(!job)continue;
    job.elapsed++;
    const step=job.steps[job.index];step.remaining=(step.remaining??step.days)-1;
    if(step.remaining<=0) {mon.ivs[step.stat]=step.value;job.index++;lines.push({species:mon.species,text:`${IV_LABELS[step.stat]} 개체값 ${step.value} 달성`});}
    if(job.index>=job.steps.length){delete mon.training;lines.push({species:mon.species,text:'트레이닝 센터 훈련 완료 · 파티 합류 가능'});}
  }
  return lines;
}
