import { youthCount, youthCapacity, careerLabel, isRegisteredPro, ensureSeats, seatLabel, swapSeat, proCapacity } from '../engine/career.js';
import { renderShop, wireShop, itemIcon as heldIcon } from './shop.js';
import { openItemPicker } from './item-picker.js';
import { trainerPortrait, trainerFull } from './trainer-sprite.js';
import { HELD_ITEMS } from '../data/items.gen.js';
import { conditionOf } from '../engine/pokemon-management.js';
import { badgeProgress as badgesOf } from '../engine/gym-progress.js';
import { CAREER } from '../data/career.js';
import { ABILITY_KO } from '../data/ko.js';
import { renderCareer, wireCareer } from './career.js';
import { renderSeason, wireSeason, renderCupReport } from './season.js';
import { ensureSeason, cupEligible, cupToday, cupEntrants } from '../engine/season.js';
import { renderPersonnel, wirePersonnel } from './personnel.js';
/**
 * FM식 화면 — 상단바(날짜·자금·계속) + 좌측 메뉴 + 본문 하나.
 *
 * 매니지먼트 게임의 화면 구조는 **받은 메시지함이 허브이고, 나머지는 좌측 메뉴로 들어가는 것**이다.
 * 시간은 상단 [계속] 하나로만 흐른다.
 *
 * 하루의 결정은 **맵**에서 한다 — 트레이너를 어느 도로로 보내 포켓몬을 잡을지, NPC와 싸울지.
 * 일반 탐험은 보고서로, 관장전은 자동 관전으로 확인한다. 박스 개체값은 센터에서 장기 훈련한다.
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
import { realStats, expForLevel } from '../data/pokemon.js';
import { locationById, locationsIn, TRAINER_CLASSES } from '../data/routes.js';
import { openNegotiation } from './negotiation.js';
import * as sfx from './sfx.js';
import { ATLAS_REGIONS, regionSvg } from './region-map.js';
import { monImage, wireMonImages, gameDate, dayProgress } from './management-widgets.js';
import { saveGame } from '../engine/save.js';
import { snapshotGame, restoreGame } from '../engine/checkpoint.js';
import { runDay } from './day-runner.js';
import { openPokemonPanel, moveTile, TYPE_KO } from './pokemon-panel.js';
import { Dex } from '@pkmn/dex';
import { evolutionOptions, bagOf } from '../engine/pokemon-management.js';
import { renderSupport, renderTraining, renderGyms, wireManagementPages, fatigueIcon } from './management-pages.js';
import { watchGymMatch } from './gym-watch.js';
import { GYMS } from '../data/gyms.js';
import { badgeProgress } from '../engine/gym-progress.js';
import { renderBattleAnalysis } from './battle-analysis.js';
import { regionalRanking } from '../engine/regional-ranking.js';
import { UPDATE_NOTES } from '../data/update-notes.js';
import { SEASON } from '../data/season.js';
import { fixturesOf, upcomingFixture } from '../engine/gym-fixtures.js';
import { gymById } from '../data/gyms.js';
import { fatigueOf } from '../engine/pokemon-management.js';

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
const map = { region: 'kanto', locId: null, trainerId: null, activities: 6 };

/* 읽은 메시지 — 세션 동안만 */
const read = new Set();

/* 사이드바·대시보드 아이콘 — PokeAPI 도구 도트 (public/assets/items, CREDITS.md) */
const itemIcon = (name, cls = '') => `<img class="${cls}" src="${(import.meta.env?.BASE_URL??'/')}assets/items/${name}.png" alt="" aria-hidden="true" width="24" height="24">`;

/* ---------------- 좌측 메뉴 ---------------- */

const MENU = [
  { grp: '소속사' },
  { id: 'office', label: '대표실', icon: 'card-key' },
  { id: 'inbox', label: '받은 소식', icon: 'air-mail' },
  { id: 'squad', label: '트레이너', icon: 'exp-share' },
  { id: 'box', label: '포켓몬 박스', icon: 'poke-ball' },
  { grp: '활동' },
  { id: 'map', label: '탐험 지도', icon: 'town-map' },
  { id: 'gyms', label: '체육관 순회', icon: 'tm-fighting' },
  { id: 'shop', label: '상점', icon: 'potion' },
  { id: 'training', label: '트레이닝 센터', icon: 'protein' },
  { id: 'schedule', label: '일정 · 대회', icon: 'vs-seeker' },
  { grp: '영입' },
  { id: 'scouting', label: '스카우팅', icon: 'dowsing-machine' },
  { id: 'personnel', label: '계약 · 스태프', icon: 'amulet-coin' },
];

