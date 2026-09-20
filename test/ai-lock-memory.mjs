import assert from 'node:assert/strict';
import {Battle,Teams} from '@pkmn/sim';
import {PublicBattle} from '../src/engine/public-battle.js';
const book=new PublicBattle();
book.scan(['|switch|p1a: A|Smeargle, L100|100/100','|turn|1','|move|p1a: A|Thrash|p2a: B']);
assert(book.current('p1').volatiles.lockedmove);
book.push('|turn|2');book.push('|move|p1a: A|Thrash|p2a: B');
book.push('|turn|3');assert(book.current('p1').volatiles.lockedmove);
book.push('|move|p1a: A|Thrash|p2a: B');book.push('|turn|4');
assert(!book.current('p1').volatiles.lockedmove,'no indefinite lock without confusion');
book.push('|move|p1a: A|Thrash|p2a: B');book.push('|move|p1a: A|Tackle|p2a: B');
assert(!book.current('p1').volatiles.lockedmove,'different move proves lock ended');
book.push('|move|p1a: A|Thrash|p2a: B|[from] move: Sleep Talk');
assert(!book.current('p1').volatiles.lockedmove,'called move is not a lock');
// Real Own Tempo rampage has no confusion start event, even when its lock ends.
const battle=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
battle.setPlayer('p1',{team:Teams.pack(Teams.import('Smeargle\nAbility: Own Tempo\n- Thrash'))});
battle.setPlayer('p2',{team:Teams.pack(Teams.import('Blissey\n- Soft-Boiled'))});
battle.makeChoices('default','default');const observed=new PublicBattle();observed.scan(battle.log);
for(let i=0;i<3;i++){battle.makeChoices('move 1','move 1');observed.scan(battle.log);}
assert(!battle.p1.active[0].volatiles.lockedmove);
assert(!observed.current('p1').volatiles.lockedmove);
assert(!battle.log.some(l=>l.startsWith('|-start|p1a:')&&l.includes('confusion')));
battle.destroy();console.log('PASS: public rampage expiry, different/called moves, real Own Tempo without confusion');
