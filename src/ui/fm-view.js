/**
 * FM식 화면 — 상단바(날짜·자금·계속) + 좌측 메뉴 + 본문 하나.
 *
 * 예전 탭 6개(오늘/트레이너/대회/시장/리그/소식)는 걷어냈다. 매니지먼트 게임의 화면 구조는
 * **받은 메시지함이 허브이고, 나머지는 좌측 메뉴로 들어가는 것**이다 — FM을 그대로 따른다.
 * 시간은 상단 [계속] 하나로만 흐른다.
 *
 * 배틀 관전 화면(battle-view.js)은 그대로 재사용한다 — 오버레이로 띄운다.
 */
import {
  advanceDay, assignAction, availableActions, playerAgency, playerRoster,
  tournamentOn, upcomingTournaments, dailyUpkeep, trainerRating, placementOf,
  findTrainer, findAgency, allTrainers, GAME_CONFIG, ACTION_LABELS, rosterLock,
} from '../engine/game.js';
import { standings, replayMatch } from '../engine/league.js';
import { STAT_KEYS, displayStats } from '../data/agencies.js';
import { STAT_KO } from '../data/styles.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { realStats, expForLevel } from '../data/pokemon.js';
import { spriteCandidates } from './sprites.js';
import {
  isPaused, playBattleLog, resetScene, say, setPaused, setSpeedSource, stopPlayback,
} from './battle-view.js';
import { openNegotiation } from './negotiation.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();

let game = null;
let screen = 'inbox';
let detailId = null;      // 트레이너 프로필로 들어갔을 때
let watching = false;

/* 읽은 메시지 표시 — 세션 동안만 유지한다 */
const read = new Set();

/* ---------------- 좌측 메뉴 ---------------- */

const MENU = [
  { grp: '소속사' },
  { id: 'inbox', label: '받은 메시지함' },
  { id: 'squad', label: '스쿼드' },
  { id: 'training', label: '훈련' },
  { grp: '경기' },
  { id: 'schedule', label: '일정' },
  { id: 'league', label: '리그' },
  { grp: '영입' },
  { id: 'scouting', label: '스카우팅' },
];

