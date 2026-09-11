/**
 * 게임 루프 — 플레이어가 하루하루 소속사를 굴린다. (SPEC §2 코어 루프의 [하루 단위])
 *
 * 이전 버전은 "리그가 알아서 돌아가는 걸 구경하는" 물건이었다. 여기서 바뀌는 핵심은
 * **시간이 플레이어의 [다음 날] 클릭으로만 흐른다**는 것. NPC 세계는 그 사이에 같이 움직인다(§0.1-4).
 *
 * 결정이 의미를 갖게 하는 축 3개:
 *   1. 컨디션 — 대회는 크게 깎이고 휴식으로만 찬다. 에이스를 매번 못 굴린다.
 *   2. 자금   — 일일 경비가 계속 나간다. 안 벌면 말라죽는다.
 *   3. 성장   — 훈련시키면 강해지지만 그날 대회엔 못 나간다 (단기 vs 장기).
 */
import { makeRng } from './run-battle.js';
import {
  createLeague, decideEntrants, findAgency, findTrainer, openTournament, runTournament,
  trainerRating, allTrainers, makeTrainerFor, salaryFor, isEligible,
  LOCAL_TOURNAMENT_TIERS,
} from './league.js';
import { STAT_KEYS } from '../data/agencies.js';
import { gainExp } from '../data/pokemon.js';
import { explore } from './explore.js';
import { healParty } from './field-state.js';
import { tickTraining, MANAGEMENT } from './pokemon-management.js';
import { challengeGym } from './gyms.js';
import { gymById } from '../data/gyms.js';
import { badgeProgress } from './gym-progress.js';
import { locationById } from '../data/routes.js';
import { SPECIES_KO, ko, iGa } from '../data/ko.js';

export const GAME_CONFIG = {
  // 대회 설계를 다시 정할 때까지 실제 플레이에서는 개최/참가하지 않는다.
  tournamentsEnabled: false,
  /* 대회 일정 — 등급마다 7일 주기, 요일을 어긋나게 둬서 매주 세 번 기회가 온다 */
  schedule: { rookie: 3, open: 5, elite: 7 },
  scheduleCycle: 7,

  /* 컨디션 수지 */
  condition: {
    tournament: -30,  // 대회 하루는 크게 깎인다
    train: -9,
    rest: +32,
    idle: +14,        // 아무것도 안 시키면 그냥 쉰 걸로 친다
    minToEnter: 35,   // 이 아래면 대회 출전 불가
  },

  /* 성장 (§4.3) — 성장량 = 기본률 × (PA − CA) × 컨디션계수 × 만족도계수 */
  growth: {
    trainRate: 0.10,   // 지정 훈련한 스탯
    battleRate: 0.02,  // 배틀은 전 스탯에 소량
    trainExp: 900,     // 훈련한 날 파티가 받는 경험치
    battleExp: 2600,   // 대회를 뛴 날
  },

  /* 포켓몬 경험치 (§6.2) — 훈련보다 실전이 훨씬 크다 */
  monExp: { train: 900, battle: 2600 },

  market: {
    refreshDays: 7,
    size: 4,
    /* 이적료 = 레이팅^2 × 계수. 강한 트레이너는 확 비싸진다 */
    feeCoef: 2.2,
  },

  startDay: 1,
};

/* ---------------- 게임 생성 ---------------- */

export async function createGame({
  seed = Date.now() & 0x7fffffff,
  playerName = null,
  agencyChoiceId = null,
  startEmpty = false,   // 오프닝을 거치면 로스터를 비운 채 시작한다 (§3.10)
} = {}) {
  const league = await createLeague({ seed, playerAgencyId: agencyChoiceId });
  const player = league.agencies.find((a) => a.isPlayer);
  if (startEmpty) player.roster = [];

  const game = {
    seed,
    day: GAME_CONFIG.startDay,
    league,
    playerAgencyId: player.id,
    playerName,
    rng: makeRng(seed ^ 0x5f3a),

    actions: {},       // trainerId -> 'rest' | 'train:judge' | 'enter:rookie'
    market: [],
    marketSeq: 1,
    log: [],           // 날짜별 리포트
    lastReport: null,
    gameOver: null,    // 파산하면 사유가 들어간다

    /**
     * §3.10 오프닝 — 트레이너 1명으로 시작하고, 그 트레이너가 뱃지 8개를 다 딸 때까지
     * 로스터를 못 늘린다. 스키마만 두고 체육관 도전 자체는 아직 안 붙였다 (§0.2).
     */
    opening: {
      done: !startEmpty,   // 개발자 모드로 바로 들어오면 이미 끝난 것으로 친다
      badgesNeeded: BADGES_TO_UNLOCK,
      firstTrainerId: null,
    },
  };

  await refreshMarket(game);
  return game;
}

