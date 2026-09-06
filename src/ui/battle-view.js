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
import {
  canReadPixels, cropToContent, fallbackSvg, PADDED_SHIFT, spriteCandidates, TYPE_FX, REFERENCE_WIDTH,
} from './sprites.js';
import { ANIM_ALIAS, ARCHETYPE_TRAITS } from '../data/move-anim.js';
import * as sfx from './sfx.js';
import { loadAnim, playMoveAnim, clearMoveAnim } from './move-fx.js';
import { createSheetSprite, loadPokemonSheet, preloadSheets } from './sprite-anim.js';
import { dexNumOf } from './sprites.js';

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
export function stopPlayback() { runToken++; setPaused(false); }

/* ---------------- 일시정지 ---------------- */

let paused = false;
let resumeWaiters = [];

export function isPaused() { return paused; }

/** 일시정지 토글. 푸는 순간 기다리던 지점들이 한꺼번에 깨어난다 */
export function setPaused(v) {
  paused = !!v;
  if (!paused) { const w = resumeWaiters; resumeWaiters = []; for (const r of w) r(); }
  return paused;
}

/** 멈춰 있으면 풀릴 때까지 기다린다. 재생이 중단되면 그냥 빠져나간다 */
function gate(token) {
  if (!paused || token !== runToken) return null;
  return new Promise((r) => resumeWaiters.push(r));
}

/* ---------------- 스프라이트 ---------------- */

/* 늦게 도착한 로드 결과가 이미 바뀐 포켓몬을 덮어쓰지 않도록 세대를 센다 */
const spriteToken = { p1: 0, p2: 0 };
/* 돌아가고 있는 시트 재생기 (교체할 때 멈춰야 한다) */
const sheetSprite = { p1: null, p2: null };

export function drawSprite(side, speciesName) {
  const el = $(`sp-${side}`);
  el.className = `spr ${side === 'p1' ? 'me' : 'foe'}`;
  shown[side] = speciesName;

  /* 이전 포켓몬을 **즉시** 치운다. 새 그림을 기다리는 동안 남겨두면
     교체할 때 옛 도트가 잠깐 섞여 깜박이는 것처럼 보인다. */
  sheetSprite[side]?.stop();
  sheetSprite[side] = null;
  el.innerHTML = '';
  el.style.width = '';

  const myToken = ++spriteToken[side];
  if (!speciesName) return;

  /* BW 스프라이트는 종마다 덩치가 다르다. "픽셀당 배율"을 일정하게 유지해야
     실제 덩치 차이가 살아난다 (sprites.js의 REFERENCE_WIDTH 주석 참고) */
  const basePct = side === 'p1' ? 30 : 24;

  loadPokemonSheet(speciesName, side).then((sheet) => {
    if (myToken !== spriteToken[side]) return;
    if (sheet) {
      const player = createSheetSprite(sheet);
      sheetSprite[side] = player;
      el.innerHTML = '';
      el.appendChild(player.canvas);
      el.style.width = `${(basePct * sheet.w) / REFERENCE_WIDTH}%`;
      return;
    }
    /* 시트가 없는 종만 예전 GIF/PNG 경로로 떨어진다 */
    tryCandidates(el, side, myToken, speciesName, spriteCandidates(speciesName, side), 0, basePct);
  });
}

/** 후보를 위에서부터 하나씩 시도한다. 다 실패하면 실루엣 */
function tryCandidates(el, side, token, speciesName, cands, i, basePct) {
  if (token !== spriteToken[side]) return;
  if (i >= cands.length) {
    el.innerHTML = fallbackSvg();
    el.style.width = `${basePct}%`;
    return;
  }

  const { url, kind } = cands[i];
  const img = new Image();
  img.alt = speciesName;
  /* 여백 자르기와 얼음 상태 캡처에 캔버스를 쓰므로 CORS가 필요한데, 쇼다운 서버는
     허용 헤더를 안 보낸다. 거기에 crossOrigin을 붙이면 로드 자체가 실패한다. */
  if (canReadPixels(url)) img.crossOrigin = 'anonymous';
  img.onerror = () => tryCandidates(el, side, token, speciesName, cands, i + 1, basePct);
  img.onload = () => {
    if (token !== spriteToken[side]) return;
    if (!img.naturalWidth) { tryCandidates(el, side, token, speciesName, cands, i + 1, basePct); return; }

    /* 정지 PNG는 96x96 고정 캔버스라 여백이 붙어 있다. 잘라내야 잘린 GIF와 같은 잣대가 된다 */
    const cropped = kind === 'static' ? cropToContent(img) : null;
    const node = cropped || img;
    const padded = kind === 'static' && !cropped;   // 못 자른 경우 (쇼다운 소스)
    node.style.transform = padded ? `translateY(${PADDED_SHIFT[side]})` : '';

    el.innerHTML = '';
    el.appendChild(node);
    el.style.width = `${(basePct * (cropped ? cropped.width : img.naturalWidth)) / REFERENCE_WIDTH}%`;
  };
  img.src = url;
}

