/**
 * 표시 레이어 — 쇼다운 프로토콜을 SPEC §5.3의 한글 리플레이 로그로 옮긴다.
 *
 * 시뮬 로직은 이 파일을 전혀 모른다. 같은 프로토콜 배열을 받아
 * 텍스트로 뿌리든 애니메이션으로 재생하든 여기서만 갈린다. (SPEC §1-3)
 *
 * 각 줄에는 표시용 부가정보가 함께 붙는다:
 *   field — 그 시점의 양쪽 필드 상태 (HP 바, 랭크)
 *   anim  — 배틀 화면 연출 지시 (돌진 / 피격 / 이펙트 / 기절)
 * 로그만 필요하면 text만 읽으면 되고, 관전모드는 anim까지 읽는다.
 */
import {
  ABILITY_KO, BOOST_KO, ITEM_KO, MOVE_KO, MOVE_TYPE, SPECIES_KO, SPECIES_TYPES, STATUS_KO, ko,
} from '../data/ko.js';

/** `p1a: Garchomp` → { slot:'p1a', side:'p1', name:'Garchomp' } */
function parseIdent(raw) {
  const m = /^(p[12])([a-c]?): (.+)$/.exec(raw || '');
  if (!m) return null;
  return { slot: m[1] + (m[2] || 'a'), side: m[1], name: m[3] };
}

/** `43/183` | `0 fnt` | `120/183 brn` → 퍼센트 */
function condPct(cond) {
  if (!cond) return null;
  if (/\bfnt\b/.test(cond)) return 0;
  const m = /^(\d+)\/(\d+)/.exec(cond);
  if (!m) return null;
  return Math.max(0, Math.round((Number(m[1]) / Number(m[2])) * 100));
}

/** `Garchomp, L50, M` → `Garchomp` */
const speciesOf = (details) => (details || '').split(',')[0].trim();

/**
 * 포켓몬 이름 — p2(상대 쪽)는 "상대 ○○"로 적는다.
 *
 * 풀이 36종뿐이라 6마리씩 뽑으면 **양 팀에 같은 종족이 들어가는 일이 아주 흔하다**
 * (실측: 19경기 중 38건). 그러면 "또가스 출전! ... 또가스 출전!"처럼 보여서
 * 같은 개체가 두 번 나온 것처럼 읽힌다. 쇼다운 리플레이와 같은 방식으로 구분한다.
 */
const monKo = (ident) => {
  if (!ident) return '?';
  const name = ko(SPECIES_KO, ident.name);
  return ident.side === 'p2' ? `상대 ${name}` : name;
};

/** AI가 뱉은 구조화된 판단 근거를 한 줄 텍스트로 */
function formatThink(t) {
  const opts = t.options.map((o) => {
    const label = o.kind === 'switch' ? `→${ko(SPECIES_KO, o.label)}` : ko(MOVE_KO, o.label);
    return `${label} ${Math.round(o.prob * 100)}%`;
  });
  return `[${t.trainer} T=${t.temperature.toFixed(2)}] ${opts.join(' / ')}`;
}

/**
 * @param {string[]} protocolLog  battle.log
 * @param {{p1:string,p2:string}} names 트레이너 표시 이름
 * @param {Array<{turn:number,side:string,think:object}>} think 판단 근거 (선택)
 * @returns {Array<{cls:string,text:string,field:object,anim:object|null}>}
 */