/** 로스터 확장에 필요한 뱃지 수 (§3.10) */
export const BADGES_TO_UNLOCK = 8;

/** 지금 시장에서 계약할 수 있나 — 오프닝이 안 끝났으면 잠긴다 (§3.10) */
export function rosterLock(game) {
  if (game.opening?.done) return null;
  /* 아직 한 명도 없으면 잠글 게 없다 — 첫 계약은 해야 시작이 된다 */
  if (!playerAgency(game).roster.length) return null;
  const t = game.opening?.firstTrainerId
    ? findTrainer(game.league, game.opening.firstTrainerId) : null;
  const progress = badgeProgress(t);
  const badges = progress.best;
  return {
    locked: true,
    badges,
    progress,
    needed: game.opening?.badgesNeeded ?? BADGES_TO_UNLOCK,
    trainer: t,
  };
}

/** 협상이 끝난 유스를 로스터에 넣는다 (§5.3) */
export function signYouth(game, trainer, contract) {
  const a = playerAgency(game);
  trainer.agencyId = a.id;
  trainer.contract = { ...trainer.contract, ...contract };
  trainer.salary = contract.wage;
  trainer.isYouth = true;
  a.roster.push(trainer);
  a.funds -= contract.signing || 0;
  if (!game.opening.firstTrainerId) game.opening.firstTrainerId = trainer.id;
  return trainer;
}

export const playerAgency = (game) => findAgency(game.league, game.playerAgencyId);
export const playerRoster = (game) => playerAgency(game).roster;

/* ---------------- 일정 ---------------- */

/** 그 날짜에 열리는 대회 등급 (없으면 null) */
export function tournamentOn(day) {
  if (!GAME_CONFIG.tournamentsEnabled) return null;
  for (const tier of LOCAL_TOURNAMENT_TIERS) {
    const offset = GAME_CONFIG.schedule[tier.id];
    if (day >= offset && (day - offset) % GAME_CONFIG.scheduleCycle === 0) return tier;
  }
  return null;
}

/** 앞으로 N일간의 대회 일정 */
export function upcomingTournaments(game, days = 10) {
  const out = [];
  for (let d = game.day; d < game.day + days; d++) {
    const tier = tournamentOn(d);
    if (tier) out.push({ day: d, tier, daysAway: d - game.day });
  }
  return out;
}

/* ---------------- 행동 배정 ---------------- */

export const ACTION_LABELS = {
  rest: '휴식',
  'train:judge': '훈련 · 판단력',
  'train:ops': '훈련 · 운영',
  'train:focus': '훈련 · 집중력',
  'train:know': '훈련 · 지식',
  'train:mental': '훈련 · 멘탈',
};

/** 오늘 이 트레이너가 고를 수 있는 행동들 */
/**
 * 트레이너가 오늘 할 수 있는 일. 훈련은 뺐다 — 성장은 탐험(포획·배틀)으로만 한다.
 *   rest                            쉰다
 *   explore:<장소>:<catch|battle>   지도에서 고른 곳으로 나간다
 *   enter:<등급>                    오늘 열리는 대회에 나간다
 */
export function availableActions(game, trainer) {
  const list = [{ id: 'rest', label: '휴식', hint: '' }];
  const tier = tournamentOn(game.day);
  if (tier) {
    const eligible = isEligible(trainer, { ratingBand: tier.ratingBand });
    list.unshift({
      id: `enter:${tier.id}`,
      label: `${tier.label} 컵 출전`,
      hint: eligible ? `참가비 ${tier.entryCost}` : '출전 자격 없음',
      disabled: !eligible,
    });
  }
  return list;
}

