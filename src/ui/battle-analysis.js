import { escapeHtml as esc } from './management-widgets.js';
export function renderBattleAnalysis(analysis) {
  if(!analysis) return '<p class="muted">이전 경기에는 판단 기록이 없습니다. 결과를 다시 계산하지 않습니다.</p>';
  const a=analysis;
  return `<details class="battle-analysis"><summary>경기 분석 · ${esc(a.policyName)}</summary><p>${esc(a.summary)}</p>
    <p>당시 최상위 평가 선택 ${a.counts.sound}회 · 검토할 선택 ${a.counts.concern}회 · 자발적 교체 ${a.counts.switches}회</p>
    <p>랭크업 ${a.counts.setup}회 · 회복 ${a.counts.heal}회 · 상태이상 ${a.counts.status}회 — 선택 횟수이며 성공 횟수는 아닙니다.</p>
    <p>${a.focusTurn===null?'집중력에 따른 판단 변동의 추가 확대는 기록되지 않았습니다.':`${a.focusTurn}턴부터 집중력에 따른 판단 변동이 커졌습니다.`} ${a.shockTurn===null?'':`${a.shockTurn}턴에 아군 기절 후 동요 상태가 있었습니다.`}</p>
    <p>${a.mentalAffected?`경기 시작 시 연패 페널티가 남아 있었습니다(최근 ${a.lossStreak}연패). 휴식이나 쉬운 상대와의 경기를 고려하세요.`:'경기 시작 시 남아 있는 연패 페널티는 없었습니다.'}</p>
    <ol>${a.observations.map(o=>`<li><b>${o.turn}턴</b> · ${esc(o.text)}</li>`).join('')||'<li>추가 검토 장면이 기록되지 않았습니다.</li>'}</ol><small class="muted">${esc(a.limitation)}</small></details>`;
}
