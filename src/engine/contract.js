/**
 * 유스 계약 협상 — 원클릭 영입 대신 조건을 걸고 판정받는다. (SPEC §5.3 / §3.10)
 *
 * 예전 시장 탭은 버튼 한 번에 영입이 끝났다. 그건 "이적료를 낼 자금이 있느냐"만 묻는
 * 구조라 결정이 없다. 여기서는 **플레이어가 조건을 짜고, 후보가 자기 선호대로 판정한다.**
 *
 * 유스 계약에는 위약금(바이아웃)이 없다 — 신규 영입이라 남의 소속사에서 빼오는 게 아니다.
 *
 * 판정:
 *   항목마다 충족도(0~1.2)를 구하고 중요도로 가중평균한다.
 *   ACCEPT_AT 이상이면 수락. 아니면 부족한 항목을 이유로 돌려준다.
 *   평판은 제안으로 못 바꾸는 항목이라, 간판을 보는 후보(블루)는 다른 항목으로 메워야 한다.
 */

import { iGa, eunNeun } from '../data/ko.js';

/** 계약서 항목 — 화면 입력과 1:1 */
export const OFFER_FIELDS = [
  { key: 'wage', label: '주급', unit: '/주', min: 1, max: 60, step: 1,
    hint: '매주 나가는 고정 급여.' },
  { key: 'signing', label: '영입 개런티', unit: '', min: 0, max: 2000, step: 50,
    hint: '계약할 때 한 번 지급하는 사이닝 보너스.' },
  { key: 'proRaise', label: '프로 승급 시 급여', unit: '%', min: 100, max: 250, step: 10,
    hint: '유스를 졸업해 정식 로스터에 오르면 주급이 이 비율로 오른다.' },
  { key: 'badgeBonus', label: '뱃지 달성 보너스', unit: '/개', min: 0, max: 400, step: 20,
    hint: '체육관 뱃지를 하나 딸 때마다 지급.' },
  { key: 'years', label: '계약 기간', unit: '년', min: 1, max: 6, step: 1,
    hint: '길수록 안정적이지만, 짧게 끊고 싶어하는 후보도 있다.' },
];

/** 협상 시작값 */
export const DEFAULT_OFFER = { wage: 8, signing: 0, proRaise: 100, badgeBonus: 0, years: 3 };

/** 이 이상이면 수락 */
const ACCEPT_AT = 0.78;
/** 이 아래인 항목은 "부족하다"고 짚어준다 */
const WEAK_AT = 0.7;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 항목 하나의 충족도 0~1.2 */
function satisfaction(pref, offered) {
  if (pref.kind === 'near') {
    /* 원하는 값에서 멀어질수록 깎인다. 기간처럼 "길다고 좋은 게 아닌" 항목 */
    const span = Math.max(1, pref.want);
    return clamp(1 - Math.abs(offered - pref.want) / span, 0, 1);
  }
  if (pref.want <= 0) return 1;            // 기준이 0이면 뭘 줘도 만족
  return clamp(offered / pref.want, 0, 1.2);
}


const FIELD_KO = {
  reputation: '소속사 평판', wage: '주급', signing: '영입 개런티',
  proRaise: '프로 승급 시 급여', badgeBonus: '뱃지 보너스', years: '계약 기간',
};

/**
 * 제안을 판정한다.
 *
 * @param {object} candidate  YOUTH_CANDIDATES의 항목
 * @param {object} offer      { wage, signing, proRaise, badgeBonus, years }
 * @param {object} agency     플레이어 소속사 (평판·자금을 본다)
 * @returns {{ accept, score, reasons, weak, afford }}
 */
export function evaluateOffer(candidate, offer, agency) {
  const values = { ...offer, reputation: agency?.reputation ?? 0 };

  let sum = 0;
  let total = 0;
  const weak = [];
  for (const [key, pref] of Object.entries(candidate.pref)) {
    if (!pref.weight) continue;
    const sat = satisfaction(pref, values[key] ?? 0);
    sum += sat * pref.weight;
    total += pref.weight;
    if (sat < WEAK_AT) weak.push({ key, label: FIELD_KO[key] || key, sat, want: pref.want, kind: pref.kind });
  }
  const score = total ? sum / total : 1;

  /* 사이닝 보너스는 계약하는 순간 나간다 — 낼 돈이 없으면 애초에 성립하지 않는다 */
  const afford = (agency?.funds ?? 0) >= (offer.signing || 0);

  weak.sort((a, b) => a.sat - b.sat);
  return {
    accept: afford && score >= ACCEPT_AT,
    score,
    afford,
    weak,
    reasons: buildReasons({ candidate, score, weak, afford }),
  };
}

function buildReasons({ candidate, score, weak, afford }) {
  if (!afford) return ['영입 개런티를 지급할 자금이 부족합니다.'];
  if (score >= ACCEPT_AT) {
    return [weak.length
      ? '아쉬운 부분은 있지만, 이 정도면 하겠습니다.'
      : '좋습니다. 여기서 시작하겠습니다.'];
  }

  const out = [];
  const worst = weak[0];
  if (worst) {
    if (worst.key === 'reputation') {
      out.push(`아직 ${iGa(candidate.name)} 이름을 걸 만한 소속사는 아니라고 봅니다.`);
    } else if (worst.kind === 'near') {
      out.push(`${iGa(worst.label)} 생각과 다릅니다. ${worst.want} 쪽을 원합니다.`);
    } else {
      out.push(`${iGa(worst.label)} 부족합니다.`);
    }
  }
  for (const w of weak.slice(1, 3)) {
    out.push(w.kind === 'near'
      ? `${w.label}도 조정이 필요합니다.`
      : `${w.label}도 조금 더 봐주셨으면 합니다.`);
  }
  if (score >= ACCEPT_AT - 0.08) out.push('조금만 더 얹어주시면 될 것 같습니다.');
  return out;
}

/** 계약이 성사됐을 때 트레이너에 박아둘 계약 내용 */
export function contractFrom(offer, day = 1) {
  return {
    kind: 'youth',
    wage: offer.wage,
    signing: offer.signing,
    proRaise: offer.proRaise,
    badgeBonus: offer.badgeBonus,
    years: offer.years,
    signedOnDay: day,
    buyout: null,   // 유스 계약엔 위약금이 없다 (§5.3)
  };
}
