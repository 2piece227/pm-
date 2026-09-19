import { internationalSeason } from '../engine/international.js';
import { PWT, INTERNATIONAL_REGIONS, pwtBreak } from '../data/international.js';
import { escapeHtml as esc, gameDate } from './management-widgets.js';

export function renderInternational(game){
  const current=internationalSeason(game),offset=(current.season-1)*365;
  const regionName=id=>INTERNATIONAL_REGIONS.find(r=>r.id===id)?.name||id;
  const roster=game.league.agencies.find(a=>a.id===game.playerAgencyId).roster;
  return `<section class="card"><h3>Road to PWT · 세계 대표 선발</h3>
  <p>관장 예선 ${gameDate(offset+PWT.gymDay)} → 파이널 예선 ${gameDate(offset+PWT.finalQualifierDay)} → 스위스 ${gameDate(offset+PWT.swissDays[0])} → 결승 ${gameDate(offset+PWT.knockoutDays.at(-1))}</p>
  <p>각 지역: 관장 예선 2명 + 사천왕 4명 중 3명 선발, 챔피언 자동 출전. 8지역 32명, 스위스 3승 진출·3패 탈락 후 16강. 국제 경기는 레벨 ${PWT.level}로 맞추며 등록 파티·기술·특성·도구를 고정합니다.</p>
  <p class="muted">관동·성도 관장은 기존 진심 파티를 사용합니다. 아직 이름이 확정되지 않은 사천왕·챔피언과 타 지역 선수는 생성 대표입니다. PWT는 현직 관장·사천왕·챔피언의 지역 대표 선발전입니다.</p>
  <p>${pwtBreak(game)?'PWT 기간: 공식 체육관 도전 휴회. 기존 도전 지시는 휴회 종료 후 재개됩니다.':'공식 체육관은 PWT 기간에 휴회합니다.'}</p>
  <label>관동·성도 경기 진행<select id="pwt-watch-mode"><option value="results" ${current.watchMode==='results'?'selected':''}>결과만 보기</option><option value="watch" ${current.watchMode==='watch'?'selected':''}>지역 경기 자동 관전</option></select></label>
  ${pwtBreak(game)?`<h4>유스 경기 분석 견학</h4>${roster.filter(t=>t.isYouth&&!t.camp).map(t=>`<p>${esc(t.name)} <button data-pwt-study="${t.id}">${game.actions[t.id]==='pwt-study'?'✓ 오늘 견학 배정됨':'오늘 경기 분석 견학 배정'}</button></p>`).join('')||'<p>견학 가능한 유스가 없습니다.</p>'}`:''}
  ${[...game.international.seasons].reverse().map(s=>{
    const name=id=>esc(s.entrants.find(t=>t.id===id)?.name||id);
    return `<details class="card" ${s.season===current.season?'open':''}><summary>${s.name} · ${s.status==='missed'?'지난 예선 · 다음 시즌부터 참가':s.stage}</summary>
    ${s.status==='knockout'?`<h4>다음 경기 · ${s.bracket.length===2?'결승':s.bracket.length+'강'}</h4>${s.bracket.filter((_,i)=>i%2===0).map((id,i)=>`<p>${name(id)} vs ${name(s.bracket[i*2+1])}</p>`).join('')}`:''}
    ${s.result?`<h4>${name(s.result.championId)} 우승</h4><p>PWC 자동 진출 · ${regionName(s.result.region)} 기본 시드 4장 유지 + 우승자 1명. 기본 시드와 중복되면 차순위 승계 대상입니다.</p>`:''}
    ${s.qualifiers.map(q=>`<details><summary>${regionName(q.region)} 대표 선발</summary><p>관장 예선 통과: ${q.gymIds.map(name).join(', ')} · 결승 없이 2명 선발</p><p>챔피언 자동 출전: ${name(q.championId)}</p>${q.groups.map((g,i)=>`<p>${i?'B':'A'}조: ${g.order.map(id=>`${name(id)} ${g.wins[id]}승`).join(' / ')}${g.tieBreak?' · '+g.tieBreak:''}</p>`).join('')}<p>파이널 예선 통과: ${q.qualified.map(name).join(', ')||'대기'}</p></details>`).join('')}
    ${Object.keys(s.swiss).length?`<details ${s.status==='swiss'?'open':''}><summary>스위스 순위 · ${s.qualified.length||'미확정'}명 통과</summary>${Object.entries(s.swiss).sort((a,b)=>b[1].wins-a[1].wins||a[1].losses-b[1].losses).map(([id,r])=>`<p>${name(id)} · ${r.wins}승 ${r.losses}패 · ${r.wins===3?'16강 진출':r.losses===3?'탈락':'진행 중'}</p>`).join('')}</details>`:''}
    <details><summary>대진 · 경기 기록 (${s.matches.length})</summary>${s.matches.map(m=>`<article class="card"><p>${gameDate(m.day)} · ${m.stage} · ${esc(m.trainerName)} vs ${esc(m.gymName)}</p><p>${name(m.winnerId)} 승리${m.draw?' · 배틀 무승부, 추첨 결정':''}</p>${m.log?`<button data-cup-watch="${m.id}">${s.viewed.includes(m.id)?'다시 관전':'저장된 경기 관전'}</button>`:'<small>타 지역 예선 · 결과 기록</small>'}</article>`).join('')||'<p>아직 열린 경기가 없습니다.</p>'}</details></details>`;
  }).join('')}</section>`;
}
export function wireInternational(root,game,refresh){
  const mode=root.querySelector('#pwt-watch-mode');
  if(mode)mode.onchange=()=>{internationalSeason(game).watchMode=mode.value==='watch'?'watch':'results';refresh();};
  root.querySelectorAll('[data-pwt-study]').forEach(b=>b.onclick=()=>{
    const t=game.league.agencies.find(a=>a.id===game.playerAgencyId).roster.find(t=>t.id===b.dataset.pwtStudy);
    if(pwtBreak(game)&&t?.isYouth&&!t.camp){game.actions[t.id]='pwt-study';refresh();}
  });
}