export function toKoreanLog(protocolLog, names, think = []) {
  const lines = protocolLog.slice(); // splice로 원본을 건드리지 않는다
  const out = [];
  const hp = {};        // slot → 현재 %
  const active = {};    // slot → ident
  const species = {};   // slot → 영문 종족명 (스프라이트 키)
  const boosts = {};    // slot → { atk:+2, ... }
  let pending = null;   // 진행 중인 공격기 (데미지 줄이 뒤따라온다)
  let turn = 0;

  const thinkByTurn = new Map();
  for (const t of think) {
    if (!thinkByTurn.has(t.turn)) thinkByTurn.set(t.turn, []);
    thinkByTurn.get(t.turn).push(formatThink(t.think));
  }

  const push = (cls, text, anim = null) => {
    const line = { cls, text, anim };
    out.push(line);
    return line;
  };
  const sideCls = (slot) => (slot?.startsWith('p1') ? 'l-blue' : 'l-red');
  const sideOf = (slot) => (slot?.startsWith('p1') ? 'p1' : 'p2');

  /* 표시 레이어가 HP 바를 그릴 수 있도록 각 줄에 필드 상태를 붙여둔다 */
  const snapshot = () => {
    const f = {};
    for (const side of ['p1', 'p2']) {
      const slot = `${side}a`;
      const id = active[slot];
      f[side] = {
        name: monKo(id),
        species: species[slot] || null,
        types: SPECIES_TYPES[species[slot]] || '',
        pct: hp[slot] ?? 100,
        boosts: Object.entries(boosts[slot] || {})
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `${ko(BOOST_KO, k)}${v > 0 ? '+' : ''}${v}`)
          .join(' '),
      };
    }
    return f;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw === '|') continue;
    const parts = raw.slice(1).split('|');
    const type = parts[0];
    const mark = out.length;

    /* |split|pN 다음 두 줄은 같은 사건의 비공개/공개 판본이다. 앞쪽만 쓰고 뒤쪽은 버린다. */
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
        active[id.slot] = id;
        species[id.slot] = speciesOf(parts[2]);
        hp[id.slot] = condPct(parts[3]) ?? 100;
        boosts[id.slot] = {}; // 교체하면 랭크는 초기화된다
        push(sideCls(id.slot), `${names[id.side] || id.side}: ${monKo(id)} 출전!`, {
          k: 'send',
          side: id.side,
        });
        pending = null;
        break;
      }

      case 'move': {
        const user = parseIdent(parts[1]);
        const target = parseIdent(parts[3]);
        const mvName = parts[2];
        const head = `${monKo(user)}의 ${ko(MOVE_KO, mvName)}` + (target ? ` → ${monKo(target)}` : '');
        const line = push(sideCls(user?.slot), head, {
          k: 'move',
          side: sideOf(user?.slot),
          target: target ? sideOf(target.slot) : null,
          type: MOVE_TYPE[mvName] || 'normal',
        });
        pending = target
          ? { line, head, slot: target.slot, before: hp[target.slot] ?? 100, hits: 0 }
          : null;
        break;
      }

      case '-damage':
      case '-heal': {
        const id = parseIdent(parts[1]);
        if (!id) break;
        const after = condPct(parts[2]);
        const before = hp[id.slot] ?? 100;
        hp[id.slot] = after ?? before;
        const delta = hp[id.slot] - before;
        const from = parts.find((p) => p.startsWith('[from]'));

        if (from) {
          /* 특성·도구·저주 등 부가 피해/회복은 별도 줄로 */
          const src = from.replace('[from]', '').trim().replace(/^(ability|item|move):\s*/, '');
          const label = ko(ABILITY_KO, ko(ITEM_KO, ko(MOVE_KO, src)));
          push('l-gold', `  ${label}: ${monKo(id)}  ${before}% → ${hp[id.slot]}%`, {
            k: 'fx',
            side: id.side,
            text: `${delta > 0 ? '+' : ''}${delta}%`,
            color: delta > 0 ? '#5ad06a' : '#e8705a',
          });
          break;
        }
        if (pending && pending.slot === id.slot) {
          /* 공격기의 데미지는 별도 줄을 만들지 않고 기술 줄에 합쳐 쓴다 */
          pending.hits++;
          const multi = pending.hits > 1 ? `  (${pending.hits}번 맞았다)` : '';
          pending.line.text = `${pending.head}  ${pending.before}% → ${hp[id.slot]}%${multi}`;
          pending.line.anim.hit = id.side;
          pending.line.field = snapshot(); // 데미지 반영 후 상태로 갱신
          break;
        }
        push('l-sub', `  ${monKo(id)}  ${before}% → ${hp[id.slot]}%`, {
          k: 'fx',
          side: id.side,
          text: `${delta > 0 ? '+' : ''}${delta}%`,
          color: delta > 0 ? '#5ad06a' : '#e8705a',
        });
        break;
      }

      case '-supereffective':
        push('l-sub', '  효과가 굉장했다!', pending && { k: 'fx', side: sideOf(pending.slot), text: '효과 굉장!', color: '#ffd24a' });
        break;
      case '-resisted':
        push('l-sub', '  효과가 별로인 듯하다…');
        break;
      case '-immune':
        push('l-sub', '  효과가 없는 것 같다…', pending && { k: 'fx', side: sideOf(pending.slot), text: '무효', color: '#c8c8c8' });
        break;
      case '-crit':
        push('l-sub', '  급소에 맞았다!', pending && { k: 'fx', side: sideOf(pending.slot), text: '급소!', color: '#ff8a5a' });
        break;
      case '-miss':
        push('l-sub', '  하지만 빗나갔다!');
        break;
      case '-fail':
        push('l-sub', '  하지만 실패했다!');
        break;

      case '-boost':
      case '-unboost': {
        const id = parseIdent(parts[1]);
        const key = parts[2];
        const delta = (type === '-boost' ? 1 : -1) * Number(parts[3]);
        if (!boosts[id.slot]) boosts[id.slot] = {};
        boosts[id.slot][key] = Math.max(-6, Math.min(6, (boosts[id.slot][key] || 0) + delta));
        const stat = ko(BOOST_KO, key);
        push('l-gold', `  ${monKo(id)} ${stat} ${delta > 0 ? '+' : ''}${delta}`, {
          k: 'fx',
          side: id.side,
          text: `${delta > 0 ? '▲ ' : '▼ '}${stat}`,
          color: delta > 0 ? '#5ad0d0' : '#e88a5a',
        });
        break;
      }

      case '-status': {
        const id = parseIdent(parts[1]);
        const st = ko(STATUS_KO, parts[2]);
        push('l-gold', `  ${monKo(id)}은(는) ${st} 상태가 되었다!`, {
          k: 'fx', side: id.side, text: st, color: '#d8a0e8',
        });
        break;
      }

      case '-ability': {
        const id = parseIdent(parts[1]);
        push('l-gold', `  ${monKo(id)}의 ${ko(ABILITY_KO, parts[2])}!`);
        break;
      }

      case '-start': {
        const id = parseIdent(parts[1]);
        const what = (parts[2] || '').replace(/^move:\s*/, '');
        push('l-gold', `  ${monKo(id)}에게 ${ko(MOVE_KO, what)}!`, {
          k: 'fx', side: id.side, text: ko(MOVE_KO, what), color: '#a878d8',
        });
        break;
      }

      case 'faint': {
        const id = parseIdent(parts[1]);
        hp[id.slot] = 0;
        push('l-sub', `  ${monKo(id)} 쓰러졌다!`, { k: 'faint', side: id.side });
        pending = null;
        break;
      }

      case 'win':
        push('l-win', `▶ ${parts[1]} 승리! (${turn}턴)`);
        break;

      case 'tie':
        push('l-win', '▶ 무승부');
        break;

      default:
        break; // 표시할 필요 없는 프로토콜 줄은 조용히 버린다
    }

    if (out.length > mark) {
      const f = snapshot();
      for (let k = mark; k < out.length; k++) if (!out[k].field) out[k].field = f;
    }
  }
  return out;
}
