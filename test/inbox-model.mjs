// 받은 소식 분류: 뉴스 kind → 분류·보낸 사람·바로가기, 탭 필터·개수, 날짜 묶음.
import assert from 'node:assert/strict';
import { INBOX_CATS, newsCategory, newsMessage, inCategory, categoryCounts, groupByDay, dayHeading, catSender } from '../src/ui/inbox-model.js';

const cases = [
  [{ kind: 'gym', text: '레드 vs 웅 — 승리' }, 'match'], [{ kind: 'cup', text: '유스컵 대진' }, 'match'],
  [{ kind: 'explore', text: '레드: 1번도로 탐험을 시작했다. / 탐험 종료' }, 'explore'], [{ kind: 'warning', text: '3패' }, 'explore'],
  [{ kind: 'training', text: '피카츄 · 노력치' }, 'growth'], [{ text: '레드의 피카츄가 레벨 20' }, 'growth'],
  [{ kind: 'personnel', text: '계약 만료' }, 'club'], [{ type: 'transfer', text: '영입' }, 'club'], [{ text: '첫 여정' }, 'club'],
  [{ kind: 'league', text: '챔피언 등극' }, 'world'], [{ kind: 'npc-gym', text: '다른 소속사' }, 'world'], [{ kind: 'something-new', text: '?' }, 'world'],
];
for (const [n, cat] of cases) assert.equal(newsCategory(n), cat, n.text);

/* 탐험 보고: 보낸 사람은 트레이너, 제목·본문 나눔, 트레이너·지도 바로가기 */
const ex = newsMessage({ day: 3, kind: 'explore', trainerId: 'red', text: '레드: 1번도로 탐험을 시작했다. / 배틀 승리 / 탐험 종료' }, { trainerName: '레드' });
assert.equal(ex.from, '레드 · 탐험 보고'); assert.equal(ex.title, '레드: 1번도로 탐험 보고'); assert.equal(ex.preview, '탐험 종료');
assert.deepEqual(ex.actions.map(a => a.trainer || a.nav), ['red', 'map']);
const gym = newsMessage({ day: 4, kind: 'gym', text: '레드 vs 웅' });
assert.equal(gym.from, catSender('match')); assert.equal(gym.actions[0].nav, 'gyms'); assert.equal(gym.reportDay, 4);

/* 탭 필터·개수 */
const items = [
  { key: 'a', day: 5, cat: 'match', needsDecision: true }, { key: 'b', day: 5, cat: 'explore' },
  { key: 'c', day: 4, cat: 'explore' }, { key: 'd', day: 2, cat: 'world' },
];
const read = new Set(['c']), flagged = new Set(['d']);
const c = categoryCounts(items, read, flagged);
assert.deepEqual(c.all, { total: 4, unread: 3 }); assert.deepEqual(c.decision, { total: 1, unread: 1 });
assert.deepEqual(c.explore, { total: 2, unread: 1 }); assert.deepEqual(c.flagged, { total: 1, unread: 1 });
assert.equal(c.media.total, 0); assert(INBOX_CATS.find(x => x.id === 'media').hideEmpty, '아직 없는 분류는 숨긴다');
assert(inCategory(items[0], 'decision', flagged) && !inCategory(items[1], 'decision', flagged));

/* 날짜 묶음 */
assert.deepEqual(groupByDay(items).map(g => [g.day, g.items.length]), [[5, 2], [4, 1], [2, 1]]);
assert.deepEqual([dayHeading(5, 5), dayHeading(4, 5), dayHeading(2, 5)], ['오늘', '어제', '2일차']);
console.log('PASS: inbox categories (news kinds, legacy text), senders, shortcuts, tab counts/filters, day groups');
