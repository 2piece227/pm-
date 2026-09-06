/**
 * 효과음 레이어 — **실제 게임 음원만 쓴다.**
 *
 * 스프라이트와 같은 방식이다 (파일을 이 저장소에 복제하지 않는다).
 *   - 공용 효과음: PokeRogue의 audio/se (hit / hit_strong / faint / stat_up …)
 *   - 기술별 음원: audio/battle_anims의 PRSFX-*.wav — 기술 JSON이 프레임마다 지정한 것
 *   - 울음소리: PokeAPI/cries. legacy(구형 합성음)가 BW 도트와 결이 맞는다
 *
 * **합성음은 전부 걷어냈다.** 예전엔 못 받아오는 소리를 오실레이터로 만들어 메웠는데,
 * 공식 음원과 합성음이 겹쳐 나서 이질적이었다. 지금은 표에 있는 파일만 재생하고,
 * 없는 이름은 조용히 넘어간다.
 *
 * 실기에 없는 소리도 안 만든다:
 *   · 효과가 굉장/별로 → 별도 음이 아니라 **타격음의 세기**로 구분한다 (hit_weak/hit/hit_strong)
 *   · 급소 → hit_strong
 *   · 빗나감·날씨·특성 → 실기는 자막만 뜨고 전용 효과음이 없다
 *
 * 브라우저 자동재생 정책상 사용자 제스처 전에는 소리가 안 난다.
 * 아무 클릭에서나 unlock()이 한 번 불리도록 걸어둔다.
 */
import { seUrl, animSoundUrl, cryUrl } from '../data/battle-assets.js';

/**
 * 이름 → 실제 음원. **여기 없는 이름은 소리가 나지 않는다.**
 * PokeRogue audio/se의 파일명을 그대로 쓴다.
 */
export const SAMPLE_URLS = {
  hitWeak: seUrl('hit_weak'),     // 효과가 별로
  hitNormal: seUrl('hit'),        // 보통
  hitStrong: seUrl('hit_strong'), // 효과가 굉장 / 급소
  statUp: seUrl('stat_up'),
  statDown: seUrl('stat_down'),
  heal: seUrl('restore'),
  faint: seUrl('faint'),          // 쓰러질 때 미끄러져 내려가는 소리 (울음소리 뒤에 깔린다)
  lowHp: seUrl('low_hp'),         // HP가 빨간 구간에 들어갈 때
  send: seUrl('pb_rel'),
  win: seUrl('level_up_fanfare'),
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

/* ---------------- 재생 ---------------- */

const failed = new Set();   // 한 번 실패한 URL은 다시 시도하지 않는다
const playing = new Map();  // key → 지금 울리고 있는 소스

/**
 * URL 하나를 받아 재생.
 *
 * **같은 소리가 이미 울리고 있으면 끊고 다시 튼다.** 원본 데이터는 한 기술 안에서
 * 같은 음원을 음정만 바꿔 여러 번 부르는데(스톤샤워는 90/100/110으로 3번),
 * 그냥 겹쳐 틀면 1.8초짜리가 3겹으로 쌓여 **바람 소리 같은 웅웅거림**이 된다.
 * 끊고 다시 틀면 의도대로 "돌 세 개가 차례로 떨어지는" 소리가 된다.
 */
async function playUrl(key, url, { volume = 1, pitch = 1 } = {}) {
  if (failed.has(key)) return false;
  try {
    if (!buffers.has(key)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
    }
    const prev = playing.get(key);
    if (prev) { try { prev.stop(); } catch { /* 이미 끝났으면 무시 */ } }

    const src = ctx.createBufferSource();
    src.buffer = buffers.get(key);
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g); g.connect(master);
    src.onended = () => { if (playing.get(key) === src) playing.delete(key); };
    playing.set(key, src);
    src.start();
    return true;
  } catch {
    failed.add(key);
    return false;
  }
}

/** 재생 중인 소리를 전부 끊는다 (배틀을 닫거나 다시 시작할 때) */
export function stopAll() {
  for (const src of playing.values()) { try { src.stop(); } catch { /* 무시 */ } }
  playing.clear();
}

function ready() {
  if (!enabled || !unlocked) return false;
  const c = ensureCtx();
  return !!c && c.state === 'running';
}

/** 기술 JSON이 프레임에 지정한 음원 (PRSFX- Flamethrower.wav 같은 이름) */
export function playAnimSound(resourceName, { volume = 100, pitch = 100 } = {}) {
  if (!ready() || !resourceName) return;
  /* BGM 트랙 같은 비음원 리소스는 건너뛴다 */
  if (!/\.(wav|m4a|mp3|ogg)$/i.test(resourceName)) return;
  playUrl('anim:' + resourceName, animSoundUrl(resourceName), {
    volume: Math.max(0, Math.min(1, volume / 100)),
    pitch: Math.max(0.5, Math.min(2, pitch / 100)),
  });
}

/** 포켓몬 울음소리 — 출전할 때 운다 */
export function playCry(dexNum) {
  if (!ready() || !dexNum) return;
  const { url, fallback } = cryUrl(dexNum);
  playUrl('cry:' + dexNum, url, { volume: 0.85 }).then((ok) => {
    if (!ok) playUrl('cryx:' + dexNum, fallback, { volume: 0.85 });
  });
}

/**
 * 효과음 하나 재생. **SAMPLE_URLS에 없는 이름은 조용히 무시한다.**
 * @param {string} name SAMPLE_URLS의 키
 */
export function play(name) {
  if (!ready()) return;
  const url = SAMPLE_URLS[name];
  if (url) playUrl(name, url);
}

/**
 * 타격음 — 실기처럼 **효과 배율로만** 세기가 갈린다.
 * 급소는 강타격음을 쓴다 (실기에 전용 급소음이 없다).
 */
export function impactSoundFor(effectiveness, crit = false) {
  if (crit || effectiveness === 'super') return 'hitStrong';
  if (effectiveness === 'resisted') return 'hitWeak';
  return 'hitNormal';
}

/**
 * 시전음 — 기술 애니메이션이 있으면 그쪽 PRSFX가 울리므로 필요 없다.
 * 데이터가 없어 CSS 연출로 떨어진 기술에만 쓴다.
 */
export function castSoundFor(archetype) {
  switch (archetype) {
    case 'selfBuff': return 'statUp';
    case 'heal': case 'drain': return 'heal';
    default: return null;
  }
}
