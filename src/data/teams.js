/**
 * 팀 정의 — 포켓몬쇼다운 텍스트 포맷.
 * SPEC §8 검증 매치업을 실엔진에 그대로 재현한 프리셋과,
 * §8-(1) "평균 8~12턴" 목표를 위한 노력치/도구 투자 프리셋을 함께 둔다.
 */

/* SPEC §8 원본 조건: Lv50 / 노력치 0 / 무보정 / 개체값 31 / 도구 없음 */
const PROTO_A = `
Spiritomb
Ability: Pressure
Level: 50
IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe
- Shadow Ball
- Dark Pulse
- Psychic
- Curse

Garchomp
Ability: Rough Skin
Level: 50
IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe
- Earthquake
- Scale Shot
- Swords Dance
- Rock Tomb
`;

const PROTO_B = `
Dragapult
Ability: Clear Body
Level: 50
IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe
- Shadow Claw
- Dragon Darts
- Draco Meteor
- Shadow Ball

Charizard
Ability: Blaze
Level: 50
IVs: 31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe
- Flamethrower
- Air Slash
- Ancient Power
- Dragon Claw
`;

/* 내구 투자 + 도구. 배틀 길이를 늘려 기점기/집중력/멘탈이 발동할 틈을 만드는 실험용.
   성격 보정은 "안 쓰는 공격 스탯"만 깎도록 맞춘다 — 한쪽 화력만 깎으면 승률이 100:0으로 튄다. */
const TUNED_A = `
Spiritomb @ Leftovers
Ability: Pressure
Level: 50
EVs: 252 HP / 252 SpD / 4 SpA
Nature: Calm
- Shadow Ball
- Dark Pulse
- Psychic
- Curse

Garchomp @ Leftovers
Ability: Rough Skin
Level: 50
EVs: 252 HP / 252 Def / 4 Atk
Nature: Impish
- Earthquake
- Scale Shot
- Swords Dance
- Rock Tomb
`;

const TUNED_B = `
Dragapult @ Leftovers
Ability: Clear Body
Level: 50
EVs: 252 HP / 252 Def / 4 Atk
Nature: Impish
- Shadow Claw
- Dragon Darts
- Draco Meteor
- Shadow Ball

Charizard @ Leftovers
Ability: Blaze
Level: 50
EVs: 252 HP / 252 SpD / 4 SpA
Nature: Calm
- Flamethrower
- Air Slash
- Ancient Power
- Dragon Claw
`;

/*
 * 6마리 파티. SPEC §13 "팀 빌딩 + 배틀 길이 튜닝"을 실질적으로 검증하기 위한 세트.
 * 교체 AI(scoreSwitch)가 벤치 5마리 중에서 고르는 것까지 확인하려는 것이므로,
 * 상성이 갈리는 타입(물리엄/내구형/공격형)을 일부러 섞었다.
 */
const FULL6_A = `
Garchomp @ Leftovers
Ability: Rough Skin
Level: 50
EVs: 252 HP / 252 Atk / 4 Spe
Nature: Adamant
- Earthquake
- Scale Shot
- Swords Dance
- Rock Tomb

Dragapult @ Choice Specs
Ability: Clear Body
Level: 50
EVs: 252 SpA / 4 SpD / 252 Spe
Nature: Timid
- Shadow Ball
- Draco Meteor
- Dragon Darts
- Flamethrower

Ferrothorn @ Leftovers
Ability: Iron Barbs
Level: 50
EVs: 252 HP / 252 Def / 4 SpD
Nature: Relaxed
- Gyro Ball
- Power Whip
- Curse
- Rock Tomb

Charizard @ Leftovers
Ability: Blaze
Level: 50
EVs: 252 HP / 252 SpA / 4 Spe
Nature: Modest
- Flamethrower
- Air Slash
- Ancient Power
- Dragon Claw

Tyranitar @ Leftovers
Ability: Sand Stream
Level: 50
EVs: 252 HP / 252 Atk / 4 SpD
Nature: Adamant
- Stone Edge
- Crunch
- Earthquake
- Swords Dance

Blissey @ Leftovers
Ability: Natural Cure
Level: 50
EVs: 252 HP / 252 Def / 4 SpD
Nature: Bold
- Seismic Toss
- Shadow Ball
- Soft-Boiled
- Toxic
`;

const FULL6_B = `
Landorus-Therian @ Leftovers
Ability: Intimidate
Level: 50
EVs: 252 HP / 252 Atk / 4 Def
Nature: Adamant
- Earthquake
- Stone Edge
- U-turn
- Swords Dance

Corviknight @ Leftovers
Ability: Pressure
Level: 50
EVs: 252 HP / 252 Def / 4 SpD
Nature: Impish
- Body Press
- Iron Head
- Roost
- Bulk Up

Toxapex @ Leftovers
Ability: Regenerator
Level: 50
EVs: 252 HP / 252 Def / 4 SpD
Nature: Bold
- Scald
- Toxic
- Recover
- Venoshock

Volcarona @ Leftovers
Ability: Flame Body
Level: 50
EVs: 252 HP / 252 SpA / 4 Spe
Nature: Modest
- Fire Blast
- Bug Buzz
- Quiver Dance
- Giga Drain

Dragonite @ Leftovers
Ability: Multiscale
Level: 50
EVs: 252 HP / 252 Atk / 4 Spe
Nature: Adamant
- Outrage
- Extreme Speed
- Earthquake
- Dragon Dance

Gholdengo @ Leftovers
Ability: Good as Gold
Level: 50
EVs: 252 HP / 252 SpA / 4 SpD
Nature: Modest
- Shadow Ball
- Make It Rain
- Nasty Plot
- Focus Blast
`;

export const TEAM_PRESETS = {
  proto: { label: '프로토 재현 (노력치 0 · 도구 없음)', A: PROTO_A, B: PROTO_B },
  tuned: { label: '내구 투자 (252 HP + 방어 · 남은음식)', A: TUNED_A, B: TUNED_B },
  full6: { label: '6마리 파티 (교체 검증용)', A: FULL6_A, B: FULL6_B },
};
