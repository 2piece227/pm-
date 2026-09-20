import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {OpponentModel,ownView} from '../src/ai/opponent-model.js';
import {realDamagePct} from '../src/ai/estimate.js';
const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
battle.setPlayer('p1',{team:Teams.pack(Teams.import('Mew\n- Gastro Acid\n- Earthquake'))});
battle.setPlayer('p2',{team:Teams.pack(Teams.import('Eelektross\nAbility: Levitate\n- Splash\n\nMew\n- Splash'))});
battle.makeChoices('default','default');
const model=new OpponentModel(),stats={know:20,focus:20},gen=battle.dex;
// Previously revealed ability; no read of opponent's private configuration.
battle.log.push('|-ability|p2a: Eelektross|Levitate');
const view=()=>model.view(battle,'p2',gen,stats,()=>.9);
assert.equal(realDamagePct(gen,ownView(battle.p1.active[0]),view(),gen.moves.get('earthquake')),0);
battle.makeChoices('move 1','move 1');
assert(battle.log.some(l=>l.startsWith('|-endability|p2a: Eelektross')));
assert.equal(view().ability,'');assert.equal(ownView(battle.p2.active[0]).ability,'');
assert(realDamagePct(gen,ownView(battle.p1.active[0]),view(),gen.moves.get('earthquake'))>0);
assert.equal(model.public.current('p2').ability,'levitate','retain observed identity separately from suppression');
battle.makeChoices('move 1','switch 2');view();
battle.makeChoices('move 2','switch 2');assert.equal(view().ability,'levitate');
battle.destroy();console.log('PASS: real Gastro Acid, public suppression, own/opponent damage, switch restores known ability');

