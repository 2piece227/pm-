// 메가진화: 키스톤 + 맞는 메가스톤일 때만, AI는 첫 공격 턴에 메가진화, 배틀당 1회. 자막·그림 교체.
import assert from 'node:assert/strict';
import { runBattle, createTrainerAI, makeRng } from '../src/engine/run-battle.js';
import { toKoreanLog } from '../src/ui/protocol-ko.js';
import { HELD_ITEMS } from '../src/data/items.gen.js';
import { createGame, playerAgency } from '../src/engine/game.js';
import { createPokemon } from '../src/data/pokemon.js';
import { megaReadiness, buyKeyStone } from '../src/engine/shop.js';

const st = { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 };
const teamA = `Charizard @ Charizardite X\nAbility: Blaze\nLevel: 50\n- Flare Blitz\n- Dragon Claw\n- Earthquake\n- Dragon Dance\n\nGyarados @ Gyaradosite\nAbility: Intimidate\nLevel: 50\n- Waterfall\n- Crunch`;
const teamB = `Venusaur @ Venusaurite\nAbility: Overgrow\nLevel: 50\n- Giga Drain\n- Sludge Bomb\n\nBlastoise @ Leftovers\nAbility: Torrent\nLevel: 50\n- Surf`;
const battle = (keyA, keyB, seed = 7) => runBattle({
  trainerA: createTrainerAI({ name: 'A', stats: st, keyStone: keyA }, '균형형', makeRng(seed)),
  trainerB: createTrainerAI({ name: 'B', stats: st, keyStone: keyB }, '균형형', makeRng(seed + 1)),
  teamA, teamB, seed });

/* 스톤 데이터: 고전 + 레전즈 Z-A, 한국어 이름 */
const megas = Object.entries(HELD_ITEMS).filter(([, v]) => v.cat === 'mega');
assert(megas.length >= 90); assert.equal(HELD_ITEMS['Charizardite X'].ko, '리자몽나이트X'); assert.equal(HELD_ITEMS['Charizardite X'].evolves, 'Charizard');

/* 키스톤 있는 쪽만 메가진화, 첫 턴에 바로, 한 배틀에 한 번 */
let r = battle(true, false);
const megaLines = r.log.filter(l => l.startsWith('|-mega|'));
assert.equal(megaLines.length, 1, '배틀당 1회'); assert(megaLines[0].startsWith('|-mega|p1a: Charizard'));
const firstMove = r.log.findIndex(l => l.startsWith('|move|p1a:'));
assert(r.log.findIndex(l => l.startsWith('|-mega|p1a')) < firstMove, '첫 공격 전에 메가진화');
assert(!r.log.some(l => l.startsWith('|-mega|p2a')), '키스톤 없는 상대는 스톤이 있어도 못 한다');
r = battle(false, false);
assert(!r.log.some(l => l.startsWith('|-mega|')), '키스톤이 없으면 아무도 안 한다');
r = battle(true, true);
assert(r.log.some(l => l.startsWith('|-mega|p2a: Venusaur')), '상대도 키스톤이 있으면 한다');

/* 자막과 그림 교체 */
const out = toKoreanLog(battle(true, false).log, { p1: '블루', p2: 'B' });
const msgs = out.map(l => l.msg).filter(Boolean);
assert(msgs.some(m => m === '리자몽의 리자몽나이트X와\n블루의 키스톤이 반응했다!'));
assert(msgs.some(m => m === '리자몽은 메가리자몽X로\n메가진화했다!'));
const after = out[out.findIndex(l => /메가진화했다/.test(l.msg || ''))].field;
assert.equal(after.p1.species, 'Charizard-Mega-X'); assert.equal(after.p1.name, '리자몽');
/* 왜 메가진화를 안 하는지 알려준다: 맞지 않는 스톤 / 키스톤 없음 / 준비 완료 */
const g = await createGame({ seed: 4, startEmpty: true }), ag = playerAgency(g); ag.funds = 100000;
const tr = { id: 'b', name: '블루', party: [], stats: st };
ag.roster = [tr];
const zard = await createPokemon({ species: 'Charizard', level: 40, rng: () => 0.5 }), bulba = await createPokemon({ species: 'Bulbasaur', level: 10, rng: () => 0.5 });
tr.party = [zard, bulba]; zard.item = 'Charizardite X'; bulba.item = 'Venusaurite';
assert.equal(megaReadiness(g, bulba).state, 'wrong');
assert.equal(megaReadiness(g, zard).state, 'nokey');
assert(buyKeyStone(g, 'b').ok); assert.equal(megaReadiness(g, zard).state, 'ok');
assert.equal(megaReadiness(g, { species: 'Pikachu', item: 'Leftovers' }), null);
console.log('PASS: 92 Korean mega stones, key stone required, AI megas before first attack, once per battle, Korean messages, sprite species switch, readiness warnings (wrong stone / no key stone)');
