// Provisional dates, rewards and ranking weights; future international events remain planned.
export const CUP_SCHEDULE = [
  {kind:'youth',days:[7,21],label:'유스컵',eligibility:'youth-under-eight',ranking:false,weight:0},
  {kind:'city',days:[35,63,91,189,224,266],label:'시티컵',eligibility:'registered-pro',ranking:true,weight:1},
  {kind:'local',days:[112],label:'로컬컵',eligibility:'open',ranking:true,weight:0.25},
  /* 타입컵 — 지정 타입 포켓몬만, 유스부·오픈부 동시 개최, 시즌 순위 미반영 (docs/competition-v1.md §6.4) */
  {kind:'type',days:[49,77,172,203,245],label:'타입컵',eligibility:'type',ranking:false,weight:0},
];
/** 타입컵 [임시] — 정원·상금 배수 */
export const TYPE_CUP = { youthCapacity: 8, openCapacity: 16, youthPrize: 1.5, openPrize: 2, perSeason: 5 };
export const TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
export const TYPE_NAME_KO = {Normal:'노말',Fire:'불꽃',Water:'물',Grass:'풀',Electric:'전기',Ice:'얼음',Fighting:'격투',Poison:'독',Ground:'땅',Flying:'비행',Psychic:'에스퍼',Bug:'벌레',Rock:'바위',Ghost:'고스트',Dragon:'드래곤',Dark:'악',Steel:'강철',Fairy:'페어리'};
/** 타입 관장이 있는 관동·성도 체육관 도시 (표시용) [임시] */
export const TYPE_CITY = {Rock:'회색시티',Water:'블루시티',Electric:'갈색시티',Grass:'무지개시티',Poison:'연분홍시티',Psychic:'노랑시티',Fire:'홍련마을',Ground:'상록시티',Flying:'도라지시티',Bug:'고동마을',Normal:'금빛시티',Ghost:'인주시티',Fighting:'진청시티',Steel:'진청시티',Ice:'황토마을',Dragon:'검은먹시티'};
export const RANKING = {base:1500,k:24,scale:400,minMatches:3,formWindow:5,formWeight:20,
  placement:[40,24,12,4],pointsWeight:0.5,lastCityMultiplier:1.1,
  inactiveAfter:60,inactivePerDay:0.1,maxInactivePenalty:20,localSeedBonus:30};
export const SEASON = { days:365, youthDays:[7,21], registrationLead:6, capacity:8,
  prize:300, runnerPrize:150, reputation:1, experience:120, growth:0.01,
  fatigue:8, npcBase:0.6, npcAggressionWeight:0.4,
  npcThreshold:0.25, prizeMultipliers:{youth:1,city:3,local:8,pwt:20,pwc:100} };
export const SEASON_PHASES = [
  ['offseason','비시즌 · 유스컵',1],['city-first','시티컵 전반기',29],
  ['local','로컬컵',100],['road-pwt','Road to PWT',130],['pwt','PWT',148],
  ['city-second','시티컵 후반기',180],['regional','지역 리그',280],
  ['seeds','PWC 시드 결정전',310],['pwc','PWC',328],['rest','휴식기',358],
].map(([id,name,start])=>({id,name,start,implemented:true}));
