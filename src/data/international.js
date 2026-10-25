/**
 * 국제 대회·지역 리그 설정 — docs/competition-v1.md (대회 체계 개편 명세 v1)
 * 국제 지방은 대회 전용이다: 맵을 해금하거나 원작 네임드를 배치하지 않는다.
 * 수치 [임시]는 전부 여기서 고친다.
 */

/** 9개 지방 — 이 순서가 PWT 개최지 순환 순서다 (§3, §8.2) */
export const INTERNATIONAL_REGIONS = [
  ['kanto','관동'],['johto','성도'],['hoenn','호연'],['sinnoh','신오'],['unova','하나'],
  ['kalos','칼로스'],['alola','알로라'],['galar','가라르'],['paldea','팔데아'],
].map(([id,name])=>({id,name}));
/** 플레이어가 뛰는 국내 지방 (관전·로그 저장 대상). 예전 저장의 통합 지방 'kanto-johto'도 국내로 본다 */
export const DOMESTIC_REGIONS = ['kanto','johto'];
export const isDomestic = region => DOMESTIC_REGIONS.includes(region) || region === 'kanto-johto';
export const regionName = id => id === 'kanto-johto' ? '관동·성도' : INTERNATIONAL_REGIONS.find(r => r.id === id)?.name || id;

/** 시리즈 형식별 필요 승수 (§4.1) */
export const WINS_NEEDED = { bo1: 1, bo3: 2, bo5: 3 };

/** 국제 대회 공통 (PWT·PWC): 플레이인 GSL 2조 → 스위스 32명 → 녹아웃 16명 */
const WORLD_COMMON = {
  level: 50, rosterSize: 6, perRegion: 4, swissSize: 32, knockoutSize: 16,
  stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 16 },
  clauses: ['species', 'item'],        // [미결정 #2] 시티컵과 같은 조항
};

export const PWT = {
  ...WORLD_COMMON,
  gymDay: 130, finalQualifierDay: 138,
  playInDays: [148, 149], swissDays: [150, 151, 152, 153, 154], knockoutDays: [156, 157, 158, 159],
  knockoutFormat: ['bo3', 'bo3', 'bo3', 'bo3'],          // 16강·8강·4강·결승
  breakStart: 130, breakEnd: 159, lockEnd: 365,
  /* 상금·평판 [임시] §13.1 */
  payout: { champion: [6000, 20], runner: [3000, 14], semi: [1500, 9], quarter: [800, 5], r16: [400, 3], swiss: [150, 1], playIn: [80, 0] },
  prize: 6000, runnerPrize: 3000, reputation: 20,      // 예전 저장 호환
};

export const PWC = {
  ...WORLD_COMMON,
  registrationDay: 315,
  playInDays: [328, 329], swissDays: [330, 331, 332, 333, 334],
  /* 녹아웃: 16강 위4·아래4, 8강 위2·아래2, 4강 1·1, 결승 (§11.5) */
  knockoutDays: [[336, 337], [342, 343], [349, 350], [357]],
  knockoutFormat: ['bo3', 'bo5', 'bo5', 'bo5'],
  lockEnd: 365,
  payout: { champion: [30000, 60], runner: [15000, 40], semi: [7500, 25], quarter: [3500, 15], r16: [1500, 8], swiss: [500, 3], playIn: [250, 1] },
};

/** 지역 리그 (§9) — 관동·성도는 날짜가 하루씩 어긋나고, 다른 7개 지방은 관동 날짜에 함께 */
export const LEAGUE = {
  challengers: 4,
  snapshotDay: 279,
  days: {
    quarter: { kanto: 280, johto: 281 },
    semi: { kanto: 287, johto: 288 },
    decider: { kanto: 294, johto: 295 },
    final: { kanto: 301, johto: 302 },
    third: { kanto: 310, johto: 311 },
  },
  format: { quarter: 'bo3', semi: 'bo3', decider: 'bo3', final: 'bo5', third: 'bo3' },
  level: 50, clauses: ['species', 'item'],
  allowGymLeaders: false,                   // [미결정 #1]
  otherRegionStatRange: [14, 17],           // [미결정 #4] 다른 7개 지방 도전자 생성 스탯
  /* 상금·평판 [임시] §13.3 */
  payout: { champion: [8000, 15], defendBonusRep: 5, runner: [4000, 10], decider: [2500, 7], thirdWin: [1500, 5], thirdLose: [1000, 4], quarter: [500, 2] },
};

/** 직위 = 지역 리그 소속 (§21.3) [임시] */
export const POSITION = {
  compensation: { 'elite-four': 10000, champion: 20000 },   // 원 소속사 이적 보상금
  rightOfFirstRefusalUntil: 28,                             // 스토브리그 끝까지 원 소속사 우선 협상
};

export const dayInSeason = day => (day - 1) % 365 + 1;
export const seasonOf = day => Math.floor((day - 1) / 365) + 1;
/* 리그 개혁 게임은 첫 시즌(2026)에 PWT가 없다 — 2027년 첫 개최 */
export const pwtBreak = game => !(game?.reform && seasonOf(game.day) === 1) && dayInSeason(game.day) >= PWT.breakStart && dayInSeason(game.day) <= PWT.breakEnd;
/** 국제 대회(PWT·PWC) 대표는 대회 기간부터 시즌 끝까지 이적·해지가 잠긴다 */
export function internationallyLocked(game, id) {
  return [...(game.international?.seasons || []), ...(game.international?.pwc || [])]
    .some(s => game.day >= s.start && game.day <= s.lockUntil && (s.representatives || []).includes(id));
}
