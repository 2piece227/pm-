/**
 * 기술 애니메이션 재생기 — PokeRogue의 프레임 데이터를 그대로 돌린다.
 *
 * 데이터 구조 (실측):
 *   battle-anims/<kebab>.json 은 두 가지 형태로 온다
 *     · flat  : { id, graphic, frames, frameTimedEvents, position, hue }
 *     · keyed : { "0": <위와 같은 것>, "1": <같은 것> }   ← 시전자/대상 방향 변형
 *   frames        : 프레임그룹[] — 각 그룹은 그 순간 화면에 떠 있는 조각들의 배열
 *   조각          : { x, y, zoomX, zoomY, visible, graphicFrame, opacity, priority, target }
 *   frameTimedEvents : { "<프레임번호>": [ { resourceName, volume, pitch, eventType } ] }
 *   graphic       : images/battle_anims/<graphic>.png (RMXP 규격 5열 정사각 격자)
 *
 * 조각의 `target`은 그리는 대상이 아니라 **좌표 기준점**이다 (실측으로 확인):
 *   0 = 시전자 앵커  — 모든 기술에서 (0, 0)
 *   1 = 대상 앵커    — 모든 기술에서 (128, -64)
 *   2 = 실제 그림    — 위 두 점이 잡아주는 좌표계 안의 스프라이트
 * 즉 원본 데이터는 "시전자가 좌하단, 대상이 우상단"으로 그려져 있다. 0/1은 포켓몬
 * 스프라이트 자리를 표시하는 마커일 뿐이라 시트에서 그리면 안 된다.
 *
 * 그래서 두 앵커를 실제 포켓몬 스프라이트 위치에 맞춰 좌표계를 통째로 옮긴다.
 * 상대가 시전자면 두 점이 뒤집히므로 배율 부호가 음수가 되어 자연히 180° 돌아간다.
 * 데이터가 없는 기술은 호출부가 기존 CSS 연출로 떨어진다.
 */
import { animJsonUrl, animSheetUrl, cellSize, SHEET_COLUMNS, ANIM_SPACE, toKebab } from '../data/battle-assets.js';
import * as sfx from './sfx.js';

const jsonCache = new Map();   // kebab → 정의 | null(없음)
const sheetCache = new Map();  // graphic → HTMLImageElement | null

/** 원본 데이터가 가정하는 앵커 위치 (프레임에 앵커가 없을 때의 기본값) */
const DEFAULT_USER_ANCHOR = { x: 0, y: 0 };
const DEFAULT_TARGET_ANCHOR = { x: 128, y: -64 };

/** 조각의 `target` 값 */
const ANCHOR_USER = 0;
const ANCHOR_TARGET = 1;
const GRAPHIC = 2;

/**
 * 조각의 `focus` — 어느 앵커에 붙어 있는 그림인지. (anim.position이 기본값)
 * 좌표 자체는 어차피 같은 공간의 절대값이라, 두 앵커가 겹치는 자신 대상 기술에서만
 * 대상 기준 그림을 시전자 쪽으로 당겨줘야 한다. (예: 용의춤은 x가 128 근처다)
 */
const FOCUS_TARGET = 1;

/** 기술 애니메이션 정의를 받아온다. 없으면 null (호출부가 CSS 연출로 떨어진다) */
export async function loadAnim(moveName) {
  const key = toKebab(moveName);
  if (jsonCache.has(key)) return jsonCache.get(key);

  let result = null;
  try {
    const res = await fetch(animJsonUrl(moveName));
    if (res.ok) {
      const raw = await res.json();
      /* flat / keyed 두 형태를 모두 받는다 */
      const node = Array.isArray(raw.frames) ? raw : raw['0'] || raw[Object.keys(raw)[0]];
      if (node && Array.isArray(node.frames) && node.graphic) result = node;
    }
  } catch { /* 네트워크 실패는 조용히 폴백 */ }

  jsonCache.set(key, result);
  return result;
}

/** 스프라이트시트를 받아온다 */
function loadSheet(graphic) {
  if (sheetCache.has(graphic)) return sheetCache.get(graphic);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 캔버스에 그리려면 CORS 필요 (raw.githubusercontent는 * 허용)
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = animSheetUrl(graphic);
  });
  sheetCache.set(graphic, p);
  return p;
}

/** 씬 위에 덮는 캔버스를 준비한다 */
function ensureCanvas(scene) {
  let cv = scene.querySelector('canvas.fxcanvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.className = 'fxcanvas';
    scene.appendChild(cv);
  }
  const r = scene.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
  }
  return cv;
}

/** 포켓몬 스프라이트의 화면상 중심 (씬 기준 상대 좌표) */
function spriteCenter(scene, side, rect) {
  const el = scene.querySelector(`#sp-${side}`);
  if (!el) {
    /* 스프라이트를 못 찾으면 배틀 화면 표준 배치로 떨어진다 */
    const fx = side === 'p1' ? 0.26 : 0.68;
    const fy = side === 'p1' ? 0.62 : 0.26;
    return { x: fx * rect.width, y: fy * rect.height };
  }
  const b = el.getBoundingClientRect();
  return { x: b.left - rect.left + b.width / 2, y: b.top - rect.top + b.height / 2 };
}

