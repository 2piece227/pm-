/**
 * 유스컵 직접 진행 — 대진 추첨 → 라운드마다 [계속] → 라운드 사이 선봉·전술 반영
 * 하루 진행으로 한 번에 돌린 것과 같은 결과가 나와야 하고(같은 시드), 바꾼 선봉은 다음 라운드 출전 파티에 반영돼야 한다.
 */
import assert from 'node:assert/strict';
import { createGame, advanceDay, playerAgency } from '../src/engine/game.js';
import { ensureSeason, registerCup, cupEligible, liveCupToday, liveCupStep, cupPairs } from '../src/engine/season.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { renderLiveCup, liveCupButtonLabel } from '../src/ui/live-cup.js';
import { createPokemon } from '../src/data/pokemon.js';

async function toCupDay(seed) {
  const g = await createGame({ seed, agencyChoiceId: 'player-major', careerStart: true });
  g.opening.tutorialContractNeeded = false;
  const cup = ensureSeason(g).events.find(e => e.kind === 'youth');
  while (g.day < cup.date) {
    if (g.day >= cup.openDay) for (const t of playerAgency(g).roster.filter(t => cupEligible(t, cup) && !cup.registrations.includes(t.id))) registerCup(g, cup.id, t.id);
    await advanceDay(g);
  }
  return { g, cup };
}

const { g, cup } = await toCupDay(2601);
assert(cup.registrations.length, '우리 유스가 등록됨');
const twin = restoreGame(snapshotGame(g)), twinCup = twin.competitions.events.find(e => e.id === cup.id);

/* 하루 진행으로 한 번에 */
await advanceDay(twin);
assert.equal(twinCup.status, 'completed');

/* 접수 마감일 하루가 끝나면 대진 발표 — 대회 날 전에 상대가 정해져 있다 */
assert.equal(cup.status, 'drawn'); assert(cup.drawnDay < cup.date, `대진 발표 ${cup.drawnDay}일차 < 개최 ${cup.date}일차`);
assert.equal(cup.date - cup.deadline, 3, '접수는 개최 3일 전 마감');
assert(cup.drawnIds.some(id => playerAgency(g).roster.some(t => t.id === id)), '우리 유스가 대진에 있다');
assert(g.league.newsFeed.some(n => n.cupId === cup.id && /대진 발표/.test(n.text)), '대진 발표 소식');
assert(!registerCup(g, cup.id, playerAgency(g).roster[0].id).ok, '대진 발표 뒤에는 접수 마감');
assert(renderLiveCup(g, cup).includes('첫 상대'), '개최 전 상대 분석 화면');
/* [계속]마다 라운드 하나 */
assert.equal(liveCupToday(g), cup);
assert.match(liveCupButtonLabel(cup), /진행 ▶/);
let r;
const steps = [];
while (['drawn', 'live'].includes(cup.status)) { r = await liveCupStep(g, cup); steps.push(r.matches.length); assert(renderLiveCup(g, cup, { fresh: 'round' }).includes('대진표')); }
assert.equal(r.stage, 'done');
assert(steps.length >= 2, `라운드마다 멈춘다 (${steps.join('/')})`);
assert.equal(liveCupToday(g), undefined, '끝나면 [계속]은 평소 하루 진행');
assert.deepEqual(cup.result, twinCup.result, '같은 시드 → 하루 진행과 같은 우승자');
assert.deepEqual(cup.matches.map(m => [m.id, m.winnerId]), twinCup.matches.map(m => [m.id, m.winnerId]));
const before = cup.matches.length;
const report = await advanceDay(g);
assert.equal(cup.matches.length, before, '이미 끝난 대회를 다시 치르지 않는다');
assert(report.cupIds.includes(cup.id));
for (const id of cup.entrants.filter(x => x.agencyId === g.playerAgencyId).map(x => x.id)) assert(!report.explored.some(x => x.trainerId === id), '출전 선수는 그날 탐험하지 않는다');
assert(!playerAgency(g).roster.some(t => t.party.some(m => m._cupKey)), '대회 표식은 끝나면 지운다');
console.log(`PASS: 개최 ${cup.date - cup.drawnDay}일 전 대진 발표 → ${steps.length}라운드 단계 진행, 하루 진행과 같은 결과`);

/* 라운드 사이 선봉 변경이 출전 파티에 반영된다 */
{
  const { g: h, cup: c } = await toCupDay(2602);
  /* 선봉을 바꿀 수 있게 등록 유스에게 포켓몬을 더 준다 */
  for (const id of c.registrations) { const t = playerAgency(h).roster.find(x => x.id === id); for (const sp of ['Pidgey', 'Rattata']) t.party.push(await createPokemon({ species: sp, level: 8, rng: h.rng })); }
  await liveCupStep(h, c);   // 1라운드 (출전 파티 확정)
  const mine = c.entrants.find(x => x.agencyId === h.playerAgencyId && x.party.length > 1);
  if (mine && cupPairs(c).some(([a, b]) => [a, b].includes(mine.id))) {
    const t = playerAgency(h).roster.find(x => x.id === mine.id);
    const last = t.party.findIndex((m, i) => i > 0 && m._cupKey);
    const target = t.party[last];
    t.party.splice(last, 1); t.party.unshift(target);
    await liveCupStep(h, c);
    assert.equal(mine.party[0]._cupKey, target._cupKey ?? mine.party[0]._cupKey);
    assert.equal(mine.party[0].species, target.species, '바꾼 선봉이 출전 파티 맨 앞');
    console.log('PASS: 라운드 사이 선봉 변경 반영');
  } else console.log('SKIP: 이 시드에 파티 2마리 이상 출전 선수 없음');
  /* 진행 중 저장·불러오기 */
  const copy = restoreGame(snapshotGame(h)), cc = copy.competitions.events.find(e => e.id === c.id);
  while (['drawn', 'live'].includes(c.status)) await liveCupStep(h, c);
  while (['drawn', 'live'].includes(cc.status)) await liveCupStep(copy, cc);
  assert.deepEqual(cc.result, c.result, '진행 중 저장해도 같은 결과');
  console.log('PASS: 진행 중 저장·불러오기');
}
