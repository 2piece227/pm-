/**
 * 오프닝 시퀀스 — 타이틀 → 이름 → 소속사 → 튜토리얼 → 첫 유스 계약. (SPEC §3.10)
 *
 * 기존 관리 화면(오늘/트레이너/대회/시장/리그/소식)은 **하나도 안 건드린다.**
 * 여기서 새로 짜는 건 "진입 흐름"뿐이고, 끝나면 그 화면으로 넘겨준다 (§0.2).
 *
 * 개발자 모드: 이름 칸에 정해둔 문구를 넣으면 오프닝을 통째로 건너뛰고
 * 지금까지 만든 시뮬 화면으로 바로 들어간다. 숨겨진 진입점으로만 남긴다.
 */
import { createGame, playerAgency, signYouth } from '../engine/game.js';
import { PLAYER_AGENCY_CHOICES, createTrainer, STAT_KEYS } from '../data/agencies.js';
import { buildTeam } from '../engine/team-builder.js';
import { makeRng } from '../engine/run-battle.js';
import { YOUTH_CANDIDATES, youthStats } from '../data/youth-candidates.js';
import { OFFER_FIELDS, DEFAULT_OFFER, evaluateOffer, contractFrom } from '../engine/contract.js';
import { loadSave, writeSave, clearSave, hasResumable, saveSummary } from '../engine/save.js';
import { STAT_KO } from '../data/styles.js';
import { initGame } from './game-view.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();

/** 개발자 모드 암호 — 이 이름을 넣으면 시뮬 화면으로 직행한다 */
const DEV_NAME = '비통한비버통';

const state = {
  seed: null,
  playerName: '',
  agencyId: null,
  game: null,
  candidate: null,
  offer: { ...DEFAULT_OFFER },
};

/* ---------------- 화면 전환 ---------------- */

function show(page) {
  $('opening').hidden = false;
  document.querySelectorAll('.ov-page').forEach((el) => {
    el.classList.toggle('on', el.dataset.page === page);
  });
  writeSave({ stage: page });
  if (page === 'name') setTimeout(() => $('in-name')?.focus(), 30);
  if (page === 'scout') setTimeout(() => $('scout-q')?.focus(), 30);
}

function finishOpening() {
  $('opening').hidden = true;
  writeSave({ stage: 'playing' });
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
    if (!resumable) { start(); return; }   // 이어할 게 없으면 바로 이름 입력으로
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
  $('btn-newgame').onclick = () => { clearSave(); start(); };

  show('title');
}

function start() {
  state.seed = Date.now() & 0x7fffffff;
  $('in-name').value = '';
  $('name-msg').textContent = '';
  show('name');
}

/** 세이브에서 이어간다 — 리그는 시드로 똑같이 다시 만든다 */
function resume(save) {
  state.seed = save.seed ?? (Date.now() & 0x7fffffff);
  state.playerName = save.playerName || '';
  state.agencyId = save.agencyId || PLAYER_AGENCY_CHOICES[0].id;

  if (!save.agencyId) {
    $('in-name').value = state.playerName;
    renderAgencies();
    show('name');
    return;
  }

  buildGame();
  if (save.youth?.candidateId) {
    /* 계약까지 끝낸 세이브 — 그 트레이너를 다시 앉히고 바로 본편으로 */
    const cand = YOUTH_CANDIDATES.find((c) => c.id === save.youth.candidateId);
    if (cand) signCandidate(cand, save.youth.offer || DEFAULT_OFFER, { silent: true });
    launchGame();
    return;
  }
  launchGame({ thenScout: true });
}

/* ---------------- 2. 이름 ---------------- */

