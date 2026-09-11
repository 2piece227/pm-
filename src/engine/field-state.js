import { Dex } from '@pkmn/dex';
import { realStats } from '../data/pokemon.js';

/** Only Pokémon have HP. A trainer's morale is a separate, persistent value. */
export function fieldState(mon) {
  const maxhp = realStats(mon).hp;
  const old = mon.fieldState;
  const hp = old ? (old.hp <= 0 ? 0 : Math.max(1, Math.min(maxhp, old.hp + maxhp - old.maxhp))) : maxhp;
  return { hp, maxhp, status: old?.status || '', pp: { ...(old?.pp || {}) } };
}
export function healParty(trainer) {
  for (const mon of trainer.party || []) delete mon.fieldState;
}
export function partyCondition(trainer) {
  const states = (trainer.party || []).map(fieldState);
  const maxhp = states.reduce((n, p) => n + p.maxhp, 0);
  return { ratio: maxhp ? states.reduce((n, p) => n + p.hp, 0) / maxhp : 0,
    fainted: states.filter(p => p.hp <= 0).length,
    status: states.some(p => p.status),
    exhausted: (trainer.party || []).some((m, i) => states[i].hp > 0 && m.moves.every(move =>
      states[i].pp[move.toLowerCase().replace(/[^a-z0-9]/g, '')] === 0)),
  };
}

/** Match the existing Gen9 simulator's PP capacity; no PP policy is changed here. */
export function movePP(mon, moveName) {
  const move=Dex.moves.get(moveName||'');
  if(!move.exists)return {current:0,max:0};
  const max=move.pp*(move.noPPBoosts||move.id==='trumpcard'?1:8/5);
  const spent=mon?.fieldState?.pp?.[move.id];
  return {current:Number.isFinite(spent)?Math.max(0,Math.min(max,spent)):max,max};
}