function renderSide() {
  const unread = inboxItems().filter((m) => !read.has(m.key)).length;
  const lock = rosterLock(game);
  const boxN = playerAgency(game).box.length;

  $('side').innerHTML = `<div class="brand">${itemIcon('master-ball')}<div class="brand-word"><span>POKÉMON</span><b>TRAINER</b><i>MANAGER</i></div></div>` + MENU.map((m) => {
    if (m.grp) return `<div class="grp">${m.grp}</div>`;
    const locked = m.id === 'scouting' && lock;
    let badge = '';
    if (m.id === 'inbox' && unread) badge = `<span class="badge">${unread}</span>`;
    if (m.id === 'box' && boxN) badge = `<span class="badge">${boxN}</span>`;
    return `<button data-s="${m.id}" class="${screen === m.id ? 'on' : ''}${locked ? ' lock' : ''}">`
      + `<span class="ico">${itemIcon(m.icon)}</span><span class="lbl">${m.label}</span>${badge}</button>`;
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
  $('tb-continue').disabled = !!game.gameOver || busy || !!game.pendingStarter || game.opening?.tutorialContractNeeded || !playerRoster(game).length;
  $('tb-continue').textContent = game.gameOver ? '운영 종료' : game.pendingStarter ? '파트너 선택 대기' : game.opening?.tutorialContractNeeded || !playerRoster(game).length ? '첫 유스 계약이 필요합니다' : '계속 ▷';
}

/* ---------------- 받은 메시지함 ---------------- */

/** 게임에서 벌어진 일을 메시지 목록으로 (§9 뉴스 파이프라인 재사용) */
function inboxItems() {
  const out = [];
  for(const e of ensureSeason(game).events.filter(e=>e.status==='scheduled'&&game.day>=e.openDay&&game.day<=e.deadline))out.push({key:`cup-register-${e.id}`,day:e.openDay,title:`${e.name} 참가 접수`,needsDecision:true,body:`${e.deadline}일차까지 일정 화면에서 참가 자격에 맞는 트레이너를 등록하세요. 개최일은 ${e.date}일차이며, 오늘의 다른 활동 대신 대회에 참가합니다. 등록하지 않아도 NPC 대회 결과를 볼 수 있습니다.`});
  const lock = rosterLock(game);

  if (lock) out.push({key:`youth-full-${game.day}`,day:game.day,title:'유스 정원이 가득 찼습니다',body:lock.msg});
  for(const t of playerRoster(game)) if(t.isYouth&&t.graduation?.decision==='pending') out.push({key:`graduation-${t.id}`,day:t.graduation.qualifiedDay,title:`${t.name}의 진로를 결정해주세요`,needsDecision:true,careerTrainerId:t.id,body:'트레이너 상세에서 프로 콜업·판매·보류를 선택할 수 있습니다.'});

  /* 포획 배정인데 볼이 없으면 — 탐험이 헛돈다 */
  for (const t of playerRoster(game)) {
    const ex = parseExplore(game.actions[t.id]);
    if (ex && ex.mode !== 'battle' && !(bagOf(t).pokeBall > 0)) out.push({ key:`noball-${t.id}-${game.day}`, day:game.day, needsDecision:true, title:`${t.name}의 몬스터볼이 떨어졌습니다`, body:`${ex.mode==='catch'?'포획 중심 배정이라 오늘은 아무 활동도 못 합니다':'포획·배틀 병행이지만 배틀만 하게 됩니다'}. 상점의 탐험 물품에서 몬스터볼을 지급하세요.` });
  }
  /* 배정이 이어지니 지친 트레이너를 알려준다 — 쉬게 하는 건 대표의 판단 */
  for (const t of playerRoster(game)) if ((t.fatigue||0) >= 70) out.push({ key:`slump-${t.id}-${game.day}`, day:game.day, needsDecision:true, title:`${t.name}, 연패로 슬럼프에 빠졌습니다`, body:`컨디션이 ${conditionOf(t)}까지 떨어져 실력이 덜 나옵니다. 컨디션은 지면 크게 깎이고 이기면 돌아옵니다. 쉬운 상대와 붙여 자신감을 되찾게 하거나, 며칠 쉬게 하세요.` });
  for (const f of fixturesOf(game)) if (f.status==='booked' && f.day-game.day<=1) {
    const t=playerRoster(game).find(x=>x.id===f.trainerId), g=gymById(f.gymId);
    if (t&&g) out.push({ key:`fx-${f.id}-${game.day}`, day:game.day, title:`${f.day===game.day?'오늘':'내일'} ${t.name} vs ${g.name} 관장전`, body:`${gameDate(f.day)}에 ${g.name} 체육관에서 경기가 열립니다. 그날은 탐험 대신 관장전을 치르고, 끝나면 관전이 열립니다.` });
  }
  /* 오늘 배정이 비어 있으면 알려준다 — FM의 "할 일" 메시지 */
  const todayCup=cupToday(game),todayEntrants=todayCup?cupEntrants(game,todayCup):[];
  const competing=new Set(todayEntrants.length>=2?todayEntrants.map(t=>t.id):[]);
  const idle = playerRoster(game).filter((t) => !game.actions[t.id] && !t.camp && !competing.has(t.id));
  if (idle.length) {
    out.push({
      key: `idle-${game.day}`, day: game.day, title: '오늘 할 일이 없는 트레이너가 있습니다',
      body: `${idle.map((t) => t.name).join(', ')} — 맵에서 보낼 곳을 정해주세요.`,
    });
  }

  for (const n of [...(game.league.newsFeed || [])].sort((a,b)=>(b.day||0)-(a.day||0)).slice(0,40)) {
    if(n.kind==='graduation' && playerRoster(game).some(t=>t.id===n.trainerId&&t.graduation?.decision==='pending'))continue;
    if (n.kind === 'explore') {
      const [first, ...rest] = n.text.split(' / ');
      out.push({ key: `n-${n.day}-${n.trainerId}-${n.text.length}`, day: n.day, trainerId: n.trainerId, title: first.replace('탐험을 시작했다.', '탐험 보고'), body: rest.join('\n'), preview: rest.at(-1) });
    } else {
      out.push({ key: `n-${n.day}-${n.text}`, day: n.day, title: n.text, body: '', reportDay:['gym','training','cup','personnel','pwt'].includes(n.kind)?n.day:null });
    }
  }
  return out.sort((a,b) => Number(!!b.needsDecision)-Number(!!a.needsDecision) || b.day - a.day || Number(b.key.startsWith('n-')) - Number(a.key.startsWith('n-')));
}

function renderOffice() {
  const a = playerAgency(game), roster = playerRoster(game);
  const rep = game.lastReport;
  const needsFirst=game.opening?.tutorialContractNeeded||!roster.length;
  const pros=roster.filter(isRegisteredPro).length;
  return `<div class="page-h"><div><div class="eyebrow">MANAGER'S OFFICE · ${gameDate(game.day)} · ${game.day}일차</div><h2>${esc(game.playerName || '대표')}님의 사무실</h2></div><span class="muted">${saveNotice || '진행 상황 자동 저장'}</span></div>
    <div class="dash-hero">${renderNextUp(needsFirst)}${renderTeamStatus(roster)}</div>
    <div class="metric-strip"><div>${itemIcon('amulet-coin')}<div><span>사용 가능한 자금</span><b>₽ ${won(a.funds)}</b><small>주급 ${won(dailyUpkeep(game)*7)}</small></div></div><div>${itemIcon('exp-share')}<div><span>소속 트레이너</span><b>${roster.length}</b><small>포켓몬 ${a.box.length + roster.reduce((n,t)=>n+t.party.length,0)}마리</small></div></div><div>${itemIcon('card-key')}<div><span>선수 등록</span><b>${pros}<small>프로</small></b><small>유스 ${youthCount(a)}/${youthCapacity(a)}</small></div></div><div>${itemIcon('potion')}<div><span>다음 급여</span><b>${gameDate(nextPayday())}</b></div></div></div>
    <div class="dash-grid">
      <section class="card dash-card"><div class="section-heading"><h3>받은 소식</h3><button class="ghost" data-nav="inbox">전체 보기</button></div>${inboxItems().slice(0,5).map(m=>`<button class="news-row" data-nav="inbox"><span class="tag ${m.needsDecision?'urgent':''}">${m.needsDecision?'결정':'소식'}</span><b>${esc(m.title)}</b><small>${m.day}일차 · ${gameDate(m.day)}</small></button>`).join('') || '<p class="muted">아직 소식이 없습니다. 첫 계약을 하면 소식이 들어옵니다.</p>'}</section>
      <section class="card dash-card"><div class="section-heading"><h3>다가오는 대회</h3><button class="ghost" data-nav="schedule">일정</button></div>${upcomingCups(4).map(e=>`<div class="cup-row kind-${e.kind}"><span class="kind"></span><div><b>${esc(e.name)}</b><small>${gameDate(e.date)} · ${cupKindLabel(e.kind)} · 우리 등록 ${e.registrations.length}명</small></div><span class="dd">D-${e.date-game.day}</span></div>`).join('') || '<p class="muted">예정된 대회가 없습니다.</p>'}</section>
      <section class="card dash-card"><div class="section-heading"><h3>지역 순위</h3><button class="ghost" data-nav="schedule">전체</button></div>${renderMiniRanking(a)}</section>
    </div>
    <div class="dash-grid two">
      <section class="card dash-card"><div class="section-heading"><h3>오늘의 운영 계획</h3><button class="ghost" data-nav="map">일정 변경</button></div>
      ${roster.length ? roster.map(t=>`<div class="assignment">${trainerPortrait(t)}<div><b>${fatigueIcon(t)} ${esc(t.name)}</b><p>${esc(scheduledAction(t))}</p></div><div class="mini-party">${t.party.map(m=>monImage(m.species)).join('')}</div></div>`).join('') : '<p class="muted">아직 계약한 트레이너가 없습니다.</p>'}</section>
      <section class="card dash-card"><div class="section-heading"><h3>업데이트 소식</h3></div>${UPDATE_NOTES.slice(0,3).map(n=>`<article class="patch"><header><span>${n.version}</span><b>${esc(n.title)}</b><small>${n.date}</small></header><ul>${n.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></article>`).join('')}</section>
    </div>
    ${rep ? renderDailySummary(rep, false) : ''}`;
}

function nextPayday() { return game.day + ((7 - (game.day % 7)) % 7); }
function cupKindLabel(k) { return k==='youth'?'유스컵':k==='city'?'시티컵':k==='local'?'로컬컵':k==='pwt'?'PWT':'대회'; }
function upcomingCups(n) { return [...ensureSeason(game).events].filter(e=>e.status==='scheduled'&&e.date>=game.day).sort((a,b)=>a.date-b.date).slice(0,n); }

/** 대시보드 왼쪽 위 — 지금 가장 먼저 챙길 일 */
function renderNextUp(needsFirst) {
  if (needsFirst) return `<section class="next-match"><div class="kicker">FIRST STEP</div><h2>첫 유스 계약부터 시작하세요</h2><p>스카우팅에서 후보와 조건을 맞춰 보세요. 계약하면 첫 파트너를 고르고 레벨 5부터 함께 키웁니다.</p><div class="actions"><button data-nav="scouting">후보 살펴보기 →</button></div></section>`;
  const e = upcomingCups(1)[0];
  const fx = fixturesOf(game).filter(f=>f.status==='booked').sort((a,b)=>a.day-b.day)[0];
  if (fx && (!e || fx.day <= e.date)) {
    const g=gymById(fx.gymId), t=playerRoster(game).find(x=>x.id===fx.trainerId);
    return `<section class="next-match"><div class="dday"><small>${fx.day===game.day?'TODAY':'D-DAY'}</small>${fx.day===game.day?'오늘':`D-${fx.day-game.day}`}</div><div class="kicker">NEXT GYM MATCH · ${g.region==='kanto'?'관동':'성도'} ${g.order}번째</div><h2>${esc(t?.name||'')} vs ${g.name}</h2><p>${gameDate(fx.day)} · ${g.badge}이 걸린 관장전</p><p>관장 파티 ${g.party.map(p=>`${K(p.species)} Lv.${p.level}`).join(' · ')}</p><div class="actions"><button data-nav="gyms">체육관 순회 →</button><button class="ghost" data-nav="map">오늘 활동 배정</button></div></section>`;
  }
  if (e) {
    const open = game.day >= e.openDay && game.day <= e.deadline;
    const mine = playerRoster(game).filter(t=>e.registrations.includes(t.id)).map(t=>t.name);
    return `<section class="next-match kind-${e.kind}"><div class="dday"><small>${e.date===game.day?'TODAY':'D-DAY'}</small>${e.date===game.day?'오늘':`D-${e.date-game.day}`}</div><div class="kicker">NEXT COMPETITION · ${cupKindLabel(e.kind)}</div><h2>${esc(e.name)}</h2><p>${gameDate(e.date)} 개최 · 접수 ${gameDate(e.openDay)}–${gameDate(e.deadline)} · 우승 상금 ${won(SEASON.prize*(e.prizeMultiplier??1))}</p><p>${mine.length?`우리 출전: ${mine.map(esc).join(', ')}`:open?'지금 접수 중입니다. 출전할 트레이너를 등록하세요.':'아직 접수 전입니다.'}</p><div class="actions"><button data-nav="schedule">${open?'출전 등록하기':'대회 일정 보기'} →</button><button class="ghost" data-nav="map">오늘 활동 배정</button></div></section>`;
  }
  return `<section class="next-match"><div class="kicker">TODAY</div><h2>오늘의 목적지를 정하세요</h2><p>트레이너를 지도로 보내 포획과 배틀로 키우세요.</p><div class="actions"><button data-nav="map">탐험 지도 →</button></div></section>`;
}

/** 팀 현황 — 평균 능력(OVR), 컨디션, 최근 5경기, 에이스 */
function renderTeamStatus(roster) {
  if (!roster.length) return `<section class="card team-status"><div class="section-heading"><h3>팀 현황</h3></div><p class="muted">계약한 트레이너가 생기면 여기서 컨디션과 에이스를 볼 수 있습니다.</p></section>`;
  const avg = (f) => roster.reduce((n,t)=>n+f(t),0)/roster.length;
  // [임시값] OVR = 트레이너 5능력치 평균 × 5 (20점 만점 → 100점 환산)
  const ovr = Math.round(avg(t=>STAT_KEYS.reduce((n,k)=>n+(t.stats[k]||0),0)/STAT_KEYS.length)*5);
  const fatigue = Math.round(avg(t=>t.fatigue||0));
  const mental = avg(t=>t.stats.mental||0).toFixed(1);
  const form = recentForm(5);
  const aceOwner = roster.flatMap(t=>t.party.map(m=>({t,m}))).sort((a,b)=>b.m.level-a.m.level)[0];
  return `<section class="card team-status"><div class="section-heading"><h3>팀 현황</h3><button class="ghost" data-nav="squad">트레이너</button></div>
    <div class="team-ovr"><div class="ovr"><div>${ovr}<small>OVR</small></div></div><dl><dt>컨디션</dt><dt>멘탈</dt><dt>최근 5경기</dt><dd>${fatigueOf({fatigue}).face} ${100-fatigue}</dd><dd>${mental}</dd><dd><span class="form-dots">${form.map(r=>`<i class="${r===true?'w':r===false?'l':'n'}">${r===true?'W':r===false?'L':'-'}</i>`).join('')}</span></dd></dl></div>
    ${aceOwner?`<div class="ace">${monImage(aceOwner.m.species)}<div><small>ACE</small><b>${esc(K(aceOwner.m.species))} Lv.${aceOwner.m.level}</b><span>${esc(aceOwner.t.name)}의 파티 · ${aceOwner.m.moves.map(M).map(esc).join(' / ')}</span></div></div>`:''}</section>`;
}

/** 최근 경기 결과 (탐험 배틀·관장전), 최신이 왼쪽 */
function recentForm(n) {
  const out = [];
  for (const rep of game.log || []) {
    const day = [];
    for (const r of rep.explored || []) for (const e of r.events || []) if (e.won === true || e.won === false) day.push(e.won);
    for (const g of rep.gyms || []) day.push(!!g.won);
    out.push(...day.reverse());
    if (out.length >= n) break;
  }
  return Array.from({length:n},(_,i)=>out[i] ?? null);
}

function renderMiniRanking(a) {
  const rows = regionalRanking(game);
  if (!rows.length) return '<p class="muted">시즌 첫 공식전이 끝나면 관동·성도 순위가 생깁니다. 시티컵은 레귤러 프로만 출전할 수 있습니다.</p>';
  const mineIdx = rows.findIndex(r=>r.agencyName===a.name);
  const shown = rows.slice(0,5).map((r,i)=>[r,i]);
  if (mineIdx >= 5) shown.push([rows[mineIdx], mineIdx]);
  return shown.map(([r,i])=>`<div class="rank-row ${r.agencyName===a.name?'mine':''}"><span class="pos">${i+1}</span><span class="who">${esc(r.name)} <small>${esc(r.agencyName||'')}</small></span><span class="score">${r.score.toFixed(0)}</span></div>`).join('');
}

function renderDailySummary(rep, detailed = true) {
  return `<section class="card daily-summary"><div class="section-heading"><div><div class="eyebrow">DAILY REVIEW · ${rep.day}일차</div><h3>하루 운영 보고서</h3></div><b class="${rep.net < 0 ? 'negative' : 'positive'}">수지 ${rep.net >= 0 ? '+' : ''}${won(rep.net)}</b></div>
  ${(rep.explored || []).map(r=>`<div class="report-activity"><b>${esc(r.name)} · ${esc(r.location)}</b>
    ${r.events ? `<div class="activity-totals"><span>${r.events.length}/${r.budget} 활동</span><span>${r.wins}승 ${r.losses}패</span><span>포획 ${r.caught}마리</span><span>센터 ${r.centers}회</span><span>상금 +${won(r.money)}</span></div>
      <details class="activity-details" ${detailed?'open':''}><summary>시간순 활동 기록</summary><ol class="activity-timeline">${r.events.map(e=>`<li class="activity-${e.kind}"><time>${e.time}<small>${e.slot}번째 활동</small></time><div><b>${e.kind==='center'?'포켓몬센터':e.kind==='potion'?'상처약 사용':e.kind==='catch'?'야생 포켓몬 탐색':'트레이너 배틀'} ${e.won===false?'· 패배':''}</b>${e.lines.map(l=>`<p>${esc(l)}</p>`).join('')}<small class="muted">파티 HP ${e.before.reduce((n,p)=>n+p.hp,0)} → ${e.after.reduce((n,p)=>n+p.hp,0)} / ${e.after.reduce((n,p)=>n+p.maxhp,0)}</small></div></li>`).join('')}</ol></details>` : `<ul>${r.lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`}</div>`).join('')}
  ${(rep.gyms||[]).map(m=>`<div class="report-activity">${renderBattleAnalysis(m.analysis)}<p><b>${esc(m.trainerName)} vs ${m.gymName} · ${m.won?'승리':'패배'}</b> <button class="ghost" data-watch-gym="${m.id}">관장전 다시 보기</button></p>${m.firstWin?`<p>${m.badge||'배지'} 획득 · 상금 +${won(m.reward)}${m.bonusPaid?` · 계약 배지 보너스 −${won(m.bonusPaid)}`:''}</p>`:m.won?'<p class="muted">이미 획득한 배지입니다. 첫 도전 보상은 중복 지급되지 않습니다.</p>':''}${(m.growth||[]).map(g=>`<p>${esc(K(g.species))} · 경험치 +${g.experience}${g.level>g.before?` · Lv.${g.before} → ${g.level}`:''}${g.learned.length?` · ${g.learned.map(x=>esc(M(x))).join(', ')} 습득`:''}</p>`).join('')}${(m.evolutions||[]).map(e=>`<p>${esc(K(e.before))} → ${esc(K(e.after))} 진화</p>`).join('')}</div>`).join('')}
  ${(rep.training||[]).map(t=>`<p>${esc(K(t.species))} · ${esc(t.text)}</p>`).join('')}
  ${rep.rested.length ? `<p class="muted">휴식 완료 · ${esc(rep.rested.join(', '))}</p>` : ''}
  ${rep.international?`<p>${esc(rep.international)}</p><button data-nav="schedule">PWT 결과 · 관전</button>`:''}${(rep.camps||[]).map(text=>`<p>${esc(text)}</p>`).join('')}${renderCupReport(game,rep.cupId||rep.youthCupId)}<div class="report-foot">급여 지급 ${won(rep.upkeep)} · 새로운 소식 ${rep.news.length}건</div></section>`;
}

function renderInbox() {
  const items = inboxItems();
  const selected = items.find(m => m.key === selectedMessage) || items[0];
  const selectedReport = selected?.trainerId || selected?.reportDay ? game.log.find(r=>r.day===selected.day) : null;
  return `<div class="page-h"><div><div class="eyebrow">COMMUNICATIONS</div><h2>받은 메시지함</h2></div><span class="muted">${items.length}건</span></div>
    <div class="mail-layout"><div class="mail-list">${items.map((m,i)=>`<button class="mail-item ${selected?.key === m.key ? 'selected' : ''} ${read.has(m.key)?'':'unread'}" data-message="${i}"><small>${m.day}일차 · 운영팀</small><b>${esc(m.title)}</b><p>${esc((m.preview || m.body || '소속사 소식을 확인하세요.').slice(0,140))}</p></button>`).join('') || '<p class="muted">받은 소식이 없습니다.</p>'}</div>
    <article class="mail-body">${selected ? `<div class="eyebrow">운영팀 → ${esc(game.playerName || '대표')}</div><h2>${esc(selected.title)}</h2><small>${selected.day}일차 · ${gameDate(selected.day)}</small><hr>${selectedReport ? renderDailySummary(selectedReport) : `<div class="letter">${esc(selected.body || '상세 내용은 관련 화면에서 확인할 수 있습니다.').replace(/\n/g,'<br>')}</div>`}<div class="dialog-actions">${selected?.careerTrainerId?`<button data-open-trainer="${selected.careerTrainerId}">진로 결정하기</button>`:''}<button class="ghost" data-nav="personnel">계약 · 스태프</button><button class="ghost" data-nav="schedule">일정 · 대회 확인</button><button class="ghost" data-nav="map">탐험 지도</button><button class="ghost" data-nav="squad">트레이너 확인</button></div>` : '<h3>새로운 소식을 기다리고 있습니다.</h3>'}</article></div>`;
}

/* ---------------- 트레이너 ---------------- */

/** FM처럼 값에 따라 색이 붙는 능력치 숫자 */
function at(v) {
  const n = Math.round(v);
  const cls = n >= 18 ? 'top' : n >= 14 ? 'hi' : n >= 10 ? 'mid' : 'lo';
  return `<span class="at ${cls}">${n}</span>`;
}

/** 컨디션 막대 */
function condBar(t) {
  const c = conditionOf(t), cls = c >= 65 ? 'good' : c >= 30 ? 'mid' : 'bad';
  return `<div class="cond-bar ${cls}" title="컨디션 ${c} · 패배가 쌓이면 떨어지고 승리하면 회복됩니다"><i style="width:${c}%"></i></div>`;
}

/** 트레이너 명단 — F1처럼 레귤러 2석 · 리저브 1석 · 유스 3석 */
function renderSquad() {
  const a = playerAgency(game), roster = playerRoster(game);
  if (!roster.length) return '<div class="note">아직 계약한 트레이너가 없습니다.</div>';
  const seats = ensureSeats(a), youth = roster.filter(t => t.isYouth), other = roster.filter(t => !t.isYouth && !isRegisteredPro(t));
  const card = (t) => {
    const d = displayStats(t), b = badgesOf(t);
    return `<button class="roster-card" data-open-trainer="${t.id}">${trainerPortrait(t,"big")}<div class="rc-main"><div class="rc-name"><b>${esc(t.name)}</b><span class="seat ${t.isYouth ? 'youth' : t.proSeat || 'race'}">${seatLabel(t)}</span></div>
      <div class="rc-stats">${STAT_KEYS.map(k => `<span><small>${STAT_KO[k]}</small>${at(d[k])}</span>`).join('')}</div>
      <div class="rc-cond"><small>컨디션 ${conditionOf(t)}</small>${condBar(t)}${t.mentalDebuff > 0.5 ? `<small class="negative">연패 −${t.mentalDebuff.toFixed(1)}</small>` : ''}</div>
      <p class="rc-today">${esc(scheduledAction(t))}</p></div>
      <div class="rc-side"><div class="mini-party">${t.party.map(m => monImage(m.species)).join('')}</div><small>${t.record?.wins || 0}승 ${t.record?.losses || 0}패 · 관동 ${b.kanto}/8 · 성도 ${b.johto}/8 · 주급 ${t.contract?.wage ?? t.salary}</small></div></button>`;
  };
  const empty = (label) => `<div class="roster-card empty"><span class="avatar big">＋</span><div class="rc-main"><b>빈 자리</b><p class="muted">${label}</p></div></div>`;
  const block = (title, sub, list, cap, emptyLabel) => `<section class="roster-block"><div class="section-heading"><h3>${title} <small>${list.length}/${cap}</small></h3><span class="muted">${sub}</span></div>${list.map(card).join('')}${Array.from({ length: Math.max(0, cap - list.length) }, () => empty(emptyLabel)).join('')}</section>`;
  return `<div class="page-h"><div><div class="eyebrow">SQUAD · F1식 좌석</div><h2>트레이너</h2></div><span class="muted">프로는 레귤러 ${CAREER.proSeats.race}명 + 리저브 ${CAREER.proSeats.reserve}명까지. 리저브는 시티컵에 출전할 수 없습니다.</span></div>
    ${block('레귤러 프로', '시티컵·공식전 출전', seats.race, CAREER.proSeats.race, '8배지 유스 콜업이나 이적으로 채울 수 있습니다')}
    ${block('리저브', '레귤러와 교체 가능 · 로컬컵은 출전', seats.reserve, CAREER.proSeats.reserve, '세 번째 프로는 리저브가 됩니다')}
    ${block('유스', '배지 8개를 모으면 콜업 결정', youth, youthCapacity(a), '스카우팅에서 계약할 수 있습니다')}
    ${other.length ? block('자격 확인 필요', '', other, other.length, '') : ''}`;
}

function partyCard(t, m, i) {
  const st = realStats(m), fs = fieldState(m), base = expForLevel(m.level), next = expForLevel(m.level + 1);
  const xp = Math.max(0, Math.min(100, ((m.exp - base) / Math.max(1, next - base)) * 100)), hp = Math.round(fs.hp / Math.max(1, fs.maxhp) * 100);
  const sp = Dex.species.get(m.species), ready = evolutionOptions(m).some(e => e.ready), item = m.item && HELD_ITEMS[m.item];
  return `<article class="pcard">
    <header>${monImage(m.species)}<div><b>${esc(K(m.species))}</b><small>Lv.${m.level} · ${sp.types.map(x => TYPE_KO[x]).join('/')}</small></div><button class="ghost to-box" data-t="${t.id}" data-i="${i}" ${t.party.length === 1 ? 'disabled' : ''} title="박스로 보내기">박스로</button></header>
    <div class="pc-bars"><label>HP ${fs.hp}/${fs.maxhp}${fs.status ? ` · ${statusLabel(fs.status)}` : ''}<span class="bar hp"><i style="width:${hp}%"></i></span></label><label>EXP<span class="bar xp"><i style="width:${xp}%"></i></span></label></div>
    <div class="pc-meta"><span>특성 <b>${esc(ko(ABILITY_KO, m.ability))}</b></span><span>공${st.atk} 방${st.def} 특공${st.spa} 특방${st.spd} 속${st.spe}</span></div>
    <button class="item-slot ${item ? 'has' : ''}" data-give-item data-t="${t.id}" data-i="${i}">${item ? `${heldIcon(m.item)}<span><b>${esc(item.ko)}</b><small>지닌 도구 · 바꾸기</small></span>` : '<span class="plus">＋</span><span><b>도구 지니게 하기</b><small>창고에서 고르기</small></span>'}</button>
    <div class="pc-moves">${Array.from({ length: 4 }, (_, slot) => { const mv = m.moves[slot], d = mv ? Dex.moves.get(mv) : null; return `<button class="pc-move manage-mon" data-slot="${slot}" data-t="${t.id}" data-i="${i}">${d ? `<span class="move-type" data-type="${d.type}">${TYPE_KO[d.type]}</span><b>${esc(M(mv))}</b>` : '<b class="muted">빈 칸</b>'}</button>`; }).join('')}</div>
    <footer><button class="ghost manage-mon" data-t="${t.id}" data-i="${i}">기술·특성 관리</button><button class="ghost evolve-mon" data-t="${t.id}" data-i="${i}" ${ready ? '' : 'disabled'}>${ready ? '진화하기' : '진화 조건 미달'}</button></footer>
  </article>`;
}

function renderTrainer(id) {
  const t = findTrainer(game.league, id);
  if (!t || t.agencyId!==game.playerAgencyId) return '<div class="note">현재 소속 트레이너가 아닙니다.</div>';
  const a = playerAgency(game), seats = ensureSeats(a);
  const d = displayStats(t), c = t.contract || {}, b = badgesOf(t), cond = conditionOf(t);
  const swap = t.proSeat === 'reserve' && seats.race.length ? `<label class="seat-swap">레귤러와 교체<select id="seat-target">${seats.race.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button data-seat-swap="${t.id}">교체</button></label>`
    : t.proSeat === 'race' && seats.reserve.length ? `<label class="seat-swap">리저브와 교체<select id="seat-target">${seats.reserve.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button data-seat-swap-race="${t.id}">교체</button></label>` : '';
  return `<button class="ghost back-link" id="back-squad">← 트레이너 명단</button>
    <section class="tp-hero">
      <div class="tp-sprite">${trainerFull(t)}</div>
      <div class="tp-id"><span class="seat ${t.isYouth ? 'youth' : t.proSeat || 'race'}">${seatLabel(t)}</span><h2>${esc(t.name)}</h2><p>${esc(t.nature?.style || '균형형')} · 레이팅 ${trainerRating(t).toFixed(1)} · ${t.record?.wins || 0}승 ${t.record?.losses || 0}패 · 관동 ${b.kanto}/8 · 성도 ${b.johto}/8</p><p class="muted">오늘: ${esc(scheduledAction(t))}</p></div>
      <div class="tp-cond"><small>컨디션</small><b>${cond}</b>${condBar(t)}<small>${fatigueIcon(t)} ${t.mentalDebuff > 0.5 ? `연패 페널티 −${t.mentalDebuff.toFixed(1)}` : '패배가 쌓이면 떨어지고, 승리하면 회복됩니다'}</small></div>
      <div class="tp-actions"><button data-nav="map" data-trainer="${t.id}">지도로 보내기</button><button class="ghost" data-nav="gyms" data-trainer="${t.id}">관장전 신청</button>${swap}</div>
    </section>
    <div class="tp-grid">
      <section class="card"><h3>능력치</h3>${STAT_KEYS.map(k => `<div class="stat-row"><span>${STAT_KO[k]}</span><span class="stat-bar"><i style="width:${Math.min(100, d[k] / 20 * 100)}%"></i></span>${at(d[k])}</div>`).join('')}</section>
      <section class="card"><h3>계약</h3><dl class="kv"><dt>주급</dt><dd>${c.wage ?? t.salary}</dd><dt>영입 개런티</dt><dd>${won(c.signing || 0)}</dd><dt>프로 승급 시</dt><dd>${c.proRaise ?? 0}% 인상</dd><dt>배지 보너스</dt><dd>${won(c.badgeBonus || 0)}/개</dd><dt>계약 기간</dt><dd>${c.years ?? '—'}년</dd></dl></section>
      <section class="card"><h3>가방</h3><div class="bag-row">${heldIconSupply('poke-ball')}<span>몬스터볼</span><b>${bagOf(t).pokeBall || 0}</b></div><div class="bag-row">${heldIconSupply('potion')}<span>상처약</span><b>${bagOf(t).potion || 0}</b></div><button class="ghost" data-nav="shop">상점 · 물품 지급</button></section>
    </div>
    <section class="tp-party"><div class="section-heading"><h3>파티 <small>${t.party.length}/6</small></h3><button class="ghost" data-nav="box">박스 열기</button></div>
      <div class="party-cards">${t.party.map((m, i) => partyCard(t, m, i)).join('') || '<p class="muted">아직 파티가 없습니다.</p>'}</div></section>
    ${renderCareer(game,t)}`;
}
const heldIconSupply = (slug) => `<img class="item-ico" src="${(import.meta.env?.BASE_URL??'/')}assets/items/${slug}.png" alt="" aria-hidden="true" width="30" height="30">`;

/* ---------------- 박스 ---------------- */

function renderBox() {
  const a = playerAgency(game), roster = playerRoster(game);
  const target = roster.find(t=>t.id === map.trainerId) || roster[0];
  boxSelection = Math.max(0, Math.min(boxSelection, a.box.length - 1));
  const selected = a.box[boxSelection];
  return `<div class="page-h"><div><div class="eyebrow">POKÉMON STORAGE</div><h2>소속사 포켓몬 박스</h2></div><span class="muted">보관 ${a.box.length}마리</span></div>
    <div class="storage-layout"><section class="card"><div class="section-heading"><h3>보관 중인 포켓몬</h3><span class="muted">포획한 포켓몬은 여기에 도착합니다</span></div><div class="storage-grid">${Array.from({length:Math.max(30,Math.ceil(a.box.length/30)*30)},(_,i)=>a.box[i] ? `<button class="storage-slot ${boxSelection === i?'selected':''}" data-box-select="${i}">${monImage(a.box[i].species)}<b>${K(a.box[i].species)}</b><small>Lv. ${a.box[i].level}</small></button>`:'<div class="storage-slot empty"><span>＋</span></div>').join('')}</div></section>
    <aside><section class="card storage-detail">${selected ? `<div class="eyebrow">선택한 포켓몬</div>${monImage(selected.species)}<h2>${K(selected.species)} <small>Lv. ${selected.level}</small></h2><p class="muted">${selected.caughtOnDay || 1}일차에 만난 동료</p><div class="move-pills">${selected.moves.map(m=>`<span>${esc(M(m))}</span>`).join('')}</div><button class="item-slot ${selected.item?'has':''}" data-give-item data-b="${boxSelection}">${selected.item&&HELD_ITEMS[selected.item]?`${heldIcon(selected.item)}<span><b>${esc(HELD_ITEMS[selected.item].ko)}</b><small>지닌 도구 · 바꾸기</small></span>`:'<span class="plus">＋</span><span><b>도구 지니게 하기</b><small>창고에서 고르기</small></span>'}</button><div class="pokemon-actions"><button class="ghost manage-mon" data-b="${boxSelection}">기술·특성·진화 관리</button><button data-nav="training">트레이닝 센터</button></div><label>함께할 트레이너<select id="box-target">${roster.map(t=>`<option value="${t.id}" ${t.id===target?.id?'selected':''}>${esc(t.name)} · ${t.party.length}/6</option>`).join('')}</select></label><button class="to-party" data-b="${boxSelection}" ${!target || target.party.length>=6 || selected.training?'disabled':''}>${selected.training?'장기 훈련 중':'파티에 합류시키기'}</button>${target?.party.length>=6?'<p class="muted">파티가 가득 찼습니다. 한 마리를 박스로 옮겨주세요.</p>':''}` : '<h3>첫 만남을 기다리는 중</h3><p class="muted">지도에서 포켓몬 포획을 배정하세요.</p><button data-nav="map">탐험 지도 열기</button>'}</section>
    <section class="card party-preview"><h3>${esc(target?.name || '트레이너')}의 파티</h3>${(target?.party||[]).map((m,i)=>`<div class="party-slot">${monImage(m.species)}<div><b>${K(m.species)}</b><small>Lv. ${m.level}</small></div><button class="ghost to-box" data-t="${target.id}" data-i="${i}" ${target.party.length===1?'disabled':''}>박스로</button></div>`).join('')}<p class="muted">${target?.party.length||0} / 6 · 마지막 동료는 파티에 남습니다.</p></section></aside></div>`;
}

/* ---------------- 맵 ---------------- */

function renderMap() {
  const roster = playerRoster(game);
  const region = ATLAS_REGIONS.find(r=>r.id===map.region) || ATLAS_REGIONS[0];
  const locs = locationsIn(region.id);
  if (!roster.some(t=>t.id === map.trainerId)) map.trainerId = (roster.find(t=>!game.actions[t.id]&&!t.camp)||roster[0])?.id || null;
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
    ${GYMS.some(g=>g.location===loc.id)?`<div class="gym-map-callout"><b>${GYMS.find(g=>g.location===loc.id).name} 체육관</b><button data-nav="gyms">관장 파티 확인 · 도전</button></div>`:''}
    <h4>출현 포켓몬 <small>${loc.wild.length}종</small></h4><div class="wild-grid">${loc.wild.map(w=>`<div>${monImage(w.species)}<b>${K(w.species)}</b><small>Lv.${w.min}–${w.max}</small></div>`).join('') || '<p class="muted">야생 포켓몬이 출현하지 않습니다.</p>'}</div>
    <h4>현지 트레이너</h4>${loc.trainers.map(n=>`<div class="npc-row"><b>${t?.beaten?.[`${loc.id}:${n.name}`]?'✓ ':''}${TRAINER_CLASSES[n.cls]?.name || n.cls} ${esc(n.name)}</b><p>${n.party.map(([s,l])=>`${K(s)} Lv.${l}`).join(' · ')}</p></div>`).join('')||'<p class="muted">배틀 상대가 없습니다.</p>'}
    <div class="dispatch-form"><label>파견 트레이너<select id="map-trainer">${roster.map(x=>`<option value="${x.id}" ${x.id===t?.id?'selected':''}>${esc(x.name)} · 파티 ${x.party.length}마리</option>`).join('') || '<option>첫 계약이 필요합니다</option>'}</select></label><label>하루 활동 횟수<select id="activity-budget" aria-label="하루 활동 횟수">${[6,7,8].map(n=>`<option value="${n}" ${n===(ex?.activities || map.activities)?'selected':''}>${n}회${n===6?' · 기본':''}</option>`).join('')}</select></label>${t?(bagOf(t).pokeBall>0?`<p class="muted">가방: 몬스터볼 ${bagOf(t).pokeBall}개 · 상처약 ${bagOf(t).potion||0}개</p>`:`<p class="risk-note">${esc(t.name)}의 몬스터볼이 0개입니다. 이대로 포획을 보내면 아무 활동도 하지 못합니다. <button class="ghost" data-nav="shop">상점에서 지급</button></p>`):''}<p class="muted">센터·상처약 사용도 1회입니다. HP 50% 미만·기절·상태이상·PP 부족 시 회복 후 탐험을 이어갑니다.</p><div class="field-party">${(t?.party||[]).map(m=>`<span>${K(m.species)} <b>HP ${fieldState(m).hp}/${fieldState(m).maxhp}</b>${fieldState(m).status?' · '+statusLabel(fieldState(m).status):''}</span>`).join('')}</div><button data-act="mixed" ${t&&(loc.wild.length||loc.trainers.length)?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='mixed'?'✓ 병행 탐험 배정됨':'포획·배틀 병행 배정'}</button><button data-act="catch" ${t&&loc.wild.length?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='catch'?'✓ 포획 배정됨':'포켓몬 포획 배정'}</button><button class="ghost" data-act="battle" ${t&&loc.trainers.length?'':'disabled'}>${ex?.locationId===loc.id&&ex.mode==='battle'?'✓ 배틀 배정됨':'트레이너 배틀 배정'}</button><p class="muted">오늘: ${esc(describeAction(cur))}</p>${cur&&cur!=='rest'?'<button class="ghost" id="cancel-assignment">배정 취소 · 휴식</button>':''}</div>` : `<div class="eyebrow">WORLD ATLAS</div><h2>${region.name}</h2><p class="muted">현재 소속사의 활동 범위는 관동·성도입니다.</p>`}</aside></div>`;
}

/* ---------------- 활동 일정 ---------------- */
function scheduledAction(t) {
  if(t.camp)return `캠프 · ${t.camp.remaining}일 남음`;
  const e=game.competitions?.events.find(e=>e.date===game.day&&e.status==='scheduled'&&e.registrations.includes(t.id));
  if(e&&cupEligible(t,e))return e.name+' 참가';
  const fx=upcomingFixture(game,t.id);
  if(fx?.day===game.day)return `${gymById(fx.gymId)?.name} 체육관 관장전 · 자동 관전`;
  return describeAction(game.actions[t.id])+(fx?` · ${fx.day-game.day}일 뒤 ${gymById(fx.gymId)?.name} 관장전`:'');
}
function renderSchedule() {
  const roster = playerRoster(game);
  return `<div class="page-h"><div><div class="eyebrow">OPERATIONS CALENDAR</div><h2>활동 일정</h2></div><span class="muted">오늘의 배정과 주간 정산</span></div>
    <div class="week-calendar">${Array.from({length:7},(_,i)=>game.day+i).map(day=>`<section class="calendar-day ${day===game.day?'today':''}"><small>${day===game.day?'오늘':`${day-game.day}일 후`}</small><h3>${gameDate(day)}</h3>${day===game.day?roster.map(t=>`<p><b>${esc(t.name)}</b><br>${esc(scheduledAction(t))}</p>`).join(''):'<p class="muted">활동 미배정</p>'}${fixturesOf(game).filter(f=>f.status==='booked'&&f.day===day).map(f=>`<p class="pill fixture-pill">관장전 · ${esc(playerRoster(game).find(t=>t.id===f.trainerId)?.name||'')} vs ${gymById(f.gymId)?.name}</p>`).join('')}${(game.competitions?.events||[]).filter(e=>e.date===day||e.deadline===day).map(e=>`<p class="pill">${e.name} · ${e.date===day?'개최':'등록 마감'}</p>`).join('')}${day%7===0?'<span class="pill">주급 지급일</span>':''}</section>`).join('')}</div>
    <section class="card" style="margin-top:22px"><div class="section-heading"><h3>오늘의 활동 지시</h3><button data-nav="map">목적지 선택 →</button></div><p class="muted">하루 6~8회의 활동을 배정합니다. 센터 방문도 활동에 포함되며, 배정하지 않은 트레이너와 포켓몬은 휴식하며 회복합니다.</p>${roster.map(t=>`<div class="assignment">${trainerPortrait(t)}<div><b>${fatigueIcon(t)} ${esc(t.name)}</b><p>${esc(scheduledAction(t))}</p></div></div>`).join('')}</section>
    <section class="card" style="margin-top:22px"><h3>지난 활동</h3>${game.log.slice(0,7).map(rep=>`<div class="assignment"><b>${gameDate(rep.day)}</b><span class="muted">${rep.explored.map(r=>`${esc(r.name)} · ${esc(r.location)}`).join(' / ') || ((rep.cupId||rep.youthCupId)?'대회 및 소속사 운영':'휴식 및 소속사 운영')} · 수지 ${rep.net>=0?'+':''}${won(rep.net)}</span></div>`).join('') || '<p class="muted">아직 완료한 활동이 없습니다.</p>'}</section>`;
}

/* ---------------- 스카우팅 ---------------- */

function renderScouting() {
  const lock = rosterLock(game);
  if (lock && !game.pendingStarter) {
    return `<div class="page-h"><h2>스카우팅</h2></div>
      <div class="card"><h3>지금은 계약할 수 없습니다</h3>
      <div class="note">${esc(lock.msg)}</div></div>`;
  }
  return `<div class="page-h"><h2>스카우팅</h2><span class="muted" id="scout-capacity">유스 ${youthCount(playerAgency(game))} / ${youthCapacity(playerAgency(game))}명</span></div><div id="nego-root"></div>`;
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
  else if (screen === 'support' || screen === 'shop') { screen = 'shop'; main.innerHTML = renderShop(game); }
  else if (screen === 'training') main.innerHTML = renderTraining(game);
  else if (screen === 'gyms') main.innerHTML = renderGyms(game,map.trainerId);
  else if (screen === 'schedule') main.innerHTML = renderSeason(game)+renderSchedule();
  else if (screen === 'scouting') main.innerHTML = renderScouting();
  else if (screen === 'personnel') main.innerHTML = renderPersonnel(game);

  wire();
  wireMonImages(main);
  const view = `${screen}:${detailId || ''}`;
  if (view !== lastView) main.scrollTop = 0;
  lastView = view;
}

function wire() {
  const main = $('main');
  wirePersonnel(main,game,()=>{persist();render();});
  wireSeason(main,game,()=>{persist();render();},openCupWatch);
  main.querySelectorAll('[data-open-trainer]').forEach(b=>b.onclick=()=>{detailId=b.dataset.openTrainer;screen='squad';render();});
  wireCareer(main,game,()=>{if(detailId&&!playerRoster(game).some(t=>t.id===detailId))detailId=null;persist();render();});
  main.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ if(b.dataset.trainer)map.trainerId=b.dataset.trainer;screen=b.dataset.nav; detailId=null; render(); });
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

  wireManagementPages(main,game,()=>{persist();render();},id=>openGymWatch(id),id=>{map.trainerId=id;render();});
  wireShop(main,game,()=>{persist();render();});
  main.querySelectorAll('[data-give-item]').forEach(b=>b.onclick=()=>{
    const mon=b.dataset.t ? findTrainer(game.league,b.dataset.t)?.party[Number(b.dataset.i)] : playerAgency(game).box[Number(b.dataset.b)];
    if(mon)openItemPicker(game,mon,()=>{persist();render();},()=>{screen='shop';detailId=null;render();});
  });
  const seatTarget=$('seat-target');
  main.querySelectorAll('[data-seat-swap],[data-seat-swap-race]').forEach(b=>b.onclick=()=>{
    const r=b.dataset.seatSwap?swapSeat(game,b.dataset.seatSwap,seatTarget.value):swapSeat(game,seatTarget.value,b.dataset.seatSwapRace);
    alert(r.msg);persist();render();
  });
  main.querySelectorAll('.manage-mon,.evolve-mon').forEach(b=>b.onclick=()=>{
    const mon=b.dataset.t ? findTrainer(game.league,b.dataset.t)?.party[Number(b.dataset.i)] : playerAgency(game).box[Number(b.dataset.b)];
    if(!mon)return;
    openPokemonPanel(game,mon,()=>{persist();render();},b.classList.contains('evolve-mon')?'evolution':'moves',Number(b.dataset.slot||0),{onItem:(m,done)=>openItemPicker(game,m,()=>{persist();render();done();},()=>{document.querySelectorAll('dialog').forEach(d=>{d.close();d.remove();});screen='shop';detailId=null;render();})});
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
      assignAction(game, map.trainerId, exploreAction(map.locId, b.dataset.act, Number($('activity-budget')?.value || 6)));
      persist(); render();
    };
  });

  if (screen === 'scouting' && $('nego-root')) {
    openNegotiation($('nego-root'), game, () => gotoMap(), () => {renderTop();renderSide();const capacity=$('scout-capacity');if(capacity)capacity.textContent=`유스 ${youthCount(playerAgency(game))} / ${youthCapacity(playerAgency(game))}명`;});
  }
}