function renderSide() {
  const unread = inboxItems().filter((m) => !read.has(m.key)).length;
  const lock = rosterLock(game);

  $('side').innerHTML = MENU.map((m) => {
    if (m.grp) return `<div class="grp">${m.grp}</div>`;
    const locked = m.id === 'scouting' && lock;
    const badge = m.id === 'inbox' && unread ? `<span class="badge">${unread}</span>` : '';
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

/** 게임에서 벌어진 일을 메시지 목록으로 편다 (§9 뉴스 파이프라인 재사용) */
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

  const rep = game.lastReport;
  if (rep) {
    for (const l of rep.levelUps || []) {
      out.push({
        key: `lv-${rep.day}-${l.species}-${l.level}`, day: rep.day,
        title: `${ko(SPECIES_KO, l.species)}이(가) 레벨 ${l.level}이 되었다`,
        body: l.learned.length ? `새로 배운 기술: ${l.learned.join(', ')}` : '꾸준히 크고 있습니다.',
      });
    }
    for (const r of rep.myResults || []) {
      out.push({
        key: `res-${rep.day}-${r.trainerId}`, day: rep.day,
        title: `${r.name} — ${r.placement || '출전'}`,
        body: rep.tournament ? `${rep.tournament.name} 결과입니다.` : '',
      });
    }
  }

  for (const n of (game.league.newsFeed || []).slice(-25).reverse()) {
    out.push({ key: `n-${n.day}-${n.text}`, day: n.day, title: n.text, body: '' });
  }
  return out;
}

function renderInbox() {
  const items = inboxItems();
  return `
    <div class="page-h"><h2>받은 메시지함</h2>
      <div class="note">${items.length}건</div></div>
    ${items.length ? `<div class="inbox">${items.map((m) => `
      <div class="msg ${read.has(m.key) ? '' : 'unread'}" data-k="${esc(m.key)}">
        <div class="d">${m.day}일차</div>
        <div><div class="t">${esc(m.title)}</div>${m.body ? `<div class="x">${esc(m.body)}</div>` : ''}</div>
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
        <th class="n">레이팅</th><th class="n">컨디션</th><th class="n">주급</th><th>포켓몬</th>
      </tr></thead>
      <tbody>${roster.map((t) => {
    const d = displayStats(t);
    return `<tr data-id="${t.id}">
          <td class="nm">${esc(t.name)}${t.isYouth ? ' <span class="pill">유스</span>' : ''}</td>
          ${STAT_KEYS.map((k) => `<td class="n">${at(d[k])}</td>`).join('')}
          <td class="n">${trainerRating(t).toFixed(1)}</td>
          <td class="n">${Math.round(t.condition)}</td>
          <td class="n">${t.contract?.wage ?? t.salary}</td>
          <td>${(t.party || []).map((m) => `${ko(SPECIES_KO, m.species)} <span class="lv">Lv${m.level}</span>`).join(', ') || '—'}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>`;
}

function monRow(m) {
  const url = spriteCandidates(m.species, 'p2')[0]?.url || '';
  const base = expForLevel(m.level);
  const next = expForLevel(m.level + 1);
  const pct = Math.max(0, Math.min(100, ((m.exp - base) / Math.max(1, next - base)) * 100));
  const st = realStats(m);
  return `<div class="mon">
    <img src="${url}" alt="">
    <div>
      <div class="nm">${ko(SPECIES_KO, m.species)} <span class="lv">Lv${m.level}</span></div>
      <div class="lv">HP ${st.hp} · 공 ${st.atk} · 방 ${st.def} · 특공 ${st.spa} · 특방 ${st.spd} · 속 ${st.spe}</div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="mv">${m.moves.map((x) => esc(x)).join('<br>')}</div>
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
      <div class="note">${t.isYouth ? '유스' : '정식'} · 레이팅 ${trainerRating(t).toFixed(1)}</div>
    </div>
    <button class="ghost" id="back-squad" style="margin-bottom:10px">← 스쿼드</button>
    <div class="cards">
      <div class="card">
        <h3>능력치</h3>
        <table class="grid"><tbody>
          ${STAT_KEYS.map((k) => `<tr><td>${STAT_KO[k]}</td><td class="n">${at(d[k])}</td></tr>`).join('')}
          <tr><td>컨디션</td><td class="n">${Math.round(t.condition)}</td></tr>
          <tr><td>만족도</td><td class="n">${Math.round(t.satisfaction)}</td></tr>
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
      <h3>보유 포켓몬 <span class="note">${(t.party || []).length}마리</span></h3>
      ${(t.party || []).map(monRow).join('') || '<div class="note">아직 없습니다.</div>'}
    </div>`;
}

/* ---------------- 훈련 ---------------- */

function renderTraining() {
  const roster = playerRoster(game);
  const tier = tournamentOn(game.day);
  if (!roster.length) return '<div class="note">아직 계약한 트레이너가 없습니다.</div>';

  return `
    <div class="page-h"><h2>훈련</h2>
      <div class="note">${tier ? `오늘 ${tier.name}이 열립니다` : '오늘은 대회가 없습니다'}</div></div>
    <div class="cards">${roster.map((t) => {
    const opts = availableActions(game, t);
    const cur = game.actions[t.id] || 'rest';
    return `<div class="card">
        <h3>${esc(t.name)}</h3>
        <div class="note">컨디션 ${Math.round(t.condition)} · 주급 ${t.contract?.wage ?? t.salary}</div>
        <select data-t="${t.id}" style="width:100%;margin-top:7px;font-size:12px;padding:5px">
          ${opts.map((o) => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        <div style="margin-top:8px">${(t.party || []).slice(0, 3).map(monRow).join('')}</div>
      </div>`;
  }).join('')}</div>`;
}

/* ---------------- 일정 / 리그 ---------------- */

function renderSchedule() {
  const up = upcomingTournaments(game, 14);
  const past = (game.league.tournaments || []).slice(-8).reverse();
  return `
    <div class="page-h"><h2>일정</h2></div>
    <table class="grid">
      <thead><tr><th>날짜</th><th>대회</th><th>자격</th></tr></thead>
      <tbody>${up.map((u) => `<tr><td class="n">${u.day}일차</td><td class="nm">${esc(u.tier.name)}</td>
        <td class="note">레이팅 ${u.tier.ratingBand[0]}~${u.tier.ratingBand[1] === Infinity ? '∞' : u.tier.ratingBand[1]}</td></tr>`).join('')}</tbody>
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
  return `<div class="page-h"><h2>스카우팅</h2></div>
    <div id="nego-root"></div>`;
}

/* ---------------- 관전 ---------------- */

async function watchMatch(tournamentId, index) {
  if (watching) return;
  const tn = (game.league.tournaments || []).find((t) => t.id === tournamentId);
  const m = tn?.matches[index];
  if (!m) return;
  watching = true;

  const a = findTrainer(game.league, m.aId);
  const b = findTrainer(game.league, m.bId);
  const label = (t) => ({
    name: t?.name || '', agency: findAgency(game.league, t?.agencyId)?.name || '',
  });

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
  else if (screen === 'training') main.innerHTML = renderTraining();
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

  main.querySelectorAll('select[data-t]').forEach((sel) => {
    sel.onchange = () => { assignAction(game, sel.dataset.t, sel.value); };
  });
  main.querySelectorAll('button.watch').forEach((b) => {
    b.onclick = () => watchMatch(b.dataset.t, Number(b.dataset.m));
  });

  if (screen === 'scouting' && $('nego-root')) {
    openNegotiation($('nego-root'), game, () => render());
  }
}

/* ---------------- 진입 ---------------- */

export function initFm({ game: existing }) {
  game = existing;
  $('app').hidden = false;

  $('tb-continue').onclick = async () => {
    $('tb-continue').disabled = true;
    await advanceDay(game);
    $('tb-continue').disabled = false;
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
  window.__game = game;   // 콘솔에서 상태를 들여다볼 수 있게
}

/** 오프닝이 스카우팅 화면으로 바로 보낼 때 쓴다 */
export function gotoScouting() {
  screen = 'scouting';
  detailId = null;
  render();
}
