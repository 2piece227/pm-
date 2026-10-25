/**
 * 어나더레드(Essentials) AI 이식 — 원작이 하는 판단을 그대로 하는지 장면별로 확인한다.
 * 제보(2026-10-25): 깨어진갑옷이 발동해 방어가 떨어지자 바로 교체해 도망갔다.
 */
import assert from 'node:assert/strict';
import { Battle, Dex, Teams } from '@pkmn/sim';
import { TrainerAI, makeRng } from '../src/ai/trainer-ai.js';

const GEN = Dex.forGen(9);
const FULL = { judge: 20, ops: 20, focus: 20, know: 20, mental: 20 };
const mon = (species, ability, moves, extra = '') => `${species}${extra ? ` @ ${extra}` : ''}\nAbility: ${ability}\nLevel: 50\nEVs: 0 HP\n${moves.map(m => `- ${m}`).join('\n')}`;

function setup(teamA, teamB, seed = 1) {
  const battle = new Battle({ formatid: 'gen9customgame', seed: [seed, 2, 3, 4] });
  battle.setPlayer('p1', { name: 'A', team: Teams.pack(Teams.import(teamA.join('\n\n'))) });
  battle.setPlayer('p2', { name: 'B', team: Teams.pack(Teams.import(teamB.join('\n\n'))) });
  if (battle.p1.activeRequest?.teamPreview) battle.makeChoices('default', 'default');   // 팀 미리보기 넘기기
  return battle;
}
/** 같은 장면에서 난수만 바꿔 여러 번 결정시킨다 */
function decide(battle, n = 200, mutate = null) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ai = new TrainerAI({ gen: GEN, name: 'A', stats: FULL, rng: makeRng(1000 + i) });
    ai.bindParty([...battle.p1.pokemon], battle.p2.pokemon.length);
    mutate?.(battle);
    out.push(ai.chooseAction(battle, 'p1'));
  }
  return out;
}
const count = (ds, pred) => ds.filter(pred).length;
const moveName = (battle, d) => d.choice.startsWith('move') ? battle.p1.active[0].moveSlots[Number(d.choice.split(' ')[1]) - 1].id : d.choice;

/* 1. 깨어진갑옷 — 방어 -1·스피드 +2가 됐다고 도망가지 않는다 (원작은 랭크 하락을 교체 이유로 보지 않는다) */
{
  const b = setup([mon('Skarmory', 'Weak Armor', ['Brave Bird', 'Spikes', 'Roost', 'Body Press']), mon('Blissey', 'Natural Cure', ['Soft-Boiled', 'Seismic Toss', 'Toxic', 'Protect'])],
    [mon('Machamp', 'No Guard', ['Close Combat', 'Knock Off', 'Bullet Punch', 'Bulk Up']), mon('Gengar', 'Cursed Body', ['Shadow Ball'])]);
  const ds = decide(b, 200, battle => { battle.p1.active[0].boosts.def = -1; battle.p1.active[0].boosts.spe = 2; });
  const sw = count(ds, d => d.choice.startsWith('switch'));
  console.log(`깨어진갑옷 장면: 교체 ${sw}/200`);
  assert.equal(sw, 0, '자기 특성으로 방어가 떨어졌다고 교체하지 않는다');
}

