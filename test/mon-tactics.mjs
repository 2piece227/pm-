// 포켓몬별 전술 지시가 실제 배틀 선택을 바꾸는지 (여러 시드로 빈도 비교)
import assert from 'node:assert/strict';
import { runBattle, createTrainerAI, makeRng } from '../src/engine/run-battle.js';
import { applyRole, defaultTactics, ROLES } from '../src/data/mon-tactics.js';
import { obedience } from '../src/ai/mon-tactics.js';

const st = { judge: 18, ops: 18, focus: 18, know: 18, mental: 18 };
const run = (teamA, teamB, tacticsA, seed, extra = {}) => runBattle({
  trainerA: createTrainerAI({ name: 'A', stats: st, nature: { compliance: 1 }, partyTactics: tacticsA, ...extra }, '균형형', makeRng(seed)),
  trainerB: createTrainerAI({ name: 'B', stats: st }, '균형형', makeRng(seed + 1)), teamA, teamB, seed });
const count = (log, re) => log.filter(l => re.test(l)).length;
const N = 24;

assert(Object.keys(ROLES).length >= 8); assert(obedience(st, 1) > obedience(st, 0));

/* 랭크업 적극 vs 안 함 */
const gyara = `Gyarados\nAbility: Intimidate\nLevel: 50\n- Dragon Dance\n- Waterfall\n- Earthquake\n- Crunch`;
const wall = `Snorlax\nAbility: Thick Fat\nLevel: 50\n- Body Slam\n- Rest\n- Curse\n- Earthquake`;
let hi = 0, lo = 0;
for (let s = 1; s <= N; s++) {
  hi += count(run(gyara, wall, [{ ...defaultTactics(), setup: 2 }], s).log, /\|move\|p1a: Gyarados\|Dragon Dance/);
  lo += count(run(gyara, wall, [{ ...defaultTactics(), setup: -2 }], s).log, /\|move\|p1a: Gyarados\|Dragon Dance/);
}
assert(hi > lo * 1.5 && hi > lo + 5, `랭크업 지시가 용춤 빈도를 바꾼다 (${hi} vs ${lo})`);

/* 금지 기술은 안 쓴다 */
let banned = 0;
for (let s = 1; s <= N; s++) banned += count(run(gyara, wall, [{ ...defaultTactics(), moves: { waterfall: 'ban' } }], s).log, /\|move\|p1a: Gyarados\|Waterfall/);
assert.equal(banned, 0, '금지한 폭포오르기는 한 번도 안 쓴다');

/* 교체: 자주 빠짐 vs 끝까지 버팀 — 쓰러지기 전 스스로 빠진 횟수만 센다 */
const teamA = `Venusaur
Ability: Overgrow
Level: 50
- Giga Drain
- Sludge Bomb

Blastoise
Ability: Torrent
Level: 50
- Surf
- Ice Beam`;
const fire = `Arcanine
Ability: Intimidate
Level: 50
- Flamethrower
- Extreme Speed`;
const voluntary = log => { const sw = log.findIndex(l => l.startsWith('|switch|p1a: Blastoise')), fnt = log.findIndex(l => l.startsWith('|faint|p1a: Venusaur')); return sw >= 0 && (fnt < 0 || sw < fnt) ? 1 : 0; };
let out = 0, stay = 0;
for (let s = 1; s <= N; s++) {
  out += voluntary(run(teamA, fire, [{ ...defaultTactics(), switchOut: 2 }, {}], s).log);
  stay += voluntary(run(teamA, fire, [{ ...defaultTactics(), switchOut: -2, lowHp: 'fight' }, {}], s).log);
}
assert(out > stay + 3, `교체 지시가 스스로 빠지는 빈도를 바꾼다 (${out} vs ${stay})`);

/* 메가진화 담당: 담당이 아닌 선봉은 메가진화하지 않는다 */
const megaTeam = `Charizard @ Charizardite X\nAbility: Blaze\nLevel: 50\n- Flare Blitz\n- Dragon Claw\n\nGyarados @ Gyaradosite\nAbility: Intimidate\nLevel: 50\n- Waterfall\n- Crunch`;
const r = run(megaTeam, wall, [{ ...defaultTactics() }, { ...defaultTactics(), mega: true }], 3, { keyStone: true });
assert(!r.log.some(l => l.startsWith('|-mega|p1a: Charizard')), '담당이 갸라도스면 리자몽은 메가진화 안 함');

/* 역할 프리셋 */
const mon = { tactics: { moves: { rest: 'ban' } } };
applyRole(mon, 'ace'); assert.equal(mon.tactics.switchIn, -2); assert.equal(mon.tactics.moves.rest, 'ban', '역할을 바꿔도 기술 지시는 남는다');
console.log(`PASS: setup ${hi} vs ${lo}, ban respected, switching ${out} vs ${stay}, mega designation, role presets keep move orders`);
