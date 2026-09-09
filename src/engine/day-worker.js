import { advanceDay } from './game.js';
import { restoreGame, snapshotGame } from './checkpoint.js';

self.onmessage = async ({ data }) => {
  try {
    const game = restoreGame(data);
    await advanceDay(game, { onProgress: async event => self.postMessage({ type:'progress', event }) });
    self.postMessage({ type:'complete', snapshot: snapshotGame(game) });
  } catch (error) { self.postMessage({ type:'error', message:error.message }); }
};
