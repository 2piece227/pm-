/**
 * 세이브 — 오프닝 진행 상태를 브라우저에 남긴다. (SPEC §3.10)
 *
 * 게임 전체 상태(리그·트레이너·시장…)를 통째로 직렬화하지 않는다. **씨앗만 저장한다** —
 * 시드와 플레이어 선택만 있으면 리그는 결정론적으로 똑같이 재생성되기 때문이다.
 * 스키마가 계속 바뀌는 단계에서 전체 스냅샷을 저장하면 갱신할 때마다 세이브가 깨진다.
 *
 * 저장 대상:
 *   seed         리그 재생성용
 *   playerName   대표 이름
 *   agencyId     고른 소속사
 *   stage        어디까지 진행했나 (title / name / agency / tutorial / scout / playing)
 *   youth        계약한 첫 트레이너 { candidateId, offer }
 */
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
  } catch { /* 저장 실패는 진행을 막지 않는다 */ }
  return next;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 이어하기를 띄울 만한 세이브인가 */
export function hasResumable(save) {
  return !!(save && save.playerName && save.stage && save.stage !== 'title');
}

/** 이어하기 버튼에 붙일 한 줄 요약 */
export function saveSummary(save) {
  if (!save) return '';
  const bits = [save.playerName];
  if (save.agencyName) bits.push(save.agencyName);
  if (save.youth?.name) bits.push(`${save.youth.name} 계약`);
  return bits.join(' · ');
}
