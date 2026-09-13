import { makeRng } from './run-battle.js';
import { policyId, POLICY_CONFIG } from '../data/battle-policy.js';
import { CAREER } from '../data/career.js';
import { proEligible } from './career.js';

// JSON-safe state with the exact random stream position. No engine objects are persisted.
export function snapshotGame(game) {
  return JSON.parse(JSON.stringify({ ...game, rng: undefined,
    rngState: game.rng.getState(), snapshotVersion: 3 }));
}

export function restoreGame(snapshot) {
  if (![1,2,3].includes(snapshot?.snapshotVersion) || !snapshot.league?.agencies || !Number.isInteger(snapshot.rngState)) {
    throw new Error('저장 파일을 읽을 수 없습니다.');
  }
  const game = JSON.parse(JSON.stringify(snapshot));
  if(game.snapshotVersion===1) {
    for(const a of game.league.agencies) for(const t of a.roster) {
      t.battlePolicy=policyId(t.battlePolicy);
      t.nature??={};
      if(!Number.isFinite(t.nature.compliance)) t.nature.compliance=POLICY_CONFIG.defaultCompliance;
    }
    game.snapshotVersion=2;
  }
  if(game.snapshotVersion===2){
    for(const a of game.league.agencies){
      a.youthCapacity??=CAREER.youthCapacity;
      for(const t of a.roster){
        if(!t.isYouth){t.legacyPro=!proEligible(t);t.promotionApplied=true;}
        else if(proEligible(t))t.graduation??={qualifiedDay:game.day,decision:'pending'};
      }
    }
    if(game.opening)game.opening.done=true;
    game.snapshotVersion=3;
  }
  game.rng = makeRng(game.rngState);
  return game;
}
