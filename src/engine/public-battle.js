// Shared, chronological public observations. No simulator Pokemon or future log access.
export const publicId = value => String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export class PublicBattle {
  constructor(){this.cursor=0;this.skipPrivate=false;this.turn=0;this.active={};this.records=new Map();this.preview=new Map();}
  scan(log){while(this.cursor<log.length)this.push(log[this.cursor++]);}
  current(side){return this.records.get(this.active[side])||null;}
  push(raw){
    if(this.skipPrivate){this.skipPrivate=false;return;}
    const p=String(raw).split('|'),type=p[1],side=p[2]?.slice(0,2);
    if(type==='split'){this.skipPrivate=true;return;}
    if(type==='turn'){this.turn=Number(p[2]);return;}
    if(type==='-clearallboost'){for(const v of this.records.values())v.boosts={};return;}
    if(type==='poke'){const key=`${side}:${p[3]?.split(',')[0]}`;this.preview.set(key,(this.preview.get(key)||0)+1);return;}
    if(!['p1','p2'].includes(side))return;
    if(['switch','drag','replace'].includes(type)){
      const details=p[3].split(',').map(s=>s.trim()),species=details[0];
      const key=`${p[2]}|${p[3]}`;
      const ambiguous=(this.preview.get(`${side}:${species}`)||0)>1;
      if(type==='replace')this.records.delete(this.active[side]); // Illusion attribution was provisional.
      let record=this.records.get(key);
      if(!record||ambiguous||type==='replace')record={key,species,name:p[2].split(': ').slice(1).join(': '),
        level:Number(details.find(v=>/^L\d+$/.test(v))?.slice(1)||100),moves:[],ability:'',item:'',boosts:{},volatiles:{},toxicStage:0};
      if(record.transformed)record.moves=[];
      record.boosts={};record.volatiles={};record.toxicStage=0;record.transformed=false;record.forme=null;record.types=null;
      this.active[side]=key;this.records.set(key,record);
      record.enteredTurn=this.turn;
      this.condition(record,p[4]);return;
    }
    const r=this.current(side);if(!r)return;
    if(type==='move'){
      // Metronome/Sleep Talk/Copycat-generated moves do not disclose an equipped slot.
      if(!p.slice(4).some(s=>s.startsWith('[from]'))){
        if(!r.moves.includes(p[3]))r.moves.push(p[3]);
        if(r.moves.length>4)r.moves.shift();
        r.lastMove=publicId(p[3]);
      }
      const id=publicId(p[3]);
      if(['outrage','thrash','petaldance'].includes(id))r.volatiles.lockedmove={move:id};
    }
    if(['-damage','-heal','-sethp'].includes(type)){
      this.condition(r,p[3]);
      if(type==='-damage'&&r.status==='tox'&&p.includes('[from] psn'))r.toxicStage++;
    }
    if(type==='-status'){r.status=p[3];if(p[3]==='slp')delete r.volatiles.lockedmove;}
    if(type==='-curestatus'){r.status='';r.toxicStage=0;}
    if(type==='-boost'||type==='-unboost')r.boosts[p[3]]=Math.max(-6,Math.min(6,(r.boosts[p[3]]||0)+(type==='-boost'?1:-1)*Number(p[4])));
    if(type==='-setboost')r.boosts[p[3]]=Number(p[4]);
    if(type==='-clearboost')r.boosts={};
    if(type==='-clearallboost')for(const v of this.records.values())v.boosts={};
    if(type==='-ability')r.ability=publicId(p[3]);
    if(type==='-item')r.item=publicId(p[3]);
    if(type==='-enditem')r.item='';
    if(type==='-transform'){r.transformed=true;r.moves=[];r.forme=this.current(p[3]?.slice(0,2))?.species||null;}
    if(type==='detailschange')r.forme=p[3].split(',')[0];
    if(type==='-formechange')r.forme=p[3];
    if(type==='-terastallize')r.teraType=p[3];
    if(type==='-start'){
      const effect=publicId(p[3].replace(/^move: /,''));r.volatiles[effect]={};
      if(effect==='typechange')r.types=p[4]?.split('/');
      if(effect==='confusion')delete r.volatiles.lockedmove;
    }
    if(type==='-end')delete r.volatiles[publicId(p[3].replace(/^move: /,''))];
    if(type==='faint')r.ratio=0;
    // Ability/item activations also appear in [from] annotations; [of] identifies the owner.
    const owner=p.find(s=>s.startsWith('[of] '));
    const target=owner?this.current(owner.slice(5,7)):r;
    for(const annotation of p){
      if(annotation.startsWith('[from] ability: ')&&target)target.ability=publicId(annotation.slice(16));
      if(annotation.startsWith('[from] item: ')&&target)target.item=publicId(annotation.slice(13));
    }
  }
  condition(r,text){
    if(!text)return;
    const [health,status='']=text.split(' '),[hp,max]=health.split('/').map(Number);
    r.ratio=max?hp/max:0;r.status=status==='fnt'?'':status;
  }
}
