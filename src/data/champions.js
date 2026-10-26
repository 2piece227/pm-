/**
 * 포켓몬 챔피언스 기술표 조회 — 종 이름 → 쓸 수 있는 기술 id 집합.
 * 챔피언스 표에 그 모습이 따로 없으면(메가진화·겉모습만 다른 폼) 기본 종의 표를 쓴다.
 * 챔피언스에 나오지 않는 종(별가사리 같은 진화 전 포켓몬 등)은 빈 집합.
 */
import { Dex } from '@pkmn/dex';
import { championsMoves } from './champions-moves.gen.js';

const GEN = Dex.forGen(9);
export function championsLearnset(species) {
  const sp = GEN.species.get(species);
  if (!sp?.exists) return [];
  const own = championsMoves(sp.id);
  if (own.length || !sp.baseSpecies || sp.baseSpecies === sp.name) return own;
  return championsMoves(GEN.species.get(sp.baseSpecies).id);
}
