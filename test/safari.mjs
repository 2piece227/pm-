// 사파리존: 관동·성도 1~251(전설·환상 제외) 전부 구할 수 있다, 입장료·사파리볼 30개·배틀 없음·일반 볼 안 씀.
import assert from 'node:assert/strict';
import { Dex } from '@pkmn/dex';
import { LOCATIONS, locationById, locationsIn } from '../src/data/routes.js';
import { STARTERS } from '../src/data/species-pool.js';
import { SAFARI_ZONES, SAFARI_RULES, safariZoneOf } from '../src/data/safari.js';
import { createGame, playerAgency } from '../src/engine/game.js';
import { explore } from '../src/engine/explore.js';
import { createPokemon } from '../src/data/pokemon.js';
import { bagOf } from '../src/engine/pokemon-management.js';

const G = Dex.forGen(9);

/* 1. 도감 커버리지: 출현표 + 스타팅 + 진화로 1~251번 중 전설·환상이 아닌 종이 모두 닿는다 */
const have = new Set();
for (const l of LOCATIONS) for (const w of l.wild || []) have.add(G.species.get(w.species).name);
for (const s of STARTERS) have.add(G.species.get(s.species).name);
for (let grew = true; grew;) {
  grew = false;
  for (const sp of G.species.all()) if (sp.num >= 1 && sp.num <= 251 && !sp.forme && !have.has(sp.name) && sp.prevo && have.has(G.species.get(sp.prevo).name)) { have.add(sp.name); grew = true; }
}
const legend = sp => sp.tags?.some(t => /Legendary|Mythical/.test(t));
const missing = G.species.all().filter(sp => sp.num >= 1 && sp.num <= 251 && !sp.forme && !legend(sp) && !have.has(sp.name)).map(sp => sp.name);
assert.deepEqual(missing, [], `아직 구할 수 없는 종: ${missing.join(', ')}`);

/* 2. 지방마다 사파리존 하나, 구역은 지도 데이터에 kind 'safari'로 들어 있다 */
assert.deepEqual(SAFARI_ZONES.map(z => z.region).sort(), ['johto', 'kanto']);
for (const z of SAFARI_ZONES) for (const a of z.areas) {
  const loc = locationById(a.id);
  assert.equal(loc.kind, 'safari'); assert.equal(loc.zone, z.id); assert.equal(safariZoneOf(loc), z);
  assert(loc.wild.length && !loc.trainers.length);
}
assert(locationsIn('kanto').some(l => l.kind === 'safari') && locationsIn('johto').some(l => l.kind === 'safari'));

/* 3. 하루 탐험: 입장료, 사파리볼만, 배틀·경험치 없음 */
const g = await createGame({ seed: 11, startEmpty: true }), ag = playerAgency(g);
const mon = await createPokemon({ species: 'Pikachu', level: 30, rng: () => 0.5 });
const t = { id: 'red', name: '레드', party: [mon], stats: { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 }, record: { wins: 0, losses: 0 } };
ag.roster = [t]; ag.funds = 10000;
bagOf(t).pokeBall = 5;
const exp = mon.exp;
const r = await explore(g, t, 'safari-kanto-lake', 'battle', { activities: 8 });
assert.equal(r.money, -SAFARI_RULES.fee, '입장료');
assert.equal(bagOf(t).pokeBall, 5, '일반 몬스터볼은 쓰지 않는다');
assert.equal(r.won, null); assert.equal(r.wins + r.losses, 0, '배틀하지 않는다');
assert.equal(mon.exp, exp, '경험치 없음');
assert(r.events.length > 0 && r.events.every(e => e.kind === 'safari'));
assert(r.safari.thrown <= SAFARI_RULES.balls, '사파리볼은 30개까지');
assert(r.catches.every(c => c.ball === 'safariBall' && locationById('safari-kanto-lake').wild.some(w => w.species === c.species)));
assert(r.lines.some(l => /사파리볼 .*받았다/.test(l)));
/* 여러 날 다니면 결국 잡는다 */
let total = r.catches.length;
for (let d = 0; d < 6; d++) total += (await explore(g, t, 'safari-johto-forest', 'catch', { activities: 8 })).catches.length;
assert(total > 0, '사파리존에서 포켓몬을 잡는다');

/* 4. 입장료가 모자라면 못 들어간다 */
ag.funds = 100;
const broke = await explore(g, t, 'safari-kanto-plains', 'catch');
assert.equal(broke.money, 0); assert.equal(broke.events.length, 0);
assert(broke.lines.some(l => /입장료/.test(l)));

/* 5. 실제 하루 진행: 배정 → 하루 → 입장료가 자금에서 빠지고, 잡은 포켓몬은 박스로 */
{
  const { assignAction, exploreAction, advanceDay, describeAction } = await import('../src/engine/game.js');
  ag.funds = 5000; const boxBefore = ag.box.length;
  t.contract ??= { wage: 0 };
  assert(/사파리존 · 호수 구역 · 사파리볼 포획/.test(describeAction(exploreAction('safari-kanto-lake', 'catch', 8))));
  assignAction(g, 'red', exploreAction('safari-kanto-lake', 'catch', 8));
  const fundsBefore = ag.funds;
  const rep = await advanceDay(g);
  const ex = rep.explored.find(x => x.trainerId === 'red');
  assert(ex && ex.lines.some(l => /사파리볼/.test(l)), '하루 보고에 사파리 기록');
  assert.equal(ag.box.length - boxBefore, ex.caught, '잡은 만큼 박스로');
  assert(fundsBefore - ag.funds >= SAFARI_RULES.fee, '입장료가 자금에서 빠진다 (주급 등 다른 지출 포함)');
}
console.log(`PASS: Kanto/Johto 1-251 non-legendary all obtainable, 2 safari zones (${SAFARI_ZONES.reduce((n, z) => n + z.areas.length, 0)} areas), fee, safari balls only, no battles/exp, catches, broke entry refused, day flow (fee from funds, catches to box)`);
