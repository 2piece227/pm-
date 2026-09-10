import assert from 'node:assert/strict';
import { Dex } from '@pkmn/dex';
import { createGame, signYouth, playerAgency, advanceDay, assignAction, boxToParty, rosterLock, parseExplore } from '../src/engine/game.js';
import { createTrainer } from '../src/data/agencies.js';
import { createPokemon, realStats, expForLevel } from '../src/data/pokemon.js';
import { makeRng } from '../src/engine/run-battle.js';
import { fieldState } from '../src/engine/field-state.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { GYMS } from '../src/data/gyms.js';
import { challengeGym } from '../src/engine/gyms.js';
import { explore } from '../src/engine/explore.js';
import { MANAGEMENT, changeMove, changeAbility, buySupplies, evolutionOptions, evolvePokemon, startTraining, trainingQuote, tickTraining, IV_KEYS, fatigueOf } from '../src/engine/pokemon-management.js';

const game=await createGame({seed:123,startEmpty:true});
const mon=await createPokemon({species:'Charmander',level:16,rng:makeRng(2)});
const stats={judge:20,ops:20,focus:20,know:20,mental:20};
const trainer=createTrainer({id:'manager-test',name:'검증',stats,potential:stats,party:[mon]});
signYouth(game,trainer,{wage:10,signing:0,years:3,proRaise:150,badgeBonus:5});
const agency=playerAgency(game);agency.funds=100000;

// Paid operations are atomic and preserve moves/PP when validation fails.
const replacement=mon.learned.find(m=>!mon.moves.includes(m));assert(replacement);
mon.fieldState={...fieldState(mon),pp:{scratch:1}};
let funds=agency.funds;
assert(changeMove(game,mon,0,replacement).ok);assert.equal(agency.funds,funds-MANAGEMENT.movePrice);
assert(!changeMove(game,mon,0,replacement).ok);assert.equal(agency.funds,funds-MANAGEMENT.movePrice);
assert(!changeMove(game,mon,1,'Spacial Rend').ok);assert.equal(mon.fieldState.pp.scratch,1);
const other=Object.values(Dex.species.get(mon.species).abilities).find(a=>a!==mon.ability);
funds=agency.funds;assert(changeAbility(game,mon,other).ok);assert.equal(agency.funds,funds-1000);
agency.funds=0;assert(!changeAbility(game,mon,'Blaze').ok);assert(!buySupplies(game,trainer.id,'pokeBall',1).ok);agency.funds=funds;
assert(!buySupplies(game,trainer.id,'pokeBall',-3).ok);assert(!buySupplies(game,trainer.id,'potion',1.5).ok);
funds=agency.funds;assert(buySupplies(game,trainer.id,'pokeBall',3).ok);assert.equal(agency.funds,funds-600);

// Level gating, manual evolution, same hidden ability slot, identity and injury preservation.
mon.level=15;assert(!evolutionOptions(mon)[0].ready);assert(!(await evolvePokemon(mon,'Charmeleon')).ok);
mon.level=16;const ivs={...mon.ivs},moves=[...mon.moves],exp=mon.exp;
assert((await evolvePokemon(mon,'Charmeleon')).ok);assert.equal(mon.species,'Charmeleon');
assert.deepEqual(mon.ivs,ivs);assert.deepEqual(mon.moves,moves);assert.equal(mon.exp,exp);assert.equal(mon.fieldState.pp.scratch,1);
assert(!(await evolvePokemon(mon,'Charmeleon')).ok);

// No free balls: stop before any capture attempt, then consume each ball actually thrown.
trainer.bag={pokeBall:0,potion:0};let r=await explore(game,trainer,'route1','catch');assert.equal(r.events.length,0);assert.equal(r.catches.length,0);
trainer.bag.pokeBall=1;r=await explore(game,trainer,'route1','catch',{activities:8});assert.equal(trainer.bag.pokeBall,0);assert.equal(r.events.filter(e=>e.kind==='catch').length,1);
trainer.bag.potion=1;mon.fieldState={...fieldState(mon),hp:1};r=await explore(game,trainer,'route1','battle',{activities:6});
assert.equal(r.events[0].kind,'potion');assert.equal(trainer.bag.potion,0);assert.equal(r.events[0].after[0].hp,Math.min(r.events[0].before[0].maxhp,21));
assert.equal(parseExplore('explore:route1:battle:10').activities,8,'legacy 10 activity saves clamp to 8');
assert.equal(fatigueOf({fatigue:0}).color,'fresh');assert.equal(fatigueOf({fatigue:50}).color,'tired');assert.equal(fatigueOf({fatigue:80}).color,'exhausted');

