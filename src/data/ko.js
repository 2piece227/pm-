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
import { HELD_ITEMS } from './items.gen.js';
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




/* 도구 이름 — 상점 데이터(items.gen.js, PokeAPI 한국어 공식 명칭)에서 가져온다 */
export const ITEM_KO = Object.fromEntries(Object.entries(HELD_ITEMS).map(([en, v]) => [en, v.ko]));

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

/* ---------------- 한국어 조사 ---------------- */

/** 마지막 글자에 받침이 있나 */
export function hasJong(s) {
  if (!s) return false;
  const c = String(s).charCodeAt(String(s).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;   // 한글 음절이 아니면 받침 없음 취급
  return (c - 0xac00) % 28 !== 0;
}
export const eunNeun = (s) => `${s}${hasJong(s) ? '은' : '는'}`;
export const eulReul = (s) => `${s}${hasJong(s) ? '을' : '를'}`;
export const iGa = (s) => `${s}${hasJong(s) ? '이' : '가'}`;
export const gwaWa = (s) => `${s}${hasJong(s) ? '과' : '와'}`;
/** (으)로 — 받침이 없거나 ㄹ받침이면 '로' */
export const euro = (s) => {
  const str = String(s);
  const c = str.charCodeAt(str.length - 1);
  const jong = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0;
  return `${str}${jong === 0 || jong === 8 ? '로' : '으로'}`;
};
/** 숫자 뒤 이/가 — 끝자리를 한글로 읽었을 때의 받침으로 정한다 (0,1,3,6,7,8 → 받침) */
export const numIGa = (n) => `${n}${[0, 1, 3, 6, 7, 8].includes(Math.abs(Number(n)) % 10) ? '이' : '가'}`;

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
얼어 버렸다!`,
};

/** 상태이상 지속 피해 자막 (주어에 조사가 붙어 들어온다) */
export const STATUS_TICK = {
  brn: (s) => `${s}
화상 데미지를 입었다!`,
  psn: (s) => `${s}
독 데미지를 입었다!`,
  tox: (s) => `${s}
독 데미지를 입었다!`,
};

/** 상태이상이 풀릴 때 (원작 문구 — 이름만 들어온다) */
export const CURE_MSG = {
  slp: (n) => `${n}${hasJong(n) ? '은' : '는'}
눈을 떴다!`,
  frz: (n) => `${n}의
얼음이 녹았다!`,
  par: (n) => `${n}의
마비가 풀렸다!`,
  brn: (n) => `${n}의
화상이 나았다!`,
  psn: (n) => `${n}의
독이 사라졌다!`,
  tox: (n) => `${n}의
독이 사라졌다!`,
};

/** HP 박스에 띄울 짧은 상태 배지 */
export const STATUS_BADGE = {
  brn: '화상', par: '마비', psn: '독', tox: '독', slp: '잠듦', frz: '얼음',
};

/** 행동 불가 사유 자막 (주어에 조사가 붙어 들어온다) */
export const CANT_MSG = {
  par: (s) => `${s} 몸이 저려서
움직일 수 없다!`,
  slp: (s) => `${s}
쿨쿨 잠들어 있다.`,
  frz: (s) => `${s} 얼어 버려서
움직일 수 없다!`,
  flinch: (s) => `${s} 풀이 죽어서
움직일 수 없다!`,
  recharge: (s) => `${s}
움직일 수 없다!`,
  Attract: (s) => `${s} 헤롱헤롱해서
기술을 쓸 수 없다!`,
  Taunt: (s, mv) => `${s} 도발당한 상태라
${mv ? eulReul(mv) : '변화 기술을'} 쓸 수 없다!`,
  Disable: (s, mv) => `${s} 사슬묶기로
${mv ? eulReul(mv) : '그 기술을'} 쓸 수 없다!`,
  'Heal Block': (s, mv) => `${s} 회복봉인으로
${mv ? eulReul(mv) : '회복 기술을'} 쓸 수 없다!`,
  Torment: (s) => `${s} 트집 때문에
같은 기술을 연달아 쓸 수 없다!`,
  Truant: (s) => `${s}
게으름을 피우고 있다!`,
};

/** 배틀 로그 줄에 붙는 지속 효과 이름 (엔진 이름 → 한국어) */
export const VOLATILE_KO = {
  confusion: '혼란', 'Leech Seed': '씨뿌리기', Curse: '저주', 'Salt Cure': '소금절이', Nightmare: '악몽',
  Substitute: '대타', Attract: '헤롱헤롱', Yawn: '하품', Taunt: '도발', Encore: '앙코르', Torment: '트집',
  Disable: '사슬묶기', Ingrain: '뿌리박기', 'Aqua Ring': '아쿠아링', 'Focus Energy': '기충전',
  'Magnet Rise': '전자부유', 'Heal Block': '회복봉인', Embargo: '금제', flinch: '풀죽음', recharge: '반동',
  perish0: '멸망 카운트 0', perish1: '멸망 카운트 1', perish2: '멸망 카운트 2', perish3: '멸망 카운트 3',
};

/**
 * 지속 효과의 원작(5세대 이후) 문구 — `-start`(걸림) / `-activate`(발동) / `-end`(풀림) / 턴 끝 피해·회복.
 * (n = 대상 이름, u = 건 쪽 이름 [of], mv = 관련 기술 이름)
 */
export const VOLATILE_MSG = {
  confusion: { start: (n) => `${eunNeun(n)}\n혼란에 빠졌다!`, activate: (n) => `${eunNeun(n)}\n혼란에 빠져 있다!`, end: (n) => `${n}의\n혼란이 풀렸다!` },
  'Leech Seed': { start: (n) => `${n}에게\n씨앗을 심었다!`, end: (n) => `${eunNeun(n)}\n씨뿌리기에서 벗어났다!`, damage: (n) => `씨뿌리기가 ${n}의\n체력을 빼앗는다!` },
  Curse: { start: (n, u) => (u ? `${eunNeun(u)} 자신의 체력을 깎아서\n${n}에게 저주를 걸었다!` : `${n}에게\n저주가 걸렸다!`), damage: (n) => `${eunNeun(n)}\n저주를 받고 있다!` },
  'Salt Cure': { start: (n) => `${eunNeun(n)}\n소금에 절여졌다!`, damage: (n) => `${eunNeun(n)}\n소금절이의 데미지를 입었다!` },
  Nightmare: { start: (n) => `${eunNeun(n)}\n악몽을 꾸기 시작했다!`, damage: (n) => `${eunNeun(n)}\n악몽에 시달리고 있다!` },
  Substitute: { start: (n) => `${n}의\n대타가 나타났다!`, activate: (n) => `대타가 ${n} 대신\n공격을 받았다!`, end: (n) => `${n}의 대타는\n사라져 버렸다…` },
  Attract: { start: (n) => `${eunNeun(n)}\n사랑에 빠졌다!`, activate: (n, u) => `${eunNeun(n)} ${u ? `${u}에게\n` : '\n'}헤롱헤롱하다!`, end: (n) => `${eunNeun(n)}\n헤롱헤롱 상태에서 벗어났다!` },
  Yawn: { start: (n) => `${eunNeun(n)}\n졸음이 오기 시작했다!` },
  Taunt: { start: (n) => `${eunNeun(n)}\n도발에 넘어가 버렸다!`, end: (n) => `${n}의\n도발 효과가 풀렸다!` },
  Encore: { start: (n) => `${eunNeun(n)}\n앙코르를 받았다!`, end: (n) => `${n}의\n앙코르 상태가 풀렸다!` },
  Torment: { start: (n) => `${eunNeun(n)}\n트집을 잡혔다!`, end: (n) => `${n}의\n트집 상태가 풀렸다!` },
  Disable: { start: (n, u, mv) => `${n}의 ${mv ? eulReul(mv) : '기술을'}\n쓸 수 없게 되었다!`, end: (n) => `${n}의\n사슬묶기가 풀렸다!` },
  Ingrain: { start: (n) => `${eunNeun(n)}\n뿌리를 뻗었다!`, heal: (n) => `${eunNeun(n)} 뿌리로부터\n양분을 흡수했다!` },
  'Aqua Ring': { start: (n) => `${eunNeun(n)}\n물의 베일을 둘렀다!`, heal: (n) => `물의 베일이 ${n}의\n체력을 회복했다!` },
  'Focus Energy': { start: (n) => `${eunNeun(n)}\n의욕이 넘치고 있다!` },
  'Magnet Rise': { start: (n) => `${eunNeun(n)}\n전자력으로 떠올랐다!`, end: (n) => `${n}의\n전자력이 사라졌다!` },
  'Heal Block': { start: (n) => `${eunNeun(n)}\n회복을 봉인당했다!`, end: (n) => `${n}의\n회복봉인이 풀렸다!` },
  Embargo: { start: (n) => `${eunNeun(n)}\n도구를 쓸 수 없게 되었다!`, end: (n) => `${eunNeun(n)}\n도구를 쓸 수 있게 되었다!` },
};
/* 멸망의노래 카운트 — perish3 → "멸망 카운트가 3이 되었다!" */
for (const k of [0, 1, 2, 3]) VOLATILE_MSG[`perish${k}`] = { start: (n) => `${n}의 멸망 카운트가\n${k}${[0, 1, 3].includes(k) ? '이' : '가'} 되었다!` };

/** 조이기류(바인드) — 걸릴 때 문구는 기술마다 다르다. 피해·풀림은 공통 (n = 대상, u = 건 쪽) */
export const TRAP_MSG = {
  Bind: (n, u) => `${eunNeun(n)} ${u}에게\n조이기를 당했다!`,
  Wrap: (n, u) => `${eunNeun(n)} ${u}에게\n김밥말이를 당했다!`,
  'Fire Spin': (n) => `${eunNeun(n)}\n불꽃의 소용돌이에 갇혔다!`,
  Whirlpool: (n) => `${eunNeun(n)}\n소용돌이에 갇혔다!`,
  'Sand Tomb': (n) => `${eunNeun(n)}\n모래지옥에 사로잡혔다!`,
  Clamp: (n, u) => `${eunNeun(u)} ${eulReul(n)}\n껍질에 가두었다!`,
  Infestation: (n, u) => `${eunNeun(n)} ${u}에게\n엉겨붙기를 당했다!`,
  'Magma Storm': (n) => `${eunNeun(n)}\n마그마의 소용돌이에 갇혔다!`,
  'Snap Trap': (n) => `${eunNeun(n)}\n덫에 걸렸다!`,
  'Thunder Cage': (n, u) => `${eunNeun(u)} ${eulReul(n)}\n가두었다!`,
};
export const TRAP_DAMAGE = (n, mv) => `${eunNeun(n)} ${mv}의\n데미지를 입고 있다!`;
export const TRAP_END = (n, mv) => `${eunNeun(n)} ${mv}에서\n풀려났다!`;
