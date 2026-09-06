/**
 * 한글 이름 테이블.
 * @pkmn 데이터는 영문만 제공하므로 표시 레이어에서만 매핑한다.
 *
 * **이름표는 전부 생성표(ko.gen.js)에서 온다.** 손으로 적던 시절엔 풀에 있는 것만 채워져
 * 있어서 종을 하나 늘릴 때마다 자막이 조용히 영문으로 떨어졌고, 기술 이름은 7개가 틀리기까지 했다.
 * `node tools/gen-ko.mjs`로 다시 만든다.
 *
 * 고칠 게 생기면 아래 *_OVERRIDE에 적는다 — 생성표를 덮어쓴다.
 * 로케일이 기본 종만 갖고 있어서, **폼 변형은 여기서 손으로 적는다.**
 */
import {
  ABILITY_KO_ALL, MOVE_KO_ALL, MOVE_TYPE_ALL, SPECIES_KO_ALL, SPECIES_TYPES_ALL,
} from './ko.gen.js';

/**
 * 폼 변형 — 로케일의 pokemon.json은 기본 종만 갖고 있어서 여기서 손으로 적는다.
 * 이름은 같은 저장소의 pokemon-form.json을 따랐다 (워시로토무 / 영물폼 / 붉은 달).
 */
export const SPECIES_KO_OVERRIDE = {
  'Landorus-Therian': '랜드로스(영물폼)',
  'Rotom-Wash': '워시로토무',
  'Ursaluna-Bloodmoon': '다투곰(붉은 달)',
};
export const SPECIES_TYPES_OVERRIDE = {};
export const ABILITY_KO_OVERRIDE = {};
export const MOVE_KO_OVERRIDE = {};
export const MOVE_TYPE_OVERRIDE = {};

export const SPECIES_KO = { ...SPECIES_KO_ALL, ...SPECIES_KO_OVERRIDE };
export const ABILITY_KO = { ...ABILITY_KO_ALL, ...ABILITY_KO_OVERRIDE };
export const MOVE_KO = { ...MOVE_KO_ALL, ...MOVE_KO_OVERRIDE };

/** 기술·종족 → 타입. 이펙트 색을 고르기 위한 표시용 (프로토콜 로그에는 타입이 안 실린다) */
export const MOVE_TYPE = { ...MOVE_TYPE_ALL, ...MOVE_TYPE_OVERRIDE };
export const SPECIES_TYPES = { ...SPECIES_TYPES_ALL, ...SPECIES_TYPES_OVERRIDE };




export const ITEM_KO = {
  Leftovers: '남은음식',
  'Choice Specs': '구애안경',
  'Life Orb': '생명의구슬',
  'Choice Band': '구애머리띠',
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

/* ===== 배틀 메시지용 표 — 실제 게임 자막 문구에 맞춘다 ===== */

/** 날씨 */
export const WEATHER_KO = {
  Sandstorm: '모래바람',
  RainDance: '비',
  SunnyDay: '햇살',
  Hail: '싸라기눈',
  Snow: '눈',
  none: '',
};

/** 날씨별 자막 (시작 / 지속 / 피해) */
export const WEATHER_MSG = {
  Sandstorm: {
    start: '모래바람이 몰아치기 시작했다!',
    upkeep: '모래바람이 세차게 분다!',
    damage: (obj) => `모래바람이 ${obj}
덮쳤다!`,
    end: '모래바람이 그쳤다!',
  },
  RainDance: {
    start: '비가 내리기 시작했다!',
    upkeep: '비가 계속 내리고 있다.',
    damage: null,
    end: '비가 그쳤다!',
  },
  SunnyDay: {
    start: '햇살이 강해졌다!',
    upkeep: '햇살이 강하다.',
    damage: null,
    end: '햇살이 원래대로 돌아왔다!',
  },
  Hail: {
    start: '싸라기눈이 내리기 시작했다!',
    upkeep: '싸라기눈이 계속 내리고 있다.',
    damage: (obj) => `싸라기눈이 ${obj}
덮쳤다!`,
    end: '싸라기눈이 그쳤다!',
  },
  Snow: {
    start: '눈이 내리기 시작했다!',
    upkeep: '눈이 계속 내리고 있다.',
    damage: null,
    end: '눈이 그쳤다!',
  },
};

/**
 * 상태이상 자막. 인자는 **조사까지 붙은 주어**를 받는다 ("리자몽은" / "한카리아스는").
 * 조사 판정은 표시 레이어(protocol-ko.js)가 하고, 여기엔 문장만 둔다.
 */
export const STATUS_MSG = {
  brn: (s) => `${s}
화상을 입었다!`,
  par: (s) => `${s} 마비되어
기술이 나오기 어려워졌다!`,
  psn: (s) => `${s}
독에 당했다!`,
  tox: (s) => `${s}
맹독에 당했다!`,
  slp: (s) => `${s}
잠들어 버렸다!`,
  frz: (s) => `${s}
얼어붙었다!`,
};

/** 상태이상 지속 피해 자막 (주어에 조사가 붙어 들어온다) */
export const STATUS_TICK = {
  brn: (s) => `${s} 화상 때문에
데미지를 입었다!`,
  psn: (s) => `${s} 독 때문에
데미지를 입었다!`,
  tox: (s) => `${s} 맹독 때문에
데미지를 입었다!`,
};

/** HP 박스에 띄울 짧은 상태 배지 */
export const STATUS_BADGE = {
  brn: '화상', par: '마비', psn: '독', tox: '맹독', slp: '잠듦', frz: '얼음',
};

/** 행동 불가 사유 자막 (주어에 조사가 붙어 들어온다) */
export const CANT_MSG = {
  par: (s) => `${s} 몸이 저려서
움직일 수 없다!`,
  slp: (s) => `${s}
쿨쿨 잠들어 있다.`,
  frz: (s) => `${s} 얼어서
움직일 수 없다!`,
  flinch: (s) => `${s} 풀이 죽어서
움직일 수 없다!`,
  recharge: (s) => `${s}
움직일 수 없다!`,
};
