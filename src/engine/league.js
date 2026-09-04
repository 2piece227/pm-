/**
 * 리그 엔진 — 관동·성도 리그 하나를 실제로 굴린다. (SPEC §3, §5.2)
 *
 * 이번 세션 범위:
 *   - 정밀 계층만 (§3.4). 경량 계층(타지방)은 존재하지 않는 것으로 취급한다.
 *   - 로컬 대회만 (§5.2). 글로벌 대회/인원 제한은 스키마만 두고 로직은 비움.
 *   - 소속사가 §3.5 참가 판단을 스스로 하고, 결과가 쌓여 순위표가 갱신되는 데까지.
 *
 * 재현성: 매치마다 시드를 저장해두고, 나중에 그 시드로 다시 돌리면 같은 배틀이
 * 그대로 재생된다(트레이너 AI를 매치마다 새로 만들기 때문). UI에서 과거 배틀 로그를
 * 다시 볼 때 로그를 통째로 들고 있을 필요가 없다.
 */
import { createTrainerAI, runBattle, makeRng, GEN } from './run-battle.js';
import { buildTeam } from './team-builder.js';
import {
  KANTO_JOHTO_AGENCIES, createAgency, createTrainer, makeName, effectiveStats, STAT_KEYS,
} from '../data/agencies.js';
import { curve } from '../ai/estimate.js';
import { POKEMON_POOL } from '../data/pokemon-pool.js';

/* ---------------- 설정값 (PROGRESS.md Q2~Q4의 기본값) ---------------- */
export const LEAGUE_CONFIG = {
  trainersPerAgency: 4,      // Q2
  tournamentIntervalDays: 7, // Q3
  seasonWeeks: 12,           // Q3
  playerAutoEnter: true,     // 플레이어 소속사는 일단 NPC와 같은 판단 로직을 쓴다
};

/**
 * 로컬 대회 등급 — SPEC §3.5 "스탯 낮은 NPC는 하위 대회만, 강한 NPC는 상위 대회만
 * 노리게 되어 참가 자체가 자연스러운 필터링이 된다"를 그대로 구현한 것.
 *
 * ratingBand는 §5.2의 "뱃지 개수 조건"에 해당하는 출전 자격 필터다.
 * 밴드를 겹치게 둬서 중간 레이팅 트레이너는 어느 대회에 나갈지 선택지가 생긴다.
 * 상금은 §6.4대로 "배틀 1회 평균 상금 = 100" 기준 단위의 배수로만 적는다.
 */
export const LOCAL_TOURNAMENT_TIERS = [
  {
    id: "rookie", label: "하급",
    ratingBand: [0, 15],
    entryCost: 30,
    prize: {
      champion: { money: 300, reputation: 6 },
      runnerUp: { money: 120, reputation: 3 },
      semifinal: { money: 60, reputation: 1 },
    },
  },
  {
    id: "open", label: "중급",
    ratingBand: [12, 21],
    entryCost: 50,
    prize: {
      champion: { money: 800, reputation: 12 },
      runnerUp: { money: 300, reputation: 6 },
      semifinal: { money: 150, reputation: 3 },
    },
  },
  {
    id: "elite", label: "상급",
    ratingBand: [18, 999],
    entryCost: 80,
    prize: {
      champion: { money: 2000, reputation: 25 },
      runnerUp: { money: 800, reputation: 12 },
      semifinal: { money: 400, reputation: 6 },
    },
  },
];

/* ---------------- 트레이너 능력 평가 ---------------- */

/** 팀 전력 — 풀의 tier와 노력치 투자량을 반영한 근사치 */
export function teamPower(teamText) {
  const blocks = teamText.split(/\n\n+/).filter((b) => b.trim());
  let sum = 0;
  let evBonus = 0;
  for (const block of blocks) {
    const species = block.trim().split('\n')[0].split(' @')[0].trim();
    const entry = POKEMON_POOL.find((p) => p.species === species);
    sum += entry ? entry.tier : 2;
    const m = /EVs:\s*(\d+)/.exec(block);
    if (m) evBonus += Number(m[1]) / 252;
  }
  const n = blocks.length || 1;
  return (sum / n) * 10 + (evBonus / n) * 6; // tier 1~3 → 10~30, 노력치 풀투자 +6
}

