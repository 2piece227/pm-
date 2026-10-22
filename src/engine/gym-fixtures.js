/**
 * 관장전 일정 — 축구 친선전·공식전을 잡듯이 "날짜를 정해 신청 → 체육관 접수 → 그날 경기".
 *
 *   - 배지가 이미 있는 체육관은 신청할 수 없다.
 *   - 트레이너마다 잡혀 있는 관장전은 한 번에 하나.
 *   - 진 체육관은 진 날로부터 rematchWait일 뒤부터 다시 신청할 수 있다.
 *   - 대회 출전일·PWT 휴회 기간에는 잡을 수 없다.
 * 경기 당일에는 탐험 배정 대신 관장전을 치르고, 다음 날부터 탐험 배정이 다시 이어진다.
 */
import { gymById } from '../data/gyms.js';
import { PWT, dayInSeason } from '../data/international.js';
import { agencyOf } from './pokemon-management.js';

/* [임시값] 접수 규칙 — 원작에는 없는 매니지먼트 규칙이라 체감 보고 조정 */
export const GYM_BOOKING = { minLead: 1, maxLead: 14, rematchWait: 3 };

export const fixturesOf = game => (game.gymFixtures ??= []);
const isPwtDay = day => dayInSeason(day) >= PWT.breakStart && dayInSeason(day) <= PWT.breakEnd;

export function upcomingFixture(game, trainerId) {
  return fixturesOf(game).find(f => f.trainerId === trainerId && f.status === 'booked') || null;
}
export function todaysFixture(game, trainerId) {
  return fixturesOf(game).find(f => f.trainerId === trainerId && f.status === 'booked' && f.day === game.day) || null;
}
export const hasBadge = (trainer, gymId) => (trainer?.badges || []).includes(gymId);

/** 이 트레이너가 이 체육관에 다시 신청할 수 있는 첫날 (진 경우만 대기) */
export function rematchFrom(game, trainer, gymId) {
  const lastLoss = (game.gymHistory || []).find(m => m.trainerId === trainer.id && m.gymId === gymId && !m.won);
  return lastLoss ? lastLoss.day + GYM_BOOKING.rematchWait : 0;
}

/** 체육관 카드에 보여줄 상태 */
export function gymStatus(game, trainer, gymId) {
  if (!trainer) return { ok: false, code: 'none', text: '트레이너를 고르세요' };
  if (!trainer.party?.length) return { ok: false, code: 'party', text: '파티가 비어 있음' };
  if (hasBadge(trainer, gymId)) return { ok: false, code: 'badge', text: '배지 보유' };
  const fx = upcomingFixture(game, trainer.id);
  if (fx?.gymId === gymId) return { ok: false, code: 'booked', text: `접수 완료 · D-${fx.day - game.day}`, fixture: fx };
  if (fx) return { ok: false, code: 'busy', text: `${gymById(fx.gymId)?.name} 관장전이 잡혀 있음` };
  return { ok: true, code: 'open', text: '도전 가능' };
}

/** 신청 가능한 날짜 목록 — 막힌 날은 이유와 함께 돌려준다 */
export function bookingDays(game, trainer, gymId) {
  const out = [];
  const wait = rematchFrom(game, trainer, gymId);
  const cups = (game.competitions?.events || []).filter(e => e.status === 'scheduled' && e.registrations?.includes(trainer.id));
  for (let d = game.day + GYM_BOOKING.minLead; d <= game.day + GYM_BOOKING.maxLead; d++) {
    let reason = '';
    if (isPwtDay(d)) reason = 'PWT 휴회';
    else if (d < wait) reason = '재도전 대기';
    else if (cups.some(e => e.date === d)) reason = '대회 출전';
    out.push({ day: d, ok: !reason, reason });
  }
  return out;
}

export function bookGym(game, trainerId, gymId, day) {
  const trainer = agencyOf(game).roster.find(t => t.id === trainerId), gym = gymById(gymId);
  if (!trainer || !gym) return { ok: false, msg: '트레이너와 체육관을 확인하세요.' };
  const st = gymStatus(game, trainer, gymId);
  if (!st.ok) return { ok: false, msg: st.code === 'badge' ? `${trainer.name}은(는) 이미 ${gym.badge}를 가지고 있습니다.` : st.text };
  const slot = bookingDays(game, trainer, gymId).find(d => d.day === day);
  if (!slot) return { ok: false, msg: `${GYM_BOOKING.minLead}~${GYM_BOOKING.maxLead}일 뒤 날짜만 신청할 수 있습니다.` };
  if (!slot.ok) return { ok: false, msg: `그날은 신청할 수 없습니다 (${slot.reason}).` };
  const fx = { id: `fx-${trainerId}-${gymId}-${day}`, trainerId, gymId, day, bookedDay: game.day, status: 'booked' };
  fixturesOf(game).push(fx);
  game.league.newsFeed.unshift({ day: game.day, kind: 'gym-booking', trainerId,
    text: `${gym.name} 체육관 — ${trainer.name}의 도전을 접수했습니다 · ${day}일차` });
  return { ok: true, msg: `${gym.name} 체육관이 도전을 접수했습니다. ${day - game.day}일 뒤에 경기가 열립니다.`, fixture: fx };
}

export function cancelFixture(game, fixtureId, reason = '대표가 취소') {
  const fx = fixturesOf(game).find(f => f.id === fixtureId && f.status === 'booked');
  if (!fx) return { ok: false, msg: '취소할 관장전이 없습니다.' };
  fx.status = 'cancelled'; fx.cancelReason = reason;
  const t = agencyOf(game).roster.find(x => x.id === fx.trainerId);
  game.league.newsFeed.unshift({ day: game.day, kind: 'gym-booking', trainerId: fx.trainerId,
    text: `${gymById(fx.gymId)?.name} 체육관 — ${t?.name || '트레이너'}의 관장전 취소 (${reason})` });
  return { ok: true, msg: '관장전을 취소했습니다.' };
}

/** 소속사를 떠난 트레이너의 예약은 정리한다 */
export function pruneFixtures(game) {
  const ids = new Set(agencyOf(game).roster.map(t => t.id));
  for (const f of fixturesOf(game)) if (f.status === 'booked' && (!ids.has(f.trainerId) || f.day < game.day)) { f.status = 'cancelled'; f.cancelReason = '일정 만료'; }
}

