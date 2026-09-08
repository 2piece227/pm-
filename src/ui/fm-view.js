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
  advanceDay, assignAction, availableActions, playerAgency, playerRoster,
  tournamentOn, upcomingTournaments, dailyUpkeep, trainerRating,
  findTrainer, findAgency, rosterLock, exploreAction, parseExplore, describeAction,
  boxToParty, partyToBox,
} from '../engine/game.js';
import { standings, replayMatch } from '../engine/league.js';
import { STAT_KEYS, displayStats } from '../data/agencies.js';
import { STAT_KO } from '../data/styles.js';
import { SPECIES_KO, MOVE_KO, ko } from '../data/ko.js';
import { realStats, expForLevel, setMoves } from '../data/pokemon.js';
import { MAP_IMAGE, REGIONS, LOCATIONS, locationById, locationsIn, TRAINER_CLASSES } from '../data/routes.js';
import { spriteCandidates } from './sprites.js';
import {
  isPaused, playBattleLog, resetScene, say, setPaused, setSpeedSource, stopPlayback,
} from './battle-view.js';
import { openNegotiation } from './negotiation.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();
const K = (s) => ko(SPECIES_KO, s);
const M = (s) => ko(MOVE_KO, s);

let game = null;
let screen = 'inbox';
let detailId = null;       // 트레이너 프로필
let watching = false;

/* 맵 화면 상태 */
const map = { region: 'kanto', locId: null, trainerId: null };

/* 읽은 메시지 — 세션 동안만 */
const read = new Set();

/* ---------------- 좌측 메뉴 ---------------- */

const MENU = [
  { grp: '소속사' },
  { id: 'inbox', label: '받은 메시지함' },
  { id: 'squad', label: '스쿼드' },
  { id: 'box', label: '박스' },
  { grp: '활동' },
  { id: 'map', label: '맵' },
  { id: 'schedule', label: '일정' },
  { id: 'league', label: '리그' },
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
  $('tb-date').textContent = `${game.day}일차`;
  $('tb-funds').innerHTML = `<span class="${a.funds < upkeep * 5 ? 'neg' : ''}">${won(a.funds)}</span>`;
  $('tb-wage').textContent = `-${upkeep}/일`;
  $('tb-rep').textContent = Math.round(a.reputation);
  $('tb-continue').disabled = !!game.gameOver;
}

/* ---------------- 받은 메시지함 ---------------- */

