/**
 * 스프라이트 레이어 — 표시 전용.
 *
 * 소스: PokeAPI/sprites 저장소의 **5세대(블랙·화이트) 애니메이션 도트**.
 * 실제 DS 게임 원본이라 프레임 수가 적고 거친 도트 느낌이 그대로 남는다.
 * (커뮤니티가 보간한 `other/showdown/` 쪽은 매끄러워서 "불쾌한 골짜기"가 생긴다.)
 *
 * 5세대 이후 등장한 종은 이 폴더에 없을 수 있어서, 없으면 `other/showdown/`으로
 * 자동 폴백한다 — 도트 느낌은 덜해도 최소한 렌더링은 되게. (예: 타부자고 #1000)
 *
 * 파일을 리포에 복제하지 않고 링크만 건다. SPEC §10 — 엔진(@pkmn/sim)은 MIT지만
 * 스프라이트는 별개 사안이라, 우리가 직접 호스팅하는 형태는 피한다.
 * 이미지 출처는 이 파일 한 곳에 가둬 뒀다. 오리지널 IP로 갈아끼울 땐 여기만 고치면 된다.
 */
import { Dex } from '@pkmn/dex';

const REPO = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const BW_ANIMATED = `${REPO}/versions/generation-v/black-white/animated`;
const SHOWDOWN = `${REPO}/other/showdown`;

/**
 * 종족명 → 파일명 조각. 폼이 있으면 `645-therian` 처럼 접미사가 붙는다.
 * (실측 확인: 645-therian.gif / 479-wash.gif 모두 존재)
 */
function fileStem(species) {
  const sp = Dex.species.get(species);
  if (!sp || !sp.exists) return null;
  const forme = sp.forme ? `-${sp.forme.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `${sp.num}${forme}`;
}

/**
 * @param {string} species 영문 종족명
 * @param {'p1'|'p2'} side p1=아군(뒷모습), p2=상대(앞모습)
 * @returns {{url:string|null, fallback:string|null}}
 */
export function spriteUrl(species, side) {
  const stem = fileStem(species);
  if (!stem) return { url: null, fallback: null };
  const dir = side === 'p1' ? 'back/' : '';
  return {
    url: `${BW_ANIMATED}/${dir}${stem}.gif`,
    fallback: `${SHOWDOWN}/${dir}${stem}.gif`,
  };
}

/**
 * 화면상 크기의 기준 폭(px).
 *
 * BW 애니메이션 GIF는 **내용에 맞게 잘려 있어서 종마다 크기가 다르다**
 * (리자몽 87x89 vs 해피너스 61x59). 그래서 전부 같은 폭으로 늘리면 안 되고,
 * "픽셀당 배율"을 일정하게 유지해야 실제 덩치 차이가 살아난다.
 * 이 값에 대한 비율로 컨테이너 폭을 정한다.
 *
 * 예전 static 96x96 스프라이트를 쓸 땐 캔버스 여백 때문에 종별 보정표가 필요했는데,
 * 잘린 소스로 바뀌면서 그 문제가 사라져 보정표와 생성 스크립트를 걷어냈다.
 */
export const REFERENCE_WIDTH = 88;

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