/**
 * 트레이너 종합 레이팅 — §3.5의 "자기 스탯"에 해당.
 * 실력 스탯(곡선 적용)과 팀 전력을 절반씩 본다.
 */
export function trainerRating(trainer) {
  /* 컨디션은 빼고 순수 실력만 본다 — 출전 자격/시드는 컨디션 때문에 흔들리면 안 된다 */
  const s = trainer.stats;
  const skill = STAT_KEYS.reduce((acc, k) => acc + curve(s[k]), 0) / STAT_KEYS.length;
  return skill * 0.5 + teamPower(trainer.team) * 0.5;
}

/* ---------------- 트레이너 생성 ---------------- */

/**
 * 소속사 성격에 맞는 트레이너 하나를 만든다. 리그 초기화와 스카웃 시장이 같이 쓴다.
 * 현재 실력(CA)은 statRange 안에서 뽑고, 잠재력(PA)은 그보다 위로 잡는다 —
 * PA와 CA의 간격이 곧 "얼마나 더 클 수 있는 선수인가"다 (§4.3).
 */
export function makeTrainerFor(agency, id, rng, { name = null } = {}) {
  const [lo, hi] = agency.statRange;
  const stats = {};
  const potential = {};
  for (const k of STAT_KEYS) {
    const ca = lo + rng() * (hi - lo);
    stats[k] = ca;
    /* 잠재력은 현재치보다 0~6 위. 상한 24(네임드 구간 §4.2는 별도) */
    potential[k] = Math.min(24, ca + rng() * 6);
  }
  const t = createTrainer({
    id,
    name: name || makeName(rng),
    agencyId: agency.id,
    stats,
    potential,
    team: buildTeam(rng, agency.rosterProfile),
  });
  t.salary = salaryFor(t);
  return t;
}

/** 일일 경비 — 강할수록 비싸다. 영입할수록 고정비가 늘어난다 */
export function salaryFor(trainer) {
  return Math.round(4 + trainerRating(trainer) * 0.8);
}

/* ---------------- 리그 생성 ---------------- */

/**
 * 관동·성도 리그를 만든다. 같은 시드면 같은 리그가 나온다.
 */
export function createLeague({ seed = 20260904 } = {}) {
  const rng = makeRng(seed);
  const agencies = [];
  let trainerSeq = 1;

  for (const def of KANTO_JOHTO_AGENCIES) {
    const agency = createAgency(def);
    const [lo, hi] = def.statRange;
    for (let i = 0; i < LEAGUE_CONFIG.trainersPerAgency; i++) {
      const t = makeTrainerFor(agency, `t${trainerSeq++}`, rng);
      agency.roster.push(t);
    }
    agencies.push(agency);
  }

  return {
    id: 'kanto-johto',
    name: '관동·성도 리그',
    seed,
    day: 0,
    week: 0,
    season: 1,
    agencies,
    tournaments: [],   // 열렸던 대회 기록
    newsFeed: [],      // §9 뉴스 파이프라인 — 이번엔 대회 결과만 넣는다
  };
}

/** 리그 전체 트레이너를 평평하게 */
export function allTrainers(league) {
  return league.agencies.flatMap((a) => a.roster);
}

export function findTrainer(league, id) {
  return allTrainers(league).find((t) => t.id === id) || null;
}

export function findAgency(league, id) {
  return league.agencies.find((a) => a.id === id) || null;
}

/* ---------------- §3.5 NPC 대회 참가 판단 ---------------- */

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * 참가 점수 = 우승 가능성(자기 스탯 vs 대회 평균 스탯) × 대회 보상
 *           − 참가 비용 × 소속사 성향          (SPEC §3.5)
 *
 * "우승 가능성"을 단판 승률이 아니라 **입상 기대값**으로 편다 —
 * 16강이면 4승을 해야 우승이므로, 단판 승률만 보면 약한 트레이너도 다 나가버려서
 * §3.5가 노린 "참가 자체가 자연스러운 필터링"이 안 생긴다.
 */