/** 게임에서 벌어진 일을 메시지 목록으로 (§9 뉴스 파이프라인 재사용) */
function inboxItems() {
  const out = [];
  const lock = rosterLock(game);

  if (lock) {
    out.push({
      key: 'opening', day: game.day, title: '로스터를 늘릴 수 없습니다',
      body: `${lock.trainer ? `${lock.trainer.name}이(가) ` : ''}지역 뱃지 8개를 모두 모아야 `
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

  const rep = game.lastReport;
  if (rep) {
    for (const r of rep.myResults || []) {
      out.push({
        key: `res-${rep.day}-${r.trainerId}`, day: rep.day,
        title: `${r.name} — ${r.placement || '출전'}`,
        body: rep.tournament ? `${rep.tournament.name} 결과입니다.` : '',
      });
    }
  }

  for (const n of (game.league.newsFeed || []).slice(-40).reverse()) {
    if (n.kind === 'explore') {
      const [first, ...rest] = n.text.split(' / ');
      out.push({ key: `n-${n.day}-${n.trainerId}-${n.text.length}`, day: n.day, title: first, body: rest.join('\n') });
    } else {
      out.push({ key: `n-${n.day}-${n.text}`, day: n.day, title: n.text, body: '' });
    }
  }
  return out;
}

function renderInbox() {
  const items = inboxItems();
  return `
    <div class="page-h"><h2>받은 메시지함</h2><div class="note">${items.length}건</div></div>
    ${items.length ? `<div class="inbox">${items.map((m) => `
      <div class="msg ${read.has(m.key) ? '' : 'unread'}" data-k="${esc(m.key)}">
        <div class="d">${m.day}일차</div>
        <div><div class="t">${esc(m.title)}</div>${m.body ? `<div class="x">${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}</div>
      </div>`).join('')}</div>`
    : '<div class="note">아직 온 소식이 없습니다. [계속]을 눌러 하루를 넘겨보세요.</div>'}`;
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

function spriteUrl(species) {
  return spriteCandidates(species, 'p2')[0]?.url || '';
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
    <img src="${spriteUrl(m.species)}" alt="" referrerpolicy="no-referrer">
    <div style="flex:1;min-width:0">
      <div class="nm">${K(m.species)} <span class="lv">Lv${m.level}</span>
        ${trainerId && index != null ? `<button class="ghost to-box" data-t="${trainerId}" data-i="${index}" style="padding:1px 7px;font-size:10px;margin-left:6px">박스로</button>` : ''}
        ${btn}</div>
      <div class="lv">HP ${st.hp} · 공 ${st.atk} · 방 ${st.def} · 특공 ${st.spa} · 특방 ${st.spd} · 속 ${st.spe} · ${esc(m.nature)}</div>
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
  const a = playerAgency(game);
  const roster = playerRoster(game);
  const target = map.trainerId && roster.find((t) => t.id === map.trainerId) ? map.trainerId : roster[0]?.id;

  return `
    <div class="page-h"><h2>박스</h2><div class="note">${a.box.length}마리 · 잡은 포켓몬이 여기로 온다</div></div>
    ${roster.length ? `<div class="note" style="margin-bottom:8px">파티로 보낼 트레이너:
      <select id="box-target" style="font-size:12px;padding:3px">${roster.map((t) => `<option value="${t.id}" ${t.id === target ? 'selected' : ''}>${esc(t.name)} (${(t.party || []).length}/6)</option>`).join('')}</select></div>` : ''}
    <div class="card">
      ${a.box.length ? a.box.map((m, i) => monRow(m, { boxIndex: i })).join('') : '<div class="note">비어 있습니다. 맵에서 포켓몬 포획을 보내보세요.</div>'}
    </div>`;
}

/* ---------------- 맵 ---------------- */

function renderMap() {
  const roster = playerRoster(game);
  const region = REGIONS.find((r) => r.id === map.region) || REGIONS[0];
  const locs = locationsIn(region.id);
  if (!map.trainerId || !roster.find((t) => t.id === map.trainerId)) map.trainerId = roster[0]?.id || null;
  const loc = map.locId ? locationById(map.locId) : null;
  const t = map.trainerId ? findTrainer(game.league, map.trainerId) : null;

  /* 지도는 통합 그림의 절반씩 잘라 보여준다 — 좌표는 전체 기준 %라 잘라 쓰려면 다시 재야 한다 */
  const c = region.crop;
  const dots = locs.map((l) => {
    const lx = ((l.x - c.x) / c.w) * 100;
    const ly = ((l.y - c.y) / c.h) * 100;
    const tooHard = t && Math.max(1, ...(t.party || []).map((m) => m.level)) + 4 < l.level[0];
    return `<button class="dot ${l.kind} ${map.locId === l.id ? 'on' : ''} ${tooHard ? 'hard' : ''}"
      style="left:${lx}%;top:${ly}%" data-l="${l.id}" title="${esc(l.name)} · Lv${l.level[0]}~${l.level[1]}"></button>`;
  }).join('');

  const cur = t ? game.actions[t.id] : null;
  const curEx = parseExplore(cur);

  const panel = !loc ? '<div class="note">지도에서 도로나 마을을 누르세요.</div>' : `
    <h3 style="margin:0 0 2px">${esc(loc.name)} <span class="note">권장 Lv${loc.level[0]}~${loc.level[1]}</span></h3>
    <div class="note" style="margin-bottom:8px">${loc.kind === 'town' ? '마을 — 포켓몬센터가 있다' : loc.kind === 'dungeon' ? '동굴·숲' : '도로'}</div>

    <div class="note" style="font-weight:800;margin-bottom:3px">출현 포켓몬</div>
    <div class="note" style="margin-bottom:8px">${loc.wild.length ? loc.wild.map((w) => `${K(w.species)} Lv${w.min}~${w.max}`).join(' · ') : '없음'}</div>

    <div class="note" style="font-weight:800;margin-bottom:3px">트레이너</div>
    <div class="note" style="margin-bottom:10px">${loc.trainers.length ? loc.trainers.map((n) => {
    const beaten = t?.beaten?.[`${loc.id}:${n.name}`];
    return `<div>${beaten ? '✓ ' : ''}${TRAINER_CLASSES[n.cls]?.name || n.cls} ${esc(n.name)} — ${n.party.map(([s, lv]) => `${K(s)} Lv${lv}`).join(', ')}</div>`;
  }).join('') : '없음'}</div>

    ${t ? `
      <div class="note" style="font-weight:800;margin-bottom:4px">${esc(t.name)}에게 시킬 일</div>
      <div class="ov-row" style="margin-top:4px">
        <button data-act="catch" ${loc.wild.length ? '' : 'disabled'} class="${curEx?.locationId === loc.id && curEx.mode === 'catch' ? '' : 'ghost'}">포켓몬 포획</button>
        <button data-act="battle" ${loc.trainers.length ? '' : 'disabled'} class="${curEx?.locationId === loc.id && curEx.mode === 'battle' ? '' : 'ghost'}">트레이너 배틀</button>
      </div>
      <div class="note" style="margin-top:6px">오늘: <b>${esc(describeAction(cur))}</b> — [계속]을 누르면 결과가 받은 메시지함에 옵니다.</div>
    ` : '<div class="note">보낼 트레이너가 없습니다.</div>'}`;

  return `
    <div class="page-h"><h2>맵</h2>
      <div class="note">
        ${REGIONS.map((r) => `<button class="ghost reg ${r.id === map.region ? 'on' : ''}" data-r="${r.id}" style="padding:2px 9px;font-size:11px">${r.name}</button>`).join(' ')}
        ${roster.length > 1 ? `· 트레이너 <select id="map-trainer" style="font-size:11px;padding:2px">${roster.map((x) => `<option value="${x.id}" ${x.id === map.trainerId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <div class="map-grid">
      <div class="map-wrap">
        <img class="map-img" src="${MAP_IMAGE}" alt="" referrerpolicy="no-referrer"
             style="width:${100 / (c.w / 100)}%;left:${-(c.x / c.w) * 100}%">
        ${dots}
      </div>
      <div class="card map-panel">${panel}</div>
    </div>
    <div class="note" style="margin-top:6px">● 마을 · ● 도로 · ● 동굴 — 붉은 점은 지금 파티에 벅찬 곳</div>`;
}

/* ---------------- 일정 / 리그 ---------------- */

function renderSchedule() {
  const up = upcomingTournaments(game, 14);
  const past = (game.league.tournaments || []).slice(-8).reverse();
  const roster = playerRoster(game);
  const tier = tournamentOn(game.day);

  return `
    <div class="page-h"><h2>일정</h2></div>
    ${tier ? `<div class="card" style="margin-bottom:10px"><h3>오늘 ${esc(tier.name)}이 열립니다</h3>
      ${roster.map((t) => {
    const opts = availableActions(game, t);
    const cur = game.actions[t.id] || 'rest';
    const enter = opts.find((o) => o.id.startsWith('enter:'));
    return `<div class="note">${esc(t.name)} —
          <button class="ghost enter" data-t="${t.id}" data-a="${enter?.id || ''}" ${enter?.disabled ? 'disabled' : ''} style="padding:2px 9px;font-size:11px">${cur.startsWith('enter:') ? '출전 예정 ✓' : '출전'}</button>
          <span>${esc(enter?.hint || '')}</span></div>`;
  }).join('')}</div>` : ''}
    <table class="grid">
      <thead><tr><th>날짜</th><th>대회</th><th>자격</th></tr></thead>
      <tbody>${up.map((u) => `<tr><td class="n">${u.day}일차</td><td class="nm">${esc(u.tier.name)}</td>
        <td class="note">레이팅 ${u.tier.ratingBand[0]}~${u.tier.ratingBand[1] === Infinity || u.tier.ratingBand[1] === 999 ? '∞' : u.tier.ratingBand[1]}</td></tr>`).join('')}</tbody>
    </table>
    <div class="page-h" style="margin-top:18px"><h2>지난 대회</h2></div>
    <table class="grid">
      <thead><tr><th>날짜</th><th>대회</th><th>우승</th><th class="n">관전</th></tr></thead>
      <tbody>${past.map((tn) => {
    const champ = tn.champion ? findTrainer(game.league, tn.champion) : null;
    const mine = tn.matches.filter((m) => {
      const a = findTrainer(game.league, m.aId);
      const b = findTrainer(game.league, m.bId);
      return a?.agencyId === game.playerAgencyId || b?.agencyId === game.playerAgencyId;
    });
    return `<tr><td class="n">${tn.day}일차</td><td>${esc(tn.name)}</td>
          <td class="nm">${champ ? esc(champ.name) : '—'}</td>
          <td class="n">${mine.length ? `<button class="ghost watch" data-t="${tn.id}" data-m="${tn.matches.indexOf(mine[mine.length - 1])}" style="padding:2px 8px;font-size:11px">보기</button>` : ''}</td></tr>`;
  }).join('')}</tbody>
    </table>`;
}

function renderLeague() {
  const rows = standings(game.league);
  return `
    <div class="page-h"><h2>리그</h2><div class="note">${game.league.name}</div></div>
    <table class="grid">
      <thead><tr><th class="n">#</th><th>소속사</th><th class="n">우승</th><th class="n">준우승</th>
        <th class="n">평판</th><th class="n">자금</th></tr></thead>
      <tbody>${rows.map((s, i) => `
        <tr${s.isPlayer ? ' style="background:var(--panel2)"' : ''}>
          <td class="n">${i + 1}</td><td class="nm">${esc(s.name)}</td>
          <td class="n">${s.titles}</td><td class="n">${s.runnerUps}</td>
          <td class="n">${Math.round(s.reputation)}</td><td class="n">${won(s.funds)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
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

/* ---------------- 관전 (대회 경기만) ---------------- */

async function watchMatch(tournamentId, index) {
  if (watching) return;
  const tn = (game.league.tournaments || []).find((x) => x.id === tournamentId);
  const m = tn?.matches[index];
  if (!m) return;
  watching = true;

  const a = findTrainer(game.league, m.aId);
  const b = findTrainer(game.league, m.bId);
  const label = (x) => ({ name: x?.name || '', agency: findAgency(game.league, x?.agencyId)?.name || '' });

  $('watch-ov').hidden = false;
  $('watch-panel').style.display = '';
  $('watch-title').textContent = `${tn.name} ${m.roundLabel} — ${a?.name} vs ${b?.name}`;
  resetScene();

  const replay = replayMatch(m);
  await playBattleLog(replay.log, { p1: label(a), p2: label(b) });
  const w = findTrainer(game.league, replay.winnerId);
  say(`▶ ${w ? w.name : '무승부'} 승리! (${replay.turns}턴)`);
  watching = false;
}

/* ---------------- 렌더 ---------------- */

function render() {
  renderTop();
  renderSide();

  const main = $('main');
  if (detailId) main.innerHTML = renderTrainer(detailId);
  else if (screen === 'inbox') main.innerHTML = renderInbox();
  else if (screen === 'squad') main.innerHTML = renderSquad();
  else if (screen === 'box') main.innerHTML = renderBox();
  else if (screen === 'map') main.innerHTML = renderMap();
  else if (screen === 'schedule') main.innerHTML = renderSchedule();
  else if (screen === 'league') main.innerHTML = renderLeague();
  else if (screen === 'scouting') main.innerHTML = renderScouting();

  wire();
}

function wire() {
  const main = $('main');

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
      render();
    };
  });

  /* 박스 ↔ 파티 */
  main.querySelectorAll('.to-box').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const r = partyToBox(game, b.dataset.t, Number(b.dataset.i));
      if (!r.ok) alert(r.msg);
      render();
    };
  });
  main.querySelectorAll('.to-party').forEach((b) => {
    b.onclick = () => {
      const target = $('box-target')?.value || playerRoster(game)[0]?.id;
      const r = boxToParty(game, target, Number(b.dataset.b));
      if (!r.ok) alert(r.msg);
      render();
    };
  });
  const bt = $('box-target');
  if (bt) bt.onchange = () => { map.trainerId = bt.value; };

  /* 맵 */
  main.querySelectorAll('.reg').forEach((b) => {
    b.onclick = () => { map.region = b.dataset.r; map.locId = null; render(); };
  });
  main.querySelectorAll('.dot').forEach((b) => {
    b.onclick = () => { map.locId = b.dataset.l; render(); };
  });
  const mt = $('map-trainer');
  if (mt) mt.onchange = () => { map.trainerId = mt.value; render(); };
  main.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => {
      if (!map.trainerId || !map.locId) return;
      assignAction(game, map.trainerId, exploreAction(map.locId, b.dataset.act));
      render();
    };
  });

  /* 대회 출전 */
  main.querySelectorAll('button.enter').forEach((b) => {
    b.onclick = () => {
      const cur = game.actions[b.dataset.t];
      assignAction(game, b.dataset.t, cur?.startsWith('enter:') ? 'rest' : b.dataset.a);
      render();
    };
  });
  main.querySelectorAll('button.watch').forEach((b) => {
    b.onclick = () => watchMatch(b.dataset.t, Number(b.dataset.m));
  });

  if (screen === 'scouting' && $('nego-root')) {
    openNegotiation($('nego-root'), game, () => gotoMap());
  }
}

/* ---------------- 진입 ---------------- */

export function initFm({ game: existing }) {
  game = existing;
  $('app').hidden = false;

  $('tb-continue').onclick = async () => {
    $('tb-continue').disabled = true;
    $('tb-continue').textContent = '진행 중…';
    await advanceDay(game);
    /* 탐험 배정은 하루짜리다 — 다음 날엔 다시 정한다 */
    for (const t of playerRoster(game)) if (parseExplore(game.actions[t.id]) || game.actions[t.id]?.startsWith('enter:')) delete game.actions[t.id];
    $('tb-continue').disabled = false;
    $('tb-continue').textContent = '계속 ▶';
    screen = 'inbox';
    detailId = null;
    render();
  };

  const pauseBtn = $('watch-pause');
  if (pauseBtn) {
    const paint = () => { pauseBtn.textContent = isPaused() ? '▶ 계속' : '⏸ 일시정지'; };
    pauseBtn.onclick = () => { setPaused(!isPaused()); paint(); };
    paint();
  }
  $('watch-close').onclick = () => {
    stopPlayback();
    watching = false;
    $('watch-ov').hidden = true;
  };

  setSpeedSource(() => Number($('speed').value));
  sfx.installUnlockHandler();
  const sfxToggle = $('sfx-on');
  if (sfxToggle) {
    sfx.setEnabled(sfxToggle.checked);
    sfxToggle.onchange = () => { sfx.unlock(); sfx.setEnabled(sfxToggle.checked); };
  }

  render();
  window.__game = game;
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
