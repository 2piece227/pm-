import { createTrainerAI, runBattle, runBulk, makeRng } from './engine/run-battle.js';
import { TRAINERS, STAT_MAX } from './data/trainers.js';
import { STYLES, STAT_KO } from './data/styles.js';
import { TEAM_PRESETS } from './data/teams.js';
import { toKoreanLog } from './ui/protocol-ko.js';
import { spriteUrl, fallbackSvg, TYPE_FX } from './ui/sprites.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 슬라이더가 바꾸는 라이브 설정 — 시뮬 로직은 이 객체를 읽기만 한다 */
const cfg = {
  A: { ...TRAINERS.A, stats: { ...TRAINERS.A.stats } },
  B: { ...TRAINERS.B, stats: { ...TRAINERS.B.stats } },
};

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

/* ---------------- 배틀 화면 ---------------- */
const hpColor = (p) => (p > 50 ? 'var(--hp-hi)' : p > 20 ? 'var(--hp-md)' : 'var(--hp-lo)');
const shown = { p1: null, p2: null }; // 현재 그려진 종족 (교체 감지용)

function drawSprite(side, speciesName) {
  const el = $(`sp-${side}`);
  el.className = `spr ${side === 'p1' ? 'me' : 'foe'}`;
  shown[side] = speciesName;
  if (!speciesName) {
    el.innerHTML = '';
    return;
  }
  /* p1은 후면 도트라 별도 이미지다 — CSS로 좌우 반전하지 않는다 */
  const { url } = spriteUrl(speciesName, side);
  const img = document.createElement('img');
  img.src = url;
  img.alt = speciesName;
  img.onerror = () => { el.innerHTML = fallbackSvg(); };
  el.innerHTML = '';
  el.appendChild(img);
}

function drawHpBox(side, f, trainerName) {
  $(`hp-${side}`).innerHTML =
    `<div class="hpb-n"><span>${f.name}</span><em>Lv50 ${f.types}</em></div>` +
    `<div class="hpb-bar"><i style="width:${f.pct}%;background:${hpColor(f.pct)}"></i></div>` +
    `<div class="hpb-x"><span>${trainerName} · ${f.pct}%</span><b>${f.boosts || ''}</b></div>`;
}

function drawField(field, names) {
  for (const side of ['p1', 'p2']) {
    const f = field?.[side] || { name: '—', species: null, types: '', pct: 100, boosts: '' };
    if (f.species !== shown[side]) drawSprite(side, f.species);
    drawHpBox(side, f, names[side]);
  }
}

function fxText(side, text, color) {
  const d = document.createElement('div');
  d.className = 'fx';
  d.textContent = text;
  d.style.color = color || '#fff';
  d.style.left = side === 'p1' ? '18%' : '62%';
  d.style.top = side === 'p1' ? '62%' : '26%';
  $('scene').appendChild(d);
  setTimeout(() => d.remove(), 900);
}

function burst(side, color) {
  const d = document.createElement('div');
  d.className = 'burst';
  d.style.background = `radial-gradient(circle,${color} 0%,transparent 70%)`;
  d.style.width = '22%';
  d.style.paddingBottom = '22%';
  d.style.left = side === 'p1' ? '15%' : '58%';
  d.style.top = side === 'p1' ? '58%' : '18%';
  $('scene').appendChild(d);
  setTimeout(() => d.remove(), 460);
}

function say(text) {
  $('tbox').textContent = text;
}

function writeLine(line) {
  const d = document.createElement('div');
  d.className = line.cls || '';
  d.textContent = line.text;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

/** 한 줄의 anim 지시를 배틀 화면에 재생한다. speed=0이면 연출 없이 상태만 갱신. */
async function playAnim(anim, speed) {
  if (!anim || !speed) return;
  switch (anim.k) {
    case 'send':
      await wait(speed * 0.5);
      break;
    case 'move': {
      const el = $(`sp-${anim.side}`);
      el.classList.add(anim.side === 'p1' ? 'lunge-r' : 'lunge-l');
      await wait(speed * 0.28);
      el.classList.remove('lunge-r', 'lunge-l');
      if (anim.hit) {
        const t = $(`sp-${anim.hit}`);
        burst(anim.hit, TYPE_FX[anim.type] || '#fff');
        t.classList.add('hit', 'hurt');
        await wait(160);
        t.classList.remove('hurt');
        await wait(140);
        t.classList.remove('hit');
      }
      break;
    }
    case 'fx':
      fxText(anim.side, anim.text, anim.color);
      await wait(speed * 0.35);
      break;
    case 'faint':
      $(`sp-${anim.side}`).classList.add('dead');
      await wait(speed * 0.7);
      break;
    default:
      break;
  }
}

/* ---------------- 배틀 ---------------- */
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
  $('log').innerHTML = '';
  $('result-panel').style.display = 'none';
  shown.p1 = shown.p2 = null;
  drawSprite('p1', null);
  drawSprite('p2', null);

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

  const lines = toKoreanLog(result.log, names, result.think);
  const speed = Number($('speed').value);

  for (const line of lines) {
    writeLine(line);
    if (line.cls === 'l-think') continue; // 판단 근거는 로그에만
    if (line.field) drawField(line.field, names);
    say(line.text.trim());
    await playAnim(line.anim, speed);
    if (speed) await wait(line.cls === 'l-turn' ? speed * 0.3 : speed * 0.35);
  }

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
    `<div class="note" style="margin-top:6px">평균 <b>${r.avgTurns.toFixed(1)}턴</b> · ${N}회 · ${preset.label}` +
    ` <span style="opacity:.8">(목표 8~12턴 — SPEC §8-(1))</span></div>`;
}

$('btn-run').onclick = () =>
  play().catch((e) => {
    console.error(e);
    say('에러: ' + e.message);
    busy = false;
    $('btn-run').disabled = $('btn-bulk').disabled = false;
  });
$('btn-bulk').onclick = bulk;

/* 초기 화면 — 선봉 포켓몬을 미리 세워둔다 */
renderTrainers();
{
  const names = { p1: cfg.A.name, p2: cfg.B.name };
  drawField(
    {
      p1: { name: '화강돌', species: 'Spiritomb', types: '고스트·악', pct: 100, boosts: '' },
      p2: { name: '드래펄트', species: 'Dragapult', types: '드래곤·고스트', pct: 100, boosts: '' },
    },
    names
  );
}
writeLine({ cls: 'l-sub', text: '"배틀 시작"을 누르세요.' });
