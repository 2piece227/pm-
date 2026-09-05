/**
 * 배틀 관전 화면 — 실기(5세대) 배틀 화면을 최대한 따라간다. (SPEC §7.3)
 *
 * 실기와 맞춘 것:
 *   - 자막 박스: 2줄, 타자기 효과, 다 찍힌 뒤 읽을 시간을 준다
 *   - HP 박스: 이름 + 성별 + Lv + "HP" 라벨 바, 내 쪽만 실수치(202/202) 노출
 *   - 상태이상 배지 (잠듦/화상/독…)
 *   - 기술 연출: 물리는 돌진, 특수는 날아가는 탄, 타입별 색/모양
 *
 * 배속은 매 프레임 다시 읽는다 — 재생 도중에 바꿔도 즉시 먹는다.
 */
import { toKoreanLog } from './protocol-ko.js';
import { spriteUrl, fallbackSvg, TYPE_FX, REFERENCE_WIDTH } from './sprites.js';
import { ARCHETYPE_TRAITS } from '../data/move-anim.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const hpColor = (p) => (p > 50 ? 'var(--hp-hi)' : p > 20 ? 'var(--hp-md)' : 'var(--hp-lo)');
const shown = { p1: null, p2: null };

/* 배속 — 함수로 들고 있어야 재생 중 변경이 반영된다 */
let speedGetter = () => 1;
export function setSpeedSource(fn) { speedGetter = fn; }
const spd = () => {
  const v = Number(speedGetter());
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/* 재생 중단 신호 (닫기/새 배틀) */
let runToken = 0;
export function stopPlayback() { runToken++; }

/* ---------------- 스프라이트 ---------------- */

export function drawSprite(side, speciesName) {
  const el = $(`sp-${side}`);
  el.className = `spr ${side === 'p1' ? 'me' : 'foe'}`;
  shown[side] = speciesName;
  if (!speciesName) {
    el.innerHTML = '';
    el.style.width = '';
    return;
  }

  const { url, fallback } = spriteUrl(speciesName, side);
  const img = document.createElement('img');
  img.alt = speciesName;

  /* BW 애니메이션 GIF는 내용에 맞게 잘려 있어 종마다 크기가 다르다.
     "픽셀당 배율"을 일정하게 유지해야 실제 덩치 차이가 살아난다. */
  const basePct = side === 'p1' ? 30 : 24;
  img.onload = () => {
    if (img.naturalWidth) el.style.width = `${(basePct * img.naturalWidth) / REFERENCE_WIDTH}%`;
  };
  let triedFallback = false;
  img.onerror = () => {
    if (!triedFallback && fallback) { triedFallback = true; img.src = fallback; return; }
    el.innerHTML = fallbackSvg();
    el.style.width = `${basePct}%`;
  };
  img.src = url;

  el.innerHTML = '';
  el.appendChild(img);
}

/* ---------------- HP 박스 (실기 배치) ---------------- */

const GENDER = { M: '<i class="g-m">♂</i>', F: '<i class="g-f">♀</i>' };

function drawHpBox(side, f) {
  const gender = f.gender ? GENDER[f.gender] : '';
  const status = f.status ? `<i class="st">${f.status}</i>` : '';
  /* 실기는 내 포켓몬만 실수치를 보여준다 */
  const numbers = side === 'p1' && f.cur != null
    ? `<div class="hpb-num">${f.cur}/${f.max}</div>` : '';

  $(`hp-${side}`).innerHTML =
    `<div class="hpb-n"><span>${f.name}${gender}${status}</span><em>Lv${f.level}</em></div>` +
    `<div class="hpb-row"><span class="hplabel">HP</span>` +
    `<span class="hpb-bar"><i style="width:${f.pct}%;background:${hpColor(f.pct)}"></i></span></div>` +
    numbers +
    (f.boosts ? `<div class="hpb-boost">${f.boosts}</div>` : '');
}

export function drawField(field, names) {
  for (const side of ['p1', 'p2']) {
    const f = field?.[side] || { name: '—', species: null, types: '', pct: 100, level: 50 };
    if (f.species !== shown[side]) drawSprite(side, f.species);
    drawHpBox(side, f);
  }
  const w = field?.weather;
  const scene = $('scene');
  if (scene) scene.dataset.weather = w || '';
}

/* ---------------- 자막 박스 ---------------- */

let typing = 0;

/** 타자기 효과로 자막을 찍는다. 실기처럼 한 글자씩. */
async function typeMessage(text, token) {
  const box = $('tbox');
  if (!box) return;
  const myTurn = ++typing;
  const lines = String(text).split('\n');
  box.innerHTML = lines.map(() => '<div class="tline"></div>').join('');
  const els = [...box.querySelectorAll('.tline')];

  const s = spd();
  if (!s) { els.forEach((el, i) => { el.textContent = lines[i]; }); return; }

  const perChar = Math.max(6, 26 / s);
  for (let li = 0; li < lines.length; li++) {
    for (let ci = 0; ci < lines[li].length; ci++) {
      if (myTurn !== typing || token !== runToken) return;
      els[li].textContent = lines[li].slice(0, ci + 1);
      await wait(perChar);
    }
  }
}

export function say(text) {
  const box = $('tbox');
  if (!box) return;
  typing++;
  box.innerHTML = String(text).split('\n').map((l) => `<div class="tline">${l}</div>`).join('');
}

/* ---------------- 이펙트 ---------------- */

/** 타입별 연출 계열 — 실기 이펙트를 CSS로 근사한다 (외부 에셋 없음) */
const BEAM_TYPES = new Set(['fire', 'water', 'electric', 'ice', 'grass', 'psychic', 'dragon', 'dark', 'ghost', 'poison', 'fairy']);

function sceneEl() { return $('scene'); }

function spawn(cls, style, life) {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, style);
  sceneEl().appendChild(d);
  setTimeout(() => d.remove(), life);
  return d;
}

