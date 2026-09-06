/**
 * 소속사 / 트레이너 스키마 + 관동·성도 리그 라인업. (SPEC §3)
 *
 * SPEC §0.2 원칙: **스키마는 문서 최종 형태로 먼저 다 만든다.**
 * 코치·계약·바이아웃·PA/CA 같은 나중 단계 필드도 지금부터 존재하되,
 * 그걸 채우는 로직만 §13 우선순위대로 나중에 붙인다. 여기서 "일단 얕게"를 하면
 * 나중에 스키마를 갈아엎게 되므로 하지 않는다.
 */

/** 소속사 등급 4단계 + 플레이어용 '자체' (SPEC §3.2) */
export const AGENCY_TIERS = {
  major: '대기업',
  semi: '세미대기업',
  mid: '중견',
  small: '중소',
  indie: '자체',
};

/**
 * 관동·성도 리그 라인업 — SPEC §3.6 확정분.
 * 등급 판정은 §3.2 기준(원작에서 차지한 영향력 범위)을 따른다.
 */
export const KANTO_JOHTO_AGENCIES = [
  {
    id: 'silph',
    name: '실프주식회사',
    tier: 'major',
    concept: '정통 육성. 관동 최대 기업.',
    rosterProfile: 'elite',      // 팀 조립 프로필 (team-builder.js)
    statRange: [15, 20],         // 소속 트레이너 스탯 범위
    policy: { aggression: 0.7 }, // §3.5 참가 판단 — 공격적 확장형 ↔ 안정 운영형
    funds: 24000,
    reputation: 85,
  },
  {
    id: 'rocket',
    name: '로켓단',
    tier: 'semi',
    concept: '조무래기 양성. 순응도 높은 트레이너 우선, 만족도/평판 페널티 무시.',
    rosterProfile: 'grunt',      // 수는 많되 개체는 약한 "조무래기" (§3.6)
    statRange: [8, 15],
    policy: { aggression: 1.0 }, // 페널티를 무시하므로 어디든 들이민다
    funds: 15000,
    reputation: 45,
  },
  {
    id: 'rainbow',
    name: '무지개 코퍼레이션',
    tier: 'mid',
    concept: '프렌들리숍 납품 유통망. 자금은 있지만 육성 노하우가 약하다.',
    rosterProfile: 'mid',        // 노력치 투자(evLevel)가 낮은 프로필 = "노하우 약함"
    statRange: [11, 17],
    policy: { aggression: 0.5 },
    funds: 12000,
    reputation: 55,
  },
  {
    id: 'doraji',
    name: '도라지 트레이더스',
    tier: 'small',
    concept: '도라지시티 백화점 중심. 성도 지역색.',
    rosterProfile: 'weak',
    statRange: [10, 16],
    policy: { aggression: 0.35 }, // 안정 운영형 — 승산 낮으면 안 나간다
    funds: 7000,
    reputation: 35,
  },
  {
    id: 'player',
    name: '신생 소속사',
    tier: 'indie',
    concept: '모기업 없음. 코치 0명, 실패 시 파산. (§3.3 자체)',
    /* 최신 세대 위주로 파티를 짠다 — 8·9세대 기술 연출을 내 트레이너 경기에서 바로 확인하려고 */
    rosterProfile: 'modern',
    statRange: [10, 16],
    policy: { aggression: 0.5 },
    funds: 3000,
    reputation: 20,
    isPlayer: true,
  },
];

/** 트레이너 이름 풀 — 네임드가 아닌 일반 소속 트레이너용 */
const GIVEN_NAMES = [
  '민준', '서연', '도윤', '하은', '시우', '지아', '주원', '수아', '건우', '유나',
  '지호', '채원', '현우', '다인', '준서', '예린', '유찬', '소율', '이안', '세빈',
  '태윤', '가은', '한결', '나윤', '재이', '서진', '연우', '지우', '시윤', '아린',
];
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오'];

/** 결정론적 이름 생성 (같은 시드 → 같은 리그) */
export function makeName(rng) {
  const s = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const g = GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)];
  return s + g;
}

/**
 * 트레이너 객체 — SPEC §4·§5.3의 최종 필드를 전부 갖춘 형태.
 * 이번 세션에서 실제로 쓰이는 건 stats / team / record 뿐이고,
 * 나머지는 §0.2에 따라 "필드는 있고 로직은 비어있는" 상태로 둔다.
 */
export function createTrainer({ id, name, agencyId, stats, potential, team }) {
  return {
    id,
    name,
    agencyId,

    /* §4.1 실력 스탯. 훈련·배틀로 잠재력까지 성장한다 (소수점 누적, 표시할 땐 반올림) */
    stats,

    /* §4.3 잠재력(PA) — 숨김. 훈련으로 오르지 않고 도달 상한만 정한다 */
    potential,

    /* §4.4 천성 — 스타일은 AI에 실제로 연결돼 있다 */
    nature: {
      compliance: null,     // 순응도 (미연결)
      preferredType: null,  // 선호 타입 (미연결)
      style: '균형형',
      stardom: null,
    },

    team,

    /* §4.5 컨디션 — 대회/훈련으로 깎이고 휴식으로 회복. 낮으면 배틀 능력이 떨어진다 */
    condition: 100,
    satisfaction: 70,
    mentalDebuff: 0,
    lossStreak: 0,

    /* 일일 경비 — 자금 압박의 핵심. 영입할수록 늘어난다 */
    salary: 0,

    /* §6 코치 — 필드만 */
    coachAssigned: null,

    /* §5.3 계약 — 이번엔 이적료만 쓰고 나머지는 필드만 */
    contract: {
      period: null,
      expenseSupport: null,
      winShare: null,
      lossShare: null,
      prizeShare: null,
      buyout: null,
    },

    record: { wins: 0, losses: 0, titles: 0 },

    /* 최근에 뭘 했는지 (UI 표시용) */
    lastAction: null,
  };
}

export const STAT_KEYS = ['judge', 'ops', 'focus', 'know', 'mental'];

/**
 * 컨디션이 반영된 실효 스탯. — 배틀에 실제로 들어가는 값.
 * 컨디션 100이면 그대로, 0이면 65%까지 떨어진다.
 * 이게 있어야 "연속 출전시키면 약해진다"가 성립하고, 로테이션 결정이 의미를 갖는다.
 */
export function effectiveStats(trainer) {
  const f = 0.65 + 0.35 * (Math.max(0, Math.min(100, trainer.condition)) / 100);
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.max(1, trainer.stats[k] * f);
  return out;
}

/** 표시용 정수 스탯 */
export function displayStats(trainer) {
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.round(trainer.stats[k]);
  return out;
}

/**
 * 소속사 객체 — SPEC §3의 최종 필드를 전부 갖춘 형태.
 */
export function createAgency(def) {
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    tierLabel: AGENCY_TIERS[def.tier],
    concept: def.concept,
    isPlayer: !!def.isPlayer,

    funds: def.funds,
    reputation: def.reputation,

    /* §3.5 참가 판단에 쓰이는 성향 */
    policy: { ...def.policy },

    /* 로스터 구성 규칙 — 이 소속사가 어떤 팀/스탯의 트레이너를 갖는지 */
    rosterProfile: def.rosterProfile,
    statRange: def.statRange,

    roster: [],

    /* §6 코치 — 필드만. 배정 로직 없음 */
    coaches: [],

    /* §5.4 스폰서 / §3.3 모기업 기대치 — 필드만 */
    sponsors: [],
    parentExpectation: null,

    record: { wins: 0, losses: 0, titles: 0, runnerUps: 0, semifinals: 0 },
  };
}
