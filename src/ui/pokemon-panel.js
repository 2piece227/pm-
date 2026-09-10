import { Dex } from '@pkmn/dex';
import { ko, SPECIES_KO, MOVE_KO, ABILITY_KO } from '../data/ko.js';
import { MANAGEMENT, agencyOf, changeMove, changeAbility, evolutionOptions, evolvePokemon } from '../engine/pokemon-management.js';
import { fieldState } from '../engine/field-state.js';
import { monImage, wireMonImages, escapeHtml as esc } from './management-widgets.js';

export const TYPE_KO={Normal:'노말',Fire:'불꽃',Water:'물',Grass:'풀',Electric:'전기',Ice:'얼음',Fighting:'격투',Poison:'독',Ground:'땅',Flying:'비행',Psychic:'에스퍼',Bug:'벌레',Rock:'바위',Ghost:'고스트',Dragon:'드래곤',Dark:'악',Steel:'강철',Fairy:'페어리'};
const K=s=>ko(SPECIES_KO,s), M=s=>ko(MOVE_KO,s), A=s=>ko(ABILITY_KO,s);
export function moveTile(move, index) {
  const m=Dex.moves.get(move||'');
  return `<span class="move-type" data-type="${m.type||'Normal'}">${TYPE_KO[m.type]||'빈 칸'}</span><b>${move?esc(M(move)):'새 기술 등록'}</b><small>${move?`PP ${m.pp} · ${m.category==='Physical'?'물리':m.category==='Special'?'특수':'변화'}`:`기술 ${index+1}`}</small>`;
}

