/**
 * 변화기 평가 — 흩뿌리기·상태이상·상대 능력 하락·방어/스피드 랭크업.
 * 공격기 점수(기대 데미지 %)와 같은 눈금으로 맞춘다. 수치는 [임시값].
 * 2026-10-23 제보: 예전에는 공격·특공 랭크업이 아닌 변화기는 전부 −25라 스텔스록·독독·전기자석파를 사실상 안 썼다.
 */
import { typeEff, groundedForEstimate, stageMul } from './estimate.js';

/** 누가 봐도 헛수인 경우(이미 깔림·이미 상태이상·효과 없음을 봄) — 판단력이 낮아도 거의 안 고르게 */
export const POINTLESS = -90;

const SLEEP_BLOCK = ['insomnia', 'vitalspirit', 'sweetveil', 'comatose'];
const STATUS_BLOCK = { par: ['limber'], brn: ['waterveil', 'waterbubble'], psn: ['immunity', 'pastelveil'], tox: ['immunity', 'pastelveil'], slp: SLEEP_BLOCK, frz: ['magmaarmor'] };

/** 이 상태이상이 상대에게 걸리기는 하나 (공개 정보로 판정) */
export function statusLands(gen, move, me, foe) {
  const s = move.status, types = foe.getTypes();
  if (!s || foe.status) return false;
  if (STATUS_BLOCK[s]?.includes(foe.ability)) return false;
  if (foe.side?.sideConditions?.safeguard) return false;
  if (move.flags?.powder && types.includes('Grass')) return false;
  if ((s === 'psn' || s === 'tox') && (types.includes('Poison') || types.includes('Steel')) && me.ability !== 'corrosion') return false;
  if (s === 'brn' && types.includes('Fire')) return false;
  if (s === 'par' && types.includes('Electric')) return false;
  if (s === 'frz' && types.includes('Ice')) return false;
  /* 전기자석파처럼 타입 상성이 걸리는 변화기 (땅 타입은 전기자석파 무효) */
  if (!move.ignoreImmunity && move.type !== 'Normal' && typeEff(gen, move.type, types) === 0) return false;
  const terrain = foe.battle?.field?.terrain;
  if (groundedForEstimate(foe) && (terrain === 'mistyterrain' || (s === 'slp' && terrain === 'electricterrain'))) return false;
  return true;
}

const hitChance = (move, me, foe) => {
  if (move.accuracy === true) return 1;
  const stage = Math.max(-6, Math.min(6, (me.boosts?.accuracy || 0) - (foe.boosts?.evasion || 0)));
  return Math.min(1, move.accuracy / 100 * (stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage)));
};

/**
 * @param ctx { myBest, foeBest, R, turnsSurvive, turnsToKO, foeOthers, foePhysical, faster }
 * @returns 점수 또는 null(여기서 다루지 않는 기술)
 */