/* ---------------- 진입 ---------------- */

function persist() { saveNotice = saveGame(game).persisted ? '저장됨 · 이 브라우저' : '저장 공간이 부족합니다. 진행이 저장되지 않았습니다.'; }

export function initFm({ game: existing }) {
  game = existing;
  screen = game.pendingStarter ? 'scouting' : 'office';
  read.clear(); (game.readMessages || []).forEach(k=>read.add(k));
  $('app').hidden = false;

  $('tb-continue').onclick = async () => {
    if (busy || game.gameOver || game.pendingStarter || game.opening?.tutorialContractNeeded || !playerRoster(game).length) return;
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
    await drainGymWatches();
  };

  sfx.installUnlockHandler();
  const sfxToggle = $('sfx-on');
  if (sfxToggle) {
    sfx.setEnabled(sfxToggle.checked);
    sfxToggle.onchange = () => { sfx.unlock(); sfx.setEnabled(sfxToggle.checked); };
  }

  render();
  window.__game = game;
  void drainGymWatches();
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
  map.trainerId = playerRoster(game).at(-1)?.id || null;   // 방금 계약한 유스를 먼저 보낸다
  detailId = null;
  render();
}


let watchingGym=false;
async function openGymWatch(id) {
  if(watchingGym||busy)return;
  const match=(game.gymHistory||[]).find(m=>m.id===id);if(!match)return;
  watchingGym=true;busy=true;renderTop();
  try{await watchGymMatch(match);game.pendingGymWatches=(game.pendingGymWatches||[]).filter(x=>x!==id);persist();}
  finally{watchingGym=false;busy=false;render();}
}
async function drainGymWatches(){
  if(watchingGym||busy)return;
  for(const id of [...(game.pendingGymWatches||[])]) await openGymWatch(id);
  for(const id of [...(game.pendingCupWatches||[])]) await openCupWatch(id);
}

async function openCupWatch(id){
  if(busy)return;
  const e=[...(game.competitions?.events||[]),...(game.international?.seasons||[])].find(e=>e.matches.some(m=>m.id===id));
  const m=e?.matches.find(m=>m.id===id);if(!m)return;
  busy=true;renderTop();
  try{await watchGymMatch(m);if(!e.viewed.includes(id))e.viewed.push(id);game.pendingCupWatches=(game.pendingCupWatches||[]).filter(x=>x!==id);persist();}
  finally{busy=false;render();}
}
