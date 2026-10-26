/**
 * NPC 장비 — 상대 트레이너가 **배운 기술 중 쓸 만한 4개를 고르고, 도구를 쥐여 주고, 키스톤을 챙긴다.**
 *
 * 왜 필요한가:
 *   레벨업 기술은 "칸이 차 있으면 덮어쓰지 않는다"(플레이어가 직접 고른다). 그런데 NPC는 아무도
 *   골라 주지 않아서 파이리 때 배운 울음소리·불꽃세례를 리자몽이 돼서도 그대로 들고 있었다.
 *   지닌 도구·키스톤도 NPC에게는 아예 없어서 상대는 메가진화를 한 번도 하지 않았다.
 *
 * 원칙:
 *   - 배운 기술(learned) 안에서 고른다. Lv35 이상(대전용 장비를 받는 NPC)은 포켓몬 챔피언스에서 그 종이 쓸 수 있는
 *     기술도 후보에 넣는다 (플레이어도 기술머신으로 가르칠 수 있는 범위). 알 기술은 주지 않는다.
 *   - 난수를 쓰지 않는다. 같은 파티면 같은 장비가 나와 게임 난수 흐름이 그대로다.
 *   - 원작 데이터를 그대로 쓰는 관장 파티(기술·도구가 정해져 있다)는 건드리지 않는다.
 *   - 우리가 준 도구에는 `npcItem` 표시를 남겨, 진화하거나 강해지면 다시 고른다. 원래 들고 있던 도구는 그대로.
 * 점수는 전부 [임시값] — 체감 보고 조정.
 */
import { Dex } from '@pkmn/dex';
import { HELD_ITEMS } from '../data/items.gen.js';
import { championsLearnset } from '../data/champions.js';

const GEN = Dex.forGen(9);

/* 쓸 만한 변화기만 점수를 준다. 목록에 없는 변화기(울음소리·꼬리흔들기·연막 등)는 0점 → 뽑히지 않는다 */
const PHYS_SETUP = { swordsdance: 95, dragondance: 100, bulkup: 85, honeclaws: 60, coil: 80, victorydance: 95, tidyup: 90, bellydrum: 60, curse: 60, shiftgear: 85 };
const SPEC_SETUP = { nastyplot: 95, calmmind: 85, quiverdance: 100, tailglow: 95, takeheart: 85 };
const BOTH_SETUP = { shellsmash: 100, workup: 55, growth: 55, agility: 50, rockpolish: 50, autotomize: 45, geomancy: 70 };
const STATUS_VALUE = {
  recover: 80, roost: 80, softboiled: 80, milkdrink: 80, slackoff: 80, shoreup: 75, strengthsap: 80,
  synthesis: 65, moonlight: 65, morningsun: 65, wish: 55, rest: 40, painsplit: 50,
  stealthrock: 75, spikes: 65, toxicspikes: 55, stickyweb: 60,
  spore: 105, sleeppowder: 75, lovelykiss: 55, hypnosis: 50, sing: 40, grasswhistle: 40, darkvoid: 60, yawn: 55,
  willowisp: 70, thunderwave: 70, glare: 75, stunspore: 55, toxic: 70, poisonpowder: 25, confuseray: 25,
  leechseed: 60, substitute: 45, protect: 30, reflect: 45, lightscreen: 45, auroraveil: 60,
  taunt: 45, encore: 45, tailwind: 50, partingshot: 45, destinybond: 30, healbell: 30, aromatherapy: 30,
  defog: 30, haze: 30, trickroom: 30, raindance: 35, sunnyday: 35, sandstorm: 30, snowscape: 30, chillyreception: 45,
};
/* 위력 숫자만 보면 좋아 보이지만 실제로는 쓰기 어려운 공격기 */
const ATTACK_PENALTY = {
  dreameater: 0.2, focuspunch: 0.3, lastresort: 0.3, belch: 0.2, synchronoise: 0.2, burnup: 0.4, steelroller: 0.4,
  futuresight: 0.6, doomdesire: 0.6, fakeout: 0.6, snore: 0.1, spitup: 0.2, natural: 0.5, naturalgift: 0.3,
  outrage: 0.75, thrash: 0.6, petaldance: 0.7, rollout: 0.5, iceball: 0.5, uproar: 0.6, round: 0.8,
  lashout: 0.9, solarbeam: 1, solarblade: 1,
};
/* 위력 0으로 적혀 있지만 실제로는 쓸 만한 가변 위력기 — 대표값 */
const VARIABLE_POWER = { lowkick: 70, grassknot: 70, heavyslam: 70, heatcrash: 70, gyroball: 70, electroball: 70, return: 100, frustration: 0, punishment: 60, storedpower: 40, powertrip: 40, magnitude: 70, present: 30, foulplay: 95, seismictoss: 0, nightshade: 0, finalgambit: 0, endeavor: 0, superfang: 0, ruination: 0, naturesmadness: 0 };

