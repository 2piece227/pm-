import {effectiveSpeed} from './speed.js';
// Read-only, bounded estimates. Never invoke simulator move/ability events during scoring.
import {bestDamagePct,hpPct,realDamagePct,typeEff,groundedForEstimate} from './estimate.js';

export const TACTICS = { deniedAction:0.08, healWeight:1.2, rescueBonus:32, unsafeSwitch:90 };
export {effectiveSpeed} from './speed.js';
export function priority(mon,move){
  return (move.priority||0)+(mon.ability==='prankster'&&move.category==='Status'?1:0)+
    (mon.ability==='galewings'&&mon.hp===mon.maxhp&&move.type==='Flying'?1:0)+
    (mon.ability==='triage'&&move.flags?.heal?3:0);
}
export function actsBefore(a,move,b,reply){
  const delta=priority(a,move)-priority(b,reply);
  if(delta)return delta>0?1:0;
  const speed=effectiveSpeed(a)-effectiveSpeed(b);
  if(!speed)return .5;
  return a.battle.field.pseudoWeather.trickroom ? (speed<0?1:0) : (speed>0?1:0);
}
export function actionChance(mon,move){
  if(mon.status==='slp'&&!['sleeptalk','snore'].includes(move.id))return .33;
  if(mon.status==='frz'&&!move.flags?.defrost)return .2;
  return mon.status==='par'?.75:1;
}
export function threats(gen,foe,me){
  const locked=foe.volatiles?.lockedmove?.move;
  return foe.moveSlots.filter(s=>s.pp!==0&&!s.disabled&&(!locked||s.id===locked))
    .map(s=>({move:gen.moves.get(s.id),weight:s.weight??1})).filter(({move})=>move&&move.category!=='Status')
    .map(({move,weight})=>({move,damage:realDamagePct(gen,foe,me,move)*weight,chance:actionChance(foe,move)}));
}
export function executionChance(gen,me,move,foe){
  let denial=0;
  for(const reply of threats(gen,foe,me))if(reply.damage>=hpPct(me))
    denial=Math.max(denial,(1-actsBefore(me,move,foe,reply.move))*reply.chance);
  return actionChance(me,move)*(1-denial*(1-TACTICS.deniedAction));
}
export function residualPct(mon){
  if(mon.ability==='magicguard')return 0;
  if(mon.status==='brn')return mon.ability==='heatproof'?3.125:6.25;
  if(['psn','tox'].includes(mon.status)&&mon.ability!=='poisonheal')
    return mon.status==='psn'?12.5:Math.min(15,(mon.statusState?.stage||0)+1)*6.25;
  return 0;
}
export function entryDamagePct(gen,mon){
  if(mon.item==='heavydutyboots'||mon.ability==='magicguard')return 0;
  const hazards=mon.side.sideConditions;
  let damage=hazards.stealthrock?12.5*typeEff(gen,'Rock',mon.getTypes()):0;
  if(hazards.spikes&&groundedForEstimate(mon))damage+=[0,12.5,100/6,25][Math.min(3,hazards.spikes.layers||1)];
  return damage;
}
export function recoveryPct(me,move){
  if(me.volatiles.healblock)return 0;
  if(move.id==='rest')return me.status==='slp'||['insomnia','vitalspirit','sweetveil','comatose'].includes(me.ability)||
    (groundedForEstimate(me)&&['electricterrain','mistyterrain'].includes(me.battle.field.terrain))?0:100-hpPct(me);
  if(!move.heal)return 0;
  let amount=100*move.heal[0]/move.heal[1];
  const weather=me.battle.field.weather;
  if(['synthesis','moonlight','morningsun'].includes(move.id))amount=!weather?50:['sunnyday','desolateland'].includes(weather)?200/3:25;
  if(move.id==='shoreup'&&weather==='sandstorm')amount=200/3;
  return Math.min(100-hpPct(me),amount);
}
export function recoveryScore(gen,me,foe,move){
  const healed=recoveryPct(me,move);
  if(healed<=0)return -60;
  const incoming=bestDamagePct(gen,foe,me),residual=residualPct(me);
  const chance=executionChance(gen,me,move,foe);
  if(chance<.15)return -55;
  const before=hpPct(me)-incoming-residual,after=before+healed;
  if(after<=0)return -45;
  // Value a survival turn; avoid endlessly healing tiny scratches or losing HP every cycle.
  const rescue=before<=0?TACTICS.rescueBonus:0;
  const pressure=healed-incoming-residual;
  let score=(healed*TACTICS.healWeight+rescue+Math.min(0,pressure)*1.5)*chance;
  if(move.id==='rest')score-=incoming*1.5+20;
  return score;
}
