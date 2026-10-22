/**
 * 상점 — 탐험 물품(트레이너 가방) · 지닌 도구 · 열매 · 기술머신 (소속사 창고)
 */
import { Dex } from '@pkmn/dex';
import { HELD_ITEMS, TMS, MOVE_DESC_KO } from '../data/items.gen.js';
import { ko, MOVE_KO } from '../data/ko.js';
import { agencyOf } from '../engine/pokemon-management.js';
import { buyItem, buyTM, itemsOf, tmsOf } from '../engine/shop.js';
import { renderSupport } from './management-pages.js';
import { TYPE_KO } from './pokemon-panel.js';
import { escapeHtml as esc } from './management-widgets.js';

const ui = { tab: 'held', q: '', cat: 'all', type: 'all' };
const ASSET = (import.meta.env?.BASE_URL ?? '/') + 'assets/items/';
const M = s => ko(MOVE_KO, s);
const CAT = { Physical: '물리', Special: '특수', Status: '변화' };
export const itemIcon = (name) => HELD_ITEMS[name] ? `<img class="item-ico" src="${ASSET}${HELD_ITEMS[name].icon}.png" alt="" aria-hidden="true" width="30" height="30" loading="lazy">` : '';
export const tmIcon = (move) => `<img class="item-ico" src="${ASSET}tm-${(Dex.moves.get(move).type || 'Normal').toLowerCase()}.png" alt="" aria-hidden="true" width="30" height="30" loading="lazy">`;
const won = n => Math.round(n).toLocaleString();

const HELD_CATS = { all: '전체', battle: '배틀 도구', type: '타입 강화', species: '전용 도구' };

export function renderShop(game) {
  const a = agencyOf(game), stock = itemsOf(a), tms = tmsOf(a);
  const owned = Object.values(stock).reduce((n, v) => n + v, 0), ownedTm = Object.values(tms).reduce((n, v) => n + v, 0);
  const tabs = [['held', '지닌 도구'], ['berry', '열매'], ['tm', '기술머신'], ['supplies', '탐험 물품']];
  const q = ui.q.trim();
  let body = '';
  if (ui.tab === 'supplies') body = `<div class="shop-supplies">${renderSupport(game)}</div>`;
  else if (ui.tab === 'tm') {
    const rows = TMS.filter(t => { const mv = Dex.moves.get(t.move); return (!q || M(t.move).includes(q) || t.move.toLowerCase().includes(q.toLowerCase())) && (ui.type === 'all' || mv.type === ui.type); });
    body = `<div class="shop-filters"><select id="shop-type" aria-label="타입"><option value="all">모든 타입</option>${Object.entries(TYPE_KO).map(([k, v]) => `<option value="${k}" ${ui.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <table class="shop-table"><thead><tr><th>번호</th><th>기술</th><th>분류</th><th>위력</th><th>명중</th><th>보유</th><th>가격</th><th></th></tr></thead><tbody>${rows.map(t => { const mv = Dex.moves.get(t.move); return `<tr><td class="no">${String(t.no).padStart(3, '0')}</td><td>${tmIcon(t.move)}<div class="nm"><b><span class="move-type" data-type="${mv.type}">${TYPE_KO[mv.type]}</span> ${esc(M(t.move))}</b><small>${esc(MOVE_DESC_KO[t.move] || '')}</small></div></td><td>${CAT[mv.category]}</td><td>${mv.basePower || '—'}</td><td>${mv.accuracy === true ? '—' : mv.accuracy}</td><td class="own">${tms[t.move] || 0}</td><td class="price">₽${won(t.price)}</td><td><button data-buy-tm="${esc(t.move)}" ${a.funds < t.price ? 'disabled' : ''}>구입</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">찾는 기술머신이 없습니다.</td></tr>'}</tbody></table>
      <p class="muted">기술머신은 9세대처럼 한 번 쓰면 사라집니다. 포켓몬 관리 창의 기술 탭에서 사용할 수 있습니다. 가격은 [임시값]입니다.</p>`;
  } else {
    const list = Object.entries(HELD_ITEMS).filter(([en, v]) => (ui.tab === 'berry' ? v.cat === 'berry' : v.cat !== 'berry') && (ui.tab === 'berry' || ui.cat === 'all' || v.cat === ui.cat) && (!q || v.ko.includes(q) || en.toLowerCase().includes(q.toLowerCase())))
      .sort((x, y) => x[1].price - y[1].price || x[1].ko.localeCompare(y[1].ko));
    body = `${ui.tab === 'held' ? `<div class="shop-filters">${Object.entries(HELD_CATS).map(([k, v]) => `<button class="${ui.cat === k ? 'selected' : 'ghost'}" data-shop-cat="${k}">${v}</button>`).join('')}</div>` : ''}
      <div class="shop-grid">${list.map(([en, v]) => `<article class="shop-item">${itemIcon(en)}<div class="nm"><b>${esc(v.ko)}</b><small>보유 ${stock[en] || 0}</small></div><p>${esc(v.desc)}</p><footer><span class="price">₽${won(v.price)}${v.estimated ? ' <i title="원작 가격이 없어 정한 값">임시</i>' : ''}</span><select class="shop-qty" aria-label="${esc(v.ko)} 수량">${[1, 2, 3, 5, 10].map(n => `<option>${n}</option>`).join('')}</select><button data-buy-item="${esc(en)}" ${a.funds < v.price ? 'disabled' : ''}>구입</button></footer></article>`).join('') || '<p class="muted">찾는 도구가 없습니다.</p>'}</div>`;
  }
  return `<div class="page-h"><div><div class="eyebrow">POKÉ MART · 소속사 구매</div><h2>상점</h2></div><span class="muted">창고: 도구 ${owned}개 · 기술머신 ${ownedTm}개 · 자금 ₽${won(a.funds)}</span></div>
    <div class="shop-bar"><nav class="shop-tabs">${tabs.map(([id, name]) => `<button class="${ui.tab === id ? 'selected' : 'ghost'}" data-shop-tab="${id}">${name}</button>`).join('')}</nav>${ui.tab !== 'supplies' ? `<input id="shop-search" placeholder="이름 검색" value="${esc(ui.q)}" aria-label="상점 검색">` : ''}</div>
    <div id="shop-notice" role="status"></div>
    <section class="shop">${body}</section>`;
}

export function wireShop(root, game, refresh) {
  const say = msg => { const n = document.querySelector('#shop-notice'); if (n) n.textContent = msg; };
  root.querySelectorAll('[data-shop-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.shopTab; ui.q = ''; refresh(); });
  root.querySelectorAll('[data-shop-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.shopCat; refresh(); });
  const type = root.querySelector('#shop-type'); if (type) type.onchange = () => { ui.type = type.value; refresh(); };
  const search = root.querySelector('#shop-search');
  if (search) search.oninput = () => { const pos = search.selectionStart; ui.q = search.value; refresh(); const s = document.querySelector('#shop-search'); s?.focus(); s?.setSelectionRange(pos, pos); };
  root.querySelectorAll('[data-buy-item]').forEach(b => b.onclick = () => { const n = Number(b.closest('.shop-item').querySelector('.shop-qty').value); const r = buyItem(game, b.dataset.buyItem, n); refresh(); say(r.msg); });
  root.querySelectorAll('[data-buy-tm]').forEach(b => b.onclick = () => { const r = buyTM(game, b.dataset.buyTm, 1); refresh(); say(r.msg); });
}
