import assert from 'node:assert/strict';
import { createGame, playerAgency, signYouth, advanceDay, assignAction, parseExplore, exploreAction } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { createPokemon } from '../src/data/pokemon.js';
import { explore, applyLoss } from '../src/engine/explore.js';
import { fieldState, healParty } from '../src/engine/field-state.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { makeRng, createTrainerAI, runBattle } from '../src/engine/run-battle.js';
import { partyToTeam } from '../src/data/pokemon.js';
import { LOCATIONS } from '../src/data/routes.js';
import { TOWN_POSITIONS, TOWN_MAP } from '../src/data/town-map.js';

const stats = {judge:12,ops:10,focus:9,know:14,mental:20};
const game = await createGame({seed:42,startEmpty:true,playerName:'활동검증'});
const trainer = createTrainer({id:'explore-test',name:'오성',stats,potential:stats,party:[
  await createPokemon({species:'Charmander',level:5,rng:makeRng(7)})]});
signYouth(game,trainer,{wage:7,signing:0,years:3});
assert.equal(parseExplore('explore:route1:catch').activities,8,'old saves default to eight');
assert.equal(parseExplore(exploreAction('route1','mixed',10)).activities,10);
assert.equal(parseExplore('explore:route1:mixed:11'),null);

// Every day includes centers inside the limit, including a forced center in the first slot.
for (const budget of [6,8,10]) {
  trainer.party[0].fieldState={...fieldState(trainer.party[0]),hp:0};
  assignAction(game,trainer.id,exploreAction('route1','mixed',budget));
  const copy=restoreGame(snapshotGame(game));
  const boxBefore=playerAgency(game).box.length;
  const rep=await advanceDay(game);
  await advanceDay(copy);
  assert.deepEqual(snapshotGame(game),snapshotGame(copy),'randomness, HP, PP, report survive restore');
  const r=rep.explored[0];
  assert.equal(r.events.length,budget);
  assert.equal(r.events[0].kind,'center');
  assert.equal(r.events.filter(e=>e.kind==='center').length,r.centers);
  assert.equal(playerAgency(game).box.length-boxBefore,r.caught,'all catches reach the box');
  assert.equal(rep.prize,r.events.reduce((n,e)=>n+e.money,0));
  assert.equal(r.wins+r.losses+r.centers,budget);
  for(const [i,event] of r.events.entries()) {
    assert.equal(event.slot,i+1);
    if(i) assert.deepEqual(event.before,r.events[i-1].after,'HP cannot reset between activities');
    if(event.kind==='center') for(const p of event.after) {
      assert.equal(p.hp,p.maxhp); assert.equal(p.status,''); assert.deepEqual(p.pp,{});
    }
    else for(const [n,state] of event.battleBefore.entries()) {
      assert.equal(state.hp,event.before[n].hp,'engine starts from persisted HP');
      for(const [move,pp] of Object.entries(event.before[n].pp)) assert.equal(state.pp[move],pp,'PP carries into engine');
    }
  }
  assert.deepEqual(trainer.party.map(fieldState),r.events.at(-1).after,'no free end-of-day heal');
  console.log(`${budget} slots: ${r.wins}W ${r.losses}L / ${r.caught} catches / ${r.centers} centers / +${r.money}`);
}

// Status and PP-only exhaustion must both consume a center activity.
for(const reason of ['status','pp']) {
  healParty(trainer);
  const mon=trainer.party[0];
  mon.fieldState={...fieldState(mon),status:reason==='status'?'brn':'',pp:reason==='pp'?Object.fromEntries(mon.moves.map(m=>[m.toLowerCase().replace(/[^a-z0-9]/g,''),0])):{}};
  const r=await explore(game,trainer,'route1','catch',{activities:6});
  assert.equal(r.events[0].kind,'center');
  assert.match(r.events[0].lines[0],reason==='status'?/상태이상/:/PP/);
}
trainer.mentalDebuff=2;
const low={stats:{...stats,mental:3}}, high={stats:{...stats,mental:20}};
applyLoss(low);applyLoss(high);assert(low.mentalDebuff>high.mentalDebuff);
assignAction(game,trainer.id,'rest');await advanceDay(game);
assert(trainer.mentalDebuff<2);assert.equal(fieldState(trainer.party[0]).hp,fieldState(trainer.party[0]).maxhp);

// Facing a much stronger route alternates defeat and center; it must not add free recoveries.
const weak = createTrainer({id:'weak',name:'초보',stats:{...stats,mental:3},party:[
  await createPokemon({species:'Charmander',level:5,rng:makeRng(3)})]});
const hardDay = await explore(game,weak,'route23','battle',{activities:6});
assert.deepEqual(hardDay.events.map(e=>e.kind),['battle','center','battle','center','battle','center']);
assert.equal(hardDay.losses,3);assert.equal(hardDay.money,0);assert(weak.mentalDebuff>0);
assert.equal(weak.lossStreak,3,'center healing must not erase a trainer losing streak');

// Unequipped move PP is retained so swapping moves cannot manufacture a free refill.
const strong = createTrainer({id:'pp-test',name:'검증',stats,party:[
  await createPokemon({species:'Charizard',level:50,rng:makeRng(9)})]});
strong.party[0].moves=['Flamethrower'];
strong.party[0].fieldState={...fieldState(strong.party[0]),pp:{scratch:1}};
await explore(game,strong,'route1','battle',{activities:6});
assert.equal(strong.party[0].fieldState.pp.scratch,1);

// Showdown's team list is reordered when it switches. HP snapshots must keep original slot identity.
const party=await Promise.all(['Charmander','Squirtle'].map(species=>createPokemon({species,level:5,rng:makeRng(4)})));
const aiA=createTrainerAI({name:'A',stats},'균형형',makeRng(1));
const aiB=createTrainerAI({name:'B',stats},'균형형',makeRng(2));
let switched=false;
const choose=aiA.chooseAction.bind(aiA);
aiA.chooseAction=(battle,side)=>{if(!switched){switched=true;return {choice:'switch 2'};}return choose(battle,side);};
const r=runBattle({trainerA:aiA,trainerB:aiB,teamA:partyToTeam(party),teamB:partyToTeam([party[0]]),seed:12,
  initialState:{p1:[{hp:14,status:'par',pp:{scratch:3}},null]}});
assert.equal(r.hpBefore.p1[0].hp,14);assert.equal(r.hpBefore.p1[0].status,'par');
assert.equal(r.hpBefore.p1[0].pp.scratch,3);
assert(r.stats.switches.p1>0);
assert.deepEqual(r.hpAfter.p1.map(p=>p.species),party.map(p=>p.species));
for(const loc of LOCATIONS) {
  const p=TOWN_POSITIONS[loc.id];assert(p,loc.id);
  assert(p[0]>=0&&p[0]<=TOWN_MAP.width&&p[1]>=0&&p[1]<=TOWN_MAP.height);
}
console.log('PASS: budgets, centers, persistent HP/status/PP, all catches, finance, morale, exact resume, switched slot identity, 67 map positions');
