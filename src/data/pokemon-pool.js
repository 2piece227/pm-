/**
 * 포켓몬 풀 — 리그 트레이너들의 파티를 조립하는 재료. (SPEC §1-2 데이터 주도)
 *
 * 새 포켓몬을 늘리려면 여기 항목 하나만 추가하면 된다. 팀 조립 로직은 안 건드린다.
 *
 * tier — 종족 자체의 강함. 소속사/트레이너 등급에 따라 어느 tier를 뽑을지가 갈린다.
 *   3 = 의사전설·최상위   2 = 준수한 주력   1 = 초반 도로 수준(로켓단 "조무래기 양성"용)
 *
 * role — 노력치를 어디에 넣을지 결정한다. (SPEC §13-3 "노력치" 레버)
 *   phys 물리 어태커 / spec 특수 어태커 / wall 내구형
 *   소속사의 육성 노하우(evLevel)에 따라 같은 종족이라도 노력치가 다르게 박힌다 —
 *   "자금은 있지만 육성 노하우가 약한" 무지개 코퍼레이션 같은 컨셉이 여기서 나온다.
 */
export const POKEMON_POOL = [
  /* ---------- tier 3: 의사전설·최상위 ---------- */
  { species: 'Garchomp', tier: 3, role: 'phys', ability: 'Rough Skin', nature: 'Jolly', item: 'Leftovers',
    moves: ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Rock Slide'] },
  { species: 'Dragonite', tier: 3, role: 'phys', ability: 'Multiscale', nature: 'Adamant', item: 'Leftovers',
    moves: ['Outrage', 'Extreme Speed', 'Earthquake', 'Dragon Dance'] },
  { species: 'Tyranitar', tier: 3, role: 'phys', ability: 'Sand Stream', nature: 'Adamant', item: 'Leftovers',
    moves: ['Stone Edge', 'Crunch', 'Earthquake', 'Dragon Dance'] },
  { species: 'Dragapult', tier: 3, role: 'spec', ability: 'Clear Body', nature: 'Timid', item: 'Choice Specs',
    moves: ['Draco Meteor', 'Shadow Ball', 'Flamethrower', 'Thunderbolt'] },
  { species: 'Metagross', tier: 3, role: 'phys', ability: 'Clear Body', nature: 'Adamant', item: 'Leftovers',
    moves: ['Iron Head', 'Earthquake', 'Zen Headbutt', 'Bullet Punch'] },
  { species: 'Salamence', tier: 3, role: 'phys', ability: 'Intimidate', nature: 'Adamant', item: 'Life Orb',
    moves: ['Outrage', 'Earthquake', 'Dragon Dance', 'Crunch'] },
  { species: 'Hydreigon', tier: 3, role: 'spec', ability: 'Levitate', nature: 'Timid', item: 'Life Orb',
    moves: ['Draco Meteor', 'Dark Pulse', 'Flamethrower', 'Nasty Plot'] },
  { species: 'Volcarona', tier: 3, role: 'spec', ability: 'Flame Body', nature: 'Modest', item: 'Leftovers',
    moves: ['Fire Blast', 'Bug Buzz', 'Quiver Dance', 'Giga Drain'] },
  { species: 'Landorus-Therian', tier: 3, role: 'phys', ability: 'Intimidate', nature: 'Adamant', item: 'Leftovers',
    moves: ['Earthquake', 'Stone Edge', 'U-turn', 'Swords Dance'] },
  { species: 'Gholdengo', tier: 3, role: 'spec', ability: 'Good as Gold', nature: 'Modest', item: 'Leftovers',
    moves: ['Shadow Ball', 'Make It Rain', 'Nasty Plot', 'Focus Blast'] },

  /* ---------- tier 2: 준수한 주력 ---------- */
  { species: 'Corviknight', tier: 2, role: 'wall', ability: 'Pressure', nature: 'Impish', item: 'Leftovers',
    moves: ['Body Press', 'Iron Head', 'Roost', 'Bulk Up'] },
  { species: 'Toxapex', tier: 2, role: 'wall', ability: 'Regenerator', nature: 'Bold', item: 'Leftovers',
    moves: ['Scald', 'Toxic', 'Recover', 'Sludge Bomb'] },
  { species: 'Charizard', tier: 2, role: 'spec', ability: 'Blaze', nature: 'Modest', item: 'Leftovers',
    moves: ['Flamethrower', 'Air Slash', 'Dragon Pulse', 'Solar Beam'] },
  { species: 'Blissey', tier: 2, role: 'wall', ability: 'Natural Cure', nature: 'Bold', item: 'Leftovers',
    moves: ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Shadow Ball'] },
  { species: 'Ferrothorn', tier: 2, role: 'wall', ability: 'Iron Barbs', nature: 'Relaxed', item: 'Leftovers',
    moves: ['Power Whip', 'Gyro Ball', 'Leech Seed', 'Protect'] },
  { species: 'Gyarados', tier: 2, role: 'phys', ability: 'Intimidate', nature: 'Adamant', item: 'Leftovers',
    moves: ['Waterfall', 'Crunch', 'Dragon Dance', 'Earthquake'] },
  { species: 'Arcanine', tier: 2, role: 'phys', ability: 'Intimidate', nature: 'Adamant', item: 'Life Orb',
    moves: ['Flare Blitz', 'Wild Charge', 'Extreme Speed', 'Close Combat'] },
  { species: 'Lucario', tier: 2, role: 'phys', ability: 'Inner Focus', nature: 'Adamant', item: 'Life Orb',
    moves: ['Close Combat', 'Meteor Mash', 'Swords Dance', 'Extreme Speed'] },
  { species: 'Milotic', tier: 2, role: 'wall', ability: 'Marvel Scale', nature: 'Bold', item: 'Leftovers',
    moves: ['Scald', 'Recover', 'Ice Beam', 'Toxic'] },
  { species: 'Snorlax', tier: 2, role: 'wall', ability: 'Thick Fat', nature: 'Adamant', item: 'Leftovers',
    moves: ['Body Slam', 'Crunch', 'Earthquake', 'Curse'] },
  { species: 'Alakazam', tier: 2, role: 'spec', ability: 'Magic Guard', nature: 'Timid', item: 'Life Orb',
    moves: ['Psychic', 'Shadow Ball', 'Focus Blast', 'Calm Mind'] },
  { species: 'Gengar', tier: 2, role: 'spec', ability: 'Cursed Body', nature: 'Timid', item: 'Life Orb',
    moves: ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Nasty Plot'] },
  { species: 'Scizor', tier: 2, role: 'phys', ability: 'Technician', nature: 'Adamant', item: 'Leftovers',
    moves: ['Bullet Punch', 'U-turn', 'Swords Dance', 'Knock Off'] },
  { species: 'Rotom-Wash', tier: 2, role: 'spec', ability: 'Levitate', nature: 'Modest', item: 'Leftovers',
    moves: ['Hydro Pump', 'Thunderbolt', 'Volt Switch', 'Will-O-Wisp'] },

  /* ---------- tier 1: 초반 도로 수준 ---------- */
  { species: 'Raticate', tier: 1, role: 'phys', ability: 'Guts', nature: 'Jolly', item: 'Leftovers',
    moves: ['Body Slam', 'Crunch', 'Sucker Punch', 'Swords Dance'] },
  { species: 'Fearow', tier: 1, role: 'phys', ability: 'Keen Eye', nature: 'Jolly', item: 'Leftovers',
    moves: ['Drill Peck', 'Drill Run', 'U-turn', 'Steel Wing'] },
  { species: 'Golbat', tier: 1, role: 'phys', ability: 'Inner Focus', nature: 'Jolly', item: 'Leftovers',
    moves: ['Air Slash', 'Sludge Bomb', 'Roost', 'Toxic'] },
  { species: 'Persian', tier: 1, role: 'phys', ability: 'Limber', nature: 'Jolly', item: 'Leftovers',
    moves: ['Double-Edge', 'Play Rough', 'U-turn', 'Nasty Plot'] },
  { species: 'Arbok', tier: 1, role: 'phys', ability: 'Intimidate', nature: 'Adamant', item: 'Leftovers',
    moves: ['Poison Jab', 'Earthquake', 'Crunch', 'Coil'] },
  { species: 'Sandslash', tier: 1, role: 'phys', ability: 'Sand Veil', nature: 'Adamant', item: 'Leftovers',
    moves: ['Earthquake', 'Rock Slide', 'Swords Dance', 'Knock Off'] },
  { species: 'Dodrio', tier: 1, role: 'phys', ability: 'Early Bird', nature: 'Jolly', item: 'Life Orb',
    moves: ['Brave Bird', 'Double-Edge', 'Drill Run', 'Quick Attack'] },
  { species: 'Hypno', tier: 1, role: 'wall', ability: 'Insomnia', nature: 'Bold', item: 'Leftovers',
    moves: ['Psychic', 'Thunder Wave', 'Toxic', 'Protect'] },
  { species: 'Weezing', tier: 1, role: 'wall', ability: 'Levitate', nature: 'Bold', item: 'Leftovers',
    moves: ['Sludge Bomb', 'Will-O-Wisp', 'Pain Split', 'Flamethrower'] },
  { species: 'Marowak', tier: 1, role: 'phys', ability: 'Rock Head', nature: 'Adamant', item: 'Leftovers',
    moves: ['Earthquake', 'Rock Slide', 'Knock Off', 'Swords Dance'] },
  { species: 'Kingler', tier: 1, role: 'phys', ability: 'Hyper Cutter', nature: 'Adamant', item: 'Leftovers',
    moves: ['Crabhammer', 'Rock Slide', 'X-Scissor', 'Swords Dance'] },
  { species: 'Tauros', tier: 1, role: 'phys', ability: 'Intimidate', nature: 'Jolly', item: 'Life Orb',
    moves: ['Double-Edge', 'Earthquake', 'Rock Slide', 'Zen Headbutt'] },
];

/**
 * 노력치 배분 — role별로 어디에 넣을지만 정하고, 얼마나 넣을지는 소속사 육성 수준이 정한다.
 * evLevel 0 = 무투자(노하우 없음) ~ 1 = 252/252 풀투자(정통 육성).
 */
const EV_SPREAD = {
  phys: ['atk', 'spe'],
  spec: ['spa', 'spe'],
  wall: ['hp', 'def'],
};

const EV_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/** 풀 항목 하나 → 포켓몬쇼다운 텍스트 블록 */
export function toShowdownBlock(entry, { evLevel = 1, level = 50 } = {}) {
  const lines = [`${entry.species} @ ${entry.item}`, `Ability: ${entry.ability}`, `Level: ${level}`];

  const invest = Math.round(252 * Math.max(0, Math.min(1, evLevel)));
  if (invest > 0) {
    const [a, b] = EV_SPREAD[entry.role];
    lines.push(`EVs: ${invest} ${EV_LABEL[a]} / ${invest} ${EV_LABEL[b]}`);
    lines.push(`Nature: ${entry.nature}`);
  }
  lines.push(`IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe`);
  for (const mv of entry.moves) lines.push(`- ${mv}`);
  return lines.join('\n');
}