const TYPE_BOOST = { Fire: 'Charcoal', Water: 'Mystic Water', Grass: 'Miracle Seed', Electric: 'Magnet', Ice: 'Never-Melt Ice', Fighting: 'Black Belt', Poison: 'Poison Barb', Ground: 'Soft Sand', Flying: 'Sharp Beak', Psychic: 'Twisted Spoon', Bug: 'Silver Powder', Rock: 'Hard Stone', Ghost: 'Spell Tag', Dragon: 'Dragon Fang', Dark: 'Black Glasses', Steel: 'Metal Coat', Normal: 'Silk Scarf', Fairy: 'Fairy Feather' };

/** 레벨 구간 [임시값] — 이 레벨부터 대전용 도구(생명의구슬·구애 시리즈 등), 이 레벨부터 키스톤 */
export const LOADOUT = { competitiveLevel: 35, boosterLevel: 20, megaLevel: 35 };

const speciesOf = (name) => GEN.species.get(name);
const isStatus = (mv) => mv.category === 'Status';

/** 이 개체가 지금 지닌 메가스톤으로 변할 모습 (없으면 그대로) */
function battleForme(mon) {
  const sp = speciesOf(mon.species);
  const forme = HELD_ITEMS[mon.item]?.evolves === sp.name ? megaFormeOf(mon.item, sp.name) : null;
  return (forme && speciesOf(forme)) || sp;
}
/** 메가스톤 → 메가 모습 이름 (데이터 판본에 따라 문자열 또는 {종: 모습}) */
function megaFormeOf(stoneName, speciesName) {
  const ms = GEN.items.get(stoneName)?.megaStone;
  return typeof ms === 'string' ? ms : ms?.[speciesName] || null;
}

/** 물리 쪽 비중 0~1 (공격 ÷ (공격+특공)) */
const physShare = (sp) => sp.baseStats.atk / Math.max(1, sp.baseStats.atk + sp.baseStats.spa);

function attackScore(mv, sp, level) {
  let bp = mv.basePower || VARIABLE_POWER[mv.id] || 0;
  if (mv.damage === 'level') bp = Math.min(100, level * 1.1);
  if (!bp) return 0;
  if (Array.isArray(mv.multihit)) bp *= 3; else if (mv.multihit) bp *= mv.multihit;
  const acc = mv.accuracy === true ? 1 : mv.accuracy / 100;
  const stab = sp.types.includes(mv.type) ? 1.5 : 1;
  const top = Math.max(sp.baseStats.atk, sp.baseStats.spa);
  const stat = (mv.category === 'Physical' ? sp.baseStats.atk : sp.baseStats.spa) / top;
  let k = ATTACK_PENALTY[mv.id] ?? 1;
  if (mv.flags?.charge && !['solarbeam', 'solarblade', 'electroshot'].includes(mv.id)) k *= 0.5;
  if (mv.flags?.charge && ['solarbeam', 'solarblade'].includes(mv.id)) k *= 0.6;
  if (mv.self?.volatileStatus === 'mustrecharge') k *= 0.55;
  if (mv.selfdestruct) k *= 0.3;
  if (mv.ohko) k *= 0.3;
  if (mv.recoil) k *= 0.92;
  if (mv.self?.boosts && Object.values(mv.self.boosts).some((v) => v < 0)) k *= 0.88;
  if (mv.priority > 0 && bp >= 40) k *= 1.1;
  if (mv.drain) k *= 1.05;
  return bp * acc * stab * stat * k;
}

