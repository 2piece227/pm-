import { ATLAS_REGIONS } from '../data/region-atlas.js';
import { locationsIn } from '../data/routes.js';
import { TOWN_MAP, TOWN_POSITIONS } from '../data/town-map.js';
import { escapeHtml as esc } from './management-widgets.js';
export { ATLAS_REGIONS };
export function regionSvg(regionId, selected = null, level = 100, current = null) {
  const region = ATLAS_REGIONS.find(r => r.id === regionId) || ATLAS_REGIONS[0];
  if (!region.playable) return `<div class="map-unavailable"><span>미개방 지방</span><h3>${region.name}</h3><p>커뮤니티 타운맵과 탐험 데이터를 준비 중입니다.</p></div>`;
  const viewBox = region.id === 'kanto' ? '356 8 404 300' : '0 8 400 300';
  return `<svg class="atlas-svg pixel-townmap" viewBox="${viewBox}" role="group" aria-label="${region.name} 도트 타운맵">
    <image href="${import.meta.env.BASE_URL}${TOWN_MAP.file}" width="816" height="322" style="image-rendering:pixelated"/>
    ${locationsIn(region.id).map(l => { const [x,y] = TOWN_POSITIONS[l.id]; return `<g class="atlas-node ${l.kind} ${selected===l.id?'selected':''} ${level+4<l.level[0]?'hard':''}" data-l="${l.id}" tabindex="0" role="button" aria-label="${esc(l.name)} 권장 레벨 ${l.level.join('~')}" aria-pressed="${selected===l.id}">
      <title>${esc(l.name)} · Lv.${l.level.join('–')}</title><circle class="node-hit" cx="${x}" cy="${y}" r="11"/><circle class="node-ring" cx="${x}" cy="${y}" r="9"/><circle class="node-core" cx="${x}" cy="${y}" r="${l.kind==='town'?4:3.5}"/>
      ${selected===l.id?`<text x="${Math.min(710,Math.max(65,x))}" y="${y+20}" text-anchor="middle">${esc(l.name.split(' (')[0])}</text>`:''}
      ${current===l.id?`<path d="M${x-4} ${y-18}h8l-4 7z" fill="#fff" stroke="#183344"/>`:''}</g>`; }).join('')}
    </svg>`;
}
