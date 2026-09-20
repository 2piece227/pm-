import {PublicBattle,publicId} from '../engine/public-battle.js';
import {stageMul} from './estimate.js';

export const KNOWLEDGE={maxGuesses:4,unknownWeight:.65,maxLapse:.35};
const candidates=new Map();
// Own team is known, but getTypes() fires global engine events and can inspect hidden foes.
export function ownView(mon){
  return {name:mon.name,level:mon.level,hp:mon.hp,maxhp:mon.maxhp,status:mon.status,
    ability:mon.volatiles.gastroacid?'':mon.ability,item:mon.item,boosts:mon.boosts,volatiles:mon.volatiles,statusState:mon.statusState,
    moveSlots:mon.moveSlots,battle:{field:mon.battle.field},side:{sideConditions:mon.side.sideConditions},
    getStat:(k)=>mon.getStat(k,false,true),
    getTypes:()=>mon.terastallized&&mon.terastallized!=='Stellar'?[mon.terastallized]:
      [...mon.types,...(mon.addedType?[mon.addedType]:[])].filter(t=>!(mon.volatiles.roost&&t==='Flying'))};
}
function moveCandidates(gen,species,level){
  const key=`${species.id}:${level}`;if(candidates.has(key))return candidates.get(key);
  const table=gen.species.getLearnsetData(species.id)?.learnset||{};
  const moves=Object.entries(table).filter(([,sources])=>sources.some(s=>{
    const match=/^\dL(\d+)$/.exec(s);return match?Number(match[1])<=level:level>=20;
  })).map(([id])=>gen.moves.get(id)).filter(m=>m?.exists&&m.category!=='Status'&&m.basePower>0&&m.basePower<=120&&!m.isZ&&!m.isMax);
  const ranked=moves.sort((a,b)=>{
    const quality=m=>m.basePower*(m.accuracy===true?1:m.accuracy/100)*(species.types.includes(m.type)?1.5:1)*
      (m.category==='Physical'?species.baseStats.atk:species.baseStats.spa);
    return quality(b)-quality(a)||a.id.localeCompare(b.id);
  });
  // At most one prior per type: do not pretend the opponent has four near-identical attacks.
  const seen=new Set(),pool=ranked.filter(m=>{if(seen.has(m.type))return false;seen.add(m.type);return true;});
  candidates.set(key,pool);return pool;
}
export class OpponentModel {
  constructor(){this.public=new PublicBattle();this.cache=null;}
  benches(battle,side,gen,stats,rng){
    this.public.scan(battle.log);
    return [...this.public.records.values()].filter(r=>r.key.startsWith(side)&&r.name!==this.public.current(side)?.name&&r.ratio>0&&!r.transformed)
      .map(r=>this.view(battle,side,gen,stats,rng,{...r,boosts:{},volatiles:{},toxicStage:0,forme:null,types:null,abilitySuppressed:false}));
  }
  view(battle,side,gen,stats,rng,knownRecord=null){
    this.public.scan(battle.log);
    const record=knownRecord||this.public.current(side);if(!record)return null;
    const cacheKey=`${battle.log.length}:${record.key}`;
    if(this.cache?.key===cacheKey)return this.cache.view;
    const species=gen.species.get(record.forme||record.species),level=record.level;
    const lapse=knownRecord?0:Math.max(0,20-stats.focus)/20*KNOWLEDGE.maxLapse*Math.min(1,this.public.turn/12);
    const omitted=[],remembered=[];
    for(const name of record.moves){
      // The last shown move is still salient; lapses never erase the public notebook.
      if(publicId(name)!==record.lastMove&&lapse>0&&rng()<lapse)omitted.push(name);
      else remembered.push(name);
    }
    const room=Math.max(0,4-record.moves.length),count=Math.min(room,Math.max(1,Math.ceil(stats.know/5)));
    const guesses=moveCandidates(gen,species,level).filter(m=>!record.moves.some(n=>publicId(n)===m.id)).slice(0,count);
    const slots=[...remembered.map(name=>({id:publicId(name),pp:1,disabled:false,observed:true})),
      ...guesses.map(m=>({id:m.id,pp:1,disabled:false,estimated:true,weight:KNOWLEDGE.unknownWeight}))];
    const base=species.baseStats;
    const stat=k=>Math.floor((2*base[k]+31)*level/100)+(k==='hp'?level+10:5);
    const maxhp=species.id==='shedinja'?1:stat('hp');
    const view={name:record.name,level,maxhp,hp:Math.max(0,record.ratio*maxhp),status:record.status||'',
      ability:record.abilitySuppressed?'':record.ability,item:record.item,boosts:{...record.boosts},volatiles:structuredClone(record.volatiles),
      statusState:{stage:record.toxicStage},moveSlots:slots,
      battle:{field:battle.field},side:{sideConditions:battle[side].sideConditions},
      getTypes:()=>record.teraType&&record.teraType!=='Stellar'?[record.teraType]:[...(record.types||species.types)],getStat:(k,unboosted)=>stat(k)*(unboosted?1:stageMul(record.boosts[k]||0)),
      knowledge:{observed:[...record.moves],remembered,omitted,estimated:guesses.map(m=>m.name),abilityKnown:!!record.ability,itemKnown:!!record.item}};
    this.cache={key:cacheKey,view};return view;
  }
}