function statusScore(mv, sp) {
  const id = mv.id;
  const phys = physShare(sp);
  if (id in PHYS_SETUP) return PHYS_SETUP[id] * Math.min(1, phys * 1.6);
  if (id in SPEC_SETUP) return SPEC_SETUP[id] * Math.min(1, (1 - phys) * 1.6);
  if (id in BOTH_SETUP) return BOTH_SETUP[id];
  if (id === 'curse' && sp.types.includes('Ghost')) return 0;
  return STATUS_VALUE[id] || 0;
}
const isSetup = (id) => id in PHYS_SETUP || id in SPEC_SETUP || id in BOTH_SETUP;

/**
 * 배운 기술 중 4개 — 자속 강한 기술부터, 같은 타입은 겹치지 않게, 쓸 만한 변화기는 최대 2개.
 * 공격기는 최소 2개 (공격기를 2개 못 배웠으면 있는 만큼).
 * @param extra 배운 기술 말고 더 볼 기술 id (강한 NPC의 챔피언스 기술)
 */
export function bestMoves(mon, extra = []) {
  const sp = battleForme(mon);
  const pool = [...new Set([...(mon.learned || []), ...(mon.moves || []), ...extra])]
    .map((name) => GEN.moves.get(name)).filter((mv) => mv?.exists && mv.id !== 'struggle');
  const scored = pool.map((mv) => ({ mv, score: isStatus(mv) ? statusScore(mv, sp) : attackScore(mv, sp, mon.level) }));
  const attacksAvailable = scored.filter((s) => !isStatus(s.mv) && s.score > 0).length;
  const minAttacks = Math.min(2, attacksAvailable);

  const picked = [];
  while (picked.length < 4) {
    const types = new Set(picked.filter((s) => !isStatus(s.mv)).map((s) => s.mv.type));
    const attacks = picked.filter((s) => !isStatus(s.mv)).length;
    const statuses = picked.length - attacks;
    const mustAttack = 4 - picked.length <= minAttacks - attacks;
    let best = null, bestV = 0;
    for (const s of scored) {
      if (picked.includes(s)) continue;
      let v = s.score;
      if (isStatus(s.mv)) {
        if (mustAttack || statuses >= 2) continue;
        if (isSetup(s.mv.id) && picked.some((p) => isSetup(p.mv.id))) v *= 0.2;
      } else if (types.has(s.mv.type)) v *= 0.35;
      if (v > bestV) { bestV = v; best = s; }
    }
    if (!best) break;
    picked.push(best);
  }
  /* 쓸 만한 게 4개가 안 되면 원래 기술로 채운다 (낮은 레벨에서 몸통박치기·울음소리뿐인 경우) */
  const out = picked.map((s) => s.mv.name);
  for (const name of mon.moves || []) if (out.length < 4 && !out.includes(name)) out.push(name);
  return out.length ? out : (mon.moves || []);
}

/** 강한 NPC(대전용 장비를 받는 레벨)가 더 고를 수 있는 기술 — 포켓몬 챔피언스 기술표 */
const extraMoves = (mon) => (mon.level >= LOADOUT.competitiveLevel ? championsLearnset(mon.species) : []);

/** 이 종의 메가스톤들 (리자몽·뮤츠는 2개) */
export function megaStonesFor(speciesName) {
  return Object.entries(HELD_ITEMS)
    .filter(([en, v]) => v.cat === 'mega' && v.evolves === speciesName && speciesOf(megaFormeOf(en, speciesName) || '')?.exists)
    .map(([en]) => en);
}

/** 스톤이 여럿이면 이 개체의 기술 구성(물리/특수)에 맞는 쪽 */
function pickStone(mon, stones) {
  if (stones.length < 2) return stones[0] || null;
  const moves = bestMoves(mon, extraMoves(mon)).map((n) => GEN.moves.get(n)).filter((m) => m?.exists && !isStatus(m));
  const nPhys = moves.filter((m) => m.category === 'Physical').length;
  const phys = nPhys * 2 > moves.length || (nPhys * 2 === moves.length && physShare(speciesOf(mon.species)) >= 0.5);
  const fit = (en) => { const f = speciesOf(megaFormeOf(en, mon.species)); return f?.exists ? (phys ? f.baseStats.atk : f.baseStats.spa) : 0; };
  return [...stones].sort((a, b) => fit(b) - fit(a) || a.localeCompare(b))[0];
}