/** 탐험 행동 문자열 만들기/풀기 */
export const exploreAction = (locationId, mode, activities = 6) => `explore:${locationId}:${mode}:${Math.max(6,Math.min(8,Math.round(Number(activities)||6)))}`;
export function parseExplore(action) {
  const m = /^explore:([^:]+):(catch|battle|mixed)(?::(6|7|8|9|10))?$/.exec(action || '');
  return m ? { locationId: m[1], mode: m[2], activities: Math.min(8,Number(m[3] || 6)) } : null;
}

/** 오늘 배정된 일을 사람 말로 */
export function describeAction(action) {
  const ex = parseExplore(action);
  if (ex) {
    const loc = locationById(ex.locationId);
    return `${loc?.name || ex.locationId} · ${ex.mode === 'catch' ? '포획 중심' : ex.mode === 'mixed' ? '포획·배틀 병행' : '배틀 중심'} · ${ex.activities}회 (센터 포함)`;
  }
  if(action?.startsWith('gym:')) return `${gymById(action.slice(4))?.name || ''} 체육관 도전 · 자동 관전`;
  if (!action || action === 'rest') return '휴식';
  if (action.startsWith('enter:')) return '대회 출전';
  return action;
}

/* ---------------- 박스 ---------------- */

/** 박스 → 파티 (6마리까지) */
export function boxToParty(game, trainerId, index) {
  const a = playerAgency(game);
  const t = a.roster.find(t=>t.id===trainerId);
  if (!t || !a.box[index]) return { ok: false, msg: '없는 포켓몬입니다.' };
  if(a.box[index].training) return {ok:false,msg:'훈련 완료 또는 취소 후 합류할 수 있습니다.'};
  if ((t.party || []).length >= 6) return { ok: false, msg: '파티는 6마리까지입니다.' };
  const [mon] = a.box.splice(index, 1);
  t.party.push(mon);
  return { ok: true };
}

/** 파티 → 박스 (마지막 한 마리는 못 뺀다) */
export function partyToBox(game, trainerId, index) {
  const a = playerAgency(game);
  const t = a.roster.find(t=>t.id===trainerId);
  if (!t || !t.party?.[index]) return { ok: false, msg: '없는 포켓몬입니다.' };
  if (t.party.length <= 1) return { ok: false, msg: '마지막 한 마리는 뺄 수 없습니다.' };
  const [mon] = t.party.splice(index, 1);
  a.box.push(mon);
  return { ok: true };
}

export function assignAction(game, trainerId, actionId) {
  game.actions[trainerId] = actionId;
}

export function clearActions(game) {
  game.actions = {};
}

/* ---------------- 성장 ---------------- */

function growStat(trainer, key, rate) {
  const gap = (trainer.potential[key] ?? 20) - trainer.stats[key];
  if (gap <= 0) return 0;
  const satF = 0.7 + 0.3 * (trainer.satisfaction / 100);
  const gain = rate * gap * satF;
  trainer.stats[key] = Math.min(trainer.potential[key], trainer.stats[key] + gain);
  return gain;
}

/**
 * 파티에 경험치를 넣는다. 레벨이 오르면 리포트에 남겨 알림으로 띄운다.
 * 레벨이 높을수록 같은 경험치로 덜 오르는 건 곡선(레벨^3)이 알아서 해준다.
 */
async function trainParty(game, trainer, amount, report) {
  for (const mon of trainer.party || []) {
    const r = await gainExp(mon, amount);
    if (r.levels) {
      report.levelUps.push({
        trainer: trainer.name, species: mon.species, level: mon.level, learned: r.learned,
      });
      /* 받은 메시지함은 뉴스피드를 읽는다 — 하루치 리포트에만 담으면 다음 날 사라진다 */
      /* 받은 메시지함은 뉴스피드를 읽는다 — 하루치 리포트에만 담으면 다음 날 사라진다 */
      game.league.newsFeed.push({
        day: game.day,
        text: `${trainer.name}의 ${iGa(ko(SPECIES_KO, mon.species))} 레벨 ${mon.level}`
          + (r.learned.length ? ` — ${r.learned.join(', ')} 습득` : ''),
      });
    }
  }
}

/* ---------------- 하루 진행 ---------------- */

/**
 * 하루를 넘긴다. 이 함수 하나가 게임의 심장.
 * @returns 그날 리포트 (UI가 그대로 보여준다)
 */
