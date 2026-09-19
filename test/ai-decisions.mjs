import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {createTrainerAI,makeRng} from '../src/engine/run-battle.js';
import {effectiveSpeed,actsBefore,entryDamagePct,residualPct,executionChance} from '../src/ai/tactics.js';
import {neutralDamagePct,bestDamagePct,realDamagePct} from '../src/ai/estimate.js';

const full={judge:20,ops:20,focus:20,know:20,mental:20};
function position(a,b,edit=()=>{}){
  const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
  battle.setPlayer('p1',{name:'A',team:Teams.pack(Teams.import(a))});
  battle.setPlayer('p2',{name:'B',team:Teams.pack(Teams.import(b))});
  battle.makeChoices('default','default');
  edit(battle.p1.active[0],battle.p2.active[0],battle);
  const ai=createTrainerAI({name:'A',stats:full},'균형형',makeRng(9));
  // Isolate the phase-1 tactical evaluator with a fully observed position.
  // Public-information isolation and reveal chronology are tested in ai-knowledge.mjs.
  ai.opponent={view:()=>battle.p2.active[0]};
  const before=JSON.stringify(battle.toJSON());
  const result=ai.chooseAction(battle,'p1');
  assert.equal(JSON.stringify(battle.toJSON()),before,'AI evaluation must not mutate battle or engine RNG');
  return {battle,ai,result,best:[...result.think.options].sort((a,b)=>b.score-a.score)[0]};
}
const cases=[
 ['선공기로 마무리','Lucario\n- Extreme Speed\n- Close Combat','Aerodactyl\n- Earthquake',(a,b)=>{a.hp=1;b.hp=10;},'Extreme Speed'],
 ['회복으로 생존','Starmie\n- Recover\n- Surf','Blissey\n- Thunderbolt',(a)=>{a.hp=Math.floor(a.maxhp*.35);},'Recover'],
 ['가득 찬 HP 회복 금지','Starmie\n- Recover\n- Surf','Blissey\n- Thunderbolt',()=>{},'Surf'],
 ['회복 전 기절 회피','Starmie\n- Recover\n- Surf','Aerodactyl\n- Earthquake',(a)=>{a.hp=1;},'Surf'],
 ['랭크업 앞에서 세팅 금지','Lucario\n- Swords Dance\n- Extreme Speed','Aerodactyl\n- Earthquake',(a,b)=>{a.hp=10;b.boosts.atk=2;},'Extreme Speed'],
 ['화상 물리 화력 저하','Dragonite\n- Dragon Claw\n- Dragon Pulse','Blissey\n- Tackle',(a,b)=>{a.status='brn';b.boosts.def=6;},'Dragon Pulse'],
];
for(const [label,a,b,edit,want] of cases){
 const {battle,result,best}=position(a,b,edit);
 console.log(label,JSON.stringify(result.think.options.map(o=>({move:o.label,score:+o.score.toFixed(1)}))));
 if(!process.argv.includes('--baseline'))assert.equal(best.label,want,label);
 if(label==='선공기로 마무리'&&!process.argv.includes('--baseline')){
   battle.makeChoices(result.choice,'move 1');assert.equal(battle.winner,'A','priority decision must win in real engine');
 }
 battle.destroy();
}
export {position};

