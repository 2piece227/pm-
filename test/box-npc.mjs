// 박스 정리(연구실)와 NPC 진화(돌·통신·친밀도 진화 Lv20/40), NPC 동료는 사파리존에서도.
import assert from 'node:assert/strict';
import { createGame, playerAgency, sendToLab, sendManyToLab, LAB_REWARD } from '../src/engine/game.js';
import { createPokemon } from '../src/data/pokemon.js';
import { evolveNpc, NPC_EVOLUTION } from '../src/engine/pokemon-management.js';
import { Dex } from '@pkmn/dex';
import fs from 'node:fs';

/* 1. 연구실: 박스에서 빠지고 사례금, 지닌 도구는 창고로, 훈련 중이면 거절 */
const g = await createGame({ seed: 9, startEmpty: true }), a = playerAgency(g);
const rng = () => 0.5;
a.box = [await createPokemon({ species: 'Rattata', level: 5, rng }), await createPokemon({ species: 'Pidgey', level: 5, rng }), await createPokemon({ species: 'Zubat', level: 5, rng })];
a.box[1].item = 'Leftovers'; a.box[2].training = { days: 3 };
const funds = a.funds;
let r = sendToLab(g, 0);
assert(r.ok && /꼬렛을 연구실에 보냈습니다/.test(r.msg), r.msg);
assert.equal(a.box.length, 2); assert.equal(a.funds, funds + LAB_REWARD);
r = sendToLab(g, 0);
assert(r.ok && (a.items || {}).Leftovers === 1, '지닌 도구는 창고로');
assert(!sendToLab(g, 0).ok, '훈련 중이면 못 보낸다');
assert(!sendToLab(g, 9).ok, '없는 칸');

/* 1-2. 여러 마리 한 번에: 순서·중복 상관없이 골라 보내고, 훈련 중은 남긴다 */
{
  a.box = [];
  for (const sp of ['Rattata', 'Pidgey', 'Zubat', 'Caterpie', 'Weedle']) a.box.push(await createPokemon({ species: sp, level: 5, rng }));
  a.box[1].item = 'Oran Berry'; a.box[3].training = { days: 2 };
  const keep = [a.box[2], a.box[3]], f0 = a.funds, berries = (a.items || {})['Oran Berry'] || 0;
  const m = sendManyToLab(g, [0, 4, 1, 3, 1, 99]);
  assert(m.ok && m.sent === 3 && m.skipped === 1 && m.reward === 3 * LAB_REWARD, m.msg);
  assert(/3마리를 연구실에 보냈습니다/.test(m.msg) && /도구 1개/.test(m.msg) && /훈련 중인 1마리/.test(m.msg), m.msg);
  assert.deepEqual(a.box, keep, '고르지 않은 것과 훈련 중인 것만 남는다');
  assert.equal(a.funds, f0 + 3 * LAB_REWARD); assert.equal(a.items['Oran Berry'], berries + 1);
  assert(!sendManyToLab(g, []).ok && !sendManyToLab(g, [1]).ok, '빈 선택·훈련 중만이면 거절');
  assert.equal(a.box.length, 2);
}

/* 2. NPC 진화: 자동 진화는 그대로, 레벨 조건 없는 진화는 1단계 Lv20 / 2단계 Lv40 */
const evo = async (sp, lv) => { const m = await createPokemon({ species: sp, level: lv, rng }); const out = await evolveNpc(m); return out?.after || null; };
assert.equal(await evo('Eevee', NPC_EVOLUTION.firstStage - 1), null, '이브이 Lv19는 그대로');
assert(Dex.species.get('Eevee').evos.includes(await evo('Eevee', NPC_EVOLUTION.firstStage)), '이브이 Lv20 → 진화형 중 하나');
assert.equal(await evo('Haunter', 39), null);
assert.equal(await evo('Haunter', NPC_EVOLUTION.secondStage), 'Gengar', '통신진화 2단계는 Lv40');
assert.equal(await evo('Vulpix', 60), 'Ninetales', '돌 진화');
assert.equal(await evo('Charmander', 16), 'Charmeleon', '레벨 진화는 원래 레벨');
assert.equal(await evo('Charmander', 15), null);
assert.notEqual(await evo('Pikachu', 40), 'Raichu-Alola', '지역 폼으로는 가지 않는다');
/* 갈래는 개체마다 다르게 (이브이 여러 마리 → 진화형이 한 가지만 나오지 않는다) */
const kinds = new Set();
for (let i = 0; i < 12; i++) { const m = await createPokemon({ species: 'Eevee', level: 25, rng: Math.random }); kinds.add((await evolveNpc(m)).after); }
assert(kinds.size > 1, `이브이 진화형이 다양: ${[...kinds]}`);

/* 3. NPC 유스 동료 찾기에서 사파리존을 막지 않는다 */
const src = fs.readFileSync(new URL('../src/engine/league-reform.js', import.meta.url), 'utf8');
assert(!/kind !== 'safari'/.test(src), 'NPC도 사파리존 동료를 얻는다');
assert(/evolveNpc\(m\)/.test(src), 'NPC 유스 성장에서 evolveNpc를 쓴다');

console.log('PASS: lab send (reward, item back, training refused), bulk lab send, NPC evolution Lv20/40 (stone/trade), level evolutions unchanged, no regional forms, varied branches, NPC safari companions');