export function openPokemonPanel(game, mon, onChange, initialTab = 'moves', initialSlot = 0) {
  const dialog=document.createElement('dialog');dialog.className='pokemon-dialog';dialog.setAttribute('aria-label','포켓몬 관리');
  let tab=initialTab,slot=initialSlot,selected=null,query='',notice='',pending=false;
  const close=()=>{if(pending)return;dialog.close();dialog.remove();};
  const draw=()=>{
    const species=Dex.species.get(mon.species), health=fieldState(mon);
    const moves=[...new Set(mon.learned||mon.moves)].filter(m=>M(m).includes(query)||m.toLowerCase().includes(query.toLowerCase()));
    const selectedData=selected?Dex.moves.get(selected):null;
    dialog.innerHTML=`<header class="pokemon-heading">${monImage(mon.species)}<div><small>POKÉMON / Lv.${mon.level}</small><h2>${esc(K(mon.species))}</h2><p>${species.types.map(t=>TYPE_KO[t]).join(' / ')} · HP ${health.hp}/${health.maxhp}</p></div><button class="ghost close-pokemon" aria-label="포켓몬 관리 닫기">✕</button></header>
      <nav class="pokemon-tabs">${[['moves','기술'],['ability','특성'],['evolution','진화']].map(([id,name])=>`<button class="${tab===id?'selected':'ghost'}" data-tab="${id}">${name}</button>`).join('')}</nav>
      <div class="pokemon-wallet">소속사 자금 <b>${agencyOf(game).funds.toLocaleString()}</b></div>
      ${tab==='moves'?`<p class="muted">바꿀 기술 칸을 고른 다음 새 기술을 선택하세요. 변경 1회 ${MANAGEMENT.movePrice}.</p>
      <div class="move-slots">${Array.from({length:4},(_,i)=>`<button class="move-slot ${slot===i?'selected':''}" data-slot="${i}" ${i>mon.moves.length?'disabled':''}>${moveTile(mon.moves[i],i)}</button>`).join('')}</div>
      <div class="move-library"><section><label>배운 기술 검색<input id="move-search" value="${esc(query)}" placeholder="기술 이름"></label><div class="move-candidates">${moves.map(m=>`<button class="move-choice ${selected===m?'selected':''}" data-move="${esc(m)}" ${mon.moves.includes(m)?'disabled':''}><b>${esc(M(m))}</b><span>${TYPE_KO[Dex.moves.get(m).type]} ${mon.moves.includes(m)?'· 장착 중':''}</span></button>`).join('')||'<p>검색 결과가 없습니다.</p>'}</div></section>
      <aside class="move-detail">${selectedData?`<span class="move-type" data-type="${selectedData.type}">${TYPE_KO[selectedData.type]}</span><h3>${esc(M(selected))}</h3><dl><dt>위력</dt><dd>${selectedData.basePower||'—'}</dd><dt>명중</dt><dd>${selectedData.accuracy===true?'필중':selectedData.accuracy}</dd><dt>PP</dt><dd>${selectedData.pp}</dd><dt>분류</dt><dd>${selectedData.category==='Physical'?'물리':selectedData.category==='Special'?'특수':'변화'}</dd></dl><p class="muted">${esc(selectedData.shortDesc||'')}</p><p>${mon.moves[slot]?esc(M(mon.moves[slot])):'빈 칸'} → ${esc(M(selected))}</p><button id="confirm-move" ${agencyOf(game).funds<MANAGEMENT.movePrice?'disabled':''}>${MANAGEMENT.movePrice} 지불 · 기술 변경</button>`:'<p class="muted">기술을 선택하면 위력·명중·PP와 변경 내용을 확인할 수 있습니다.</p>'}</aside></div>`:''}
      ${tab==='ability'?`<h3>현재 특성 · ${esc(A(mon.ability))}</h3><p class="muted">특성 변경은 ${MANAGEMENT.abilityPrice}가 필요합니다.</p><div class="ability-options">${Object.entries(species.abilities).map(([key,value])=>`<button class="ability-choice ${value===mon.ability?'selected':''}" data-ability="${esc(value)}" ${value===mon.ability?'disabled':''}><b>${esc(A(value))}</b><small>${key==='H'?'숨겨진 특성':'일반 특성'}${value===mon.ability?' · 적용 중':''}</small></button>`).join('')}</div><div id="ability-confirm"></div>`:''}
      ${tab==='evolution'?`<p class="muted">현재 레벨 ${mon.level} · 조건을 만족하면 진화할 수 있습니다.</p>${evolutionOptions(mon).map(e=>`<div class="evolution-option">${monImage(e.species)}<div><h3>${esc(K(e.species))}</h3><p>${esc(e.reason)}</p><button data-evolve="${esc(e.species)}" ${e.ready?'':'disabled'}>${e.ready?'진화하기':'조건 미충족'}</button></div></div>`).join('')||'<p>최종 진화 형태입니다.</p>'}<label class="auto-evolve"><input type="checkbox" id="auto-evolve" ${mon.autoEvolve?'checked':''}> 레벨 조건을 만족하면 경험치 획득 후 자동 진화</label><p class="muted">돌·교환·친밀도 등 특수 조건은 자동 진화 대상이 아닙니다.</p>`:''}
      <p class="panel-notice" role="status">${esc(notice)}</p>`;
    wireMonImages(dialog);
    dialog.querySelector('.close-pokemon').onclick=close;
    dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(pending)return;tab=b.dataset.tab;selected=null;notice='';draw();});
    dialog.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{slot=Number(b.dataset.slot);selected=null;draw();});
    dialog.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{selected=b.dataset.move;draw();});
    const search=dialog.querySelector('#move-search');if(search)search.oninput=()=>{const pos=search.selectionStart;query=search.value;draw();const next=dialog.querySelector('#move-search');next.focus();next.setSelectionRange(pos,pos);};
    const confirm=dialog.querySelector('#confirm-move');if(confirm)confirm.onclick=()=>{const r=changeMove(game,mon,slot,selected);notice=r.msg;if(r.ok){selected=null;onChange();}draw();};
    dialog.querySelectorAll('[data-ability]').forEach(b=>b.onclick=()=>{
      const ability=b.dataset.ability;const panel=dialog.querySelector('#ability-confirm');
      panel.innerHTML=`<p>${esc(A(mon.ability))} → ${esc(A(ability))}</p><button ${agencyOf(game).funds<MANAGEMENT.abilityPrice?'disabled':''}>${MANAGEMENT.abilityPrice} 지불 · 특성 변경</button>`;
      panel.querySelector('button').onclick=()=>{const r=changeAbility(game,mon,ability);notice=r.msg;if(r.ok)onChange();draw();};
    });
    dialog.querySelectorAll('[data-evolve]').forEach(b=>b.onclick=async()=>{
      if(pending)return;pending=true;b.disabled=true;
      try{const r=await evolvePokemon(mon,b.dataset.evolve);notice=r.ok?`${K(r.before)} → ${K(r.after)} 진화했습니다!`:r.msg;if(r.ok)onChange();}catch{notice='진화 데이터를 불러오지 못했습니다. 다시 시도하세요.';}finally{pending=false;if(dialog.isConnected)draw();}
    });
    const auto=dialog.querySelector('#auto-evolve');if(auto)auto.onchange=()=>{mon.autoEvolve=auto.checked;onChange();};
  };
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!pending)close();});
  document.body.append(dialog);dialog.showModal();draw();
}
