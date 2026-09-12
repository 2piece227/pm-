import { playBattleLog, resetScene, stopPlayback, setSpeedSource, setPaused, isPaused } from './battle-view.js';
import { mountBattleAmbience } from './battle-ambience.js';
import * as sfx from './sfx.js';

/** Playback uses the already resolved protocol, never a second battle calculation. */
export function watchGymMatch(match) {
  return new Promise(resolve=>{
    const $=id=>document.getElementById(id);
    const overlay=$('watch-ov'), app=$('app');
    overlay.hidden=false;$('watch-panel').style.display='';app.inert=true;
    $('watch-title').textContent=`${match.trainerName} vs ${match.gymName} · 체육관 도전`;
    $('watch-close').textContent='관전 건너뛰기';
    $('watch-pause').textContent='⏸ 일시정지';
    resetScene();setSpeedSource(()=>Number($('speed').value));
    const ambience=mountBattleAmbience($('scene'),match);
    let closed=false;
    const close=()=>{
      if(closed)return;closed=true;ambience.dispose();stopPlayback();sfx.stopAll();overlay.hidden=true;app.inert=false;
      document.removeEventListener('keydown',key);resolve();
    };
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
    document.addEventListener('keydown',key);
    $('watch-close').onclick=close;
    $('watch-pause').onclick=()=>{const paused=setPaused(!isPaused());ambience.setPaused(paused);$('watch-pause').textContent=paused?'▶ 재개':'⏸ 일시정지';};
    const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    playBattleLog(match.log,{p1:{name:safe(match.trainerName),agency:safe(match.agencyName)},p2:{name:match.gymName,agency:'체육관 관장'}})
      .then(()=>{if(!closed){ambience.finish();$('watch-title').textContent=`${match.trainerName} · ${match.won?'관장전 승리':'관장전 패배'}${match.firstWin?' · 배지 획득':''}`;$('watch-close').textContent='결과 확인 · 닫기';}})
      .catch(()=>{if(!closed){ambience.finish();$('watch-title').textContent='관전 표시를 완료하지 못했습니다. 경기 결과는 저장되어 있습니다.';$('watch-close').textContent='결과 확인 · 닫기';}});
  });
}
