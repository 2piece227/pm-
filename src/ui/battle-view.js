/**
 * 배틀 관전 화면 — 표시 레이어. (SPEC §7.3)
 *
 * 배틀 시뮬 탭과 리그 탭이 **같은 관전 화면을 공유**한다.
 * 시뮬 로직은 여기를 전혀 모르고, 프로토콜 로그만 넘겨받아 재생한다 (§0.1-3).
 */
import { toKoreanLog } from './protocol-ko.js';
import { spriteUrl, fallbackSvg, TYPE_FX, REFERENCE_WIDTH } from './sprites.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const hpColor = (p) => (p > 50 ? 'var(--hp-hi)' : p > 20 ? 'var(--hp-md)' : 'var(--hp-lo)');
const shown = { p1: null, p2: null }; // 현재 그려진 종족 (교체 감지용)

export function drawSprite(side, speciesName) {
  const el = $(`sp-${side}`);
  el.className = `spr ${side === 'p1' ? 'me' : 'foe'}`;
  shown[side] = speciesName;
  if (!speciesName) {
    el.innerHTML = '';
    el.style.width = '';
    return;
  }

  /* p1은 뒷모습이라 별도 이미지다 — CSS로 좌우 반전하지 않는다 */
  const { url, fallback } = spriteUrl(speciesName, side);
  const img = document.createElement('img');
  img.alt = speciesName;

  /* BW 애니메이션 GIF는 내용에 맞게 잘려 있어 종마다 크기가 다르다.
     전부 같은 폭으로 늘리면 덩치 차이가 뭉개지므로, "픽셀당 배율"을 일정하게 유지한다.
     (리자몽 87px / 해피너스 61px → 화면에서도 그 비율 그대로) */
  const basePct = side === 'p1' ? 30 : 24;
  img.onload = () => {
    if (!img.naturalWidth) return;
    el.style.width = `${(basePct * img.naturalWidth) / REFERENCE_WIDTH}%`;
  };

  /* 5세대 이후 종은 BW 폴더에 없다 → showdown 폴더로, 그것도 없으면 실루엣 */
  let triedFallback = false;
  img.onerror = () => {
    if (!triedFallback && fallback) {
      triedFallback = true;
      img.src = fallback;
      return;
    }
    el.innerHTML = fallbackSvg();
    el.style.width = `${basePct}%`;
  };
  img.src = url;

  el.innerHTML = '';
  el.appendChild(img);
}

/** 특성 발동 팝업 — 쇼다운처럼 화면에 박스를 띄운다 (에셋 없이 순수 UI) */
function abilityPopup(side, mon, ability) {
  const d = document.createElement('div');
  d.className = `abilitybox ${side === 'p1' ? 'me' : 'foe'}`;
  d.innerHTML = `<b>${ability}</b><em>${mon}</em>`;
  $('scene').appendChild(d);
  setTimeout(() => d.remove(), 1600);
}

function drawHpBox(side, f, trainerName) {
  $(`hp-${side}`).innerHTML =
    `<div class="hpb-n"><span>${f.name}</span><em>Lv50 ${f.types}</em></div>` +
    `<div class="hpb-bar"><i style="width:${f.pct}%;background:${hpColor(f.pct)}"></i></div>` +
    `<div class="hpb-x"><span>${trainerName} · ${f.pct}%</span><b>${f.boosts || ''}</b></div>`;
}

export function drawField(field, names) {
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

export function say(text) {
  $('tbox').textContent = text;
}

export function writeLine(line) {
  const d = document.createElement('div');
  d.className = line.cls || '';
  d.textContent = line.text;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

export function clearLog() {
  $('log').innerHTML = '';
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
    case 'ability':
      abilityPopup(anim.side, anim.mon, anim.ability);
      await wait(speed * 0.8);
      break;
    case 'faint':
      $(`sp-${anim.side}`).classList.add('dead');
      await wait(speed * 0.7);
      break;
    default:
      break;
  }
}

/** 화면을 배틀 시작 전 상태로 */
export function resetScene() {
  shown.p1 = null;
  shown.p2 = null;
  drawSprite('p1', null);
  drawSprite('p2', null);
  clearLog();
}

/**
 * 프로토콜 로그 하나를 처음부터 끝까지 재생한다.
 * @param {string[]} protocolLog @pkmn/sim의 battle.log
 * @param {{p1:string,p2:string}} names 트레이너 표시 이름
 * @param {number} speed 0이면 즉시(로그만)
 * @param {Array} think 판단 근거 (선택)
 */
export async function playBattleLog(protocolLog, names, speed, think = []) {
  const lines = toKoreanLog(protocolLog, names, think);
  for (const line of lines) {
    writeLine(line);
    if (line.cls === 'l-think') continue; // 판단 근거는 로그에만
    if (line.field) drawField(line.field, names);
    say(line.text.trim());
    await playAnim(line.anim, speed);
    if (speed) await wait(line.cls === 'l-turn' ? speed * 0.3 : speed * 0.35);
  }
}
