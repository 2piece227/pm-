/**
 * 오프닝 — 타이틀 → 이름 → 소속사 → (FM 화면 열기) → 튜토리얼 → 첫 계약. (기획서 §3.10)
 *
 * 개발자 모드: 이름 칸에 정해둔 문구를 넣으면 **기존 배틀 시뮬 프로토타입**
 * (`trainer_sim_v2.html`)으로 바로 넘어간다. 그 파일은 지우지 않고 숨겨진 진입점으로만 둔다.
 *
 * 첫 계약은 FM 화면의 스카우팅 자리에서 대화로 진행한다 — 오프닝이 따로 계약 UI를 갖지 않는다.
 */
import { createGame } from '../engine/game.js';
import { PLAYER_AGENCY_CHOICES } from '../data/agencies.js';
import { loadSave, writeSave, clearSave, hasResumable, saveSummary } from '../engine/save.js';
import { initFm, gotoScouting } from './fm-view.js';
import { resetNegotiation, restoreYouth } from './negotiation.js';
import { restoreGame } from '../engine/checkpoint.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 개발자 모드 암호 — 기존 시뮬 프로토타입으로 직행 */
const DEV_NAME = '비통한비버통';
const DEV_TARGET = 'trainer_sim_v2.html';

const state = { seed: null, playerName: '', agencyId: null, game: null };

/* ---------------- 화면 전환 ---------------- */

function show(page) {
  $('opening').hidden = false;
  document.querySelectorAll('.ov-page').forEach((el) => {
    el.classList.toggle('on', el.dataset.page === page);
  });
  if (page !== 'title') writeSave({ stage: page });
  if (page === 'name') setTimeout(() => $('in-name')?.focus(), 30);
}

/* ---------------- 1. 타이틀 ---------------- */

function initTitle() {
  const save = loadSave();
  const resumable = hasResumable(save);
  let opened = false;

  const open = () => {
    if (opened) return;
    opened = true;
    $('title-press').hidden = true;
    if (!resumable) { start(); return; }
    $('title-menu').hidden = false;
    $('resume-note').textContent = saveSummary(save);
  };

  const press = (e) => {
    if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Shift')) return;
    open();
  };
  window.addEventListener('keydown', press);
  $('opening').addEventListener('pointerdown', press);

  $('btn-resume').onclick = () => resume(save);
  $('btn-newgame').onclick = () => {
    if (resumable && !window.confirm('저장된 진행을 지우고 새로 시작할까요?')) return;
    clearSave(); start();
  };

  show('title');
}

function start() {
  state.seed = Date.now() & 0x7fffffff;
  $('in-name').value = '';
  $('name-msg').textContent = '';
  show('name');
}

/** 세이브에서 이어간다 — 리그는 시드로 똑같이 다시 만든다 */
async function resume(save) {
  if (save.snapshot) {
    try { state.game = restoreGame(save.snapshot); launch(); }
    catch (error) { $('resume-note').textContent = error.message; }
    return;
  }
  state.seed = save.seed ?? (Date.now() & 0x7fffffff);
  state.playerName = save.playerName || '';
  state.agencyId = save.agencyId || PLAYER_AGENCY_CHOICES[0].id;

  if (!save.agencyId) { renderAgencies(); show('agency'); return; }

  await buildGame();
  if (save.youth) await restoreYouth(state.game, save.youth);
  launch({ thenScout: !save.youth });
}

/* ---------------- 2. 이름 ---------------- */

function initName() {
  const submit = async () => {
    const raw = $('in-name').value.trim();
    if (!raw) { $('name-msg').textContent = '이름을 입력해주세요.'; return; }

    if (raw === DEV_NAME) {
      $('name-msg').textContent = '개발자 모드 — 배틀 시뮬로 이동합니다.';
      window.location.href = DEV_TARGET;
      return;
    }

    state.playerName = raw;
    writeSave({ seed: state.seed, playerName: raw });
    renderAgencies();
    show('agency');
  };

  $('btn-name-ok').onclick = submit;
  $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.onclick = () => show(b.dataset.back);
  });
}

/* ---------------- 3. 소속사 선택 ---------------- */

/** 등급 라벨 대신 막대 5칸으로만 수준을 전달한다 (§3.3) */
const pips = (n) =>
  `<span class="pips">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('')}</span>`;

