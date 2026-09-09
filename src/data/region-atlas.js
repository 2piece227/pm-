// Shared atlas style. These are authored schematic silhouettes, not geographic originals.
// Playable encounter data remains in routes.js; preview regions cannot dispatch trainers.
export const ATLAS_REGIONS = [
  { id:'kanto', name:'관동', gen:1, subtitle:'첫 파트너와 시작하는 여정', playable:true, land:'80,70 370,40 610,75 655,190 625,340 525,380 440,315 345,385 200,370 120,285' },
  { id:'johto', name:'성도', gen:2, subtitle:'오래된 마을과 숲을 따라', playable:true, land:'75,115 190,75 295,95 400,45 635,90 650,350 490,380 360,310 250,355 185,260 65,225' },
  { id:'hoenn', name:'호연', gen:3, subtitle:'육지와 바다가 만나는 지방', land:'110,270 75,190 140,75 330,65 390,155 320,250 235,290|460,220 505,170 555,210 530,270|570,105 615,85 635,135 595,160' },
  { id:'sinnoh', name:'신오', gen:4, subtitle:'산맥을 중심으로 이어지는 지방', land:'135,340 85,200 165,100 295,90 345,35 465,65 550,145 530,245 440,350 305,315|590,65 645,50 665,105 615,125' },
  { id:'unova', name:'하나', gen:5, subtitle:'도시와 자연을 연결하는 여정', land:'130,340 95,130 200,75 315,100 350,270 280,345|395,335 380,95 485,65 605,125 590,320 495,375' },
  { id:'kalos', name:'칼로스', gen:6, subtitle:'중심 도시에서 뻗어 나가는 길', land:'110,150 200,110 260,45 450,65 495,130 620,170 565,295 440,330 370,390 245,300 145,285' },
  { id:'alola', name:'알로라', gen:7, subtitle:'각자의 이야기를 품은 네 섬', land:'85,120 155,80 220,120 180,190 110,185|295,95 365,65 410,160 350,225 285,185|430,270 505,215 580,255 550,345 460,360|580,100 645,70 685,140 640,185' },
  { id:'galar', name:'가라르', gen:8, subtitle:'남쪽 들판에서 북쪽 도시까지', land:'280,385 245,300 285,245 260,170 285,95 325,40 435,55 465,135 435,220 450,280 395,375' },
  { id:'paldea', name:'팔데아', gen:9, subtitle:'넓은 대지에서 펼쳐지는 모험', land:'130,280 110,135 205,60 360,45 550,75 620,180 590,290 470,375 260,390 180,340' },
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
