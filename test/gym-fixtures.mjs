// 관장전 일정 신청: 배지 보유 차단, 트레이너당 1경기, 패배 후에도 대기 없이 재도전, 당일 경기 후 탐험 재개.
import assert from 'node:assert/strict';
import { createGame, playerAgency, advanceDay, assignAction } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { bookGym, cancelFixture, gymStatus, bookingDays, fixturesOf, GYM_BOOKING } from '../src/engine/gym-fixtures.js';
import { challengeGym } from '../src/engine/gyms.js';
import { exploreAction } from '../src/engine/game.js';
import { createPokemon } from '../src/data/pokemon.js';

const g = await createGame({ seed: 77, startEmpty: true }), a = playerAgency(g);
const strong = createTrainer({ id: 'strong', name: '강자', party: [], stats: { judge: 14, ops: 14, focus: 14, know: 14, mental: 14 }, potential: { judge: 18, ops: 18, focus: 18, know: 18, mental: 18 } });
const weak = createTrainer({ id: 'weak', name: '약자', party: [], stats: { judge: 6, ops: 6, focus: 6, know: 6, mental: 6 }, potential: { judge: 10, ops: 10, focus: 10, know: 10, mental: 10 } });
strong.party = [await createPokemon({ species: 'Blastoise', level: 60, rng: () => 0.5 })];
weak.party = [await createPokemon({ species: 'Caterpie', level: 2, rng: () => 0.5 })];
a.roster = [strong, weak]; g.opening.firstTrainerId = strong.id; g.opening.done = true;
for (const t of a.roster) t.contract ??= { wage: 10 };

/* 배지 보유 체육관은 신청도, 직접 도전도 안 된다 */
strong.badges = ['brock'];
assert.equal(gymStatus(g, strong, 'brock').code, 'badge');
assert(!bookGym(g, 'strong', 'brock', g.day + 1).ok);
await assert.rejects(() => challengeGym(g, strong, 'brock'), /이미/);

/* 날짜 범위와 트레이너당 1경기 */
assert(!bookGym(g, 'strong', 'misty', g.day).ok, '당일 신청 불가');
assert(!bookGym(g, 'strong', 'misty', g.day + GYM_BOOKING.maxLead + 1).ok, '너무 먼 날짜 불가');
const day = g.day + 2;
assert(bookGym(g, 'strong', 'misty', day).ok);
assert.equal(gymStatus(g, strong, 'ltsurge').code, 'busy');
assert(!bookGym(g, 'strong', 'ltsurge', day + 1).ok);
const fx = fixturesOf(g)[0];
assert(cancelFixture(g, fx.id).ok); assert.equal(fx.status, 'cancelled');
assert(bookGym(g, 'strong', 'misty', day).ok);

/* 탐험 배정은 관장전 당일에만 비켜 준다 */
assignAction(g, 'strong', exploreAction('route1', 'battle', 6));
const explore = g.actions.strong;
await advanceDay(g); await advanceDay(g);
assert.equal(g.actions.strong, explore);
assert.equal(g.day, day);
const rep = await advanceDay(g);   // 오늘이 경기일
assert.equal(rep.gyms?.length, 1); assert(rep.gyms[0].won); assert(strong.badges.includes('misty'));
assert.equal(fixturesOf(g).find(f => f.gymId === 'misty' && f.status === 'played')?.won, true);
assert.equal(g.actions.strong, explore, '다음 날 탐험 배정이 그대로 이어진다');
assert.equal(gymStatus(g, strong, 'misty').code, 'badge');

/* 져도 바로 다음 날 재도전 가능 (쿨타임 없음) */
assert(bookGym(g, 'weak', 'giovanni', g.day + 1).ok);
const lossRep = await advanceDay(g); await advanceDay(g);
const lost = (g.gymHistory || []).find(m => m.trainerId === 'weak' && m.gymId === 'giovanni');
assert(lost && !lost.won, `약자는 져야 한다 ${JSON.stringify(lossRep.gyms?.map(m=>m.won))}`);
const days = bookingDays(g, weak, 'giovanni');
assert(days[0].day === g.day + GYM_BOOKING.minLead && days.every(d => d.ok || d.reason === 'PWT 휴회' || d.reason === '대회 출전'), '재도전 대기 없음');

/* 예전 저장의 'gym:' 배정이 배지 보유 체육관을 가리키면 휴식으로 */
g.actions.strong = 'gym:misty';
const legacy = await advanceDay(g);
assert(!(legacy.gyms || []).some(m => m.trainerId === 'strong'));

/* 배지를 딴 뒤에도 (리그 개혁 시즌이라도) 다음 관장전 대기 없음 */
strong.lastBadgeDay = g.day; g.reform ??= {};
assert(bookingDays(g, strong, 'ltsurge').every(d => d.ok || d.reason === 'PWT 휴회' || d.reason === '대회 출전'), '배지 후 대기 없음');

console.log('PASS: badge lock, booking window, one fixture per trainer, cancel, fixture day keeps exploration, no rematch/badge wait, legacy duplicate guard');
