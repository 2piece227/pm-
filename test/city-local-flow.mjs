import assert from 'node:assert/strict';
import { createGame, playerAgency, advanceDay } from '../src/engine/game.js';
import { ensureSeason, registerCup, cupEligible, runCup } from '../src/engine/season.js';
import { regionalRanking, citySeedScores } from '../src/engine/regional-ranking.js';
import { snapshotGame, restoreGame } from '../src/engine/checkpoint.js';
import { renderSeason } from '../src/ui/season.js';
import { isRegisteredPro } from '../src/engine/career.js';
import { RANKING, SEASON } from '../src/data/season.js';

const g=await createGame({seed:514,agencyChoiceId:'player-major',careerStart:true});
g.opening.tutorialContractNeeded=false;
const a=playerAgency(g),pro=a.roster.find(t=>isRegisteredPro(t)),youth=a.roster.find(t=>t.isYouth);
let events=ensureSeason(g).events;
assert.equal(events.filter(e=>e.season===1&&e.kind==='city').length,6);
assert.equal(events.filter(e=>e.season===1&&e.kind==='local').length,1);
assert(events.filter(e=>e.kind==='city').every(e=>e.date%365<130||e.date%365>=180));
const city=events.find(e=>e.kind==='city');g.day=city.openDay;
assert(!registerCup(g,city.id,youth.id).ok);assert(registerCup(g,city.id,pro.id).ok);
for(const role of ['champion','elite-four'])assert(!cupEligible({...pro,regionalRole:role},city));
assert(!cupEligible({...pro,isYouth:true},city),'holding an eight-badge youth is not a call-up');
g.day=city.date;g.actions[pro.id]='rest';
const saved=restoreGame(snapshotGame(g)),funds=a.funds;
const report=await advanceDay(g);await advanceDay(saved);
assert.equal(report.cupId,city.id);assert.equal(report.youthCupId,undefined);
assert(!report.rested.includes(pro.name));assert(city.entrants.every(e=>isRegisteredPro(e.definition)));
assert.equal(city.matches.length,city.entrants.length-1);
const clean=x=>JSON.stringify(x).replace(/\|t:\|\d+/g,'|t:|CLOCK');
assert.equal(clean(city),clean(saved.competitions.events.find(e=>e.id===city.id)));
assert.deepEqual(regionalRanking(g),regionalRanking(saved));
assert(regionalRanking(g).every(r=>r.matches>0&&r.cityMatches===r.matches));
const rankBefore=clean(regionalRanking(g)),fundsAfter=a.funds;
await runCup(g,city);assert.equal(a.funds,fundsAfter);assert.equal(clean(regionalRanking(g)),rankBefore);
assert.equal(report.net,a.funds-funds);
assert(renderSeason(g).includes('지역 종합 순위'));

// An open cup can be won by a youth and must not grant badges, promotion or ranking eligibility.
const local=events.find(e=>e.kind==='local');g.day=local.openDay;
assert(registerCup(g,local.id,youth.id).ok);assert(cupEligible(pro,local));
for(const agency of g.league.agencies)agency.roster=[];
a.roster=[youth];
const rival=g.league.agencies.find(x=>x.id!==a.id);
const other={...structuredClone(youth),id:'other-youth',name:'다른 유스',agencyId:rival.id};rival.roster=[other];
g.day=local.date;const identity=[youth,other].map(t=>({id:t.id,badges:structuredClone(t.badges),isYouth:t.isYouth}));
const beforeTotal=a.funds+rival.funds;
await runCup(g,local);
assert.equal(local.status,'completed');assert.equal(a.funds+rival.funds-beforeTotal,(SEASON.prize+SEASON.runnerPrize)*8);
assert.deepEqual([youth,other].map(t=>({id:t.id,badges:t.badges,isYouth:t.isYouth})),identity);
assert(!regionalRanking(g).some(r=>[youth.id,other.id].includes(r.id)));
const next=events.find(e=>e.kind==='city'&&e.date>local.date);
assert.equal(citySeedScores(g,next).get(local.result.championId),RANKING.base+RANKING.localSeedBonus);
assert(!cupEligible(youth,next),'seed preference never bypasses pro eligibility');

// v5 upgrade only adds future tournaments; preserves old results, party and RNG.
const old=snapshotGame(saved);old.snapshotVersion=5;old.competitions.events=old.competitions.events.filter(e=>e.kind==='youth');old.competitions.version=1;
const restored=restoreGame(old);
assert.equal(restored.snapshotVersion,6);assert.equal(restored.rng.getState(),old.rngState);
assert.deepEqual(restored.league,old.league);
assert(restored.competitions.events.filter(e=>e.kind!=='youth').every(e=>e.date>=old.day));
assert.deepEqual(restored.competitions.events.filter(e=>e.kind==='youth'),old.competitions.events);
console.log('PASS: city/open eligibility, annual calendar, daily activity, saved replay/ranking, no double rewards, youth champion, seed guard, v5 migration');

// Equal-strength official fixtures isolate rating/points weighting and the minimum-games gate.
const fixture=restoreGame(snapshotGame(saved));
const [x,z]=city.entrants.slice(0,2);
const fake=(kind,date)=>({...structuredClone(city),id:`test-${kind}`,kind,date,rankingWeight:kind==='local'?0.25:1,
  entrants:[structuredClone(x),structuredClone(z)],matches:[{aId:x.id,bId:z.id,winnerId:x.id,round:1,draw:false}],result:{championId:x.id,runnerId:z.id}});
fixture.competitions.events=[fake('city',35)];const cr=regionalRanking(fixture).find(r=>r.id===x.id);
fixture.competitions.events=[fake('local',35)];const lr=regionalRanking(fixture).find(r=>r.id===x.id);
assert.equal(cr.rating-RANKING.base,(lr.rating-RANKING.base)*4);assert.equal(cr.points,lr.points*4);
assert(cr.provisional&&!cr.challengerEligible);
fixture.competitions.events=[fake('youth',7)];fixture.competitions.events[0].ranking=false;
assert.deepEqual(regionalRanking(fixture),[]);
console.log('PASS: limited local rating/placement weights, provisional ranking, youth exclusion');
