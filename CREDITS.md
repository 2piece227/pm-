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

## 아직 사용하지 않는 것 (검토 후 보류)

**[pagefaultgames/pokerogue-assets](https://github.com/pagefaultgames/pokerogue-assets)의 `battle-anims/`**

기술 이펙트 애니메이션 소스로 검토했으나, 실제 라이선스를 확인한 결과 재사용 조건이
당초 알려진 것과 달라서 보류했다. 자세한 내용은 `PROGRESS.md`의 "포켓로그 에셋 검토" 항목 참고.

## 효과음

**외부 음원을 쓰지 않는다.** Web Audio API로 그 자리에서 합성한다 (`src/ui/sfx.js`).
따라서 별도 출처 표기나 라이선스 고지가 필요 없다.

나중에 실제 음원으로 바꿀 경우 `SAMPLE_URLS`에 경로를 넣으면 되며,
그때는 해당 음원의 라이선스를 여기에 추가해야 한다 (CC0 권장 — Kenney, itch.io CC0 태그 등).

## 폰트

- [Gothic A1](https://fonts.google.com/specimen/Gothic+A1) — SIL Open Font License 1.1

---

이 프로젝트는 **비영리 팬 프로젝트**다. Pokémon 및 관련 명칭·이미지는
Nintendo / Creatures Inc. / GAME FREAK Inc.의 상표이자 저작물이다.
