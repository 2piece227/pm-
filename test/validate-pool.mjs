import { Dex, Teams } from '@pkmn/sim';
import { POKEMON_POOL, toShowdownBlock } from '../src/data/pokemon-pool.js';

const GEN = Dex.forGen(9);
let bad = 0;

for (const e of POKEMON_POOL) {
  const problems = [];
  const sp = GEN.species.get(e.species);
  if (!sp || !sp.exists) problems.push(`종족 없음: ${e.species}`);
  const ab = GEN.abilities.get(e.ability);
  if (!ab || !ab.exists) problems.push(`특성 없음: ${e.ability}`);
  const it = GEN.items.get(e.item);
  if (!it || !it.exists) problems.push(`도구 없음: ${e.item}`);
  const nat = GEN.natures.get(e.nature);
  if (!nat || !nat.exists) problems.push(`성격 없음: ${e.nature}`);
  for (const mv of e.moves) {
    const m = GEN.moves.get(mv);
    if (!m || !m.exists) problems.push(`기술 없음: ${mv}`);
  }
  // 실제로 파싱까지 되는지
  try {
    const parsed = Teams.import(toShowdownBlock(e));
    if (!parsed || !parsed.length) problems.push('팀 파싱 실패');
    else if (parsed[0].moves.length !== 4) problems.push(`기술 ${parsed[0].moves.length}개만 파싱됨`);
  } catch (err) {
    problems.push('파싱 예외: ' + err.message);
  }
  if (problems.length) { bad++; console.log(`❌ ${e.species}: ${problems.join(' / ')}`); }
}
console.log(bad === 0 ? `✅ 풀 ${POKEMON_POOL.length}종 전부 유효` : `\n총 ${bad}종 문제 있음`);
