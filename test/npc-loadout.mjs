// NPC 장비: 진화한 NPC가 어릴 때 기술(울음소리·불꽃세례)을 버리고, 도구·키스톤을 챙겨 실제로 메가진화한다.
// 메가 포켓몬이 교체됐다 돌아와도 같은 개체로 기억하고, 쓰러진 뒤 일반 모습이 다시 나타나지 않는다.
import assert from 'node:assert/strict';
import { createPokemon, gainExp, expForLevel } from '../src/data/pokemon.js';
import { evolvePokemon } from '../src/engine/pokemon-management.js';
import { outfitNpcTrainer, bestMoves, megaStonesFor } from '../src/engine/npc-loadout.js';
import { runBattle, createTrainerAI, makeRng } from '../src/engine/run-battle.js';
import { partyToTeam } from '../src/data/pokemon.js';
import { toKoreanLog } from '../src/ui/protocol-ko.js';
import { PublicBattle } from '../src/engine/public-battle.js';
import { HELD_ITEMS } from '../src/data/items.gen.js';
import { Dex } from '@pkmn/dex';

const rng = () => 0.5;
const WEAK = ['Growl', 'Smokescreen', 'Tail Whip', 'Leer', 'Scary Face', 'String Shot', 'Sand Attack'];

/* 1. 파이리부터 키운 NPC 리자몽: 칸이 차 있어 새 기술을 못 넣던 그 상황 */
const zard = await createPokemon({ species: 'Charmander', level: 5, rng });
for (const [lv, to] of [[16, 'Charmeleon'], [36, 'Charizard'], [52, null]]) {
  await gainExp(zard, expForLevel(lv) - zard.exp);
  if (to) assert((await evolvePokemon(zard, to)).ok, `${to} 진화`);
}
assert(zard.moves.includes('Growl') || zard.moves.includes('Ember'), '재현: 어릴 때 기술이 남아 있다');
const npc = { name: 'NPC', party: [zard] };
outfitNpcTrainer(npc);
assert(!zard.moves.some((m) => WEAK.includes(m)), `약한 변화기 없음: ${zard.moves}`);
assert(!zard.moves.includes('Ember'), '불꽃세례 대신 더 센 불꽃 기술');
assert(zard.moves.every((m) => zard.learned.includes(m)), '배운 기술 안에서만');
assert.equal(new Set(zard.moves.map((m) => Dex.moves.get(m).type)).size >= 2, true, '타입 겹치지 않게');
assert.equal(HELD_ITEMS[zard.item]?.cat, 'mega', 'Lv35 이상 메가 가능 종은 메가스톤');
assert.equal(npc.keyStone, true, '키스톤');

/* 2. 도구: 파티 안에서 겹치지 않고, 레벨이 낮으면 열매 */
const team = { party: [] };
for (const [s, l] of [['Garchomp', 55], ['Gengar', 50], ['Blissey', 50], ['Scizor', 50], ['Starmie', 50], ['Pikachu', 12]]) team.party.push(await createPokemon({ species: s, level: l, rng }));
outfitNpcTrainer(team);
const items = team.party.map((m) => m.item).filter(Boolean);
assert.equal(items.length, team.party.length, '모두 도구를 지닌다');
assert.equal(new Set(items).size, items.length, '도구가 겹치지 않는다');
assert.equal(team.party.filter((m) => HELD_ITEMS[m.item]?.cat === 'mega').length, 1, '메가스톤은 한 마리만');
assert(['Oran Berry', 'Sitrus Berry'].includes(team.party[5].item), '낮은 레벨은 열매');
/* 원래 들고 있던 도구(관장·사용자 지정)는 건드리지 않는다 */
const own = { party: [await createPokemon({ species: 'Snorlax', level: 50, rng })] };
own.party[0].item = 'Chesto Berry';
outfitNpcTrainer(own);
assert.equal(own.party[0].item, 'Chesto Berry');
/* 탐험 현지 트레이너: 기술만 */
const route = { party: [await createPokemon({ species: 'Charizard', level: 40, rng })] };
outfitNpcTrainer(route, { items: false });
assert.equal(route.party[0].item, null); assert(!route.keyStone);
/* 리자몽·뮤츠는 스톤이 둘 — 기술 구성에 맞춰 고른다 */
assert.equal(megaStonesFor('Charizard').length, 2);

/* 3. 실제 배틀에서 NPC가 메가진화한다 */
const foe = { party: [await createPokemon({ species: 'Blastoise', level: 50, rng }), await createPokemon({ species: 'Venusaur', level: 50, rng })] };
outfitNpcTrainer(foe);
const st = { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 };
const me = [await createPokemon({ species: 'Snorlax', level: 50, rng })];
const r = runBattle({ trainerA: createTrainerAI({ name: '우리', stats: st }, '균형형', makeRng(3)),
  trainerB: createTrainerAI({ name: 'NPC', stats: st, keyStone: foe.keyStone }, '균형형', makeRng(4)),
  teamA: partyToTeam(me), teamB: partyToTeam(foe.party), seed: 3 });
assert(r.log.some((l) => l.startsWith('|-mega|p2a')), 'NPC 메가진화');

/* 4. 교체했다 돌아온 메가 포켓몬 — 같은 개체로 기억, 본 기술 유지 */
const pb = new PublicBattle();
pb.scan(['|poke|p2|Charizard, L50, F|', '|switch|p2a: Charizard|Charizard, L50, F|100/100', '|detailschange|p2a: Charizard|Charizard-Mega-X, L50, F',
  '|-mega|p2a: Charizard|Charizard|Charizardite X', '|move|p2a: Charizard|Dragon Claw|p1a: Snorlax',
  '|switch|p2a: Venusaur|Venusaur, L50, F|100/100', '|switch|p2a: Charizard|Charizard-Mega-X, L50, F|80/100']);
assert.deepEqual(pb.current('p2').moves, ['Dragon Claw'], '돌아와도 본 기술을 기억');
assert.equal(pb.current('p2').forme, 'Charizard-Mega-X', '메가 모습 그대로');

/* 5. 메가 포켓몬이 쓰러진 뒤 [silent] 원래 모습 줄이 화면을 되돌리지 않는다 */
const out = toKoreanLog(['|switch|p2a: Charizard|Charizard, L50, F|100/100', '|detailschange|p2a: Charizard|Charizard-Mega-X, L50, F',
  '|-mega|p2a: Charizard|Charizard|Charizardite X', '|faint|p2a: Charizard', '|detailschange|p2: Charizard|Charizard, L50, F|[silent]',
  '|-weather|SunnyDay|[upkeep]', '|turn|3'], { p1: 'A', p2: 'B' });
const lastField = out.filter((l) => l.field).at(-1).field;
assert.equal(lastField.p2.species, 'Charizard-Mega-X', '쓰러진 자리에 일반 리자몽이 다시 나타나지 않는다');

console.log('PASS: evolved NPC drops Growl/Ember, learned-only moves, unique items, berries at low level, keeps own items, route trainers moves-only, NPC megas in battle, mega identity across switches, no revert after faint');
