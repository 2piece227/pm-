/**
 * 게임 UI — 플레이어가 하루하루 소속사를 굴리는 화면.
 *
 * 배틀 시뮬 탭은 삭제됐다. 여기 있는 건 전부 "내가 결정하는" 화면이고,
 * 배틀은 내 트레이너가 뛴 경기를 관전할 때만 나온다.
 */
import {
  createGame, advanceDay, assignAction, availableActions, playerAgency, playerRoster,
  tournamentOn, upcomingTournaments, dailyUpkeep, trainerRating, placementOf,
  refreshMarket, signTrainer, releaseTrainer, marketFeeFor,
  findTrainer, findAgency, allTrainers, GAME_CONFIG, ACTION_LABELS,
} from '../engine/game.js';
import { standings, replayMatch } from '../engine/league.js';
import { STAT_KEYS, displayStats } from '../data/agencies.js';
import { STAT_KO } from '../data/styles.js';
import { teamSpecies } from '../engine/team-builder.js';
import { SPECIES_KO, ko } from '../data/ko.js';
import { playBattleLog, resetScene, say, setSpeedSource, stopPlayback } from './battle-view.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => Math.round(n).toLocaleString();

let game = null;
let selectedTournamentId = null;
let watching = false;

/* ---------------- 공통 표시 ---------------- */

const condColor = (c) => (c > 60 ? 'var(--hp-hi)' : c > 30 ? 'var(--hp-md)' : 'var(--hp-lo)');