function initName() {
  const submit = () => {
    const raw = $('in-name').value.trim();
    if (!raw) { $('name-msg').textContent = '이름을 입력해주세요.'; return; }

    /* 숨겨진 진입점 — 지금까지 만든 시뮬 화면으로 직행 */
    if (raw === DEV_NAME) {
      $('name-msg').textContent = '개발자 모드로 들어갑니다.';
      finishOpening();
      initGame();
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
  $('btn-agency-ok').onclick = () => {
    const c = PLAYER_AGENCY_CHOICES.find((x) => x.id === state.agencyId);
    writeSave({ agencyId: state.agencyId, agencyName: c?.name });
    buildGame();
    launchGame({ thenTutorial: true });
  };
}

function buildGame() {
  state.game = createGame({
    seed: state.seed,
    playerName: state.playerName,
    agencyChoiceId: state.agencyId,
    startEmpty: true,      // §3.10 — 트레이너 0명으로 시작해 첫 계약으로 1명을 채운다
  });
}

/** 기존 관리 화면을 띄우고, 필요하면 그 위에 튜토리얼/스카우트를 얹는다 */
function launchGame({ thenTutorial = false, thenScout = false } = {}) {
  finishOpening();
  initGame({ game: state.game });
  if (thenTutorial) runTutorial(() => openScout());
  else if (thenScout) openScout();
}

/* ---------------- 4. 튜토리얼 ---------------- */

const TOUR = [
  {
    sel: '.tabs',
    title: '여기가 전부입니다',
    text: '하루하루 이 여섯 화면만 오가면 됩니다. 왼쪽부터 순서대로 훑어보죠.',
  },
  {
    sel: '[data-panel="today"]',
    title: '오늘',
    text: '트레이너마다 오늘 뭘 할지 정합니다. 훈련하면 늘지만 컨디션이 깎이고, 쉬면 회복됩니다.',
  },
  {
    sel: '#btn-day',
    title: '다음 날',
    text: '시간은 이 버튼으로만 흐릅니다. 누르는 순간 다른 소속사들도 같이 하루를 씁니다.',
  },
  {
    sel: '[data-tab="tour"]',
    title: '대회',
    text: '등급별로 며칠 간격으로 열립니다. 컨디션이 모자라면 출전 자체가 안 됩니다.',
  },
  {
    sel: '[data-tab="market"]',
    title: '시장',
    text: '트레이너를 찾고 계약을 겁니다. 다만 첫 트레이너가 뱃지 8개를 모을 때까지는 잠겨 있습니다.',
  },
  {
    sel: '[data-tab="league"]',
    title: '리그 · 소식',
    text: '순위와 다른 소속사 동향은 여기서 봅니다. 이제 첫 트레이너를 데려오죠.',
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
    const r = el
      ? el.getBoundingClientRect()
      : { top: 80, left: 20, width: 200, height: 40, bottom: 120 };
    const pad = 6;
    hole.style.top = `${r.top - pad}px`;
    hole.style.left = `${r.left - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;

    /* 말풍선은 대상 아래에 두되, 화면 밖으로 나가면 위로 붙인다 */
    const below = r.bottom + 14;
    const fits = below + 150 < window.innerHeight;
    box.style.top = fits ? `${below}px` : `${Math.max(12, r.top - 165)}px`;
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

/* ---------------- 5. 첫 유스 계약 ---------------- */

function openScout() {
  state.candidate = null;
  state.offer = { ...DEFAULT_OFFER };
  const a = playerAgency(state.game);
  $('scout-sub').innerHTML =
    '로스터는 한 명으로 시작합니다. 조건을 걸고 협상하세요. '
    + `<b>자금 ${won(a.funds)}</b> · 평판 ${a.reputation}`;
  $('scout-q').value = '';
  $('scout-q').oninput = renderCandidates;
  renderCandidates();
  renderOffer();
  show('scout');
}

function candidatePool() {
  const q = ($('scout-q').value || '').trim();
  if (!q) return YOUTH_CANDIDATES;
  return YOUTH_CANDIDATES.filter((c) => c.name.includes(q));
}

/** 잠재력을 수치 대신 막대로 — 정확한 값은 숨김값이다 (§4.3) */
function paBar(v) {
  const n = Math.max(1, Math.min(5, Math.round(v / 4)));
  return pips(n);
}

function renderCandidates() {
  const list = candidatePool();
  $('cand-list').innerHTML = list.length
    ? list.map((c) => `
      <button class="cand${state.candidate?.id === c.id ? ' on' : ''}" data-id="${c.id}">
        <div><b>${esc(c.name)}</b>${c.tag ? `<span class="tagn">${esc(c.tag)}</span>` : ''}</div>
        <div class="note" style="margin:3px 0 6px">${esc(c.blurb)}</div>
        ${STAT_KEYS.map((k) => `<div class="gauge"><span>${STAT_KO[k]}</span>${paBar(c.potential[k])}</div>`).join('')}
      </button>`).join('')
    : '<div class="note">검색 결과가 없습니다.</div>';

  $('cand-list').querySelectorAll('.cand').forEach((btn) => {
    btn.onclick = () => {
      state.candidate = YOUTH_CANDIDATES.find((c) => c.id === btn.dataset.id);
      state.offer = { ...DEFAULT_OFFER };
      renderCandidates();
      renderOffer();
    };
  });
}

function renderOffer() {
  const box = $('offer-box');
  const c = state.candidate;
  if (!c) {
    box.innerHTML = '<div class="panel"><div class="note">후보를 고르면 계약 조건을 짤 수 있습니다.'
      + '<br>막대는 <b>최대치(잠재력)</b>입니다 — 지금 실력이 아닙니다.</div></div>';
    return;
  }

  const a = playerAgency(state.game);
  const res = evaluateOffer(c, state.offer, a);

  box.innerHTML = `
    <div class="panel">
      <div class="panel-t">${esc(c.name)}에게 제시할 조건</div>
      <div class="terms">
        ${OFFER_FIELDS.map((f) => `
          <div class="term">
            <label title="${esc(f.hint)}">${f.label}<span class="u">${f.unit}</span></label>
            <input type="number" data-k="${f.key}" value="${state.offer[f.key]}"
                   min="${f.min}" max="${f.max}" step="${f.step}">
          </div>`).join('')}
      </div>
      <div class="verdict ${res.accept ? 'yes' : 'no'}">
        <b>${res.accept ? '계약하겠습니다' : '이 조건이면 부족합니다'}</b>
        ${res.reasons.map((r) => esc(r)).join('<br>')}
      </div>
      <div class="note" style="margin-top:6px">
        계약 시 즉시 ${won(state.offer.signing)} 지급 · 이후 주급 ${state.offer.wage}
      </div>
      <div class="ov-row">
        <button class="ghost" id="btn-offer-reset">조건 초기화</button>
        <button id="btn-offer-send" ${res.accept ? '' : 'disabled'}>계약 체결</button>
      </div>
    </div>`;

  box.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.oninput = () => {
      const f = OFFER_FIELDS.find((x) => x.key === inp.dataset.k);
      const v = Number(inp.value);
      state.offer[f.key] = Number.isFinite(v) ? Math.max(f.min, Math.min(f.max, v)) : f.min;
      renderOffer();
      /* 다시 그리면 포커스가 날아간다 — 같은 칸으로 되돌려준다.
         (number 입력은 setSelectionRange를 못 쓴다) */
      box.querySelector(`input[data-k="${f.key}"]`)?.focus();
    };
  });

  $('btn-offer-reset').onclick = () => { state.offer = { ...DEFAULT_OFFER }; renderOffer(); };
  $('btn-offer-send').onclick = () => {
    signCandidate(c, state.offer);
    writeSave({ youth: { candidateId: c.id, name: c.name, offer: { ...state.offer } } });
    finishOpening();
    initGame({ game: state.game });
  };
}

/** 협상이 끝난 후보를 실제 트레이너로 만들어 로스터에 넣는다 */
function signCandidate(cand, offer, { silent = false } = {}) {
  const rng = makeRng((state.seed ^ 0x9e37) >>> 0);
  const t = createTrainer({
    id: `y-${cand.id}`,
    name: cand.name,
    agencyId: playerAgency(state.game).id,
    stats: youthStats(cand),
    potential: { ...cand.potential },
    team: buildTeam(rng, 'modern'),
  });
  t.badges = [];
  t.isYouth = true;
  signYouth(state.game, t, contractFrom(offer, state.game.day));
  if (!silent) state.game.log.unshift({ day: state.game.day, text: `${cand.name} 계약 — 유스` });
  return t;
}

/* ---------------- 진입 ---------------- */

export function bootOpening() {
  initName();
  initTitle();
}
