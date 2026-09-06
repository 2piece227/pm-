/**
 * 스프라이트 레이어 — 표시 전용.
 *
 * **전부 5세대(블랙·화이트) 도트로 통일한다.** 실제 DS 게임 화면의 그 그림체다.
 *
 * 원래는 PokeAPI의 BW 애니메이션 폴더 하나만 쓰고, 없으면 `other/showdown/`으로 떨궜다.
 * 그런데 그 폴더는 **BW 도트가 아니라 최신 고해상도 스프라이트**다 (아머까오 200x162,
 * 두드리짱 178x95). 같은 칸에 욱여넣으니 "고해상도를 축소한 것"처럼 보였다 —
 * 더시마사리(#748)만 멀쩡했던 건 7세대인데도 BW 폴더에 들어 있어서였다.
 *
 * 그래서 후보를 **BW 계열로만** 줄 세운다. 위에서부터 되는 걸 쓴다:
 *
 *   1. PokeAPI  BW 애니메이션 GIF   — 진짜 DS 원본, 움직인다
 *   2. 쇼다운   gen5ani GIF         — 같은 그림체인데 PokeAPI 미러보다 최신 (무쇠무인·위대한엄니 등)
 *   3. PokeAPI  BW 정지 PNG         — BW 그림체 정지컷. 96x96 캔버스라 **여백을 런타임에 잘라낸다**
 *   4. 쇼다운   gen5 정지 PNG       — 위와 같은 세트. 뒷모습 커버리지가 여기만 완전하다
 *   5. 폼 변형이 없으면 기본 종으로 (다투곰(붉은 달) → 다투곰)
 *
 * 실측 커버리지(풀 53종): 애니메이션 앞 36 / 정지 앞 50·뒤 50 → 합치면 53/53이 BW 도트다.
 *
 * 파일을 리포에 복제하지 않고 링크만 건다. SPEC §10 — 엔진(@pkmn/sim)은 MIT지만
 * 스프라이트는 별개 사안이라, 우리가 직접 호스팅하는 형태는 피한다.
 * 이미지 출처는 이 파일 한 곳에 가둬 뒀다. 오리지널 IP로 갈아끼울 땐 여기만 고치면 된다.
 */
import { Dex } from '@pkmn/dex';

const PA = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white';
const PS = 'https://play.pokemonshowdown.com/sprites';

/**
 * PokeAPI 파일명 조각. 폼이 있으면 `645-therian` 처럼 접미사가 붙는다.
 * (실측 확인: 645-therian.gif / 479-wash.gif 모두 존재)
 */
