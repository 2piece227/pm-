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
  STATUS_BADGE, STATUS_KO, STATUS_MSG, STATUS_TICK, WEATHER_MSG, ko,
} from '../data/ko.js';

/* ---------------- 한국어 조사 ---------------- */

/** 마지막 글자에 받침이 있나 */
function hasJong(s) {
  if (!s) return false;
  const c = s.charCodeAt(s.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false; // 한글 음절이 아니면 받침 없음 취급
  return (c - 0xac00) % 28 !== 0;
}
const eunNeun = (s) => `${s}${hasJong(s) ? '은' : '는'}`;
const eulReul = (s) => `${s}${hasJong(s) ? '을' : '를'}`;
const iGa = (s) => `${s}${hasJong(s) ? '이' : '가'}`;

/* ---------------- 파싱 ---------------- */

/** `p1a: Garchomp` → { slot:'p1a', side:'p1', name:'Garchomp' } */
function parseIdent(raw) {
  const m = /^(p[12])([a-c]?): (.+)$/.exec(raw || '');
  if (!m) return null;
  return { slot: m[1] + (m[2] || 'a'), side: m[1], name: m[3] };
}

/** `43/183` | `0 fnt` | `120/183 brn` → { pct, cur, max, status } */
function parseCond(cond) {
  if (!cond) return null;
  if (/\bfnt\b/.test(cond)) return { pct: 0, cur: 0, max: null, status: null };
  const m = /^(\d+)\/(\d+)(?:\s+(\w+))?/.exec(cond);
  if (!m) return null;
  const cur = Number(m[1]);
  const max = Number(m[2]);
  return { pct: Math.max(0, Math.round((cur / max) * 100)), cur, max, status: m[3] || null };
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
  return `[${t.trainer} T=${t.temperature.toFixed(2)}] ${opts.join(' / ')}`;
}

/** [from] Sandstorm / [from] item: Leftovers → 'Sandstorm' / 'Leftovers' */
function fromSource(parts) {
  const raw = parts.find((p) => p.startsWith('[from]'));
  if (!raw) return null;
  return raw.replace('[from]', '').trim().replace(/^(ability|item|move):\s*/, '');
}

/* ---------------- 본체 ---------------- */

export function toKoreanLog(protocolLog, names, think = []) {
  const lines = protocolLog.slice();
  const out = [];

  const mon = {};      // slot → { ident, species, level, gender }
  const hp = {};       // slot → { pct, cur, max }
  const status = {};   // slot → 'brn' | ...
  const boosts = {};   // slot → { atk: +2 }
  let weather = null;
  let pending = null;  // 진행 중인 공격기
  let turn = 0;

  const thinkByTurn = new Map();
  for (const t of think) {
    if (!thinkByTurn.has(t.turn)) thinkByTurn.set(t.turn, []);
    thinkByTurn.get(t.turn).push(formatThink(t.think));
  }

  const push = (cls, text, { msg = null, anim = null } = {}) => {
    const line = { cls, text, msg, anim };
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
        name: m ? monKo(m.ident) : '—',
        species: m?.species || null,
        types: SPECIES_TYPES[m?.species] || '',
        level: m?.level ?? 50,
        gender: m?.gender || null,
        pct: h?.pct ?? 100,
        cur: h?.cur ?? null,
        max: h?.max ?? null,
        status: STATUS_BADGE[status[slot]] || null,
        boosts: Object.entries(boosts[slot] || {})
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `${ko(BOOST_KO, k)}${v > 0 ? '+' : ''}${v}`)
          .join(' '),
      };
    }
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

    switch (type) {
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
        hp[id.slot] = cond || { pct: 100, cur: null, max: null };
        status[id.slot] = cond?.status || null;
        boosts[id.slot] = {};

        const name = ko(SPECIES_KO, id.name);
        const trainer = names[id.side] || id.side;
        /* 실제 게임 문구: 내 쪽은 "가랏!", 상대 쪽은 "○○은(는) ○○를 내보냈다!" */
        const msg = id.side === 'p1'
          ? `가랏! ${name}!`
          : `${eunNeun(trainer)}\n${eulReul(name)} 내보냈다!`;
        push(sideCls(id.slot), `${trainer}: ${monKo(id)} 출전!`, {
          msg,
          anim: { k: 'send', side: id.side },
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
        hp[id.slot] = cond || hp[id.slot];
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
          else if (src === 'Leftovers') msg = `${eunNeun(name)} 남은음식으로\n체력을 회복했다!`;
          else if (src === 'Life Orb') msg = `${eunNeun(name)} 생명의구슬로\n데미지를 입었다!`;
          else {
            const label = ko(ABILITY_KO, ko(ITEM_KO, ko(MOVE_KO, src)));
            msg = delta > 0
              ? `${eunNeun(name)} ${label}(으)로\n체력을 회복했다!`
              : `${label}!\n${eunNeun(name)} 데미지를 입었다!`;
          }
          const label = ko(ABILITY_KO, ko(ITEM_KO, ko(MOVE_KO, src)));
          push('l-gold', `  ${label}: ${name}  ${before}% → ${after}%`, {
            msg,
            anim: {
              k: 'fx', side: id.side,
              text: `${delta > 0 ? '+' : ''}${delta}%`,
              color: delta > 0 ? '#5ad06a' : '#e8705a',
            },
          });
          break;
        }

        if (pending && pending.slot === id.slot) {
          /* 공격기 데미지는 새 줄을 만들지 않고 기술 줄에 합쳐 쓴다 */
          pending.hits++;
          const multi = pending.hits > 1 ? `  (${pending.hits}번 맞았다)` : '';
          pending.line.text = `${pending.head}  ${pending.before}% → ${after}%${multi}`;
          pending.line.anim.hit = id.side;
          pending.line.field = snapshot();
          break;
        }

        push('l-sub', `  ${name}  ${before}% → ${after}%`, {
          anim: {
            k: 'fx', side: id.side,
            text: `${delta > 0 ? '+' : ''}${delta}%`,
            color: delta > 0 ? '#5ad06a' : '#e8705a',
          },
        });
        break;
      }

      case '-sethp': {
        const id = parseIdent(parts[1]);
        const cond = parseCond(parts[2]);
        if (id && cond) hp[id.slot] = cond;
        break;
      }

      case '-supereffective':
        push('l-sub', '  효과가 굉장했다!', {
          msg: '효과가 굉장했다!',
          anim: pending && { k: 'fx', side: sideOf(pending.slot), text: '효과 굉장!', color: '#ffd24a' },
        });
        break;
      case '-resisted':
        push('l-sub', '  효과가 별로인 것 같다…', { msg: '효과가 별로인 것 같다…' });
        break;
      case '-immune': {
        const id = parseIdent(parts[1]);
        push('l-sub', '  효과가 없는 것 같다…', {
          msg: `하지만 ${monKo(id)}에게는\n효과가 없었다…`,
          anim: id && { k: 'fx', side: id.side, text: '무효', color: '#c8c8c8' },
        });
        break;
      }
      case '-crit':
        push('l-sub', '  급소에 맞았다!', {
          msg: '급소에 맞았다!',
          anim: pending && { k: 'fx', side: sideOf(pending.slot), text: '급소!', color: '#ff8a5a' },
        });
        break;
      case '-miss': {
        const id = parseIdent(parts[2]) || parseIdent(parts[1]);
        push('l-sub', '  하지만 빗나갔다!', { msg: `하지만 ${monKo(id)}에게는\n맞지 않았다!` });
        break;
      }
      case '-fail':
        push('l-sub', '  하지만 실패했다!', { msg: '하지만 실패했다!' });
        break;

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
          anim: { k: 'fx', side: id.side, text: ko(STATUS_KO, st), color: '#d8a0e8' },
        });
        break;
      }

      case '-curestatus': {
        const id = parseIdent(parts[1]);
        const st = parts[2];
        if (id && status[id.slot] === st) status[id.slot] = null;
        const name = monKo(id);
        push('l-gold', `  ${name} ${ko(STATUS_KO, st)} 회복`, {
          msg: `${name}의 ${iGa(ko(STATUS_KO, st))}\n나았다!`,
        });
        break;
      }

      case '-ability': {
        const id = parseIdent(parts[1]);
        const ab = ko(ABILITY_KO, parts[2]);
        const name = monKo(id);
        /* 5세대 실기는 특성을 자막으로 알린다 — 별도 팝업 박스가 아니다 */
        push('l-gold', `  ${name}의 ${ab}!`, {
          msg: `${name}의\n${ab}!`,
          anim: { k: 'ability', side: id.side, ability: ab, mon: name },
        });
        break;
      }

      case '-enditem': {
        const id = parseIdent(parts[1]);
        const item = ko(ITEM_KO, parts[2]);
        const name = monKo(id);
        push('l-gold', `  ${name} ${item} 소모`, { msg: `${name}의 ${iGa(item)}\n없어졌다!` });
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
        const label = ko(MOVE_KO, what);
        push('l-gold', `  ${name} ← ${label}`, {
          msg: what === 'confusion' ? `${eunNeun(name)} 혼란에 빠졌다!` : `${name}의\n${label}!`,
          anim: { k: 'fx', side: id.side, text: label, color: '#a878d8' },
        });
        break;
      }

      case '-end': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^move:\s*/, '');
        const name = monKo(id);
        push('l-sub', `  ${name} ${ko(MOVE_KO, what)} 해제`, {
          msg: what === 'confusion' ? `${name}의 혼란이 풀렸다!` : `${name}의 ${ko(MOVE_KO, what)}이(가) 풀렸다!`,
        });
        break;
      }

      case '-activate': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^(move|ability):\s*/, '');
        const label = ko(ABILITY_KO, ko(MOVE_KO, what));
        push('l-sub', `  ${monKo(id)} ${label}`, { msg: `${monKo(id)}의\n${label}!` });
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
        push('l-sub', `  ${name} 행동 불가 (${reason})`, {
          msg: f ? f(eunNeun(name)) : `${eunNeun(name)}
움직일 수 없다!`,
        });
        break;
      }

      case 'faint': {
        const id = parseIdent(parts[1]);
        if (hp[id.slot]) hp[id.slot] = { ...hp[id.slot], pct: 0, cur: 0 };
        const name = monKo(id);
        push('l-sub', `  ${name} 쓰러졌다!`, {
          msg: `${eunNeun(name)}\n쓰러졌다!`,
          anim: { k: 'faint', side: id.side },
        });
        pending = null;
        break;
      }

      case 'win':
        push('l-win', `▶ ${parts[1]} 승리! (${turn}턴)`, { msg: `${parts[1]}의 승리!` });
        break;

      case 'tie':
        push('l-win', '▶ 무승부', { msg: '승부가 나지 않았다!' });
        break;

      default:
        break;
    }

    if (out.length > mark) {
      const f = snapshot();
      for (let k = mark; k < out.length; k++) if (!out[k].field) out[k].field = f;
    }
  }
  return out;
}