export function participationScore(league, agency, trainer, tournament) {
  /* "대회 평균 스탯"은 리그 전체가 아니라 **그 대회에 나올 수 있는 사람들**의 평균이다.
     리그 전체 평균으로 재면 하급 대회에서도 실프 기준으로 승산을 계산하게 되어
     약한 소속사가 영원히 아무 데도 안 나가는 죽은 리그가 된다. */
  const eligible = allTrainers(league).filter((t) => isEligible(t, tournament));
  const field = (eligible.length ? eligible : allTrainers(league)).map(trainerRating);
  const fieldAvg = field.reduce((a, b) => a + b, 0) / (field.length || 1);
  const p = sigmoid((trainerRating(trainer) - fieldAvg) / 6);

  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, field.length))));
  const pChampion = Math.pow(p, rounds);
  const pRunnerUp = Math.pow(p, rounds - 1) * (1 - p);
  const pSemi = Math.pow(p, rounds - 2) * (1 - p);

  const prize = tournament.prize;
  const expMoney =
    pChampion * prize.champion.money + pRunnerUp * prize.runnerUp.money + pSemi * prize.semifinal.money;
  const expRep =
    pChampion * prize.champion.reputation +
    pRunnerUp * prize.runnerUp.reputation +
    pSemi * prize.semifinal.reputation;

  /* 기준 단위 100으로 정규화해서 더한다 (§6.4 절대값 하드코딩 금지) */
  const reward = expMoney / 100 + expRep * 0.5;

  /* 안정 운영형일수록 비용을 크게 본다. aggression 1.0 → 0.6배, 0.35 → 1.25배 */
  const costFactor = 1.6 - agency.policy.aggression;
  const cost = (tournament.entryCost / 100) * costFactor;

  return { score: reward - cost, winChance: p, reward, cost };
}

/* ---------------- 대회 ---------------- */

let tournamentSeq = 1;

/** 출전 자격 — 대회 등급의 레이팅 밴드 안에 들어야 한다 (§5.2 "뱃지 개수 조건"에 해당) */
export function isEligible(trainer, tournament) {
  const [lo, hi] = tournament.ratingBand;
  const r = trainerRating(trainer);
  return r >= lo && r <= hi;
}

/**
 * 로컬 대회 하나를 연다. 참가 인원 제한 없음 (§5.2 — 제한은 글로벌 대회만).
 */
export function openTournament(league, tierDef) {
  return {
    id: `tour${tournamentSeq++}`,
    name: `${tierDef.label} 로컬 컵 ${league.week + 1}주차`,
    type: "local",
    tierId: tierDef.id,
    tierLabel: tierDef.label,
    week: league.week + 1,
    day: league.day,

    /* §5.2 스키마 — 로컬은 인원 제한 없음. 글로벌 대회 로직은 이번 범위 밖 */
    perAgencyLimit: null,
    ratingBand: tierDef.ratingBand,
    entryRequirement: { minBadges: 0, minReputation: 0 },

    prize: tierDef.prize,
    entryCost: tierDef.entryCost,

    entrants: [],
    declined: [],
    ineligible: [],
    matches: [],
    result: null,
  };
}

/** 각 소속사가 스스로 판단해서 참가자를 낸다 */
export function decideEntrants(league, tournament, { skipAgencyIds = [], minCondition = 35 } = {}) {
  for (const agency of league.agencies) {
    if (skipAgencyIds.includes(agency.id)) continue; // 플레이어는 직접 고른다
    for (const trainer of agency.roster) {
      if (trainer.condition < minCondition) continue; // 지친 트레이너는 안 내보낸다
      if (!isEligible(trainer, tournament)) {
        tournament.ineligible.push({ trainerId: trainer.id, agencyId: agency.id });
        continue;
      }
      const judged = participationScore(league, agency, trainer, tournament);
      if (judged.score > 0) {
        tournament.entrants.push({ trainerId: trainer.id, agencyId: agency.id, ...judged });
      } else {
        tournament.declined.push({ trainerId: trainer.id, agencyId: agency.id, ...judged });
      }
    }
  }
  return tournament;
}

