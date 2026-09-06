/**
 * 포켓몬 스프라이트 시트 재생기 — **모든 종을 움직이는 BW 도트로 통일한다.**
 *
 * 왜 시트인가:
 *   PokeAPI의 BW 애니메이션 GIF는 5세대까지만 있다. 그 뒤 세대는 정지컷밖에 없어서
 *   움직이는 애와 안 움직이는 애가 섞였다. 포켓로그 에셋에는 **커뮤니티가 BW 그림체로 그린
 *   애니메이션 시트**가 최신 세대까지 들어 있다 (이미 기술 이펙트·효과음으로 쓰는 그 저장소다).
 *   실측: 풀 53종 x 앞뒤 106장 중 98장이 애니메이션, 4종만 정지컷.
 *
 * 아틀라스가 두 형태로 온다:
 *   · TexturePacker : { textures: [ { image, size, frames: [...] } ] }
 *   · Aseprite      : { frames: [...], meta: { image, size } }   ← 프레임마다 duration이 있다
 *
 * 프레임 간격 (실측으로 잡았다):
 *   기본 폴더 시트는 원본 GIF 프레임을 **2개씩 늘려놨다.**
 *     한카리아스 GIF 90프레임 7.2초 ↔ 시트 160항목 → 항목당 45ms
 *     리자몽     GIF 72프레임 7.3초 ↔ 시트 144항목 → 항목당 51ms
 *     해피너스   GIF 47프레임 4.7초 ↔ 시트  96항목 → 항목당 49ms
 *   → 50ms(20fps)로 두면 원본과 길이가 맞는다.
 *   exp 폴더는 1:1이다 (더시마사리 GIF 87프레임 ↔ exp 87항목) → 100ms.
 *   아틀라스가 duration을 직접 적어놨으면 그걸 쓴다.
 *
 * 파일은 링크로만 가져온다. 출처·라이선스는 CREDITS.md 참고.
 */
import { Dex } from '@pkmn/dex';

export const SHEET_REPO = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta/images/pokemon';
const REPO = SHEET_REPO;

export const BASE_FRAME_MS = 50;
export const EXP_FRAME_MS = 100;

const cache = new Map();   // `${species}|${side}` → 시트 | null

/** 종족명 → 파일명 조각. 폼이 있으면 `645-therian` */
function stemOf(sp) {
  const forme = sp.forme ? `-${sp.forme.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `${sp.num}${forme}`;
}

/** 아틀라스 JSON을 공통 형태로 편다 */
export function parseAtlas(raw, defaultMs) {
  const node = raw?.textures?.[0] || raw;
  const list = node?.frames;
  if (!Array.isArray(list) || !list.length) return null;

  /* 시트 좌표계에서 실제로 그려지는 범위만 잘라 쓴다.
     sourceSize가 내용보다 큰 시트가 있어서(두드리짱 150x136) 그대로 쓰면 덩치가 과장된다 */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of list) {
    const o = f.spriteSourceSize || { x: 0, y: 0 };
    x0 = Math.min(x0, o.x);
    y0 = Math.min(y0, o.y);
    x1 = Math.max(x1, o.x + f.frame.w);
    y1 = Math.max(y1, o.y + f.frame.h);
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  return {
    w,
    h,
    frames: list.map((f) => {
      const o = f.spriteSourceSize || { x: 0, y: 0 };
      return {
        sx: f.frame.x, sy: f.frame.y, sw: f.frame.w, sh: f.frame.h,
        dx: o.x - x0, dy: o.y - y0,
        ms: f.duration || defaultMs,
      };
    }),
  };
}

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';   // raw.githubusercontent는 * 허용
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

async function fetchSheet(path, defaultMs) {
  try {
    const r = await fetch(`${REPO}/${path}.json`);
    if (!r.ok) return null;
    const atlas = parseAtlas(await r.json(), defaultMs);
    if (!atlas) return null;
    const img = await loadImage(`${REPO}/${path}.png`);
    if (!img) return null;
    return { ...atlas, img };
  } catch {
    return null;   // 네트워크 실패는 호출부가 폴백한다
  }
}

/**
 * 시도할 시트 경로를 순서대로. `[경로, 기본 프레임간격]`
 *
 * 기본 폴더에 애니메이션이 있으면 그게 게임 원본이라 우선하고, 없으면 exp 폴더
 * (커뮤니티가 BW 그림체로 그린 최신 세대)를 쓴다. 폼 전용 그림이 없으면 기본 종까지 훑는다.
 */
export function sheetPaths(species, side) {
  const sp = species && Dex.species.get(species);
  if (!sp || !sp.exists) return [];
  const dir = side === 'p1' ? 'back/' : '';
  const base = sp.baseSpecies && sp.baseSpecies !== sp.name ? Dex.species.get(sp.baseSpecies) : null;
  const stems = base ? [stemOf(sp), stemOf(base)] : [stemOf(sp)];
  const out = [];
  for (const stem of stems) {
    out.push([`${dir}${stem}`, BASE_FRAME_MS]);
    out.push([`exp/${dir}${stem}`, EXP_FRAME_MS]);
  }
  return out;
}

/**
 * 종족의 스프라이트 시트를 받아온다. 없으면 null (호출부가 GIF/PNG로 폴백한다).
 *
 * 순서는 sheetPaths()가 정한다. 둘 다 정지 한 장이면 먼저 잡힌 쪽을 쓴다.
 */
export async function loadPokemonSheet(species, side) {
  const key = `${species}|${side}`;
  if (cache.has(key)) return cache.get(key);

  const p = (async () => {
    const sp = species && Dex.species.get(species);
    if (!sp || !sp.exists) return null;

    let still = null;   // 정지 한 장짜리는 애니메이션을 다 뒤진 뒤에 쓴다
    for (const [path, ms] of sheetPaths(species, side)) {
      const sheet = await fetchSheet(path, ms);
      if (!sheet) continue;
      if (sheet.frames.length > 1) return sheet;
      still ??= sheet;
    }
    return still;
  })();

  cache.set(key, p);
  return p;
}

/** 배틀 시작 전에 양 팀 스프라이트를 미리 받아둔다 — 교체할 때 빈 칸이 안 생긴다 */
export function preloadSheets(speciesList) {
  for (const s of speciesList) {
    loadPokemonSheet(s, 'p1');
    loadPokemonSheet(s, 'p2');
  }
}

/**
 * 시트를 돌리는 캔버스를 만든다.
 * @returns {{ canvas: HTMLCanvasElement, stop: () => void, setPaused: (v: boolean) => void }}
 */
export function createSheetSprite(sheet) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sprite';
  canvas.width = sheet.w;
  canvas.height = sheet.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let i = 0;
  let timer = 0;
  let paused = false;
  let alive = true;

  const draw = () => {
    const f = sheet.frames[i];
    ctx.clearRect(0, 0, sheet.w, sheet.h);
    ctx.drawImage(sheet.img, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.sw, f.sh);
  };

  const tick = () => {
    if (!alive) return;
    draw();
    if (paused || sheet.frames.length < 2) return;
    timer = setTimeout(() => { i = (i + 1) % sheet.frames.length; tick(); }, sheet.frames[i].ms);
  };
  tick();

  return {
    canvas,
    stop() { alive = false; clearTimeout(timer); },
    setPaused(v) {
      if (paused === !!v) return;
      paused = !!v;
      clearTimeout(timer);
      if (!paused && alive) tick();
    },
  };
}
