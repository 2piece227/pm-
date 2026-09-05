/**
 * 효과음 레이어 — **실제 게임 음원을 링크로 가져온다.**
 *
 * 스프라이트와 같은 방식이다 (파일을 이 저장소에 복제하지 않는다).
 *   - 공용 효과음: PokeRogue의 audio/se (hit / hit_strong / faint / low_hp …)
 *   - 기술별 음원: audio/battle_anims의 PRSFX-*.wav — 기술 JSON이 지정한 것
 *   - 울음소리: PokeAPI/cries. legacy(구형 합성음)가 BW 도트와 결이 맞는다
 *
 * 합성음은 **폴백으로만** 남겨뒀다. 네트워크가 없거나 파일을 못 받으면
 * 소리가 아예 안 나는 것보다 낫기 때문이다.
 *
 * 브라우저 자동재생 정책상 사용자 제스처 전에는 소리가 안 난다.
 * 아무 클릭에서나 unlock()이 한 번 불리도록 걸어둔다.
 */
import { seUrl, animSoundUrl, cryUrl } from '../data/battle-assets.js';

/**
 * 이름 → 실제 음원. 여기 있으면 파일을 쓰고, 못 받으면 합성으로 떨어진다.
 * PokeRogue audio/se의 파일명을 그대로 쓴다.
 */
export const SAMPLE_URLS = {
  hitWeak: seUrl('hit_weak'),
  hitNormal: seUrl('hit'),
  hitStrong: seUrl('hit_strong'),
  punch: seUrl('hit_strong'),
  slash: seUrl('hit'),
  bite: seUrl('hit'),
  crit: seUrl('crit_throw'),
  faint: seUrl('faint'),
  beam: seUrl('beam'),
  lowHp: seUrl('low_hp'),
  statUp: seUrl('charge'),
  win: seUrl('level_up_fanfare'),
  send: seUrl('pb_rel'),
};

let ctx = null;
let master = null;
let enabled = true;
let unlocked = false;
const buffers = new Map();

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
  return ctx;
}

/** 사용자 제스처에서 한 번 불러 오디오를 깨운다 */
export function unlock() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  unlocked = true;
}

export function setEnabled(v) { enabled = !!v; }
export function isEnabled() { return enabled; }
export function setVolume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); }

/** 페이지 어디든 첫 클릭/키입력에서 오디오를 깨운다 */
export function installUnlockHandler() {
  const once = () => { unlock(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

/* ---------------- 합성 기본 블록 ---------------- */

function envGain(t0, attack, hold, release, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(master);
  return g;
}

/** 톤 하나 (주파수 스윕 가능) */
function tone({ type = 'square', from, to = from, dur = 0.12, peak = 0.5, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = envGain(t0, 0.008, dur * 0.4, dur * 0.6, peak);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** 노이즈 버스트 (타격음의 몸통) */
function noise({ dur = 0.16, peak = 0.5, filterFrom = 3000, filterTo = 400, delay = 0, q = 1 }) {
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(filterFrom, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), t0 + dur);
  const g = envGain(t0, 0.005, dur * 0.3, dur * 0.7, peak);
  src.connect(f); f.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/* ---------------- 사운드 정의 ---------------- */

const SOUNDS = {
  /* 타격 계열 — 위력에 따라 세기가 갈린다 */
  hitWeak:   () => { noise({ dur: 0.11, peak: 0.32, filterFrom: 1800, filterTo: 300 }); },
  hitNormal: () => { noise({ dur: 0.16, peak: 0.5, filterFrom: 3200, filterTo: 350 });
                     tone({ type: 'square', from: 180, to: 70, dur: 0.1, peak: 0.22 }); },
  hitStrong: () => { noise({ dur: 0.26, peak: 0.7, filterFrom: 5200, filterTo: 200, q: 3 });
                     tone({ type: 'sawtooth', from: 240, to: 55, dur: 0.22, peak: 0.32 });
                     tone({ type: 'square', from: 90, to: 40, dur: 0.3, peak: 0.2, delay: 0.03 }); },

  slash:  () => { noise({ dur: 0.13, peak: 0.5, filterFrom: 7000, filterTo: 1600, q: 6 }); },
  bite:   () => { noise({ dur: 0.09, peak: 0.55, filterFrom: 1200, filterTo: 180 });
                  noise({ dur: 0.09, peak: 0.45, filterFrom: 1000, filterTo: 160, delay: 0.07 }); },
  punch:  () => { noise({ dur: 0.14, peak: 0.6, filterFrom: 2400, filterTo: 220 });
                  tone({ type: 'square', from: 130, to: 48, dur: 0.13, peak: 0.3 }); },

  /* 원거리 */
  beam:   () => { tone({ type: 'sawtooth', from: 620, to: 240, dur: 0.34, peak: 0.26 });
                  noise({ dur: 0.34, peak: 0.2, filterFrom: 2600, filterTo: 900, q: 4 }); },
  ball:   () => { tone({ type: 'triangle', from: 420, to: 760, dur: 0.24, peak: 0.28 }); },
  wind:   () => { noise({ dur: 0.3, peak: 0.3, filterFrom: 4200, filterTo: 1200, q: 8 }); },
  rocks:  () => { for (let i = 0; i < 3; i++) noise({ dur: 0.14, peak: 0.42, filterFrom: 1400, filterTo: 200, delay: i * 0.09 }); },
  quake:  () => { tone({ type: 'sine', from: 70, to: 32, dur: 0.55, peak: 0.55 });
                  noise({ dur: 0.5, peak: 0.34, filterFrom: 420, filterTo: 90 }); },
  meteor: () => { tone({ type: 'sawtooth', from: 900, to: 120, dur: 0.45, peak: 0.3 });
                  noise({ dur: 0.34, peak: 0.65, filterFrom: 5000, filterTo: 150, delay: 0.4, q: 3 }); },

  /* 상황 */
  superEffective: () => { tone({ type: 'square', from: 880, to: 1320, dur: 0.1, peak: 0.3 });
                          tone({ type: 'square', from: 1320, to: 1760, dur: 0.12, peak: 0.28, delay: 0.09 }); },
  resisted:       () => { tone({ type: 'sine', from: 300, to: 190, dur: 0.18, peak: 0.22 }); },
  immune:         () => { tone({ type: 'sine', from: 260, to: 130, dur: 0.26, peak: 0.2 }); },
  crit:           () => { tone({ type: 'square', from: 1400, to: 2000, dur: 0.07, peak: 0.32 });
                          noise({ dur: 0.2, peak: 0.5, filterFrom: 6000, filterTo: 500, delay: 0.05 }); },
  miss:           () => { noise({ dur: 0.2, peak: 0.26, filterFrom: 5000, filterTo: 2200, q: 7 }); },

  statUp:   () => { [520, 660, 830].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.09, peak: 0.24, delay: i * 0.06 })); },
  statDown: () => { [700, 540, 400].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.1, peak: 0.22, delay: i * 0.06 })); },
  heal:     () => { [520, 700, 880, 1050].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.11, peak: 0.22, delay: i * 0.05 })); },
  status:   () => { tone({ type: 'sawtooth', from: 300, to: 180, dur: 0.3, peak: 0.24 }); },

  send:     () => { tone({ type: 'square', from: 400, to: 700, dur: 0.13, peak: 0.26 }); },
  faint:    () => { tone({ type: 'square', from: 520, to: 90, dur: 0.6, peak: 0.34 }); },
  win:      () => { [660, 880, 990, 1320].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.16, peak: 0.3, delay: i * 0.12 })); },
  weather:  () => { noise({ dur: 0.7, peak: 0.2, filterFrom: 1800, filterTo: 500, q: 2 }); },
  ability:  () => { tone({ type: 'triangle', from: 740, to: 1100, dur: 0.16, peak: 0.26 }); },
};

