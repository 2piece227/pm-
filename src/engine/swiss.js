/** Exhaustive pairing within a score group: no rematches, no silent bye or random retry. */
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