function fxText(side, text, color) {
  spawn('fx', {
    color: color || '#fff',
    left: side === 'p1' ? '18%' : '62%',
    top: side === 'p1' ? '58%' : '22%',
  }, 900).textContent = text;
}

/** 피격 지점 폭발 */
function burst(side, color) {
  spawn('burst', {
    background: `radial-gradient(circle,${color} 0%,${color}66 40%,transparent 70%)`,
    width: '26%', paddingBottom: '26%',
    left: side === 'p1' ? '13%' : '56%',
    top: side === 'p1' ? '54%' : '14%',
  }, 460);
}

/** 튀는 입자들 */
function particles(side, color, n = 8) {
  const cx = side === 'p1' ? 26 : 68;
  const cy = side === 'p1' ? 66 : 26;
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 12 + Math.random() * 14;
    const p = spawn('particle', {
      background: color,
      left: `${cx}%`, top: `${cy}%`,
      '--dx': `${Math.cos(ang) * dist}%`,
      '--dy': `${Math.sin(ang) * dist}%`,
      animationDelay: `${i * 12}ms`,
    }, 620);
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}%`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist}%`);
  }
}

/** 시전자 → 대상으로 날아가는 탄 (특수기 계열) */
async function projectile(from, to, color, ms) {
  const startX = from === 'p1' ? 24 : 68;
  const startY = from === 'p1' ? 62 : 24;
  const endX = to === 'p1' ? 24 : 68;
  const endY = to === 'p1' ? 62 : 24;
  const p = spawn('proj', {
    background: `radial-gradient(circle,#fff 0%,${color} 45%,transparent 72%)`,
    left: `${startX}%`, top: `${startY}%`,
  }, ms + 120);
  p.style.setProperty('--tx', `${endX - startX}%`);
  p.style.setProperty('--ty', `${endY - startY}%`);
  p.style.animationDuration = `${ms}ms`;
  await wait(ms);
}

/** 광선 — 시전자에서 대상까지 뻗는다 */
async function beam(from, to, color, ms) {
  const x1 = from === 'p1' ? 26 : 66, y1 = from === 'p1' ? 62 : 26;
  const x2 = to === 'p1' ? 26 : 66, y2 = to === 'p1' ? 62 : 26;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy * 0.5);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const b = spawn('beamfx', {
    left: `${x1}%`, top: `${y1}%`, width: `${len}%`,
    background: `linear-gradient(90deg, ${color}, #fff, ${color})`,
    transform: `rotate(${ang}deg)`,
  }, ms + 150);
  b.style.animationDuration = `${ms}ms`;
  await wait(ms * 0.8);
}

