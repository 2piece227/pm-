/**
 * 진입점 — 오프닝 시퀀스부터 시작한다. (SPEC §3.10)
 *
 * 관리 화면(오늘/트레이너/대회/시장/리그/소식)은 오프닝이 끝난 뒤에 열린다.
 * 지금까지 만든 시뮬 화면 자체는 그대로 살아 있고, 오프닝의 숨겨진 진입점으로도 들어갈 수 있다.
 */
import { bootOpening } from './ui/opening.js';
import './ui/management.css';

bootOpening();

import './ui/pokemon-management.css';

import './ui/battle-ambience.css';
