/**
 * 받은 소식 — 메시지 분류·보낸 사람·바로가기 (FM식 받은 편지함, 작업65).
 *
 * 메시지 한 통의 모양 (fm-view.js inboxItems가 만든다):
 *   { key, day, cat, from, title, body, preview?, needsDecision?, trainerId?, reportDay?,
 *     actions?: [{ label, nav } | { label, trainer }],
 *     choices?: [{ label, hint?, run: () => ({ msg }) }] }   ← 이벤트 엔진이 쓸 선택지 자리
 * 새 종류의 소식(기사·인터뷰·이사회·스폰서 등)은 INBOX_CATS에 분류를 더하고 NEWS_KIND에 kind를 매핑하면 된다.
 */

/** 분류 탭 — hideEmpty는 아직 소식이 없으면 숨긴다 (앞으로 올 이벤트 자리) */
export const INBOX_CATS = [
  { id: 'all', label: '전체' },
  { id: 'decision', label: '결정 필요' },
  { id: 'flagged', label: '★ 중요' },
  { id: 'match', label: '경기·대회', from: '경기 운영팀' },
  { id: 'explore', label: '탐험 보고', from: '탐험 보고' },
  { id: 'growth', label: '성장·훈련', from: '트레이닝 센터' },
  { id: 'club', label: '소속사', from: '운영팀' },
  { id: 'media', label: '미디어', from: '홍보팀', hideEmpty: true },
  { id: 'board', label: '이사회', from: '이사회', hideEmpty: true },
  { id: 'commerce', label: '스폰서', from: '마케팅팀', hideEmpty: true },
  { id: 'world', label: '리그 소식', from: '리그 사무국' },
];
const CAT = Object.fromEntries(INBOX_CATS.map(c => [c.id, c]));
export const catLabel = id => CAT[id]?.label || '소식';
export const catSender = id => CAT[id]?.from || '운영팀';

/** 뉴스피드 kind → 분류 */
const NEWS_KIND = {
  gym: 'match', 'gym-booking': 'match', cup: 'match', youth: 'match', 'youth-final': 'match', local: 'match', city: 'match',
  explore: 'explore', warning: 'explore', safari: 'explore',
  training: 'growth', evolution: 'growth',
  career: 'club', graduation: 'club', personnel: 'club',
  league: 'world', pwt: 'world', pwc: 'world', 'npc-gym': 'world',
};
/** 각 분류에서 바로 갈 화면 */
const NEWS_NAV = {
  match: { label: '일정 · 대회', nav: 'schedule' }, explore: { label: '탐험 지도', nav: 'map' },
  growth: { label: '트레이닝 센터', nav: 'training' }, club: { label: '계약 · 스태프', nav: 'personnel' },
  world: { label: '일정 · 대회', nav: 'schedule' },
};

/** 뉴스피드 한 줄의 분류 — kind가 없으면 글로 짐작 (레벨업·이적 등 옛 소식) */
export function newsCategory(n) {
  if (n.kind && NEWS_KIND[n.kind]) return NEWS_KIND[n.kind];
  if (n.type === 'transfer') return 'club';
  if (/레벨 \d+/.test(n.text || '')) return 'growth';
  return n.kind ? 'world' : 'club';
}

/** 뉴스피드 한 줄 → 메시지. trainerName은 탐험 보고의 보낸 사람 */
export function newsMessage(n, { trainerName } = {}) {
  const cat = newsCategory(n);
  const actions = [];
  if (n.trainerId) actions.push({ label: `${trainerName || '트레이너'} 보기`, trainer: n.trainerId });
  if (n.kind === 'gym' || n.kind === 'npc-gym' || n.kind === 'gym-booking') actions.push({ label: '체육관 순회', nav: 'gyms' });
  else if (NEWS_NAV[cat]) actions.push(NEWS_NAV[cat]);
  if (n.kind === 'explore') {
    const [first, ...rest] = n.text.split(' / ');
    return { key: `n-${n.day}-${n.trainerId}-${n.text.length}`, day: n.day, cat, kind: n.kind, trainerId: n.trainerId,
      from: trainerName ? `${trainerName} · 탐험 보고` : catSender(cat),
      title: first.replace('탐험을 시작했다.', '탐험 보고'), body: rest.join('\n'), preview: rest.at(-1), actions };
  }
  return { key: `n-${n.day}-${n.text}`, day: n.day, cat, kind: n.kind, trainerId: n.trainerId, from: catSender(cat),
    title: n.text, body: '', reportDay: ['gym', 'training', 'cup', 'personnel', 'pwt'].includes(n.kind) ? n.day : null, actions };
}

/** 탭 필터 */
export function inCategory(m, cat, flagged) {
  if (cat === 'all') return true;
  if (cat === 'decision') return !!m.needsDecision;
  if (cat === 'flagged') return flagged.has(m.key);
  return m.cat === cat;
}

/** 탭마다 [전체 수, 안 읽은 수] */
export function categoryCounts(items, read, flagged) {
  const out = {};
  for (const c of INBOX_CATS) {
    const list = items.filter(m => inCategory(m, c.id, flagged));
    out[c.id] = { total: list.length, unread: list.filter(m => !read.has(m.key)).length };
  }
  return out;
}

/** 날짜 묶음 — [{ day, items }] (오늘이 위) */
export function groupByDay(items) {
  const groups = [];
  for (const m of items) {
    const g = groups.at(-1);
    if (g && g.day === m.day) g.items.push(m); else groups.push({ day: m.day, items: [m] });
  }
  return groups;
}
export const dayHeading = (day, today) => day === today ? '오늘' : day === today - 1 ? '어제' : `${day}일차`;
