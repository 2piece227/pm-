/**
 * 사파리존 — 지방마다 하나, 안에 테마 구역이 있다. (작업62)
 *
 * 왜: 관동·성도 도로 출현표만으로는 1~251번 중 전설·환상을 빼고도 79종을 구할 수 없었다
 * (캥카·이브이·미뇽·애버라스·화석·성도 스타팅 등). 그 계열의 첫 단계 45종을 테마 구역에 나눠 넣어
 * 진화까지 하면 79종이 모두 잡힌다 (test/safari.mjs가 지킨다).
 *
 * 원작(FRLG·HGSS) 규칙을 매니지먼트 하루 활동에 맞췄다:
 *   - 하루 입장료를 내면 사파리볼 30개를 받는다. 일반 몬스터볼은 쓸 수 없고, 남은 사파리볼은 나올 때 반납.
 *   - 배틀하지 않는다. 볼을 던져 못 잡으면 포켓몬이 도망칠 수 있다(빠를수록 잘 도망친다).
 *   - 경험치·상금 없음. 트레이너 배틀 없음.
 * 위치는 원작대로 관동 = 연분홍시티, 성도 = 진청시티 옆(48번도로). 출현 레벨·비율·가격은 [임시값].
 */
const W = (species, min, max, rate = 10) => ({ species, min, max, rate });

export const SAFARI_RULES = {
  fee: 500,          // 원작 입장료 ₽500
  balls: 30,         // 원작 사파리볼 30개
  ballMod: 1.5,      // 사파리볼 배율 (원작 1.5배)
  /* 못 잡았을 때 도망칠 확률 = base + 스피드 종족값 / perSpeed, 최대 max [임시값] */
  flee: { base: 0.05, perSpeed: 300, max: 0.5 },
};

export const SAFARI_ZONES = [
  {
    id: 'safari-kanto', region: 'kanto', name: '사파리존', town: '연분홍시티', pos: [591, 207],
    desc: '연분홍시티 북쪽의 넓은 보호 구역. 관동에서 보기 힘든 포켓몬이 산다.',
    areas: [
      { id: 'safari-kanto-plains', name: '초원 구역', theme: '키 큰 풀이 펼쳐진 들판', level: [22, 32],
        wild: [W('Kangaskhan', 25, 30, 10), W('Eevee', 22, 27, 8), W('Snorlax', 28, 32, 3), W('Dunsparce', 22, 28, 10), W('Aipom', 22, 28, 10), W('Mr. Mime', 24, 29, 6)] },
      { id: 'safari-kanto-lake', name: '호수 구역', theme: '맑은 호수와 물가', level: [20, 32],
        wild: [W('Dratini', 20, 25, 8), W('Horsea', 22, 28, 12), W('Goldeen', 22, 28, 14), W('Shellder', 22, 28, 12), W('Lapras', 28, 32, 3), W('Qwilfish', 24, 29, 8), W('Remoraid', 22, 28, 10), W('Corsola', 24, 29, 8)] },
      { id: 'safari-kanto-jungle', name: '정글 구역', theme: '빽빽한 나무와 덩굴', level: [22, 30],
        wild: [W('Pinsir', 25, 30, 10), W('Heracross', 25, 30, 10), W('Shuckle', 22, 28, 10), W('Natu', 22, 27, 10), W('Murkrow', 22, 28, 10), W('Togepi', 15, 20, 4)] },
      { id: 'safari-kanto-rocky', name: '바위 구역', theme: '화석이 묻힌 바위 언덕', level: [22, 32],
        wild: [W('Diglett', 22, 27, 14), W('Sudowoodo', 24, 29, 10), W('Omanyte', 24, 28, 6), W('Kabuto', 24, 28, 6), W('Aerodactyl', 28, 32, 3), W('Larvitar', 20, 24, 4)] },
    ],
  },
  {
    id: 'safari-johto', region: 'johto', name: '사파리존', town: '진청시티 북쪽 (48번도로)', pos: [60, 168],
    desc: '바오바 원장이 연 성도의 사파리존. 구역마다 지형이 전혀 다르다.',
    areas: [
      { id: 'safari-johto-forest', name: '숲 구역', theme: '오래된 숲과 유적', level: [10, 28],
        wild: [W('Chikorita', 15, 20, 4), W('Cyndaquil', 15, 20, 4), W('Totodile', 15, 20, 4), W('Misdreavus', 22, 28, 10), W('Wobbuffet', 22, 28, 10), W('Unown', 20, 26, 10), W('Smeargle', 22, 28, 8), W('Pichu', 10, 15, 8), W('Cleffa', 10, 15, 8), W('Igglybuff', 10, 15, 8)] },
      { id: 'safari-johto-volcano', name: '화산 구역', theme: '뜨거운 용암과 전기가 흐르는 폐허', level: [15, 30],
        wild: [W('Slugma', 22, 28, 12), W('Houndour', 22, 28, 12), W('Magby', 15, 20, 6), W('Tyrogue', 15, 20, 8), W('Elekid', 15, 20, 6), W('Voltorb', 22, 28, 10), W('Porygon', 25, 30, 3)] },
      { id: 'safari-johto-snow', name: '설산 구역', theme: '눈 덮인 산봉우리', level: [15, 30],
        wild: [W('Sneasel', 24, 30, 12), W('Smoochum', 15, 20, 8), W('Larvitar', 22, 26, 5)] },
    ],
  },
];

/** 지도 데이터(LOCATIONS)에 끼울 구역들 — kind 'safari', 어느 사파리존인지(zone) */
export const SAFARI_AREAS = SAFARI_ZONES.flatMap(z => z.areas.map(a => ({
  ...a, region: z.region, kind: 'safari', zone: z.id, name: `${z.name} · ${a.name}`, trainers: [],
})));
export const safariZoneOf = (locationOrId) => {
  const id = typeof locationOrId === 'string' ? locationOrId : locationOrId?.zone || locationOrId?.id;
  return SAFARI_ZONES.find(z => z.id === id || z.areas.some(a => a.id === id)) || null;
};
