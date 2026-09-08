/**
 * 종족 풀 — **어떤 포켓몬이 세상에 굴러다니는가**만 정한다.
 *
 * 예전 `pokemon-pool.js`는 종족 + 특성 + 성격 + 도구 + 기술 4개를 통째로 박아둔
 * "완성된 개체" 표였다. 그래서 팀 빌더가 Lv50 6마리를 그냥 찍어냈고, 육성할 게 없었다.
 * 이제 여기서는 **종족과 등급만** 들고, 개체는 `data/pokemon.js`가 레벨에 맞춰 만든다.
 *
 * tier — 종족 자체의 강함. 강한 트레이너일수록 높은 tier가 섞인다.
 *   3 의사전설·최상위 / 2 준수한 주력 / 1 초반 도로 수준
 */

/** 첫 트레이너가 받는 스타터 — 원작대로 3종 중 고른다 */
export const STARTERS = [
  { species: 'Bulbasaur', ko: '이상해씨', type: '풀' },
  { species: 'Charmander', ko: '파이리', type: '불꽃' },
  { species: 'Squirtle', ko: '꼬부기', type: '물' },
];

export const SPECIES_POOL = [
  /* tier 3 */
  { species: 'Garchomp', tier: 3 },
  { species: 'Dragonite', tier: 3 },
  { species: 'Tyranitar', tier: 3 },
  { species: 'Dragapult', tier: 3 },
  { species: 'Metagross', tier: 3 },
  { species: 'Salamence', tier: 3 },
  { species: 'Hydreigon', tier: 3 },
  { species: 'Volcarona', tier: 3 },
  { species: 'Gholdengo', tier: 3 },
  { species: 'Great Tusk', tier: 3 },
  { species: 'Iron Valiant', tier: 3 },
  { species: 'Kingambit', tier: 3 },
  { species: 'Baxcalibur', tier: 3 },
  { species: 'Annihilape', tier: 3 },

  /* tier 2 */
  { species: 'Corviknight', tier: 2 },
  { species: 'Toxapex', tier: 2 },
  { species: 'Charizard', tier: 2 },
  { species: 'Blissey', tier: 2 },
  { species: 'Ferrothorn', tier: 2 },
  { species: 'Gyarados', tier: 2 },
  { species: 'Arcanine', tier: 2 },
  { species: 'Lucario', tier: 2 },
  { species: 'Milotic', tier: 2 },
  { species: 'Snorlax', tier: 2 },
  { species: 'Alakazam', tier: 2 },
  { species: 'Gengar', tier: 2 },
  { species: 'Scizor', tier: 2 },
  { species: 'Cinderace', tier: 2 },
  { species: 'Meowscarada', tier: 2 },
  { species: 'Quaquaval', tier: 2 },
  { species: 'Skeledirge', tier: 2 },
  { species: 'Ceruledge', tier: 2 },
  { species: 'Glimmora', tier: 2 },
  { species: 'Tinkaton', tier: 2 },

  /* tier 1 */
  { species: 'Raticate', tier: 1 },
  { species: 'Fearow', tier: 1 },
  { species: 'Golbat', tier: 1 },
  { species: 'Persian', tier: 1 },
  { species: 'Arbok', tier: 1 },
  { species: 'Sandslash', tier: 1 },
  { species: 'Dodrio', tier: 1 },
  { species: 'Hypno', tier: 1 },
  { species: 'Weezing', tier: 1 },
  { species: 'Marowak', tier: 1 },
  { species: 'Kingler', tier: 1 },
  { species: 'Tauros', tier: 1 },
  { species: 'Lokix', tier: 1 },
  { species: 'Pawmot', tier: 1 },
  { species: 'Klawf', tier: 1 },
  { species: 'Bombirdier', tier: 1 },
];
