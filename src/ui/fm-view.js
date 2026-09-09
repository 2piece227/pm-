/**
 * FM식 화면 — 상단바(날짜·자금·계속) + 좌측 메뉴 + 본문 하나.
 *
 * 매니지먼트 게임의 화면 구조는 **받은 메시지함이 허브이고, 나머지는 좌측 메뉴로 들어가는 것**이다.
 * 시간은 상단 [계속] 하나로만 흐른다.
 *
 * 하루의 결정은 **맵**에서 한다 — 트레이너를 어느 도로로 보내 포켓몬을 잡을지, NPC와 싸울지.
 * 결과는 관전 없이 글로 받은 메시지함에 온다. 훈련 화면은 뺐다(성장은 탐험으로만).
 * 잡은 포켓몬은 **박스**에 쌓이고, 기술은 트레이너 프로필에서 직접 고른다.
 */
import {
  assignAction, playerAgency, playerRoster,
  dailyUpkeep, trainerRating,
  findTrainer, findAgency, rosterLock, exploreAction, parseExplore, describeAction,
  boxToParty, partyToBox,
} from '../engine/game.js';
import { STAT_KEYS, displayStats } from '../data/agencies.js';
import { STAT_KO } from '../data/styles.js';
import { SPECIES_KO, MOVE_KO, ko } from '../data/ko.js';
import { fieldState } from '../engine/field-state.js';
import { realStats, expForLevel, setMoves } from '../data/pokemon.js';
import { locationById, locationsIn, TRAINER_CLASSES } from '../data/routes.js';
import { openNegotiation } from './negotiation.js';
import * as sfx from './sfx.js';
import { ATLAS_REGIONS, regionSvg } from './region-map.js';
import { monImage, wireMonImages, gameDate, dayProgress } from './management-widgets.js';
import { saveGame } from '../engine/save.js';
import { snapshotGame, restoreGame } from '../engine/checkpoint.js';
import { runDay } from './day-runner.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();
const K = (s) => ko(SPECIES_KO, s);
const M = (s) => ko(MOVE_KO, s);
const statusLabel = s => ({brn:'화상',psn:'독',tox:'맹독',par:'마비',slp:'잠듦',frz:'얼음'}[s] || s);

let game = null;
let screen = 'office';
let selectedMessage = null;
let boxSelection = 0;
let busy = false;
let saveNotice = '';
let mapQuery = '';
let mapFilter = 'all';
let lastView = '';
let detailId = null;       // 트레이너 프로필

/* 맵 화면 상태 */
const map = { region: 'kanto', locId: null, trainerId: null, activities: 8 };

/* 읽은 메시지 — 세션 동안만 */
const read = new Set();

/* ---------------- 좌측 메뉴 ---------------- */

const MENU = [
  { grp: '소속사' },
  { id: 'office', label: '대표실' },
  { id: 'inbox', label: '받은 메시지함' },
  { id: 'squad', label: '스쿼드' },
  { id: 'box', label: '포켓몬 박스' },
  { grp: '활동' },
  { id: 'map', label: '탐험 지도' },
  { id: 'schedule', label: '일정' },
  { grp: '영입' },
  { id: 'scouting', label: '스카우팅' },
];

function renderSide() {
  const unread = inboxItems().filter((m) => !read.has(m.key)).length;
  const lock = rosterLock(game);
  const boxN = playerAgency(game).box.length;

  $('side').innerHTML = MENU.map((m) => {
    if (m.grp) return `<div class="grp">${m.grp}</div>`;
    const locked = m.id === 'scouting' && lock;
    let badge = '';
    if (m.id === 'inbox' && unread) badge = `<span class="badge">${unread}</span>`;
    if (m.id === 'box' && boxN) badge = `<span class="badge">${boxN}</span>`;
    return `<button data-s="${m.id}" class="${screen === m.id ? 'on' : ''}${locked ? ' lock' : ''}">`
      + `${m.label}${badge}</button>`;
  }).join('');

  $('side').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { screen = b.dataset.s; detailId = null; render(); };
  });
}

/* ---------------- 상단바 ---------------- */

function renderTop() {
  const a = playerAgency(game);
  const upkeep = dailyUpkeep(game);
  $('tb-agency').textContent = a.name;
  $('tb-manager').textContent = game.playerName ? `${game.playerName} 대표` : '';
  $('tb-date').textContent = gameDate(game.day);
  $('tb-funds').innerHTML = `<span class="${a.funds < upkeep * 5 ? 'neg' : ''}">${won(a.funds)}</span>`;
  $('tb-wage').textContent = `${won(upkeep * 7)} / 주`;
  $('tb-rep').textContent = Math.round(a.reputation);
  $('tb-continue').disabled = !!game.gameOver || busy || !playerRoster(game).length;
  $('tb-continue').textContent = game.gameOver ? '운영 종료' : !playerRoster(game).length ? '첫 계약이 필요합니다' : '계속 ▷';
}