if(!process.argv.includes('--baseline')){
 const {battle,ai}=position('Starmie\n- Surf\n- Recover','Garchomp\n- Earthquake\n- Outrage');
 const a=battle.p1.active[0],b=battle.p2.active[0],gen=ai.gen;
 const surf=gen.moves.get('surf'),quake=gen.moves.get('earthquake');
 assert.equal(actsBefore(a,surf,b,quake),1);
 const speed=effectiveSpeed(a);a.status='par';assert.equal(effectiveSpeed(a),speed/2);
 assert.equal(actsBefore(a,surf,b,quake),0);
 battle.field.pseudoWeather.trickroom={};assert.equal(actsBefore(a,surf,b,quake),1);
 delete battle.field.pseudoWeather.trickroom;a.status='';
 a.status='tox';a.statusState.stage=3;assert.equal(residualPct(a),25);
 a.ability='poisonheal';assert.equal(residualPct(a),0);a.ability='illuminate';a.status='';
 const normal=neutralDamagePct(b,a,quake);b.status='brn';assert.equal(neutralDamagePct(b,a,quake),normal/2);
 b.ability='guts';assert(Math.abs(neutralDamagePct(b,a,quake)-normal*1.5)<1e-8);b.ability='roughskin';b.status='';
 const threat=bestDamagePct(gen,b,a);b.boosts.atk=2;assert(bestDamagePct(gen,b,a)>threat*1.8);
 b.boosts.atk=0;b.moveSlots[0].pp=0;assert.equal(bestDamagePct(gen,b,a),realDamagePct(gen,b,a,gen.moves.get('outrage')));
 b.moveSlots[0].pp=10;b.volatiles.lockedmove={move:'outrage'};assert.equal(bestDamagePct(gen,b,a),realDamagePct(gen,b,a,gen.moves.get('outrage')));
 a.status='slp';assert(executionChance(gen,a,surf,b)<.5);
 a.status='frz';assert(executionChance(gen,a,surf,b)<=.2);a.status='';
 a.boosts.accuracy=-6;assert(neutralDamagePct(a,b,surf)<neutralDamagePct(a,b,{...surf,accuracy:true}));
 battle.destroy();

 const x=position('Blissey\n- Tackle\n\nCharizard\n- Flamethrower\n\nSkarmory\n- Brave Bird','Garchomp\n- Earthquake',(a,b,bat)=>{
  a.hp=10;b.boosts.atk=2;bat.p1.sideConditions.stealthrock={};bat.p1.pokemon[1].hp=Math.floor(bat.p1.pokemon[1].maxhp*.4);
 });
 const charizard=x.battle.p1.pokemon[1],skarmory=x.battle.p1.pokemon[2],foe=x.battle.p2.active[0];
 assert.equal(entryDamagePct(x.ai.gen,charizard),50);
 charizard.item='ironball';assert(realDamagePct(x.ai.gen,foe,charizard,x.ai.gen.moves.get('earthquake'))>0);charizard.item='';
 assert(x.result.think.options.find(o=>o.label==='Charizard').score<0);
 assert.equal(x.best.label,'Skarmory','do not send a Pokemon that faints on rocks');
 charizard.item='heavydutyboots';assert.equal(entryDamagePct(x.ai.gen,charizard),0);
 charizard.item='';charizard.ability='magicguard';assert.equal(entryDamagePct(x.ai.gen,charizard),0);
 x.battle.p1.sideConditions.spikes={layers:3};assert.equal(entryDamagePct(x.ai.gen,skarmory),12.5);
 const forced=x.ai.chooseForcedSwitch(x.battle,'p1');assert(forced.think.options.every(o=>Number.isFinite(o.score)));
 x.battle.destroy();
 const immune=position('Garchomp\n- Earthquake\n- Dragon Claw','Rotom-Wash\nAbility: Levitate\n- Hydro Pump');
 assert.equal(realDamagePct(immune.ai.gen,immune.battle.p1.active[0],immune.battle.p2.active[0],immune.ai.gen.moves.get('earthquake')),0);
 assert.equal(immune.best.label,'Dragon Claw');
 immune.battle.p1.active[0].ability='moldbreaker';assert(realDamagePct(immune.ai.gen,immune.battle.p1.active[0],immune.battle.p2.active[0],immune.ai.gen.moves.get('earthquake'))>0);
 immune.battle.destroy();
 const fixed=position('Blissey\n- Seismic Toss','Tyranitar\n- Tackle');
 const toss=realDamagePct(fixed.ai.gen,fixed.battle.p1.active[0],fixed.battle.p2.active[0],fixed.ai.gen.moves.get('seismictoss'));
 assert.equal(toss,100/fixed.battle.p2.active[0].maxhp*100,'fixed damage must not receive 4x effectiveness');fixed.battle.destroy();
 console.log('PASS: real engine KO, read-only evaluation, priority/speed/paralysis/Trick Room, burn/Guts, toxic, PP/lock, sleep/freeze, accuracy, hazards/boots/Magic Guard, immunity and forced switch');
}
