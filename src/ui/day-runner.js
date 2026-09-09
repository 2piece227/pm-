import { snapshotGame, restoreGame } from '../engine/checkpoint.js';

// Keep battle simulation off the UI thread so the loading view remains responsive.
export function runDay(game, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../engine/day-worker.js', import.meta.url), { type:'module' });
    let updates = Promise.resolve();
    const fail = error => { worker.terminate(); reject(error); };
    worker.onerror = () => fail(new Error('하루 진행을 완료하지 못했습니다. 저장된 상태에서 다시 시도할 수 있습니다.'));
    worker.onmessage = ({data}) => {
      if(data.type==='progress') {
        updates = updates.then(()=>onProgress(data.event));
        updates.catch(fail);
      } else if(data.type==='complete') {
        updates.then(()=>{ worker.terminate(); resolve(restoreGame(data.snapshot)); }).catch(fail);
      } else if(data.type==='error') fail(new Error(data.message));
    };
    worker.postMessage(snapshotGame(game));
  });
}
