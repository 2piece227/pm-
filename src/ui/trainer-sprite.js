/**
 * 트레이너 도트.
 *   - 원작 네임드(블루, 관동·성도 관장 16명)는 원작 스프라이트 (관동 FRLG, 성도 HGSS — Pokémon Showdown 판)
 *   - 그 밖의 트레이너는 FM의 기본 얼굴처럼 범용 도트 한 장(generic.png, tools/gen-generic-trainer.py)을 같이 쓴다.
 */
import { GYMS } from '../data/gyms.js';
import { escapeHtml as esc } from './management-widgets.js';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'assets/trainers/';
const GYM_IDS = new Set(GYMS.map(g => g.id));
/** 트레이너 id → 원작 스프라이트 이름. 유스 후보 id는 'y-…', 계약 뒤 트레이너 id는 'y-y-…' */
const NAMED = { 'y-blue': 'blue', 'y-y-blue': 'blue' };

export function spriteName(t) {
  if (!t) return 'generic';
  if (t.spriteId) return t.spriteId;
  if (NAMED[t.id]) return NAMED[t.id];
  const official = /^official-(.+)$/.exec(t.id || '')?.[1];
  if (official && GYM_IDS.has(official)) return official;
  return 'generic';
}
export const isNamedSprite = t => spriteName(t) !== 'generic';
export const spriteUrl = name => `${BASE}${name}.png`;

/** 상반신이 보이도록 잘라 쓰는 사각 초상 */
export function trainerPortrait(t, cls = '') {
  const name = spriteName(t);
  return `<span class="tr-portrait ${cls} ${name === 'generic' ? 'generic' : 'named'}"><img src="${spriteUrl(name)}" alt="${esc(t?.name || '트레이너')}" width="80" height="80" loading="lazy"></span>`;
}
/** 전신 */
export function trainerFull(t, cls = '') {
  const name = spriteName(t);
  return `<img class="tr-full ${cls} ${name === 'generic' ? 'generic' : ''}" src="${spriteUrl(name)}" alt="${esc(t?.name || '트레이너')}" width="80" height="80" loading="lazy">`;
}
export const gymLeaderFull = (gymId, cls = '') => `<img class="tr-full ${cls}" src="${spriteUrl(gymId)}" alt="" aria-hidden="true" width="80" height="80" loading="lazy">`;
