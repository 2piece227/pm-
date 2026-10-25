/**
 * 원작 Battle::AI::Handlers — 함수 코드별 판단 조각을 모아 두는 곳.
 * 효과 파일(effects-*.js)이 여기에 등록하고, ai.js가 꺼내 쓴다. 같은 이름을 다시 등록하면 덮어쓴다
 * (Gen9 팩이 원작 핸들러를 바꾸는 방식 그대로).
 */
export const MOVE_FAIL_SCORE = 20;
export const MOVE_USELESS_SCORE = 60;
export const MOVE_BASE_SCORE = 100;

const table = () => new Map();
export const H = {
  moveFailure: table(),              // (move, user, ai, battle) => bool
  moveFailureAgainstTarget: table(), // (move, user, target, ai, battle) => bool
  moveEffect: table(),               // (score, move, user, ai, battle) => score
  moveEffectAgainstTarget: table(),  // (score, move, user, target, ai, battle) => score
  moveBasePower: table(),            // (power, move, user, target, ai, battle) => power
  generalMove: table(),              // 이름 → (score, move, user, ai, battle) => score
  generalMoveAgainstTarget: table(), // 이름 → (score, move, user, target, ai, battle) => score
  shouldSwitch: table(),             // 이름 → (battler, reserves, ai, battle) => bool
  shouldNotSwitch: table(),
  abilityRanking: table(),           // 특성 → (ability, score, battler, ai) => score
  itemRanking: table(),              // 도구 → (item, score, battler, ai) => score
  itemRankingIf: [],                 // [조건, 핸들러]
};

/** 등록 — 원작 .add */
export const add = (kind, key, fn) => { H[kind].set(key, fn); };
/** 복사 — 원작 .copy(원본, 대상…). 원작처럼 원본이 없으면 아무 일도 하지 않는다 */
export const copy = (kind, from, ...to) => {
  const fn = H[kind].get(from);
  if (!fn) return;
  for (const key of to) H[kind].set(key, fn);
};

export const handlers = {
  moveWillFail(code, ...args) { return H.moveFailure.get(code)?.(...args) || false; },
  moveWillFailAgainstTarget(code, ...args) { return H.moveFailureAgainstTarget.get(code)?.(...args) || false; },
  applyMoveEffectScore(code, score, ...args) {
    const fn = H.moveEffect.get(code);
    const ret = fn ? fn(score, ...args) : undefined;
    return ret ?? score;
  },
  applyMoveEffectAgainstTargetScore(code, score, ...args) {
    const fn = H.moveEffectAgainstTarget.get(code);
    const ret = fn ? fn(score, ...args) : undefined;
    return ret ?? score;
  },
  getBasePower(code, power, ...args) {
    const fn = H.moveBasePower.get(code);
    const ret = fn ? fn(power, ...args) : undefined;
    return ret ?? power;
  },
  applyGeneralMoveScoreModifiers(score, ...args) {
    for (const fn of H.generalMove.values()) { const s = fn(score, ...args); if (s !== undefined && s !== null) score = s; }
    return score;
  },
  applyGeneralMoveAgainstTargetScoreModifiers(score, ...args) {
    for (const fn of H.generalMoveAgainstTarget.values()) { const s = fn(score, ...args); if (s !== undefined && s !== null) score = s; }
    return score;
  },
  shouldSwitch(...args) {
    for (const [name, fn] of H.shouldSwitch) if (fn(...args)) return name;
    return null;
  },
  shouldNotSwitch(...args) {
    for (const [name, fn] of H.shouldNotSwitch) if (fn(...args)) return name;
    return null;
  },
  modifyAbilityRanking(ability, score, ...args) {
    const fn = H.abilityRanking.get(ability);
    const ret = fn ? fn(ability, score, ...args) : undefined;
    return ret ?? score;
  },
  modifyItemRanking(item, score, ...args) {
    let fn = H.itemRanking.get(item);
    if (!fn) fn = H.itemRankingIf.find(([cond]) => cond(item))?.[1];
    const ret = fn ? fn(item, score, ...args) : undefined;
    return ret ?? score;
  },
};
