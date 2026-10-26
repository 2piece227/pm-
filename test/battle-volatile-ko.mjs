// 지속 효과 자막: 혼란·씨뿌리기·조이기류·하품·도발·멸망의노래 등이 원작 문구로, 영어·"이(가)" 없이.
import assert from 'node:assert/strict';
import { toKoreanLog } from '../src/ui/protocol-ko.js';
import { SPECIES_KO } from '../src/data/ko.js';
import { Dex } from '@pkmn/dex';
import fs from 'node:fs';

const head = ['|switch|p1a: Farfetch’d|Farfetch’d, L50|100/100', '|switch|p2a: Snorlax|Snorlax, L50|100/100', '|turn|1'];
const msgs = lines => toKoreanLog([...head, ...lines], { p1: '레드', p2: '그린' }).map(o => o.msg).filter(Boolean).map(m => m.replace(/\n/g, ' '));
const has = (lines, expect) => { const m = msgs(lines); assert(m.includes(expect), `${expect}\n  실제: ${m.join(' / ')}`); };

has(['|-start|p2a: Snorlax|confusion'], '상대 잠만보는 혼란에 빠졌다!');
has(['|-activate|p2a: Snorlax|confusion'], '상대 잠만보는 혼란에 빠져 있다!');
has(['|-damage|p2a: Snorlax|80/100|[from] confusion'], '상대 잠만보는 영문도 모른 채 자신을 공격했다!');
has(['|-start|p2a: Snorlax|move: Leech Seed'], '상대 잠만보에게 씨앗을 심었다!');
has(['|-damage|p2a: Snorlax|88/100|[from] Leech Seed|[of] p1a: Farfetch’d'], '씨뿌리기가 상대 잠만보의 체력을 빼앗는다!');
has(['|-activate|p2a: Snorlax|move: Fire Spin|[of] p1a: Farfetch’d'], '상대 잠만보는 불꽃의 소용돌이에 갇혔다!');
has(['|-activate|p2a: Snorlax|move: Wrap|[of] p1a: Farfetch’d'], '상대 잠만보는 파오리에게 김밥말이를 당했다!');
has(['|-damage|p2a: Snorlax|90/100|[from] move: Fire Spin|[partiallytrapped]'], '상대 잠만보는 회오리불꽃의 데미지를 입고 있다!');
has(['|-end|p2a: Snorlax|Whirlpool|[partiallytrapped]'], '상대 잠만보는 바다회오리에서 풀려났다!');
has(['|-start|p2a: Snorlax|move: Yawn|[of] p1a: Farfetch’d'], '상대 잠만보는 졸음이 오기 시작했다!');
assert(!msgs(['|-end|p2a: Snorlax|move: Yawn|[silent]']).some(m => /하품/.test(m)), '하품 풀림은 자막 없이 (다음 줄이 잠듦)');
has(['|cant|p2a: Snorlax|move: Taunt|Splash'], '상대 잠만보는 도발당한 상태라 튀어오르기를 쓸 수 없다!');
has(['|-start|p1a: Farfetch’d|perish2'], '파오리의 멸망 카운트가 2가 되었다!');
assert(!msgs(['|-start|p1a: Farfetch’d|perish3|[silent]']).some(m => /멸망/.test(m)), '[silent] 멸망 카운트는 자막 없이');
has(['|-start|p2a: Snorlax|Curse|[of] p1a: Farfetch’d'], '파오리는 자신의 체력을 깎아서 상대 잠만보에게 저주를 걸었다!');
has(['|-end|p2a: Snorlax|move: Heal Block'], '상대 잠만보의 회복봉인이 풀렸다!');
/* 원작 문구가 따로 없는 효과도 조사가 맞는다 */
has(['|-end|p2a: Snorlax|Stockpile'], '상대 잠만보의 비축하기가 풀렸다!');

/* 영어가 섞이지 않는다 (자막·배틀 로그 줄 모두) */
const all = toKoreanLog([...head, '|-status|p2a: Snorlax|psn', '|-damage|p2a: Snorlax|90/100 psn|[from] psn', '|cant|p1a: Farfetch’d|slp',
  '|-start|p2a: Snorlax|confusion', '|-end|p2a: Snorlax|confusion', '|-start|p1a: Farfetch’d|perish1'], { p1: '레드', p2: '그린' });
for (const o of all) for (const t of [o.msg || '', o.text || '']) assert(!/[A-Za-z]{3,}/.test(t), `영어가 남음: ${t}`);

/* 탐험 지역 데이터의 포켓몬 이름은 모두 한국어 표에 있다 (파오리 'Farfetchd' 표기 문제) */
const routesSrc = fs.readFileSync(new URL('../src/data/routes.js', import.meta.url), 'utf8');
for (const [, name] of routesSrc.matchAll(/W\('([^']+)'/g)) {
  assert(SPECIES_KO[name], `routes.js의 '${name}'가 한국어 표에 없다 (정식 이름: ${Dex.species.get(name).name})`);
}
console.log('PASS: confusion, leech seed, binding moves, yawn, taunt, perish, curse, heal block, particles, no English, route species names');