/* ---------------- 받은 메시지함 ---------------- */

/** 게임에서 벌어진 일을 메시지 목록으로 (§9 뉴스 파이프라인 재사용) */
function inboxItems() {
  const out = [];
  const lock = rosterLock(game);

  if (lock) {
    out.push({
      key: 'opening', day: game.day, title: '첫 시즌의 육성 계획',
      body: `${lock.trainer ? `담당 유스 ${lock.trainer.name}의 목표는 ` : ''}지역 뱃지 8개입니다. 모두 모으면 `
        + `추가 계약이 열립니다. 지금은 ${lock.badges}개입니다.`,
    });
  }

  /* 오늘 배정이 비어 있으면 알려준다 — FM의 "할 일" 메시지 */
  const idle = playerRoster(game).filter((t) => !game.actions[t.id] || game.actions[t.id] === 'rest');
  if (idle.length) {
    out.push({
      key: `idle-${game.day}`, day: game.day, title: '오늘 할 일이 없는 트레이너가 있습니다',
      body: `${idle.map((t) => t.name).join(', ')} — 맵에서 보낼 곳을 정해주세요.`,
    });
  }

  for (const n of [...(game.league.newsFeed || [])].sort((a,b)=>(b.day||0)-(a.day||0)).slice(0,40)) {
    if (n.kind === 'explore') {
      const [first, ...rest] = n.text.split(' / ');
      out.push({ key: `n-${n.day}-${n.trainerId}-${n.text.length}`, day: n.day, trainerId: n.trainerId, title: first.replace('탐험을 시작했다.', '탐험 보고'), body: rest.join('\n'), preview: rest.at(-1) });
    } else {
      out.push({ key: `n-${n.day}-${n.text}`, day: n.day, title: n.text, body: '' });
    }
  }
  return out.sort((a,b) => Number(b.key.startsWith('n-')) - Number(a.key.startsWith('n-')) || b.day - a.day);
}

function renderOffice() {
  const a = playerAgency(game), roster = playerRoster(game);
  const lock = rosterLock(game), rep = game.lastReport;
  return `<div class="page-h"><div><div class="eyebrow">MANAGER'S OFFICE · 시즌 1</div><h2>${esc(game.playerName || '대표')}님의 사무실</h2></div><span class="muted">${saveNotice || '진행 상황 자동 저장'}</span></div>
    <section class="office-hero"><div><span class="eyebrow">${gameDate(game.day)} · ${game.day}일차</span><h1>${roster.length ? '작은 팀에서 시작되는 큰 여정.' : '첫 계약이 새로운 시즌을 엽니다.'}</h1><p>${roster.length ? '오늘의 목적지를 정하고, 트레이너의 성장을 지켜보세요.' : '스카우팅 보고서를 살펴보고 첫 유스 트레이너와 협상하세요.'}</p><button data-nav="${roster.length ? 'map' : 'scouting'}">${roster.length ? '오늘의 활동 배정' : '후보 살펴보기'} →</button></div><div class="hero-emblem"><span class="pokeball"></span><small>TRAINER<br>MANAGEMENT</small></div></section>
    <div class="metric-grid"><div><span>사용 가능한 자금</span><b>₽ ${won(a.funds)}</b><small>주급 예산 ${won(dailyUpkeep(game)*7)}</small></div><div><span>소속 트레이너</span><b>${roster.length}<small> 명</small></b><small>보유 포켓몬 ${a.box.length + roster.reduce((n,t)=>n+t.party.length,0)}마리</small></div><div><span>첫 여정 · 뱃지</span><b>${lock?.badges || 0}<small> / 8</small></b><small>체육관 도전 준비 중</small></div><div><span>다음 급여 지급</span><b class="metric-name">${gameDate(Math.ceil(game.day/7)*7)}</b><small>7일마다 계약 주급을 정산합니다</small></div></div>
    <div class="office-columns"><section class="card"><div class="section-heading"><h3>오늘의 운영 계획</h3><button class="ghost" data-nav="map">일정 변경</button></div>
      ${roster.length ? roster.map(t=>`<div class="assignment"><span class="avatar">${esc(t.name[0])}</span><div><b>${esc(t.name)}</b><p>${esc(describeAction(game.actions[t.id]))}</p></div><div class="mini-party">${t.party.map(m=>monImage(m.species)).join('')}</div></div>`).join('') : '<p class="muted">아직 계약한 트레이너가 없습니다.</p>'}</section>
      <section class="card"><div class="section-heading"><h3>대표에게 온 보고</h3><button class="ghost" data-nav="inbox">전체 보기</button></div>${inboxItems().slice(0,3).map(m=>`<button class="brief-link" data-nav="inbox"><small>${m.day}일차 · 운영 보고</small><b>${esc(m.title)}</b><span>→</span></button>`).join('') || '<p class="muted">첫 유스 계약을 기다리고 있습니다.</p>'}</section></div>
    ${rep ? renderDailySummary(rep, false) : ''}`;
}