/** 매치 1회 — 시드를 넣으면 항상 같은 결과가 나온다(AI를 매번 새로 만든다) */
export function runMatch(league, aId, bId, seed, { collectLog = false } = {}) {
  const a = findTrainer(league, aId);
  const b = findTrainer(league, bId);
  /* 컨디션이 깎인 트레이너는 실제로 약해진다 (§4.5) */
  const aiA = createTrainerAI({ name: a.name, stats: effectiveStats(a) }, a.nature.style, makeRng(seed));
  const aiB = createTrainerAI({ name: b.name, stats: effectiveStats(b) }, b.nature.style, makeRng(seed + 1));

  const r = runBattle({
    trainerA: aiA,
    trainerB: aiB,
    teamA: a.team,
    teamB: b.team,
    seed,
    collectThink: false,
  });

  return {
    winnerId: r.winner === 'p1' ? aId : r.winner === 'p2' ? bId : null,
    turns: r.turns,
    log: collectLog ? r.log : null,
  };
}

/** 2의 거듭제곱으로 올림 (부전승 채우기용) */
const nextPow2 = (n) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));

/**
 * 표준 토너먼트 시드 순서를 만든다. size=8 → [1,8,5,4,3,6,7,2]
 *
 * 이게 필요한 이유: 시드를 그냥 앞에서부터 채우고 남는 자리를 빈칸으로 두면
 * **최하위 시드가 빈칸(부전승)만 만나며 결승까지 직행**한다. 실제로 그 버그가 났었다
 * (0승 0패인데 준우승 12회). 표준 시드 순서를 쓰면 부전승이 상위 시드에 배분된다.
 */
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) {
      next.push(s);
      next.push(n + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * 싱글 엘리미네이션 브래킷 실행.
 * 레이팅 높은 순으로 시드를 매겨 부전승을 배분한다.
 */
export function runTournament(league, tournament, rng) {
  const seeded = tournament.entrants
    .map((e) => ({ ...e, rating: trainerRating(findTrainer(league, e.trainerId)) }))
    .sort((x, y) => y.rating - x.rating);

  if (seeded.length < 2) {
    tournament.result = { championId: null, runnerUpId: null, semifinalists: [], note: '참가자 부족' };
    return tournament;
  }

  const size = nextPow2(seeded.length);
  /* 표준 시드 배치 — 부전승이 상위 시드에게 가도록 */
  const slots = seedOrder(size).map((seedNo) =>
    seedNo <= seeded.length ? seeded[seedNo - 1].trainerId : null
  );

  let round = slots;
  let roundNo = 1;
  const semifinalists = [];
  let runnerUpId = null;

  while (round.length > 1) {
    const next = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i];
      const b = round[i + 1];
      if (a && !b) { next.push(a); continue; }   // 부전승
      if (!a && b) { next.push(b); continue; }
      if (!a && !b) { next.push(null); continue; }

      const seed = Math.floor(rng() * 0x7fffffff);
      const m = runMatch(league, a, b, seed);
      const loser = m.winnerId === a ? b : a;

      tournament.matches.push({
        round: roundNo,
        roundLabel: roundLabel(round.length),
        aId: a, bId: b,
        winnerId: m.winnerId,
        loserId: loser,
        turns: m.turns,
        seed,
      });

      /* 전적 반영 */
      const wt = findTrainer(league, m.winnerId);
      const lt = findTrainer(league, loser);
      if (wt) { wt.record.wins++; wt.lossStreak = 0; }
      if (lt) { lt.record.losses++; lt.lossStreak++; }
      const wa = findAgency(league, wt?.agencyId);
      const la = findAgency(league, lt?.agencyId);
      if (wa) wa.record.wins++;
      if (la) la.record.losses++;

      if (round.length === 2) runnerUpId = loser;         // 결승 패자
      if (round.length === 4) semifinalists.push(loser);  // 4강 패자

      next.push(m.winnerId);
    }
    round = next;
    roundNo++;
  }

  const championId = round[0];
  tournament.result = { championId, runnerUpId, semifinalists };
  awardPrizes(league, tournament);
  pushNews(league, tournament);
  return tournament;
}

