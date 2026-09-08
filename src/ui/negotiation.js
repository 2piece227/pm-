/**
 * 계약 협상 — **FM처럼 대화로 주고받는다.** (§5.3 유스 계약)
 *
 * 폼에 숫자 넣고 버튼 누르면 즉시 판정이 뜨는 방식은 협상이 아니라 계산기다.
 * FM은 조건을 걸면 에이전트가 말로 대답하고, 그 대답을 보고 다시 고친다.
 * 여기서도 왼쪽에서 조건을 짜고 [제안하기]를 누르면 **대화창에 한 턴씩 쌓인다.**
 *
 * 판정 자체는 engine/contract.js가 한다 — 이 파일은 그걸 말로 옮기는 층이다.
 */
import { OFFER_FIELDS, DEFAULT_OFFER, evaluateOffer, contractFrom } from '../engine/contract.js';
import { YOUTH_CANDIDATES } from '../data/youth-candidates.js';
import { playerAgency, signYouth } from '../engine/game.js';
import { createTrainer, STAT_KEYS } from '../data/agencies.js';
import { makeStarterParty } from '../engine/team-builder.js';
import { makeRng } from '../engine/run-battle.js';
import { youthStats } from '../data/youth-candidates.js';
import { STAT_KO } from '../data/styles.js';
import { STARTERS } from '../data/species-pool.js';
import { ko, SPECIES_KO, gwaWa, eulReul } from '../data/ko.js';
import { writeSave } from '../engine/save.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();

let root = null;
let game = null;
let onDone = null;

const state = {
  candidate: null,
  offer: { ...DEFAULT_OFFER },
  starter: STARTERS[0].species,
  chat: [],      // { who: 'me'|'them'|'sys', text }
  signed: false,
};

const pips = (n) =>
  `<span class="pips">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('')}</span>`;

/** 잠재력은 숨김값이라 막대로만 (§4.3) */
const paBar = (v) => pips(Math.max(1, Math.min(5, Math.round(v / 4))));

/* ---------------- 대화 ---------------- */

function sayTo(who, text) {
  state.chat.push({ who, text });
}

/** 지금 제시안을 사람 말로 옮긴다 — FM이 "주급 X, 계약 Y년으로 제안했습니다"라고 적는 것과 같다 */
function offerSentence(o) {
  const bits = [`주급 ${o.wage}`];
  if (o.signing) bits.push(`영입 개런티 ${won(o.signing)}`);
  if (o.proRaise > 100) bits.push(`프로 승급 시 급여 ${o.proRaise}%`);
  if (o.badgeBonus) bits.push(`뱃지당 ${won(o.badgeBonus)}`);
  bits.push(`${o.years}년 계약`);
  return `${bits.join(', ')}으로 제안드립니다.`;
}

function openCandidate(cand) {
  state.candidate = cand;
  state.offer = { ...DEFAULT_OFFER };
  state.signed = false;
  state.chat = [];
  sayTo('sys', `${gwaWa(cand.name)}의 협상 자리`);
  sayTo('them', `${cand.blurb} 조건부터 들어보죠.`);
}

/* ---------------- 그리기 ---------------- */

