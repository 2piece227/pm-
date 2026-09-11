import { GYMS } from '../data/gyms.js';
/** Regional progress must never count four Kanto + four Johto badges as eight. */
export function badgeProgress(trainer) {
  const earned=new Set(trainer?.badges||[]);
  const counts=Object.fromEntries(['kanto','johto'].map(region=>[region,GYMS.filter(g=>g.region===region&&earned.has(g.id)).length]));
  return {...counts,best:Math.max(counts.kanto,counts.johto)};
}