function roundLabel(remaining) {
  if (remaining === 2) return '결승';
  if (remaining === 4) return '4강';
  if (remaining === 8) return '8강';
  if (remaining === 16) return '16강';
  return `${remaining}강`;
}

/** 상금·평판 지급 (§6.4 — 절대값이 아니라 기준 단위 배수로 설계된 값) */
function awardPrizes(league, tournament) {
  const give = (trainerId, prize, kind) => {
    if (!trainerId) return;
    const t = findTrainer(league, trainerId);
    const a = findAgency(league, t?.agencyId);
    if (!a) return;
    a.funds += prize.money;
    a.reputation += prize.reputation;
    if (kind === 'champion') { a.record.titles++; t.record.titles++; }
    if (kind === 'runnerUp') a.record.runnerUps++;
    if (kind === 'semifinal') a.record.semifinals++;
  };

  const r = tournament.result;
  give(r.championId, tournament.prize.champion, 'champion');
  give(r.runnerUpId, tournament.prize.runnerUp, 'runnerUp');
  for (const s of r.semifinalists) give(s, tournament.prize.semifinal, 'semifinal');

  /* 참가 비용은 모든 참가자가 부담한다 */
  for (const e of tournament.entrants) {
    const a = findAgency(league, e.agencyId);
    if (a) a.funds -= tournament.entryCost;
  }
}

/** §9 뉴스 파이프라인 — 이번 세션에서는 대회 결과만 넣는다 */
function pushNews(league, tournament) {
  const champ = findTrainer(league, tournament.result.championId);
  if (!champ) return;
  const agency = findAgency(league, champ.agencyId);
  league.newsFeed.unshift({
    week: tournament.week,
    type: 'tournament',
    text: `${tournament.name} 우승 — ${agency.name} 소속 ${champ.name}`,
    tournamentId: tournament.id,
  });
}

/* ---------------- 시즌 진행 ---------------- */

/**
 * 한 주 진행: 등급별 로컬 대회 3개(하급/중급/상급)가 같이 열린다.
 * 등급을 나눠야 약한 소속사도 나갈 자리가 생긴다 (§3.5).
 */
export function advanceWeek(league, rng = makeRng(league.seed + league.week * 977)) {
  const held = [];
  for (const tierDef of LOCAL_TOURNAMENT_TIERS) {
    const t = openTournament(league, tierDef);
    decideEntrants(league, t);
    runTournament(league, t, rng);
    league.tournaments.push(t);
    held.push(t);
  }
  league.week++;
  league.day += LEAGUE_CONFIG.tournamentIntervalDays;
  return held;
}

/** 시즌 전체(기본 12주) 진행 */
export function runSeason(league, weeks = LEAGUE_CONFIG.seasonWeeks) {
  const out = [];
  for (let i = 0; i < weeks; i++) out.push(...advanceWeek(league));
  return out;
}

/** 순위표 — 평판 우선, 동률이면 우승 횟수 → 승수 */
export function standings(league) {
  return league.agencies
    .map((a) => ({
      id: a.id,
      name: a.name,
      tierLabel: a.tierLabel,
      isPlayer: a.isPlayer,
      reputation: Math.round(a.reputation),
      funds: Math.round(a.funds),
      titles: a.record.titles,
      runnerUps: a.record.runnerUps,
      wins: a.record.wins,
      losses: a.record.losses,
      rosterSize: a.roster.length,
    }))
    .sort((x, y) => y.reputation - x.reputation || y.titles - x.titles || y.wins - x.wins);
}

export { GEN };
