/**
 * 표시 레이어 — 쇼다운 프로토콜을 두 갈래로 옮긴다. (SPEC §7.3)
 *
 *   text — 리플레이 로그 한 줄 (수치 포함, 훑어보기용)
 *   msg  — **배틀 화면 자막**. 실제 게임 문구를 따른다 ("모래바람이 ○○를 덮쳤다!")
 *   anim — 화면 연출 지시
 *   field— 그 시점의 양쪽 상태 (HP 바 / 랭크 / 상태이상)
 *
 * 시뮬 로직은 이 파일을 전혀 모른다. 같은 프로토콜 배열을 받아
 * 로그로 뿌리든 관전 화면으로 재생하든 여기서만 갈린다. (§0.1-3)
 */
import {
  ABILITY_KO, BOOST_KO, CANT_MSG, ITEM_KO, MOVE_KO, MOVE_TYPE, SPECIES_KO, SPECIES_TYPES,
  STATUS_BADGE, STATUS_KO, STATUS_MSG, STATUS_TICK, WEATHER_MSG, CURE_MSG, ko,
  eunNeun, eulReul, iGa, euro, gwaWa, VOLATILE_KO, VOLATILE_MSG, TRAP_MSG, TRAP_DAMAGE, TRAP_END,
} from '../data/ko.js';
import { animArchetype } from '../data/move-anim.js';
import {PublicBattle} from '../engine/public-battle.js';

/* ---------------- 파싱 ---------------- */

/** `p1a: Garchomp` → { slot:'p1a', side:'p1', name:'Garchomp' } */
function parseIdent(raw) {
  const m = /^(p[12])([a-c]?): (.+)$/.exec(raw || '');
  if (!m) return null;
  return { slot: m[1] + (m[2] || 'a'), side: m[1], name: m[3] };
}

/**
 * `43/183` | `0 fnt` | `120/183 brn` → { pct, cur, max, status }
 * 쓰러진 줄(`0 fnt`)에는 최대치가 안 실려 있다. 그대로 두면 HP 박스에 "0/null"이 뜬다.
 */
function parseCond(cond) {
  if (!cond) return null;
  if (/\bfnt\b/.test(cond)) return { pct: 0, cur: 0, max: undefined, status: null };
  const m = /^(\d+)\/(\d+)(?:\s+(\w+))?/.exec(cond);
  if (!m) return null;
  const cur = Number(m[1]);
  const max = Number(m[2]);
  return { pct: Math.max(0, Math.round((cur / max) * 100)), cur, max, status: m[3] || null };
}

/** 최대치가 안 실린 줄(쓰러짐)에서는 이전 값을 이어 쓴다 */
function keepMax(cond, prev) {
  if (!cond) return cond;
  return cond.max == null ? { ...cond, max: prev?.max ?? null } : cond;
}

/** `Garchomp, L50, M` → { species, level, gender } */
function parseDetails(details) {
  const parts = (details || '').split(',').map((s) => s.trim());
  const out = { species: parts[0] || '', level: 50, gender: null };
  for (const p of parts.slice(1)) {
    if (/^L\d+$/.test(p)) out.level = Number(p.slice(1));
    else if (p === 'M' || p === 'F') out.gender = p;
  }
  return out;
}

const monKo = (ident) => {
  if (!ident) return '?';
  const name = ko(SPECIES_KO, ident.name);
  /* 양 팀에 같은 종족이 흔해서(풀이 36종) 소속을 안 밝히면 같은 개체로 읽힌다 */
  return ident.side === 'p2' ? `상대 ${name}` : name;
};

/** AI 판단 근거 한 줄 */
function formatThink(t) {
  const opts = t.options.map((o) => {
    const label = o.kind === 'switch' ? `→${ko(SPECIES_KO, o.label)}` : ko(MOVE_KO, o.label);
    return `${label} ${Math.round(o.prob * 100)}%`;
  });
  const head = t.ai === 'anotherred' ? `${t.trainer}${t.threshold != null ? ` 기준 ${t.threshold}점` : ''}` : `${t.trainer} T=${(t.temperature ?? 0).toFixed(2)}`;
  return `[${head}] ${opts.join(' / ')}`;
}