function renderAgencies() {
  $('ag-list').innerHTML = PLAYER_AGENCY_CHOICES.map((c) => `
    <button class="ag${state.agencyId === c.id ? ' on' : ''}" data-id="${c.id}">
      <b>${esc(c.name)}</b>
      <div class="blurb">${esc(c.blurb)}</div>
      <div class="gauge"><span>모기업 자금</span>${pips(c.parentFunds)}</div>
      <div class="gauge hope"><span>이사진 기대</span>${pips(c.boardHopes)}</div>
    </button>`).join('');

  $('ag-list').querySelectorAll('.ag').forEach((btn) => {
    btn.onclick = () => {
      state.agencyId = btn.dataset.id;
      $('ag-list').querySelectorAll('.ag').forEach((b) => b.classList.toggle('on', b === btn));
      $('btn-agency-ok').disabled = false;
    };
  });

  $('btn-agency-ok').disabled = !state.agencyId;
  $('btn-agency-ok').onclick = async () => {
    const c = PLAYER_AGENCY_CHOICES.find((x) => x.id === state.agencyId);
    writeSave({ agencyId: state.agencyId, agencyName: c?.name });
    $('btn-agency-ok').disabled = true;
    $('btn-agency-ok').textContent = '준비 중…';
    await buildGame();
    launch({ thenTutorial: true });
  };
}

async function buildGame() {
  state.game = await createGame({
    seed: state.seed,
    playerName: state.playerName,
    agencyChoiceId: state.agencyId,
    startEmpty: true,   // §3.10 — 트레이너 0명으로 시작해 첫 계약으로 1명을 채운다
  });
}

function launch({ thenTutorial = false, thenScout = false } = {}) {
  $('opening').hidden = true;
  writeSave({ stage: 'playing' });
  resetNegotiation();
  initFm({ game: state.game });
  if (thenTutorial) runTutorial(() => gotoScouting());
  else if (thenScout) gotoScouting();
}

/* ---------------- 4. 튜토리얼 ---------------- */

const TOUR = [
  {
    sel: '.topbar',
    title: '여기가 사무실입니다',
    text: '소속사 이름, 날짜, 자금이 늘 위에 떠 있습니다. 오른쪽 [계속]을 누를 때만 시간이 흐릅니다.',
  },
  {
    sel: '.side',
    title: '왼쪽이 전부입니다',
    text: '받은 메시지함이 기본 화면이고, 나머지는 여기서 들어갑니다.',
  },
  {
    sel: '[data-s="squad"]',
    title: '트레이너',
    text: '계약한 트레이너와 그들이 데리고 있는 포켓몬을 봅니다. 이름을 누르면 상세로 들어갑니다.',
  },
  {
    sel: '[data-s="map"]',
    title: '맵',
    text: '하루의 결정은 여기서 합니다. 도로를 누르고 포켓몬을 잡을지, 트레이너와 싸울지 정하면 [계속]에 결과가 옵니다.',
  },
  {
    sel: '[data-s="box"]',
    title: '박스',
    text: '잡은 포켓몬이 여기 쌓입니다. 파티(6마리)로 올리고 내릴 수 있습니다.',
  },
  {
    sel: '[data-s="scouting"]',
    title: '스카우팅',
    text: '여기서 계약을 협상합니다. 후보가 먼저 제시한 조건을 조정하며 대화합니다 — 지금 첫 트레이너를 데려오죠.',
  },
];

function runTutorial(done) {
  let i = 0;
  const coach = $('coach');
  const hole = $('coach-hole');
  const box = $('coach-box');

  const close = () => {
    coach.hidden = true;
    window.removeEventListener('resize', place);
    done?.();
  };

  function place() {
    const step = TOUR[i];
    const el = document.querySelector(step.sel);
    const r = el ? el.getBoundingClientRect()
      : { top: 80, left: 20, width: 200, height: 40, bottom: 120 };
    const pad = 6;
    hole.style.top = `${r.top - pad}px`;
    hole.style.left = `${r.left - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;

    const below = r.bottom + 14;
    const fits = below + 160 < window.innerHeight;
    box.style.top = fits ? `${below}px` : `${Math.max(12, r.top - 170)}px`;
    box.style.left = `${Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - 350))}px`;

    $('coach-t').textContent = step.title;
    $('coach-p').textContent = step.text;
    $('coach-step').textContent = `${i + 1} / ${TOUR.length}`;
    $('coach-next').textContent = i === TOUR.length - 1 ? '시작하기' : '다음';
  }

  coach.hidden = false;
  $('coach-next').onclick = () => { i += 1; if (i >= TOUR.length) close(); else place(); };
  $('coach-skip').onclick = close;
  window.addEventListener('resize', place);
  place();
}

/* ---------------- 진입 ---------------- */

export function bootOpening() {
  initName();
  initTitle();
}
