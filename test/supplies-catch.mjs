// 탐험 물품: 원작 포획 공식·볼 배율·볼 고르기, 회복약/기력/상태이상 자동 사용
import assert from 'node:assert/strict';
import { createGame, playerAgency } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { createPokemon } from '../src/data/pokemon.js';
import { explore, captureChance, ballModifier } from '../src/engine/explore.js';
import { SUPPLIES, BALL_KEYS, ballCount } from '../src/data/supplies.js';
import { CAPTURE_RATE } from '../src/data/items.gen.js';
import { fieldState } from '../src/engine/field-state.js';

assert(Object.keys(SUPPLIES).length >= 40 && BALL_KEYS.length >= 20);
assert.equal(SUPPLIES.greatBall.name, '슈퍼볼'); assert.equal(SUPPLIES.hyperPotion.hp, 120); assert.equal(CAPTURE_RATE.Pidgey, 255);
/* 5세대 이후 포획 공식 */
assert.equal(captureChance(255, 255, 1), 1);
assert(Math.abs(captureChance(45, 1, 1) - 0.119) < 0.005, '꽉 찬 HP 스타팅(45)·몬스터볼 ≈ 11.9%');
assert(captureChance(45, 2, 0.25) > captureChance(45, 1.5, 0.25) && captureChance(45, 1.5, 0.25) > captureChance(45, 1, 0.25));
/* 조건부 볼 */
const ctx = (wild, loc = { name: '1번도로' }) => ({ wild, loc, myTop: 40, turns: 10, owned: new Set(), party: [] });
assert.equal(ballModifier('netBall', ctx({ species: 'Caterpie', level: 5 })).mod, 3.5);
assert.equal(ballModifier('netBall', ctx({ species: 'Pidgey', level: 5 })).mod, 1);
assert.equal(ballModifier('fastBall', ctx({ species: 'Jolteon', level: 5 })).mod, 4);
assert.equal(ballModifier('levelBall', ctx({ species: 'Pidgey', level: 9 })).mod, 8);
assert.equal(ballModifier('duskBall', ctx({ species: 'Zubat', level: 9 }, { name: '달맞이산' })).mod, 3);
assert.equal(ballModifier('quickBall', ctx({ species: 'Pidgey', level: 9 })).hp, 1);

const g = await createGame({ seed: 5, startEmpty: true }), a = playerAgency(g);
const t = createTrainer({ id: 'x', name: '테스트', party: [], stats: { judge: 14, ops: 14, focus: 14, know: 14, mental: 14 }, potential: { judge: 18, ops: 18, focus: 18, know: 18, mental: 18 } });
t.party = [await createPokemon({ species: 'Pidgeot', level: 40, rng: () => 0.5 }), await createPokemon({ species: 'Rattata', level: 10, rng: () => 0.5 })];
a.roster = [t]; g.opening.done = true;
/* 볼은 슈퍼볼만 — 몬스터볼이 없어도 포획한다 */
t.bag = { greatBall: 5 };
let r = await explore(g, t, 'route1', 'catch', { activities: 6 });
assert(r.events.some(e => e.kind === 'catch'), '슈퍼볼만으로도 포획을 나간다'); assert(t.bag.greatBall < 5);
assert(r.events.filter(e => e.kind === 'catch').every(e => e.lines.some(l => l.includes('슈퍼볼'))));
/* 기절 → 기력의조각, 상태이상 → 해독제, 낮은 HP → 알맞은 회복약 (센터 대신) */
t.bag = { revive: 1, antidote: 1, superPotion: 1, potion: 1 };
t.party[1].fieldState = { ...fieldState(t.party[1]), hp: 0 };
t.party[0].fieldState = { ...fieldState(t.party[0]), status: 'psn' };
r = await explore(g, t, 'route1', 'battle', { activities: 6 });
assert.equal(r.events[0].kind, 'item'); assert.equal(r.events[0].item, 'revive');
assert.equal(r.events[1].item, 'antidote');
assert.equal(t.bag.revive, 0); assert.equal(t.bag.antidote, 0);
assert.equal(ballCount({ pokeBall: 2, ultraBall: 1, potion: 9 }), 3);
console.log('PASS: Korean supplies, Gen5+ capture formula, conditional ball modifiers, any ball allows catching, revive/cure before center');
