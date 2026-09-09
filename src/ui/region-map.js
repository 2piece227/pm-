import { ATLAS_REGIONS, REGION_CHAINS } from '../data/region-atlas.js';
import { locationsIn } from '../data/routes.js';
import { escapeHtml as esc } from './management-widgets.js';

export { ATLAS_REGIONS };
export function regionSvg(regionId, selected = null, level = 100, current = null) {
  const region = ATLAS_REGIONS.find(r => r.id === regionId) || ATLAS_REGIONS[0];
  const locs = locationsIn(region.id);
  const xs = locs.map(l => l.x), ys = locs.map(l => l.y);
  const pos = new Map(locs.map(l => [l.id, {
    x: 85 + (l.x - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1) * 535,
    y: 55 + (l.y - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys) || 1) * 300,
  }]));
  const edges = (REGION_CHAINS[region.id] || []).flatMap(chain => {
    const ids = chain.split(' ');
    return ids.slice(1).map((id, i) => [pos.get(ids[i]), pos.get(id)]).filter(([a,b]) => a && b);
  });
  return `<svg class="atlas-svg" viewBox="0 0 720 430" role="group" aria-label="${region.name} 지방 지도">
    <defs><pattern id="atlas-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern></defs>
    <rect width="720" height="430" fill="#172d39"/><rect width="720" height="430" fill="url(#atlas-grid)"/>
    ${region.land.split('|').map(points => `<polygon points="${points}" class="atlas-land"/>`).join('')}
    <path d="M140 120l18-25 18 25m190 10l20-30 20 30m95 70l18-25 18 25" class="atlas-mountains"/>
    ${edges.map(([a,b]) => `<path class="atlas-road" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`).join('')}
    ${locs.map(l => { const p = pos.get(l.id); return `<g class="atlas-node ${l.kind} ${selected === l.id ? 'selected' : ''} ${level + 4 < l.level[0] ? 'hard' : ''}" data-l="${l.id}" tabindex="0" role="button" aria-label="${esc(l.name)} 권장 레벨 ${l.level.join('~')}" aria-pressed="${selected === l.id}">
      <title>${esc(l.name)} · Lv.${l.level.join('–')}</title><circle class="node-hit" cx="${p.x}" cy="${p.y}" r="13"/><circle class="node-ring" cx="${p.x}" cy="${p.y}" r="10"/><circle class="node-core" cx="${p.x}" cy="${p.y}" r="${l.kind === 'town' ? 5.5 : 3.5}"/>
      ${l.kind === 'town' || selected === l.id ? `<text x="${p.x}" y="${p.y + (selected === l.id ? 23 : -13)}" text-anchor="middle">${esc(l.name.split(' (')[0])}</text>` : ''}
      ${current === l.id ? `<path d="M${p.x-4} ${p.y-23}h8l-4 7z" fill="#f2cd78"/>` : ''}</g>`; }).join('')}
    <text x="28" y="402" class="atlas-caption">${region.name.toUpperCase()} / ${region.playable ? 'ACTIVITY MAP' : 'REGION PREVIEW'}</text>
    <text x="676" y="42" class="atlas-caption">N ↑</text></svg>`;
}