export function statusMoveScore(gen, move, me, foe, ctx) {
  const foeSide = foe.side?.sideConditions || {};
  const turnsLeft = Math.max(1, Math.min(ctx.turnsToKO, 5));
  const field = fieldMoveScore(gen, move, me, foe, ctx);
  if (field !== null) return field;

  /* 흩뿌리기 — 앞으로 나올 상대 수만큼 값이 있다 */
  if (move.sideCondition && move.target === 'foeSide') {
    const others = ctx.foeOthers;
    if (!others) return -30;
    /* 나올 상대마다 한 번 이상 밟는다 + 교체할 때마다 또 — 원작에서 선봉이 먼저 까는 이유 */
    const entries = others * 1.3;
    if (move.sideCondition === 'stealthrock') return foeSide.stealthrock ? POINTLESS : entries * 12.5;
    if (move.sideCondition === 'spikes') { const n = foeSide.spikes?.layers || 0; return n >= 3 ? POINTLESS : entries * [12.5, 4.2, 8.3][n]; }
    if (move.sideCondition === 'toxicspikes') { const n = foeSide.toxicspikes?.layers || 0; return n >= 2 ? POINTLESS : entries * (n ? 5 : 11); }
    if (move.sideCondition === 'stickyweb') return foeSide.stickyweb ? POINTLESS : entries * 7;
    return null;
  }

  /* 주 상태이상 */
  if (move.status) {
    if (foe.status) return POINTLESS;
    if (!statusLands(gen, move, me, foe)) return -50;
    const acc = hitChance(move, me, foe);
    let value;
    if (move.status === 'slp') value = 22 + ctx.myBest * 1.2;
    else if (move.status === 'par') value = 16 + (ctx.faster ? 0 : 14);
    else if (move.status === 'tox') value = 6.25 * (turnsLeft * (turnsLeft + 1) / 2) * 0.7 + 8;
    else if (move.status === 'psn') value = 12.5 * turnsLeft * 0.6;
    else if (move.status === 'brn') value = 6.25 * turnsLeft + (ctx.foePhysical ? 22 : 0);
    else value = 15;
    return Math.min(60, value) * acc;
  }

  /* 혼란·씨뿌리기 같은 부가 상태 */
  if (move.volatileStatus && move.target !== 'self') {
    if (foe.volatiles?.[move.volatileStatus]) return POINTLESS;
    const acc = hitChance(move, me, foe);
    if (move.volatileStatus === 'leechseed') return foe.getTypes().includes('Grass') ? -50 : 12.5 * turnsLeft * 0.7 * acc;
    if (move.volatileStatus === 'confusion') return foe.ability === 'owntempo' ? -50 : 14 * acc;
    if (move.volatileStatus === 'yawn') return foe.status || SLEEP_BLOCK.includes(foe.ability) ? -50 : 20;
    return null;
  }

  /* 상대 능력 하락 (연막·울음소리·싫은소리 …) — 이미 많이 떨어졌으면 값이 준다 */
  if (move.boosts && move.target !== 'self') {
    const acc = hitChance(move, me, foe);
    let value = 0;
    for (const [k, n] of Object.entries(move.boosts)) {
      if (n >= 0) continue;
      const cur = foe.boosts?.[k] || 0;
      if (cur <= -6) continue;
      const room = Math.max(0, 1 - Math.abs(Math.min(0, cur)) * 0.22);
      const per = k === 'accuracy' ? 9 : k === 'atk' ? (ctx.foePhysical ? 8 : 2) : k === 'spa' ? (ctx.foePhysical ? 2 : 8)
        : k === 'def' || k === 'spd' ? ctx.myBest * 0.25 * Math.max(1, ctx.R - 1) / 2 : k === 'spe' ? (ctx.faster ? 2 : 7) : 4;
      value += per * -n * room;
    }
    return value ? value * acc : -30;
  }

  return null;
}

/** 공격·특공이 아닌 자기 랭크업 (단단해지기·고속이동 …) */
export function defensiveSetupScore(move, boosts, me, ctx) {
  let value = 0;
  if (boosts.spe > 0 && !ctx.faster && (me.boosts.spe || 0) < 2) value += ctx.myBest * 0.6 * Math.max(0, ctx.R - 1);
  const guard = ctx.foePhysical ? 'def' : 'spd';
  if (boosts[guard] > 0 && (me.boosts[guard] || 0) < 4) {
    const cut = 1 - stageMul(me.boosts[guard] || 0) / stageMul(Math.min(6, (me.boosts[guard] || 0) + boosts[guard]));
    value += ctx.foeBest * cut * Math.min(4, ctx.turnsSurvive);
  }
  return value ? value - ctx.myBest * 0.6 : null;
}

/* ---------------- 필드를 보고 쓰는 변화기 ---------------- */