export async function advanceDay(game, { onProgress = async () => {} } = {}) {
  if (game.pendingStarter) throw new Error('첫 파트너를 선택한 뒤 하루를 진행하세요.');
  if (game.gameOver) return game.lastReport;

  const report = {
    day: game.day,
    trained: [],
    rested: [],
    explored: [],   // 탐험 결과 — 줄글
    levelUps: [],   // 포켓몬이 레벨업하면 여기 쌓인다
    tournament: null,
    myResults: [],
    income: 0,
    expense: 0,
    news: [],
  };

  const league = game.league;
  const player = playerAgency(game);
  const tier = tournamentOn(game.day);
  league.day = game.day;
  league.week = Math.floor((game.day - 1) / 7);

  /* 하루 시작 시점을 먼저 잡아둬야 상금/참가비/경비의 순증감을 제대로 잴 수 있다 */
  const fundsAtStart = player.funds;
  const newsAtStart = new Set(league.newsFeed);
  await onProgress({ id: 'activities', state: 'running', label: '오늘의 활동 진행', detail: `${player.roster.length}명의 일정 확인` });

  /* --- 1. 플레이어 트레이너의 배정 행동 실행 (대회 출전은 아래에서 따로) --- */
  const myEntrants = [];
  for (const t of player.roster) {
    const action = game.actions[t.id] || 'rest';
    await onProgress({ id: `trainer-${t.id}`, state: 'running', label: t.name, detail: describeAction(action) });
    t.lastAction = action;

    if (action.startsWith('enter:')) {
      if (tier && action === `enter:${tier.id}` && isEligible(t, { ratingBand: tier.ratingBand })) {
        myEntrants.push(t);
        await onProgress({ id: `trainer-${t.id}`, state: 'done', label: t.name, detail: `${tier.name} 참가 접수` });
        continue;
      }
      t.lastAction = 'rest';
      await onProgress({ id: `trainer-${t.id}`, state: 'done', label: t.name, detail: '참가 자격 미충족 · 휴식' });
      continue;
    }

    if(action.startsWith('gym:')) {
      const match=await challengeGym(game,t,action.slice(4));
      (report.gyms??=[]).push(match);
      await onProgress({id:`trainer-${t.id}`,state:'done',label:`${t.name} · 체육관 도전 완료`,detail:'이어서 관장전 관전을 시작합니다.'});
      continue;
    }
    /* 탐험 — 포켓몬 포획 / NPC 배틀. 결과는 글로 받은 메시지함에 들어간다 */
    const ex = parseExplore(action);
    if (ex) {
      const r = await explore(game, t, ex.locationId, ex.mode, { activities: ex.activities,
        onActivity: async (event, budget) => onProgress({ id: `activity-${t.id}-${event.slot}`, state: 'done',
          label: `${t.name} · ${event.time} · ${event.slot}/${budget}`, detail: event.lines.join(' '),
          progress: 8 + 60 * (player.roster.indexOf(t) + event.slot / budget) / player.roster.length }),
      });
      t.locationId = ex.locationId;
      player.box.push(...r.catches);
      if (r.money) player.funds += r.money;
      /* 배틀을 뛰면 트레이너 실력도 조금 는다 */
      if (r.won !== null) for (const k of STAT_KEYS) growStat(t, k, GAME_CONFIG.growth.battleRate * (r.wins + r.losses));
      report.explored.push({ trainerId: t.id, name: t.name, location: r.location?.name, lines: r.lines, won: r.won, events: r.events, budget: r.budget, wins: r.wins, losses: r.losses, caught: r.catches.length, centers: r.centers, money: r.money });
      league.newsFeed.unshift({ day: game.day, text: r.lines.join(' / '), kind: 'explore', trainerId: t.id });
      await onProgress({ id: `trainer-${t.id}`, state: 'done', label: `${t.name} · 활동 완료`, detail: r.lines.at(-1) });
      continue;
    }

    healParty(t);
    t.fatigue=Math.max(0,(t.fatigue||0)-MANAGEMENT.restRecovery);
    t.mentalDebuff = Math.max(0, (t.mentalDebuff || 0) - (0.4 + t.stats.mental * 0.04));
    report.rested.push(t.name);
    await onProgress({ id: `trainer-${t.id}`, state: 'done', label: t.name, detail: '포켓몬 전원 회복 · 트레이너 피로·자신감 회복' });
  }
  const trainingCount=player.box.filter(m=>m.training).length;
  report.training=tickTraining(game);
  for(const row of report.training) league.newsFeed.unshift({day:game.day,text:`${ko(SPECIES_KO,row.species)} · ${row.text}`,kind:'training'});
  await onProgress({id:'training',state:'done',label:'포켓몬 트레이닝 센터',detail:report.training.length?report.training.map(r=>r.text).join(' / '):trainingCount?`${trainingCount}마리 장기 훈련 1일 진행`:'배정된 훈련 없음'});
  await onProgress({ id: 'activities', state: 'done', label: '오늘의 활동 완료' });
  await onProgress({ id: 'league', state: 'running', label: '소속사 활동 정리', detail: '트레이너의 하루 기록 확인' });

  /* --- 2. NPC 트레이너: 대회에 안 나가면 알아서 회복 --- */
  /* --- 3. 오늘 대회가 있으면 개최 --- */
  if (tier) {
    const tournament = openTournament(league, tier);
    /* NPC는 §3.5 자동 판단, 플레이어는 위에서 직접 고른 사람만 */
    decideEntrants(league, tournament, {
      skipAgencyIds: [player.id],
      minCondition: 0,
    });
    for (const t of myEntrants) {
      tournament.entrants.push({ trainerId: t.id, agencyId: player.id, score: null, winChance: null });
    }

    runTournament(league, tournament, game.rng);
    league.tournaments.push(tournament);


    /* 배틀을 뛰면 전 스탯이 조금씩 늘고, 포켓몬은 경험치를 받는다 */
    for (const m of tournament.matches) {
      for (const id of [m.aId, m.bId]) {
        const t = findTrainer(league, id);
        if (!t) continue;
        for (const k of STAT_KEYS) growStat(t, k, GAME_CONFIG.growth.battleRate);
        if (t.agencyId === player.id) await trainParty(game, t, GAME_CONFIG.growth.battleExp, report);
      }
    }

    report.tournament = tournament;
    report.myResults = myEntrants.map((t) => ({
      trainerId: t.id,
      name: t.name,
      placement: placementOf(tournament, t.id),
    }));
  }

  /* NPC 회복 — 오늘 대회에 안 나간 NPC 트레이너 */
  const playedToday = new Set((report.tournament?.entrants || []).map((e) => e.trainerId));
  for (const a of league.agencies) {
    if (a.id === player.id) continue;
    for (const t of a.roster) {
      if (playedToday.has(t.id)) continue;
      t.condition = Math.min(100, t.condition + GAME_CONFIG.condition.idle);
      /* NPC도 조금씩 자란다 — 세상이 멈춰 있으면 안 된다 (§0.1-4) */
      for (const k of STAT_KEYS) growStat(t, k, GAME_CONFIG.growth.battleRate * 0.5);
    }
  }

  /* --- 4. 정산: 상금·참가비는 runTournament가 이미 반영했고, 여기선 일일 경비 --- */
  await onProgress({ id: 'league', state: 'done', label: '소속사 활동 정리 완료', detail: '활동 기록을 반영했습니다' });
  await onProgress({ id: 'finance', state: 'running', label: '재무 정산' });
  // Youth contracts quote weekly wages; legacy non-contract salaries remain daily.
  const upkeep = player.roster.reduce((n, t) => n + (t.contract?.wage != null
    ? (game.day % 7 === 0 ? t.contract.wage : 0) : (t.salary || 0)), 0);
  player.funds -= upkeep;
  report.upkeep = upkeep;
  report.net = player.funds - fundsAtStart;      // 그날 자금 순증감
  report.prize = report.net + upkeep;            // 경비를 빼기 전 = 대회에서 번 돈(참가비 차감 후)
  await onProgress({ id: 'finance', state: 'done', label: '재무 정산 완료', detail: `급여 지급 ${upkeep} · 오늘 수지 ${report.net >= 0 ? '+' : ''}${report.net}` });

  /* --- 5. 시장 갱신 --- */
  await onProgress({ id: 'reports', state: 'running', label: '소식 및 스카우팅 보고서 정리' });
  if (game.day % GAME_CONFIG.market.refreshDays === 0) await refreshMarket(game);

  /* --- 6. 뉴스 — 이번 하루 동안 새로 생긴 것만 (league 쪽은 day를 안 찍으므로 여기서 찍는다) */
  report.news = league.newsFeed.filter((n) => !newsAtStart.has(n));
  for (const n of report.news) if (n.day === undefined) n.day = game.day;

  /* --- 7. 파산 판정 (§3.3 자체 소속사는 경질이 아니라 파산) --- */
  if (player.funds < 0) {
    game.gameOver = { reason: '자금 고갈 — 소속사 해체', day: game.day };
  }

  game.day++;
  clearActions(game);
  game.lastReport = report;
  game.log.unshift(report);
  if (game.log.length > 60) game.log.pop();
  await onProgress({ id: 'reports', state: 'done', label: '일일 보고서 작성 완료', detail: `${report.news.length}건의 새로운 소식` });
  return report;
}

