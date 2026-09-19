import { renderInternational, wireInternational } from './international.js';
import { ensureSeason, seasonDate, registerCup, cupEligible } from '../engine/season.js';
import { regionalRanking } from '../engine/regional-ranking.js';
import { SEASON, SEASON_PHASES, RANKING, CUP_SCHEDULE } from '../data/season.js';
import { escapeHtml as esc, gameDate } from './management-widgets.js';
import { renderBattleAnalysis } from './battle-analysis.js';
import { ko, SPECIES_KO } from '../data/ko.js';

export function renderCupReport(game,id){
  const e=game.competitions?.events.find(e=>e.id===id);if(!e)return '';
  return `<section class="card"><h3>${e.name}</h3><p>${e.status==='cancelled'?'참가자 부족으로 취소':`${esc(e.entrants.find(x=>x.id===e.result?.championId)?.name)} 우승 · ${esc(e.entrants.find(x=>x.id===e.result?.runnerId)?.name)} 준우승`}</p><button data-nav="schedule">전체 대진 · 스카우팅 보고서</button>${e.matches.filter(m=>e.entrants.some(x=>x.agencyId===game.playerAgencyId&&[m.aId,m.bId].includes(x.id))).map(m=>`<p>${esc(m.trainerName)} vs ${esc(m.gymName)} · ${esc(e.entrants.find(x=>x.id===m.winnerId)?.name)} 진출</p><button data-cup-watch="${m.id}">저장된 경기 관전</button>${renderBattleAnalysis(m.analysis)}`).join('')}${(e.scouting||[]).filter(s=>e.entrants.find(x=>x.id===s.trainerId)?.agencyId===game.playerAgencyId).map(s=>`<p>${esc(s.name)} · ${s.growth.map(g=>`${ko(SPECIES_KO,g.species)} 경험치 +${g.experience} · Lv.${g.before}→${g.level}`).join(' / ')}</p>`).join('')}</section>`;
}