/** 프레임 안의 앵커 조각을 찾는다 (없으면 원본 기본값) */
function anchorsOf(frame) {
  let user = null, target = null;
  for (const p of frame) {
    if (p.target === ANCHOR_USER && !user) user = p;
    else if (p.target === ANCHOR_TARGET && !target) target = p;
  }
  return {
    user: user || DEFAULT_USER_ANCHOR,
    target: target || DEFAULT_TARGET_ANCHOR,
  };
}

/**
 * 기술 애니메이션을 한 번 재생한다.
 *
 * @param {HTMLElement} scene    배틀 화면 컨테이너
 * @param {object} anim          loadAnim()이 돌려준 정의
 * @param {'p1'|'p2'} userSide   기술을 쓴 쪽
 * @param {'p1'|'p2'} targetSide 기술을 맞는 쪽
 * @param {number} frameMs       프레임 하나당 시간 (배속 반영해서 넘긴다)
 * @param {() => boolean} alive  재생 도중 중단 여부 (배틀이 바뀌면 멈춘다)
 */
export async function playMoveAnim(scene, anim, userSide, targetSide, frameMs, alive = () => true) {
  const sheet = await loadSheet(anim.graphic);
  if (!sheet || !alive()) return false;

  const cv = ensureCanvas(scene);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cell = cellSize(sheet.width);
  const rect = scene.getBoundingClientRect();
  const dpr = cv.width / Math.max(1, rect.width);

  /* 두 앵커를 실제 스프라이트 위치로 옮기는 배율. 시전자가 상대면 부호가 뒤집힌다.
     자신에게 쓰는 기술은 두 앵커가 겹쳐 배율이 0이 되므로, 방향만 반대편에서 빌려온다. */
  const other = userSide === 'p1' ? 'p2' : 'p1';
  const userPos = spriteCenter(scene, userSide, rect);
  const refPos = spriteCenter(scene, targetSide === userSide ? other : targetSide, rect);
  const base = anchorsOf(anim.frames[0] || []);
  const adx = (base.target.x ?? 128) - (base.user.x ?? 0);
  const ady = (base.target.y ?? -64) - (base.user.y ?? 0);
  const sx = adx ? (refPos.x - userPos.x) / adx : 1;
  const sy = ady ? (refPos.y - userPos.y) / ady : 1;

  /* 그림 자체의 크기는 화면 비율로 정한다 — 앵커 배율을 그대로 쓰면 가로로 늘어난다 */
  const mag = Math.min(rect.width / ANIM_SPACE.w, rect.height / ANIM_SPACE.h);
  const flip = sx < 0 ? -1 : 1;   // 상대가 시전자면 통째로 180° 돌린다
  const selfCast = targetSide === userSide;

  const events = anim.frameTimedEvents || {};

  for (let i = 0; i < anim.frames.length; i++) {
    if (!alive()) break;

    /* 이 프레임에 걸린 소리 */
    for (const ev of events[i] || []) {
      if (ev.eventType === 'AnimTimedSoundEvent' || ev.resourceName) {
        sfx.playAnimSound(ev.resourceName, { volume: ev.volume, pitch: ev.pitch });
      }
    }

    ctx.clearRect(0, 0, cv.width, cv.height);

    /* 앵커(0/1)는 포켓몬 자리 표시일 뿐이니 그리지 않는다. priority 낮은 것부터 깔린다 */
    const pieces = anim.frames[i]
      .filter((p) => p.target === GRAPHIC && p.visible !== false)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const anchor = anchorsOf(anim.frames[i]);
    const ox = userPos.x - (anchor.user.x ?? 0) * sx;
    const oy = userPos.y - (anchor.user.y ?? 0) * sy;

    for (const piece of pieces) {
      const gf = piece.graphicFrame ?? 0;
      const col = gf % SHEET_COLUMNS;
      const row = Math.floor(gf / SHEET_COLUMNS);
      if ((row + 1) * cell > sheet.height) continue;

      const w = cell * mag * ((piece.zoomX ?? 100) / 100);
      const h = cell * mag * ((piece.zoomY ?? 100) / 100);

      /* 자신에게 쓰는 기술은 대상 앵커가 시전자와 겹치므로 그만큼 당긴다 */
      const focus = piece.focus ?? anim.position ?? 0;
      const pull = selfCast && focus === FOCUS_TARGET;
      const px = (piece.x ?? 0) - (pull ? adx : 0);
      const py = (piece.y ?? 0) - (pull ? ady : 0);
      const cx = ox + px * sx;
      const cy = oy + py * sy;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (piece.opacity ?? 255) / 255));
      ctx.translate(cx * dpr, cy * dpr);
      ctx.scale(flip * (piece.mirror ? -1 : 1), flip);
      if (piece.angle) ctx.rotate((-piece.angle * Math.PI) / 180);
      ctx.drawImage(
        sheet, col * cell, row * cell, cell, cell,
        (-w / 2) * dpr, (-h / 2) * dpr, w * dpr, h * dpr
      );
      ctx.restore();
    }
    await new Promise((r) => setTimeout(r, frameMs));
  }

  ctx.clearRect(0, 0, cv.width, cv.height);
  return true;
}

/** 화면에 남은 이펙트를 지운다 */
export function clearMoveAnim(scene) {
  const cv = scene?.querySelector('canvas.fxcanvas');
  if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}
