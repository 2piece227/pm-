/** Editable starting balance. Generated trainers only; named affiliations stay undecided. */
export const CAREER = {
  youthCapacity: 3,
  /* F1처럼 소속사마다 레귤러 프로 2명 + 리저브 1명, 프로는 최대 3명 [확정 2026-10-22] */
  proSeats: { race: 2, reserve: 1 },
  starting: {
    major: { pros:3, youths:1, profile:'elite' },
    semi: { pros:2, youths:1, profile:'strong' },
    mid: { pros:1, youths:1, profile:'mid' },
    small: { pros:1, youths:0, profile:'weak' },
    indie: { pros:0, youths:0, profile:'weak' },
  },
  weeklySalaryFactor: 1,
  transfer: { wageWeeks:26, skillFactor:20, reserveWeeks:8, rosterLimit:8 },
};
export const NAMED_ROSTER_SLOTS = {}; // Deliberately no invented character affiliations.
