# 크레딧 / 사용 리소스

## 코드 라이브러리

| 항목 | 용도 | 라이선스 |
|---|---|---|
| [@pkmn/sim](https://github.com/pkmn/ps) | 배틀 엔진 (포켓몬쇼다운 시뮬레이터 추출본) | MIT |
| [@pkmn/dex](https://github.com/pkmn/ps) | 종족·기술·특성 데이터 | MIT |
| [Vite](https://vite.dev) | 번들러 | MIT |

## 포켓몬 스프라이트

**전부 5세대(블랙·화이트) 도트로 통일하고, 가능한 한 움직이게 한다.**
링크로만 참조하며 이 저장소에 복제하지 않는다. URL과 후보 순서는
[`src/ui/sprite-anim.js`](src/ui/sprite-anim.js)와 [`src/ui/sprites.js`](src/ui/sprites.js)에 모여 있다.

**주 소스: [pagefaultgames/pokerogue-assets](https://github.com/pagefaultgames/pokerogue-assets)** (`beta`)

| 경로 | 내용 |
|---|---|
| `images/pokemon/{도감번호}.png` + `.json` | 5세대 원본 BW 애니메이션 시트 (아틀라스) |
| `images/pokemon/back/…` | 뒷모습 |
| `images/pokemon/exp/…` | **커뮤니티가 BW 그림체로 그린 6세대 이후** 애니메이션 시트 |

5세대 이후 종은 공식 BW 도트가 존재하지 않는다. `exp/` 폴더의 그림은 팬 제작물이며,
PokéRogue 저장소가 기여자를 정리해 두고 있다 — 개별 제작자 명단은
[PokéRogue의 CREDITS](https://github.com/pagefaultgames/pokerogue/blob/main/CREDITS.md)를 따른다.
원본 소재의 지식재산권은 Nintendo / Creatures Inc. / GAME FREAK Inc.에 있다.

**보조 소스** (시트가 없는 종만 여기로 떨어진다)

| 순서 | 출처 | 경로 |
|---|---|---|
| 1 | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) | `versions/generation-v/black-white/animated/` |
| 2 | [Pokémon Showdown](https://play.pokemonshowdown.com) | `sprites/gen5ani/`, `gen5ani-back/` |
| 3 | PokeAPI/sprites | `versions/generation-v/black-white/` (정지컷) |
| 4 | Pokémon Showdown | `sprites/gen5/`, `gen5-back/` (정지컷) |

`other/showdown/` 폴더는 **쓰지 않는다.** 이름과 달리 BW 도트가 아니라 최신 고해상도
스프라이트라서, 같은 칸에 넣으면 "고해상도를 축소한 것"처럼 보인다.

> 이 프로젝트는 **비영리 팬 프로젝트**이며 위 회사들과 아무 관련이 없다.

## 기술 이펙트 애니메이션 · 배틀 효과음

**출처: [pagefaultgames/pokerogue-assets](https://github.com/pagefaultgames/pokerogue-assets)** (`beta` 브랜치)
— 스프라이트와 마찬가지로 **링크로만** 참조하며, 이 저장소에 복제하지 않는다.

| 우리가 쓰는 경로 | 용도 | 실제 라이선스 (저장소 REUSE 기준) |
|---|---|---|
| `battle-anims/<kebab>.json` | 기술별 프레임 데이터 | 785개 `LicenseRef-POKEMON-REBORN` / 49개 `CC-BY-NC-SA-4.0` |
| `images/battle_anims/<graphic>.png` | 위 데이터가 참조하는 스프라이트시트 | `LicenseRef-FAIR-USE` (게임 원본 소재) |
| `audio/battle_anims/PRSFX- *.wav` | 기술 프레임에 걸린 효과음 | `LicenseRef-POKEMON-REBORN` |
| `audio/se/*.wav` | 공용 배틀 효과음 (피격·급소·기절·교체) | `LicenseRef-FAIR-USE` (게임 원본 소재) |

**주의 — 루트 `REUSE.toml`만 보면 안 된다.** 루트는 `battle-anims/*.json`을 AGPL-3.0-only로
적어놨지만, `battle-anims/` 폴더 안에 자체 `REUSE.toml`이 또 있고 그게 우선한다. 실제 내역은 위 표와 같다.
(화염방사·칼춤·지진·용의춤 등 우리가 쓰는 기술은 전부 `LicenseRef-POKEMON-REBORN` 쪽이다.)

기여자 표기:

- **The Pokémon Reborn Team** — https://www.rebornevo.com/
- **CC-BY-NC-SA-4.0 프레임 데이터** — Gen 8 Animation Project, StCooler, DarrylBD99,
  WolfPP, ardicoozer, riddlemeree, Drake Baku

`LicenseRef-FAIR-USE`는 넘겨받을 수 있는 허락이 아니라 특정 사용에 대한 항변이다.
게임 원본 소재의 지식재산권은 Nintendo / Creatures Inc. / GAME FREAK Inc.에 있다.
이 프로젝트는 **비영리 팬 프로젝트**이고 소스 전체를 공개하며, 에셋을 재배포하지 않고
원 저장소를 링크로만 참조한다는 전제로 사용한다.

## 한글 이름표 (기술 · 종족 · 특성)

**출처: [pagefaultgames/pokerogue-locales](https://github.com/pagefaultgames/pokerogue-locales)**
— `ko/move.json`, `ko/pokemon.json`, `ko/ability.json`, `ko/pokemon-form.json`

손으로 적던 표는 풀에 있는 것만 채워져 있어서 종이나 기술을 늘릴 때마다 자막이 조용히
영문으로 떨어졌고, 기술 이름은 7개가 틀리기까지 했다. 지금은
`node tools/gen-ko.mjs`로 **기술 916 / 종족 1079 / 특성 316종**을 생성한다 (`src/data/ko.gen.js`).
폼 변형만 `ko.js`의 OVERRIDE에서 손으로 적는다.

이름 자체의 지식재산권은 Nintendo / Creatures Inc. / GAME FREAK Inc.에 있다.

## 포켓몬 울음소리

**출처: [PokeAPI/cries](https://github.com/PokeAPI/cries)** — 링크 참조.

- 기본: `cries/pokemon/legacy/<도감번호>.ogg` (GB~5세대 합성음 — BW 도트와 결이 맞는다)
- 폴백: `cries/pokemon/latest/<도감번호>.ogg`

원본 음원의 지식재산권은 Nintendo / Creatures Inc. / GAME FREAK Inc.에 있다.

## 효과음 재생

등록된 음원만 재생하며, 음원을 받지 못하면 소리를 생략한다. 자체 합성음 폴백은 사용하지 않는다.

## 커뮤니티 도트 타운맵

관동·성도 지도는 **ENLS**가 [Eevee Expo에 공개한 Bill's Experiments: Episode 1 Resource Pack](https://eeveeexpo.com/resources/572/)의 `Graphics/Pictures/mapRegion0.png`를 사용한다.
HGSS 원본을 ENLS가 편집한 도트 타운맵이다. 원본 파일은 그대로 보존하고 지방별 표시 영역과 클릭 지점만 덧붙였다.
원작 권리: Nintendo / Creatures Inc. / GAME FREAK Inc. 공개 리소스 팩에는 별도의 표준 CC/오픈소스 라이선스가 명시되어 있지 않다.
다운로드 출처·파일 내 크레딧은 [맵 출처 기록](public/assets/maps/README.md)에 기재했다.
이전 자체 SVG 지형은 화면에서 제거했으며, 미개방 지방은 이미지가 준비되지 않았다고 표시한다.

## 폰트

- [Gothic A1](https://fonts.google.com/specimen/Gothic+A1) — SIL Open Font License 1.1

---

이 프로젝트는 **비영리 팬 프로젝트**다. Pokémon 및 관련 명칭·이미지는
Nintendo / Creatures Inc. / GAME FREAK Inc.의 상표이자 저작물이다.
