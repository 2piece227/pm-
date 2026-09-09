/** 오프닝 선택과 전체 게임 상태를 저장한다. 기존 v1 오프닝 저장도 계속 읽는다. */
import { snapshotGame } from './checkpoint.js';
const KEY = 'pm-save-v1';
const VERSION = 1;

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== VERSION) return null;   // 형식이 바뀌면 조용히 버린다
    return data;
  } catch {
    return null;   // 사생활 보호 모드 등에서 접근이 막혀도 게임은 돌아가야 한다
  }
}

export function writeSave(patch) {
  const cur = loadSave() || { version: VERSION };
  const next = { ...cur, ...patch, version: VERSION, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    next.persisted = true;
  } catch { next.persisted = false; }
  return next;
}

export function saveGame(game) {
  return writeSave({ stage: 'playing', snapshot: snapshotGame(game) });
}

export function clearSave() {
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
