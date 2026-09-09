// Region catalog; playable maps use the community image and coordinates in town-map.js.
// Playable encounter data remains in routes.js; preview regions cannot dispatch trainers.
export const ATLAS_REGIONS = [
  { id:'kanto', name:'관동', gen:1, subtitle:'첫 파트너와 시작하는 여정', playable:true },
  { id:'johto', name:'성도', gen:2, subtitle:'오래된 마을과 숲을 따라', playable:true },
  { id:'hoenn', name:'호연', gen:3, subtitle:'육지와 바다가 만나는 지방' },
  { id:'sinnoh', name:'신오', gen:4, subtitle:'산맥을 중심으로 이어지는 지방' },
  { id:'unova', name:'하나', gen:5, subtitle:'도시와 자연을 연결하는 여정' },
  { id:'kalos', name:'칼로스', gen:6, subtitle:'중심 도시에서 뻗어 나가는 길' },
  { id:'alola', name:'알로라', gen:7, subtitle:'각자의 이야기를 품은 네 섬' },
  { id:'galar', name:'가라르', gen:8, subtitle:'남쪽 들판에서 북쪽 도시까지' },
  { id:'paldea', name:'팔데아', gen:9, subtitle:'넓은 대지에서 펼쳐지는 모험' },
];

export const REGION_CHAINS = {
  kanto: [
    'pallet route1 viridian route2 viridianforest pewter route3 mtmoon route4 cerulean route24 route25',
    'viridian route22 route23 indigo', 'cerulean route5 saffron route6 vermilion route11 route12',
    'cerulean route9 rocktunnel lavender route12 route13 fuchsia route18 route17 route16 celadon',
    'celadon route7 saffron route8 lavender', 'fuchsia route20 seafoam cinnabar route21 pallet',
  ],
  johto: [
    'newbark route29 cherrygrove route30 route31 violet route32 unioncave azalea ilex route34 goldenrod route35 natpark route36 route37 ecruteak',
    'ecruteak route38 olivine route40 cianwood', 'ecruteak route42 mahogany route43 lakeofrage',
    'mahogany route44 icepath blackthorn route45 route46 route29', 'newbark route27', 'route36 violet',
  ],
};
