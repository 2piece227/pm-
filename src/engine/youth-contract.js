/** Signing and starter selection are separate, resumable transactions. */
import { evaluateOffer, contractFrom } from './contract.js';
import { playerAgency, rosterLock, signYouth } from './game.js';
import { createTrainer } from '../data/agencies.js';
import { youthStats } from '../data/youth-candidates.js';
import { STARTERS } from '../data/species-pool.js';
import { makeStarterParty } from './team-builder.js';
import { makeRng } from './run-battle.js';

export function agreeYouth(game,candidate,offer){
  const agency=playerAgency(game);
  if(game.pendingStarter||rosterLock(game)||agency.roster.some(t=>t.id===`y-${candidate.id}`))throw new Error('현재 이 후보와 추가 계약할 수 없습니다.');
  const result=evaluateOffer(candidate,offer,agency);
  if(!result.accept)throw new Error(result.reasons.join(' '));
  const trainer=createTrainer({id:`y-${candidate.id}`,name:candidate.name,agencyId:agency.id,stats:youthStats(candidate),potential:{...candidate.potential},party:[]});
  signYouth(game,trainer,contractFrom(offer,game.day));
  game.pendingStarter={trainerId:trainer.id,candidateId:candidate.id,offer:{...offer},response:result.reasons.join(' ')};
  game.league.newsFeed.unshift({day:game.day,text:`${trainer.name} 유스 계약 체결 · 첫 파트너 선택 대기`});
  return trainer;
}
export async function completeStarter(game,species){
  const pending=game.pendingStarter;
  if(!pending||!STARTERS.some(s=>s.species===species))throw new Error('선택 가능한 첫 파트너를 확인하세요.');
  const trainer=playerAgency(game).roster.find(t=>t.id===pending.trainerId);
  if(!trainer||trainer.party.length)throw new Error('파트너 선택 상태를 확인하세요.');
  const party=await makeStarterParty(makeRng((game.seed^0x9e37^game.day)>>>0),species);
  if(game.pendingStarter!==pending||trainer.party.length)throw new Error('이미 파트너를 선택했습니다.');
  trainer.party=party;delete game.pendingStarter;
  return trainer;
}
