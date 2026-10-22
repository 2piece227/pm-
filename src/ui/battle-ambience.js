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
 /* 원작 같은 도트 배틀 필드 — 발판이 그림에 들어 있어서 따로 깔지 않는다 */
 /* 이미지 로드 이벤트에 기대지 않고 바로 배경으로 깐다 (iPad 사파리에서 필드가 안 뜨던 문제) */
 scene.dataset.arena='field';scene.dataset.field=theme.field;
 scene.style.backgroundImage=`url("${theme.url}")`;
 const base={onload:null};
 return {
  setPaused:v=>music.setPaused(v),
  finish:()=>{music.dispose();toggle.disabled=true;volume.disabled=true;},
  dispose:()=>{alive=false;music.dispose();music.audio.remove();document.removeEventListener('visibilitychange',visibility);toggle.onchange=null;volume.oninput=null;toggle.disabled=false;volume.disabled=false;bg.onload=null;base.onload=null;bg.remove();delete scene.dataset.arena;delete scene.dataset.field;scene.style.backgroundImage='';scene.querySelectorAll('.plat').forEach(p=>{p.innerHTML='';p.classList.remove('pixel-platform');});},
 };
}
