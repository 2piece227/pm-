/**
 * 스프라이트 "채움 비율" 보정표. — 표시 전용, 로직에는 영향 없음.
 * scripts/measure-sprite-fit.ps1로 자동 생성됨. 손으로 고치지 말고 스크립트를 다시 돌릴 것.
 *
 * 문제: 쇼다운 정적 스프라이트는 96x96 고정 캔버스 안에 그려지는데,
 * 캐릭터가 그 캔버스를 얼마나 채우는지는 종마다 완전히 다르다 (해피너스 42% vs 리자몽 81%).
 * 발 위치(캔버스 하단) 기준으로 확대해서 채움 비율을 목표치에 맞춘다.
 */
export const SPRITE_FIT = {
  'Blissey': { back: 1.6, front: 1.23 },
  'Charizard': { back: 1, front: 1 },
  'Corviknight': { back: 1.06, front: 1.02 },
  'Dragapult': { back: 1, front: 1 },
  'Dragonite': { back: 1, front: 1 },
  'Ferrothorn': { back: 1.06, front: 1.05 },
  'Garchomp': { back: 1, front: 1 },
  'Gholdengo': { back: 1, front: 1 },
  'Landorus-Therian': { back: 1, front: 1 },
  'Spiritomb': { back: 1.02, front: 1.23 },
  'Toxapex': { back: 1, front: 1 },
  'Tyranitar': { back: 1, front: 1 },
  'Volcarona': { back: 1.03, front: 1.05 },
};

/** 표에 없는 종은 1(무보정)로 떨어진다. */
export function spriteFitScale(species, orient) {
  const entry = SPRITE_FIT[species];
  return (entry && entry[orient]) || 1;
}
