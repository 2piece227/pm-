import { BATTLE_POLICIES, POLICY_CONFIG, policyId } from '../data/battle-policy.js';
import { MOVE_KO, SPECIES_KO, ko } from '../data/ko.js';

/** Observations only: no additional RNG, engine mutation or counterfactual simulation. */
export function analyseBattle(result, context = {}) {
  const observations = [];
  const counts = { sound:0, concern:0, switches:0, setup:0, heal:0, status:0, pressure:0 };
  let focusTurn = null, shockTurn = null;
  let logTurn=0;
  const executed=new Set();
  for(const line of result.log){
    const parts=line.split('|');
    if(parts[1]==='turn')logTurn=Number(parts[2]);
    if(parts[1]==='move' && parts[2]?.startsWith('p1'))executed.add(`${logTurn}:${parts[3]}`);
  }
  const rows = result.think.filter(r=>r.side==='p1' && !r.think.forced);
  for (const {turn,think:t} of rows) {
    const chosen = t.options[t.selected];
    if (!chosen) continue;
    const label = ko(chosen.kind==='switch'?SPECIES_KO:MOVE_KO,chosen.label);
    const notExecuted=chosen.kind==='move'&&!executed.has(`${turn}:${chosen.label}`);
    const executionNote=notExecuted?' (실제 사용 기록 없음: 행동 전 기절·행동 불가 등은 로그를 확인하세요.)':'';
    const gap = Math.max(...t.options.map(o=>o.score)) - chosen.score;
    if (gap >= POLICY_CONFIG.concernGap) {
      counts.concern++;
      observations.push({turn,kind:'review',text:`${label} 선택: 당시 평가에서 더 유리하게 본 대안이 있었습니다. 결과만으로 실수라고 단정할 수는 없습니다.${executionNote}`});
    } else if (gap < 1) {
      counts.sound++;
      if(chosen.kind==='move' && chosen.typeEffect>1 && !notExecuted) observations.push({turn,kind:'sound',text:`${label}: 상대 타입의 약점을 노린 공격을 선택해 사용했습니다. 당시 평가에서도 우선순위가 높았습니다.`});
    }
    if (chosen.kind==='switch') {
      counts.switches++;
      observations.push({turn,kind:'switch',text:`${label} 교체: ${chosen.safer?'받는 피해의 위험을 낮추는 방향이었습니다.':'예상 피해를 줄이는 교체는 아니었습니다. 파티 운용 의도를 검토하세요.'}`});
    } else {
      if (Object.hasOwn(counts,chosen.role)) counts[chosen.role]++;
      if (['setup','heal','status'].includes(chosen.role)) observations.push({turn,kind:chosen.role,text:`${label} 선택${t.vulnerable?' — 당장 큰 피해를 받을 수 있는 상황이었습니다.':'.'}${executionNote}`});
      if (chosen.perception?.trueEff === 0 && chosen.perception.felt > 0 && t.options.some(o=>o.perception?.trueEff>0)) {
        observations.push({turn,kind:'knowledge',text:`${label}: 타입상 통하지 않는 공격을 유효하게 평가했습니다. 상성 지식의 오판이 선택에 개입했습니다. 실제 기술 성공 여부는 전투 로그를 함께 확인하세요.`});
      }
    }
    if(t.pressure) counts.pressure++;
    if(t.focusAffected && focusTurn===null) focusTurn=turn;
    if(t.shock && shockTurn===null) shockTurn=turn;
  }
  const summary = counts.pressure > rows.length/2
    ? '많은 대면에서 상대의 예상 공격 압력이 더 컸습니다. 트레이너 교체에 앞서 파티 상성과 레벨·기술 구성을 점검하세요.'
    : counts.concern > 0 ? '유리하게 평가한 대안 대신 다른 행동을 고른 장면이 있습니다. 해당 턴과 방침을 함께 검토하세요.'
    : '기록된 선택은 대체로 당시 평가와 일치했습니다. 승패 원인을 판단력 하나로 단정하기 어렵습니다.';
  return { version:1, policy:policyId(context.policy), policyName:BATTLE_POLICIES[policyId(context.policy)].name,
    summary, counts, observations, focusTurn, shockTurn,
    mentalAffected:(context.mentalDebuff||0)>0,
    lossStreak:context.lossStreak||0,
    limitation:'피해와 행동 평가는 근사치이며 실제 최적수나 승패의 인과관계를 확정하지 않습니다. 회복·상태이상 평가는 현재 제한적입니다.' };
}
