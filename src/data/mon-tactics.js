/**
 * 포켓몬별 전술 지시 — FM의 선수별 지시(Player Instructions)처럼.
 *
 *   mon.tactics = {
 *     role,                       역할 프리셋 (아래 ROLES) — 고르면 지시 값이 채워진다
 *     switchOut  -2..+2           교체: 끝까지 버팀 ↔ 자주 빠짐
 *     switchIn   -2..+2           투입: 아껴 둠(마지막까지) ↔ 적극 투입(받아내기)
 *     setup      -2..+2           랭크업: 안 함 ↔ 적극
 *     status     -2..+2           변화기·상태이상: 안 씀 ↔ 적극
 *     aim        -2..+2           공격: 명중 우선 ↔ 위력 우선
 *     lowHp      'preserve' | 'normal' | 'fight'   체력이 낮을 때: 빼서 보존 / 판단에 맡김 / 끝까지 싸움
 *     moves      { [moveId]: 'prefer' | 'avoid' | 'ban' }
 *     mega       true          메가진화 담당 (파티에 담당이 있으면 그 포켓몬만 메가진화)
 *     tera, dynamax            다음 업데이트용 자리 (테라스탈·다이맥스)
 *   }
 * 값은 [임시값] — 점수 보정 크기는 AI 테스트로 맞춘다.
 */
export const SLIDERS = [
  { key: 'switchOut', name: '교체', low: '끝까지 버팀', high: '자주 빠짐' },
  { key: 'switchIn', name: '투입', low: '아껴 둠', high: '적극 투입' },
  { key: 'setup', name: '랭크업', low: '안 함', high: '적극' },
  { key: 'status', name: '변화기', low: '안 씀', high: '적극' },
  { key: 'aim', name: '공격', low: '명중 우선', high: '위력 우선' },
];
export const LOW_HP = { preserve: '빼서 보존', normal: '판단에 맡김', fight: '끝까지 싸움' };
export const MOVE_ORDERS = { prefer: '우선', normal: '보통', avoid: '자제', ban: '금지' };

export const ROLES = {
  balanced: { name: '균형', desc: '트레이너 판단에 맡깁니다.', set: {} },
  lead: { name: '선봉', desc: '먼저 나가 흩뿌리기·상태이상으로 판을 깝니다. 쓰러져도 괜찮습니다.', set: { status: 2, setup: -1, switchOut: -1, lowHp: 'fight' } },
  setter: { name: '기점 마련', desc: '안전할 때 랭크를 쌓고 그대로 밀고 나갑니다.', set: { setup: 2, switchOut: -1, aim: 0 } },
  sweeper: { name: '스위퍼', desc: '강한 기술로 쓸어 담습니다. 무리한 교체는 하지 않습니다.', set: { setup: 1, switchOut: -1, aim: 1, status: -1 } },
  wall: { name: '받이', desc: '교체로 공격을 받아 내고 변화기로 버팁니다.', set: { switchIn: 2, status: 1, setup: -1, lowHp: 'preserve' } },
  pivot: { name: '피벗', desc: '불리하면 빠지고 유리할 때 들어옵니다.', set: { switchOut: 2, switchIn: 1 } },
  support: { name: '서포터', desc: '변화기와 상태이상으로 팀을 돕습니다.', set: { status: 2, setup: -1, aim: -1 } },
  ace: { name: '에이스', desc: '마지막까지 아꼈다가 승부를 끝냅니다.', set: { switchIn: -2, setup: 1, aim: 1, lowHp: 'preserve' } },
  sack: { name: '희생', desc: '다른 포켓몬이 안전하게 나오도록 끝까지 버팁니다.', set: { switchOut: -2, lowHp: 'fight', status: 1 } },
};

export const defaultTactics = () => ({ role: 'balanced', switchOut: 0, switchIn: 0, setup: 0, status: 0, aim: 0, lowHp: 'normal', moves: {}, mega: false });
export const tacticsOf = mon => ({ ...defaultTactics(), ...(mon?.tactics || {}) });
export function applyRole(mon, role) {
  const base = defaultTactics();
  mon.tactics = { ...base, ...(ROLES[role]?.set || {}), role, moves: { ...(mon.tactics?.moves || {}) }, mega: !!mon.tactics?.mega };
  return mon.tactics;
}

/* [임시값] 지시 1칸당 점수 보정 */
export const TACTIC_SCALE = { switchOut: 14, switchIn: 10, setup: 24, status: 14, aimPower: 0.08, aimAccuracy: 0.45, lowHpPreserve: 22, lowHpFight: 26, prefer: 16, avoid: 16, lowHp: 0.35, aceHold: 14 };
