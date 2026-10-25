/** Exhaustive pairing within a score group: no rematches, no silent bye or random retry. (예전 PWT용) */
export function swissPairs(entries,records,matches,round){
  const active=entries.filter(e=>records[e.id].wins<3&&records[e.id].losses<3);
  const played=new Set(matches.map(m=>[m.aId,m.bId].sort().join('|')));
  const groups=new Map();
  for(const e of active){const w=records[e.id].wins;if(!groups.has(w))groups.set(w,[]);groups.get(w).push(e);}
  const solve=(pool,avoidRegion)=>{
    if(!pool.length)return [];
    const choices=e=>pool.filter(b=>e.id!==b.id&&!played.has([e.id,b.id].sort().join('|'))&&(!avoidRegion||e.region!==b.region));
    const a=[...pool].sort((x,y)=>choices(x).length-choices(y).length)[0];
    for(const b of choices(a)){
      const rest=solve(pool.filter(x=>x.id!==a.id&&x.id!==b.id),avoidRegion);
      if(rest)return [[a,b],...rest];
    }
    return null;
  };
  return [...groups.entries()].sort((a,b)=>b[0]-a[0]).flatMap(([,pool])=>{
    if(pool.length%2)throw new Error('스위스 승점 그룹 인원이 홀수입니다.');
    const pairs=(round===1?solve(pool,true):null)||solve(pool,false);
    if(!pairs)throw new Error('재대결 없는 스위스 대진을 만들 수 없습니다.');
    return pairs;
  });
}

/* ---------------- 국제 대회 v2 (docs/competition-v1.md §10) ---------------- */

/** 진출·탈락이 걸린 그룹(2승 또는 2패)은 3판 2선, 나머지는 단판 */
export const swissFormat = (wins, losses) => (wins === 2 || losses === 2 ? 'bo3' : 'bo1');

/**
 * 같은 전적끼리, 재대결 금지는 절대 조건. 라운드별 추가 제약은 우선순위 순서로 주고,
 * 해가 없으면 **낮은 것부터 하나씩** 풀어 다시 찾는다.
 * @param entries   [{id, region, seed}]
 * @param records   {id: {wins, losses}}
 * @param played    Set('idA|idB') 지난 대결
 * @param ctx       {round, pwtWinnerId?}  pwtWinnerId는 PWC 1라운드용
 * @returns [{a, b, wins, losses, format}]
 */
export function swissPairsV2(entries, records, played, { round, pwtWinnerId = null } = {}) {
  const key = (x, y) => [x.id, y.id].sort().join('|');
  const rules = [];
  if (round === 1) {
    if (pwtWinnerId) rules.push((a, b) => {
      const w = a.id === pwtWinnerId ? a : b.id === pwtWinnerId ? b : null;
      if (!w) return true;
      const o = w === a ? b : a;
      return o.seed === 4 && o.region !== w.region;
    });
    rules.push((a, b) => a.region !== b.region);
    rules.push((a, b) => !(a.seed === 1 && b.seed === 1));
  } else if (round === 2) rules.push((a, b) => a.region !== b.region);

  const solve = (pool, ok) => {
    if (!pool.length) return [];
    const choices = e => pool.filter(b => e.id !== b.id && !played.has(key(e, b)) && ok(e, b));
    const a = [...pool].sort((x, y) => choices(x).length - choices(y).length || x.order - y.order)[0];
    for (const b of choices(a)) {
      const rest = solve(pool.filter(x => x.id !== a.id && x.id !== b.id), ok);
      if (rest) return [[a, b], ...rest];
    }
    return null;
  };
  const active = entries.map((e, order) => ({ ...e, order })).filter(e => records[e.id].wins < 3 && records[e.id].losses < 3);
  const groups = new Map();
  for (const e of active) { const k = `${records[e.id].wins}-${records[e.id].losses}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const out = [];
  for (const [k, pool] of [...groups.entries()].sort((x, y) => y[0].localeCompare(x[0]))) {
    if (pool.length % 2) throw new Error('스위스 승점 그룹 인원이 홀수입니다.');
    let pairs = null;
    for (let n = rules.length; n >= 0 && !pairs; n--) {
      const use = rules.slice(0, n);
      pairs = solve(pool, (a, b) => use.every(r => r(a, b)));
    }
    if (!pairs) throw new Error('재대결 없는 스위스 대진을 만들 수 없습니다.');
    const [w, l] = k.split('-').map(Number);
    for (const [a, b] of pairs) out.push({ a, b, wins: w, losses: l, format: swissFormat(w, l) });
  }
  return out;
}

/**
 * 같은 전적 안의 순위 (§12.2): 부흐홀츠 → [PWC] PWT 우승자 → 시드 → 맞대결 → 고정 셔플 순서
 * @param ids 같은 전적의 선수들
 */
export function swissTiebreak(ids, { records, opponents, seedOf, pwtWinnerId = null, h2h = {}, tiebreakOrder = [] }) {
  const buch = id => (opponents[id] || []).reduce((n, o) => n + (records[o]?.wins || 0), 0);
  return [...ids].sort((x, y) =>
    buch(y) - buch(x)
    || (pwtWinnerId ? (y === pwtWinnerId) - (x === pwtWinnerId) : 0)
    || (seedOf[x] || 4) - (seedOf[y] || 4)
    || (h2h[`${x}|${y}`] ? -1 : h2h[`${y}|${x}`] ? 1 : 0)
    || tiebreakOrder.indexOf(x) - tiebreakOrder.indexOf(y));
}
