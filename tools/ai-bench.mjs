/**
 * 배틀 AI 측정 — `node tools/ai-bench.mjs [상대] [옛AI능력치]`
 *
 *   상대 old  : 작업55(a5c7934)의 예전 자체 AI (git에서 임시 폴더로 꺼내 쓴다)
 *   상대 base : 보강을 모두 끈 원작(Essentials) AI
 *
 * 공정하게 재려고 (작업57 점검):
 *   - 팀 네 묶음: 예전 AI 튜닝용 프리셋 3매치업 + 게임 NPC식(elite, 장비 적용) 6·3·2마리 각 20쌍
 *   - 같은 팀 쌍을 두 AI가 번갈아 맡고, 같은 시드로 p1/p2 진영도 바꾼다 (팀·진영 유불리 상쇄)
 *   - 예전 AI는 트레이너 능력치에 따라 강해진다 — 15(보통)와 20(최상)을 따로 잰다. 새 AI는 능력치를 쓰지 않는다.
 * 624판, 95% 오차 약 ±4%p.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Battle, Teams } from '@pkmn/sim';
import * as NEW from '../src/engine/run-battle.js';
import { ENHANCE } from '../src/ai/ar/enhance.js';
import { TEAM_PRESETS } from '../src/data/teams.js';
import { buildParty } from '../src/engine/team-builder.js';
import { outfitNpcTrainer } from '../src/engine/npc-loadout.js';
import { partyToTeam } from '../src/data/pokemon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_COMMIT = 'a5c7934';
const [vs = 'old', oldStatArg = '15'] = process.argv.slice(2);
const oldStat = Number(oldStatArg);

/* 예전 AI: 저장소를 건드리지 않고 임시 폴더에 그 시점 src만 꺼낸다 */
async function loadOld() {
  const dir = path.join(os.tmpdir(), `pm-old-ai-${OLD_COMMIT}`);
  if (!fs.existsSync(path.join(dir, 'src'))) {
    fs.mkdirSync(dir, { recursive: true });
    execSync(`git archive ${OLD_COMMIT} src package.json | tar -x -C "${dir}"`, { cwd: ROOT });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  }
  return import(pathToFileURL(path.join(dir, 'src/engine/run-battle.js')).href);
}

const OFF = { ...structuredClone(ENHANCE), effectChance: false, damage: { ...ENHANCE.damage, on: false }, setupSense: false,
  setupValue: { ...ENHANCE.setupValue, on: false }, reserveLastMinParty: 0, matchupReplacement: false, threatSwitch: { ...ENHANCE.threatSwitch, on: false } };
const ON = structuredClone(ENHANCE);
/** 두 AI가 같은 ENHANCE를 쓰므로 차례마다 설정을 바꿔 끼운다 */
function withConfig(ai, cfg) {
  for (const k of ['chooseAction', 'chooseForcedSwitch']) {
    const f = ai[k].bind(ai);
    ai[k] = (...a) => { const save = structuredClone(ENHANCE); Object.assign(ENHANCE, structuredClone(cfg)); try { return f(...a); } finally { Object.assign(ENHANCE, save); } };
  }
  return ai;
}

const ST = { judge: 15, ops: 15, focus: 15, know: 15, mental: 15 };
const OST = Object.fromEntries(Object.keys(ST).map(k => [k, oldStat]));
const OLD = vs === 'old' ? await loadOld() : null;
const makeNew = seed => withConfig(NEW.createTrainerAI({ name: 'new', stats: ST }, '균형형', NEW.makeRng(seed)), ON);
const makeRival = seed => OLD ? OLD.createTrainerAI({ name: 'old', stats: OST }, '균형형', OLD.makeRng(seed))
  : withConfig(NEW.createTrainerAI({ name: 'base', stats: ST }, '균형형', NEW.makeRng(seed)), OFF);

function play(t1, t2, a1, a2, seed) {
  const b = new Battle({ formatid: 'gen9customgame', seed: [seed & 0xffff, 7, 11, 13] });
  b.setPlayer('p1', { name: 'P1', team: Teams.pack(Teams.import(t1)) });
  b.setPlayer('p2', { name: 'P2', team: Teams.pack(Teams.import(t2)) });
  const ai = { p1: a1, p2: a2 };
  for (const s of ['p1', 'p2']) ai[s].bindParty?.([...b[s].pokemon], b[s === 'p1' ? 'p2' : 'p1'].pokemon.length);
  a1.reset(); a2.reset();
  const fainted = { p1: 0, p2: 0 };
  for (let g = 0; !b.ended && g < 300; g++) {
    const ch = { p1: 'default', p2: 'default' }, sw = { p1: false, p2: false };
    for (const s of ['p1', 'p2']) {
      const req = b[s].activeRequest;
      if (!req || req.wait) { ch[s] = ''; continue; }
      if (req.teamPreview) continue;
      if (req.forceSwitch) { ch[s] = ai[s].chooseForcedSwitch(b, s).choice; continue; }
      ch[s] = ai[s].chooseAction(b, s).choice; sw[s] = ch[s].startsWith('switch');
    }
    const start = b.log.length, t0 = b.turn;
    b.makeChoices(ch.p1, ch.p2);
    const out = b.log.slice(start), done = b.turn > t0 || out.some(l => l.startsWith('|move|') || l.startsWith('|cant|'));
    for (const s of ['p1', 'p2']) {
      if (done) ai[s].endTurn?.(sw[s]);
      ai[s].observeOutcome?.(out, s);
      const n = b[s].pokemon.filter(p => p.fainted).length;
      if (n > fainted[s]) ai[s].onFaint?.();
      fainted[s] = n;
    }
  }
  return b.winner === 'P1' ? 'p1' : b.winner === 'P2' ? 'p2' : null;
}

function suite(pairs, reps) {
  let w = 0, l = 0;
  pairs.forEach(([A, B], i) => {
    for (let r = 0; r < reps; r++) for (const swap of [0, 1]) for (const newP1 of [1, 0]) {
      const seed = 1000 + i * 17 + r * 7919, mine = swap ? B : A, theirs = swap ? A : B;
      const win = newP1 ? play(mine, theirs, makeNew(seed), makeRival(seed + 1), seed) : play(theirs, mine, makeRival(seed + 1), makeNew(seed), seed);
      if (win === (newP1 ? 'p1' : 'p2')) w++; else if (win) l++;
    }
  });
  return [w, l];
}

const rng = NEW.makeRng(42);
async function npcTeams(size) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const t = { party: (await buildParty(rng, 'elite')).slice(0, size) };
    outfitNpcTrainer(t, { mega: false });
    out.push(partyToTeam(t.party));
  }
  const pairs = [];
  for (let i = 0; i < out.length; i += 2) pairs.push([out[i], out[i + 1]]);
  return pairs;
}
const six = await npcTeams(6), three = await npcTeams(3), two = await npcTeams(2);
const res = {
  프리셋: suite(Object.values(TEAM_PRESETS).map(p => [p.A, p.B]), 12),
  '6마리': suite(six, 2), '3마리': suite(three, 2), '2마리': suite(two, 2),
};
const total = Object.values(res).reduce((a, [w, l]) => [a[0] + w, a[1] + l], [0, 0]);
const pct = ([w, l]) => `${(100 * w / Math.max(1, w + l)).toFixed(1)}%`;
console.log(`보강 AI vs ${OLD ? `예전 AI(능력치 ${oldStat})` : '원작 AI'}: ${pct(total)} (${total[0]}:${total[1]})  ` +
  Object.entries(res).map(([k, v]) => `${k} ${pct(v)}`).join('  '));
