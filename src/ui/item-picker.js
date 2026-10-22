/**
 * 지닌 도구 선택 창 — 소속사 창고의 도구를 포켓몬에게 지니게 하거나 뺀다.
 */
import { HELD_ITEMS } from '../data/items.gen.js';
import { ko, SPECIES_KO } from '../data/ko.js';
import { agencyOf } from '../engine/pokemon-management.js';
import { itemsOf, giveItem, takeItem, holdInfo } from '../engine/shop.js';
import { itemIcon } from './shop.js';
import { monImage, wireMonImages, escapeHtml as esc } from './management-widgets.js';

const CATS = { all: '전체', battle: '배틀', type: '타입 강화', berry: '열매', species: '전용', mega: '메가스톤', evo: '진화 도구' };

export function openItemPicker(game, mon, onChange, onShop = () => {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'item-dialog'; dialog.setAttribute('aria-label', '지닌 도구');
  let cat = 'all', notice = '';
  const close = () => { dialog.close(); dialog.remove(); };
  const draw = () => {
    const stock = Object.entries(itemsOf(agencyOf(game))).filter(([en, n]) => n > 0 && holdInfo(en) && (cat === 'all' || holdInfo(en).cat === cat))
      .sort((a, b) => holdInfo(a[0]).ko.localeCompare(holdInfo(b[0]).ko));
    const cur = mon.item && holdInfo(mon.item);
    dialog.innerHTML = `<header class="item-head">${monImage(mon.species)}<div><small>지닌 도구</small><h2>${esc(ko(SPECIES_KO, mon.species))} <span>Lv.${mon.level}</span></h2></div><button class="ghost close-item" aria-label="닫기">✕</button></header>
      <section class="item-current">${cur ? `${itemIcon(mon.item)}<div><b>${esc(cur.ko)}</b><p>${esc(cur.desc)}</p></div><button class="ghost" id="take-item">빼서 창고로</button>` : '<p class="muted">지금은 아무것도 지니고 있지 않습니다.</p>'}</section>
      <nav class="item-cats">${Object.entries(CATS).map(([k, v]) => `<button class="${cat === k ? 'selected' : 'ghost'}" data-cat="${k}">${v}</button>`).join('')}</nav>
      <div class="item-list">${stock.map(([en, n]) => `<button class="item-choice" data-item="${esc(en)}" ${mon.item === en ? 'disabled' : ''}>${itemIcon(en)}<div><b>${esc(holdInfo(en).ko)} <small>×${n}</small></b><p>${esc(holdInfo(en).desc)}</p></div><span>${mon.item === en ? '지니는 중' : '지니게 하기'}</span></button>`).join('') || `<div class="item-empty"><p>창고에 ${cat === 'all' ? '' : CATS[cat] + ' '}도구가 없습니다.</p><button id="go-shop">상점에서 사기 →</button></div>`}</div>
      <p class="panel-notice" role="status">${esc(notice)}</p>`;
    wireMonImages(dialog);
    dialog.querySelector('.close-item').onclick = close;
    dialog.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; draw(); });
    dialog.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { const r = giveItem(game, mon, b.dataset.item); notice = r.msg; if (r.ok) onChange(); draw(); });
    const take = dialog.querySelector('#take-item'); if (take) take.onclick = () => { const r = takeItem(game, mon); notice = r.msg; if (r.ok) onChange(); draw(); };
    const shop = dialog.querySelector('#go-shop'); if (shop) shop.onclick = () => { close(); onShop(); };
  };
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal(); draw();
}
