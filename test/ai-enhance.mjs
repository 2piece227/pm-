// 원작 AI 보강(src/ai/ar/enhance.js): 점검에서 재현한 장면이 고쳐졌는지, 끄면 원작대로인지.
import assert from 'node:assert/strict';
import { Battle, Teams } from '@pkmn/sim';
import { createTrainerAI, makeRng } from '../src/engine/run-battle.js';
import { ENHANCE } from '../src/ai/ar/enhance.js';

const ST = { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 };
const ON = structuredClone(ENHANCE);
const OFF = { ...structuredClone(ENHANCE), effectChance: false, damage: { ...ENHANCE.damage, on: false }, setupSense: false,
  setupValue: { ...ENHANCE.setupValue, on: false }, reserveLastMinParty: 0, matchupReplacement: false };
const use = cfg => Object.assign(ENHANCE, structuredClone(cfg));

function battle(a, b, seed = 7) {
  const bt = new Battle({ formatid: 'gen9customgame', seed: [seed, 2, 3, 4] });
  bt.setPlayer('p1', { name: 'A', team: Teams.pack(Teams.import(a)) });
  bt.setPlayer('p2', { name: 'B', team: Teams.pack(Teams.import(b)) });
  if (bt.p1.activeRequest?.teamPreview) bt.makeChoices('default', 'default');
  return bt;
}
function scores(bt, seed = 1) {
  const ai = createTrainerAI({ name: 'A', stats: ST }, '균형형', makeRng(seed));
  ai.bindParty([...bt.p1.pokemon], bt.p2.pokemon.length);
  const d = ai.chooseAction(bt, 'p1');
  return { d, by: Object.fromEntries(d.think.options.filter(o => o.kind === 'move').map(o => [o.moveId, o])), ai };
}

/* 1. 부가효과 확률: 반감 화염방사(화상 10%) vs 효과 굉장 원시의힘 (상대 물리기 공개 뒤) */
const ZARD = `Charizard\nAbility: Blaze\nLevel: 50\nTimid Nature\nEVs: 252 SpA / 252 Spe\n- Flamethrower\n- Ancient Power\n- Air Slash\n- Dragon Claw`;
const NITE = `Dragonite\nAbility: Inner Focus\nLevel: 50\nAdamant Nature\nEVs: 252 Atk / 252 HP\n- Dragon Claw\n- Extreme Speed\n- Earthquake\n- Fire Punch`;
const sceneB = () => { const bt = battle(ZARD, NITE); bt.makeChoices('move 4', 'move 1'); return bt; };
use(OFF);
let r = scores(sceneB());
assert(r.by.flamethrower.score > r.by.ancientpower.score, '보강을 끄면 원작대로 화염방사가 위 (점검 재현)');
use(ON);
r = scores(sceneB());
assert(r.by.ancientpower.score > r.by.flamethrower.score, `보강: 효과 굉장 원시의힘이 위 (${r.by.ancientpower.score} vs ${r.by.flamethrower.score})`);
assert.equal(r.by.flamethrower.prob, 0, '반감 화염방사는 고르지 않는다');

/* 1b. 반동기에 묶인 화상(플레어드라이브 10%)도 확률만큼 — 보만다에게 치근거리기가 위 */
const NINE = `Arcanine\nAbility: Intimidate\nLevel: 50\nAdamant Nature\nEVs: 252 Atk / 252 Spe\n- Flare Blitz\n- Extreme Speed\n- Play Rough\n- Crunch`;
const MENCE = `Salamence\nAbility: Moxie\nLevel: 50\nJolly Nature\nEVs: 252 Atk / 252 Spe\n- Dragon Claw\n- Dual Wingbeat\n- Roost\n- Crunch`;
r = scores(battle(NINE, MENCE));
assert(r.by.playrough.score > r.by.flareblitz.score, `치근거리기(×2) > 플레어드라이브(×0.5): ${r.by.playrough.score} vs ${r.by.flareblitz.score}`);