function renderDailySummary(rep, detailed = true) {
  return `<section class="card daily-summary"><div class="section-heading"><div><div class="eyebrow">DAILY REVIEW · ${rep.day}일차</div><h3>하루 운영 보고서</h3></div><b class="${rep.net < 0 ? 'negative' : 'positive'}">수지 ${rep.net >= 0 ? '+' : ''}${won(rep.net)}</b></div>
  ${(rep.explored || []).map(r=>`<div class="report-activity"><b>${esc(r.name)} · ${esc(r.location)}</b>
    ${r.events ? `<div class="activity-totals"><span>${r.events.length}/${r.budget} 활동</span><span>${r.wins}승 ${r.losses}패</span><span>포획 ${r.caught}마리</span><span>센터 ${r.centers}회</span><span>상금 +${won(r.money)}</span></div>
      <details class="activity-details" ${detailed?'open':''}><summary>시간순 활동 기록</summary><ol class="activity-timeline">${r.events.map(e=>`<li class="activity-${e.kind}"><time>${e.time}<small>${e.slot}번째 활동</small></time><div><b>${e.kind==='center'?'포켓몬센터':e.kind==='catch'?'야생 포켓몬 탐색':'트레이너 배틀'} ${e.won===false?'· 패배':''}</b>${e.lines.map(l=>`<p>${esc(l)}</p>`).join('')}<small class="muted">파티 HP ${e.before.reduce((n,p)=>n+p.hp,0)} → ${e.after.reduce((n,p)=>n+p.hp,0)} / ${e.after.reduce((n,p)=>n+p.maxhp,0)}</small></div></li>`).join('')}</ol></details>` : `<ul>${r.lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`}</div>`).join('')}
  ${rep.rested.length ? `<p class="muted">휴식 완료 · ${esc(rep.rested.join(', '))}</p>` : ''}
  <div class="report-foot">급여 지급 ${won(rep.upkeep)} · 새로운 소식 ${rep.news.length}건</div></section>`;
}

function renderInbox() {
  const items = inboxItems();
  const selected = items.find(m => m.key === selectedMessage) || items[0];
  const selectedReport = selected?.trainerId ? game.log.find(r=>r.day===selected.day) : null;
  return `<div class="page-h"><div><div class="eyebrow">COMMUNICATIONS</div><h2>받은 메시지함</h2></div><span class="muted">${items.length}건</span></div>
    <div class="mail-layout"><div class="mail-list">${items.map((m,i)=>`<button class="mail-item ${selected?.key === m.key ? 'selected' : ''} ${read.has(m.key)?'':'unread'}" data-message="${i}"><small>${m.day}일차 · 운영팀</small><b>${esc(m.title)}</b><p>${esc((m.preview || m.body || '소속사 소식을 확인하세요.').slice(0,140))}</p></button>`).join('') || '<p class="muted">받은 소식이 없습니다.</p>'}</div>
    <article class="mail-body">${selected ? `<div class="eyebrow">운영팀 → ${esc(game.playerName || '대표')}</div><h2>${esc(selected.title)}</h2><small>${selected.day}일차 · ${gameDate(selected.day)}</small><hr>${selectedReport ? renderDailySummary(selectedReport) : `<div class="letter">${esc(selected.body || '상세 내용은 관련 화면에서 확인할 수 있습니다.').replace(/\n/g,'<br>')}</div>`}<div class="dialog-actions"><button class="ghost" data-nav="map">탐험 지도</button><button class="ghost" data-nav="squad">스쿼드 확인</button></div>` : '<h3>새로운 소식을 기다리고 있습니다.</h3>'}</article></div>`;
}

/* ---------------- 스쿼드 ---------------- */

/** FM처럼 값에 따라 색이 붙는 능력치 숫자 */
function at(v) {
  const n = Math.round(v);
  const cls = n >= 18 ? 'top' : n >= 14 ? 'hi' : n >= 10 ? 'mid' : 'lo';
  return `<span class="at ${cls}">${n}</span>`;
}