/* ---------------- HP 박스 (실기 배치) ---------------- */

const GENDER = { M: '<i class="g-m">♂</i>', F: '<i class="g-f">♀</i>' };

/**
 * 박스를 매번 innerHTML로 새로 그리면 바가 **지워졌다 다시 나타난다.**
 * 그래서 개체가 바뀔 때만 뼈대를 만들고, 그 뒤로는 폭만 굴려서 실기처럼 깎아 내린다.
 */
const hpBox = { p1: null, p2: null };

/** 실기의 바 감소 속도 — 가득 찬 바가 다 빠지는 데 걸리는 시간 */
const HP_DRAIN_FULL_MS = 1500;
const HP_DRAIN_MIN_MS = 140;
const HP_DRAIN_MAX_MS = 1300;

function buildHpBox(side, f) {
  const box = $(`hp-${side}`);
  box.innerHTML =
    '<div class="hpb-n"><span><b class="nm"></b><i class="st"></i></span><em class="lv"></em></div>' +
    '<div class="hpb-row"><span class="hplabel">HP</span>' +
    '<span class="hpb-bar"><i></i></span></div>' +
    '<div class="hpb-num"></div><div class="hpb-boost"></div>' +
    '<div class="hpb-balls"></div>';

  const st = {
    key: null,
    pct: f.pct ?? 100,
    cur: f.cur ?? null,
    raf: 0,
    nm: box.querySelector('.nm'),
    stat: box.querySelector('.st'),
    lv: box.querySelector('.lv'),
    bar: box.querySelector('.hpb-bar i'),
    num: box.querySelector('.hpb-num'),
    boost: box.querySelector('.hpb-boost'),
    balls: box.querySelector('.hpb-balls'),
    ballKey: '',
  };
  hpBox[side] = st;
  return st;
}

/** 바를 목표치까지 굴린다. 끝나면 resolve */
function tweenHp(side, st, f) {
  const from = st.pct;
  const to = Math.max(0, Math.min(100, f.pct ?? 0));
  const curFrom = st.cur;
  const curTo = f.cur ?? null;
  st.pct = to;
  st.cur = curTo;

  const paint = (pct, cur) => {
    st.bar.style.width = `${pct}%`;
    st.bar.style.background = hpColor(pct);
    /* 실기는 내 포켓몬만 실수치를 보여준다 */
    st.num.textContent = side === 'p1' && cur != null ? `${Math.round(cur)}/${f.max}` : '';
    st.num.style.display = st.num.textContent ? '' : 'none';
  };

  /* HP가 빨간 구간에 들어가는 순간 경고음 (실기의 삐- 소리) */
  if (from > 20 && to <= 20 && to > 0) sfx.play('lowHp');

  clearInterval(st.raf);
  const s = spd();
  const delta = Math.abs(to - from);
  const ms = s ? Math.min(HP_DRAIN_MAX_MS, Math.max(HP_DRAIN_MIN_MS, (delta / 100) * HP_DRAIN_FULL_MS)) / s : 0;
  if (!ms || delta < 0.4) { paint(to, curTo); return Promise.resolve(); }

  /* requestAnimationFrame은 탭이 가려지면 아예 안 돈다 — 재생이 통째로 멈춘다.
     타이머로 굴리면 백그라운드에서 느려질 뿐 멈추지는 않는다. */
  return new Promise((resolve) => {
    const t0 = performance.now();
    const done = () => { clearInterval(st.raf); st.raf = 0; resolve(); };
    st.raf = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const pct = from + (to - from) * k;
      const cur = curFrom != null && curTo != null ? curFrom + (curTo - curFrom) * k : curTo;
      paint(pct, cur);
      if (k >= 1) done();
    }, 16);
  });
}