/* ---------------- 재생 ---------------- */

const failed = new Set();

/** URL 하나를 받아 재생. 실패하면 false (호출부가 합성으로 떨어진다) */
async function playUrl(key, url, { volume = 1, pitch = 1 } = {}) {
  if (failed.has(key)) return false;
  try {
    if (!buffers.has(key)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(key);
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g); g.connect(master);
    src.start();
    return true;
  } catch {
    failed.add(key); // 한 번 실패한 건 다시 시도하지 않는다
    return false;
  }
}

/** 기술 JSON이 지정한 음원 (PRSFX- Flamethrower.wav 같은 이름) */
export function playAnimSound(resourceName, { volume = 100, pitch = 100 } = {}) {
  if (!enabled || !unlocked || !resourceName) return;
  if (!ensureCtx()) return;
  /* BG 트랙 같은 비음원 리소스는 건너뛴다 */
  if (!/\.(wav|m4a|mp3|ogg)$/i.test(resourceName)) return;
  playUrl('anim:' + resourceName, animSoundUrl(resourceName), {
    volume: Math.max(0, Math.min(1, volume / 100)),
    pitch: Math.max(0.5, Math.min(2, pitch / 100)),
  });
}

/** 포켓몬 울음소리 — 출전할 때 운다 */
export function playCry(dexNum) {
  if (!enabled || !unlocked || !dexNum) return;
  if (!ensureCtx()) return;
  const { url, fallback } = cryUrl(dexNum);
  playUrl('cry:' + dexNum, url, { volume: 0.85 }).then((ok) => {
    if (!ok) playUrl('cryx:' + dexNum, fallback, { volume: 0.85 });
  });
}

/**
 * 효과음 하나 재생. 이름이 없으면 조용히 무시한다.
 * @param {string} name SOUNDS의 키
 */
export function play(name) {
  if (!enabled || !unlocked) return;
  const c = ensureCtx();
  if (!c || c.state !== 'running') return;

  const synth = () => {
    const fn = SOUNDS[name];
    if (fn) { try { fn(); } catch { /* 오디오는 실패해도 배틀을 막지 않는다 */ } }
  };

  const url = SAMPLE_URLS[name];
  if (!url) { synth(); return; }
  /* 이미 받아둔 게 있으면 즉시, 없으면 받아보고 실패 시 합성 */
  playUrl(name, url).then((ok) => { if (!ok) synth(); });
}

/** 원형(archetype) → 타격음 이름 */
export function impactSoundFor(archetype, effectiveness) {
  if (effectiveness === 'super') return 'hitStrong';
  if (effectiveness === 'resisted') return 'hitWeak';
  switch (archetype) {
    case 'slash': return 'slash';
    case 'bite': return 'bite';
    case 'punch': return 'punch';
    case 'quake': return 'quake';
    case 'meteor': return 'meteor';
    case 'rocks': return 'rocks';
    default: return 'hitNormal';
  }
}

/** 원형 → 시전음 이름 (없으면 null) */
export function castSoundFor(archetype) {
  switch (archetype) {
    case 'beam': return 'beam';
    case 'ball': case 'drain': return 'ball';
    case 'wind': return 'wind';
    case 'rocks': return 'rocks';
    case 'meteor': return 'meteor';
    case 'selfBuff': return 'statUp';
    case 'heal': return 'heal';
    case 'status': return 'status';
    default: return null;
  }
}
