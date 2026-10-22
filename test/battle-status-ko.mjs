// 배틀 자막·HP 박스의 상태이상이 원작과 같게 보이는지 (배지·문구·해제·팀 회복·행동 불가 연출)
import assert from 'node:assert/strict';
import { toKoreanLog } from '../src/ui/protocol-ko.js';

const log = [
  '|player|p1|A', '|player|p2|B', '|teamsize|p1|2', '|teamsize|p2|1', '|turn|1',
  '|switch|p1a: Bulbasaur|Bulbasaur, L20, M|60/60', '|switch|p2a: Onix|Onix, L14, F|40/40',
  '|move|p2a: Onix|Toxic|p1a: Bulbasaur', '|-status|p1a: Bulbasaur|tox',
  '|-damage|p1a: Bulbasaur|56/60 tox|[from] psn',
  '|move|p1a: Bulbasaur|Sleep Powder|p2a: Onix', '|-status|p2a: Onix|slp',
  '|cant|p2a: Onix|slp',
  '|-curestatus|p2a: Onix|slp|[msg]',
  '|-status|p2a: Onix|frz', '|cant|p2a: Onix|frz', '|-curestatus|p2a: Onix|frz|[msg]',
  '|-status|p2a: Onix|par', '|cant|p2a: Onix|par', '|-curestatus|p2a: Onix|par|[msg]',
  '|-cureteam|p1a: Bulbasaur|[from] move: Aromatherapy',
  '|turn|2',
];
const out = toKoreanLog(log, { p1: 'A', p2: 'B' });
const msgs = out.map(l => l.msg).filter(Boolean).join('\n');
const fieldAfter = re => out.slice(out.findIndex(l => re.test(l.msg || ''))).find(l => l.field)?.field;

/* 맹독도 원작처럼 HP 박스엔 '독' */
const tox = fieldAfter(/맹독에 당했다/);
assert.equal(tox.p1.status, '독'); assert.equal(tox.p1.statusCode, 'tox');
assert.match(msgs, /독 데미지를 입었다!/);
/* 행동 불가에는 그 상태이상 연출이 붙는다 */
for (const st of ['slp', 'frz', 'par']) assert(out.some(l => l.anim?.k === 'status' && l.anim.status === st && /움직일 수 없다|잠들어 있다/.test(l.msg || '')), st);
/* 원작 해제 문구 */
assert.match(msgs, /롱스톤은\n눈을 떴다!/); assert.match(msgs, /얼음이 녹았다!/); assert.match(msgs, /마비가 풀렸다!/);
assert.match(msgs, /얼어 버려서\n움직일 수 없다!/);
/* 아로마테라피 뒤에는 배지가 사라진다 */
const after = out.slice(out.findIndex(l => /상태이상 전원 회복/.test(l.text))).find(l => l.field)?.field;
assert(after, "팀 회복 뒤 화면 갱신이 있어야 한다"); assert.equal(after.p1.status, null);
console.log('PASS: toxic shows 독 badge, original tick/cure/cant text, status anims on cant, team cure clears badge');
