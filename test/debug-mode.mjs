/**
 * 디버그 모드 — 대표 이름 '비통한비버통': 자금 무한, 실험 도구, 규칙 풀기. 일반 게임에는 영향 없음.
 */
import assert from 'node:assert/strict';
import { createGame, playerAgency, advanceDay } from '../src/engine/game.js';
import { PLAYER_AGENCY_CHOICES } from '../src/data/agencies.js';
import { DEBUG_FUNDS, debugAddPokemon, debugPartyLevel, debugBadges, debugGiveAll, toggleDebug, refillFunds } from '../src/engine/debug.js';
import { youthOnly } from '../src/engine/league-reform.js';
import { callUp } from '../src/engine/career.js';
import { buyKeyStone } from '../src/engine/shop.js';
import { YOUTH_CANDIDATES } from '../src/data/youth-candidates.js';
import { candidateProposal } from '../src/engine/contract.js';
import { agreeYouth, completeStarter } from '../src/engine/youth-contract.js';

const normal = await createGame({ seed: 3, agencyChoiceId: PLAYER_AGENCY_CHOICES[0].id, startEmpty: true, careerStart: true, reform: true });
assert(!normal.debug); const before = playerAgency(normal).funds; refillFunds(normal); assert.equal(playerAgency(normal).funds, before, '일반 게임은 그대로');

const g = await createGame({ seed: 3, agencyChoiceId: PLAYER_AGENCY_CHOICES[0].id, startEmpty: true, careerStart: true, reform: true, debug: true });
const a = playerAgency(g);
assert.equal(a.funds, DEBUG_FUNDS);
const c = YOUTH_CANDIDATES[0]; const t = agreeYouth(g, c, candidateProposal(c, a)); await completeStarter(g, 'Bulbasaur');
assert((await debugAddPokemon(g, 'Charizard', 70)).ok); assert.equal(a.box.at(-1).level, 70);
assert(!(await debugAddPokemon(g, 'Notamon', 5)).ok);
assert((await debugPartyLevel(g, t.id, 60)).ok); assert.equal(t.party[0].level, 60);
assert(debugBadges(g, t.id, 'kanto').ok); assert.equal(t.badges.length, 8);
assert(debugGiveAll(g).ok); assert(t.keyStone && a.items['Charizardite X'] === 99);
buyKeyStone(g, t.id); a.funds = 5; await advanceDay(g); assert.equal(a.funds, DEBUG_FUNDS, '하루가 지나면 다시 가득'); assert(!g.gameOver);
assert(youthOnly(g)); assert.match(callUp(g, t.id).msg, /2027/);
toggleDebug(g, 'unlockReform'); assert(!youthOnly(g)); assert(callUp(g, t.id).ok, '잠금 해제하면 콜업');
console.log('debug-mode PASS');
