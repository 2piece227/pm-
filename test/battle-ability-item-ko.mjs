// 특성 팝업(5세대 이후 원작)과 도구 발동 자막
import assert from 'node:assert/strict';
import { toKoreanLog } from '../src/ui/protocol-ko.js';

const log = [
  '|player|p1|A', '|player|p2|B', '|teamsize|p1|2', '|teamsize|p2|2', '|turn|1',
  '|switch|p1a: Gyarados|Gyarados, L50, M|170/170', '|switch|p2a: Pikachu|Pikachu, L50, F|110/110',
  '|-ability|p1a: Gyarados|Intimidate|boost', '|-unboost|p2a: Pikachu|atk|1',
  '|move|p1a: Gyarados|Waterfall|p2a: Pikachu', '|-damage|p2a: Pikachu|1/110', '|-enditem|p2a: Pikachu|Focus Sash',
  '|-heal|p1a: Gyarados|170/170|[from] item: Leftovers',
  '|move|p2a: Pikachu|Quick Attack|p1a: Gyarados', '|-damage|p1a: Gyarados|160/170',
  '|-status|p1a: Gyarados|par|[from] ability: Static|[of] p2a: Pikachu',
  '|switch|p1a: Garchomp|Garchomp, L50, M|180/180', '|-item|p1a: Garchomp|Air Balloon',
  '|switch|p2a: Snorlax|Snorlax, L50, M|235/235',
  '|move|p2a: Snorlax|Body Slam|p1a: Garchomp', '|-damage|p1a: Garchomp|150/180',
  '|-damage|p2a: Snorlax|205/235|[from] ability: Rough Skin|[of] p1a: Garchomp', '|-enditem|p1a: Garchomp|Air Balloon',
  '|-enditem|p2a: Snorlax|Sitrus Berry|[eat]', '|-heal|p2a: Snorlax|235/235|[from] item: Sitrus Berry',
  '|-fail|p2a: Snorlax|unboost|[from] ability: Clear Body|[of] p2a: Snorlax',
  '|turn|2',
];
const out = toKoreanLog(log, { p1: 'A', p2: 'B' });
const msgs = out.map(l => l.msg).filter(Boolean);
const pops = out.filter(l => l.pop).map(l => `${l.pop.side}:${l.pop.mon}:${l.pop.ability}`);

assert.deepEqual(pops.slice(0, 3), ['p1:갸라도스:위협', 'p2:상대 피카츄:정전기', 'p1:한카리아스:까칠한피부']);
assert(!msgs.some(m => /갸라도스의\n위협!/.test(m)), '위협은 자막 대신 팝업');
assert(msgs.some(m => /피카츄의 공격이/.test(m)));
assert(msgs.includes('상대 피카츄는 기합의띠로\n버텼다!'));
assert(msgs.includes('갸라도스는 먹다남은음식으로\n조금 회복했다!'));
assert(msgs.includes('한카리아스는 풍선으로\n떠 있다!'));
assert(msgs.includes('한카리아스의 풍선이\n터져 버렸다!'));
assert(msgs.includes('상대 잠만보는 자뭉열매를 먹고\nHP를 회복했다!'));
assert(!msgs.some(m => /자뭉열매를\n먹었다/.test(m)), '회복과 합쳐 한 번만 말한다');
assert(msgs.some(m => /떨어지지 않는다/.test(m)));
console.log('PASS: ability popups on owner (Intimidate/Static/Rough Skin), original item lines (Focus Sash, Leftovers, Air Balloon, Sitrus merge), Clear Body');
