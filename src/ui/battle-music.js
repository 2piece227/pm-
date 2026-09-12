/** Independent music channel. Speed controls affect battle events, never music pitch. */
export class BattleMusic {
 constructor(url,{volume=.18,enabled=true,audioFactory=()=>new Audio(),onStatus=()=>{}}={}){
  this.audio=audioFactory();this.audio.preload='none';this.audio.loop=true;this.audio.src=url;
  this.audio.volume=volume;this.enabled=enabled;this.paused=false;this.hidden=false;this.disposed=false;this.onStatus=onStatus;
  this.audio.onerror=()=>{if(!this.disposed)this.onStatus('BGM을 불러오지 못했습니다.');};
 }
 sync(){
  if(this.disposed)return;
  if(!this.enabled||this.paused||this.hidden){this.audio.pause();return;}
  const p=this.audio.play();
  p?.then(()=>{if(!this.disposed)this.onStatus('');}).catch(e=>{if(!this.disposed&&this.enabled&&!this.paused&&!this.hidden&&e.name!=='AbortError')this.onStatus(e.name==='NotAllowedError'?'BGM을 껐다 켜면 재생됩니다.':'BGM을 불러오지 못했습니다.');});
 }
 setEnabled(v){this.enabled=!!v;this.sync();}
 setPaused(v){this.paused=!!v;this.sync();}
 setHidden(v){this.hidden=!!v;this.sync();}
 setVolume(v){if(Number.isFinite(v))this.audio.volume=Math.max(0,Math.min(1,v));}
 dispose(){if(this.disposed)return;this.disposed=true;this.audio.pause();this.audio.onerror=null;this.audio.removeAttribute('src');this.audio.load();}
}