function drawHpBox(side, f) {
  /* 이름·레벨·성별이 바뀌면 다른 개체다 — 뼈대부터 다시 만들고 바는 즉시 반영 */
  const key = `${f.name}|${f.level}|${f.gender || ''}`;
  let st = hpBox[side];
  if (!st || st.key !== key || !$(`hp-${side}`).querySelector('.hpb-bar i')) {
    st = buildHpBox(side, f);
    st.key = key;
    st.nm.innerHTML = `${f.name}${f.gender ? GENDER[f.gender] : ''}`;
    st.lv.textContent = `Lv${f.level}`;
  }

  st.stat.textContent = f.status || '';
  st.stat.style.display = f.status ? '' : 'none';
  st.boost.textContent = f.boosts || '';
  st.boost.style.display = f.boosts ? '' : 'none';

  /* 남은 포켓몬 수 — 실기처럼 몬스터볼 줄로 보여준다 */
  const total = f.total ?? 0;
  const left = f.left ?? total;
  const ballKey = `${left}/${total}`;
  if (st.ballKey !== ballKey) {
    st.ballKey = ballKey;
    st.balls.innerHTML = Array.from({ length: total },
      (_, i) => `<i class="${i < left ? '' : 'out'}"></i>`).join('');
    st.balls.style.display = total ? '' : 'none';
  }

  applyStatusLook(side, f.statusCode || null);
  return tweenHp(side, st, f);
}

/** 화면 구석의 트레이너 이름표. 이게 있어야 어느 쪽이 누구 포켓몬인지 한눈에 잡힌다 */
export function drawTrainers(names) {
  for (const side of ['p1', 'p2']) {
    const el = $(`tn-${side}`);
    if (!el) continue;
    const v = names?.[side];
    const name = typeof v === 'string' ? v : v?.name || '';
    const agency = typeof v === 'string' ? '' : v?.agency || '';
    el.innerHTML = name ? `<b>${name}</b>${agency ? `<em>${agency}</em>` : ''}` : '';
    el.style.display = name ? '' : 'none';
  }
}

