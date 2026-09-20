import {bestDamagePct,curve,hpPct,realDamagePct} from './estimate.js';
import {entryDamagePct,executionChance,actsBefore,threats} from './tactics.js';
export const STRATEGY={maxTargets:2,maxSwitch:.65,preserveCap:24,followupCap:8};
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const matchup=(gen,a,b)=>Math.min(100,bestDamagePct(gen,a,b))-.65*Math.min(100,bestDamagePct(gen,b,a));

export function predictSwitch(gen,me,foe,seenBench,{recentSwitch=false}={}){
  if(foe.volatiles.lockedmove||foe.volatiles.trapped||foe.volatiles.partiallytrapped||foe.volatiles.ingrain)return {probability:0,targets:[]};
  const danger=bestDamagePct(gen,me,foe)/Math.max(1,hpPct(foe));
  const current=matchup(gen,foe,me);
  const targets=seenBench.map(mon=>{
    const entry=entryDamagePct(gen,mon),health=hpPct(mon)-entry;
    const benefit=matchup(gen,mon,me)-current-entry;
    return {mon:{...mon,hp:Math.max(0,mon.hp-entry/100*mon.maxhp)},benefit,health};
  }).filter(t=>t.health>bestDamagePct(gen,me,t.mon)&&t.benefit>10)
    .sort((a,b)=>b.benefit-a.benefit).slice(0,STRATEGY.maxTargets);
  if(!targets.length)return {probability:0,targets:[]};
  const boosts=Object.values(foe.boosts).reduce((sum,v)=>sum+Math.max(0,v),0);
  const probability=clamp(.08+danger*.23+targets[0].benefit*.003-boosts*.04-(recentSwitch?.18:0),.05,STRATEGY.maxSwitch);
  const total=targets.reduce((sum,t)=>sum+t.benefit,0);
  return {probability,targets:targets.map(t=>({...t,weight:t.benefit/total}))};
}
export function preservationValue(gen,me,allies,seenBench){
  if(!allies.length)return 0;
  let value=0;
  for(const enemy of seenBench){
    const mine=matchup(gen,me,enemy),other=Math.max(...allies.map(a=>matchup(gen,a,enemy)));
    if(mine>0)value=Math.max(value,(mine-other-15)*.3);
  }
  return clamp(value,0,STRATEGY.preserveCap);
}
/** One bounded reply estimate, not a full engine rollout or a claim of optimal play. */
export function followupValue(gen,me,foe,move){
  if(move.category==='Status')return 0;
  const dealt=realDamagePct(gen,me,foe,move)*executionChance(gen,me,move,foe);
  const reply=threats(gen,foe,me).sort((a,b)=>b.damage-a.damage)[0];
  const received=reply?reply.damage*reply.chance*(dealt>=hpPct(foe)?1-actsBefore(me,move,foe,reply.move):1):0;
  const nextMine=hpPct(me)-received,nextFoe=hpPct(foe)-dealt;
  return clamp((Math.max(0,nextMine)-Math.max(0,nextFoe))*.08,-STRATEGY.followupCap,STRATEGY.followupCap);
}
export const strategyWeight=(stats,shock)=>clamp(curve(stats.ops)/20,0,1)*clamp(curve(stats.judge)/20,0,1)/
  (1+shock*Math.max(0,20-stats.mental)*.02);
