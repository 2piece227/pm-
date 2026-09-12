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
export function battleAmbience(match={}){
 const gym=gymById(match.gymId);
 const biome=['Rock','Ground'].includes(gym?.type)?'cave':['Grass','Bug','Poison'].includes(gym?.type)?'forest':gym?.type==='Water'?'lake':'dojo';
 const track=gym?`battle_${gym.region}_gym`:'battle_trainer';
 return {...THEMES[biome],biome,background:`${ROOT}/images/arenas/${biome}_bg.png`,platform:`${ROOT}/images/arenas/${biome}_b.png`,
  music:`${ROOT}/audio/bgm/${track}.mp3`,trackName:gym?`${gym.region==='kanto'?'관동':'성도'} 관장전`:'트레이너 배틀'};
}
