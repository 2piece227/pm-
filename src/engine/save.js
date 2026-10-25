import { encodeSave, decodeSave } from './save-codec.js';
/** 오프닝 선택과 전체 게임 상태를 저장한다. 기존 v1 오프닝 저장도 계속 읽는다. */
import { snapshotGame } from './checkpoint.js';
const KEY = 'pm-save-v1';
const VERSION = 1;

/*
 * 저장 압축 (2026-10-25) — localStorage는 브라우저마다 5MB 안팎이라, 경기 로그가 쌓이는 시즌 말에 한도에 닿았다.
 * 브라우저 내장 gzip(CompressionStream)으로 압축해 'gz1:' + base64로 넣는다. 압축은 비동기라 화면은 기다리지 않는다.
 * 시작할 때 initSave()로 한 번 풀어 메모리에 두고, loadSave()·writeSave()는 그 사본을 쓴다(호출 방식은 예전 그대로).
 * 압축 안 된 예전 저장도 그대로 읽는다.
 */
const PREFIX = 'gz1:';
let cache = null, primed = false, writing = null, pending = false, lastOk = true;

const readRaw = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function gzip(text) {
  const buf = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function accept(text) {
  const data = decodeSave(text);
  return data?.version === VERSION ? data : null;   // 형식이 바뀌면 조용히 버린다
}

/** 시작할 때 한 번 — 저장을 풀어 메모리에 둔다 */
export async function initSave() {
  const raw = readRaw();
  cache = null;
  try { if (raw) cache = accept(raw.startsWith(PREFIX) ? await gunzip(raw.slice(PREFIX.length)) : raw); }
  catch { cache = null; }   // 사생활 보호 모드·깨진 저장이어도 게임은 돌아가야 한다
  primed = true;
  return cache;
}

export function loadSave() {
  if (!primed) {
    /* initSave 전(테스트 등): 압축 안 된 저장만 바로 읽는다 */
    const raw = readRaw();
    try { cache = raw && !raw.startsWith(PREFIX) ? accept(raw) : null; } catch { cache = null; }
    primed = true;
  }
  return cache;
}

/** 쓰기는 하나씩 — 쓰는 중에 또 저장하면 끝난 뒤 최신 상태로 한 번 더 쓴다 */
function schedule() {
  if (writing) { pending = true; return; }
  writing = (async () => {
    do {
      pending = false;
      try {
        const text = encodeSave(cache);
        localStorage.setItem(KEY, canGzip() ? PREFIX + await gzip(text) : text);
        lastOk = true;
      } catch { lastOk = false; }
    } while (pending);
    writing = null;
  })();
}

export function writeSave(patch) {
  const cur = loadSave() || { version: VERSION };
  const next = { ...cur, ...patch, version: VERSION, savedAt: Date.now() };
  cache = next;
  schedule();
  next.persisted = lastOk;   // 직전 저장의 결과 (이번 저장은 곧 끝난다)
  return next;
}
/** 진행 중인 저장이 끝날 때까지 */
export function flushSave() { return writing || Promise.resolve(); }

export function saveGame(game) {
  return writeSave({ stage: 'playing', snapshot: snapshotGame(game) });
}

export function clearSave() {
  cache = null;
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 이어하기를 띄울 만한 세이브인가 */
export function hasResumable(save) {
  return !!(save && save.playerName && (save.snapshot || save.agencyId || save.stage !== 'title'));
}

/** 이어하기 버튼에 붙일 한 줄 요약 */
export function saveSummary(save) {
  if (!save) return '';
  const bits = [save.playerName];
  if (save.agencyName) bits.push(save.agencyName);
  if (save.youth?.name) bits.push(`${save.youth.name} 계약`);
  if (save.snapshot?.day) bits.push(`${save.snapshot.day}일차`);
  return bits.join(' · ');
}
