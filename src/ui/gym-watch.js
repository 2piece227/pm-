import { playBattleLog, resetScene, stopPlayback, setSpeedSource, setPaused, isPaused } from './battle-view.js';
import { mountBattleAmbience } from './battle-ambience.js';
import * as sfx from './sfx.js';
import { renderBattleAnalysis } from './battle-analysis.js';
import { spriteUrl, spriteName } from './trainer-sprite.js';

/** Playback uses the already resolved protocol, never a second battle calculation. */
export function watchGymMatch(match) {
  return new Promise(resolve=>{
    const $=id=>document.getElementById(id);
    const overlay=$('watch-ov'), app=$('app');
    overlay.hidden=false;$('watch-panel').style.display='';app.inert=true;
    const analysisPanel=document.createElement('section');
    analysisPanel.innerHTML=match.analysis?renderBattleAnalysis(match.analysis):'<p class="muted">저장된 경기 로그를 재생합니다.</p>';
    $('watch-panel').append(analysisPanel);
    $('watch-title').textContent=`${match.trainerName} vs ${match.gymName} · ${match.eventName || "체육관 도전"}`;
    $('watch-close').textContent='관전 건너뛰기';
    $('watch-pause').textContent='⏸ 일시정지';
    resetScene();setSpeedSource(()=>Number($('speed').value));
    const ambience=mountBattleAmbience($('scene'),match);
    let closed=false;
    const close=()=>{
      if(closed)return;closed=true;analysisPanel.remove();ambience.dispose();peekOff();document.removeEventListener('keyup',keyUp);window.removeEventListener('blur',peekOff);scene.onpointerdown=scene.onpointerup=scene.onpointerleave=scene.onpointercancel=null;stopPlayback();sfx.stopAll();overlay.hidden=true;app.inert=false;
      document.removeEventListener('keydown',key);resolve();
    };
    /* 능력 변화 확인: Shift 또는 버튼·HP 박스를 꾹 누르는 동안만 */
    const scene=$('scene'),peekOn=()=>scene.classList.add('peek'),peekOff=()=>scene.classList.remove('peek');
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Shift')peekOn();};
    const keyUp=e=>{if(e.key==='Shift')peekOff();};
    document.addEventListener('keydown',key);document.addEventListener('keyup',keyUp);window.addEventListener('blur',peekOff);
    const peekBtn=$('watch-peek');
    peekBtn.onpointerdown=e=>{e.preventDefault();peekOn();};peekBtn.onpointerup=peekBtn.onpointerleave=peekBtn.onpointercancel=peekOff;
    peekBtn.oncontextmenu=e=>e.preventDefault();
    let hold=0;
    scene.onpointerdown=e=>{if(!e.target.closest('.hpbox'))return;hold=setTimeout(peekOn,280);};
    scene.onpointerup=scene.onpointerleave=scene.onpointercancel=()=>{clearTimeout(hold);peekOff();};
    $('watch-close').onclick=close;
    $('watch-pause').onclick=()=>{const paused=setPaused(!isPaused());ambience.setPaused(paused);$('watch-pause').textContent=paused?'▶ 재개':'⏸ 일시정지';};
    const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    playBattleLog(match.log,{p1:{name:safe(match.trainerName),agency:safe(match.agencyName),sprite:spriteUrl(spriteName({id:match.trainerId||match.aId}))},p2:{name:safe(match.gymName),agency:safe(match.opponentAgency || '체육관 관장'),sprite:spriteUrl(match.gymId&&!match.eventName?match.gymId:spriteName({id:match.bId}))}})
      .then(()=>{if(!closed){ambience.finish();$('watch-title').textContent=match.eventName ? `${match.trainerName} vs ${match.gymName} · ${match.draw?'무승부 · 추첨으로 진출 결정':(match.won?match.trainerName:match.gymName)+' 승리'}` : `${match.trainerName} · ${match.won?'관장전 승리':'관장전 패배'}${match.firstWin?' · 배지 획득':''}`;$('watch-close').textContent='결과 확인 · 닫기';}})
      .catch(()=>{if(!closed){ambience.finish();$('watch-title').textContent='관전 표시를 완료하지 못했습니다. 경기 결과는 저장되어 있습니다.';$('watch-close').textContent='결과 확인 · 닫기';}});
  });
}