/** [from] Sandstorm / [from] item: Leftovers → 'Sandstorm' / 'Leftovers' */
/** `[of] p1a: X` → 그 포켓몬의 한국어 이름 (없으면 null) */
const ofName = (parts) => { const raw = parts.find((p) => p.startsWith('[of]')); const id = raw && parseIdent(raw.replace('[of]', '').trim()); return id ? monKo(id) : null; };
/** 로그 줄에 쓸 효과 이름 — 상태이상·지속 효과·기술·특성·도구 순으로 한국어 */
const effectKo = (what) => STATUS_KO[what] || VOLATILE_KO[what] || ko(ABILITY_KO, ko(ITEM_KO, ko(MOVE_KO, what)));

function fromSource(parts) {
  const raw = parts.find((p) => p.startsWith('[from]'));
  if (!raw) return null;
  return raw.replace('[from]', '').trim().replace(/^(ability|item|move):\s*/, '');
}

/** `[from] ability: X` 와 그 주인(`[of]`, 없으면 줄의 대상) */
function abilitySource(parts) {
  const raw = parts.find((p) => p.startsWith('[from] ability:'));
  if (!raw) return null;
  const of = parts.find((p) => p.startsWith('[of]'));
  return { ability: raw.replace('[from] ability:', '').trim(), owner: parseIdent(of ? of.replace('[of]', '').trim() : parts[1]) };
}
const isBerry = (item) => /Berry$/.test(item || '');

/* 원작처럼 특성 팝업만 뜨고 자막이 따로 붙는 특성 알림 (그 외는 팝업만) */
const ABILITY_ANNOUNCE = {
  Pressure: (n) => `${eunNeun(n)} 프레셔를\n발휘하고 있다!`,
  Unnerve: () => '상대는 긴장해서\n나무열매를 먹을 수 없게 되었다!',
  'Air Lock': () => '날씨의 영향이 없어졌다!',
  'Cloud Nine': () => '날씨의 영향이 없어졌다!',
  'Mold Breaker': (n) => `${eunNeun(n)} 틀깨기다!`,
};

/* ---------------- 본체 ---------------- */

/** names는 `'한연우'`도 되고 `{ name, agency }`도 된다 */
const trainerName = (v) => (typeof v === 'string' ? v : v?.name || '');

