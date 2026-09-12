/** Temporary tuning values, not permanent balance rules. Compliance uses 0..1. */
export const POLICY_CONFIG = { defaultCompliance: 0.5, minimumExecution: 0.35, scoreScale: 12, concernGap: 18 };
export const BATTLE_POLICIES = {
  balanced: { name: '균형 운영', hint: '트레이너 본래의 판단과 스타일을 따릅니다.', attack: 0, switch: 0 },
  aggressive: { name: '공격적으로', hint: '공격 기회를 우선하고 교체에는 더 신중합니다.', attack: 1, switch: -0.7 },
  safe: { name: '안정적으로', hint: '명중이 안정적인 공격과 피해를 줄이는 교체를 선호합니다.', attack: 0, switch: 0.8 },
};
export const policyId = id => Object.hasOwn(BATTLE_POLICIES, id) ? id : 'balanced';
export function policyWeight(stats, compliance) {
  const c = Number.isFinite(compliance) ? Math.max(0, Math.min(1, compliance)) : POLICY_CONFIG.defaultCompliance;
  return c * (POLICY_CONFIG.minimumExecution + (1-POLICY_CONFIG.minimumExecution)*Math.max(0,Math.min(1,stats.judge/20)));
}
export function policyAdjustment(id, option, weight) {
  const p = BATTLE_POLICIES[policyId(id)];
  if (id === 'balanced') return 0;
  if (option.kind === 'switch') return POLICY_CONFIG.scoreScale * weight * p.switch * (option.safer ? 1 : 0);
  if (option.category === 'Status') return 0;
  return POLICY_CONFIG.scoreScale * weight * (id === 'safe' ? ((option.accuracy/100)-0.85)*4 : p.attack);
}