const ROCK_GROUND_STEEL = ['Rock', 'Ground', 'Steel'];
/** 이 포켓몬이 가진 공격기 타입 (공개 정보) */
function attackTypes(gen, mon) {
  const out = new Set();
  for (const slot of mon.moveSlots || []) { const m = gen.moves.get(slot.id); if (m?.exists && m.category !== 'Status') out.add(m.type); }
  return out;
}
/** 앞으로 몇 턴 동안 이 효과를 우리 쪽이 누리나 — 지금 포켓몬이 버티는 턴 + 뒤에 남은 동료 */
const teamTurns = (ctx, cap) => Math.max(1, Math.min(cap, ctx.turnsSurvive + (ctx.allies || 0)));

/**
 * 벽·순풍·날씨·필드·트릭룸·흩뿌리기 제거·흑안개·날려보내기·방어.
 * 이미 걸려 있으면 헛수(POINTLESS), 풀리면 그 턴부터 다시 값이 생긴다 — 매 턴 지금 필드를 보고 매긴다.
 */
export function fieldMoveScore(gen, move, me, foe, ctx) {
  const mine = me.side?.sideConditions || {}, theirs = foe.side?.sideConditions || {};
  const fieldState = me.battle?.field || {}, weather = fieldState.weather || '', terrain = fieldState.terrain || '';
  const pseudo = fieldState.pseudoWeather || {};

  /* 벽 — 받는 쪽 공격 종류에 맞는 벽만 값이 있다 */
  if (move.target === 'allySide' && ['reflect', 'lightscreen', 'auroraveil'].includes(move.sideCondition)) {
    if (mine[move.sideCondition] || (move.sideCondition !== 'auroraveil' && mine.auroraveil)) return POINTLESS;
    if (move.sideCondition === 'auroraveil' && !['hail', 'snow', 'snowscape'].includes(weather)) return POINTLESS;
    const fits = move.sideCondition === 'auroraveil' || (move.sideCondition === 'reflect') === ctx.foePhysical;
    return fits ? ctx.foeBest * 0.5 * teamTurns(ctx, 5) * 0.8 : 4;
  }
  /* 순풍 — 느릴 때만 */
  if (move.sideCondition === 'tailwind') {
    if (mine.tailwind) return POINTLESS;
    return ctx.faster ? -20 : ctx.myBest * 0.55 * teamTurns(ctx, 4);
  }
  /* 신비의부적·흰안개 — 상대가 상태이상·능력 하락을 쓸 때만 */
  if (move.sideCondition === 'safeguard' || move.sideCondition === 'mist') return mine[move.sideCondition] ? POINTLESS : -15;

  /* 날씨 — 우리 기술·특성에 이득, 상대에 손해일 때 */
  if (move.weather) {
    const w = move.weather.toLowerCase();
    if (weather === w || (w === 'snowscape' && weather === 'snow')) return POINTLESS;
    if (['desolateland', 'primordialsea', 'deltastream'].includes(weather)) return POINTLESS;
    const myT = attackTypes(gen, me), foeT = attackTypes(gen, foe), turns = teamTurns(ctx, 5);
    let gain = 0;
    const boosted = w === 'sunnyday' ? 'Fire' : w === 'raindance' ? 'Water' : null, cut = w === 'sunnyday' ? 'Water' : w === 'raindance' ? 'Fire' : null;
    if (boosted) {
      if (myT.has(boosted)) gain += ctx.myBest * 0.4;
      if (myT.has(cut)) gain -= ctx.myBest * 0.3;
      if (foeT.has(boosted)) gain -= ctx.foeBest * 0.4;
      if (foeT.has(cut)) gain += ctx.foeBest * 0.4;
      const speedAbility = w === 'sunnyday' ? 'chlorophyll' : 'swiftswim';
      if (me.ability === speedAbility && !ctx.faster) gain += ctx.myBest * 0.6;
    }
    if (w === 'sandstorm') {
      const hurt = m => !m.getTypes().some(t => ROCK_GROUND_STEEL.includes(t)) && !['sandveil', 'sandrush', 'sandforce', 'overcoat', 'magicguard'].includes(m.ability);
      gain += (hurt(foe) ? 6.25 : 0) - (hurt(me) ? 6.25 : 0) + (me.getTypes().includes('Rock') ? ctx.foeBest * 0.2 : 0);
    }
    if (w === 'hail' || w === 'snowscape') gain += me.getTypes().includes('Ice') ? ctx.foeBest * 0.2 : 0;
    return gain > 0 ? gain * turns - ctx.myBest * 0.5 : -30;
  }

  /* 필드 — 땅에 붙은 우리 기술 타입이 강해질 때 */
  if (move.terrain) {
    if (terrain === move.terrain) return POINTLESS;
    const type = { electricterrain: 'Electric', grassyterrain: 'Grass', psychicterrain: 'Psychic', mistyterrain: null }[move.terrain];
    let gain = type && attackTypes(gen, me).has(type) && groundedForEstimate(me) ? ctx.myBest * 0.3 : 0;
    if (move.terrain === 'grassyterrain' && groundedForEstimate(me)) gain += 6.25;
    if (move.terrain === 'mistyterrain' && !me.status) gain += 5;
    return gain > 0 ? gain * teamTurns(ctx, 5) - ctx.myBest * 0.5 : -30;
  }

  /* 트릭룸 — 우리가 느릴 때만, 이미 걸려 있으면 다시 쓰면 풀린다 */
  if (move.pseudoWeather === 'trickroom') {
    if (pseudo.trickroom) return POINTLESS;
    return ctx.faster ? -60 : ctx.myBest * 0.6 * teamTurns(ctx, 4) - ctx.myBest;
  }

  /* 흩뿌리기 제거 (안개제거) — 우리 쪽에 깔린 만큼, 상대 쪽 것도 같이 지워지는 손해는 뺀다 */
  if (move.id === 'defog' || move.id === 'courtchange') {
    const weight = c => (c.stealthrock ? 12.5 : 0) + (c.spikes ? 8 * (c.spikes.layers || 1) : 0) + (c.toxicspikes ? 8 : 0) + (c.stickyweb ? 7 : 0);
    const ours = weight(mine) * Math.max(1, ctx.allies || 0), lost = weight(theirs) * Math.max(1, ctx.foeOthers || 0);
    const value = move.id === 'courtchange' ? ours + lost : ours - lost;
    return ours <= 0 ? POINTLESS : value;
  }

  /* 흑안개 — 상대 랭크업을 지운다 (우리 것도 지워진다) */
  if (move.id === 'haze') {
    const sum = (b, sign) => Object.values(b || {}).reduce((n, v) => n + Math.max(0, sign * v), 0);
    const value = sum(foe.boosts, 1) * 10 + sum(me.boosts, -1) * 6 - sum(me.boosts, 1) * 10;
    return value <= 0 ? POINTLESS : value;
  }

  /* 날려보내기(울부짖기·날려버리기) — 랭크를 쌓은 상대를 빼고, 흩뿌리기 피해를 준다 */
  if (move.forceSwitch && move.category === 'Status') {
    if (!ctx.foeOthers) return POINTLESS;
    const ups = Object.values(foe.boosts || {}).reduce((n, v) => n + Math.max(0, v), 0);
    const hazard = (theirs.stealthrock ? 12.5 : 0) + (theirs.spikes ? 8 * (theirs.spikes.layers || 1) : 0);
    return ups * 11 + hazard + 3 - ctx.myBest * 0.3;
  }

  /* 방어 — 상대가 독·화상·씨뿌리기로 깎이고 있을 때 시간을 번다. 연속 사용은 거의 실패한다 */
  if (move.stallingMove) {
    if (me.volatiles?.stall) return -70;
    const tick = (foe.status === 'brn' ? 6.25 : 0) + (foe.status === 'psn' ? 12.5 : 0) + (foe.status === 'tox' ? 6.25 * ((foe.statusState?.stage || 0) + 1) : 0) + (foe.volatiles?.leechseed ? 12.5 : 0);
    return tick ? tick * 1.4 - 2 : -20;
  }
  return null;
}
