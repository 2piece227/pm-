/**
 * 로즈 협회장의 리그 대개혁 (새 게임에만 적용 — game.reform)
 *
 *   2026 시즌(1시즌): 모든 소속사가 유스로만 시작. 배지 8개 프로급 영입·콜업 불가.
 *                     관동 4 + 성도 4 유스컵 시리즈 → 포인트 상위 8명 유스 그랑프리 파이널.
 *                     시즌 중반 시티컵 시범경기(8배지 유스 + 무소속 프로, 레벨 50 조정, 순위 미반영).
 *   2027 시즌부터:    프로 콜업·영입 열림, 시티컵·로컬컵(유스부/오픈부)·PWT 첫 개최.
 *
 * 날짜·상금·포인트는 [임시값].
 */
export const REFORM = {
  firstYear: 2026,
  youthOnlySeasons: [1],
  pwtFirstSeason: 2,
  gymInterval: 21,          // 배지를 딴 뒤 다음 관장전 신청까지 (일)
  proLevelCap: 50,          // 프로 공식전: 50 초과는 50으로
  clauses: ['species', 'item'],   // 프로 공식전: 같은 포켓몬·같은 도구 1개씩
};

/** 2026 시즌 일정 — day는 시즌 안의 날짜(1 = 3월 1일) */
export const SEASON1_SCHEDULE = [
  { kind: 'youth', day: 14, city: '상록시티', region: 'kanto' },
  { kind: 'youth', day: 42, city: '도라지시티', region: 'johto' },
  { kind: 'youth', day: 70, city: '블루시티', region: 'kanto' },
  { kind: 'youth', day: 98, city: '금빛시티', region: 'johto' },
  { kind: 'youth', day: 133, city: '갈색시티', region: 'kanto' },
  { kind: 'youth', day: 168, city: '인주시티', region: 'johto' },
  { kind: 'demo', day: 196, city: '노랑시티', region: 'kanto', label: '시티컵 시범경기 1차' },
  { kind: 'youth', day: 224, city: '무지개시티', region: 'kanto' },
  { kind: 'youth', day: 252, city: '진청시티', region: 'johto' },
  { kind: 'demo', day: 280, city: '금빛시티', region: 'johto', label: '시티컵 시범경기 2차' },
  { kind: 'youth-final', day: 308, city: '석영고원', region: 'kanto', label: '유스 그랑프리 파이널' },
];
/** 유스 시리즈 포인트: 우승·준우승·4강·8강 */
export const SERIES_POINTS = [10, 6, 3, 1];
export const REFORM_PRIZE = { youth: 3, 'youth-final': 10, demo: 1.5 };   // SEASON.prize 배수
/** 소속사 등급 = 모기업 지원 규모: 주간 지원금, 시작 유스 수 */
export const PARENT_SUPPORT = {
  major: { weekly: 1200, youths: 1, npcYouths: 3 },
  semi: { weekly: 900, youths: 1, npcYouths: 3 },
  mid: { weekly: 600, youths: 1, npcYouths: 2 },
  small: { weekly: 300, youths: 0, npcYouths: 2 },
  indie: { weekly: 0, youths: 0, npcYouths: 2 },
};
/** NPC 유스 성장 기준 곡선 — 잘 운영한 유스 시뮬레이션 실측(관장전 간격 반영) [일, 선두 레벨] */
export const NPC_CURVE = [[0, 5], [8, 15], [18, 25], [25, 31], [40, 40], [60, 46], [90, 52], [130, 57], [170, 62], [230, 66], [300, 70], [365, 73]];

export const ROSE_BRIEFING = [
  '처음 뵙겠습니다. 포켓몬 글로벌 리그 협회장 로즈입니다.',
  '지금 리그에는 큰 문제가 있습니다. 강한 트레이너는 늘 이기고, 대부분의 트레이너는 지기만 하지요.',
  '그래서 협회는 소속사 제도를 도입합니다. 기업과 단체가 트레이너를 지원하고, 함께 성장하는 리그입니다.',
  '첫 시즌인 2026년에는 모든 소속사가 유스로만 시작합니다. 배지 8개를 모은 프로급 트레이너는 영입할 수 없습니다.',
  '대신 관동 4곳, 성도 4곳에서 유스컵이 열리고, 시즌 중반에는 시티컵 시범경기도 엽니다. 시즌 끝에는 상위 8명이 겨루는 유스 그랑프리 파이널이 기다립니다.',
  'PWT는 2027년에 처음 열립니다. 여러분의 유스가 이 리그의 첫 세대가 됩니다. 기대하겠습니다, 대표님.',
];
