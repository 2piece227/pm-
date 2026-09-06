# 크레딧 / 사용 리소스

## 코드 라이브러리

| 항목 | 용도 | 라이선스 |
|---|---|---|
| [@pkmn/sim](https://github.com/pkmn/ps) | 배틀 엔진 (포켓몬쇼다운 시뮬레이터 추출본) | MIT |
| [@pkmn/dex](https://github.com/pkmn/ps) | 종족·기술·특성 데이터 | MIT |
| [Vite](https://vite.dev) | 번들러 | MIT |

## 스프라이트

**출처: [PokeAPI/sprites](https://github.com/PokeAPI/sprites)** — 링크로 참조하며, 이 저장소에 복제하지 않는다.

- 기본: `sprites/pokemon/versions/generation-v/black-white/animated/`
  5세대(블랙·화이트) 애니메이션 도트. 앞모습/뒷모습(`back/`) 모두 사용.
- 폴백: `sprites/pokemon/other/showdown/`
  5세대 이후 등장 종은 BW 폴더에 없어서 이쪽으로 자동 대체된다 (예: 타부자고 #1000).

> PokeAPI/sprites 저장소 자체는 리소스별로 출처가 다르며, 스프라이트 원본의 지식재산권은
> Nintendo / Creatures Inc. / GAME FREAK Inc.에 있다. 이 프로젝트는 비영리 팬 프로젝트이며
> 위 회사들과 아무 관련이 없다.

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

## 효과음 합성 폴백

위 음원을 받아오지 못하면 Web Audio API로 그 자리에서 합성한 소리로 떨어진다
(`src/ui/sfx.js`). 이 합성음은 외부 저작물이 아니다.

> 위 에셋의 URL은 전부 [`src/data/battle-assets.js`](src/data/battle-assets.js) 한 곳에 모여 있다.
> 오리지널 IP나 CC0 소재로 갈아끼울 때 이 파일만 고치면 된다.

## 폰트

- [Gothic A1](https://fonts.google.com/specimen/Gothic+A1) — SIL Open Font License 1.1

---

이 프로젝트는 **비영리 팬 프로젝트**다. Pokémon 및 관련 명칭·이미지는
Nintendo / Creatures Inc. / GAME FREAK Inc.의 상표이자 저작물이다.
