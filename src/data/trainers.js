/**
 * 트레이너 정의. (SPEC §4)
 * 실력 스탯 5종은 각각 다른 층위에 작동하므로 역할이 겹치지 않는다:
 *   judge  판단력 — 매 턴 행동 선택 (softmax 온도)
 *   ops    운영   — 교체/회복 임계값
 *   focus  집중력 — 배틀 내 시간 경과에 따른 온도 상승
 *   know   지식   — 상성 판정 노이즈
 *   mental 멘탈   — 아군이 쓰러진 직후 온도 상승
 */
export const TRAINERS = {
  A: {
    name: '난천',
    stats: { judge: 18, ops: 19, focus: 18, know: 17, mental: 20 },
    style: '대면형',
  },
  B: {
    name: '단델',
    stats: { judge: 20, ops: 20, focus: 20, know: 20, mental: 20 },
    style: '기점형',
  },
};

export const STAT_MAX = 20;
