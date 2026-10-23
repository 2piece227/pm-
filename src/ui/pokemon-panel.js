/**
 * 포켓몬 관리 창 — 기술 · 특성 · 진화
 *
 * 왼쪽: 요약(스프라이트·타입·HP/EXP·능력치·성격·특성·지닌 도구·자금)
 * 오른쪽: 세그먼트 탭 + 내용 + 아래 고정 확인 바
 */
import { Dex } from '@pkmn/dex';
import { ko, SPECIES_KO, MOVE_KO, ABILITY_KO } from '../data/ko.js';
import { MANAGEMENT, agencyOf, changeMove, changeAbility, evolutionOptions, evolvePokemon } from '../engine/pokemon-management.js';
import { fieldState, movePP } from '../engine/field-state.js';
import { realStats, expForLevel } from '../data/pokemon.js';
import { monImage, wireMonImages, escapeHtml as esc } from './management-widgets.js';
import { MOVE_DESC_KO, ABILITY_DESC_KO, HELD_ITEMS } from '../data/items.gen.js';
import { tmsOf, tmLearnable, teachTM, TM_BY_MOVE, holdInfo, megaReadiness } from '../engine/shop.js';
import { bindLiveSearch } from './live-search.js';

export const TYPE_KO={Normal:'노말',Fire:'불꽃',Water:'물',Grass:'풀',Electric:'전기',Ice:'얼음',Fighting:'격투',Poison:'독',Ground:'땅',Flying:'비행',Psychic:'에스퍼',Bug:'벌레',Rock:'바위',Ghost:'고스트',Dragon:'드래곤',Dark:'악',Steel:'강철',Fairy:'페어리'};
const TYPE_COLOR={Normal:'#8a8f98',Fire:'#e0703e',Water:'#4a8fd6',Grass:'#5aa255',Electric:'#e0c03a',Ice:'#6ec8d0',Fighting:'#c2454a',Poison:'#a05cc0',Ground:'#c79a52',Flying:'#7f9be6',Psychic:'#e46a8c',Bug:'#93ae2e',Rock:'#b4a46a',Ghost:'#6b62b0',Dragon:'#5d6ee0',Dark:'#5d5466',Steel:'#6c9cb0',Fairy:'#e48fe0'};
export const NATURE_KO={Hardy:'노력',Lonely:'외로움',Brave:'용감',Adamant:'고집',Naughty:'개구쟁이',Bold:'대담',Docile:'온순',Relaxed:'무사태평',Impish:'장난꾸러기',Lax:'촐랑',Timid:'겁쟁이',Hasty:'성급',Serious:'성실',Jolly:'명랑',Naive:'천진난만',Modest:'조심',Mild:'의젓',Quiet:'냉정',Bashful:'수줍음',Rash:'덜렁',Calm:'차분',Gentle:'얌전',Sassy:'건방',Careful:'신중',Quirky:'변덕'};
const STAT_KO={hp:'HP',atk:'공격',def:'방어',spa:'특공',spd:'특방',spe:'스피드'};
const CAT={Physical:'물리',Special:'특수',Status:'변화'};
const EVO_METHOD={level:'레벨',useItem:'도구 사용',trade:'통신진화',levelFriendship:'친밀도',levelHold:'지닌 도구',levelMove:'기술',levelExtra:'특수 조건',other:'특별한 진화'};
const K=s=>ko(SPECIES_KO,s), M=s=>ko(MOVE_KO,s), A=s=>ko(ABILITY_KO,s);
const ASSET=(import.meta.env?.BASE_URL??'/')+'assets/items/';

/** 예전 화면 호환용 기술 타일 */
export function moveTile(move, index, mon=null) {
  const m=Dex.moves.get(move||''),pp=movePP(mon,move);
  return `<span class="move-type" data-type="${m.type||'Normal'}">${TYPE_KO[m.type]||'빈 칸'}</span><b>${move?esc(M(move)):'새 기술 등록'}</b><small>${move?`PP ${pp.current}/${pp.max} · ${CAT[m.category]}`:`기술 ${index+1}`}</small>`;
}