/** 위에서 떨어지는 것들 (바위·용성군) */
async function falling(to, color, count, ms, big = false) {
  const cx = to === 'p1' ? 24 : 66;
  const cy = to === 'p1' ? 58 : 20;
  for (let i = 0; i < count; i++) {
    const d = spawn(big ? 'meteorfx' : 'rockfx', {
      left: `${cx + (Math.random() * 14 - 7)}%`,
      top: '-12%',
      background: big ? `radial-gradient(circle,#fff,${color})` : color,
      animationDelay: `${i * (ms / (count + 1))}ms`,
    }, ms + 500);
    d.style.setProperty('--fall', `${cy + 14}%`);
    d.style.animationDuration = `${ms}ms`;
  }
  await wait(ms * 0.85);
}

/** 베는 자국 / 물어뜯기 자국 */
function mark(side, kind, color) {
  const cx = side === 'p1' ? 20 : 62;
  const cy = side === 'p1' ? 54 : 15;
  spawn(kind === 'bite' ? 'bitemark' : 'slashmark', {
    left: `${cx}%`, top: `${cy}%`, borderColor: color,
  }, 430);
}

/** 상대를 감싸는 고리 (상태이상기) */
async function ring(to, color, ms) {
  const cx = to === 'p1' ? 24 : 66;
  const cy = to === 'p1' ? 62 : 24;
  const r = spawn('ringfx', { left: `${cx}%`, top: `${cy}%`, borderColor: color }, ms + 250);
  r.style.animationDuration = `${ms}ms`;
  await wait(ms * 0.8);
}

/** 자신에게서 피어오르는 빛 (강화·회복) */
function rising(side, color) {
  const cx = side === 'p1' ? 24 : 66;
  const cy = side === 'p1' ? 62 : 26;
  for (let i = 0; i < 7; i++) {
    spawn('risefx', {
      left: `${cx + (Math.random() * 12 - 6)}%`, top: `${cy}%`,
      background: color, animationDelay: `${i * 55}ms`,
    }, 950);
  }
}

/** 지면 충격파 (지진) */
function groundWave(color, ms) {
  const d = spawn('gwave', { background: color }, ms + 250);
  d.style.animationDuration = `${ms}ms`;
}

/** 화면 흔들기 */
function shakeScreen(ms) {
  const s = sceneEl();
  s.classList.add('quaking');
  setTimeout(() => s.classList.remove('quaking'), ms + 150);
}

/** 바람 베기 호 */
async function slashArc(to, color, ms) {
  const cx = to === 'p1' ? 22 : 64;
  const cy = to === 'p1' ? 56 : 16;
  const a = spawn('arcfx', { left: `${cx}%`, top: `${cy}%`, borderColor: color }, ms + 250);
  a.style.animationDuration = `${ms}ms`;
  await wait(ms * 0.7);
}

/** 화면 전체 플래시 (강한 기술) */
function screenFlash(color, ms) {
  const d = spawn('flash', { background: color }, ms);
  d.style.animationDuration = `${ms}ms`;
}

/* ---------------- 로그 ---------------- */

