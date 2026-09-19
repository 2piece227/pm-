import { RANKING as R, SEASON } from '../data/season.js';
import { isRegisteredPro } from './career.js';

// Rebuild from immutable event entries, never from current party strength or ownership.
export function regionalRanking(game,year=Math.floor((game.day-1)/SEASON.days)+1){
  const rows=new Map();
  const row=x=>{
    if(!rows.has(x.id))rows.set(x.id,{id:x.id,name:x.name,agencyName:x.agencyName,region:x.region||'kanto-johto',rating:R.base,
      points:0,matches:0,wins:0,cityMatches:0,form:[],lastDay:0,role:x.definition.regionalRole||'pro'});
    return rows.get(x.id);
  };
  const international=(game.international?.seasons||[]).filter(s=>s.season===year).flatMap(s=>s.matches.map((m,index)=>({order:index,id:m.id,season:s.season,status:'completed',ranking:true,kind:'pwt',date:m.day,entrants:s.entrants,matches:[m],rankingPlacement:false,rankingWeight:m.region==='international'?1.5:0.5})));
  const events=[...(game.competitions?.events||[]),...international].filter(e=>e.season===year&&e.status==='completed'&&e.ranking).sort((a,b)=>a.date-b.date||(a.order??0)-(b.order??0)||a.id.localeCompare(b.id));
  for(const e of events){
    const pros=new Map(e.entrants.filter(x=>isRegisteredPro(x.definition)).map(x=>[x.id,x]));
    for(const m of e.matches){
      if(!pros.has(m.aId)||!pros.has(m.bId))continue;
      const a=row(pros.get(m.aId)),b=row(pros.get(m.bId));
      const result=m.draw?0.5:Number(m.winnerId===a.id),expected=1/(1+10**((b.rating-a.rating)/R.scale));
      const delta=R.k*(e.rankingWeight??1)*(result-expected);a.rating+=delta;b.rating-=delta;
      for(const [x,score] of [[a,result],[b,1-result]]){
        x.matches++;x.wins+=Number(score===1);x.cityMatches+=Number(e.kind==='city');
        x.form.push(score);x.form=x.form.slice(-R.formWindow);x.lastDay=e.date;
      }
    }
    if(e.rankingPlacement===false)continue;
    for(const x of pros.values()){
      const r=row(x),last=e.matches.filter(m=>[m.aId,m.bId].includes(x.id)).at(-1);
      if(!last)continue;
      const place=x.id===e.result.championId?0:x.id===e.result.runnerId?1:last.round===e.matches.at(-1).round-1?2:3;
      r.points+=R.placement[place]*(e.rankingWeight??1)*(e.pointsMultiplier??1);
    }
  }
  const current=new Map([...game.league.agencies.flatMap(a=>a.roster),...(game.personnel?.freeAgents||[]),...(game.international?.officials||[])].map(t=>[t.id,t]));
  return [...rows.values()].filter(r=>r.region==='kanto-johto').map(r=>{
    const form=r.form.length?r.form.reduce((s,v)=>s+v,0)/r.form.length:0.5;
    const inactive=Math.min(R.maxInactivePenalty,Math.max(0,game.day-r.lastDay-R.inactiveAfter)*R.inactivePerDay);
    const t=current.get(r.id);
    return {...r,score:r.rating+r.points*R.pointsWeight+(form-0.5)*R.formWeight-inactive,
      provisional:r.matches<R.minMatches,challengerEligible:!!t&&isRegisteredPro(t)&&r.cityMatches>0&&r.matches>=R.minMatches&&!['elite-four','champion','gym-leader'].includes(t?.regionalRole)};
  }).sort((a,b)=>b.score-a.score||b.rating-a.rating||a.id.localeCompare(b.id));
}

export function citySeedScores(game,event){
  const scores=new Map(regionalRanking(game,event.season).map(r=>[r.id,r.score]));
  const local=game.competitions.events.find(e=>e.season===event.season&&e.kind==='local'&&e.status==='completed'&&e.date<event.date);
  if(local&&!game.competitions.events.some(e=>e.kind==='city'&&e.season===event.season&&e.date>local.date&&e.date<event.date&&e.status==='completed')){
    scores.set(local.result.championId,(scores.get(local.result.championId)??R.base)+R.localSeedBonus);
  }
  return scores;
}
