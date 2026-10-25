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

/* 랭크업·교체 같은 성향 지시는 어나더레드 AI 2단계(개성·실력)에서 다시 연결한다 — 지금은 금지 기술·메가 담당만 */
const gyara = `Gyarados
Ability: Intimidate
Level: 50
- Dragon Dance
- Waterfall
- Earthquake
- Crunch`;
const wall = `Snorlax
Ability: Thick Fat
Level: 50
- Body Slam
- Rest
- Curse
- Earthquake`;

/* 금지 기술은 안 쓴다 */
let banned = 0;
for (let s = 1; s <= N; s++) banned += count(run(gyara, wall, [{ ...defaultTactics(), moves: { waterfall: 'ban' } }], s).log, /\|move\|p1a: Gyarados\|Waterfall/);
assert.equal(banned, 0, '금지한 폭포오르기는 한 번도 안 쓴다');

/* 메가진화 담당: 담당이 아닌 선봉은 메가진화하지 않는다 */
const megaTeam = `Charizard @ Charizardite X\nAbility: Blaze\nLevel: 50\n- Flare Blitz\n- Dragon Claw\n\nGyarados @ Gyaradosite\nAbility: Intimidate\nLevel: 50\n- Waterfall\n- Crunch`;
const r = run(megaTeam, wall, [{ ...defaultTactics() }, { ...defaultTactics(), mega: true }], 3, { keyStone: true });
assert(!r.log.some(l => l.startsWith('|-mega|p1a: Charizard')), '담당이 갸라도스면 리자몽은 메가진화 안 함');

/* 역할 프리셋 */
const mon = { tactics: { moves: { rest: 'ban' } } };
applyRole(mon, 'ace'); assert.equal(mon.tactics.switchIn, -2); assert.equal(mon.tactics.moves.rest, 'ban', '역할을 바꿔도 기술 지시는 남는다');
console.log('PASS: ban respected, mega designation, role presets keep move orders');
