// Provisional dates, rewards and ranking weights; future international events remain planned.
export const CUP_SCHEDULE = [
  {kind:'youth',days:[7,21],label:'유스컵',eligibility:'youth-under-eight',ranking:false,weight:0},
  {kind:'city',days:[35,63,91,189,224,266],label:'시티컵',eligibility:'registered-pro',ranking:true,weight:1},
  {kind:'local',days:[112],label:'로컬컵',eligibility:'open',ranking:true,weight:0.25},
];
export const RANKING = {base:1500,k:24,scale:400,minMatches:3,formWindow:5,formWeight:20,
  placement:[40,24,12,4],pointsWeight:0.5,lastCityMultiplier:1.1,
  inactiveAfter:60,inactivePerDay:0.1,maxInactivePenalty:20,localSeedBonus:30};
export const SEASON = { days:365, youthDays:[7,21], registrationLead:6, capacity:8,
  prize:300, runnerPrize:150, reputation:1, experience:120, growth:0.01,
  fatigue:8, npcBase:0.6, npcAggressionWeight:0.4,
  npcThreshold:0.25, prizeMultipliers:{youth:1,city:3,local:8,pwt:20,pwc:100} };
export const SEASON_PHASES = [
  ['offseason','비시즌 · 유스컵',1],['city-first','시티컵 전반기',29],
  ['local','로컬컵',100],['road-pwt','Road to PWT',130],['pwt','PWT',150],
  ['city-second','시티컵 후반기',180],['regional','지역 리그',280],
  ['seeds','PWC 시드 결정전',310],['pwc','PWC',330],
].map(([id,name,start])=>({id,name,start,implemented:['offseason','city-first','city-second','local','road-pwt','pwt'].includes(id)}));