export function renderSeason(game){
  const {year,phase}=seasonDate(game.day),events=[...ensureSeason(game).events].sort((a,b)=>a.date-b.date);
  const roster=game.league.agencies.find(a=>a.id===game.playerAgencyId).roster;
  return `<section class="card"><h2>제${year}시즌 · ${phase.name}</h2><p>유스컵은 8배지 미만 유스, 시티컵은 등록 프로, 로컬컵은 유스·프로가 출전합니다. 현재 파티는 최대 6마리입니다. 개최일에는 탐험·체육관 대신 대회에 참가하며, 경기마다 HP·PP·상태가 초기화됩니다. 파티는 개최일에 확정됩니다.</p><p class="muted">등록 마감은 전날입니다. 관전하지 않아도 하루 진행 시 결과가 계산됩니다. 대회별 상금과 참가 자격을 확인하세요. 2명 미만이면 취소합니다.</p>
  <details><summary>연간 계획 보기 · 날짜는 임시 편성</summary>${SEASON_PHASES.map(p=>`<p>${gameDate((year-1)*SEASON.days+p.start)} · ${p.name}${p.implemented?' · 운영 중':' · 계획만 표시, 아직 미개최'}</p>`).join('')}</details>
  ${renderInternational(game)}${renderRegionalRanking(game)}
  ${events.filter(e=>e.season<=year&&e.status==='scheduled').map(e=>`<article class="card"><h3>${e.name}</h3><p>${e.kind==='youth'?'8배지 미만 유스':e.kind==='city'?'등록 프로 · 챔피언·사천왕 제외':'오픈 · 우승해도 프로 승격/리그 진출권 없음'} · 우승 ${SEASON.prize*(e.prizeMultiplier??1)} / 준우승 ${SEASON.runnerPrize*(e.prizeMultiplier??1)}${e.ranking?' · 지역 순위 반영':''}</p><p>개최 ${gameDate(e.date)} (${e.date}일차) · 접수 ${gameDate(e.openDay)}–${gameDate(e.deadline)} · 최대 ${e.capacity}명</p><label>우리 경기 진행<select data-cup-mode="${e.id}"><option value="results" ${e.watchMode!=='watch'?'selected':''}>결과만 보기</option><option value="watch" ${e.watchMode==='watch'?'selected':''}>우리 경기 관전</option></select></label>${roster.map(t=>`<div class="assignment"><span>${esc(t.name)} · ${cupEligible(t,e)?`${t.party.length}마리`:'참가 자격 없음'}</span><button data-cup-register="${e.id}" data-trainer="${t.id}" data-remove="${e.registrations.includes(t.id)}" ${game.day<e.openDay||game.day>e.deadline||(!e.registrations.includes(t.id)&&!cupEligible(t,e))?'disabled':''}>${e.registrations.includes(t.id)?'등록 취소':'참가 등록'}</button></div>`).join('')||'<p>참가할 트레이너가 없어도 결과와 스카우팅 보고서를 볼 수 있습니다.</p>'}</article>`).join('')}
  <p role="status" id="cup-message"></p><h3>대회 기록</h3>
  ${events.filter(e=>e.status!=='scheduled').reverse().map(e=>`<details class="card"><summary>${e.name} · ${e.date}일차 · ${e.status==='cancelled'?'참가자 부족 취소':`${esc(e.entrants.find(x=>x.id===e.result?.championId)?.name)} 우승`}</summary>
  ${e.matches.map(m=>`<div class="card"><p>${m.round}라운드 · ${esc(m.trainerName)} (${esc(m.agencyName)}) vs ${esc(m.gymName)} (${esc(m.opponentAgency)})</p><b>${esc(e.entrants.find(x=>x.id===m.winnerId)?.name)} 진출${m.draw?' · 배틀 무승부, 추첨 결정':''}</b> <button data-cup-watch="${m.id}">${e.viewed.includes(m.id)?'다시 관전':'저장된 경기 관전'}</button>${renderBattleAnalysis(m.analysis)}</div>`).join('')}
  <h4>스카우팅 관찰 보고서</h4>${(e.scouting||[]).map(s=>`<p><b>${esc(s.name)} · ${esc(s.agencyName)}</b><br>${esc(s.text)}</p>`).join('')}</details>`).join('')||'<p class="muted">아직 완료된 대회가 없습니다.</p>'}</section>`;
}
export function wireSeason(root,game,refresh,watch){
  wireInternational(root,game,refresh);
  root.querySelectorAll('[data-cup-mode]').forEach(b=>b.onchange=()=>{const e=game.competitions.events.find(e=>e.id===b.dataset.cupMode);if(e?.status==='scheduled'){e.watchMode=b.value==='watch'?'watch':'results';refresh();}});
  root.querySelectorAll('[data-cup-register]').forEach(b=>b.onclick=()=>{
    const r=registerCup(game,b.dataset.cupRegister,b.dataset.trainer,b.dataset.remove==='true');
    if(r.ok)refresh();else root.querySelector('#cup-message').textContent=r.msg;
  });
  root.querySelectorAll('[data-cup-watch]').forEach(b=>b.onclick=()=>watch(b.dataset.cupWatch));
}

export function renderRegionalRanking(game){
  const rows=regionalRanking(game);
  return `<section class="card"><h3>관동·성도 지역 종합 순위</h3><p>공식 프로 맞대결 레이팅 + 대회 성적 + 최근 폼 − 장기 미출전 보정. 로컬컵 가중치${CUP_SCHEDULE.find(c=>c.kind==='local').weight*100}%, 마지막 시티컵 성적${Math.round(RANKING.lastCityMultiplier*100)}%. 공식전 ${RANKING.minMatches}경기 미만은 잠정 순위입니다. 시즌 중 순위는 달라질 수 있으며, 조건 충족만으로 지역 리그 진출이 확정되지는 않습니다.</p>${rows.map((r,i)=>`<article class="assignment ranking-row"><b>${i+1}. ${esc(r.name)}</b><span>${r.score.toFixed(1)}점 · 레이팅 ${r.rating.toFixed(0)} · 대회 ${r.points.toFixed(1)}점 · 공식 ${r.matches}전 ${r.wins}승 / 시티 ${r.cityMatches}전 · ${r.provisional?'잠정':r.challengerEligible?'도전자 기본 조건 충족':'조건 미충족'}</span></article>`).join('')||'<p>아직 순위에 반영할 공식 대회가 없습니다.</p>'}</section>`;
}
