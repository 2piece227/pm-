import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {createTrainerAI,makeRng} from '../src/engine/run-battle.js';
import {neutralDamagePct,bestDamagePct,realDamagePct} from '../src/ai/estimate.js';

const full={judge:20,ops:20,focus:20,know:20,mental:20};
function position(a,b,edit=()=>{}){
  const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
  battle.setPlayer('p1',{name:'A',team:Teams.pack(Teams.import(a))});
  battle.setPlayer('p2',{name:'B',team:Teams.pack(Teams.import(b))});
  battle.makeChoices('default','default');
  edit(battle.p1.active[0],battle.p2.active[0],battle);
  const ai=createTrainerAI({name:'A',stats:full},'균형형',makeRng(9));
  ai.bindParty([...battle.p1.pokemon],battle.p2.pokemon.length);
  // 상대 기술은 공개된 것만 안다 — 장면마다 상대 기술을 이미 본 것으로 공개 로그에 남긴다.
  const foe=battle.p2.active[0];
  for(const slot of foe.moveSlots)battle.log.push(`|move|p2a: ${foe.name}|${battle.dex.moves.get(slot.id).name}|p1a: ${battle.p1.active[0].name}`);
  // 장면 설정으로 바꾼 상대 HP·랭크·상태도 실제 배틀처럼 공개 메시지로 남긴다
  battle.log.push(`|-sethp|p2a: ${foe.name}|${foe.hp}/${foe.maxhp}${foe.status?` ${foe.status}`:''}`);
  for(const [k,v] of Object.entries(foe.boosts))if(v)battle.log.push(`|-${v>0?'boost':'unboost'}|p2a: ${foe.name}|${k}|${Math.abs(v)}`);
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
 /* 데미지 추정 보조 함수 (경기 분석·탐험 쪽에서 쓴다) */
 const {battle,ai}=position('Starmie\n- Surf\n- Recover','Garchomp\n- Earthquake\n- Outrage');
 const a=battle.p1.active[0],b=battle.p2.active[0],gen=ai.gen;
 const quake=gen.moves.get('earthquake'),surf=gen.moves.get('surf');
 const normal=neutralDamagePct(b,a,quake);b.status='brn';assert.equal(neutralDamagePct(b,a,quake),normal/2);
 b.ability='guts';assert(Math.abs(neutralDamagePct(b,a,quake)-normal*1.5)<1e-8);b.ability='roughskin';b.status='';
 const threat=bestDamagePct(gen,b,a);b.boosts.atk=2;assert(bestDamagePct(gen,b,a)>threat*1.8);
 b.boosts.atk=0;b.moveSlots[0].pp=0;assert.equal(bestDamagePct(gen,b,a),realDamagePct(gen,b,a,gen.moves.get('outrage')));
 a.boosts.accuracy=-6;assert(neutralDamagePct(a,b,surf)<neutralDamagePct(a,b,{...surf,accuracy:true}));
 battle.destroy();

 /* 쓰러진 뒤 교체 — 원작 rate_replacement: 돌아오자마자 압정에 쓰러질 포켓몬은 크게 깎는다 (마지막 포켓몬은 아껴 둔다) */
 const x=position('Blissey\n- Tackle\n\nCharizard\n- Flamethrower\n\nSkarmory\n- Brave Bird\n\nSnorlax\n- Body Slam','Garchomp\n- Earthquake',(a,b,bat)=>{
  bat.p1.sideConditions.stealthrock={};bat.p1.pokemon[1].hp=Math.floor(bat.p1.pokemon[1].maxhp*.4);a.faint();bat.faintMessages();
 });
 const forced=x.ai.chooseForcedSwitch(x.battle,'p1');
 assert(forced.think.options.every(o=>Number.isFinite(o.score)));
 assert.equal(x.battle.p1.pokemon[Number(forced.choice.split(' ')[1])-1].species.name,'Skarmory','압정에 쓰러질 리자몽은 내지 않는다');
 assert(!forced.think.options.some(o=>o.label==='Snorlax'),'마지막 포켓몬은 후보에서 뺀다');
 x.battle.destroy();
 /* 공개된 특성 면역 — 부유 로토에게 지진 안 씀 */
 const immune=position('Garchomp\n- Earthquake\n- Dragon Claw','Rotom-Wash\nAbility: Levitate\n- Hydro Pump');
 assert.equal(immune.best.label,'Dragon Claw');
 immune.battle.destroy();
 const fixed=position('Blissey\n- Seismic Toss','Tyranitar\n- Tackle');
 const toss=realDamagePct(fixed.ai.gen,fixed.battle.p1.active[0],fixed.battle.p2.active[0],fixed.ai.gen.moves.get('seismictoss'));
 assert.equal(toss,100/fixed.battle.p2.active[0].maxhp*100,'fixed damage must not receive 4x effectiveness');fixed.battle.destroy();
 console.log('PASS: real engine KO, read-only evaluation, burn/Guts, PP, accuracy, hazards on replacement, ace reserve, immunity, fixed damage');
}
