import { createTrainerAI, runBattle, runBulk, makeRng } from './engine/run-battle.js';
import { TRAINERS, STAT_MAX } from './data/trainers.js';
import { STYLES, STAT_KO } from './data/styles.js';
import { TEAM_PRESETS } from './data/teams.js';
import { drawField, playBattleLog, resetScene, say, writeLine } from './ui/battle-view.js';
import { initLeagueView } from './ui/league-view.js';

const $ = (id) => document.getElementById(id);

/* 슬라이더가 바꾸는 라이브 설정 — 시뮬 로직은 이 객체를 읽기만 한다 */
const cfg = {
  A: { ...TRAINERS.A, stats: { ...TRAINERS.A.stats } },
  B: { ...TRAINERS.B, stats: { ...TRAINERS.B.stats } },
};

/* ---------------- 탭 ---------------- */
function initTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach((btn) => {
    btn.onclick = () => {
      tabs.forEach((b) => b.classList.toggle('on', b === btn));
      const target = btn.dataset.tab;
      document.querySelectorAll('[data-panel]').forEach((p) => {
        p.style.display = p.dataset.panel === target ? '' : 'none';
      });
    };
  });
}

/* ---------------- 트레이너 패널 ---------------- */
function renderTrainers() {
  $('trainers').innerHTML = ['A', 'B']
    .map((k) => {
      const t = cfg[k];
      const rows = Object.keys(STAT_KO)
        .map(
          (s) =>
            `<div class="stat"><b>${STAT_KO[s]}</b>` +
            `<input type="range" min="1" max="${STAT_MAX}" value="${t.stats[s]}" data-t="${k}" data-s="${s}">` +
            `<span id="v-${k}-${s}">${t.stats[s]}</span></div>`
        )
        .join('');
      const sel =
        `<select id="sty-${k}">` +
        Object.keys(STYLES)
          .map((o) => `<option${o === t.style ? ' selected' : ''}>${o}</option>`)
          .join('') +
        '</select>';
      return `<div class="tcard"><div class="tname">${t.name}${sel}</div>${rows}</div>`;
    })
    .join('');

  $('trainers')
    .querySelectorAll('input[type=range]')
    .forEach((i) => {
      i.oninput = () => {
        cfg[i.dataset.t].stats[i.dataset.s] = Number(i.value);
        $(`v-${i.dataset.t}-${i.dataset.s}`).textContent = i.value;
      };
    });
}

/* ---------------- 배틀 시뮬 탭 ---------------- */
function buildAIs() {
  return {
    A: createTrainerAI(cfg.A, $('sty-A').value, makeRng(Date.now() & 0xffff)),
    B: createTrainerAI(cfg.B, $('sty-B').value, makeRng((Date.now() >> 3) & 0xffff)),
  };
}

let busy = false;

async function play() {
  if (busy) return;
  busy = true;
  $('btn-run').disabled = $('btn-bulk').disabled = true;
  resetScene();
  $('result-panel').style.display = 'none';

  const preset = TEAM_PRESETS[$('preset').value];
  const { A, B } = buildAIs();
  const names = { p1: cfg.A.name, p2: cfg.B.name };

  const result = runBattle({
    trainerA: A,
    trainerB: B,
    teamA: preset.A,
    teamB: preset.B,
    collectThink: $('think').checked,
  });

  await playBattleLog(result.log, names, Number($('speed').value), result.think);

  const winnerName = result.winner ? names[result.winner] : null;
  say(winnerName ? `▶ ${winnerName} 승리! (${result.turns}턴)` : `무승부 (${result.turns}턴)`);

  busy = false;
  $('btn-run').disabled = $('btn-bulk').disabled = false;
}

function bulk() {
  if (busy) return;
  const N = 200;
  const preset = TEAM_PRESETS[$('preset').value];
  const { A, B } = buildAIs();
  const r = runBulk({ trainerA: A, trainerB: B, teamA: preset.A, teamB: preset.B, count: N, seed: 1 });
  const pct = (n) => ((n / N) * 100).toFixed(1);

  $('result-panel').style.display = '';
  $('result').innerHTML =
    '<table>' +
    '<tr><th>트레이너</th><th>승</th><th>승률</th><th>기점기 쓴 배틀</th><th>교체/배틀</th></tr>' +
    `<tr><td>${cfg.A.name} (${$('sty-A').value})</td><td class="n">${r.p1}</td><td class="n">${pct(r.p1)}%</td>` +
    `<td class="n">${pct(r.battlesWithSetup.p1)}%</td><td class="n">${(r.switches.p1 / N).toFixed(2)}</td></tr>` +
    `<tr><td>${cfg.B.name} (${$('sty-B').value})</td><td class="n">${r.p2}</td><td class="n">${pct(r.p2)}%</td>` +
    `<td class="n">${pct(r.battlesWithSetup.p2)}%</td><td class="n">${(r.switches.p2 / N).toFixed(2)}</td></tr>` +
    (r.draw ? `<tr><td>무승부</td><td class="n">${r.draw}</td><td class="n">${pct(r.draw)}%</td><td></td><td></td></tr>` : '') +
    '</table>' +
    `<div class="note" style="margin-top:6px">평균 <b>${r.avgTurns.toFixed(1)}턴</b> · ${N}회 · ${preset.label}</div>`;
}

$('btn-run').onclick = () =>
  play().catch((e) => {
    console.error(e);
    say('에러: ' + e.message);
    busy = false;
    $('btn-run').disabled = $('btn-bulk').disabled = false;
  });
$('btn-bulk').onclick = bulk;

/* ---------------- 초기화 ---------------- */
initTabs();
renderTrainers();
drawField(
  {
    p1: { name: '화강돌', species: 'Spiritomb', types: '고스트·악', pct: 100, boosts: '' },
    p2: { name: '드래펄트', species: 'Dragapult', types: '드래곤·고스트', pct: 100, boosts: '' },
  },
  { p1: cfg.A.name, p2: cfg.B.name }
);
writeLine({ cls: 'l-sub', text: '"배틀 시작"을 누르세요.' });
initLeagueView();
