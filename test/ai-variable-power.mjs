import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {estimatedPower,realDamagePct} from '../src/ai/estimate.js';
const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
for(const side of ['p1','p2'])battle.setPlayer(side,{team:Teams.pack(Teams.import('Mew\n- Splash'))});
battle.makeChoices('default','default');
const a=battle.p1.active[0],b=battle.p2.active[0],gen=battle.dex;
for(const id of ['eruption','waterspout','dragonenergy','storedpower','powertrip','flail','reversal']){
 const move=gen.moves.get(id);
 for(const ratio of [1,.75,.5,.25,.1,.02]){
  a.hp=Math.max(1,Math.floor(a.maxhp*ratio));
  for(const boosts of [{},{atk:2,spa:3,accuracy:1,def:-2}]){
   for(const key of Object.keys(a.boosts))a.boosts[key]=boosts[key]||0;
   const expected=move.basePowerCallback.call(battle,a,b,move);
   assert(Math.abs(estimatedPower(a,move)-expected)<1,`${id} HP ${ratio}`);
   const before=JSON.stringify(battle.toJSON());
   assert(realDamagePct(gen,a,b,move)>0,`${id} must not be treated as zero damage`);
   assert.equal(JSON.stringify(battle.toJSON()),before);
  }
 }
}
a.hp=a.maxhp;const full=realDamagePct(gen,a,b,gen.moves.get('eruption'));
a.hp=1;assert(realDamagePct(gen,a,b,gen.moves.get('eruption'))<full*.1);
battle.destroy();console.log('PASS: seven variable-power moves match engine callbacks across HP/boost states; read-only damage');
