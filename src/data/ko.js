/**
 * 한글 이름 테이블.
 * @pkmn 데이터는 영문만 제공하므로 표시 레이어에서만 매핑한다.
 * 새 포켓몬/기술을 늘리려면 여기 한 줄만 추가하면 된다 — 로직은 영문 id로만 돈다. (SPEC §1-2)
 * 없는 항목은 영문 그대로 떨어지므로 누락돼도 게임이 멈추지 않는다.
 */
export const SPECIES_KO = {
  Spiritomb: '화강돌',
  Garchomp: '한카리아스',
  Dragapult: '드래펄트',
  Charizard: '리자몽',
};

/** HP 박스에 띄울 타입 표기 */
export const SPECIES_TYPES = {
  Spiritomb: '고스트·악',
  Garchomp: '드래곤·땅',
  Dragapult: '드래곤·고스트',
  Charizard: '불꽃·비행',
};

export const MOVE_KO = {
  'Shadow Ball': '섀도볼',
  'Dark Pulse': '악의파동',
  Psychic: '사이코키네시스',
  Curse: '저주',
  Earthquake: '지진',
  'Scale Shot': '스케일샷',
  'Swords Dance': '칼춤',
  'Rock Tomb': '암석봉인',
  'Shadow Claw': '섀도클로',
  'Dragon Darts': '드래곤애로',
  'Draco Meteor': '용성군',
  Flamethrower: '화염방사',
  'Air Slash': '에어슬래시',
  'Ancient Power': '원시의힘',
  'Dragon Claw': '드래곤클로',
};

/** 기술 → 타입. 이펙트 색을 고르기 위한 표시용 테이블 (프로토콜 로그에는 타입이 안 실린다) */
export const MOVE_TYPE = {
  'Shadow Ball': 'ghost',
  'Dark Pulse': 'dark',
  Psychic: 'psychic',
  Curse: 'ghost',
  Earthquake: 'ground',
  'Scale Shot': 'dragon',
  'Swords Dance': 'normal',
  'Rock Tomb': 'rock',
  'Shadow Claw': 'ghost',
  'Dragon Darts': 'dragon',
  'Draco Meteor': 'dragon',
  Flamethrower: 'fire',
  'Air Slash': 'flying',
  'Ancient Power': 'rock',
  'Dragon Claw': 'dragon',
};

export const ABILITY_KO = {
  Pressure: '프레셔',
  'Rough Skin': '까칠한피부',
  'Clear Body': '클리어바디',
  Blaze: '맹화',
};

export const ITEM_KO = {
  Leftovers: '남은음식',
};

export const BOOST_KO = {
  atk: '공격',
  def: '방어',
  spa: '특공',
  spd: '특방',
  spe: '스피드',
  accuracy: '명중률',
  evasion: '회피율',
};

export const STATUS_KO = {
  brn: '화상',
  par: '마비',
  psn: '독',
  tox: '맹독',
  slp: '잠듦',
  frz: '얼음',
};

export const ko = (table, name) => table[name] || name;
