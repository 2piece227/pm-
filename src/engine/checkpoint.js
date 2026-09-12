import { makeRng } from './run-battle.js';
import { policyId, POLICY_CONFIG } from '../data/battle-policy.js';

// JSON-safe state with the exact random stream position. No engine objects are persisted.
export function snapshotGame(game) {
  return JSON.parse(JSON.stringify({ ...game, rng: undefined,
    rngState: game.rng.getState(), snapshotVersion: 2 }));
}

export function restoreGame(snapshot) {
  if (![1,2].includes(snapshot?.snapshotVersion) || !snapshot.league?.agencies || !Number.isInteger(snapshot.rngState)) {
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
  game.rng = makeRng(game.rngState);
  return game;
}
