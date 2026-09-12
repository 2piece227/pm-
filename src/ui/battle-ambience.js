import { battleAmbience } from '../data/battle-ambience.js';
import { BattleMusic } from './battle-music.js';
const KEY='pm-battle-music';
export function mountBattleAmbience(scene,match){
 const theme=battleAmbience(match);let alive=true;
 let prefs={enabled:true,volume:.18};
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(typeof saved?.enabled==='boolean')prefs.enabled=saved.enabled;if(Number.isFinite(saved?.volume))prefs.volume=Math.max(0,Math.min(1,saved.volume));}catch{}
 const toggle=document.getElementById('bgm-on'),volume=document.getElementById('bgm-volume'),status=document.getElementById('bgm-status');
 toggle.checked=prefs.enabled;volume.value=Math.round(prefs.volume*100);volume.setAttribute('aria-valuetext',`${volume.value}%`);
 status.textContent='';toggle.title=theme.trackName;
 const music=new BattleMusic(theme.music,{...prefs,onStatus:text=>{if(alive)status.textContent=text;}});
 music.audio.hidden=true;music.audio.dataset.battleMusic='true';scene.append(music.audio);
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}};
 toggle.onchange=()=>{prefs.enabled=toggle.checked;music.setEnabled(prefs.enabled);save();};
 volume.oninput=()=>{prefs.volume=Number(volume.value)/100;volume.setAttribute('aria-valuetext',`${volume.value}%`);music.setVolume(prefs.volume);save();};
 const visibility=()=>music.setHidden(document.hidden);document.addEventListener('visibilitychange',visibility);visibility();
 scene.dataset.weather='';
 const bg=new Image();bg.className='battle-backdrop';bg.alt='';bg.setAttribute('aria-hidden','true');
 bg.onload=()=>{if(alive){scene.prepend(bg);scene.dataset.arena=theme.biome;}};
 bg.src=theme.background;
 const base=new Image();base.onload=()=>{if(!alive)return;scene.querySelectorAll('.plat').forEach(p=>{
  p.innerHTML=`<svg viewBox="${theme.crop.join(' ')}" preserveAspectRatio="none" aria-hidden="true"><image href="${theme.platform}" width="320" height="132"/></svg>`;
  p.classList.add('pixel-platform');
 });};base.src=theme.platform;
 return {
  setPaused:v=>music.setPaused(v),
  finish:()=>{music.dispose();toggle.disabled=true;volume.disabled=true;},
  dispose:()=>{alive=false;music.dispose();music.audio.remove();document.removeEventListener('visibilitychange',visibility);toggle.onchange=null;volume.oninput=null;toggle.disabled=false;volume.disabled=false;bg.onload=null;base.onload=null;bg.remove();delete scene.dataset.arena;scene.querySelectorAll('.plat').forEach(p=>{p.innerHTML='';p.classList.remove('pixel-platform');});},
 };
}