function renderSquad() {
  const roster = playerRoster(game);
  if (!roster.length) return '<div class="note">아직 계약한 트레이너가 없습니다.</div>';

  return `
    <div class="page-h"><h2>스쿼드</h2><div class="note">${roster.length}명</div></div>
    <table class="grid">
      <thead><tr>
        <th>이름</th>${STAT_KEYS.map((k) => `<th class="n">${STAT_KO[k]}</th>`).join('')}
        <th class="n">전적</th><th class="n">주급</th><th>파티</th><th>오늘</th>
      </tr></thead>
      <tbody>${roster.map((t) => {
    const d = displayStats(t);
    const deb = t.mentalDebuff > 0.5 ? ` <span class="pill" style="color:var(--red)">−${t.mentalDebuff.toFixed(1)}</span>` : '';
    return `<tr data-id="${t.id}">
          <td class="nm">${esc(t.name)}${t.isYouth ? ' <span class="pill">유스</span>' : ''}${deb}</td>
          ${STAT_KEYS.map((k) => `<td class="n">${at(d[k])}</td>`).join('')}
          <td class="n">${t.record?.wins || 0}승 ${t.record?.losses || 0}패</td>
          <td class="n">${t.contract?.wage ?? t.salary}</td>
          <td>${(t.party || []).map((m) => `${K(m.species)} <span class="lv">Lv${m.level}</span>`).join(', ') || '—'}</td>
          <td class="note">${esc(describeAction(game.actions[t.id]))}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>`;
}

/** 포켓몬 한 줄 + 기술 고르기 */
function monRow(m, { trainerId = null, index = null, editable = false, boxIndex = null } = {}) {
  const base = expForLevel(m.level);
  const next = expForLevel(m.level + 1);
  const pct = Math.max(0, Math.min(100, ((m.exp - base) / Math.max(1, next - base)) * 100));
  const st = realStats(m);
  const learned = m.learned || m.moves;

  const moveEditor = editable ? `
    <div class="moves" data-t="${trainerId}" data-i="${index}">
      ${learned.map((mv) => `<label class="mvopt"><input type="checkbox" value="${esc(mv)}" ${m.moves.includes(mv) ? 'checked' : ''}> ${esc(M(mv))}</label>`).join('')}
      <button class="ghost apply-moves" style="padding:2px 9px;font-size:11px">적용</button>
    </div>` : `<div class="mv">${m.moves.map((x) => esc(M(x))).join('<br>')}</div>`;

  const btn = boxIndex != null
    ? `<button class="ghost to-party" data-b="${boxIndex}" style="padding:2px 9px;font-size:11px">파티로</button>`
    : (trainerId && index != null && !editable ? '' : '');

  return `<div class="mon">
    ${monImage(m.species)}
    <div style="flex:1;min-width:0">
      <div class="nm">${K(m.species)} <span class="lv">Lv${m.level}</span>
        ${trainerId && index != null ? `<button class="ghost to-box" data-t="${trainerId}" data-i="${index}" style="padding:1px 7px;font-size:10px;margin-left:6px">박스로</button>` : ''}
        ${btn}</div>
      <div class="lv">HP ${fieldState(m).hp}/${st.hp}${fieldState(m).status ? ` · ${statusLabel(fieldState(m).status)}` : ''} · 공 ${st.atk} · 방 ${st.def} · 특공 ${st.spa} · 특방 ${st.spd} · 속 ${st.spe} · ${esc(m.nature)}</div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      ${editable ? moveEditor : ''}
    </div>
    ${editable ? '' : moveEditor}
  </div>`;
}

function renderTrainer(id) {
  const t = findTrainer(game.league, id);
  if (!t) return '<div class="note">없는 트레이너입니다.</div>';
  const d = displayStats(t);
  const c = t.contract || {};

  return `
    <div class="page-h">
      <h2>${esc(t.name)}</h2>
      <div class="note">${t.isYouth ? '유스' : '정식'} · 레이팅 ${trainerRating(t).toFixed(1)} · ${t.record?.wins || 0}승 ${t.record?.losses || 0}패</div>
    </div>
    <button class="ghost" id="back-squad" style="margin-bottom:10px">← 스쿼드</button>
    <div class="cards">
      <div class="card">
        <h3>능력치</h3>
        <table class="grid"><tbody>
          ${STAT_KEYS.map((k) => `<tr><td>${STAT_KO[k]}</td><td class="n">${at(d[k])}</td></tr>`).join('')}
          <tr><td>연패 페널티</td><td class="n">${t.mentalDebuff ? `−${t.mentalDebuff.toFixed(1)}` : '없음'}</td></tr>
          <tr><td>오늘</td><td class="n">${esc(describeAction(game.actions[t.id]))}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h3>계약</h3>
        <table class="grid"><tbody>
          <tr><td>주급</td><td class="n">${c.wage ?? t.salary}</td></tr>
          <tr><td>영입 개런티</td><td class="n">${won(c.signing || 0)}</td></tr>
          <tr><td>프로 승급 시</td><td class="n">${c.proRaise ?? 100}%</td></tr>
          <tr><td>뱃지 보너스</td><td class="n">${won(c.badgeBonus || 0)}/개</td></tr>
          <tr><td>계약 기간</td><td class="n">${c.years ?? '—'}년</td></tr>
        </tbody></table>
      </div>
    </div>
    <div class="card" style="margin-top:10px">
      <h3>파티 <span class="note">${(t.party || []).length} / 6 · 기술은 배운 것 중에서 4개까지 고른다</span></h3>
      ${(t.party || []).map((m, i) => monRow(m, { trainerId: t.id, index: i, editable: true })).join('') || '<div class="note">아직 없습니다.</div>'}
    </div>`;
}

/* ---------------- 박스 ---------------- */

function renderBox() {
  const a = playerAgency(game), roster = playerRoster(game);
  const target = roster.find(t=>t.id === map.trainerId) || roster[0];
  boxSelection = Math.max(0, Math.min(boxSelection, a.box.length - 1));
  const selected = a.box[boxSelection];
  return `<div class="page-h"><div><div class="eyebrow">POKÉMON STORAGE</div><h2>소속사 포켓몬 박스</h2></div><span class="muted">보관 ${a.box.length}마리</span></div>
    <div class="storage-layout"><section class="card"><div class="section-heading"><h3>보관 중인 포켓몬</h3><span class="muted">포획한 포켓몬은 여기에 도착합니다</span></div><div class="storage-grid">${Array.from({length:Math.max(30,Math.ceil(a.box.length/30)*30)},(_,i)=>a.box[i] ? `<button class="storage-slot ${boxSelection === i?'selected':''}" data-box-select="${i}">${monImage(a.box[i].species)}<b>${K(a.box[i].species)}</b><small>Lv. ${a.box[i].level}</small></button>`:'<div class="storage-slot empty"><span>＋</span></div>').join('')}</div></section>
    <aside><section class="card storage-detail">${selected ? `<div class="eyebrow">선택한 포켓몬</div>${monImage(selected.species)}<h2>${K(selected.species)} <small>Lv. ${selected.level}</small></h2><p class="muted">${selected.caughtOnDay || 1}일차에 만난 동료</p><div class="move-pills">${selected.moves.map(m=>`<span>${esc(M(m))}</span>`).join('')}</div><label>함께할 트레이너<select id="box-target">${roster.map(t=>`<option value="${t.id}" ${t.id===target?.id?'selected':''}>${esc(t.name)} · ${t.party.length}/6</option>`).join('')}</select></label><button class="to-party" data-b="${boxSelection}" ${!target || target.party.length>=6?'disabled':''}>파티에 합류시키기</button>${target?.party.length>=6?'<p class="muted">파티가 가득 찼습니다. 한 마리를 박스로 옮겨주세요.</p>':''}` : '<h3>첫 만남을 기다리는 중</h3><p class="muted">지도에서 포켓몬 포획을 배정하세요.</p><button data-nav="map">탐험 지도 열기</button>'}</section>
    <section class="card party-preview"><h3>${esc(target?.name || '트레이너')}의 파티</h3>${(target?.party||[]).map((m,i)=>`<div class="party-slot">${monImage(m.species)}<div><b>${K(m.species)}</b><small>Lv. ${m.level}</small></div><button class="ghost to-box" data-t="${target.id}" data-i="${i}" ${target.party.length===1?'disabled':''}>박스로</button></div>`).join('')}<p class="muted">${target?.party.length||0} / 6 · 마지막 동료는 파티에 남습니다.</p></section></aside></div>`;
}

/* ---------------- 맵 ---------------- */

function renderMap() {
  const roster = playerRoster(game);
  const region = ATLAS_REGIONS.find(r=>r.id===map.region) || ATLAS_REGIONS[0];
  const locs = locationsIn(region.id);
  if (!roster.some(t=>t.id === map.trainerId)) map.trainerId = roster[0]?.id || null;
  const t = roster.find(t=>t.id===map.trainerId);
  if (!locs.some(l=>l.id===map.locId)) map.locId = locs.find(l=>l.id===t?.locationId)?.id || locs.find(l=>l.id===(region.id==='kanto'?'route1':'route29'))?.id || locs[0]?.id;
  const loc = locationById(map.locId);
  const level = Math.max(1,...(t?.party||[]).map(m=>m.level));
  const cur = game.actions[t?.id], ex = parseExplore(cur);
  const filtered = locs.filter(l=>l.name.includes(mapQuery) && (mapFilter==='all' || (mapFilter==='catch' ? l.wild.length : l.trainers.length)));
  return `<div class="page-h"><div><div class="eyebrow">WORLD ATLAS · FIELD OPERATIONS</div><h2>탐험 지도</h2></div><span class="muted">목적지 선택 → 활동 배정 → 계속</span></div>
    <div class="region-tabs">${ATLAS_REGIONS.map(r=>`<button class="reg ${r.id===map.region?'selected':''}" data-r="${r.id}"><small>${String(r.gen).padStart(2,'0')}</small>${r.name}${r.playable?'<i></i>':''}</button>`).join('')}</div>
    <div class="atlas-layout"><section><div class="atlas-toolbar"><div><h3>${region.name} 지방</h3><span class="muted">${region.subtitle}</span></div><span class="pill">${region.playable ? '탐험 가능' : '미개방'}</span></div>
    <div class="atlas-canvas">${regionSvg(region.id,map.locId,level,t?.locationId)}</div>
    <div class="atlas-legend"><span>● 마을</span><span>○ 도로·숲</span><span class="negative">● 권장 레벨 주의</span><span><a href="https://eeveeexpo.com/resources/572/" target="_blank" rel="noopener noreferrer">HGSS · ENLS 타운맵</a></span></div>
    ${region.playable ? `<div class="route-tools"><input id="route-search" placeholder="도로 · 마을 검색" value="${esc(mapQuery)}" aria-label="장소 검색"><select id="route-filter" aria-label="활동 필터"><option value="all" ${mapFilter==='all'?'selected':''}>모든 장소</option><option value="catch" ${mapFilter==='catch'?'selected':''}>포획 가능</option><option value="battle" ${mapFilter==='battle'?'selected':''}>배틀 가능</option></select></div><div class="route-list">${filtered.map(l=>`<button class="route-row ${loc?.id===l.id?'selected':''}" data-l="${l.id}"><span>${esc(l.name)}</span><small>Lv.${l.level.join('–')}</small></button>`).join('') || '<p class="muted">검색 결과가 없습니다.</p>'}</div>` : `<section class="card region-preview"><h3>${region.name} 탐험은 아직 개방되지 않았습니다</h3><p class="muted">이 지방의 커뮤니티 타운맵과 출현 데이터는 아직 준비 중입니다.</p><button class="ghost reg" data-r="kanto">관동 활동으로 돌아가기</button></section>`}</section>
    <aside class="card destination">${loc && region.playable ? `<div class="eyebrow">목적지 정보</div><h2>${esc(loc.name)}</h2><span class="level-label">권장 Lv. ${loc.level.join('–')}</span>${level+4<loc.level[0]?'<p class="risk-note">현재 파티로는 어려운 상대가 많습니다.</p>':''}
    <h4>출현 포켓몬 <small>${loc.wild.length}종</small></h4><div class="wild-grid">${loc.wild.map(w=>`<div>${monImage(w.species)}<b>${K(w.species)}</b><small>Lv.${w.min}–${w.max}</small></div>`).join('') || '<p class="muted">야생 포켓몬이 출현하지 않습니다.</p>'}</div>
    <h4>현지 트레이너</h4>${loc.trainers.map(n=>`<div class="npc-row"><b>${t?.beaten?.[`${loc.id}:${n.name}`]?'✓ ':''}${TRAINER_CLASSES[n.cls]?.name || n.cls} ${esc(n.name)}</b><p>${n.party.map(([s,l])=>`${K(s)} Lv.${l}`).join(' · ')}</p></div>`).join('')||'<p class="muted">배틀 상대가 없습니다.</p>'}
    <div class="dispatch-form"><label>파견 트레이너<select id="map-trainer">${roster.map(x=>`<option value="${x.id}" ${x.id===t?.id?'selected':''}>${esc(x.name)} · 파티 ${x.party.length}마리</option>`).join('') || '<option>첫 계약이 필요합니다</option>'}</select></label><label>하루 활동 횟수<select id="activity-budget" aria-label="하루 활동 횟수">${[6,7,8,9,10].map(n=>`<option value="${n}" ${n===(ex?.activities || map.activities)?'selected':''}>${n}회${n===8?' · 기본':''}</option>`).join('')}</select></label><p class="muted">센터 방문도 1회입니다. HP 50% 미만·기절·상태이상·PP 부족 시 회복 후 탐험을 이어갑니다.</p><div class="field-party">${(t?.party||[]).map(m=>`<span>${K(m.species)} <b>HP ${fieldState(m).hp}/${fieldState(m).maxhp}</b>${fieldState(m).status?' · '+statusLabel(fieldState(m).status):''}</span>`).join('')}</div><button data-act="mixed" ${t&&(loc.wild.length||loc.trainers.length)?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='mixed'?'✓ 병행 탐험 배정됨':'포획·배틀 병행 배정'}</button><button data-act="catch" ${t&&loc.wild.length?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='catch'?'✓ 포획 배정됨':'포켓몬 포획 배정'}</button><button class="ghost" data-act="battle" ${t&&loc.trainers.length?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='battle'?'✓ 배틀 배정됨':'트레이너 배틀 배정'}</button><p class="muted">오늘: ${esc(describeAction(cur))}</p>${cur&&cur!=='rest'?'<button class="ghost" id="cancel-assignment">배정 취소 · 휴식</button>':''}</div>` : `<div class="eyebrow">WORLD ATLAS</div><h2>${region.name}</h2><p class="muted">현재 소속사의 활동 범위는 관동·성도입니다.</p>`}</aside></div>`;
}

/* ---------------- 활동 일정 ---------------- */
function renderSchedule() {
  const roster = playerRoster(game);
  return `<div class="page-h"><div><div class="eyebrow">OPERATIONS CALENDAR</div><h2>활동 일정</h2></div><span class="muted">오늘의 배정과 주간 정산</span></div>
    <div class="week-calendar">${Array.from({length:7},(_,i)=>game.day+i).map(day=>`<section class="calendar-day ${day===game.day?'today':''}"><small>${day===game.day?'오늘':`${day-game.day}일 후`}</small><h3>${gameDate(day)}</h3>${day===game.day?roster.map(t=>`<p><b>${esc(t.name)}</b><br>${esc(describeAction(game.actions[t.id]))}</p>`).join(''):'<p class="muted">활동 미배정</p>'}${day%7===0?'<span class="pill">주급 지급일</span>':''}</section>`).join('')}</div>
    <section class="card" style="margin-top:22px"><div class="section-heading"><h3>오늘의 활동 지시</h3><button data-nav="map">목적지 선택 →</button></div><p class="muted">하루 6~10회의 활동을 배정합니다. 센터 방문도 활동에 포함되며, 배정하지 않은 트레이너와 포켓몬은 휴식하며 회복합니다.</p>${roster.map(t=>`<div class="assignment"><span class="avatar">${esc(t.name[0])}</span><div><b>${esc(t.name)}</b><p>${esc(describeAction(game.actions[t.id]))}</p></div></div>`).join('')}</section>
    <section class="card" style="margin-top:22px"><h3>지난 활동</h3>${game.log.slice(0,7).map(rep=>`<div class="assignment"><b>${gameDate(rep.day)}</b><span class="muted">${rep.explored.map(r=>`${esc(r.name)} · ${esc(r.location)}`).join(' / ') || '휴식 및 소속사 운영'} · 수지 ${rep.net>=0?'+':''}${won(rep.net)}</span></div>`).join('') || '<p class="muted">아직 완료한 활동이 없습니다.</p>'}</section>`;
}

/* ---------------- 스카우팅 ---------------- */

function renderScouting() {
  const lock = rosterLock(game);
  if (lock) {
    return `<div class="page-h"><h2>스카우팅</h2></div>
      <div class="card"><h3>지금은 계약할 수 없습니다</h3>
      <div class="note">${lock.trainer ? `${esc(lock.trainer.name)}이(가) ` : ''}지역 뱃지 8개를 모두 모아야
      로스터를 늘릴 수 있습니다. 현재 ${lock.badges} / ${lock.needed}개.</div></div>`;
  }
  return `<div class="page-h"><h2>스카우팅</h2></div><div id="nego-root"></div>`;
}

/* ---------------- 렌더 ---------------- */

function render() {
  renderTop();
  renderSide();

  const main = $('main');
  if (detailId) main.innerHTML = renderTrainer(detailId);
  else if (screen === 'office') main.innerHTML = renderOffice();
  else if (screen === 'inbox') main.innerHTML = renderInbox();
  else if (screen === 'squad') main.innerHTML = renderSquad();
  else if (screen === 'box') main.innerHTML = renderBox();
  else if (screen === 'map') main.innerHTML = renderMap();
  else if (screen === 'schedule') main.innerHTML = renderSchedule();
  else if (screen === 'scouting') main.innerHTML = renderScouting();

  wire();
  wireMonImages(main);
  const view = `${screen}:${detailId || ''}`;
  if (view !== lastView) main.scrollTop = 0;
  lastView = view;
}

function wire() {
  const main = $('main');
  main.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ screen=b.dataset.nav; detailId=null; render(); });
  main.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{ const m=inboxItems()[Number(b.dataset.message)]; selectedMessage=m.key; read.add(m.key); game.readMessages=[...read]; persist(); render(); });
  main.querySelectorAll('[data-box-select]').forEach(b=>b.onclick=()=>{boxSelection=Number(b.dataset.boxSelect);render();});
  const search=$('route-search');
  if(search) search.oninput=()=>{const pos=search.selectionStart;mapQuery=search.value;render();$('route-search').focus();$('route-search').setSelectionRange(pos,pos);};
  const filter=$('route-filter');if(filter) filter.onchange=()=>{mapFilter=filter.value;render();};
  if($('cancel-assignment')) $('cancel-assignment').onclick=()=>{assignAction(game,map.trainerId,'rest');persist();render();};

  main.querySelectorAll('.msg').forEach((el) => {
    el.onclick = () => { read.add(el.dataset.k); el.classList.remove('unread'); renderSide(); };
  });
  main.querySelectorAll('.grid tbody tr[data-id]').forEach((tr) => {
    tr.onclick = () => { detailId = tr.dataset.id; render(); };
  });
  const back = $('back-squad');
  if (back) back.onclick = () => { detailId = null; render(); };

  /* 기술 고르기 */
  main.querySelectorAll('.moves').forEach((box) => {
    const t = findTrainer(game.league, box.dataset.t);
    const mon = t?.party?.[Number(box.dataset.i)];
    const checks = [...box.querySelectorAll('input[type=checkbox]')];
    const limit = () => {
      const on = checks.filter((c) => c.checked).length;
      checks.forEach((c) => { c.disabled = !c.checked && on >= 4; });
    };
    checks.forEach((c) => { c.onchange = limit; });
    limit();
    box.querySelector('.apply-moves').onclick = () => {
      if (!mon) return;
      const picked = checks.filter((c) => c.checked).map((c) => c.value);
      if (!setMoves(mon, picked)) { alert('기술을 하나 이상 골라야 합니다.'); return; }
      persist(); render();
    };
  });

  /* 박스 ↔ 파티 */
  main.querySelectorAll('.to-box').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const r = partyToBox(game, b.dataset.t, Number(b.dataset.i));
      if (!r.ok) alert(r.msg);
      persist(); render();
    };
  });
  main.querySelectorAll('.to-party').forEach((b) => {
    b.onclick = () => {
      const target = $('box-target')?.value || playerRoster(game)[0]?.id;
      const r = boxToParty(game, target, Number(b.dataset.b));
      if (!r.ok) alert(r.msg);
      persist(); render();
    };
  });
  const bt = $('box-target');
  if (bt) bt.onchange = () => { map.trainerId = bt.value; render(); };

  /* 맵 */
  main.querySelectorAll('.reg').forEach((b) => {
    b.onclick = () => { map.region = b.dataset.r; map.locId = null; mapQuery=''; render(); };
  });
  main.querySelectorAll('[data-l]').forEach((b) => {
    b.onclick = () => { map.locId = b.dataset.l; render(); };
    b.onkeydown = e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();} };
  });
  const budgetInput = $('activity-budget');
  if (budgetInput) budgetInput.onchange = () => {
    map.activities = Number(budgetInput.value);
    const ex = parseExplore(game.actions[map.trainerId]);
    if (ex?.locationId === map.locId) { assignAction(game,map.trainerId,exploreAction(ex.locationId,ex.mode,map.activities));persist();render(); }
  };
  const mt = $('map-trainer');
  if (mt) mt.onchange = () => { map.trainerId = mt.value; render(); };
  main.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => {
      if (!map.trainerId || !map.locId) return;
      assignAction(game, map.trainerId, exploreAction(map.locId, b.dataset.act, Number($('activity-budget')?.value || 8)));
      persist(); render();
    };
  });

  if (screen === 'scouting' && $('nego-root')) {
    openNegotiation($('nego-root'), game, () => gotoMap());
  }
}

/* ---------------- 진입 ---------------- */

function persist() { saveNotice = saveGame(game).persisted ? '저장됨 · 이 브라우저' : '저장 공간이 부족합니다. 진행이 저장되지 않았습니다.'; }

export function initFm({ game: existing }) {
  game = existing;
  screen = 'office';
  read.clear(); (game.readMessages || []).forEach(k=>read.add(k));
  $('app').hidden = false;

  $('tb-continue').onclick = async () => {
    if (busy || game.gameOver || !playerRoster(game).length) return;
    busy = true; renderTop();
    const before = snapshotGame(game);
    const progress = dayProgress(game.day);
    try {
      game = await runDay(game, progress.update);
      window.__game = game;
      persist();
      screen = 'inbox'; detailId = null; selectedMessage = null; lastView = '';
    } catch (error) {
      game = restoreGame(before); window.__game = game;
      saveNotice = '진행 실패 · 하루 시작 전 상태로 복구했습니다.';
      alert(`${saveNotice} ${error.message}`);
    } finally { progress.close(); busy = false; render(); }
  };

  sfx.installUnlockHandler();
  const sfxToggle = $('sfx-on');
  if (sfxToggle) {
    sfx.setEnabled(sfxToggle.checked);
    sfxToggle.onchange = () => { sfx.unlock(); sfx.setEnabled(sfxToggle.checked); };
  }

  render();
  window.__game = game;
  window.addEventListener('pagehide', () => { if(!busy) persist(); });
}

/** 오프닝이 스카우팅 화면으로 바로 보낼 때 */
export function gotoScouting() {
  screen = 'scouting';
  detailId = null;
  render();
}

/** 계약 직후 맵으로 — 첫 할 일을 정하게 */
export function gotoMap() {
  screen = 'map';
  detailId = null;
  render();
}
