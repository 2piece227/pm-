/**
 * 기술 애니메이션의 **방향이 뒤집히지 않는지** 지킨다.
 *
 * 있었던 버그: 좌표계를 통째로 180° 돌려서, 상대가 쓰면 중력이 뒤집혔다 —
 * 스톤샤워의 돌이 아래에서 위로 솟고, 대지의힘이 위에서 아래로 꽂혔다.
 * 치근거리기는 그림이 시전자에게 붙어버려서 몸만 상대에게 가고 이펙트는 제자리에 남았다.
 *
 * 규칙:
 *   · focus 1(대상) / 2(시전자) / 4(화면) 은 **위아래가 세상 기준**이다.
 *     누가 쓰든 기준점 대비 y 방향이 같아야 한다.
 *   · focus 1 그림은 **대상 쪽**에 있어야 한다. 시전자 쪽에 남으면 안 된다.
 *   · focus 3(축)만 통째로 뒤집힌다 — 화염방사가 반대로 뻗어야 하니까.
 */
import { makePlacement, loadAnim } from '../src/ui/move-fx.js';
import { SPECIES_POOL } from '../src/data/species-pool.js';

/* 실제 배틀 화면과 같은 배치 (p1 좌하단 / p2 우상단) */
const P1 = { x: 185, y: 326 };
const P2 = { x: 602, y: 158 };
const MAG = 2.1;
const BASE = { user: { x: 0, y: 0 }, target: { x: 128, y: -64 } };

const forCaster = (side) => makePlacement({
  userPos: side === 'p1' ? P1 : P2,
  targetPos: side === 'p1' ? P2 : P1,
  refPos: side === 'p1' ? P2 : P1,
  base: BASE, mag: MAG,
});
const A = forCaster('p1');
const B = forCaster('p2');

/** 풀에 실제로 쓰이는 기술 전부 + 상태이상 공통 연출 */
/* 풀에서 기술을 지운 뒤로는(레벨업으로 배운다) 대표 기술을 직접 나열한다.
   focus 종류(대상/시전자/축/화면)를 골고루 덮는 게 목적이다. */
const moves = [
  'Flamethrower', 'Thunderbolt', 'Ice Beam', 'Shadow Ball', 'Dark Pulse', 'Sludge Bomb',
  'Earthquake', 'Rock Slide', 'Stone Edge', 'Earth Power', 'Play Rough', 'Close Combat',
  'Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Calm Mind', 'Recover', 'Roost',
  'Draco Meteor', 'Air Slash', 'Crunch', 'Iron Head', 'Body Slam', 'Brave Bird',
  'Gigaton Hammer', 'Meteor Mash', 'Pyro Ball', 'Aqua Step', 'Ivy Cudgel', 'Bitter Blade',
  'Toxic', 'Will-O-Wisp', 'Thunder Wave', 'Leech Seed', 'Giga Drain', 'U-turn',
];
const commons = ['common-burn', 'common-poison', 'common-paralysis', 'common-sleep', 'common-frozen'];

let checked = 0;
const problems = [];

for (const name of [...moves, ...commons]) {
  const anim = await loadAnim(name);
  if (!anim) continue;
  checked++;
  const pull = { n: 0, a: 0, b: 0 };

  for (const frame of anim.frames) {
    for (const p of frame) {
      if (p.target !== 2) continue;
      const focus = p.focus ?? anim.position ?? 3;
      if (focus === 3) continue;   // 축 연출은 뒤집히는 게 맞다

      const a = A.place(p.x ?? 0, p.y ?? 0, focus);
      const b = B.place(p.x ?? 0, p.y ?? 0, focus);
      const origA = focus === 1 ? P2 : focus === 2 ? P1 : { x: (P1.x + P2.x) / 2, y: (P1.y + P2.y) / 2 };
      const origB = focus === 1 ? P1 : focus === 2 ? P2 : { x: (P1.x + P2.x) / 2, y: (P1.y + P2.y) / 2 };

      /* 위아래가 안 뒤집혔나 — 기준점 대비 세로 오프셋이 같아야 한다 */
      const dyA = a.y - origA.y;
      const dyB = b.y - origB.y;
      if (Math.abs(dyA - dyB) > 0.001) {
        problems.push(`${name}: focus${focus} 세로가 뒤집힘 (p1때 ${dyA.toFixed(1)} / p2때 ${dyB.toFixed(1)})`);
      }

      /* focus 1 그림 전체가 어디에 모여 있나 (기 모으는 앞부분은 시전자 근처가 정상이라
         조각 하나씩이 아니라 **연출 전체의 무게중심**으로 본다) */
      if (focus === 1) { pull.n++; pull.a += a.x; pull.b += b.x; }
    }
  }

  /* 대상 기준 연출은 대상 쪽에 모여 있어야 한다. 치근거리기가 시전자에게 붙어 있던 버그 */
  if (pull.n) {
    const ca = pull.a / pull.n;
    const cb = pull.b / pull.n;
    if (Math.abs(ca - P2.x) > Math.abs(ca - P1.x) || Math.abs(cb - P1.x) > Math.abs(cb - P2.x)) {
      problems.push(`${name}: 대상 기준 연출이 시전자 쪽에 모여 있다 (무게중심 p1때 ${ca.toFixed(0)} / p2때 ${cb.toFixed(0)})`);
    }
  }
}

const uniq = [...new Set(problems)];
console.log(`데이터가 있는 기술 ${checked}종 검사`);
console.log(uniq.length === 0
  ? '✅ 어느 쪽이 써도 방향이 유지된다'
  : `❌ 문제 ${uniq.length}건:\n   ${uniq.slice(0, 20).join('\n   ')}`);