export function openPokemonPanel(game, mon, onChange, initialTab = 'moves', initialSlot = 0, { onItem = null } = {}) {
  const dialog=document.createElement('dialog');dialog.className='pkm';dialog.setAttribute('aria-label','포켓몬 관리');
  let tab=initialTab,slot=Math.min(initialSlot,mon.moves.length,3),selected=null,query='',source='all',cat='all',ability=null,notice='',pending=false;
  let tmCompat=new Set();
  const close=()=>{if(pending)return;dialog.close();dialog.remove();};
  tmLearnable(mon.species).then(set=>{tmCompat=set;if(dialog.isConnected)draw();});

  const side=()=>{
    const sp=Dex.species.get(mon.species),st=realStats(mon),fs=fieldState(mon),nat=Dex.natures.get(mon.nature);
    const base=expForLevel(mon.level),next=expForLevel(mon.level+1),xp=Math.max(0,Math.min(100,(mon.exp-base)/Math.max(1,next-base)*100));
    const item=mon.item&&holdInfo(mon.item);
    return `<aside class="pkm-side" style="--t1:${TYPE_COLOR[sp.types[0]]};--t2:${TYPE_COLOR[sp.types[1]||sp.types[0]]}">
      <div class="pkm-stage">${monImage(mon.species)}</div>
      <div class="pkm-name"><small>No.${String(sp.num).padStart(4,'0')}</small><h2>${esc(K(mon.species))}</h2><span class="lv">Lv.${mon.level}</span></div>
      <div class="pkm-types">${sp.types.map(t=>`<span class="move-type" data-type="${t}">${TYPE_KO[t]}</span>`).join('')}</div>
      <div class="pkm-bars"><label><span>HP</span><b>${fs.hp}/${fs.maxhp}</b><i class="bar hp"><i style="width:${fs.hp/Math.max(1,fs.maxhp)*100}%"></i></i></label><label><span>EXP</span><b>다음까지 ${Math.max(0,next-mon.exp).toLocaleString()}</b><i class="bar xp"><i style="width:${xp}%"></i></i></label></div>
      <div class="pkm-stats">${Object.keys(STAT_KO).map(k=>{const plus=nat.plus===k,minus=nat.minus===k;return `<div class="${plus?'plus':minus?'minus':''}"><span>${STAT_KO[k]}${plus?' ▲':minus?' ▼':''}</span><i class="sbar"><i style="width:${Math.min(100,sp.baseStats[k]/180*100)}%"></i></i><b>${st[k]}</b></div>`;}).join('')}</div>
      <dl class="pkm-info"><dt>성격</dt><dd>${NATURE_KO[mon.nature]||esc(mon.nature)}${nat.plus?` <small>${STAT_KO[nat.plus]}↑ ${STAT_KO[nat.minus]}↓</small>`:''}</dd><dt>특성</dt><dd>${esc(A(mon.ability))}</dd><dt>친밀도</dt><dd>${mon.friendship??70} <small>/ 255</small></dd></dl>
      <button class="pkm-item ${item?'has':''}" data-open-item>${item?`<img src="${ASSET}${item.icon}.png" alt="" width="30" height="30"><span><b>${esc(item.ko)}</b><small>지닌 도구 · 바꾸기</small></span>`:'<span class="plus">＋</span><span><b>도구 지니게 하기</b><small>소속사 창고에서 고르기</small></span>'}</button>
      ${(() => { const r = megaReadiness(game, mon); return r ? `<p class="mega-note ${r.state}">${r.state === 'ok' ? '✦ ' : '⚠ '}${esc(r.text)}</p>` : ''; })()}
      <div class="pkm-wallet">소속사 자금 <b>₽${agencyOf(game).funds.toLocaleString()}</b></div>
    </aside>`;
  };

  const movesTab=(locked)=>{
    const pool=[...new Set([...(mon.learned||[]),...mon.moves])];
    const stock=tmsOf(agencyOf(game));
    const tmPool=Object.keys(stock).filter(mv=>stock[mv]>0&&!pool.includes(mv)&&tmCompat.has(Dex.moves.get(mv).id));
    const all=[...pool,...tmPool].filter(m=>(source==='all'||(source==='learned'?pool.includes(m):tmPool.includes(m)))
      &&(cat==='all'||Dex.moves.get(m).category===cat)&&(!query||M(m).includes(query)||m.toLowerCase().includes(query.toLowerCase())))
      .sort((a,b)=>Number(mon.moves.includes(a))-Number(mon.moves.includes(b))||(Dex.moves.get(b).basePower||0)-(Dex.moves.get(a).basePower||0)||M(a).localeCompare(M(b)));
    const tile=i=>{const mv=mon.moves[i],d=mv?Dex.moves.get(mv):null,pp=movePP(mon,mv);
      return `<button class="eq-tile ${slot===i?'on':''}" data-slot="${i}" ${i>mon.moves.length?'disabled':''} style="--tc:${d?TYPE_COLOR[d.type]:'#3a4357'}">${slot===i?'<em>교체할 칸</em>':''}${d?`<span class="move-type" data-type="${d.type}">${TYPE_KO[d.type]}</span><b>${esc(M(mv))}</b><small><span class="cat ${d.category}">${CAT[d.category]}</span> 위력 ${d.basePower||'—'} · 명중 ${d.accuracy===true?'—':d.accuracy} · PP ${pp.current}/${pp.max}</small>`:'<b class="empty">빈 칸</b><small>배운 기술을 넣을 수 있습니다</small>'}</button>`;};
    return `<section class="eq-grid">${[0,1,2,3].map(tile).join('')}</section>
      <div class="mv-filters"><div class="chips">${[['all',`전체 ${pool.length+tmPool.length}`],['learned',`배운 기술 ${pool.length}`],['tm',`기술머신 ${tmPool.length}`]].map(([k,v])=>`<button class="chip ${source===k?'on':''}" data-source="${k}">${v}</button>`).join('')}<span class="sep"></span>${[['all','모든 분류'],['Physical','물리'],['Special','특수'],['Status','변화']].map(([k,v])=>`<button class="chip ${cat===k?'on':''}" data-cat="${k}">${v}</button>`).join('')}</div><input id="move-search" value="${esc(query)}" placeholder="기술 이름 검색" aria-label="기술 검색"></div>
      <div class="mv-list" role="listbox" aria-label="기술 목록">${all.map(m=>{const d=Dex.moves.get(m),on=mon.moves.includes(m),viaTm=!pool.includes(m);
        return `<button class="mv-row ${selected===m?'on':''} ${on?'equipped':''}" data-move="${esc(m)}" role="option" aria-selected="${selected===m}" style="--tc:${TYPE_COLOR[d.type]}"><span class="move-type" data-type="${d.type}">${TYPE_KO[d.type]}</span><span class="mv-name"><b>${esc(M(m))}${on?'<i class="tag eq">장착</i>':''}${viaTm?`<i class="tag tm">기술머신${String(TM_BY_MOVE[m]?.no||'').padStart(3,'0')} ×${stock[m]}</i>`:''}</b><small>${esc(MOVE_DESC_KO[m]||'')}</small></span><span class="cat ${d.category}">${CAT[d.category]}</span><span class="num"><small>위력</small>${d.basePower||'—'}</span><span class="num"><small>명중</small>${d.accuracy===true?'—':d.accuracy}</span><span class="num"><small>PP</small>${d.pp}</span></button>`;}).join('')||'<p class="muted empty-list">조건에 맞는 기술이 없습니다.</p>'}</div>`;
  };

  const movesBar=(locked)=>{
    const pool=[...new Set([...(mon.learned||[]),...mon.moves])];
    if(!selected) return `<p class="muted">${slot+1}번 칸에 넣을 기술을 목록에서 고르세요. 배운 기술로 바꾸면 ${MANAGEMENT.movePrice}, 기술머신은 1개를 씁니다.</p>`;
    const d=Dex.moves.get(selected),viaTm=!pool.includes(selected),funds=agencyOf(game).funds;
    if(mon.moves.includes(selected)) return `<p class="muted">${esc(M(selected))} — 이미 장착된 기술입니다. 다른 기술을 고르세요.</p>`;
    return `<div class="bar-desc"><div class="swap"><span class="from">${mon.moves[slot]?esc(M(mon.moves[slot])):'빈 칸'}</span><span class="arrow">→</span><span class="move-type" data-type="${d.type}">${TYPE_KO[d.type]}</span><b>${esc(M(selected))}</b></div><p>${esc(MOVE_DESC_KO[selected]||'')}</p></div>
      ${viaTm?`<button class="primary" id="use-tm" ${locked?'disabled':''}>${locked?'훈련 중에는 변경할 수 없습니다':`기술머신 사용 · ${slot+1}번 칸`}</button>`:`<button class="primary" id="confirm-move" ${locked||funds<MANAGEMENT.movePrice?'disabled':''}>${locked?'훈련 중에는 변경할 수 없습니다':funds<MANAGEMENT.movePrice?'자금이 부족합니다':`₽${MANAGEMENT.movePrice} · ${slot+1}번 칸 교체`}</button>`}`;
  };

  const abilityTab=(locked)=>{
    const sp=Dex.species.get(mon.species);
    return `<p class="muted lead">특성은 종마다 정해진 것 중에서만 고를 수 있습니다. 변경 비용 ₽${MANAGEMENT.abilityPrice.toLocaleString()}.</p><div class="ab-grid">${Object.entries(sp.abilities).map(([key,v])=>{const cur=v===mon.ability;return `<button class="ab-card ${cur?'current':''} ${ability===v?'on':''}" data-ability="${esc(v)}" ${cur||locked?'disabled':''}><header><b>${esc(A(v))}</b><i class="tag ${key==='H'?'hidden':''}">${key==='H'?'숨겨진 특성':'일반 특성'}</i>${cur?'<i class="tag eq">적용 중</i>':''}</header><p>${esc(ABILITY_DESC_KO[v]||'설명이 없습니다.')}</p></button>`;}).join('')}</div>`;
  };
  const abilityBar=(locked)=>ability?`<div class="bar-desc"><div class="swap"><span class="from">${esc(A(mon.ability))}</span><span class="arrow">→</span><b>${esc(A(ability))}</b></div><p>${esc(ABILITY_DESC_KO[ability]||'')}</p></div><button class="primary" id="confirm-ability" ${locked||agencyOf(game).funds<MANAGEMENT.abilityPrice?'disabled':''}>${agencyOf(game).funds<MANAGEMENT.abilityPrice?'자금이 부족합니다':`₽${MANAGEMENT.abilityPrice.toLocaleString()} · 특성 변경`}</button>`:'<p class="muted">바꿀 특성을 고르세요.</p>';

  const evoTab=(locked)=>{
    const sp=Dex.species.get(mon.species),opts=evolutionOptions(mon,game);
    return `<div class="evo-list">${opts.map(e=>`<article class="evo-card ${e.ready?'ready':''}"><div class="evo-from">${monImage(mon.species)}<b>${esc(K(mon.species))}</b></div><span class="evo-arrow">→</span><div class="evo-to">${monImage(e.species)}<b>${esc(K(e.species))}</b></div><div class="evo-cond"><small>진화 조건 · ${EVO_METHOD[e.method]||''}</small><b>${esc(e.reason)}</b><button class="primary" data-evolve="${esc(e.species)}" ${e.ready?'':'disabled'}>${e.ready?'진화하기':locked?'훈련 중에는 진화할 수 없습니다':'조건을 아직 채우지 못했습니다'}</button></div></article>`).join('')||'<p class="muted lead">최종 진화 형태입니다.</p>'}</div>
      ${sp.evos.length?`<label class="auto-evolve"><input type="checkbox" id="auto-evolve" ${locked?'disabled':''} ${mon.autoEvolve?'checked':''}> 레벨 조건을 채우면 경험치를 얻은 뒤 자동으로 진화</label>`:''}<p class="muted">자동 진화는 레벨·친밀도·기술·배틀 기록처럼 조건이 하나로 정해질 때만 합니다. 도구를 쓰거나 낮/밤을 고르는 진화는 여기서 직접 하세요. 통신진화는 연결의끈으로 대신합니다.</p>`;
  };

  const markup=(locked,tabs)=>`${side()}<section class="pkm-main">
      <header class="pkm-top"><nav class="seg" role="tablist">${tabs.map(([id,n])=>`<button role="tab" aria-selected="${tab===id}" class="${tab===id?'on':''}" data-tab="${id}">${n}</button>`).join('')}</nav><button class="ghost pkm-close close-pokemon" aria-label="닫기">✕</button></header>
      ${locked?'<p class="panel-notice warn">장기 훈련 중입니다. 정보는 볼 수 있지만, 변경은 훈련이 끝나거나 취소한 뒤에 할 수 있습니다.</p>':''}
      <div class="pkm-body">${tab==='moves'?movesTab(locked):tab==='ability'?abilityTab(locked):evoTab(locked)}</div>
      <footer class="pkm-bar">${tab==='moves'?movesBar(locked):tab==='ability'?abilityBar(locked):`<p class="muted">진화하면 능력치가 다시 계산되고 새 기술을 배울 수 있습니다.</p>`}</footer>
      <p class="panel-notice" role="status">${esc(notice)}</p></section>`;
  const draw=()=>{
    const locked=!!mon.training;
    const tabs=[['moves','기술'],['ability','특성'],['evolution','진화']];
    const scroll=dialog.querySelector('.mv-list')?.scrollTop||0;
    dialog.innerHTML=markup(locked,tabs);;
    wireMonImages(dialog);
    const list=dialog.querySelector('.mv-list');if(list)list.scrollTop=scroll;
    dialog.querySelector('.close-pokemon').onclick=close;
    dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(pending)return;tab=b.dataset.tab;selected=null;ability=null;notice='';draw();});
    dialog.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{slot=Number(b.dataset.slot);if(mon.moves.includes(selected))selected=null;draw();});
    dialog.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{selected=b.dataset.move;notice='';draw();});
    dialog.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{source=b.dataset.source;draw();});
    dialog.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{cat=b.dataset.cat;draw();});
    const wireRows=root=>root.querySelectorAll('[data-move]').forEach(b=>{b.onclick=()=>{selected=b.dataset.move;notice='';draw();};});
    const search=dialog.querySelector('#move-search');if(search)bindLiveSearch(search,{setQuery:v=>{query=v;},renderHtml:()=>markup(locked,tabs),selector:'.mv-list',wire:wireRows,scope:dialog});
    const confirm=dialog.querySelector('#confirm-move');if(confirm)confirm.onclick=()=>{const r=changeMove(game,mon,slot,selected);notice=r.msg;if(r.ok){selected=null;onChange();}draw();};
    const useTm=dialog.querySelector('#use-tm');if(useTm)useTm.onclick=async()=>{if(pending)return;pending=true;try{const r=await teachTM(game,mon,selected,slot);notice=r.msg;if(r.ok){selected=null;onChange();}}finally{pending=false;if(dialog.isConnected)draw();}};
    dialog.querySelectorAll('[data-ability]').forEach(b=>b.onclick=()=>{ability=b.dataset.ability;draw();});
    const ca=dialog.querySelector('#confirm-ability');if(ca)ca.onclick=()=>{const r=changeAbility(game,mon,ability);notice=r.msg;if(r.ok){ability=null;onChange();}draw();};
    dialog.querySelectorAll('[data-evolve]').forEach(b=>b.onclick=async()=>{
      if(pending)return;pending=true;b.disabled=true;
      try{const r=await evolvePokemon(mon,b.dataset.evolve,game);notice=r.ok?`${K(r.before)} → ${K(r.after)}, 진화했습니다!`:r.msg;if(r.ok){tmLearnable(mon.species).then(s=>{tmCompat=s;});onChange();}}catch{notice='진화 데이터를 불러오지 못했습니다. 다시 시도해 주세요.';}finally{pending=false;if(dialog.isConnected)draw();}
    });
    const auto=dialog.querySelector('#auto-evolve');if(auto)auto.onchange=()=>{mon.autoEvolve=auto.checked;onChange();};
    const it=dialog.querySelector('[data-open-item]');if(it)it.onclick=()=>{if(onItem)onItem(mon,()=>{onChange();if(dialog.isConnected)draw();});};
  };
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!pending)close();});
  document.body.append(dialog);dialog.showModal();draw();
}