// IV training really consumes days, survives saves, cannot take the Pokémon out early.
const trainee=await createPokemon({species:'Pidgey',level:8,rng:makeRng(8)});trainee.ivs.atk=24;agency.box.push(trainee);
const targets={...trainee.ivs,atk:26};assert.equal(trainingQuote(trainee,targets).days,5);
assert(startTraining(game,trainee,targets).ok);assert(!boxToParty(game,trainer.id,0).ok);
assert(!changeMove(game,trainee,0,trainee.learned[0]).ok);
tickTraining(game);assert.equal(trainee.ivs.atk,24);
const restored=restoreGame(snapshotGame(game));
for(let i=0;i<4;i++){tickTraining(game);tickTraining(restored);}
assert.deepEqual(snapshotGame(game),snapshotGame(restored));assert.equal(trainee.ivs.atk,26);assert(!trainee.training);
assert(boxToParty(game,trainer.id,0).ok);
assert(!startTraining(game,mon,Object.fromEntries(IV_KEYS.map(k=>[k,31]))).ok,'party mons cannot enter training');
assert.equal(realStats(await createPokemon({species:'Shedinja',level:50,rng:makeRng(8)})).hp,1);

// All sixteen canonical first-challenge rosters have exact source levels and valid moves.
const expected=[[12,14],[18,21],[21,18,24],[29,24,29],[37,39,37,43],[38,37,38,43],[42,40,42,47],[45,42,44,45,50],
 [9,13],[17,15,15],[17,19],[21,21,25,23],[29,31],[30,30,35],[30,32,34],[38,38,38,41]];
assert.equal(GYMS.length,16);
for(const [i,g] of GYMS.entries()){
  assert.deepEqual(g.party.map(p=>p.level),expected[i],g.name);
  assert.equal(g.seriousParty.length,6);
  for(const p of [...g.party,...g.seriousParty]){assert(Dex.species.get(p.species).exists);for(const m of p.moves)assert(Dex.moves.get(m).exists,m);}
}

// Gym experience can evolve automatically; a loss grants neither badges nor rewards.
const autoGame=restoreGame(snapshotGame(game)),autoTrainer=playerAgency(autoGame).roster[0];
const growing=await createPokemon({species:'Charmander',level:15,rng:makeRng(2)});
growing.autoEvolve=true;growing.exp=expForLevel(16)-1;
const escort=await createPokemon({species:'Kyogre',level:100,rng:makeRng(3)});escort.moves=['Surf'];
autoTrainer.party=[escort,growing];autoGame.opening.done=true;autoGame.opening.firstTrainerId='another-trainer';autoTrainer.badges=GYMS.filter(g=>g.region==='kanto'&&g.id!=='brock').map(g=>g.id);
const autoMatch=await challengeGym(autoGame,autoTrainer,'brock');assert(autoMatch.won);assert.equal(growing.species,'Charmeleon');assert.equal(autoMatch.evolutions.length,1);assert.equal(autoTrainer.contract.wage,25,'later recruits also receive their contracted promotion raise');assert(!autoTrainer.isYouth);
const loseGame=restoreGame(snapshotGame(game)),loseTrainer=playerAgency(loseGame).roster[0];
loseTrainer.party=[await createPokemon({species:'Magikarp',level:1,rng:makeRng(3)})];loseTrainer.party[0].moves=['Splash'];
const lost=await challengeGym(loseGame,loseTrainer,'brock');assert(!lost.won);assert.equal(lost.reward,0);assert.equal(loseTrainer.badges.length,0);assert(lost.log.includes('|win|웅'));

// Full circuit, badges once only, stored replay and opening unlock after eight regional badges.
trainer.party=await Promise.all(['Kyogre','Mewtwo','Rayquaza'].map(species=>createPokemon({species,level:100,rng:makeRng(5)})));
trainer.party[0].moves=['Water Spout','Surf','Ice Beam','Thunder'];
trainer.party[1].moves=['Psychic','Aura Sphere','Flamethrower','Ice Beam'];
trainer.party[2].moves=['Dragon Claw','Earthquake','Flamethrower','Extreme Speed'];
trainer.fatigue=0;
for(const [i,g] of GYMS.entries()){
  assignAction(game,trainer.id,`gym:${g.id}`);const rep=await advanceDay(game);
  const match=rep.gyms[0];assert(match.won,g.name);assert(match.log.some(l=>l===`|win|${trainer.name}`));
  assert.deepEqual(match.party,g.party);assert.equal(game.pendingGymWatches.at(-1),match.id);
  if(i===6)assert(rosterLock(game));if(i===7)assert.equal(rosterLock(game),null);
  trainer.fatigue=0;
}
assert.equal(trainer.badges.length,16);assert.equal(trainer.contract.wage,25,'150% raise applied once');
const count=trainer.badges.length;const repeat=await challengeGym(game,trainer,'brock');assert(!repeat.firstWin);assert.equal(repeat.reward,0);assert.equal(trainer.badges.length,count);
await assert.rejects(()=>challengeGym(game,trainer,'brock'),/하루 한 번/);
assert.deepEqual(snapshotGame(restoreGame(snapshotGame(game))),snapshotGame(game));
console.log('PASS: charged moves/abilities, evolution, finite supplies, potion use, fatigue, IV days/locks/save, all 16 gyms, exact party levels, badge unlock, no duplicate rewards, replay persistence');
