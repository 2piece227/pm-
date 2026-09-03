/**
 * 데미지 추정 — AI 레이어 전용.
 *
 * 실제 데미지 해결은 @pkmn/sim이 한다. 여기 있는 건 "어떤 수를 둘까"를 점수화하기 위한
 * 추정치일 뿐이며, 엔진의 정확한 값과 일치할 필요가 없다. (SPEC §5.2 — 두 레이어 분리)
 *
 * 핵심: neutralDamagePct()는 **상성을 곱하지 않은 맨몸 데미지**를 돌려준다.
 * SPEC §5.2의 함정 그대로 — 상성이 이미 적용된 값에 체감상성을 곱하면 0배 기술은
 * 데미지가 0이라 후보에조차 오르지 않고, 지식 낮은 트레이너가 리자몽에게 지진을
 * 날리는 실수를 영원히 못 하게 된다.
 */

/**
 * 스탯 20을 기준점으로 삼는 비선형 곡선. (SPEC §4.2, v3)
 * v=20에서는 원래 값 유지. v<20은 더 빨리 깎여 상단 구간(17~20) 차이가 벌어지고,
 * v>20(네임드 전용 확장치)은 계속 이득이 붙어 "역대급 천재"를 표현할 수 있다.
 * 검증: 올20 vs 올20 승률 62.6% -> 올20 vs 네임드(올25) 87.7% -> 올20 vs 네임드(올28) 93.2%.
 * 선형이던 v1~v2에서는 17~20 차이가 승률 5%p도 못 움직였다.
 */
export const curve = (v) => 20 * Math.pow(Math.max(0, v) / 20, 1.8);

/** curve() 기준 부족분/초과분의 비대칭 반응. 부족분은 그대로, 초과분은 gainDamp로 감쇠. */
export const shortfallEffect = (short, gainDamp) =>
  short >= 0 ? Math.pow(short, 1.7) * 0.55 : -Math.pow(-short, 1.7) * 0.55 * gainDamp;

/** 랭크 보정 배율 (−6 ~ +6) */
export const stageMul = (v) => (v >= 0 ? (2 + v) / 2 : 2 / (2 - v));

/** 실제 타입 상성 배율 (0 / 0.25 / 0.5 / 1 / 2 / 4) */
export function typeEff(gen, moveType, targetTypes) {
  if (!gen.getImmunity(moveType, targetTypes)) return 0;
  return Math.pow(2, gen.getEffectiveness(moveType, targetTypes));
}

/** 기술이 자신에게 거는 랭크 변화를 꺼낸다 (상태변화기 / 공격기 부가효과 양쪽 대응) */
export function selfBoostsOf(move) {
  if (move.target === 'self' && move.boosts) return move.boosts;
  if (move.self && move.self.boosts) return move.self.boosts;
  if (move.selfBoost && move.selfBoost.boosts) return move.selfBoost.boosts;
  return null;
}

/**
 * 상성을 뺀 기대 데미지 (방어측 최대 HP 대비 %).
 * 난수 평균 0.925 · 다단히트 평균 타수 · 명중률을 미리 반영한다.
 */
export function neutralDamagePct(attacker, defender, move) {
  if (move.category === 'Status') return 0;
  const bp = move.basePower;
  if (!bp) return 0;

  const phys = move.category === 'Physical';
  // unmodified=true: 랭크 보정은 반영하되 ModifyAtk 등 엔진 이벤트는 타지 않는다.
  // 이 함수는 턴 밖(행동 선택 시점)에서 불리므로 battle.activeMove가 없어 이벤트가 터진다.
  const A = attacker.getStat(phys ? 'atk' : 'spa', false, true);
  const D = defender.getStat(phys ? 'def' : 'spd', false, true);

  const base =
    Math.floor(Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * bp * A / D) / 50) + 2;

  let mod = 0.925; // 난수 0.85~1.00 기대값
  if (attacker.getTypes().includes(move.type)) mod *= 1.5; // 자속

  const dmg = Math.max(1, Math.floor(base * mod));
  const hits = Array.isArray(move.multihit)
    ? (move.multihit[0] + move.multihit[1]) / 2
    : move.multihit || 1;
  const acc = move.accuracy === true ? 1 : move.accuracy / 100;

  return (dmg * hits * acc) / defender.maxhp * 100;
}

/** 상성까지 적용한 기대 데미지 — "남은 턴" 추정에 쓰는 객관적 값 */
export function realDamagePct(gen, attacker, defender, move) {
  if (move.category === 'Status') return 0;
  return (
    neutralDamagePct(attacker, defender, move) *
    typeEff(gen, move.type, defender.getTypes())
  );
}

/** 그 포켓몬이 상대에게 낼 수 있는 최대타 (%/턴) */
export function bestDamagePct(gen, attacker, defender) {
  let best = 0;
  for (const slot of attacker.moveSlots) {
    const move = gen.moves.get(slot.id);
    if (!move || move.category === 'Status') continue;
    best = Math.max(best, realDamagePct(gen, attacker, defender, move));
  }
  return best;
}

export const hpPct = (mon) => Math.max(0, Math.round((mon.hp / mon.maxhp) * 100));
