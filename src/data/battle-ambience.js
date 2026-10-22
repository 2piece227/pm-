/** Stable upstream revision: source and attribution in CREDITS.md. */
import { gymById } from './gyms.js';
export const AMBIENCE_REVISION='cc5326700576bb2f749f0258f9044bc8c6ca4ce5';
const ROOT=`https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/${AMBIENCE_REVISION}`;
const THEMES={
 dojo:{name:'체육관 배틀 코트',crop:[152,58,128,32]},
 cave:{name:'바위 배틀 코트',crop:[152,58,128,32]},
 forest:{name:'숲 배틀 코트',crop:[150,47,135,43]},
 lake:{name:'물가 배틀 코트',crop:[152,58,128,32]},
};
/* 배틀 필드 — Pokémon Showdown의 도트 배틀 배경(public/assets/battle-bg, CREDITS.md).
   관장 타입·체육관 분위기로 고른다. 대회는 도시 경기장. */
const FIELD_BY_TYPE={Rock:'earthycave',Ground:'desert',Water:'beach',Electric:'thunderplains',Grass:'forest',Bug:'forest',Poison:'dampcave',
 Psychic:'city',Fire:'volcanocave',Flying:'mountain',Normal:'meadow',Ghost:'dampcave',Fighting:'mountain',Steel:'beachshore',Ice:'icecave',Dragon:'volcanocave',Dark:'city',Fairy:'meadow'};
const FIELD_NAME={earthycave:'바위 동굴',desert:'사막',beach:'해변',thunderplains:'뇌운 평원',forest:'숲',dampcave:'습한 동굴',city:'도시 경기장',volcanocave:'화산 동굴',
 mountain:'산',meadow:'초원',beachshore:'바닷가',icecave:'얼음 동굴',route:'도로',river:'강가',deepsea:'심해'};
export function battleField(match={}){
 const gym=gymById(match.gymId);
 const field=gym?FIELD_BY_TYPE[gym.type]||'meadow':match.eventName?'city':'route';
 return {field,fieldName:FIELD_NAME[field],url:`${(import.meta.env?.BASE_URL??'/')}assets/battle-bg/${field}.png`};
}
export function battleAmbience(match={}){
 const gym=gymById(match.gymId);
 const biome=['Rock','Ground'].includes(gym?.type)?'cave':['Grass','Bug','Poison'].includes(gym?.type)?'forest':gym?.type==='Water'?'lake':'dojo';
 const track=gym?`battle_${gym.region}_gym`:'battle_trainer';
 return {...THEMES[biome],biome,...battleField(match),background:`${ROOT}/images/arenas/${biome}_bg.png`,platform:`${ROOT}/images/arenas/${biome}_b.png`,
  music:`${ROOT}/audio/bgm/${track}.mp3`,trackName:gym?`${gym.region==='kanto'?'관동':'성도'} 관장전`:'트레이너 배틀'};
}