export function toKoreanLog(protocolLog, names, think = []) {
  const lines = protocolLog.slice();
  const out = [];
  const knowledge = new PublicBattle();

  const mon = {};      // slot → { ident, species, level, gender }
  const hp = {};       // slot → { pct, cur, max }
  const status = {};   // slot → 'brn' | ...
  const boosts = {};   // slot → { atk: +2 }
  const roster = { p1: 6, p2: 6 };   // |teamsize|로 채운다
  const downed = { p1: 0, p2: 0 };   // 쓰러진 수 — 남은 몬스터볼 표시용
  let weather = null;
  let pending = null;  // 진행 중인 공격기
  let turn = 0;

  const thinkByTurn = new Map();
  for (const t of think) {
    if (!thinkByTurn.has(t.turn)) thinkByTurn.set(t.turn, []);
    thinkByTurn.get(t.turn).push(formatThink(t.think));
  }

  /**
   * noField — 이 줄은 화면 상태를 갱신하지 않는다.
   *
   * 쇼다운 프로토콜은 "효과가 굉장했다"류를 **데미지 줄보다 먼저** 보낸다.
   * 그래서 이 줄들에 그 시점 스냅샷을 붙이면, 기술 줄이 HP 바를 내려놓은 직후
   * 곧바로 데미지 전 값으로 되돌려 **바가 늘었다 줄었다 하는 것처럼 보인다.**
   * 이 줄들은 순수 부연 설명이라 상태를 건드리지 않는 게 맞다.
   */
  const push = (cls, text, { msg = null, anim = null, noField = false } = {}) => {
    const line = { cls, text, msg, anim };
    if (noField) line.noField = true;
    out.push(line);
    return line;
  };
  const sideCls = (slot) => (slot?.startsWith('p1') ? 'l-blue' : 'l-red');
  const sideOf = (slot) => (slot?.startsWith('p1') ? 'p1' : 'p2');

  const snapshot = () => {
    const f = {};
    for (const side of ['p1', 'p2']) {
      const slot = `${side}a`;
      const m = mon[slot];
      const h = hp[slot];
      f[side] = {
        /* HP 박스는 실기처럼 종족명만 쓴다. 누구 것인지는 화면 구석 트레이너 이름표가 알려준다 */
        name: m ? ko(SPECIES_KO, m.ident.name) : '—',
        species: m?.species || null,
        types: SPECIES_TYPES[m?.species] || '',
        level: m?.level ?? 50,
        gender: m?.gender || null,
        knownMoves: (knowledge.current(side)?.moves||[]).map(name=>ko(MOVE_KO,name)),
        pct: h?.pct ?? 100,
        cur: h?.cur ?? null,
        max: h?.max ?? null,
        status: STATUS_BADGE[status[slot]] || null,
        statusCode: status[slot] || null,   // 지속 연출(화상 불꽃·독 거품·얼음)을 고르는 데 쓴다
        boosts: Object.entries(boosts[slot] || {})
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `${ko(BOOST_KO, k)}${v > 0 ? '+' : ''}${v}`)
          .join(' '),
      };
    }
    f.p1.left = Math.max(0, roster.p1 - downed.p1);
    f.p2.left = Math.max(0, roster.p2 - downed.p2);
    f.p1.total = roster.p1;
    f.p2.total = roster.p2;
    f.weather = weather;
    return f;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw === '|') continue;
    const parts = raw.slice(1).split('|');
    const type = parts[0];
    const mark = out.length;

    /* |split|pN 다음 두 줄은 같은 사건의 비공개/공개 판본. 앞쪽만 쓴다 */
    if (type === 'split') {
      if (lines[i + 1] && lines[i + 2]) lines.splice(i + 2, 1);
      continue;
    }
    knowledge.push(raw);
    const abSrc = type === '-ability' ? null : abilitySource(parts);

    switch (type) {
      case 'teamsize': {
        const side = parts[1];
        const n = Number(parts[2]);
        if ((side === 'p1' || side === 'p2') && n > 0) roster[side] = n;
        break;
      }

      case 'turn': {
        turn = Number(parts[1]);
        push('l-turn', `턴 ${turn}`);
        for (const t of thinkByTurn.get(turn) || []) push('l-think', `  ${t}`);
        pending = null;
        break;
      }

      case 'switch':
      case 'drag': {
        const id = parseIdent(parts[1]);
        if (!id) break;
        const det = parseDetails(parts[2]);
        const cond = parseCond(parts[3]);
        mon[id.slot] = { ident: id, ...det };
        hp[id.slot] = keepMax(cond, hp[id.slot]) || { pct: 100, cur: null, max: null };
        status[id.slot] = cond?.status || null;
        boosts[id.slot] = {};

        const name = ko(SPECIES_KO, id.name);
        const trainer = trainerName(names[id.side]) || id.side;
        /* 실제 게임 문구: 내 쪽은 "가랏!", 상대 쪽은 "○○은(는) ○○를 내보냈다!" */
        const msg = id.side === 'p1'
          ? `가랏! ${name}!`
          : `${eunNeun(trainer)}\n${eulReul(name)} 내보냈다!`;
        push(sideCls(id.slot), `${trainer}: ${monKo(id)} 출전!`, {
          msg,
          anim: { k: 'send', side: id.side, species: det.species },
        });
        pending = null;
        break;
      }

      case 'move': {
        const user = parseIdent(parts[1]);
        const target = parseIdent(parts[3]);
        const mvName = parts[2];
        const mvKo = ko(MOVE_KO, mvName);
        const head = `${monKo(user)}의 ${mvKo}` + (target ? ` → ${monKo(target)}` : '');
        const line = push(sideCls(user?.slot), head, {
          msg: `${monKo(user)}의\n${mvKo}!`,
          anim: {
            k: 'move',
            side: sideOf(user?.slot),
            target: target ? sideOf(target.slot) : null,
            type: MOVE_TYPE[mvName] || 'normal',
            move: mvKo,
            moveEn: mvName,
            /* 기술마다 다른 연출을 쓴다 (src/data/move-anim.js) */
            archetype: animArchetype(mvName, MOVE_TYPE[mvName] || 'normal'),
          },
        });
        pending = target
          ? { line, head, slot: target.slot, before: hp[target.slot]?.pct ?? 100, hits: 0 }
          : null;
        break;
      }

      case '-damage':
      case '-heal': {
        const id = parseIdent(parts[1]);
        if (!id) break;
        const cond = parseCond(parts[2]);
        const before = hp[id.slot]?.pct ?? 100;
        hp[id.slot] = keepMax(cond, hp[id.slot]) || hp[id.slot];
        if (cond?.status !== undefined) status[id.slot] = cond.status ?? status[id.slot];
        const after = hp[id.slot]?.pct ?? before;
        const delta = after - before;
        const src = fromSource(parts);
        const name = monKo(id);

        if (src) {
          /* 날씨·상태이상·특성·도구발 피해/회복은 각자 고유 자막이 있다 */
          let msg = null;
          const w = WEATHER_MSG[src];
          if (w && w.damage) msg = w.damage(eulReul(name));
          else if (STATUS_TICK[src]) msg = STATUS_TICK[src](eunNeun(name));
          /* 원작 문구: 반동·혼란 자해·흩뿌리기 */
          /* 조이기류(회오리불꽃·김밥말이·바다회오리 …)·씨뿌리기·저주·소금절이·악몽·뿌리박기·아쿠아링 */
          else if (parts.includes('[partiallytrapped]')) msg = TRAP_DAMAGE(name, ko(MOVE_KO, src));
          else if (type === '-damage' && VOLATILE_MSG[src]?.damage) msg = VOLATILE_MSG[src].damage(name);
          else if (type === '-heal' && VOLATILE_MSG[src]?.heal) msg = VOLATILE_MSG[src].heal(name);
          else if (src === 'Recoil') msg = `${eunNeun(name)} 공격의\n반동으로 데미지를 입었다!`;
          else if (src === 'confusion') msg = `${eunNeun(name)} 영문도 모른 채\n자신을 공격했다!`;
          else if (src === 'Stealth Rock') msg = `${name}에게\n뾰족한 바위가 박혔다!`;
          else if (src === 'Spikes') msg = `${eunNeun(name)} 압정뿌리기의\n데미지를 입었다!`;
          else if (parts.some((p) => p.startsWith('[from] item:'))) {
            const item = ko(ITEM_KO, src);
            if (src === 'Life Orb') msg = `${name}의\n생명이 조금 깎였다!`;
            else if (type === '-heal' && isBerry(src)) msg = `${eunNeun(name)} ${eulReul(item)} 먹고\nHP를 회복했다!`;
            else if (type === '-heal') msg = `${eunNeun(name)} ${euro(item)}\n조금 회복했다!`;
            else msg = `${eunNeun(name)} ${item} 때문에\n데미지를 입었다!`;
          } else if (parts.some((p) => p.startsWith('[from] ability:'))) {
            msg = type === '-heal' ? `${eunNeun(name)}\n체력을 회복했다!` : `${eunNeun(name)}\n데미지를 입었다!`;
          } else {
            const label = ko(ABILITY_KO, ko(ITEM_KO, ko(MOVE_KO, src)));
            msg = delta > 0
              ? `${eunNeun(name)} ${euro(label)}\n체력을 회복했다!`
              : `${label}!\n${eunNeun(name)} 데미지를 입었다!`;
          }
          const label = { Recoil: '반동' }[src] || effectKo(src);
          /* 화상·독 같은 지속 피해는 실기처럼 **매 턴 그 상태이상 연출이 다시 돈다** */
          const tick = STATUS_TICK[src] ? src : null;
          push('l-gold', `  ${label}: ${name}  ${before}% → ${after}%`, {
            msg,
            anim: tick
              ? { k: 'status', side: id.side, status: tick, text: `${delta}%` }
              : {
                k: 'fx', side: id.side,
                text: `${delta > 0 ? '+' : ''}${delta}%`,
                color: delta > 0 ? '#5ad06a' : '#e8705a',
              },
          });
          break;
        }

        /* 회복은 기술 줄에 합치지 않는다.
           자기재생·날개쉬기처럼 **자신을 대상으로 하는 회복기**는 pending.slot이
           시전자와 같아서, 그냥 합치면 "자기 자신을 때렸다"로 처리되어
           피격 플래시가 뜨고 HP 표기도 데미지처럼 나온다. */
        if (type === '-damage' && pending && pending.slot === id.slot) {
          /* 공격기 데미지는 새 줄을 만들지 않고 기술 줄에 합쳐 쓴다 */
          pending.hits++;
          const multi = pending.hits > 1 ? `  (${pending.hits}번 맞았다)` : '';
          pending.line.text = `${pending.head}  ${pending.before}% → ${after}%${multi}`;
          pending.line.anim.hit = id.side;
          pending.line.field = snapshot();
          break;
        }

        push(delta > 0 ? 'l-gold' : 'l-sub', `  ${name}  ${before}% → ${after}%`, {
          msg: delta > 0 ? `${eunNeun(name)}\n체력을 회복했다!` : null,
          anim: {
            k: 'fx', side: id.side,
            text: `${delta > 0 ? '+' : ''}${delta}%`,
            color: delta > 0 ? '#5ad06a' : '#e8705a',
          },
        });
        break;
      }

      case '-sethp': {
        /* 고통나누기처럼 HP를 직접 덮어쓰는 기술. 양쪽에 한 번씩 온다.
           여기서 줄을 안 만들면 변화가 화면에 안 잡히고 **다음 줄에서 갑자기 튄다.** */
        const id = parseIdent(parts[1]);
        const cond = parseCond(parts[2]);
        if (!id || !cond) break;
        const before = hp[id.slot]?.pct ?? 100;
        hp[id.slot] = keepMax(cond, hp[id.slot]);
        const delta = cond.pct - before;
        if (delta === 0) break;
        const name = monKo(id);
        push(delta > 0 ? 'l-gold' : 'l-sub', `  ${name}  ${before}% → ${cond.pct}%`, {
          anim: {
            k: 'fx', side: id.side,
            text: `${delta > 0 ? '+' : ''}${delta}%`,
            color: delta > 0 ? '#5ad06a' : '#e8705a',
          },
        });
        break;
      }

      case '-supereffective':
        if (pending) pending.line.anim.eff = 'super';
        push('l-sub', '  효과가 굉장했다!', {
          noField: true,
          msg: '효과가 굉장했다!',
          anim: pending && { k: 'fx', side: sideOf(pending.slot), text: '효과 굉장!', color: '#ffd24a' },
        });
        break;
      case '-resisted':
        if (pending) pending.line.anim.eff = 'resisted';
        push('l-sub', '  효과가 별로인 것 같다…', { noField: true, msg: '효과가 별로인 것 같다…' });
        break;
      case '-immune': {
        const id = parseIdent(parts[1]);
        push('l-sub', '  효과가 없는 것 같다…', {
          noField: true,
          msg: `하지만 ${monKo(id)}에게는\n효과가 없었다…`,
          anim: id && { k: 'fx', side: id.side, text: '무효', color: '#c8c8c8' },
        });
        break;
      }
      case '-crit':
        if (pending) pending.line.anim.crit = true;
        push('l-sub', '  급소에 맞았다!', {
          noField: true,
          msg: '급소에 맞았다!',
          anim: pending && { k: 'fx', side: sideOf(pending.slot), text: '급소!', color: '#ff8a5a' },
        });
        break;
      case '-miss': {
        const id = parseIdent(parts[2]) || parseIdent(parts[1]);
        if (pending) pending.line.anim.missed = true;
        push('l-sub', '  하지만 빗나갔다!', { noField: true, msg: `하지만 ${monKo(id)}에게는\n맞지 않았다!` });
        break;
      }
      case '-fail': {
        const ab = abilitySource(parts);
        if (ab && parts[2] === 'unboost') { push('l-sub', '  능력 하락 막음', { noField: true, msg: `${monKo(parseIdent(parts[1]))}의 능력은\n떨어지지 않는다!` }); break; }
        push('l-sub', '  하지만 실패했다!', { noField: true, msg: '하지만 실패했다!' });
        break;
      }

      case '-boost':
      case '-unboost': {
        const id = parseIdent(parts[1]);
        const key = parts[2];
        const n = Number(parts[3]);
        const delta = (type === '-boost' ? 1 : -1) * n;
        if (!boosts[id.slot]) boosts[id.slot] = {};
        boosts[id.slot][key] = Math.max(-6, Math.min(6, (boosts[id.slot][key] || 0) + delta));
        const stat = ko(BOOST_KO, key);
        const name = monKo(id);
        const much = n >= 3 ? '매우 크게 ' : n === 2 ? '크게 ' : '';
        const verb = delta > 0 ? '올라갔다!' : '떨어졌다!';
        push('l-gold', `  ${name} ${stat} ${delta > 0 ? '+' : ''}${delta}`, {
          msg: `${name}의 ${iGa(stat)}\n${much}${verb}`,
          anim: {
            k: 'fx', side: id.side,
            text: `${delta > 0 ? '▲ ' : '▼ '}${stat}`,
            color: delta > 0 ? '#5ad0d0' : '#e88a5a',
          },
        });
        break;
      }

      case '-status': {
        const id = parseIdent(parts[1]);
        const st = parts[2];
        status[id.slot] = st;
        const name = monKo(id);
        push('l-gold', `  ${name} → ${ko(STATUS_KO, st)}`, {
          msg: STATUS_MSG[st] ? STATUS_MSG[st](eunNeun(name)) : `${eunNeun(name)}
${ko(STATUS_KO, st)} 상태가 되었다!`,
          anim: { k: 'status', side: id.side, status: st, text: ko(STATUS_KO, st) },
        });
        break;
      }

      case '-cureteam': {
        /* 방울소리·아로마테라피 — 그 편 전원의 상태이상이 풀린다 */
        const id = parseIdent(parts[1]);
        for (const k of Object.keys(status)) if (k.startsWith(id?.side || '?')) status[k] = null;
        push('l-gold', `  ${id?.side} 상태이상 전원 회복`, {});
        break;
      }

      case '-curestatus': {
        const id = parseIdent(parts[1]);
        const st = parts[2];
        if (id && status[id.slot] === st) status[id.slot] = null;
        const name = monKo(id);
        push('l-gold', `  ${name} ${ko(STATUS_KO, st)} 회복`, {
          msg: CURE_MSG[st] ? CURE_MSG[st](name) : `${name}의 ${iGa(ko(STATUS_KO, st))}\n나았다!`,
        });
        break;
      }

      case '-ability': {
        const id = parseIdent(parts[1]);
        const ab = ko(ABILITY_KO, parts[2]);
        const name = monKo(id);
        /* 5세대 이후 원작: 특성 팝업이 포켓몬 옆에 뜨고, 효과 자막은 다음 줄(능력 하락 등)이 맡는다 */
        const line = push('l-gold', `  ${name}의 ${ab}!`, {
          msg: ABILITY_ANNOUNCE[parts[2]] ? ABILITY_ANNOUNCE[parts[2]](name) : null,
          anim: { k: 'ability', side: id.side, ability: ab, mon: name },
        });
        line.pop = { side: id.side, mon: name, ability: ab };
        break;
      }

      case '-enditem': {
        const id = parseIdent(parts[1]);
        const en = parts[2], item = ko(ITEM_KO, en);
        const name = monKo(id);
        const from = parts.find((p) => p.startsWith('[from]')) || '';
        const of = parseIdent((parts.find((p) => p.startsWith('[of]')) || '').replace('[of]', '').trim());
        if (parts.includes('[silent]')) break;
        let msg;
        if (parts.includes('[eat]')) {
          /* 다음 줄이 같은 열매의 회복이면 그쪽에서 "먹고 회복했다"로 한 번에 말한다 */
          const next = lines.slice(i + 1, i + 3).join('\n');
          msg = next.includes(`[from] item: ${en}`) ? null : `${eunNeun(name)} ${eulReul(item)}\n먹었다!`;
        } else if (/stealeat/.test(from)) msg = `${eunNeun(monKo(of))} ${name}의\n${eulReul(item)} 빼앗아 먹었다!`;
        else if (/Knock Off/.test(from)) msg = `${eunNeun(monKo(of))} ${name}의\n${eulReul(item)} 탁쳐서 떨어뜨렸다!`;
        else if (/gem/.test(from)) msg = `${euro(item)}\n기술의 위력이 올라갔다!`;
        else if (en === 'Focus Sash') msg = `${eunNeun(name)} 기합의띠로\n버텼다!`;
        else if (en === 'Air Balloon') msg = `${name}의 풍선이\n터져 버렸다!`;
        else if (en === 'White Herb') msg = `${eunNeun(name)} 하양허브로\n능력을 원래대로 되돌렸다!`;
        else if (en === 'Mental Herb') msg = `${eunNeun(name)} 멘탈허브로\n원래 상태로 돌아왔다!`;
        else msg = `${eunNeun(name)} ${eulReul(item)}\n사용했다!`;
        push('l-gold', `  ${name} ${item} 소모`, { msg, noField: !msg });
        break;
      }

      case 'detailschange': {
        /* 메가진화 등으로 모습이 바뀐다 — 이름(닉네임)은 그대로, 그림·타입만 바뀐다.
           자리 글자가 없는 줄(`p2: 리자몽`)은 필드에 없는 포켓몬 얘기다 — 메가 포켓몬이 쓰러진 뒤
           원래 모습으로 되돌리는 [silent] 줄이라, 받아들이면 쓰러진 자리에 일반 모습이 다시 나타난다 */
        if (!/^p[12][a-c]: /.test(parts[1] || '')) break;
        const id = parseIdent(parts[1]);
        if (id && mon[id.slot]) mon[id.slot] = { ...mon[id.slot], ...parseDetails(parts[2]) };
        break;
      }

      case '-mega': {
        /* 원작(6세대) 문구: 스톤과 키스톤이 반응 → 메가진화 */
        const id = parseIdent(parts[1]);
        const name = monKo(id);
        const stone = ko(ITEM_KO, parts[3] || '');
        const trainer = trainerName(names[id.side]) || '트레이너';
        const sp = mon[id.slot]?.species || '';
        const forme = /-Mega(?:-([XYZ]))?/.exec(sp);
        const megaName = `메가${ko(SPECIES_KO, parts[2] || sp)}${forme?.[1] && forme[1] !== 'Z' ? forme[1] : ''}`;
        push('l-gold', `  ${name} 메가진화 반응`, { noField: true, msg: `${name}의 ${gwaWa(stone)}\n${trainer}의 키스톤이 반응했다!`, anim: { k: 'mega', side: id.side, species: sp } });
        push('l-gold', `  ${name} → ${megaName}`, { msg: `${eunNeun(name)} ${euro(megaName)}\n메가진화했다!` });
        break;
      }

      case '-item': {
        const id = parseIdent(parts[1]);
        const item = ko(ITEM_KO, parts[2]);
        const name = monKo(id);
        const ab = abilitySource(parts);
        let msg;
        if (parts[2] === 'Air Balloon') msg = `${eunNeun(name)} 풍선으로\n떠 있다!`;
        else if (ab?.ability === 'Frisk') msg = `${eunNeun(monKo(ab.owner))} ${name}의\n${eulReul(item)} 통찰했다!`;
        else msg = `${eunNeun(name)} ${eulReul(item)}\n손에 넣었다!`;
        push('l-gold', `  ${name} ${item}`, { msg });
        break;
      }

      case '-weather': {
        const w = parts[1];
        const upkeep = parts.includes('[upkeep]');
        const info = WEATHER_MSG[w];
        if (w === 'none') {
          const prev = weather;
          weather = null;
          push('l-gold', '  날씨가 원래대로', { msg: WEATHER_MSG[prev]?.end || '날씨가 원래대로 돌아왔다!' });
          break;
        }
        const first = weather !== w;
        weather = w;
        push('l-gold', `  날씨: ${w}`, {
          msg: upkeep && !first ? info?.upkeep : info?.start,
          anim: { k: 'weather', weather: w },
        });
        break;
      }

      case '-start': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^move:\s*/, '');
        const name = monKo(id);
        const label = effectKo(what);
        /* 원작 문구가 있는 효과는 그 문구로 (사슬묶기는 parts[3]이 막힌 기술). [silent]는 자막 없이 */
        const extra = parts[3] && !parts[3].startsWith('[') ? ko(MOVE_KO, parts[3]) : null;
        const silent = parts.includes('[silent]');
        push('l-gold', `  ${name} ← ${label}`, {
          msg: silent ? null : VOLATILE_MSG[what]?.start ? VOLATILE_MSG[what].start(name, ofName(parts), extra) : `${name}의\n${label}!`,
          ...(silent ? {} : { anim: { k: 'fx', side: id.side, text: label, color: '#a878d8' } }),
        });
        break;
      }

      case '-end': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^move:\s*/, '');
        const name = monKo(id);
        const label = effectKo(what);
        let msg = null;
        if (parts.includes('[silent]')) msg = null;   // 하품 → 잠듦처럼 다음 줄이 알려 준다
        else if (parts.includes('[partiallytrapped]')) msg = TRAP_END(name, label);
        else if (VOLATILE_MSG[what]) msg = VOLATILE_MSG[what].end ? VOLATILE_MSG[what].end(name) : null;
        else msg = `${name}의 ${iGa(label)}\n풀렸다!`;
        push('l-sub', `  ${name} ${label} 해제`, { msg });
        break;
      }

      case '-activate': {
        const id = parseIdent(parts[1]);
        const rawWhat = parts[2] || '';
        const what = rawWhat.replace(/^(move|ability|item):\s*/, '');
        const name = monKo(id);
        if (rawWhat.startsWith('ability:')) {
          const ab = ko(ABILITY_KO, what);
          const line = push('l-sub', `  ${name} ${ab}`, { msg: what === 'Sturdy' ? `${eunNeun(name)}\n공격을 버텼다!` : null, noField: true });
          line.pop = { side: id.side, mon: name, ability: ab };
          break;
        }
        if (rawWhat.startsWith('item:')) {
          const item = ko(ITEM_KO, what);
          push('l-sub', `  ${name} ${item}`, { noField: true, msg: what === 'Focus Band' ? `${eunNeun(name)} 기합의머리띠로\n버텼다!` : what === 'Quick Claw' ? `${eunNeun(name)} 선제공격손톱으로\n행동이 빨라졌다!` : `${name}의\n${item}!` });
          break;
        }
        const label = effectKo(what);
        /* 조이기류가 걸림 / 혼란·헤롱헤롱·대타 발동 — 원작 문구 */
        const msg = TRAP_MSG[what] ? TRAP_MSG[what](name, ofName(parts) || '상대')
          : VOLATILE_MSG[what]?.activate ? VOLATILE_MSG[what].activate(name, ofName(parts))
            : `${name}의\n${label}!`;
        push('l-sub', `  ${name} ${label}`, { msg });
        break;
      }

      case '-prepare': {
        const id = parseIdent(parts[1]);
        const mv = ko(MOVE_KO, parts[2] || '');
        push('l-sub', `  ${monKo(id)} ${mv} 준비`, { msg: `${monKo(id)}의\n${mv}!` });
        break;
      }

      case '-singleturn': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^move:\s*/, '');
        push('l-sub', `  ${monKo(id)} ${ko(MOVE_KO, what)}`, { msg: `${monKo(id)}의\n${ko(MOVE_KO, what)}!` });
        break;
      }

      case 'cant': {
        const id = parseIdent(parts[1]);
        const reason = (parts[2] || '').replace(/^(ability|move):\s*/, '');
        const name = monKo(id);
        const f = CANT_MSG[reason];
        const blocked = parts[3] ? ko(MOVE_KO, parts[3]) : null;   // 도발·사슬묶기로 막힌 기술
        push('l-sub', `  ${name} 행동 불가 (${effectKo(reason)})`, {
          /* 잠듦·마비·얼음으로 못 움직일 때도 원작처럼 그 상태이상 연출이 돈다 */
          ...(['slp', 'par', 'frz'].includes(reason) ? { anim: { k: 'status', side: id.side, status: reason, text: ko(STATUS_KO, reason) } } : {}),
          msg: f ? f(eunNeun(name), blocked) : `${eunNeun(name)}
움직일 수 없다!`,
        });
        break;
      }

      case 'faint': {
        const id = parseIdent(parts[1]);
        if (hp[id.slot]) hp[id.slot] = { ...hp[id.slot], pct: 0, cur: 0 };
        downed[id.side] = (downed[id.side] || 0) + 1;
        const name = monKo(id);
        const line = push('l-sub', `  ${name} 쓰러졌다!`, {
          msg: `${eunNeun(name)}\n쓰러졌다!`,
          /* 실기는 쓰러질 때 그 포켓몬의 울음소리가 난다 */
          anim: { k: 'faint', side: id.side, species: mon[id.slot]?.species || null },
        });
        line.field = snapshot();
        pending = null;
        break;
      }

      case 'win':
        push('l-win', `▶ ${parts[1]} 승리! (${turn}턴)`, { msg: `${parts[1]}의 승리!`, anim: { k: 'win' } });
        break;

      case 'tie':
        push('l-win', '▶ 무승부', { msg: '승부가 나지 않았다!' });
        break;

      default:
        break;
    }

    /* 원작처럼 특성이 작동한 줄에는 그 주인 쪽에 특성 팝업을 띄운다 */
    if (abSrc?.owner && out.length > mark && !out[mark].pop) {
      out[mark].pop = { side: abSrc.owner.side, mon: monKo(abSrc.owner), ability: ko(ABILITY_KO, abSrc.ability) };
    }

    if (out.length > mark) {
      const f = snapshot();
      for (let k = mark; k < out.length; k++) {
        if (out[k].noField || out[k].field) continue;
        out[k].field = f;
      }
    }
  }
  return out;
}
