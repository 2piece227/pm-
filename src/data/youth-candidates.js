/**
 * 오프닝 유스 후보 — 첫 트레이너 계약 상대. (SPEC §3.10 / §5.3)
 *
 * 후보마다 **가중 선호 프로필**을 갖고, 그 프로필로 계약 제안을 수락/거부한다.
 * 후보를 늘릴 땐 여기 항목만 추가하면 된다 — 판정 로직(engine/contract.js)은 안 건드린다.
 *
 * 선호 항목은 전부 같은 모양이다:
 *   { want: 기준값, weight: 중요도(0이면 아예 신경 안 씀), kind: 'more' | 'near' }
 *     more — 많이 줄수록 좋다. want는 "이 정도는 돼야 한다"는 선
 *     near — 원하는 값에 가까울수록 좋다 (계약 기간처럼 길다고 좋은 게 아닌 항목)
 *
 * 세 명은 난이도와 성향을 각각 대표하도록 잡았다:
 *   오성 쉬움 / 무관심   — 조건을 거의 안 따진다
 *   채아 중간 / 성과중시 — 뱃지 보너스를 붙여주면 넘어온다
 *   블루 까다로움 / 평판중시 — 소속사 간판부터 본다. 돈으로만은 잘 안 온다
 */

/** 최대 스탯(PA) 대비 지금 실력(CA) 비율 — 유스라 아직 한참 아래다 */
const YOUTH_CA_RATIO = 0.45;

export const YOUTH_CANDIDATES = [
  {
    id: 'y-oseong',
    name: '오성',
    tag: '가명',
    blurb: '조건을 거의 안 따진다. 일단 배틀만 하게 해주면 된다는 쪽.',
    /* PA — 판단력/운영/집중력/지식/멘탈 */
    potential: { judge: 12, ops: 10, focus: 9, know: 14, mental: 20 },
    pref: {
      reputation: { want: 10, weight: 0, kind: 'more' },
      wage: { want: 7, weight: 3, kind: 'more' },
      signing: { want: 0, weight: 0, kind: 'more' },
      proRaise: { want: 100, weight: 0, kind: 'more' },
      badgeBonus: { want: 0, weight: 0, kind: 'more' },
      years: { want: 3, weight: 1, kind: 'near' },
    },
  },
  {
    id: 'y-chaea',
    name: '채아',
    tag: '가명',
    blurb: '성과로 보상받고 싶어 한다. 뱃지마다 얹어주면 눈빛이 달라진다.',
    potential: { judge: 15, ops: 14, focus: 12, know: 15, mental: 17 },
    pref: {
      reputation: { want: 20, weight: 0, kind: 'more' },
      wage: { want: 15, weight: 3, kind: 'more' },
      signing: { want: 120, weight: 1, kind: 'more' },
      proRaise: { want: 110, weight: 1, kind: 'more' },
      badgeBonus: { want: 60, weight: 3, kind: 'more' },
      years: { want: 3, weight: 1, kind: 'near' },
    },
  },
  {
    id: 'y-blue',
    name: '블루',
    tag: null,
    blurb: '간판을 본다. 어디서 시작하느냐가 자기 커리어라고 생각하는 쪽.',
    potential: { judge: 18, ops: 17, focus: 14, know: 17, mental: 18 },
    pref: {
      reputation: { want: 45, weight: 3, kind: 'more' },
      wage: { want: 20, weight: 4, kind: 'more' },
      signing: { want: 400, weight: 4, kind: 'more' },
      proRaise: { want: 150, weight: 4, kind: 'more' },
      badgeBonus: { want: 0, weight: 0, kind: 'more' },
      years: { want: 5, weight: 3, kind: 'near' },
    },
  },
];

/** PA에서 시작 실력(CA)을 만든다 — 같은 후보는 늘 같은 값 */
export function youthStats(candidate) {
  const stats = {};
  for (const [k, pa] of Object.entries(candidate.potential)) {
    stats[k] = Math.round(pa * YOUTH_CA_RATIO * 10) / 10;
  }
  return stats;
}