function paStem(sp) {
  const forme = sp.forme ? `-${sp.forme.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `${sp.num}${forme}`;
}

/** 종족명 → 도감번호 (울음소리 등에 쓴다) */
export function dexNumOf(species) {
  const sp = species && Dex.species.get(species);
  return sp && sp.exists ? sp.num : null;
}

/**
 * 스프라이트 후보를 **우선순위대로** 돌려준다. 호출부가 위에서부터 시도한다.
 *
 * `kind`가 왜 필요한가: 정지 PNG는 96x96 고정 캔버스라 여백이 붙어 있다.
 * 잘린 GIF와 같은 기준으로 크기를 맞추려면 여백을 잘라내야 해서, 어느 쪽인지 알아야 한다.
 *
 * @param {string} species 영문 종족명
 * @param {'p1'|'p2'} side p1=아군(뒷모습), p2=상대(앞모습)
 * @returns {{url: string, kind: 'ani'|'static'}[]}
 */
export function spriteCandidates(species, side) {
  const sp = species && Dex.species.get(species);
  if (!sp || !sp.exists) return [];

  const back = side === 'p1';
  const out = [];
  const add = (url, kind) => out.push({ url, kind });

  /* 폼 변형은 전용 그림이 없을 수 있어서 기본 종까지 훑는다 */
  const base = sp.baseSpecies && sp.baseSpecies !== sp.name ? Dex.species.get(sp.baseSpecies) : null;
  const forms = base ? [sp, base] : [sp];

  for (const f of forms) {
    const stem = paStem(f);
    add(`${PA}/animated/${back ? 'back/' : ''}${stem}.gif`, 'ani');
    add(`${PS}/gen5ani${back ? '-back' : ''}/${f.id}.gif`, 'ani');
  }
  for (const f of forms) {
    const stem = paStem(f);
    add(`${PA}/${back ? 'back/' : ''}${stem}.png`, 'static');
    add(`${PS}/gen5${back ? '-back' : ''}/${f.id}.png`, 'static');
  }
  return out;
}

/**
 * 이 URL에 `crossOrigin`을 붙여도 되나.
 *
 * 쇼다운 서버는 `Access-Control-Allow-Origin`을 안 보낸다. 그런데도 crossOrigin을 붙이면
 * 이미지 로드 자체가 **실패한다** — 실제로 위대한엄니 뒷모습이 실루엣으로 떨어졌다.
 * 그래서 쇼다운 쪽은 그냥 불러온다. 대신 캔버스가 오염돼 여백을 못 자르므로,
 * 호출부가 96x96 원본 그대로 쓰고 위치만 보정한다.
 */
export const canReadPixels = (url) => url.startsWith(PA);

/**
 * 여백을 못 자른 96x96 캔버스를 발밑 기준에 맞추는 보정값.
 * 실측 평균: 위 여백 약 12px, 아래 약 14px (96px 기준). 잘린 스프라이트와 눈높이를 맞춘다.
 */
export const PADDED_SHIFT = { p1: '14%', p2: '-11%' };

/**
 * 화면상 크기의 기준 폭(px).
 *
 * BW 스프라이트는 종마다 덩치가 다르다 (리자몽 87x89 vs 해피너스 61x59).
 * 전부 같은 폭으로 늘리면 안 되고, "픽셀당 배율"을 일정하게 유지해야 덩치 차이가 살아난다.
 * 이 값에 대한 비율로 컨테이너 폭을 정한다.
 *
 * 정지 PNG는 96x96 캔버스라 이 기준이 바로 안 먹는데, 호출부가 **여백을 잘라낸 뒤**
 * 재는 폭을 넘기므로 애니메이션 GIF와 같은 잣대로 맞춰진다.
 */
export const REFERENCE_WIDTH = 88;

/** 96x96 정지 스프라이트의 투명 여백을 잘라낸 캔버스. 못 자르면 null */
export function cropToContent(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  try {
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sx = src.getContext('2d', { willReadFrequently: true });
    sx.drawImage(img, 0, 0);
    const d = sx.getImageData(0, 0, w, h).data;

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) return null;   // 전부 투명

    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const cv = document.createElement('canvas');
    cv.className = 'sprite';
    cv.width = cw;
    cv.height = ch;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
    return cv;
  } catch {
    return null;   // 캔버스가 오염됐으면(CORS) 원본 그대로 쓴다
  }
}

/** 스프라이트를 못 불러올 때 쓰는 실루엣 (오프라인·미등록 종족) */
export function fallbackSvg() {
  return (
    '<svg viewBox="0 0 16 14" shape-rendering="crispEdges">' +
    '<rect x="4" y="3" width="8" height="9" fill="#7a8aa8"/>' +
    '<rect x="5" y="1" width="6" height="3" fill="#7a8aa8"/></svg>'
  );
}

/** 기술 타입별 이펙트 색 */
export const TYPE_FX = {
  normal: '#d8d8c0', fire: '#ff7a30', water: '#4a90d0', electric: '#f0d040',
  grass: '#68c060', ice: '#88d8e8', fighting: '#c05038', poison: '#a050a0',
  ground: '#d0a860', flying: '#b8d0f0', psychic: '#f07aa0', bug: '#a0b830',
  rock: '#c8a850', ghost: '#8a6ac0', dragon: '#7a6ad8', dark: '#4a3a58',
  steel: '#a8b8c8', fairy: '#f0a8d0',
};
