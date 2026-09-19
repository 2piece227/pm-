// Tournament-only regions: this does not unlock maps or assign canonical named affiliations.
export const INTERNATIONAL_REGIONS = [
  ['kanto-johto','관동·성도'],['hoenn','호연'],['sinnoh','신오'],['unova','하나'],
  ['kalos','칼로스'],['alola','알로라'],['galar','가라르'],['paldea','팔데아'],
].map(([id,name])=>({id,name}));
export const PWT = {
  gymDay:130,finalQualifierDay:138,swissDays:[150,151,152,153,154],knockoutDays:[156,157,158,159],
  breakStart:130,breakEnd:159,lockEnd:365,level:50,rosterSize:6,
  // Selection of the combined region's gyms is an explicit design decision.
  gymRegions:['kanto','johto'],
  stats:{judge:15,ops:15,focus:15,know:15,mental:16},
  prize:6000,runnerPrize:3000,reputation:20,
};
export const dayInSeason=day=>(day-1)%365+1;
export const pwtBreak=game=>dayInSeason(game.day)>=PWT.breakStart&&dayInSeason(game.day)<=PWT.breakEnd;
export function internationallyLocked(game,id){
  return (game.international?.seasons||[]).some(s=>game.day>=s.start&&game.day<=s.lockUntil&&s.representatives?.includes(id));
}
