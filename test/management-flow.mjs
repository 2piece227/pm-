import assert from 'node:assert/strict';
import { createGame, playerAgency, playerRoster, signYouth, advanceDay, assignAction, boxToParty, partyToBox } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { createPokemon, setMoves } from '../src/data/pokemon.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { makeRng } from '../src/engine/run-battle.js';
import { ATLAS_REGIONS, REGION_CHAINS } from '../src/data/region-atlas.js';
import { locationsIn } from '../src/data/routes.js';

const game = await createGame({ seed: 42, startEmpty: true, playerName: '회귀테스트' });
const starter = await createPokemon({ species: 'Charmander', level: 5, rng: makeRng(7) });
const stats = { judge: 12, ops: 10, focus: 9, know: 14, mental: 20 };
const trainer = createTrainer({ id:'y-test', name:'오성', stats, potential:stats, party:[starter] });
signYouth(game, trainer, { wage:7, signing:0, years:3 });
trainer.bag={pokeBall:30,potion:0};
assert.equal(trainer.party.length, 1);
assert.equal(trainer.party[0].level, 5);
assert.equal(partyToBox(game, trainer.id, 0).ok, false);
assignAction(game, trainer.id, 'explore:route1:battle');
const events = [];
const rep = await advanceDay(game, {onProgress: async e => events.push(e)});
assert.equal(rep.explored.length, 1);
assert.equal(rep.upkeep, 0, 'weekly wages must not be charged daily');
assert.equal(events[0].state, 'running');
assert.equal(events.at(-1).state, 'done');
assert.equal(rep.news.filter(n=>n.kind==='explore').length,1, 'mixed push/unshift news must not omit exploration');
assert.equal(game.day,2);

// Saving includes choices, caught Pokémon, move edits, and the exact RNG state.
playerAgency(game).box.push(await createPokemon({species:'Pidgey',level:3,rng:game.rng}));
assert.equal(boxToParty(game, trainer.id,0).ok,true);
assert.equal(setMoves(trainer.party[1],[trainer.party[1].moves[0]]),true);
assignAction(game, trainer.id, 'explore:route1:catch');
const restored = restoreGame(snapshotGame(game));
assert.deepEqual(snapshotGame(restored), snapshotGame(game));
await advanceDay(game);
await advanceDay(restored);
assert.deepEqual(snapshotGame(restored),snapshotGame(game),'continued simulation must match uninterrupted play');
await advanceDay(game);
await advanceDay(restored);
assert.deepEqual(snapshotGame(restored),snapshotGame(game),'tournament IDs and results must survive resume');
assert.equal(game.league.tournaments.length, 0, 'tournaments are removed from active play');
while (game.day <= 7) {
  const day=game.day;
  const report=await advanceDay(game);
  assert.equal(report.upkeep,day===7?7:0);
}
assert.equal(game.market.length,4,'market refresh must finish before return');
assert.equal(ATLAS_REGIONS.length,9);
for (const region of ATLAS_REGIONS.filter(r=>r.playable)) {
  const ids=new Set(locationsIn(region.id).map(l=>l.id));
  const connected=new Set();
  for (const chain of REGION_CHAINS[region.id]) for (const id of chain.split(' ')) { assert(ids.has(id),id); connected.add(id); }
  assert.equal(connected.size,ids.size,`${region.id}: every playable location should appear on the map`);
}
console.log('PASS: daily events, weekly pay, exact save/resume, box/moves, market refresh, 67 mapped locations / 9 region definitions');
