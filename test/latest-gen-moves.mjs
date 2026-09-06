/**
 * 최신 세대(8·9세대) 기술이 우리 표시 계층에서 제대로 처리되는지 훑는다.
 *
 * 확인하는 것:
 *   1) @pkmn/dex가 기술을 아는가 (엔진이 굴릴 수 있는가)
 *   2) 기술 애니메이션 데이터(pokerogue battle-anims)가 있는가
 *   3) 한글 이름표(ko.js MOVE_KO)가 있는가 — 없으면 자막에 영문이 뜬다
 *   4) 연출 원형(move-anim.js)이 표에 있는가 — 없으면 타입 기본값으로 떨어진다
 */
import { Dex } from '@pkmn/dex';
import { MOVE_KO, MOVE_TYPE } from '../src/data/ko.js';
import { ANIM_ALIAS, MOVE_ANIM, animArchetype } from '../src/data/move-anim.js';
import { animJsonUrl } from '../src/data/battle-assets.js';

/* 8·9세대 대표 기술 — 시그니처기·범용기·랭크업기를 섞었다 */
const GEN8 = [
  'Pyro Ball', 'Snipe Shot', 'Body Press', 'Breaking Swipe', 'Dragon Darts',
  'Scale Shot', 'Meteor Beam', 'Behemoth Blade', 'Behemoth Bash', 'Thunder Cage',
  'Dynamax Cannon', 'Skitter Smack', 'Burning Jealousy', 'Lash Out', 'Poltergeist',
  'Coaching', 'Corrosive Gas', 'Grassy Glide', 'Rising Voltage', 'Terrain Pulse',
  'Steel Roller', 'Scorching Sands', 'Jungle Healing', 'Wicked Blow', 'Surging Strikes',
  'Triple Axel', 'Dual Wingbeat', 'Obstruct', 'No Retreat', 'Clangorous Soul',
];
const GEN9 = [
  'Tera Blast', 'Ice Spinner', 'Pounce', 'Trailblaze', 'Chilling Water',
  'Hyper Drill', 'Twin Beam', 'Rage Fist', 'Armor Cannon', 'Bitter Blade',
  'Double Shock', 'Gigaton Hammer', 'Comeuppance', 'Aqua Cutter', 'Aqua Step',
  'Ruination', 'Collision Course', 'Electro Drift', 'Make It Rain', 'Spicy Extract',
  'Population Bomb', 'Salt Cure', 'Triple Dive', 'Mortal Spin', 'Kowtow Cleave',
  'Flower Trick', 'Torch Song', 'Psyblade', 'Hydro Steam', 'Blood Moon',
  'Matcha Gotcha', 'Syrup Bomb', 'Ivy Cudgel', 'Thunderclap', 'Tachyon Cutter',
];

const rows = [];
async function check(name, gen) {
  const mv = Dex.moves.get(name);
  const known = mv.exists;
  /* move-fx.js의 loadAnim과 같은 판정 — 배열/flat/keyed 세 형태를 다 받고,
     graphic이 비어 있어도(스프라이트만 움직이는 연출) 정상 데이터로 본다 */
  let anim = false, viaAlias = false;
  const source = ANIM_ALIAS[name] || name;
  viaAlias = source !== name;
  try {
    const res = await fetch(animJsonUrl(source), { method: 'GET' });
    if (res.ok) {
      const raw = await res.json();
      const node = Array.isArray(raw) ? raw[0]
        : Array.isArray(raw.frames) ? raw : raw['0'] || raw[Object.keys(raw)[0]];
      anim = !!(node && Array.isArray(node.frames) && node.frames.length);
    }
  } catch { /* 네트워크 실패는 없음으로 본다 */ }
  rows.push({
    gen, name, known, viaAlias,
    type: known ? mv.type.toLowerCase() : '-',
    ko: !!MOVE_KO[name],
    koType: !!MOVE_TYPE[name],
    anim,
    inTable: !!MOVE_ANIM[name],
    archetype: known ? animArchetype(name, mv.type.toLowerCase()) : '-',
  });
}

const all = [...GEN8.map((n) => [n, 8]), ...GEN9.map((n) => [n, 9])];
for (const [n, g] of all) await check(n, g);

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('기술', 22) + pad('세대', 5) + pad('엔진', 6) + pad('애니', 6) + pad('한글', 6) + pad('원형', 10));
console.log('-'.repeat(58));
for (const r of rows) {
  console.log(pad(r.name, 22) + pad(r.gen, 5) + pad(r.known ? 'O' : 'X', 6) +
              pad(r.anim ? (r.viaAlias ? '△' : 'O') : 'X', 6) + pad(r.ko ? 'O' : '-', 6) +
              pad(r.archetype + (r.inTable ? '' : '*'), 10));
}

const n = rows.length;
const sum = (f) => rows.filter(f).length;
console.log('\n' + '='.repeat(58));
console.log(`총 ${n}종 (8세대 ${GEN8.length} / 9세대 ${GEN9.length})`);
console.log(`  엔진이 아는 기술        ${sum((r) => r.known)}/${n}`);
console.log(`  애니메이션 데이터 있음  ${sum((r) => r.anim)}/${n}   (△ ${sum((r) => r.viaAlias && r.anim)}건은 비슷한 기술로 대체)`);
console.log(`  한글 이름표 있음        ${sum((r) => r.ko)}/${n}   ← 없으면 자막이 영문`);
console.log(`  원형 표에 등록됨        ${sum((r) => r.inTable)}/${n}   (* = 타입 기본값으로 떨어짐)`);

const noEngine = rows.filter((r) => !r.known);
const noAnim = rows.filter((r) => r.known && !r.anim);
if (noEngine.length) console.log(`\n엔진이 모르는 기술: ${noEngine.map((r) => r.name).join(', ')}`);
if (noAnim.length) console.log(`\n애니메이션 없는 기술 (CSS 폴백): ${noAnim.map((r) => r.name).join(', ')}`);
