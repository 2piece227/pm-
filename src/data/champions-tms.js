/**
 * 기술머신 C — 포켓몬 챔피언스에서 쓸 수 있지만 스칼렛·바이올렛 기술머신(229개)에는 없는 메이저 기술.
 * 사용자 승인 목록(작업59): 선공기·주력기·회복·유틸·상태이상·랭크업·교체 계열. 신속은 뺐다.
 * 배울 수 있는 포켓몬은 챔피언스 기술표에 그 기술이 있는 종만 (engine/shop.js tmLearnable).
 * 가격은 일반 기술머신(1,500~8,000)보다 높게 [임시값].
 */
import { Dex } from '@pkmn/dex';

const MOVES = [
  /* 선공기 */
  'Sucker Punch', 'Fake Out', 'Aqua Jet', 'Shadow Sneak', 'Ice Shard', 'Bullet Punch', 'Mach Punch',
  /* 물리 주력기 */
  'Iron Tail', 'Superpower', 'Night Slash', 'Aqua Tail', 'Hammer Arm', 'Megahorn', 'Power Whip', 'Leaf Blade',
  'Head Smash', 'Icicle Crash', 'High Jump Kick', 'Wave Crash', 'Cross Chop', 'Drill Peck', 'Sacred Sword', 'Meteor Mash', 'Psycho Cut',
  /* 특수 주력기 */
  'Moonblast', 'Mystical Fire', 'Extrasensory', 'Discharge', 'Freeze-Dry', 'Boomburst',
  /* 회복 */
  'Roost', 'Recover', 'Wish', 'Synthesis', 'Slack Off', 'Strength Sap', 'Moonlight', 'Morning Sun',
  /* 유틸·상태이상·방해 */
  'Rapid Spin', 'Defog', 'Yawn', 'Hypnosis', 'Leech Seed', 'Sleep Powder', 'Glare', 'Stun Spore', 'Whirlwind',
  'Detect', 'Switcheroo', 'Aurora Veil', 'Sticky Web',
  /* 랭크업 */
  'Belly Drum', 'Shell Smash', 'Coil', 'Rock Polish',
  /* 교체·희생 */
  'Destiny Bond', 'Memento', 'Parting Shot', 'Healing Wish',
];

/** [임시값] 변화기 6,000 / 위력 80 미만 8,000 / 80~99 12,000 / 100 이상 16,000 / 선공기·회복기 15,000 */
export const CHAMPIONS_TM_PRICE = { status: 6000, weak: 8000, mid: 12000, strong: 16000, priorityOrHeal: 15000 };
function priceOf(name) {
  const mv = Dex.forGen(9).moves.get(name), P = CHAMPIONS_TM_PRICE;
  if ((mv.priority > 0 && mv.category !== 'Status') || mv.flags?.heal) return P.priorityOrHeal;
  if (mv.category === 'Status') return P.status;
  return mv.basePower >= 100 ? P.strong : mv.basePower >= 80 ? P.mid : P.weak;
}

/** 번호는 'C01'부터 — 상점·포켓몬 관리 창에 그대로 보인다 */
export const CHAMPIONS_TMS = MOVES.map((move, i) => ({ no: `C${String(i + 1).padStart(2, '0')}`, move, price: priceOf(move), champions: true }));
