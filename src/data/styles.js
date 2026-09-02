/**
 * 플레이 스타일 = 기존 점수식에 곱하는 가중치 벡터. (SPEC §4.3)
 * 새 스타일을 늘리려면 여기에 벡터 한 줄만 추가하면 된다. 로직은 건드리지 않는다.
 *   phys/spec : 공격기 점수 배율
 *   status    : 기점기(랭크업) 점수 배율
 *   sw        : 교체 점수 배율
 */
export const STYLES = {
  대면형: { phys: 1.3, spec: 1.3, status: 0.55, sw: 0.7 },
  기점형: { phys: 0.95, spec: 0.95, status: 1.8, sw: 1.0 },
  균형형: { phys: 1.0, spec: 1.0, status: 1.0, sw: 1.0 },
};

export const STAT_KO = {
  judge: '판단력',
  ops: '운영',
  focus: '집중력',
  know: '지식',
  mental: '멘탈',
};
