import { makeRng } from './run-battle.js';

// JSON-safe state with the exact random stream position. No engine objects are persisted.
export function snapshotGame(game) {
  return JSON.parse(JSON.stringify({ ...game, rng: undefined,
    rngState: game.rng.getState(), snapshotVersion: 1 }));
}

export function restoreGame(snapshot) {
  if (snapshot?.snapshotVersion !== 1 || !snapshot.league?.agencies || !Number.isInteger(snapshot.rngState)) {
    throw new Error('저장 파일을 읽을 수 없습니다.');
  }
  const game = JSON.parse(JSON.stringify(snapshot));
  game.rng = makeRng(game.rngState);
  return game;
}