/** 그 대회에서 이 트레이너가 어디까지 갔나 */
export function placementOf(tournament, trainerId) {
  const r = tournament.result;
  if (!r) return null;
  if (r.championId === trainerId) return '우승';
  if (r.runnerUpId === trainerId) return '준우승';
  if (r.semifinalists.includes(trainerId)) return '4강';
  const played = tournament.matches.filter((m) => m.aId === trainerId || m.bId === trainerId);
  if (!played.length) return '부전승 탈락 없음';
  const lost = played.find((m) => m.loserId === trainerId);
  return lost ? `${lost.roundLabel} 탈락` : '진출';
}

/* ---------------- 스카웃 시장 ---------------- */

export function marketFeeFor(rating) {
  return Math.round(rating * rating * GAME_CONFIG.market.feeCoef);
}

export async function refreshMarket(game) {
  const league = game.league;
  const player = playerAgency(game);
  game.market = [];

  /* 시장 매물은 등급이 섞여서 나온다 — 싼 유망주부터 비싼 즉시전력까지 */
  const profiles = ['weak', 'mid', 'strong', 'grunt', 'mid'];
  for (let i = 0; i < GAME_CONFIG.market.size; i++) {
    const profile = profiles[Math.floor(game.rng() * profiles.length)];
    const fakeAgency = {
      id: 'market',
      statRange: profile === 'strong' ? [15, 20] : profile === 'mid' ? [11, 17] : [8, 14],
      rosterProfile: profile,
    };
    const t = await makeTrainerFor(fakeAgency, `m${game.marketSeq++}`, game.rng);
    t.agencyId = null;
    game.market.push({ trainer: t, fee: marketFeeFor(trainerRating(t)) });
  }
  return game.market;
}

