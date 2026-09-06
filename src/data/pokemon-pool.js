/**
 * 포켓몬 풀 — 리그 트레이너들의 파티를 조립하는 재료. (SPEC §1-2 데이터 주도)
 *
 * 새 포켓몬을 늘리려면 여기 항목 하나만 추가하면 된다. 팀 조립 로직은 안 건드린다.
 *
 * tier — 종족 자체의 강함. 소속사/트레이너 등급에 따라 어느 tier를 뽑을지가 갈린다.
 *   3 = 의사전설·최상위   2 = 준수한 주력   1 = 초반 도로 수준(로켓단 "조무래기 양성"용)
 *
 * latest — 8·9세대 종. "최신 세대 위주" 프로필(team-builder의 latestOnly)이 이것만 골라 쓴다.
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

  /* ---------- tier 3: 최신 세대(8·9세대) ----------
     `latest: true`는 "최신 세대 위주로 파티를 짜라"는 프로필이 골라 쓴다.
     8·9세대 기술 연출을 실제 배틀에서 바로 확인하려고 넣었다. (team-builder의 latestOnly) */
  { species: 'Great Tusk', tier: 3, latest: true, role: 'phys', ability: 'Protosynthesis', nature: 'Jolly', item: 'Leftovers',
    moves: ['Headlong Rush', 'Close Combat', 'Ice Spinner', 'Rapid Spin'] },
  { species: 'Iron Valiant', tier: 3, latest: true, role: 'phys', ability: 'Quark Drive', nature: 'Jolly', item: 'Life Orb',
    moves: ['Moonblast', 'Close Combat', 'Knock Off', 'Swords Dance'] },
  { species: 'Kingambit', tier: 3, latest: true, role: 'phys', ability: 'Supreme Overlord', nature: 'Adamant', item: 'Leftovers',
    moves: ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Swords Dance'] },
  { species: 'Baxcalibur', tier: 3, latest: true, role: 'phys', ability: 'Thermal Exchange', nature: 'Jolly', item: 'Leftovers',
    moves: ['Glaive Rush', 'Icicle Crash', 'Dragon Dance', 'Earthquake'] },
  { species: 'Annihilape', tier: 3, latest: true, role: 'phys', ability: 'Defiant', nature: 'Adamant', item: 'Leftovers',
    moves: ['Rage Fist', 'Drain Punch', 'Bulk Up', 'Close Combat'] },
  { species: 'Ursaluna-Bloodmoon', tier: 3, latest: true, role: 'spec', ability: "Mind's Eye", nature: 'Modest', item: 'Life Orb',
    moves: ['Blood Moon', 'Earth Power', 'Vacuum Wave', 'Hyper Voice'] },

  /* ---------- tier 2: 최신 세대 ---------- */
  { species: 'Cinderace', tier: 2, latest: true, role: 'phys', ability: 'Libero', nature: 'Jolly', item: 'Life Orb',
    moves: ['Pyro Ball', 'High Jump Kick', 'U-turn', 'Sucker Punch'] },
  { species: 'Meowscarada', tier: 2, latest: true, role: 'phys', ability: 'Protean', nature: 'Jolly', item: 'Life Orb',
    moves: ['Flower Trick', 'Knock Off', 'U-turn', 'Play Rough'] },
  { species: 'Quaquaval', tier: 2, latest: true, role: 'phys', ability: 'Moxie', nature: 'Adamant', item: 'Life Orb',
    moves: ['Aqua Step', 'Close Combat', 'Ice Spinner', 'Swords Dance'] },
  { species: 'Skeledirge', tier: 2, latest: true, role: 'spec', ability: 'Unaware', nature: 'Bold', item: 'Leftovers',
    moves: ['Torch Song', 'Shadow Ball', 'Slack Off', 'Hex'] },
  { species: 'Ceruledge', tier: 2, latest: true, role: 'phys', ability: 'Flash Fire', nature: 'Adamant', item: 'Life Orb',
    moves: ['Bitter Blade', 'Shadow Sneak', 'Swords Dance', 'Close Combat'] },
  { species: 'Glimmora', tier: 2, latest: true, role: 'spec', ability: 'Toxic Debris', nature: 'Timid', item: 'Life Orb',
    moves: ['Power Gem', 'Sludge Wave', 'Earth Power', 'Mortal Spin'] },
  { species: 'Tinkaton', tier: 2, latest: true, role: 'phys', ability: 'Mold Breaker', nature: 'Jolly', item: 'Leftovers',
    moves: ['Gigaton Hammer', 'Play Rough', 'Knock Off', 'Swords Dance'] },

  /* ---------- tier 1: 최신 세대 ---------- */
  { species: 'Lokix', tier: 1, latest: true, role: 'phys', ability: 'Tinted Lens', nature: 'Jolly', item: 'Life Orb',
    moves: ['First Impression', 'Leech Life', 'Sucker Punch', 'U-turn'] },
  { species: 'Pawmot', tier: 1, latest: true, role: 'phys', ability: 'Volt Absorb', nature: 'Jolly', item: 'Leftovers',
    moves: ['Double Shock', 'Close Combat', 'Mach Punch', 'Nuzzle'] },
  { species: 'Klawf', tier: 1, latest: true, role: 'phys', ability: 'Anger Shell', nature: 'Adamant', item: 'Leftovers',
    moves: ['Stone Edge', 'Crabhammer', 'Swords Dance', 'X-Scissor'] },
  { species: 'Bombirdier', tier: 1, latest: true, role: 'phys', ability: 'Big Pecks', nature: 'Adamant', item: 'Life Orb',
    moves: ['Brave Bird', 'Knock Off', 'Rock Slide', 'U-turn'] },

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
 * 도구 사용 여부. **기본은 무도구(false)** — 도구가 붙으면 남은음식 회복 같은
 * 부수 효과가 매 턴 끼어들어 AI/밸런스 실험의 변인이 늘어난다.
 * 각 항목의 item 필드는 남겨두되(§0.2 스키마 유지), 켤 때만 쓴다.
 */
export const USE_ITEMS = false;

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
export function toShowdownBlock(entry, { evLevel = 1, level = 50, useItems = USE_ITEMS } = {}) {
  const head = useItems && entry.item ? `${entry.species} @ ${entry.item}` : entry.species;
  const lines = [head, `Ability: ${entry.ability}`, `Level: ${level}`];

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
