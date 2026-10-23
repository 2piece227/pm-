/**
 * 변화기 평가와 상성 학습 — 제보(2026-10-23): 강철톤에 스텔스록·변화기 적극을 줘도 번개엄니만 쓰고,
 * 독수의 또가스는 강철톤에게 효과 없는 오물공격을 계속 썼다.
 */
import assert from 'node:assert/strict';
import { createTrainerAI, runBattle, makeRng } from '../src/engine/run-battle.js';
import { createPokemon, partyToTeam } from '../src/data/pokemon.js';
import { gymById } from '../src/data/gyms.js';

const koga = gymById('koga');
const stats = { judge: 13, ops: 12, focus: 12, know: 12, mental: 12 };
let rocks = 0, firstTurnRocks = 0, immuneRepeats = 0, poisonIntoSteel = 0, battles = 0;
for (let seed = 1; seed <= 30; seed++) {
  const rng = makeRng(seed);
  const steelix = await createPokemon({ species: 'Steelix', level: 44, rng });
  steelix.moves = ['Thunder Fang', 'Rock Slide', 'Curse', 'Stealth Rock'];
  steelix.tactics = { role: 'lead', status: 2, setup: 0, switchOut: -1, moves: {} };
  const foes = [];
  for (const d of koga.party) { const m = await createPokemon({ ...d, rng }); m.moves = [...d.moves]; m.nature = 'Serious'; foes.push(m); }
  const r = runBattle({
    trainerA: createTrainerAI({ name: '블루', stats, partyTactics: [steelix.tactics] }, '균형형', makeRng(seed + 1)),
    trainerB: createTrainerAI({ name: '독수', stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 16 } }, '균형형', makeRng(seed + 2)),
    teamA: partyToTeam([steelix]), teamB: partyToTeam(foes), seed,
  });
  battles++;
  let turn = 0;
  const immuneSeen = new Set();
  for (let i = 0; i < r.log.length; i++) {
    const l = r.log[i];
    if (l.startsWith('|turn|')) turn = Number(l.split('|')[2]);
    const p = l.split('|');
    if (p[1] === 'move' && p[2].startsWith('p1a') && p[3] === 'Stealth Rock') { rocks++; if (turn === 1) firstTurnRocks++; }
    if (p[1] === 'move' && p[2].startsWith('p2a') && ['Sludge', 'Toxic'].includes(p[3])) {
      poisonIntoSteel++;
      const who = p[2];
      if (immuneSeen.has(who)) immuneRepeats++;
      if (r.log.slice(i + 1, i + 4).some(x => x.startsWith('|-immune|'))) immuneSeen.add(who);
    }
  }
}
console.log(`${battles}전 · 스텔스록 ${rocks}회(1턴 ${firstTurnRocks}회) · 독 기술 ${poisonIntoSteel}회 · 효과 없음 확인 뒤 반복 ${immuneRepeats}회`);
assert(firstTurnRocks >= battles * 0.6, '선봉·변화기 적극이면 첫 턴 스텔스록을 깐다');
assert(rocks <= battles * 1.5, '이미 깔린 스텔스록은 다시 깔지 않는다');
assert(immuneRepeats <= battles * 0.1, '효과가 없다는 걸 본 뒤에는 같은 상대에게 다시 쓰지 않는다');
console.log('ai-status-moves PASS');

/* 필드 변화기: 걸려 있는 동안은 다시 안 쓰고, 풀리면 다시 쓴다 */
import { TrainerAI } from '../src/ai/trainer-ai.js';
import { Dex } from '@pkmn/sim';
const T = (s) => s.trim();
const screenTeam = T(`
Mr. Mime
Ability: Soundproof
Level: 50
- Reflect
- Psychic
- Rain Dance
- Thunderbolt

Kingdra
Ability: Swift Swim
Level: 50
- Rain Dance
- Surf
- Dragon Pulse
- Ice Beam`);
const physical = T(`
Machamp
Ability: Guts
Level: 50
- Close Combat
- Knock Off
- Stone Edge
- Bulk Up

Tauros
Ability: Intimidate
Level: 50
- Body Slam
- Earthquake
- Rock Slide
- Zen Headbutt

Ursaring
Ability: Guts
Level: 50
- Facade
- Crunch
- Close Combat
- Swords Dance`);
let reflects = 0, redundantReflect = 0, rains = 0, redundantRain = 0, recast = 0;
for (let seed = 1; seed <= 20; seed++) {
  const r = runBattle({ trainerA: createTrainerAI({ name: '갑', stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 } }, '균형형', makeRng(seed)),
    trainerB: createTrainerAI({ name: '을', stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 } }, '균형형', makeRng(seed + 50)), teamA: screenTeam, teamB: physical, seed });
  let reflectUp = false, rainUp = false, everReflect = false;
  for (const l of r.log) {
    if (l.startsWith('|-sidestart|p1') && l.includes('Reflect')) { reflectUp = true; everReflect = true; }
    if (l.startsWith('|-sideend|p1') && l.includes('Reflect')) reflectUp = false;
    if (l.startsWith('|-weather|RainDance') && !l.includes('[upkeep]')) rainUp = true;
    if (l.startsWith('|-weather|none')) rainUp = false;
    if (l.startsWith('|move|p1a') && l.includes('|Reflect|')) { reflects++; if (reflectUp) redundantReflect++; else if (everReflect) recast++; }
    if (l.startsWith('|move|p1a') && l.includes('|Rain Dance|')) { rains++; if (rainUp) redundantRain++; }
  }
}
console.log(`리플렉터 ${reflects}회(걸려 있는데 또 ${redundantReflect}, 풀린 뒤 다시 ${recast}) · 비바라기 ${rains}회(걸려 있는데 또 ${redundantRain})`);
assert(reflects >= 10, '물리 상대에게 리플렉터를 깐다');
assert(redundantReflect + redundantRain <= 1, '걸려 있는 벽·날씨는 다시 쓰지 않는다');

/* 랭크가 깊게 깎이면 교체 쪽으로 기운다 */
const ai = new TrainerAI({ gen: Dex.forGen(9), name: 't', stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 }, style: '균형형', styleVec: { phys: 1, spec: 1, status: 1, sw: 1 } });
const fakeMe = boosts => ({ boosts, moveSlots: [{ id: 'closecombat' }, { id: 'knockoff' }] });
const fakeFoe = { getStat: k => (k === 'atk' ? 120 : 80) };
assert.equal(ai.dropPressure(fakeMe({ atk: -1 }), fakeFoe), 0, '위협 한 번은 참는다');
assert(ai.dropPressure(fakeMe({ atk: -2 }), fakeFoe) > 0);
assert(ai.dropPressure(fakeMe({ atk: -4, def: -2 }), fakeFoe) >= 40, '크게 깎이면 빠질 이유가 크다');
assert.equal(ai.dropPressure(fakeMe({ spa: -3 }), fakeFoe) <= 0, true, '안 쓰는 특공 하락은 무시');
console.log('field/drop PASS');
