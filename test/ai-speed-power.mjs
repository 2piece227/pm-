import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {estimatedPower,realDamagePct} from '../src/ai/estimate.js';
const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
for(const side of ['p1','p2'])battle.setPlayer(side,{team:Teams.pack(Teams.import('Mew\n- Splash'))});
battle.makeChoices('default','default');
const a=battle.p1.active[0],b=battle.p2.active[0],gen=battle.dex;
for(const id of ['electroball','gyroball'])for(const stage of [-6,-2,0,2,6])for(const state of ['normal','par','scarf','tailwind','trickroom']){
 a.boosts.spe=stage;a.status=state==='par'?'par':'';a.item=state==='scarf'?'choicescarf':'';
 a.side.sideConditions=state==='tailwind'?{tailwind:{}}:{};
 battle.field.pseudoWeather=state==='trickroom'?{trickroom:{}}:{};
 const move=gen.moves.get(id),expected=move.basePowerCallback.call(battle,a,b,move);
 const before=JSON.stringify(battle.toJSON());
 assert(Math.abs(estimatedPower(a,move,b)-expected)<=1,`${id} ${stage} ${state}: ${estimatedPower(a,move,b)} / ${expected}`);
 assert(realDamagePct(gen,a,b,move)>0);
 assert.equal(JSON.stringify(battle.toJSON()),before);
}
battle.destroy();console.log('PASS: speed-power moves vs engine across speed ranks/paralysis/scarf/tailwind/Trick Room');
