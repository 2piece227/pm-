// 진화 방법 8종: 레벨·도구·통신(연결의끈)·친밀도·지닌 도구·기술·특수 조건·배틀 기록(저승갓숭 등)
import assert from 'node:assert/strict';
import { createGame, playerAgency } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { createPokemon, gainExp, expForLevel } from '../src/data/pokemon.js';
import { evolutionOptions, evolvePokemon } from '../src/engine/pokemon-management.js';
import { recordBattle } from '../src/engine/evolution.js';
import { buyItem, giveItem, itemsOf } from '../src/engine/shop.js';
import { EVO_ITEMS } from '../src/data/items.gen.js';

const g = await createGame({ seed: 3, startEmpty: true }), a = playerAgency(g);
const t = createTrainer({ id: 'e', name: '진화', party: [], stats: { judge: 10, ops: 10, focus: 10, know: 10, mental: 10 }, potential: { judge: 12, ops: 12, focus: 12, know: 12, mental: 12 } });
a.roster = [t]; a.funds = 10_000_000; g.opening.done = true;
const mk = async (species, level) => { const m = await createPokemon({ species, level, rng: () => 0.5 }); t.party.push(m); return m; };
const opt = (m, sp) => evolutionOptions(m, g).find(o => o.species === sp);
assert(EVO_ITEMS['Linking Cord'] && EVO_ITEMS['Thunder Stone'] && EVO_ITEMS['Gimmighoul Coin'].price === 10);

/* 도구 사용: 창고의 천둥의돌 1개 소모 */
const pika = await mk('Pikachu', 20);
assert(!opt(pika, 'Raichu').ready);
assert(buyItem(g, 'Thunder Stone', 1).ok); assert(opt(pika, 'Raichu').ready); assert(!opt(pika, 'Raichu').auto, '도구 진화는 자동 아님');
assert((await evolvePokemon(pika, 'Raichu', g)).ok); assert.equal(pika.species, 'Raichu'); assert(!itemsOf(a)['Thunder Stone']);

/* 통신진화: 연결의끈, 도구를 지닌 통신진화는 그 도구를 지닌 채 */
const haunter = await mk('Haunter', 30), onix = await mk('Onix', 30);
assert(!opt(haunter, 'Gengar').ready);
assert(buyItem(g, 'Linking Cord', 2).ok); assert(opt(haunter, 'Gengar').ready);
assert(!opt(onix, 'Steelix').ready, '금속코트를 안 지녔다');
assert(buyItem(g, 'Metal Coat', 1).ok); assert(giveItem(g, onix, 'Metal Coat').ok); assert(opt(onix, 'Steelix').ready);
assert((await evolvePokemon(haunter, 'Gengar', g)).ok); assert((await evolvePokemon(onix, 'Steelix', g)).ok);
assert.equal(onix.item, null, '지닌 도구도 소모'); assert(!itemsOf(a)['Linking Cord']);

/* 친밀도: 레벨업으로 오르고, 160에서 낮/밤 둘 다 가능하니 자동 진화는 안 한다 */
const eevee = await mk('Eevee', 10);
assert.equal(eevee.friendship ?? 70, 70);
await gainExp(eevee, expForLevel(30) - eevee.exp); assert(eevee.friendship > 70, '레벨업으로 친밀도');
eevee.friendship = 160;
assert(opt(eevee, 'Espeon').ready && opt(eevee, 'Umbreon').ready); assert(!opt(eevee, 'Espeon').auto);

/* 기술·스탯·파티 조건 */
const pilo = await mk('Piloswine', 34); pilo.moves = ['Ancient Power'];
assert(opt(pilo, 'Mamoswine').ready && opt(pilo, 'Mamoswine').auto);
const tyro = await mk('Tyrogue', 20); const tops = ['Hitmonlee', 'Hitmonchan', 'Hitmontop'].filter(s => opt(tyro, s).ready);
assert.equal(tops.length, 1, '타이로는 공격/방어 비교로 하나만');

/* 배틀 기록: 저승갓숭(분노의주먹 20회), 대도각참(절각참 3마리) */
const prime = await mk('Primeape', 40);
const rage = ['|switch|p1a: Primeape|Primeape, L40|100/100', ...Array.from({ length: 20 }, () => '|move|p1a: Primeape|Rage Fist|p2a: Foe')];
recordBattle(t.party, rage.slice(0, 11)); assert(!opt(prime, 'Annihilape').ready); assert(/10\/20/.test(opt(prime, 'Annihilape').need));
recordBattle(t.party, rage); assert(opt(prime, 'Annihilape').ready && opt(prime, 'Annihilape').auto);
assert((await evolvePokemon(prime, 'Annihilape', g)).ok);
const bish = await mk('Bisharp', 52);
recordBattle(t.party, ['|switch|p1a: Bisharp|Bisharp, L52|100/100', ...Array.from({ length: 3 }, () => ['|move|p1a: Bisharp|Kowtow Cleave|p2a: Bisharp', '|faint|p2a: Bisharp']).flat()]);
assert(opt(bish, 'Kingambit').ready);
/* 타부자고: 모으령의코인 999개 */
const gimmi = await mk('Gimmighoul', 30);
assert(buyItem(g, 'Gimmighoul Coin', 998).ok); assert(!opt(gimmi, 'Gholdengo').ready);
assert(buyItem(g, 'Gimmighoul Coin', 1).ok); assert(opt(gimmi, 'Gholdengo').ready);
assert((await evolvePokemon(gimmi, 'Gholdengo', g)).ok); assert(!itemsOf(a)['Gimmighoul Coin']);
/* 레벨 진화는 그대로 */
const charm = await mk('Charmander', 16); assert(opt(charm, 'Charmeleon').ready && opt(charm, 'Charmeleon').auto);
console.log('PASS: stone, Linking Cord trade (+held item), friendship gain/choice, move/stat conditions, Annihilape/Kingambit counters, 999 coins, level');
