/**
 * 리그 개혁(로즈 협회장) — 새 게임 시작 구성, 2026 유스 전용 일정, 잠금, NPC 유스 성장, 시리즈 포인트, 공식전 파티 규정
 */
import assert from 'node:assert/strict';
import { createGame, playerAgency, advanceDay } from '../src/engine/game.js';
import { PLAYER_AGENCY_CHOICES } from '../src/data/agencies.js';
import { PARENT_SUPPORT, REFORM, SEASON1_SCHEDULE } from '../src/data/league-reform.js';
import { YOUTH_CANDIDATES } from '../src/data/youth-candidates.js';
import { candidateProposal } from '../src/engine/contract.js';
import { agreeYouth, completeStarter } from '../src/engine/youth-contract.js';
import { callUp, isRegisteredPro } from '../src/engine/career.js';
import { ensureSeason, cupEligible, officialParty, cupEntrants } from '../src/engine/season.js';
import { seriesPoints, youthOnly, calendarYear } from '../src/engine/league-reform.js';
import { internationalSeason } from '../src/engine/international.js';

import { GYMS } from '../src/data/gyms.js';
import { createPokemon } from '../src/data/pokemon.js';

/* 1. 시작 구성: 프로 0명, 유스 수는 모기업 규모 */
for (const choice of PLAYER_AGENCY_CHOICES) {
  const g = await createGame({ seed: 31, agencyChoiceId: choice.id, startEmpty: true, careerStart: true, reform: true });
  assert(g.reform && youthOnly(g) && calendarYear(g.day) === 2026);
  for (const a of g.league.agencies) {
    assert.equal(a.roster.filter(isRegisteredPro).length, 0, `${a.name}: 프로 없음`);
    const s = PARENT_SUPPORT[a.tier] || PARENT_SUPPORT.indie;
    assert(a.roster.length <= (a.id === g.playerAgencyId ? s.youths : s.npcYouths));
    for (const t of a.roster) { assert(t.isYouth); assert.equal(t.badges.length, 0); assert.equal(t.party[0].level, 5); }
  }
  assert(g.opening.roseBriefing);
}

/* 2. 2026 일정: 유스컵 8 + 시범경기 2 + 파이널, PWT 없음 */
const g = await createGame({ seed: 7, agencyChoiceId: PLAYER_AGENCY_CHOICES[0].id, startEmpty: true, careerStart: true, reform: true });
const ev = ensureSeason(g).events.filter(e => e.season === 1);
assert.equal(ev.filter(e => e.kind === 'youth').length, 8);
assert.equal(ev.filter(e => e.kind === 'demo').length, 2);
assert.equal(ev.filter(e => e.kind === 'youth-final').length, 1);
assert(!ev.some(e => e.kind === 'city' || e.kind === 'local'));
assert.equal(ev.find(e => e.kind === 'demo').levelCap, 50);
const y2 = ensureSeason(g).events.filter(e => e.season === 2);
assert(y2.some(e => e.kind === 'local' && e.division === 'youth') && y2.some(e => e.kind === 'local' && e.division === 'open'), '2027 로컬컵 두 부문');
assert.equal(internationalSeason(g).status, 'not-held');
assert.equal(SEASON1_SCHEDULE.length, ev.length);

/* 3. 첫 계약 후 진행 — NPC 유스 성장, 유스컵, 지원금 */
const a = playerAgency(g);
const cand = YOUTH_CANDIDATES[0];
const me = agreeYouth(g, cand, candidateProposal(cand, a));
await completeStarter(g, 'Charmander');
a.tier = 'semi';   // 지원금 확인용 (플레이어 선택지는 독립 소속사뿐이라 0원)
let support = 0;
const t0 = Date.now();
while (g.day <= 45) { const r = await advanceDay(g); support += r.support || 0; }
const npcYouths = g.league.agencies.filter(x => x.id !== g.playerAgencyId).flatMap(x => x.roster);
const lead = npcYouths.map(t => Math.max(...t.party.map(m => m.level)));
const badges = npcYouths.map(t => t.badges.length);
console.log(`45일 · ${Date.now() - t0}ms · NPC 유스 ${npcYouths.length}명 · 선두 레벨 ${Math.min(...lead)}~${Math.max(...lead)} · 배지 ${Math.min(...badges)}~${Math.max(...badges)} · 지원금 ${support}`);
assert(Math.max(...lead) >= 25 && Math.max(...lead) <= 50, 'NPC 유스가 곡선대로 큰다');
assert(npcYouths.some(t => t.party.length > 1), '동료를 잡는다');
assert(Math.max(...badges) >= 1, '실제 관장전으로 배지를 딴다');
for (const t of npcYouths) if (t.badges.length >= 2) assert(t.lastBadgeDay, '배지일 기록');
assert.equal(support, Math.floor(45 / 7) * PARENT_SUPPORT[a.tier].weekly);
const done = ensureSeason(g).events.filter(e => e.kind === 'youth' && e.status === 'completed');
assert(done.length >= 2, '유스컵 2회 이상 개최');
const pts = seriesPoints(g);
assert(pts.length >= 4 && pts[0].points >= 10);

/* 4. 관장전 간격: 배지 딴 뒤 21일 */
me.badges = [GYMS[0].id]; me.lastBadgeDay = g.day;
assert.equal(REFORM.gymInterval, 21);

/* 5. 콜업·프로 영입 잠금 */
me.badges = GYMS.filter(x => x.region === 'kanto').map(x => x.id);
assert.match(callUp(g, me.id).msg, /2027/);

/* 6. 시범경기: 8배지 유스 자격, 무소속 프로로 빈자리, 공식전 파티 규정 */
const demo = ensureSeason(g).events.find(e => e.kind === 'demo');
assert(cupEligible(me, demo));
const party = [await createPokemon({ species: 'Pikachu', level: 70 }), await createPokemon({ species: 'Pikachu', level: 30 }), await createPokemon({ species: 'Eevee', level: 55 }), await createPokemon({ species: 'Snorlax', level: 40 })];
party[0].item = 'Leftovers'; party[2].item = 'Leftovers';
const off = officialParty(party, demo);
assert.deepEqual(off.map(m => m.level), [50, 50, 40]);
assert.deepEqual(off.map(m => m.item ?? null), ['Leftovers', null, party[3].item ?? null]);
assert.equal(party[0].level, 70, '원본은 그대로');
const final = ensureSeason(g).events.find(e => e.kind === 'youth-final');
assert(cupEntrants(g, final).length <= 8 && cupEntrants(g, final).length >= 4);
console.log('league-reform PASS');