/** 화면을 갱신한다. HP 바가 다 깎일 때까지 기다리려면 반환값을 await하면 된다 */
export function drawField(field, names) {
  const pending = [];
  for (const side of ['p1', 'p2']) {
    const f = field?.[side] || { name: '—', species: null, types: '', pct: 100, level: 50 };
    if (f.species !== shown[side]) drawSprite(side, f.species);
    pending.push(drawHpBox(side, f));
  }
  const w = field?.weather;
  const scene = $('scene');
  if (scene) scene.dataset.weather = w || '';
  return Promise.all(pending);
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

/* ---------------- 상태이상 ---------------- */

/**
 * 상태이상 → 실제 게임의 공통 애니메이션. 전용 음원이 딸려 있다.
 * 걸릴 때 한 번, 그리고 지속 피해가 들어올 때마다 매 턴 다시 돈다 (실기와 같다).
 */
const STATUS_ANIM = {
  brn: 'common-burn',
  psn: 'common-poison',
  tox: 'common-poison',
  par: 'common-paralysis',
  slp: 'common-sleep',
  frz: 'common-frozen',
};

/** 상태이상이 걸려 있는 동안 스프라이트에 계속 걸어두는 표시 */
const STATUS_CLASS = ['st-brn', 'st-psn', 'st-tox', 'st-par', 'st-slp', 'st-frz'];

function applyStatusLook(side, code) {
  const el = $(`sp-${side}`);
  if (!el) return;
  el.classList.remove(...STATUS_CLASS);
  if (code && STATUS_ANIM[code]) el.classList.add(`st-${code}`);
  freezeSprite(el, code === 'frz');
}

/**
 * 얼음 상태는 실기에서 **도트가 멈춘다.**
 * 시트 재생기는 그냥 세우면 되고, GIF는 재생을 못 세워서 지금 프레임을 캔버스에 떠서 바꿔 낀다.
 * (CORS가 막히면 색 보정만 남는다 — 그래도 얼어붙은 티는 난다)
 */
function freezeSprite(el, on) {
  const side = el.id === 'sp-p1' ? 'p1' : 'p2';
  if (sheetSprite[side]) { sheetSprite[side].setPaused(on); return; }

  const img = el.querySelector('img');
  const frozen = el.querySelector('canvas.frozen');
  if (!on) {
    if (frozen) frozen.remove();
    if (img) img.style.display = '';
    return;
  }
  if (frozen || !img) return;
  /* 아직 GIF가 안 내려왔으면 다 받은 뒤에 다시 시도한다 */
  if (!img.naturalWidth) {
    img.addEventListener('load', () => {
      if (el.classList.contains('st-frz')) freezeSprite(el, true);
    }, { once: true });
    return;
  }
  try {
    const cv = document.createElement('canvas');
    cv.className = 'frozen';
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    cv.style.width = '100%';
    cv.style.height = 'auto';
    el.appendChild(cv);
    img.style.display = 'none';
  } catch { /* 캔버스가 오염됐으면 색 보정만으로 간다 */ }
}

/* ---------------- 연출 재생 ---------------- */

/**
 * @param {object} anim  표시 지시
 * @param {number} token 재생 세대 (중단 감지)
 * @param {() => Promise<any>} [onImpact]
 *   **피격 순간**에 부를 화면 갱신. 데미지 줄은 이걸로 늦춰서, 이펙트가 맞는 시점과
 *   HP가 깎이는 시점을 맞춘다. (예전엔 자막 전에 이미 바가 줄어 있었다)
 */
async function playAnim(anim, token, onImpact) {
  const s = spd();
  if (!anim || !s) { await onImpact?.(); return; }
  const unit = 340 / s; // 1배속 기준 340ms
  let hpDone = null;

  switch (anim.k) {
    case 'send': {
      const el = $(`sp-${anim.side}`);
      sfx.play('send');
      sfx.playCry(dexNumOf(anim.species));
      el.classList.remove('dead');
      el.classList.add('enter');
      await wait(unit * 0.9);
      el.classList.remove('enter');
      break;
    }

    case 'move': {
      const el = $(`sp-${anim.side}`);
      const color = TYPE_FX[anim.type] || '#fff';

      /* 실제 게임 기술 애니메이션이 있으면 그걸 쓴다. 없는 기술만 아래 CSS 연출로 떨어진다. */
      const animName = anim.moveEn ? (ANIM_ALIAS[anim.moveEn] || anim.moveEn) : null;
      const realAnim = animName ? await loadAnim(animName) : null;
      if (realAnim && anim.target) {
        const myToken = runToken;
        /* 시전 모션은 그대로 두고(몸이 움직여야 자연스럽다) 그 위에 이펙트를 얹는다.
           단, 원본 데이터가 스프라이트를 직접 몰고 있으면(바디프레스처럼) 겹치면 안 된다 */
        const lunge = realAnim.drivesUser ? null : ARCHETYPE_TRAITS[anim.archetype]?.approach;
        if (lunge === 'lunge') {
          el.classList.add(anim.side === 'p1' ? 'lunge-r' : 'lunge-l');
          setTimeout(() => el.classList.remove('lunge-r', 'lunge-l'), Math.max(90, unit * 0.4));
        } else if (lunge === 'cast') {
          el.classList.add('cast');
          setTimeout(() => el.classList.remove('cast'), Math.max(90, unit * 0.4));
        }
        await playMoveAnim(sceneEl(), realAnim, anim.side, anim.target, Math.max(16, 46 / spd()), () => myToken === runToken);
        if (anim.missed) break;
        if (anim.hit) {
          const t = $(`sp-${anim.hit}`);
          sfx.play(sfx.impactSoundFor(anim.eff, anim.crit));
          hpDone = onImpact?.();      // 맞는 순간부터 바가 깎이기 시작한다
          t.classList.add('hit', 'hurt');
          await wait(Math.max(80, unit * 0.3));
          t.classList.remove('hurt');
          await wait(Math.max(70, unit * 0.24));
          t.classList.remove('hit');
        }
        await hpDone;                 // 바가 다 내려간 뒤에 다음 줄로 넘어간다
        break;
      }

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

      if (anim.missed) break;

      /* --- 피격 --- */
      if (anim.hit) {
        const t = $(`sp-${anim.hit}`);
        const times = tr.repeat || 1;
        sfx.play(sfx.impactSoundFor(anim.eff, anim.crit));
        hpDone = onImpact?.();        // 맞는 순간부터 바가 깎이기 시작한다

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
        if (tr.siphon) { rising(anim.side, '#5ad06a'); sfx.play('heal'); }
      }
      await hpDone;                   // 바가 다 내려간 뒤에 다음 줄로 넘어간다
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
      /* 실기는 자막으로 알리므로 화면에선 가볍게 반짝이기만 한다 (전용 효과음 없음) */
      const el = $(`sp-${anim.side}`);
      el.classList.add('glow');
      await wait(unit * 0.8);
      el.classList.remove('glow');
      break;
    }

    case 'weather':
      screenFlash('rgba(200,180,120,.35)', unit * 0.6);
      await wait(unit * 0.5);
      break;

    case 'win':
      sfx.play('win');
      await wait(unit * 0.6);
      break;

    case 'faint': {
      const el = $(`sp-${anim.side}`);
      /* 실기는 쓰러질 때 그 포켓몬이 운다. 미끄러져 내려가는 소리는 그 뒤에 깔린다 */
      sfx.playCry(dexNumOf(anim.species));
      setTimeout(() => sfx.play('faint'), Math.max(60, unit * 0.2));
      applyStatusLook(anim.side, null);
      el.classList.add('dead');
      await wait(unit * 1.1);
      break;
    }

    case 'status': {
      const name = STATUS_ANIM[anim.status];
      const common = name ? await loadAnim(name) : null;
      if (common) {
        const myToken = runToken;
        await playMoveAnim(sceneEl(), common, anim.side, anim.side, Math.max(16, 46 / spd()), () => myToken === runToken);
      } else {
        fxText(anim.side, anim.text, '#d8a0e8');
        await wait(unit * 0.5);
      }
      break;
    }

    default:
      break;
  }
}

export function resetScene() {
  stopPlayback();
  clearMoveAnim($('scene'));
  shown.p1 = null;
  shown.p2 = null;
  sfx.stopAll();
  for (const side of ['p1', 'p2']) {
    sheetSprite[side]?.stop();
    sheetSprite[side] = null;
    if (hpBox[side]) clearInterval(hpBox[side].raf);
    hpBox[side] = null;
    const b = $(`hp-${side}`);
    if (b) b.innerHTML = '';
    applyStatusLook(side, null);
  }
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
  setPaused(false);
  drawTrainers(names);

  /* 프로토콜 앞머리의 |poke| 줄로 양 팀 전원을 미리 받아둔다.
     안 그러면 첫 교체 때마다 그림이 늦게 붙어 빈 칸이 보인다 */
  preloadSheets([...new Set(protocolLog
    .filter((l) => typeof l === 'string' && l.startsWith('|poke|'))
    .map((l) => (l.split('|')[3] || '').split(',')[0].trim())
    .filter(Boolean))]);

  const lines = toKoreanLog(protocolLog, names, think);

  for (const line of lines) {
    if (token !== runToken) return; // 중단됨
    await gate(token);              // 일시정지
    if (token !== runToken) return;
    writeLine(line);
    if (line.cls === 'l-think') continue;

    /* 데미지가 들어가는 줄은 **이펙트가 맞는 순간**에 화면을 갱신한다.
       예전엔 자막이 뜨기도 전에 HP가 줄어 있어서 순서가 어긋나 보였다. */
    let applied = false;
    const apply = line.field ? () => { applied = true; return drawField(line.field, names); } : null;
    const deferred = !!(apply && line.anim?.k === 'move' && line.anim.hit);
    if (apply && !deferred) apply();

    const s = spd();
    if (line.msg) await typeMessage(line.msg, token);
    await playAnim(line.anim, token, deferred ? apply : null);
    if (apply && !applied) await apply(); // 연출이 없거나 중단된 경우의 안전망

    if (s) {
      /* 다 찍힌 자막을 읽을 시간. 실기의 "다음으로 넘기기" 대기에 해당 */
      const dwell = line.msg ? 520 / s : 150 / s;
      await wait(dwell);
    }
  }
}
