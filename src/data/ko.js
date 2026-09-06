/**
 * 한글 이름 테이블.
 * @pkmn 데이터는 영문만 제공하므로 표시 레이어에서만 매핑한다.
 * 새 포켓몬을 늘리려면 여기 한 줄만 추가하면 된다 — 로직은 영문 id로만 돈다. (SPEC §1-2)
 * 없는 항목은 영문 그대로 떨어지므로 누락돼도 게임이 멈추지 않는다.
 *
 * 기술 이름·타입만 예외로 **생성표**를 쓴다 (아래 MOVE_KO 주석 참고).
 */
import { MOVE_KO_ALL, MOVE_TYPE_ALL } from './move-ko.gen.js';

export const SPECIES_KO = {
  Spiritomb: '화강돌',
  Garchomp: '한카리아스',
  Dragapult: '드래펄트',
  Charizard: '리자몽',
  'Dragonite': '망나뇽',
  'Tyranitar': '마기라스',
  'Metagross': '메타그로스',
  'Salamence': '보만다',
  'Hydreigon': '삼삼드래',
  'Volcarona': '불카모스',
  'Landorus-Therian': '랜드로스(영물)',
  'Gholdengo': '타부자고',
  'Corviknight': '아머까오',
  'Toxapex': '더시마사리',
  'Blissey': '해피너스',
  'Ferrothorn': '너트령',
  'Gyarados': '갸라도스',
  'Arcanine': '윈디',
  'Lucario': '루카리오',
  'Milotic': '밀로틱',
  'Snorlax': '잠만보',
  'Alakazam': '후딘',
  'Gengar': '팬텀',
  'Scizor': '핫삼',
  'Rotom-Wash': '로토무(물)',
  'Raticate': '레트라',
  'Fearow': '깨비드릴조',
  'Golbat': '골뱃',
  'Persian': '페르시온',
  'Arbok': '아보크',
  'Sandslash': '고지',
  'Dodrio': '두트리오',
  'Hypno': '슬리퍼',
  'Weezing': '또가스',
  'Marowak': '텅구리',
  'Kingler': '킹크랩',
  'Tauros': '켄타로스',
};

/** HP 박스에 띄울 타입 표기 */
export const SPECIES_TYPES = {
  Spiritomb: '고스트·악',
  Garchomp: '드래곤·땅',
  Dragapult: '드래곤·고스트',
  Charizard: '불꽃·비행',
  'Dragonite': '드래곤·비행',
  'Tyranitar': '바위·악',
  'Metagross': '강철·에스퍼',
  'Salamence': '드래곤·비행',
  'Hydreigon': '악·드래곤',
  'Volcarona': '벌레·불꽃',
  'Landorus-Therian': '땅·비행',
  'Gholdengo': '강철·고스트',
  'Corviknight': '비행·강철',
  'Toxapex': '독·물',
  'Blissey': '노말',
  'Ferrothorn': '풀·강철',
  'Gyarados': '물·비행',
  'Arcanine': '불꽃',
  'Lucario': '격투·강철',
  'Milotic': '물',
  'Snorlax': '노말',
  'Alakazam': '에스퍼',
  'Gengar': '고스트·독',
  'Scizor': '벌레·강철',
  'Rotom-Wash': '전기·물',
  'Raticate': '노말',
  'Fearow': '노말·비행',
  'Golbat': '독·비행',
  'Persian': '노말',
  'Arbok': '독',
  'Sandslash': '땅',
  'Dodrio': '노말·비행',
  'Hypno': '에스퍼',
  'Weezing': '독',
  'Marowak': '땅',
  'Kingler': '물',
  'Tauros': '노말',
};

/**
 * 기술 한글 이름 · 타입.
 *
 * 손으로 적던 73개짜리 표는 8·9세대 기술이 통째로 비어 있었고(자막에 영문이 떴다)
 * 그나마도 7개가 틀려 있었다(제트헤드 → 사념의박치기, 놓치지않기 → 기습 …).
 * 지금은 916종을 생성해서 쓴다 — `node tools/gen-move-ko.mjs`로 다시 만든다.
 *
 * 고칠 게 생기면 아래 OVERRIDE에 적는다. 생성표를 덮어쓴다.
 */
export const MOVE_KO_OVERRIDE = {};
export const MOVE_TYPE_OVERRIDE = {};

export const MOVE_KO = { ...MOVE_KO_ALL, ...MOVE_KO_OVERRIDE };

/** 기술 → 타입. 이펙트 색을 고르기 위한 표시용 (프로토콜 로그에는 타입이 안 실린다) */
export const MOVE_TYPE = { ...MOVE_TYPE_ALL, ...MOVE_TYPE_OVERRIDE };

export const ABILITY_KO = {
  Pressure: '프레셔',
  'Rough Skin': '까칠한피부',
  'Clear Body': '클리어바디',
  Blaze: '맹화',
  'Multiscale': '멀티스케일',
  'Sand Stream': '모래날림',
  'Intimidate': '위협',
  'Levitate': '부유',
  'Flame Body': '불꽃몸',
  'Good as Gold': '황금몸',
  'Regenerator': '재생력',
  'Natural Cure': '자연회복',
  'Iron Barbs': '철가시',
  'Inner Focus': '정신력',
  'Marvel Scale': '이상한비늘',
  'Thick Fat': '두꺼운지방',
  'Magic Guard': '매직가드',
  'Cursed Body': '저주받은바디',
  'Technician': '테크니션',
  'Guts': '근성',
  'Keen Eye': '날카로운눈',
  'Limber': '유연',
  'Sand Veil': '모래숨기',
  'Early Bird': '일찍기상',
  'Insomnia': '불면',
  'Rock Head': '돌머리',
  'Hyper Cutter': '괴력집게',
};

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
