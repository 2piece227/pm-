/**
 * 다판제 시리즈 (단판 · 3판 2선 · 5판 3선) — docs/competition-v1.md §4
 *
 * 한 게임씩 끊어서 진행한다(playSeriesGame). 지금은 하루 진행 안에서 끝까지 돌리지만(runSeries),
 * 관전·대회 개편 때 게임 사이에 플레이어 입력을 끼울 수 있게 상태를 시리즈 객체에 남긴다.
 * 매 게임 HP·PP·상태는 초기화(배틀 엔진이 새로 시작), 등록 파티·기술·도구는 시리즈 내내 고정.
 */
import { Dex } from '@pkmn/dex';
import { WINS_NEEDED } from '../data/international.js';

const typesOf = species => Dex.species.get(species)?.types || [];
const eff = (type, targetTypes) => {
  if (!Dex.getImmunity(type, targetTypes)) return 0;
  return Math.pow(2, Dex.getEffectiveness(type, targetTypes));
};

/**
 * 직전 게임에서 진 쪽의 NPC 조정 (§4.3): 상대가 직전에 선봉으로 낸 포켓몬에 상성 점수가 가장 좋은 내 포켓몬을 선봉으로.
 * 점수 = 내 공격기 중 최고 상성 − 상대 타입이 나를 찌르는 최고 상성의 절반. 동점이면 원래 순서 유지(결정적).
 */
export function counterLead(party, foeLeadSpecies) {
  if (!foeLeadSpecies || party.length < 2) return party.map((_, i) => i);
  const foeTypes = typesOf(foeLeadSpecies);
  const score = m => {
    const mine = typesOf(m.species);
    const offense = Math.max(0, ...(m.moves || []).map(id => Dex.moves.get(id)).filter(mv => mv?.exists && mv.category !== 'Status').map(mv => eff(mv.type, foeTypes)));
    const defense = Math.max(0, ...foeTypes.map(t => eff(t, mine)));
    return offense - defense * 0.5;
  };
  let best = 0;
  party.forEach((m, i) => { if (score(m) > score(party[best])) best = i; });
  return [best, ...party.map((_, i) => i).filter(i => i !== best)];
}

const reorder = (entry, order) => ({ ...entry, party: order.map(i => entry.party[i]) });

/** 시리즈 객체 — 이벤트의 series 배열에 저장한다 */
export function createSeries({ id, eventId, stage, day, format = 'bo1', a, b }) {
  return { id, eventId, stage, day, format, aId: a.id, bId: b.id, games: [], winsA: 0, winsB: 0,
    winnerId: null, loserId: null, adjustments: [], order: { a: a.party.map((_, i) => i), b: b.party.map((_, i) => i) }, lastLead: { a: null, b: null } };
}
export const seriesDone = s => !!s.winnerId;

/**
 * 한 게임을 치른다. playGame(a, b, gameNo) → { id, winnerId, aLead, bLead } (기존 match 객체)
 * a·b는 등록 스냅샷 원본. 선봉 순서만 시리즈 상태(order)대로 바꿔 넘긴다.
 */
export async function playSeriesGame(series, a, b, playGame) {
  if (seriesDone(series)) return null;
  const gameNo = series.games.length + 1;
  const m = await playGame(reorder(a, series.order.a), reorder(b, series.order.b), gameNo);
  m.seriesId = series.id; m.gameNo = gameNo;
  series.games.push(m.id);
  if (m.winnerId === a.id) series.winsA++; else series.winsB++;
  const need = WINS_NEEDED[series.format] || 1;
  const aLead = a.party[series.order.a[0]]?.species, bLead = b.party[series.order.b[0]]?.species;
  if (series.winsA >= need || series.winsB >= need) {
    series.winnerId = series.winsA >= need ? a.id : b.id;
    series.loserId = series.winnerId === a.id ? b.id : a.id;
    return m;
  }
  /* 다음 게임 전 조정 — 진 쪽만 바꾼다 */
  const loserSide = m.winnerId === a.id ? 'b' : 'a';
  const loser = loserSide === 'a' ? a : b, foeLead = loserSide === 'a' ? bLead : aLead;
  const order = counterLead(loser.party, foeLead);
  if (order.join() !== series.order[loserSide].join()) {
    series.order[loserSide] = order;
    series.adjustments.push({ game: gameNo + 1, side: loserSide, leadOrder: [...order] });
  }
  return m;
}

/** 시리즈를 끝까지 (지금의 하루 진행용) */
export async function runSeries(series, a, b, playGame) {
  while (!seriesDone(series)) await playSeriesGame(series, a, b, playGame);
  return series;
}
