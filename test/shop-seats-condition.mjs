// 상점·지닌 도구·기술머신 / F1식 프로 좌석 / 패배 중심 컨디션
import assert from 'node:assert/strict';
import { createGame, playerAgency } from '../src/engine/game.js';
import { createPokemon, toShowdownBlock } from '../src/data/pokemon.js';
import { HELD_ITEMS, TMS, MOVE_DESC_KO } from '../src/data/items.gen.js';
import { buyItem, buyTM, giveItem, takeItem, teachTM, itemsOf, tmsOf, consumeBerries } from '../src/engine/shop.js';
import { ensureSeats, swapSeat, callUp, isRaceSeat, proCount, proCapacity } from '../src/engine/career.js';
import { cupEligible } from '../src/engine/season.js';
import { applyLoss, applyWin } from '../src/engine/explore.js';
import { MANAGEMENT } from '../src/engine/pokemon-management.js';
import { GYMS } from '../src/data/gyms.js';
import { ITEM_KO } from '../src/data/ko.js';

/* 데이터: 한국어 이름·설명·가격이 채워져 있다 */
assert(Object.keys(HELD_ITEMS).length > 150 && TMS.length === 229 && Object.keys(MOVE_DESC_KO).length > 900);
assert.equal(HELD_ITEMS.Leftovers.ko, '먹다남은음식'); assert.equal(ITEM_KO['Choice Scarf'], '구애스카프');
assert(MOVE_DESC_KO['Sand Tomb'].includes('모래'));

const g = await createGame({ seed: 91, startEmpty: true }), a = playerAgency(g);
a.funds = 20000;
const mon = await createPokemon({ species: 'Bulbasaur', level: 20, rng: () => 0.3 });
a.box.push(mon);

/* 도구: 사서 지니게 하고 빼면 창고로 돌아온다 */
assert(!buyItem(g, 'Leftovers', 0).ok);
assert(buyItem(g, 'Leftovers', 2).ok); assert.equal(a.funds, 20000 - 8000); assert.equal(itemsOf(a).Leftovers, 2);
assert(buyItem(g, 'Sitrus Berry', 1).ok);
assert(giveItem(g, mon, 'Leftovers').ok); assert.equal(mon.item, 'Leftovers'); assert.equal(itemsOf(a).Leftovers, 1);
assert(toShowdownBlock(mon).includes('@ Leftovers'));
assert(giveItem(g, mon, 'Sitrus Berry').ok); assert.equal(itemsOf(a).Leftovers, 2, '바꾸면 원래 도구는 창고로'); assert(!('Sitrus Berry' in itemsOf(a)));
assert(takeItem(g, mon).ok); assert.equal(mon.item, null); assert.equal(itemsOf(a)['Sitrus Berry'], 1);
assert(!giveItem(g, mon, 'Choice Band').ok, '창고에 없는 도구는 못 준다');

/* 먹은 열매만 사라진다 */
mon.item = 'Sitrus Berry';
consumeBerries([mon], ['|-enditem|p1a: Bulbasaur|Sitrus Berry|[from] move: Knock Off']); assert.equal(mon.item, 'Sitrus Berry');
consumeBerries([mon], ['|-enditem|p1a: Bulbasaur|Sitrus Berry|[eat]']); assert.equal(mon.item, null);

/* 기술머신: 1회용, 배울 수 있는 종만 */
const before = a.funds;
assert(buyTM(g, 'Energy Ball', 1).ok); assert(a.funds < before);
assert(buyTM(g, 'Flamethrower', 1).ok);
assert(!(await teachTM(g, mon, 'Flamethrower', 0)).ok, '이상해씨는 화염방사 기술머신을 못 쓴다');
const slot = mon.moves.length < 4 ? mon.moves.length : 0;
assert((await teachTM(g, mon, 'Energy Ball', slot)).ok);
assert(mon.moves.includes('Energy Ball') && mon.learned.includes('Energy Ball')); assert(!tmsOf(a)['Energy Ball']);
assert(!(await teachTM(g, mon, 'Energy Ball', slot)).ok, '다 쓴 기술머신');

/* F1식 좌석: 레귤러 2 + 리저브 1, 리저브는 시티컵 불가, 프로 최대 3명 */
const pros = await Promise.all([0, 1, 2].map(async i => ({ id: `p${i}`, name: `프로${i}`, agencyId: a.id, isYouth: false, badges: GYMS.filter(x => x.region === 'kanto').map(x => x.id), party: [await createPokemon({ species: 'Pidgey', level: 30, rng: () => 0.5 })], stats: { judge: 10, ops: 10, focus: 10, know: 10, mental: 10 }, record: { wins: 0, losses: 0 } })));
a.roster = [...pros];
const seats = ensureSeats(a);
assert.equal(seats.race.length, 2); assert.equal(seats.reserve.length, 1); assert.equal(proCount(a), proCapacity());
const city = { kind: 'city' }, reserve = seats.reserve[0], race = seats.race[0];
assert(!cupEligible(reserve, city) && cupEligible(race, city) && cupEligible(reserve, { kind: 'local' }));
assert(swapSeat(g, reserve.id, race.id).ok); assert(isRaceSeat(reserve) && !isRaceSeat(race));
const youth = { id: 'y1', name: '유스', agencyId: a.id, isYouth: true, badges: GYMS.filter(x => x.region === 'kanto').map(x => x.id), party: pros[0].party, contract: { wage: 10 }, stats: { judge: 5, ops: 5, focus: 5, know: 5, mental: 5 } };
a.roster.push(youth);
assert(!callUp(g, 'y1').ok, '프로 3명이면 콜업 불가');
a.roster = a.roster.filter(t => t.id !== 'p2'); assert(callUp(g, 'y1').ok); assert.equal(proCount(a), 3);

/* 컨디션: 패배가 크게, 승리는 회복, 활동은 아주 작게 */
const t = { stats: { mental: 10 }, fatigue: 0, mentalDebuff: 0 };
applyLoss(t); const afterLoss = t.fatigue; assert(afterLoss >= MANAGEMENT.lossHit * 0.4 && afterLoss > MANAGEMENT.activityFatigue * 6, '한 번 지는 게 하루 활동보다 크다');
applyWin(t); assert(t.fatigue < afterLoss);

console.log('PASS: Korean item/TM/move data, buy/give/swap/take, berry consumption, single-use TM compatibility, 2+1 pro seats, reserve city lock, pro cap, loss-driven condition');
