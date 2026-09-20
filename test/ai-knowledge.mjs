import assert from 'node:assert/strict';
import {Battle,Teams,Dex} from '@pkmn/sim';
import {createTrainerAI,makeRng,runBattle} from '../src/engine/run-battle.js';
import {PublicBattle} from '../src/engine/public-battle.js';
import {OpponentModel} from '../src/ai/opponent-model.js';
import {toKoreanLog} from '../src/ui/protocol-ko.js';
const stats={judge:20,ops:20,focus:20,know:20,mental:20};
function battle(team='Charizard @ Leftovers\nAbility: Blaze\n- Flamethrower\n- Air Slash'){
 const b=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
 b.setPlayer('p1',{name:'A',team:Teams.pack(Teams.import('Starmie\n- Surf\n- Recover'))});
 b.setPlayer('p2',{name:'B',team:Teams.pack(Teams.import(team))});b.makeChoices('default','default');return b;
}
const a=battle(),b=battle('Charizard @ Choice Scarf\nAbility: Solar Power\nJolly Nature\nEVs: 252 Spe\n- Earthquake\n- Dragon Claw');
const aa=createTrainerAI({name:'A',stats},'균형형',makeRng(8)),ab=createTrainerAI({name:'A',stats},'균형형',makeRng(8));
assert.deepEqual(aa.chooseAction(a,'p1'),ab.chooseAction(b,'p1'),'hidden moves/item/ability/nature/EVs must not change AI decision');
const enemy=b.p2.active[0];
for(const field of ['moveSlots','ability','item','storedStats','set'])Object.defineProperty(enemy,field,{get(){throw new Error(`private read ${field}`);},configurable:true});
for(const field of ['pokemon','active'])Object.defineProperty(b.p2,field,{get(){throw new Error(`private opponent roster read ${field}`);},configurable:true});
ab.opponent.cache=null;assert.doesNotThrow(()=>ab.chooseAction(b,'p1'));
a.destroy(); // b deliberately contains access traps: do not invoke engine cleanup on it.

const log=['|teamsize|p1|1','|teamsize|p2|2','|poke|p2|Charizard, M|',
 '|switch|p1a: Starmie|Starmie, L50|100/100','|split|p2',
 '|switch|p2a: Charizard|Charizard, L50, M|153/153','|switch|p2a: Charizard|Charizard, L50, M|100/100',
 '|turn|1','|move|p2a: Charizard|Flamethrower|p1a: Starmie',
 '|-damage|p1a: Starmie|70/100','|turn|2','|move|p2a: Charizard|Air Slash|p1a: Starmie',
 '|switch|p2a: Blissey|Blissey, L50, F|100/100','|move|p2a: Blissey|Tackle|p1a: Starmie',
 '|switch|p2a: Charizard|Charizard, L50, M|100/100'];
const notebook=new PublicBattle();notebook.scan(log);
assert.deepEqual(notebook.current('p2').moves,['Flamethrower','Air Slash']);
assert.equal(notebook.current('p2').ratio,1);assert(!notebook.current('p2').moves.includes('Tackle'));
notebook.push('|move|p2a: Charizard|Thunderbolt|p1a: Starmie|[from] move: Metronome');
assert(!notebook.current('p2').moves.includes('Thunderbolt'));
notebook.push('|-damage|p1a: Starmie|65/100|[from] ability: Rough Skin|[of] p2a: Charizard');
assert.equal(notebook.current('p2').ability,'roughskin');assert.equal(notebook.current('p1').ability,'');
notebook.push('|-heal|p2a: Charizard|100/100|[from] item: Leftovers');assert.equal(notebook.current('p2').item,'leftovers');
notebook.push('|replace|p2a: Zoroark|Zoroark, L50, M|100/100');assert.deepEqual(notebook.current('p2').moves,[]);

const rendered=toKoreanLog(log,{p1:'A',p2:'B'});
const turn1=rendered.find(r=>r.text==='턴 1'),turn2=rendered.find(r=>r.text==='턴 2');
assert.deepEqual(turn1.field.p2.knownMoves,[],'no future disclosure during replay');
assert.equal(turn2.field.p2.knownMoves.length,1);
assert.equal(rendered.at(-1).field.p2.knownMoves.length,2,'reveals survive switch');
assert.deepEqual(toKoreanLog(JSON.parse(JSON.stringify(log)),{p1:'A',p2:'B'}),rendered,'saved replay has identical disclosure timeline');

const c=battle();c.log.splice(0,c.log.length,...log,'|turn|20');
const model=new OpponentModel();
const view=model.view(c,'p2',Dex.forGen(9),{...stats,focus:0},()=>0);
assert.deepEqual(view.knowledge.omitted,['Flamethrower']);assert(view.knowledge.remembered.includes('Air Slash'));
assert.deepEqual(model.public.current('p2').moves,['Flamethrower','Air Slash']);
const high=new OpponentModel().view(c,'p2',Dex.forGen(9),stats,()=>0);assert.equal(high.knowledge.omitted.length,0);
assert(!high.moveSlots.some(s=>s.id==='tackle'&&s.observed));c.destroy();

const duplicate=new PublicBattle();duplicate.scan(['|poke|p2|Pikachu|','|poke|p2|Pikachu|','|switch|p2a: Pikachu|Pikachu|100/100','|move|p2a: Pikachu|Thunderbolt|p1a: A','|switch|p2a: Pikachu|Pikachu|100/100']);
assert.deepEqual(duplicate.current('p2').moves,[],'indistinguishable duplicates require reconfirmation');
const priorBattle=battle();
const lowPrior=new OpponentModel().view(priorBattle,'p2',Dex.forGen(9),{...stats,know:1},()=>1);
const highPrior=new OpponentModel().view(priorBattle,'p2',Dex.forGen(9),stats,()=>1);
assert(highPrior.knowledge.estimated.length>lowPrior.knowledge.estimated.length);
assert(highPrior.moveSlots.every(s=>s.estimated&&!s.observed));priorBattle.destroy();

const one=()=>runBattle({trainerA:createTrainerAI({name:'A',stats},'균형형',makeRng(4)),trainerB:createTrainerAI({name:'B',stats},'균형형',makeRng(5)),
 teamA:'Starmie\n- Surf\n- Recover',teamB:'Charizard\n- Flamethrower\n- Air Slash',seed:18,collectThink:true});
const r1=one(),r2=one();assert.deepEqual(r1,r2);
assert.deepEqual(r1.think.find(r=>r.side==='p1').think.knowledge.observed,[]);
assert(r1.think.every(r=>!r.think.knowledge||r.think.knowledge.observed.length<=4));
console.log('PASS: hidden-state noninterference/access traps, public split logs, moves/ability/item attribution, switch/Illusion, copied-move exclusion, focus lapses, chronological saved replay and deterministic battles');
