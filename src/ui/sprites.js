/**
 * 스프라이트 레이어 — 표시 전용.
 *
 * 실제 도트는 포켓몬쇼다운 스프라이트를 쓴다. gen5(B/W 세대) 세트를 요청하고,
 * 그 세대에 없는 포켓몬은 @pkmn/img가 자동으로 상위 세대 도트로 떨어뜨린다.
 *
 * 쇼다운 CDN에서 매번 새로 받아오는 방식(핫링크)만 쓴다 — 파일을 리포에 복제해서
 * 재배포하지 않는다. SPEC §10 — 엔진(@pkmn/sim)은 MIT라 문제없지만 스프라이트는
 * 별개 사안이고, 서드파티 팬게임의 에셋을 통째로 가져와 우리 쪽에서 다시
 * 공개 배포하는 것과는 리스크 성격이 다르다(그쪽은 우리가 직접 호스팅하게 됨).
 * 이미지 출처는 이 파일 한 곳에 가둬 둔다. 오리지널 IP로 껍데기를 갈아끼울 때
 * spriteUrl() 하나만 바꾸면 나머지 코드는 손댈 필요가 없다.
 */
import { Sprites } from '@pkmn/img';

const SPRITE_GEN = 'gen5';

/**
 * @param {string} species 영문 종족명
 * @param {'p1'|'p2'} side p1=아군(후면 도트), p2=상대(전면 도트)
 * @returns {{url:string, w:number, h:number, pixelated:boolean}}
 */
export function spriteUrl(species, side) {
  return Sprites.getPokemon(species, { gen: SPRITE_GEN, side });
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
