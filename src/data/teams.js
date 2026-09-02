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

export const TEAM_PRESETS = {
  proto: { label: '프로토 재현 (노력치 0 · 도구 없음)', A: PROTO_A, B: PROTO_B },
  tuned: { label: '내구 투자 (252 HP + 방어 · 남은음식)', A: TUNED_A, B: TUNED_B },
};
