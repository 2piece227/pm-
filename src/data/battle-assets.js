/**
 * 배틀 에셋 출처 — **한 곳에 모아둔다.**
 *
 * 스프라이트와 같은 방식으로, 파일을 이 저장소에 복제하지 않고 **링크로만** 가져온다.
 * 나중에 오리지널 IP로 갈아끼울 때 이 파일만 고치면 나머지 코드는 손댈 필요가 없다.
 * (SPEC §10 — 엔진은 MIT지만 에셋은 별개 사안이므로 교체 지점을 좁게 유지한다)
 *
 * 출처와 라이선스는 CREDITS.md 참고:
 *   - 포켓몬 울음소리: PokeAPI/cries
 *   - 배틀 효과음 / 기술 애니메이션: pagefaultgames/pokerogue-assets
 *     · battle-anims JSON과 PRSFX- 음원은 대부분 LicenseRef-POKEMON-REBORN,
 *       일부는 CC-BY-NC-SA-4.0 (루트 REUSE.toml의 AGPL 표기는 폴더 REUSE.toml이 덮어쓴다)
 *     · 스프라이트시트와 audio/se는 LicenseRef-FAIR-USE — 게임 원본 소재로,
 *       지식재산권은 Nintendo / Creatures / GAME FREAK에 있다
 */

const POKEROGUE = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';

/**
 * 포켓몬 울음소리.
 * `legacy`는 GB~5세대의 거친 합성음이라 BW 도트 스프라이트와 결이 맞는다.
 * 없으면 `latest`(현행 녹음)로 떨어진다.
 */
export function cryUrl(dexNum) {
  return {
    url: `${CRIES}/legacy/${dexNum}.ogg`,
    fallback: `${CRIES}/latest/${dexNum}.ogg`,
  };
}

/** 공용 배틀 효과음 (audio/se) — 파일명 그대로 */
export function seUrl(name) {
  return `${POKEROGUE}/audio/se/${name}.wav`;
}

/** 기술 연출용 음원 (audio/battle_anims) — JSON의 resourceName을 그대로 받는다 */
export function animSoundUrl(resourceName) {
  return `${POKEROGUE}/audio/battle_anims/${encodeURIComponent(resourceName)}`;
}

/** 기술 애니메이션 정의 (battle-anims/<kebab-case>.json) */
export function animJsonUrl(moveName) {
  return `${POKEROGUE}/battle-anims/${toKebab(moveName)}.json`;
}

/** 기술 애니메이션 스프라이트시트 (images/battle_anims/<graphic>.png) */
export function animSheetUrl(graphic) {
  return `${POKEROGUE}/images/battle_anims/${encodeURIComponent(graphic)}.png`;
}

/** "Rock Slide" → "rock-slide" */
export function toKebab(moveName) {
  return String(moveName)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 스프라이트시트 격자 — RPG Maker XP 애니메이션 시트 규격.
 * 5열 고정이고 셀은 정사각. (실측: "PRAS- Fire"가 480x1440 → 96px 셀 5x15)
 */
export const SHEET_COLUMNS = 5;
export const cellSize = (sheetWidth) => Math.round(sheetWidth / SHEET_COLUMNS);

/**
 * 프레임 좌표계 — RMXP 애니메이션은 320x240 화면 기준의 중심 상대 좌표를 쓴다.
 * 배틀 화면 크기에 맞춰 비례 축소해서 얹는다.
 */
export const ANIM_SPACE = { w: 320, h: 240 };