/** 잠재력은 숨김값이라 정확한 수치 대신 "성장 여지"만 별로 보여준다 (SPEC §4.3) */
function potentialStars(t) {
  const gap = STAT_KEYS.reduce((n, k) => n + Math.max(0, (t.potential?.[k] ?? 0) - t.stats[k]), 0);
  const n = Math.max(0, Math.min(5, Math.round(gap / 3)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function actionLabelOf(id) {
  if (!id) return '미배정';
  if (id.startsWith('enter:')) return '대회 출전';
  return ACTION_LABELS[id] || id;
}

/* ---------------- 헤더 ---------------- */

function renderHeader() {
  const a = playerAgency(game);
  const upkeep = dailyUpkeep(game);
  $('hd-agency').textContent = `${a.name}`;
  $('hd-concept').textContent = `${a.tierLabel} · ${a.concept}`;
  $('hd-stats').innerHTML =
    `<span>날짜 <b>${game.day}일차</b></span>` +
    `<span>자금 <b class="${a.funds < upkeep * 5 ? 'neg' : ''}">${won(a.funds)}</b></span>` +
    `<span>일일 경비 <b>-${upkeep}</b></span>` +
    `<span>평판 <b>${Math.round(a.reputation)}</b></span>` +
    `<span>트레이너 <b>${a.roster.length}</b>명</span>`;

  if (game.gameOver) {
    $('gameover').style.display = '';
    $('gameover-msg').textContent = `${game.gameOver.day}일차 — ${game.gameOver.reason}`;
    $('btn-day').disabled = true;
  }
}

/* ---------------- 오늘 탭 ---------------- */

function renderToday() {
  const tier = tournamentOn(game.day);
  const up = upcomingTournaments(game, 9);

  $('today-sched').innerHTML = tier
    ? `<div class="dayrep"><span class="big">오늘 ${esc(tier.label)} 컵이 열린다.</span><br>` +
      `출전 자격 레이팅 ${tier.ratingBand[0]}~${tier.ratingBand[1] === 999 ? '∞' : tier.ratingBand[1]} · ` +
      `참가비 ${tier.entryCost} · 우승 상금 ${tier.prize.champion.money} (평판 +${tier.prize.champion.reputation})<br>` +
      `<span class="sub">내보낼 트레이너는 아래에서 "출전"을 골라주세요. 컨디션 ${GAME_CONFIG.condition.minToEnter} 이상만 가능.</span></div>`
    : `<div class="dayrep">오늘은 대회가 없다. 훈련이나 휴식을 배정하자.<br>` +
      `<span class="sub">다음 대회: ${up.length ? up.map((u) => `${u.day}일차 ${u.tier.label}`).join(' · ') : '없음'}</span></div>`;

  $('today-cards').innerHTML = playerRoster(game)
    .map((t) => {
      const opts = availableActions(game, t);
      const cur = game.actions[t.id] || 'rest';
      const ds = displayStats(t);
      return (
        `<div class="tc">` +
        `<div class="tc-h"><b>${esc(t.name)}</b>` +
        `<span class="pill">레이팅 ${trainerRating(t).toFixed(1)}</span></div>` +
        `<div class="rep-line"><span>컨디션 ${Math.round(t.condition)}</span>` +
        `<span class="stars">${potentialStars(t)}</span>` +
        `<span>${t.record.wins}승 ${t.record.losses}패</span>` +
        `<span>급여 ${t.salary}</span></div>` +
        `<div class="cond"><i style="width:${t.condition}%;background:${condColor(t.condition)}"></i></div>` +
        `<div class="note">${STAT_KEYS.map((k) => `${STAT_KO[k]} ${ds[k]}`).join(' · ')}</div>` +
        `<select data-trainer="${t.id}">` +
        opts
          .map(
            (o) =>
              `<option value="${o.id}"${o.id === cur ? ' selected' : ''}${o.disabled ? ' disabled' : ''}>` +
              `${esc(o.label)} — ${esc(o.hint)}</option>`
          )
          .join('') +
        `</select></div>`
      );
    })
    .join('');

  $('today-cards').querySelectorAll('select[data-trainer]').forEach((sel) => {
    sel.onchange = () => assignAction(game, sel.dataset.trainer, sel.value);
  });

  renderReport();
}

function renderReport() {
  const r = game.lastReport;
  if (!r) {
    $('today-report').innerHTML = '<div class="note">아직 하루도 지나지 않았습니다. [다음 날]을 눌러보세요.</div>';
    return;
  }
  const bits = [];
  bits.push(`<span class="big">${r.day}일차 결과</span>`);
  if (r.tournament) {
    bits.push(`${esc(r.tournament.tierLabel)} 컵 — 참가 ${r.tournament.entrants.length}명`);
    if (r.myResults.length) {
      bits.push(
        '내 트레이너: ' +
          r.myResults.map((m) => `<b>${esc(m.name)}</b> ${esc(m.placement)}`).join(' · ')
      );
    } else {
      bits.push('<span class="sub">내 트레이너는 출전하지 않았다.</span>');
    }
  }
  if (r.trained.length) {
    bits.push(
      '훈련: ' + r.trained.map((t) => `${esc(t.name)}(${STAT_KO[t.key]} +${t.gain.toFixed(2)})`).join(', ')
    );
  }
  if (r.rested.length) bits.push(`<span class="sub">휴식: ${r.rested.map(esc).join(', ')}</span>`);
  bits.push(
    `수지: 대회 ${r.prize >= 0 ? '+' : ''}${won(r.prize)} · 경비 -${won(r.upkeep)} · ` +
      `<b class="${r.net < 0 ? 'neg' : ''}">순 ${r.net >= 0 ? '+' : ''}${won(r.net)}</b>`
  );
  for (const n of r.news) bits.push(`<span class="sub">📰 ${esc(n.text)}</span>`);

  $('today-report').innerHTML = `<div class="dayrep">${bits.join('<br>')}</div>`;
}

/* ---------------- 트레이너 탭 ---------------- */

function renderRoster() {
  const rows = playerRoster(game)
    .map((t) => {
      const ds = displayStats(t);
      const mons = teamSpecies(t.team).map((s) => ko(SPECIES_KO, s)).join(', ');
      return (
        `<tr><td><b>${esc(t.name)}</b><br><span class="sub">${actionLabelOf(t.lastAction)}</span></td>` +
        `<td class="n">${trainerRating(t).toFixed(1)}</td>` +
        `<td><span class="stars">${potentialStars(t)}</span></td>` +
        `<td class="n">${Math.round(t.condition)}</td>` +
        `<td class="n"><span class="sub">${STAT_KEYS.map((k) => ds[k]).join('/')}</span></td>` +
        `<td class="n">${t.record.titles}</td>` +
        `<td class="n">${t.record.wins}-${t.record.losses}</td>` +
        `<td class="n">${t.salary}</td>` +
        `<td><span class="sub">${esc(mons)}</span></td></tr>`
      );
    })
    .join('');

  $('roster-body').innerHTML =
    '<table><tr><th>트레이너</th><th>레이팅</th><th>성장여지</th><th>컨디션</th>' +
    `<th>${STAT_KEYS.map((k) => STAT_KO[k][0]).join('/')}</th><th>우승</th><th>승-패</th><th>급여</th><th>파티</th></tr>` +
    rows + '</table>' +
    '<div class="note" style="margin-top:6px">성장여지는 잠재력(숨김값)까지 남은 폭이다. ★가 많을수록 더 클 수 있는 선수.</div>';
}

/* ---------------- 대회 탭 ---------------- */

function renderTournaments() {
  const up = upcomingTournaments(game, 15);
  $('tour-upcoming').innerHTML = up.length
    ? '<table><tr><th>날짜</th><th>등급</th><th>자격 레이팅</th><th>우승 상금</th><th>참가비</th></tr>' +
      up
        .map(
          (u) =>
            `<tr><td>${u.day}일차 ${u.daysAway === 0 ? '<b>(오늘)</b>' : `<span class="sub">(${u.daysAway}일 후)</span>`}</td>` +
            `<td>${esc(u.tier.label)}</td>` +
            `<td class="n"><span class="sub">${u.tier.ratingBand[0]}~${u.tier.ratingBand[1] === 999 ? '∞' : u.tier.ratingBand[1]}</span></td>` +
            `<td class="n">${u.tier.prize.champion.money}</td>` +
            `<td class="n">${u.tier.entryCost}</td></tr>`
        )
        .join('') + '</table>'
    : '<div class="note">예정된 대회가 없습니다.</div>';

  const recent = game.league.tournaments.slice(-10).reverse();
  const myIds = new Set(playerRoster(game).map((t) => t.id));
  $('tour-list').innerHTML = recent.length
    ? '<table><tr><th>날짜</th><th>등급</th><th>우승</th></tr>' +
      recent
        .map((t) => {
          const champ = findTrainer(game.league, t.result?.championId);
          const ag = champ ? findAgency(game.league, champ.agencyId) : null;
          const mine = t.entrants.some((e) => myIds.has(e.trainerId));
          return (
            `<tr class="lg-row${t.id === selectedTournamentId ? ' on' : ''}" data-tour="${t.id}">` +
            `<td>${t.day || ''}일${mine ? ' <b style="color:var(--gold)">●</b>' : ''}</td>` +
            `<td>${esc(t.tierLabel)}</td>` +
            `<td>${champ ? esc(champ.name) + ` <span class="sub">${esc(ag.name)}</span>` : '<span class="sub">유찰</span>'}</td></tr>`
          );
        })
        .join('') + '</table>' +
      '<div class="note" style="margin-top:6px">● = 내 트레이너 출전. 대회를 클릭하면 경기 목록.</div>'
    : '<div class="note">아직 열린 대회가 없습니다.</div>';

  $('tour-list').querySelectorAll('.lg-row').forEach((tr) => {
    tr.onclick = () => { selectedTournamentId = tr.dataset.tour; renderTournaments(); };
  });

  renderMatches();
}

function renderMatches() {
  const t = game.league.tournaments.find((x) => x.id === selectedTournamentId);
  if (!t) { $('tour-matches').innerHTML = ''; return; }
  const myIds = new Set(playerRoster(game).map((x) => x.id));

  const rows = t.matches
    .map((m, i) => {
      const a = findTrainer(game.league, m.aId);
      const b = findTrainer(game.league, m.bId);
      const mine = myIds.has(m.aId) || myIds.has(m.bId);
      const nm = (x, w) =>
        `<span style="${w ? 'font-weight:800' : 'opacity:.65'}${myIds.has(x?.id) ? ';color:var(--gold)' : ''}">${esc(x?.name || '?')}</span>`;
      return (
        `<tr><td><span class="sub">${esc(m.roundLabel)}</span></td>` +
        `<td>${nm(a, m.winnerId === m.aId)} vs ${nm(b, m.winnerId === m.bId)}</td>` +
        `<td><button class="ghost watch-btn" data-i="${i}" style="padding:3px 9px;font-size:11px">${mine ? '관전' : '보기'}</button></td></tr>`
      );
    })
    .join('');

  $('tour-matches').innerHTML =
    `<div style="font-weight:800;margin:0 0 4px">${esc(t.name)}</div>` +
    '<table><tr><th>라운드</th><th>대진</th><th></th></tr>' + rows + '</table>';

  $('tour-matches').querySelectorAll('.watch-btn').forEach((btn) => {
    btn.onclick = () => watchMatch(t, Number(btn.dataset.i));
  });
}

async function watchMatch(tournament, index) {
  if (watching) return;
  watching = true;
  const m = tournament.matches[index];
  const a = findTrainer(game.league, m.aId);
  const b = findTrainer(game.league, m.bId);

  $('watch-panel').style.display = '';
  $('watch-title').textContent = `${tournament.name} ${m.roundLabel} — ${a.name} vs ${b.name}`;
  resetScene();
  $('watch-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* 경기 시점의 스냅샷으로 재생한다 — 지금 상태로 다시 돌리면 브래킷과 다른 승자가 나온다 */
  const replay = replayMatch(m);
  await playBattleLog(replay.log, { p1: a.name, p2: b.name });
  const w = findTrainer(game.league, replay.winnerId);
  say(`▶ ${w ? w.name : '무승부'} 승리! (${replay.turns}턴)`);
  watching = false;
}

/* ---------------- 시장 탭 ---------------- */

function renderMarket() {
  const a = playerAgency(game);
  $('market-body').innerHTML = game.market.length
    ? game.market
        .map((entry, i) => {
          const t = entry.trainer;
          const ds = displayStats(t);
          const afford = a.funds >= entry.fee;
          return (
            `<div class="tc">` +
            `<div class="tc-h"><b>${esc(t.name)}</b><span class="pill">레이팅 ${trainerRating(t).toFixed(1)}</span></div>` +
            `<div class="rep-line"><span class="stars">${potentialStars(t)}</span><span>급여 ${t.salary}/일</span></div>` +
            `<div class="note">${STAT_KEYS.map((k) => `${STAT_KO[k]} ${ds[k]}`).join(' · ')}</div>` +
            `<div class="note">${esc(teamSpecies(t.team).map((s) => ko(SPECIES_KO, s)).join(', '))}</div>` +
            `<button class="sign-btn" data-i="${i}" ${afford ? '' : 'disabled'} style="margin-top:7px;width:100%">` +
            `영입 — 이적료 ${won(entry.fee)}${afford ? '' : ' (자금 부족)'}</button>` +
            `</div>`
          );
        })
        .join('')
    : '<div class="note">매물이 없습니다.</div>';

  $('market-body').querySelectorAll('.sign-btn').forEach((btn) => {
    btn.onclick = () => {
      const res = signTrainer(game, Number(btn.dataset.i));
      if (!res.ok) { alert(res.msg); return; }
      renderAll();
    };
  });

  $('release-body').innerHTML =
    '<table><tr><th>트레이너</th><th>레이팅</th><th>급여</th><th></th></tr>' +
    playerRoster(game)
      .map(
        (t) =>
          `<tr><td>${esc(t.name)}</td><td class="n">${trainerRating(t).toFixed(1)}</td>` +
          `<td class="n">${t.salary}/일</td>` +
          `<td><button class="ghost rel-btn" data-id="${t.id}" style="padding:3px 9px;font-size:11px">방출</button></td></tr>`
      )
      .join('') + '</table>' +
    '<div class="note" style="margin-top:6px">방출하면 일일 경비는 줄지만 이적료는 돌아오지 않는다.</div>';

  $('release-body').querySelectorAll('.rel-btn').forEach((btn) => {
    btn.onclick = () => {
      const t = playerRoster(game).find((x) => x.id === btn.dataset.id);
      if (!confirm(`${t.name}을(를) 방출할까요? 되돌릴 수 없습니다.`)) return;
      const res = releaseTrainer(game, btn.dataset.id);
      if (!res.ok) { alert(res.msg); return; }
      renderAll();
    };
  });
}

/* ---------------- 리그 / 소식 ---------------- */

function renderLeague() {
  const rows = standings(game.league)
    .map(
      (s, i) =>
        `<tr${s.isPlayer ? ' style="background:var(--panel2)"' : ''}>` +
        `<td class="n">${i + 1}</td>` +
        `<td>${esc(s.name)}${s.isPlayer ? ' <b style="color:var(--gold)">★</b>' : ''}</td>` +
        `<td><span class="sub">${esc(s.tierLabel)}</span></td>` +
        `<td class="n">${s.reputation}</td>` +
        `<td class="n">${s.titles}</td>` +
        `<td class="n">${s.wins}-${s.losses}</td>` +
        `<td class="n">${s.rosterSize}</td></tr>`
    )
    .join('');
  $('league-body').innerHTML =
    '<table><tr><th>#</th><th>소속사</th><th>등급</th><th>평판</th><th>우승</th><th>승-패</th><th>인원</th></tr>' +
    rows + '</table>' +
    '<div class="note" style="margin-top:6px">NPC 소속사도 내가 안 볼 때 계속 대회에 나가고 성장한다.</div>';
}

function renderNews() {
  const items = game.league.newsFeed.slice(0, 30);
  $('news-body').innerHTML = items.length
    ? items.map((n) => `<div><span class="sub">${n.day ? `${n.day}일차` : ''}</span> ${esc(n.text)}</div>`).join('')
    : '<div class="note">아직 소식이 없습니다.</div>';
}

/* ---------------- 진행 ---------------- */

function renderAll() {
  renderHeader();
  renderToday();
  renderRoster();
  renderTournaments();
  renderMarket();
  renderLeague();
  renderNews();
}

function nextDay() {
  if (game.gameOver) return;
  const r = advanceDay(game);
  renderAll();

  /* 내 트레이너가 뛴 대회면 대회 탭을 자동으로 열어준다 */
  if (r.tournament && r.myResults.length) {
    selectedTournamentId = r.tournament.id;
    renderTournaments();
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach((btn) => {
    btn.onclick = () => {
      tabs.forEach((b) => b.classList.toggle('on', b === btn));
      document.querySelectorAll('[data-panel]').forEach((p) => {
        p.style.display = p.dataset.panel === btn.dataset.tab ? '' : 'none';
      });
    };
  });
}

export function initGame() {
  game = createGame({ seed: 20260905 });
  initTabs();
  $('btn-day').onclick = nextDay;
  $('watch-close').onclick = () => {
    stopPlayback();
    watching = false;
    $('watch-panel').style.display = 'none';
  };

  /* 배속은 값을 읽어가는 함수로 넘긴다 — 재생 도중에 바꿔도 즉시 반영된다 */
  setSpeedSource(() => Number($('speed').value));
  renderAll();
  /* 디버그용 — 콘솔에서 상태를 들여다볼 수 있게 */
  window.__game = game;
}