/* 2. 써먹을 수 없는 랭크업: 더 빠른 리자몽 화염방사에 한 방 — 칼춤을 쌓지 않는다 */
const SCIZOR = `Scizor\nAbility: Technician\nLevel: 50\nAdamant Nature\nEVs: 252 Atk / 252 HP\n- Swords Dance\n- X-Scissor\n- Bullet Punch\n- Iron Head`;
const ZARD2 = `Charizard\nAbility: Blaze\nLevel: 50\nTimid Nature\nEVs: 252 SpA / 252 Spe\n- Flamethrower\n- Air Slash\n- Dragon Pulse\n- Roost`;
use(OFF);
assert(scores(battle(SCIZOR, ZARD2, 3)).by.swordsdance.prob > 0.5, '원작은 첫 턴 칼춤 (점검 재현)');
use(ON);
r = scores(battle(SCIZOR, ZARD2, 3));
assert.equal(r.by.swordsdance.prob, 0, '보강: 한 방에 쓰러질 판에 칼춤 안 함');
/* 서로 한 방에 못 쓰러뜨리면 랭크업은 쓸 만한 수로 남는다 (너트령: 핫삼에게 약점 기술이 없다) */
r = scores(battle(SCIZOR, `Ferrothorn\nAbility: Iron Barbs\nLevel: 50\nRelaxed Nature\nEVs: 252 HP / 252 Def\n- Power Whip\n- Gyro Ball\n- Leech Seed\n- Protect`, 3));
assert(r.by.swordsdance.score > 60 && r.ai.core.outlook && !r.ai.core.outlook.dies && !r.ai.core.outlook.canKO, `버티는 상대 앞에서는 칼춤도 쓸 만한 수 (${r.by.swordsdance.score})`);

/* 3. 2마리 파티: 남은 한 마리를 아낀다고 자발 교체가 통째로 막히지 않는다 */
const DUO = `Venusaur\nAbility: Overgrow\nLevel: 50\n- Giga Drain\n- Sludge Bomb\n\nBlastoise\nAbility: Torrent\nLevel: 50\nEVs: 252 HP / 252 SpD\n- Surf\n- Ice Beam`;
const FIRE = `Arcanine\nAbility: Intimidate\nLevel: 50\n- Flare Blitz\n- Wild Charge`;
for (const [cfg, expectNull] of [[OFF, true], [ON, false]]) {
  use(cfg);
  const bt = battle(DUO, FIRE);
  const ai = createTrainerAI({ name: 'A', stats: ST }, '균형형', makeRng(1));
  ai.bindParty([...bt.p1.pokemon], 1);
  ai.prepare(bt, 'p1');
  const pick = ai.core.chooseBestReplacement(false);
  if (expectNull) assert.equal(pick, null, '원작: 2마리 파티는 아낄 포켓몬뿐이라 후보 없음');
  else assert.equal(pick?.mon.name, 'Blastoise', '보강: 불꽃 상대로 거북왕을 후보로 본다');
}

/* 4. 교대 후보 상성: 쓰러져 내보낼 때 불꽃에 강한 쪽 */
use(ON);
{
  const bt = battle(`Pikachu\nLevel: 5\n- Thunder Shock\n\nScizor\nLevel: 50\n- Bullet Punch\n\nGarchomp\nLevel: 50\n- Earthquake\n\nVenusaur\nLevel: 50\n- Giga Drain`, FIRE);
  bt.makeChoices('move 1', 'move 1');
  assert(bt.p1.activeRequest?.forceSwitch, '피카츄가 쓰러져 교대해야 한다');
  {
    const ai = createTrainerAI({ name: 'A', stats: ST }, '균형형', makeRng(2));
    ai.bindParty([...bt.p1.pokemon], 1);
    const d = ai.chooseForcedSwitch(bt, 'p1');
    assert.equal(bt.p1.pokemon[Number(d.choice.split(' ')[1]) - 1].name, 'Garchomp', `불꽃 상대로 한카리아스: ${d.choice}`);
  }
}
use(ON);
console.log('PASS: effect chance (Flamethrower/Flare Blitz), no doomed setup, setup kept when safe, 2-mon voluntary switch, matchup replacement, OFF = original');
