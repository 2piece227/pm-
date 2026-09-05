/**
 * 기술별 연출 정의 — 표시 전용. (SPEC §1-2 데이터 주도)
 *
 * 새 기술을 늘리려면 여기 한 줄만 추가하면 된다. 없으면 타입 기본값으로 떨어지므로
 * 표에 없어도 화면이 깨지지 않는다.
 *
 * 원형(archetype)은 실기 연출을 CSS로 근사한 것들이다:
 *   contact  몸으로 부딪힌다 (누르기·인파이트)
 *   slash    베는 자국이 그어진다 (섀도클로·시저크로스)
 *   bite     물어뜯는다 (깨물어부수기)
 *   punch    한 점을 강타 (불릿펀치·코멧펀치)
 *   beam     시전 후 광선이 뻗는다 (화염방사·10만볼트·냉동빔)
 *   ball     구체가 날아간다 (섀도볼·기합구슬)
 *   multi    빠른 연타 (드래곤애로·스케일샷)
 *   quake    화면이 흔들린다 (지진)
 *   rocks    위에서 돌이 떨어진다 (스톤샤워·스톤에지)
 *   meteor   큰 덩어리가 내리꽂힌다 (용성군)
 *   wind     날붙이 바람이 스친다 (에어슬래시)
 *   selfBuff 자신이 빛나며 기운이 오른다 (칼춤·용의춤)
 *   heal     초록 빛이 차오른다 (자기재생·알낳기)
 *   status   고리가 퍼져 상대를 감싼다 (맹독·도깨비불)
 *   drain    상대에게서 기운을 빨아온다 (기가드레인)
 */

/** 타입만 아는 경우의 기본 원형 */
export const TYPE_DEFAULT_ANIM = {
  fire: 'beam', water: 'beam', electric: 'beam', ice: 'beam',
  grass: 'ball', psychic: 'ball', dragon: 'ball', dark: 'ball',
  ghost: 'ball', poison: 'ball', fairy: 'ball',
  normal: 'contact', fighting: 'punch', rock: 'rocks', ground: 'quake',
  steel: 'punch', bug: 'slash', flying: 'wind',
};

/** 기술명(영문) → 원형. 표에 없으면 TYPE_DEFAULT_ANIM으로 떨어진다 */
export const MOVE_ANIM = {
  /* 접촉·타격 */
  'Body Slam': 'contact', 'Double-Edge': 'contact', 'Flare Blitz': 'contact',
  'Brave Bird': 'contact', 'Wild Charge': 'contact', 'Waterfall': 'contact',
  'Extreme Speed': 'contact', 'Quick Attack': 'contact', 'Outrage': 'contact',
  'Close Combat': 'punch', 'Bullet Punch': 'punch', 'Meteor Mash': 'punch',
  'Iron Head': 'punch', 'Zen Headbutt': 'punch', 'Body Press': 'punch',
  'Gyro Ball': 'punch', 'Seismic Toss': 'punch', 'Crabhammer': 'punch',
  'Poison Jab': 'punch', 'Drill Peck': 'punch', 'Drill Run': 'punch',
  'Steel Wing': 'slash', 'X-Scissor': 'slash', 'Shadow Claw': 'slash',
  'Night Slash': 'slash', 'Dragon Claw': 'slash', 'Power Whip': 'slash',
  'Play Rough': 'slash', 'Knock Off': 'slash',
  Crunch: 'bite', 'Sucker Punch': 'bite',

  /* 원거리 */
  Flamethrower: 'beam', 'Fire Blast': 'beam', Thunderbolt: 'beam',
  'Ice Beam': 'beam', 'Hydro Pump': 'beam', Scald: 'beam',
  'Solar Beam': 'beam', 'Volt Switch': 'beam', 'Make It Rain': 'beam',
  'Shadow Ball': 'ball', 'Dark Pulse': 'ball', 'Sludge Bomb': 'ball',
  'Focus Blast': 'ball', 'Dragon Pulse': 'ball', 'Bug Buzz': 'ball',
  'Air Slash': 'wind', 'Ancient Power': 'rocks', 'Rock Slide': 'rocks',
  'Stone Edge': 'rocks', Earthquake: 'quake', 'Draco Meteor': 'meteor',
  Psychic: 'ball',

  /* 연타 */
  'Dragon Darts': 'multi', 'Scale Shot': 'multi',

  /* 자기 강화 */
  'Swords Dance': 'selfBuff', 'Dragon Dance': 'selfBuff', 'Quiver Dance': 'selfBuff',
  'Nasty Plot': 'selfBuff', 'Bulk Up': 'selfBuff', 'Calm Mind': 'selfBuff',
  Coil: 'selfBuff', Curse: 'selfBuff', Harden: 'selfBuff',

  /* 회복 */
  Recover: 'heal', 'Soft-Boiled': 'heal', Roost: 'heal', 'Pain Split': 'heal',
  'Giga Drain': 'drain',

  /* 상태 */
  Toxic: 'status', 'Will-O-Wisp': 'status', 'Thunder Wave': 'status',
  'Leech Seed': 'status', Protect: 'selfBuff',
};

/** 기술 → 원형 (표 → 타입 기본값 → contact 순으로 떨어진다) */
export function animArchetype(moveName, type) {
  return MOVE_ANIM[moveName] || TYPE_DEFAULT_ANIM[type] || 'contact';
}

/** 원형별 연출 성격 — battle-view가 읽는다 */
export const ARCHETYPE_TRAITS = {
  contact: { approach: 'lunge', shake: 'medium', flash: true },
  punch: { approach: 'lunge', shake: 'strong', flash: true },
  slash: { approach: 'lunge', shake: 'medium', flash: false, mark: 'slash' },
  bite: { approach: 'lunge', shake: 'strong', flash: false, mark: 'bite' },
  beam: { approach: 'cast', projectile: 'beam', shake: 'weak', flash: false },
  ball: { approach: 'cast', projectile: 'ball', shake: 'medium', flash: false },
  multi: { approach: 'lunge', repeat: 3, shake: 'weak', flash: false },
  quake: { approach: 'stomp', shake: 'screen', flash: false, ground: true },
  rocks: { approach: 'cast', drop: 'rocks', shake: 'strong', flash: false },
  meteor: { approach: 'cast', drop: 'meteor', shake: 'screen', flash: true },
  wind: { approach: 'cast', projectile: 'wind', shake: 'weak', flash: false },
  selfBuff: { approach: 'none', selfGlow: true, rise: true, shake: 'none' },
  heal: { approach: 'none', selfGlow: true, rise: true, shake: 'none', color: '#5ad06a' },
  status: { approach: 'cast', ring: true, shake: 'none' },
  drain: { approach: 'cast', projectile: 'ball', siphon: true, shake: 'weak' },
};
