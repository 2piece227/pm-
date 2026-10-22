/**
 * 탐험 물품 — 트레이너 가방에 넣어 보내는 볼·회복약.
 * 이름·설명·원작 가격은 items.gen.js(PokeAPI 한국어), 효과는 여기서 원작대로 정의한다.
 *
 * 볼 배율(ball): 숫자면 고정 배율, 문자열이면 조건부(원작 9세대 기준, explore.js의 ballModifier).
 * [임시값] 원작에서 상점 판매가 없는 볼(가로판매 볼 — 레벨·루어·문·프렌드·러브·헤비·스피드볼)은 500.
 */
import { SUPPLY_ITEMS } from './items.gen.js';

const EFFECT = {
  pokeBall: { kind: 'ball', ball: 1 }, greatBall: { kind: 'ball', ball: 1.5 }, ultraBall: { kind: 'ball', ball: 2 },
  premierBall: { kind: 'ball', ball: 1 }, luxuryBall: { kind: 'ball', ball: 1 }, healBall: { kind: 'ball', ball: 1 },
  netBall: { kind: 'ball', ball: 'net' }, diveBall: { kind: 'ball', ball: 'dive' }, nestBall: { kind: 'ball', ball: 'nest' },
  repeatBall: { kind: 'ball', ball: 'repeat' }, timerBall: { kind: 'ball', ball: 'timer' }, duskBall: { kind: 'ball', ball: 'dusk' },
  quickBall: { kind: 'ball', ball: 'quick' }, levelBall: { kind: 'ball', ball: 'level' }, lureBall: { kind: 'ball', ball: 'lure' },
  moonBall: { kind: 'ball', ball: 'moon' }, friendBall: { kind: 'ball', ball: 1 }, loveBall: { kind: 'ball', ball: 'love' },
  heavyBall: { kind: 'ball', ball: 'heavy' }, fastBall: { kind: 'ball', ball: 'fast' },
  /* 회복량은 7세대 이후 원작 값 */
  potion: { kind: 'heal', hp: 20 }, superPotion: { kind: 'heal', hp: 60 }, hyperPotion: { kind: 'heal', hp: 120 },
  maxPotion: { kind: 'heal', hp: 'full' }, fullRestore: { kind: 'heal', hp: 'full', cures: 'all' },
  freshWater: { kind: 'heal', hp: 30 }, sodaPop: { kind: 'heal', hp: 50 }, lemonade: { kind: 'heal', hp: 70 },
  moomooMilk: { kind: 'heal', hp: 100 }, energyPowder: { kind: 'heal', hp: 60 }, energyRoot: { kind: 'heal', hp: 120 },
  revive: { kind: 'revive', hp: 0.5 }, maxRevive: { kind: 'revive', hp: 1 }, revivalHerb: { kind: 'revive', hp: 1 },
  antidote: { kind: 'cure', cures: ['psn', 'tox'] }, paralyzeHeal: { kind: 'cure', cures: ['par'] }, awakening: { kind: 'cure', cures: ['slp'] },
  burnHeal: { kind: 'cure', cures: ['brn'] }, iceHeal: { kind: 'cure', cures: ['frz'] }, fullHeal: { kind: 'cure', cures: 'all' }, healPowder: { kind: 'cure', cures: 'all' },
  ether: { kind: 'pp', pp: 10, all: false }, maxEther: { kind: 'pp', pp: 'full', all: false },
  elixir: { kind: 'pp', pp: 10, all: true }, maxElixir: { kind: 'pp', pp: 'full', all: true },
};
const NO_SHOP_PRICE = 500; // [임시값]

export const SUPPLY_KINDS = { ball: '몬스터볼', heal: '회복약', revive: '기력 회복', cure: '상태이상 회복', pp: 'PP 회복' };
export const SUPPLIES = Object.fromEntries(Object.entries(EFFECT).filter(([k]) => SUPPLY_ITEMS[k]).map(([k, e]) => {
  const g = SUPPLY_ITEMS[k];
  return [k, { ...e, key: k, name: g.ko, desc: g.desc, icon: g.icon, price: g.price || NO_SHOP_PRICE, estimated: !g.price,
    heal: typeof e.hp === 'number' && e.kind === 'heal' ? e.hp : undefined }];
}));
export const BALL_KEYS = Object.keys(SUPPLIES).filter(k => SUPPLIES[k].kind === 'ball');
export const ballCount = bag => BALL_KEYS.reduce((n, k) => n + (bag?.[k] || 0), 0);
