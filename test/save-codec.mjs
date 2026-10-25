import assert from 'node:assert/strict';
import {encodeSave,decodeSave} from '../src/engine/save-codec.js';
import {writeSave,loadSave,initSave,flushSave} from '../src/engine/save.js';

const sample={version:1,playerName:'저장 검사',snapshot:{day:160,matches:[
  {log:['|turn|1','|win|민재','|turn|1']},{log:['|win|민재']},{log:[]}
]}};
assert.deepEqual(decodeSave(encodeSave(sample)),sample);
assert.deepEqual(decodeSave(JSON.stringify(sample)),sample);
assert.deepEqual(decodeSave(encodeSave({version:1,stage:'name'})),{version:1,stage:'name'});
for(const index of [-1,1,0.5,'0'])assert.throws(()=>decodeSave(JSON.stringify({encoding:'battle-log-table-v1',lines:['a'],data:{log:{$battleLog:[index]}}})));
assert.throws(()=>decodeSave('{'));

/* 예전(압축 안 한) 저장을 읽고, 다음 저장부터 gzip으로 쓴다 */
let raw=JSON.stringify(sample),full=false;
globalThis.localStorage={getItem:()=>raw,setItem:(key,value)=>{if(full)throw new Error('QuotaExceededError');raw=value;},removeItem:()=>{raw=null;}};
assert.deepEqual(await initSave(),sample);
assert.deepEqual(loadSave(),sample);
writeSave({stage:'playing'});await flushSave();
assert(raw.startsWith('gz1:'),'gzip 압축 저장');
assert.deepEqual((await initSave()).snapshot,sample.snapshot,'압축 저장을 다시 풀면 그대로');
assert.equal(writeSave({playerName:'변경'}).persisted,true);await flushSave();
assert.equal((await initSave()).playerName,'변경');
assert.deepEqual(loadSave().snapshot,sample.snapshot);

/* 큰 저장도 압축으로 크게 줄어든다 (경기 로그) */
const big={version:1,snapshot:{matches:Array.from({length:400},(_,i)=>({id:i,log:Array.from({length:120},(_,j)=>`|move|p1a: 리자몽|Flamethrower|p2a: 이상해꽃|[${(i*7+j)%13}]`)}))}};
writeSave(big);await flushSave();
assert(raw.length<encodeSave({...big,playerName:'변경'}).length/3,`압축률 ${(encodeSave(big).length/raw.length).toFixed(1)}배`);

/* 용량 부족: 기존 저장은 그대로 남고, 다음 저장 결과에 실패가 보인다 */
writeSave({playerName:'정상'});await flushSave();
const previous=raw;full=true;
writeSave({playerName:'실패'});await flushSave();
assert.equal(raw,previous);
assert.equal(writeSave({playerName:'실패2'}).persisted,false);await flushSave();
full=false;assert.equal((await initSave()).playerName,'정상');
raw='{';assert.equal(await initSave(),null);
console.log('PASS: lossless logs, legacy saves, gzip saves, repeated writes, invalid references and quota failure preservation');