/** 영입 — 이적료를 내고 로스터에 넣는다. 일일 경비가 늘어난다 */
export function signTrainer(game, marketIndex) {
  const player = playerAgency(game);
  const entry = game.market[marketIndex];
  if (!entry) return { ok: false, msg: '없는 매물입니다.' };
  if (player.funds < entry.fee) return { ok: false, msg: '자금이 부족합니다.' };

  player.funds -= entry.fee;
  const t = entry.trainer;
  t.agencyId = player.id;
  t.salary = salaryFor(t);
  player.roster.push(t);
  game.market.splice(marketIndex, 1);

  game.league.newsFeed.unshift({
    day: game.day, type: 'transfer',
    text: `${player.name}이(가) ${t.name}을(를) 영입했다 (이적료 ${entry.fee})`,
  });
  return { ok: true, trainer: t };
}

/** 방출 — 일일 경비가 줄어든다. 이적료는 안 돌아온다 */
export function releaseTrainer(game, trainerId) {
  const player = playerAgency(game);
  if (player.roster.length <= 1) return { ok: false, msg: '마지막 트레이너는 방출할 수 없습니다.' };
  const i = player.roster.findIndex((t) => t.id === trainerId);
  if (i < 0) return { ok: false, msg: '없는 트레이너입니다.' };
  const [t] = player.roster.splice(i, 1);
  game.league.newsFeed.unshift({
    day: game.day, type: 'transfer',
    text: `${player.name}이(가) ${t.name}을(를) 방출했다`,
  });
  return { ok: true, trainer: t };
}

/* ---------------- 조회용 ---------------- */

export function dailyUpkeep(game) {
  return playerRoster(game).reduce((n, t) => n + (t.contract?.wage != null ? t.contract.wage / 7 : (t.salary || 0)), 0);
}

export { trainerRating, allTrainers, findTrainer, findAgency, LOCAL_TOURNAMENT_TIERS };
