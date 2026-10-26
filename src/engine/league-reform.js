/**
 * 리그 개혁 규칙 판정과 NPC 유스 성장 (data/league-reform.js)
 */
import { REFORM, SERIES_POINTS, NPC_CURVE, PARENT_SUPPORT } from '../data/league-reform.js';
import { GYMS } from '../data/gyms.js';
import { createPokemon, gainExp, expForLevel } from '../data/pokemon.js';
import { locationsIn } from '../data/routes.js';
import { evolveNpc } from './pokemon-management.js';

export const isReform = game => !!game?.reform;
export const seasonYear = day => Math.floor(((day || 1) - 1) / 365) + 1;
export const calendarYear = day => REFORM.firstYear + seasonYear(day) - 1;
/** 유스만 뛰는 시즌인가 (2026) */
export const youthOnly = (game, day = game?.day) => isReform(game) && !game.debug?.unlockReform && REFORM.youthOnlySeasons.includes(seasonYear(day));
/** 이 시즌에 PWT가 열리나 */
export const pwtHeld = (game, day = game?.day) => !isReform(game) || seasonYear(day) >= REFORM.pwtFirstSeason;
export const weeklySupport = agency => PARENT_SUPPORT[agency?.tier]?.weekly || 0;

/** 유스 시리즈 포인트 — 완료된 그 시즌 유스컵에서 우승 10·준우승 6·4강 3·8강 1 */
export function seriesPoints(game, year = seasonYear(game.day)) {
  const pts = new Map();
  for (const e of game.competitions?.events || []) {
    if (e.kind !== 'youth' || e.season !== year || e.status !== 'completed' || !e.result) continue;
    const last = Math.max(...e.matches.map(m => m.round));
    const add = (id, n) => { const row = pts.get(id) || { id, name: e.entrants.find(x => x.id === id)?.name, agencyName: e.entrants.find(x => x.id === id)?.agencyName, points: 0 }; row.points += n; pts.set(id, row); };
    add(e.result.championId, SERIES_POINTS[0]); add(e.result.runnerId, SERIES_POINTS[1]);
    for (const m of e.matches) {
      const loser = m.winnerId === m.aId ? m.bId : m.aId;
      if (m.round === last - 1) add(loser, SERIES_POINTS[2]);
      else if (m.round === last - 2) add(loser, SERIES_POINTS[3]);
    }
  }
  return [...pts.values()].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

/* ---------------- NPC 유스 성장 (§3.4 경량 계층) ---------------- */

const curveLevel = d => {
  for (let i = 1; i < NPC_CURVE.length; i++) {
    const [d1, l1] = NPC_CURVE[i - 1], [d2, l2] = NPC_CURVE[i];
    if (d <= d2) return l1 + (l2 - l1) * (d - d1) / (d2 - d1);
  }
  return NPC_CURVE.at(-1)[1];
};
/** 개인 속도 — 판단력·운영·모기업 지원 + 약간의 운 [임시값] */
function paceOf(game, t, agency) {
  if (t.npcPace) return t.npcPace;
  const skill = ((t.stats?.judge || 8) + (t.stats?.ops || 8)) / 40;
  const support = (PARENT_SUPPORT[agency.tier]?.weekly || 0) / 1200 * 0.08;
  t.npcPace = Math.max(0.7, Math.min(1.3, 0.82 + skill * 0.25 + support + (game.rng() - 0.5) * 0.24));
  return t.npcPace;
}

/**
 * 매일: 기준 곡선 × 개인 속도만큼 경험치를 실제로 넣고(레벨·기술·진화가 진짜로 일어난다),
 * 가끔 그 레벨대 출현표에서 동료를 얻고, 관장 레벨에 닿으면 실제 관장전(간격 규칙 동일)을 치른다.
 * @param challenge  (game, trainer, gymId) => match — 관장전 (gyms.js의 NPC용)
 */
export async function npcYouthTick(game, challenge) {
  if (!isReform(game)) return [];
  const news = [];
  const started = game.reform.startDay || 1;
  for (const agency of game.league.agencies) {
    if (agency.id === game.playerAgencyId) continue;
    const region = agency.region || 'kanto';
    for (const t of agency.roster) {
      if (!t.isYouth || !t.party?.length) continue;
      const pace = paceOf(game, t, agency);
      const target = Math.floor(curveLevel((game.day - started) * pace));
      for (const [i, m] of t.party.entries()) {
        const want = Math.max(m.level, target - (i === 0 ? 0 : 2 + (i % 3)));
        if (want > m.level) await gainExp(m, expForLevel(want) - m.exp);
        /* 자동 진화 + 돌·통신·친밀도 진화는 Lv20/40에 (pokemon-management evolveNpc) */
        await evolveNpc(m);
      }
      /* 동료: 일주일에 한 번, 파티가 6마리가 될 때까지 */
      if (t.party.length < 6 && (game.day + t.id.length) % 7 === 0) {
        const top = Math.max(...t.party.map(m => m.level));
        const locs = locationsIn(region).filter(l => l.wild.length && l.level[1] <= top + 2).sort((a, b) => b.level[1] - a.level[1]);
        const loc = locs[0];
        if (loc) { const w = loc.wild[Math.floor(game.rng() * loc.wild.length)]; const mon = await createPokemon({ species: w.species, level: Math.max(w.min, Math.min(w.max, top - 3)), rng: game.rng }); if (mon) t.party.push(mon); }
      }
      /* 관장전: 지방 순서대로, 간격 규칙(마지막 배지 + 21일)은 우리와 같다 */
      const gyms = GYMS.filter(g => g.region === region).sort((a, b) => a.order - b.order);
      const next = gyms.find(g => !(t.badges || []).includes(g.id));
      if (!next) continue;
      const lead = Math.max(...t.party.map(m => m.level)), need = Math.max(...next.party.map(p => p.level));
      const waitUntil = Math.max((t.lastBadgeDay || 0) + REFORM.gymInterval, (t.lastGymLossDay || 0) + 3);
      /* 간격이 풀려도 바로 신청하지는 않는다 — 하루 20~50% (빠른 유스일수록 서두른다) [임시값] */
      if (lead >= need && game.day >= waitUntil && game.rng() < 0.2 + 0.5 * (pace - 0.7)) {
        const m = await challenge(game, t, next.id);
        if (m?.won) news.push(`${t.name}(${agency.name}) · ${next.badge} 획득 · 배지 ${t.badges.length}개`);
        else t.lastGymLossDay = game.day;
      }
    }
  }
  for (const text of news) game.league.newsFeed.unshift({ day: game.day, kind: 'npc-gym', text });
  return news;
}