export function writeLine(line) {
  const d = document.createElement('div');
  d.className = line.cls || '';
  d.textContent = line.text;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

export function clearLog() { $('log').innerHTML = ''; }

/* ---------------- 연출 재생 ---------------- */

async function playAnim(anim, token) {
  const s = spd();
  if (!anim || !s) return;
  const unit = 340 / s; // 1배속 기준 340ms

  switch (anim.k) {
    case 'send': {
      const el = $(`sp-${anim.side}`);
      sfx.play('send');
      el.classList.remove('dead');
      el.classList.add('enter');
      await wait(unit * 0.9);
      el.classList.remove('enter');
      break;
    }

    case 'move': {
      const el = $(`sp-${anim.side}`);
      const color = TYPE_FX[anim.type] || '#fff';
      const tr = ARCHETYPE_TRAITS[anim.archetype] || ARCHETYPE_TRAITS.contact;
      const fx = tr.color || color;

      /* --- 시전 동작: 원형마다 다르다 --- */
      const cast = sfx.castSoundFor(anim.archetype);
      if (cast) sfx.play(cast);

      if (tr.approach === 'cast') {
        el.classList.add('cast');
        await wait(unit * 0.4);
        el.classList.remove('cast');
      } else if (tr.approach === 'stomp') {
        el.classList.add('stomp');
        await wait(unit * 0.45);
        el.classList.remove('stomp');
      } else if (tr.approach === 'none') {
        el.classList.add('glow');
        if (tr.rise) rising(anim.side, fx);
        await wait(unit * 0.7);
        el.classList.remove('glow');
      } else {
        el.classList.add(anim.side === 'p1' ? 'lunge-r' : 'lunge-l');
        await wait(unit * 0.4);
        el.classList.remove('lunge-r', 'lunge-l');
      }

      /* --- 투사체 / 낙하물 / 고리 --- */
      if (anim.target) {
        if (tr.projectile === 'beam') await beam(anim.side, anim.target, fx, unit * 0.6);
        else if (tr.projectile === 'ball') await projectile(anim.side, anim.target, fx, unit * 0.7);
        else if (tr.projectile === 'wind') await slashArc(anim.target, fx, unit * 0.5);
        else if (tr.drop === 'rocks') await falling(anim.target, fx, 4, unit * 0.6);
        else if (tr.drop === 'meteor') await falling(anim.target, fx, 1, unit * 0.7, true);
        else if (tr.ring) await ring(anim.target, fx, unit * 0.6);
      }

      if (anim.missed) { sfx.play('miss'); break; }

      /* --- 피격 --- */
      if (anim.hit) {
        const t = $(`sp-${anim.hit}`);
        const times = tr.repeat || 1;
        if (anim.crit) sfx.play('crit');
        sfx.play(sfx.impactSoundFor(anim.archetype, anim.eff));

        for (let i = 0; i < times; i++) {
          burst(anim.hit, fx);
          particles(anim.hit, fx, tr.shake === 'strong' ? 11 : 7);
          if (tr.mark) mark(anim.hit, tr.mark, fx);
          if (tr.flash) screenFlash(fx, unit * 0.28);
          if (tr.shake === 'screen') shakeScreen(unit * 0.5);
          if (tr.ground) groundWave(fx, unit * 0.6);
          t.classList.add('hit', 'hurt');
          await wait(Math.max(80, unit * 0.3));
          t.classList.remove('hurt');
          await wait(Math.max(70, unit * 0.24));
          t.classList.remove('hit');
          if (i < times - 1) await wait(Math.max(60, unit * 0.18));
        }
        if (anim.eff === 'super') sfx.play('superEffective');
        else if (anim.eff === 'resisted') sfx.play('resisted');
        if (tr.siphon) { rising(anim.side, '#5ad06a'); sfx.play('heal'); }
      }
      break;
    }

    case 'fx':
      fxText(anim.side, anim.text, anim.color);
      if (/▲/.test(anim.text)) sfx.play('statUp');
      else if (/▼/.test(anim.text)) sfx.play('statDown');
      else if (anim.text.startsWith('+')) sfx.play('heal');
      await wait(unit * 0.5);
      break;

    case 'ability': {
      /* 실기는 자막으로 알리므로 화면에선 가볍게 반짝이기만 한다 */
      const el = $(`sp-${anim.side}`);
      sfx.play('ability');
      el.classList.add('glow');
      await wait(unit * 0.8);
      el.classList.remove('glow');
      break;
    }

    case 'weather':
      sfx.play('weather');
      screenFlash('rgba(200,180,120,.35)', unit * 0.6);
      await wait(unit * 0.5);
      break;

    case 'faint': {
      const el = $(`sp-${anim.side}`);
      sfx.play('faint');
      el.classList.add('dead');
      await wait(unit * 1.1);
      break;
    }

    default:
      break;
  }
}

export function resetScene() {
  stopPlayback();
  shown.p1 = null;
  shown.p2 = null;
  drawSprite('p1', null);
  drawSprite('p2', null);
  clearLog();
  say('');
}

/**
 * 프로토콜 로그 하나를 처음부터 끝까지 재생한다.
 * 배속은 매 단계 다시 읽으므로 재생 중 변경이 즉시 반영된다.
 */
export async function playBattleLog(protocolLog, names, think = []) {
  const token = ++runToken;
  const lines = toKoreanLog(protocolLog, names, think);

  for (const line of lines) {
    if (token !== runToken) return; // 중단됨
    writeLine(line);
    if (line.cls === 'l-think') continue;
    if (line.field) drawField(line.field, names);

    const s = spd();
    if (line.msg) await typeMessage(line.msg, token);
    await playAnim(line.anim, token);

    if (s) {
      /* 다 찍힌 자막을 읽을 시간. 실기의 "다음으로 넘기기" 대기에 해당 */
      const dwell = line.msg ? 520 / s : 150 / s;
      await wait(dwell);
    }
  }
}