function view() {
  const a = playerAgency(game);
  const c = state.candidate;

  const list = YOUTH_CANDIDATES.map((x) => `
    <button class="card ${state.candidate?.id === x.id ? 'sel' : ''}" data-c="${x.id}" style="text-align:left">
      <h3>${esc(x.name)}${x.tag ? ` <span class="note">${esc(x.tag)}</span>` : ''}</h3>
      <div class="note" style="margin-bottom:6px">${esc(x.blurb)}</div>
      ${STAT_KEYS.map((k) => `<div class="gauge"><span>${STAT_KO[k]}</span>${paBar(x.potential[k])}</div>`).join('')}
    </button>`).join('');

  if (!c) {
    return `<div class="note" style="margin-bottom:10px">자금 <b>${won(a.funds)}</b> · 평판 ${a.reputation}
      — 후보를 고르면 협상 자리가 열립니다. 막대는 <b>최대치</b>이지 지금 실력이 아닙니다.</div>
      <div class="cards">${list}</div>`;
  }

  return `
    <div class="note" style="margin-bottom:10px">자금 <b>${won(a.funds)}</b> · 평판 ${a.reputation}</div>
    <div class="nego">
      <div>
        <div class="card">
          <h3>계약 조건</h3>
          <div class="terms">
            ${OFFER_FIELDS.map((f) => `
              <div class="term">
                <label title="${esc(f.hint)}">${f.label}<span class="u">${f.unit}</span></label>
                <input type="number" data-k="${f.key}" value="${state.offer[f.key]}"
                       min="${f.min}" max="${f.max}" step="${f.step}" ${state.signed ? 'disabled' : ''}>
              </div>`).join('')}
          </div>
          <div class="term" style="margin-top:8px">
            <label>첫 포켓몬</label>
            <select id="nego-starter" ${state.signed ? 'disabled' : ''} style="font-size:12px;padding:4px">
              ${STARTERS.map((s) => `<option value="${s.species}" ${state.starter === s.species ? 'selected' : ''}>${s.ko}</option>`).join('')}
            </select>
          </div>
          <div class="note" style="margin-top:6px">레벨 5부터 직접 키웁니다.</div>
          <div class="ov-row">
            <button class="ghost" id="nego-back">후보 목록</button>
            <button id="nego-send" ${state.signed ? 'disabled' : ''}>제안하기</button>
          </div>
        </div>
      </div>
      <div class="chat" id="nego-chat">
        ${state.chat.map((l) => `
          <div class="line ${l.who === 'me' ? 'me' : l.who === 'sys' ? 'sys' : ''}">
            ${l.who === 'sys' ? '' : `<div class="who">${l.who === 'me' ? '나' : esc(c.name)}</div>`}
            <div class="bub">${esc(l.text).replace(/\n/g, '<br>')}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function draw() {
  root.innerHTML = view();
  const chat = document.getElementById('nego-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;

  root.querySelectorAll('button[data-c]').forEach((b) => {
    b.onclick = () => { openCandidate(YOUTH_CANDIDATES.find((x) => x.id === b.dataset.c)); draw(); };
  });

  root.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.onchange = () => {
      const f = OFFER_FIELDS.find((x) => x.key === inp.dataset.k);
      const v = Number(inp.value);
      state.offer[f.key] = Number.isFinite(v) ? Math.max(f.min, Math.min(f.max, v)) : f.min;
      inp.value = state.offer[f.key];
    };
  });

  const st = document.getElementById('nego-starter');
  if (st) st.onchange = () => { state.starter = st.value; };

  const back = document.getElementById('nego-back');
  if (back) back.onclick = () => { state.candidate = null; draw(); };

  const send = document.getElementById('nego-send');
  if (send) send.onclick = () => propose();
}

/* ---------------- 한 턴 주고받기 ---------------- */

function propose() {
  const c = state.candidate;
  const a = playerAgency(game);
  const res = evaluateOffer(c, state.offer, a);

  sayTo('me', offerSentence(state.offer));
  for (const r of res.reasons) sayTo('them', r);

  if (!res.accept) { draw(); return; }

  /* 성사 — 실제 트레이너를 만들어 로스터에 넣는다. 세이브에도 남긴다 */
  const t = signCandidate(c);
  state.signed = true;
  writeSave({ youth: { candidateId: c.id, name: c.name, offer: { ...state.offer }, starter: state.starter } });
  sayTo('sys', `계약 성사 — ${c.name}`);
  t.then(() => {
    sayTo('sys', `첫 포켓몬으로 ${eulReul(ko(SPECIES_KO, state.starter))} 받았습니다. 이제 맵에서 어디로 보낼지 정하세요.`);
    draw();
    setTimeout(() => onDone?.(), 900);
  });
  draw();
}

async function signCandidate(cand, offer = state.offer, starter = state.starter, g = game) {
  const rng = makeRng((g.seed ^ 0x9e37) >>> 0);
  const t = createTrainer({
    id: `y-${cand.id}`,
    name: cand.name,
    agencyId: playerAgency(g).id,
    stats: youthStats(cand),
    potential: { ...cand.potential },
    party: await makeStarterParty(rng, starter),
  });
  t.badges = [];
  t.isYouth = true;
  signYouth(g, t, contractFrom(offer, g.day));
  return t;
}

/** 이어하기 — 세이브에 적힌 계약을 다시 앉힌다 */
export async function restoreYouth(g, saved) {
  const cand = YOUTH_CANDIDATES.find((c) => c.id === saved?.candidateId);
  if (!cand) return null;
  return signCandidate(cand, saved.offer || DEFAULT_OFFER, saved.starter || STARTERS[0].species, g);
}

/* ---------------- 진입 ---------------- */

/** 스카우팅 화면 안에 협상 자리를 연다 */
export function openNegotiation(el, g, done) {
  root = el;
  game = g;
  onDone = done;
  if (!state.candidate) { state.chat = []; }
  draw();
}

/** 오프닝에서 첫 계약을 열 때 — 상태를 새로 시작한다 */
export function resetNegotiation() {
  state.candidate = null;
  state.offer = { ...DEFAULT_OFFER };
  state.chat = [];
  state.signed = false;
}