/* 2. 위협으로 공격 -1 — 역시 남는다 */
{
  const b = setup([mon('Garchomp', 'Rough Skin', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Stone Edge']), mon('Blissey', 'Natural Cure', ['Soft-Boiled'])],
    [mon('Arcanine', 'Intimidate', ['Flare Blitz', 'Extreme Speed', 'Will-O-Wisp', 'Morning Sun']), mon('Gengar', 'Cursed Body', ['Shadow Ball'])]);
  const ds = decide(b, 200, battle => { battle.p1.active[0].boosts.atk = -1; });
  assert.equal(count(ds, d => d.choice.startsWith('switch')), 0, '위협 한 번에 도망가지 않는다');
}

/* 3. 무효 기술은 고르지 않는다 (예측 실패 20점 → 한계선 아래) */
{
  const b = setup([mon('Garchomp', 'Rough Skin', ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'])],
    [mon('Corviknight', 'Pressure', ['Brave Bird', 'Roost', 'Bulk Up', 'Body Press'])]);
  const ds = decide(b, 200);
  assert.equal(count(ds, d => moveName(b, d) === 'earthquake'), 0, '비행 타입에게 지진을 쓰지 않는다');
}

/* 4. 전기자석파를 땅 타입에게 쓰지 않는다 */
{
  const b = setup([mon('Jolteon', 'Volt Absorb', ['Thunder Wave', 'Thunderbolt', 'Shadow Ball', 'Hyper Voice'])],
    [mon('Garchomp', 'Rough Skin', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Stone Edge'])]);
  const ds = decide(b, 200);
  assert.equal(count(ds, d => moveName(b, d) === 'thunderwave'), 0, '땅 타입에게 전기자석파 없음');
  assert.equal(count(ds, d => moveName(b, d) === 'thunderbolt'), 0, '땅 타입에게 10만볼트 없음');
}

/* 5. 쓸모없는 랭크업 — 특수 기술만 있는데 칼춤은 쓰지 않는다 */
{
  const b = setup([mon('Alakazam', 'Magic Guard', ['Swords Dance', 'Psychic', 'Focus Blast', 'Shadow Ball'])],
    [mon('Snorlax', 'Thick Fat', ['Body Slam', 'Rest', 'Curse', 'Earthquake'])]);
  const ds = decide(b, 200);
  assert.equal(count(ds, d => moveName(b, d) === 'swordsdance'), 0, '물리 기술이 없으면 칼춤은 무의미');
}

/* 6. 멸망의노래 카운트 1 — 빠진다 */
{
  /* 원작은 마지막 포켓몬(에이스)을 교체 후보에서 빼므로 동료가 둘 이상이어야 빠진다 */
  const b = setup([mon('Snorlax', 'Thick Fat', ['Body Slam', 'Rest', 'Curse', 'Earthquake']), mon('Blissey', 'Natural Cure', ['Soft-Boiled', 'Seismic Toss']), mon('Garchomp', 'Rough Skin', ['Earthquake'])],
    [mon('Gengar', 'Cursed Body', ['Shadow Ball', 'Perish Song'])]);
  const ds = decide(b, 50, battle => { battle.p1.active[0].addVolatile('perishsong'); battle.p1.active[0].volatiles.perishsong.duration = 1; });
  assert(count(ds, d => d.choice.startsWith('switch')) >= 45, '멸망 직전이면 교체');
}

/* 7. 상대 정보는 공개된 것만 — 숨은 방어는 모른다 */
{
  const b = setup([mon('Garchomp', 'Rough Skin', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Stone Edge'])],
    [mon('Toxapex', 'Regenerator', ['Protect', 'Recover', 'Toxic', 'Scald'])]);
  const ai = new TrainerAI({ gen: GEN, name: 'A', stats: FULL, rng: makeRng(1) });
  ai.bindParty([...b.p1.pokemon], 1);
  ai.chooseAction(b, 'p1');
  const known = ai.core.battlers[1].moves.map(m => m.id);
  assert(!known.includes('protect') && !known.includes('recover'), `공개 전 상대 변화기를 모른다 (${known})`);
  assert.equal(ai.core.battlers[1].abilityId, '', '특성이 여럿인 종족의 특성은 드러나기 전엔 모른다');
}

/* 8. 마지막 포켓몬은 아껴 둔다 (원작 ReserveLastPokemon) */
{
  const b = setup([mon('Pikachu', 'Static', ['Thunderbolt']), mon('Snorlax', 'Thick Fat', ['Body Slam']), mon('Garchomp', 'Rough Skin', ['Earthquake', 'Dragon Claw'])],
    [mon('Gyarados', 'Intimidate', ['Waterfall', 'Earthquake', 'Dragon Dance', 'Ice Fang'])]);
  b.p1.active[0].faint(); b.faintMessages();
  let ace = 0;
  for (let i = 0; i < 50; i++) {
    const ai = new TrainerAI({ gen: GEN, name: 'A', stats: FULL, rng: makeRng(i) });
    ai.bindParty([...b.p1.pokemon], 1);
    const d = ai.chooseForcedSwitch(b, 'p1');
    if (b.p1.pokemon[Number(d.choice.split(' ')[1]) - 1].species.id === 'garchomp') ace++;
  }
  assert.equal(ace, 0, '다른 동료가 있으면 마지막 포켓몬을 먼저 내지 않는다');
}

/* 9. 실제 배틀이 끝까지 돈다 (모든 기술 효과 코드가 오류 없이 평가된다) */
{
  const { createTrainerAI, runBattle } = await import('../src/engine/run-battle.js');
  const { TEAM_PRESETS } = await import('../src/data/teams.js');
  let n = 0;
  for (const preset of Object.keys(TEAM_PRESETS)) for (let s = 1; s <= 10; s++) {
    const r = runBattle({ trainerA: createTrainerAI({ name: 'A', stats: FULL }, '균형형', makeRng(s)), trainerB: createTrainerAI({ name: 'B', stats: FULL }, '균형형', makeRng(s + 50)),
      teamA: TEAM_PRESETS[preset].A, teamB: TEAM_PRESETS[preset].B, seed: s * 13 });
    assert(r.winner, `${preset} #${s} 승부가 난다`);
    n++;
  }
  console.log(`실배틀 ${n}회 완주`);
}
/* 10. 같은 시드면 같은 경기 (AI 평가는 엔진 난수를 쓰지 않는다) · 경기 분석이 새 판단 기록을 읽는다 */
{
  const { createTrainerAI, runBattle } = await import('../src/engine/run-battle.js');
  const { analyseBattle } = await import('../src/engine/battle-analysis.js');
  const { renderBattleAnalysis } = await import('../src/ui/battle-analysis.js');
  const trial = () => runBattle({ trainerA: createTrainerAI({ name: 'A', stats: FULL }, '균형형', makeRng(7)), trainerB: createTrainerAI({ name: 'B', stats: FULL }, '균형형', makeRng(8)),
    teamA: ['Starmie', '- Surf', '- Recover'].join('\n'), teamB: ['Blissey', '- Thunderbolt', '- Soft-Boiled'].join('\n'), seed: 90, collectThink: true });
  const clean = r => ({ ...r, log: r.log.filter(l => !l.startsWith('|t:|')) });
  const r1 = clean(trial());
  assert.deepEqual(r1, clean(trial()), '결정론');
  const html = renderBattleAnalysis(analyseBattle(r1));
  assert(html.length > 0 && !html.includes('undefined'), '경기 분석 렌더');
}
console.log('ai-anotherred PASS');