/** 지닌 도구 하나 — 파티에서 이미 쓴 도구는 피한다(도구 조항 대회 대비) */
function pickItem(mon, used) {
  const sp = speciesOf(mon.species);
  const moves = (mon.moves || []).map((n) => GEN.moves.get(n)).filter((m) => m?.exists);
  const attacks = moves.filter((m) => !isStatus(m));
  const { hp, def, spd, spe, atk, spa } = sp.baseStats;
  const bulk = hp + def + spd;
  const has = (ids) => moves.some((m) => ids.includes(m.id));
  const mainType = attacks.map((m) => m.type).find((t) => sp.types.includes(t)) || attacks[0]?.type;
  const wants = [];
  if (mon.level < LOADOUT.boosterLevel) wants.push('Oran Berry', 'Sitrus Berry');
  else if (mon.level < LOADOUT.competitiveLevel) {
    if (bulk >= 270) wants.push('Leftovers');
    if (mainType) wants.push(TYPE_BOOST[mainType]);
    wants.push('Sitrus Berry', 'Lum Berry');
  } else {
    if (speciesOf(sp.name).nfe) wants.push('Eviolite');
    const recovery = has(['recover', 'roost', 'softboiled', 'milkdrink', 'slackoff', 'shoreup', 'strengthsap', 'synthesis', 'moonlight', 'morningsun', 'wish', 'leechseed', 'rest']);
    const setup = moves.some((m) => isSetup(m.id));
    if (sp.types.includes('Poison') && (recovery || bulk >= 300)) wants.push('Black Sludge');
    if (recovery || bulk >= 330) wants.push('Leftovers');
    if (setup) wants.push(spe >= 80 ? 'Life Orb' : 'Lum Berry', 'Weakness Policy');
    if (attacks.length === 4 || (attacks.length === moves.length && attacks.length >= 3)) {
      if (spe >= 70 && spe <= 105) wants.push('Choice Scarf');
      wants.push(atk >= spa ? 'Choice Band' : 'Choice Specs');
      if (spd >= 85 && hp >= 80) wants.push('Assault Vest');
    }
    if (bulk < 230 && spe >= 90) wants.push('Focus Sash');
    wants.push('Life Orb', 'Expert Belt');
    if (mainType) wants.push(TYPE_BOOST[mainType]);
    wants.push('Sitrus Berry', 'Lum Berry', 'Leftovers', 'Shell Bell');
  }
  return wants.find((w) => w && HELD_ITEMS[w] && !used.has(w)) || null;
}

/**
 * NPC 트레이너 한 명을 배틀에 맞게 꾸린다 (파티를 직접 고친다).
 * @param {object} trainer  party 를 가진 트레이너
 * @param {{ items?: boolean, mega?: boolean }} opts  items=false면 기술만 (탐험의 현지 트레이너)
 */
export function outfitNpcTrainer(trainer, { items = true, mega = true } = {}) {
  const party = trainer?.party || [];
  if (!party.length) return trainer;

  /* 1. 메가진화 — 레벨이 되는 메가 가능 종이 있으면 키스톤과 스톤을 준다 (가장 레벨 높은 한 마리) */
  if (items && mega) {
    const holder = party.find((m) => HELD_ITEMS[m.item]?.cat === 'mega' && HELD_ITEMS[m.item].evolves === m.species);
    const cand = holder || [...party].filter((m) => m.level >= LOADOUT.megaLevel && megaStonesFor(m.species).length && (!m.item || m.npcItem))
      .sort((a, b) => b.level - a.level)[0];
    if (cand && !holder) { cand.item = pickStone(cand, megaStonesFor(cand.species)); cand.npcItem = true; }
    if (cand) trainer.keyStone = true;
  }

  /* 2. 기술 — 메가스톤이 정해진 뒤에 고른다 (메가리자몽X는 드래곤 자속) */
  for (const m of party) m.moves = bestMoves(m, items ? extraMoves(m) : []);

  /* 3. 도구 — 원래 들고 있던 도구는 그대로, 우리가 줬던 도구는 다시 고른다 */
  if (items) {
    const used = new Set(party.filter((m) => m.item && (!m.npcItem || HELD_ITEMS[m.item]?.cat === 'mega')).map((m) => m.item));
    for (const m of party) {
      const stoneOk = HELD_ITEMS[m.item]?.cat === 'mega' && HELD_ITEMS[m.item].evolves === m.species;
      if (m.item && (!m.npcItem || stoneOk)) continue;
      const it = pickItem(m, used);
      m.item = it; m.npcItem = !!it;
      if (it) used.add(it);
    }
  }
  return trainer;
}
