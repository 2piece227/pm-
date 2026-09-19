import assert from 'node:assert/strict';
import {encodeSave,decodeSave} from '../src/engine/save-codec.js';
import {writeSave,loadSave} from '../src/engine/save.js';

const sample={version:1,playerName:'저장 검사',snapshot:{day:160,matches:[
  {log:['|turn|1','|win|민재','|turn|1']},{log:['|win|민재']},{log:[]}
]}};
assert.deepEqual(decodeSave(encodeSave(sample)),sample);
assert.deepEqual(decodeSave(JSON.stringify(sample)),sample);
assert.deepEqual(decodeSave(encodeSave({version:1,stage:'name'})),{version:1,stage:'name'});
for(const index of [-1,1,0.5,'0'])assert.throws(()=>decodeSave(JSON.stringify({encoding:'battle-log-table-v1',lines:['a'],data:{log:{$battleLog:[index]}}})));
assert.throws(()=>decodeSave('{'));
let raw=JSON.stringify(sample),full=false;
globalThis.localStorage={getItem:()=>raw,setItem:(key,value)=>{if(full)throw new Error('QuotaExceededError');raw=value;}};
assert.deepEqual(loadSave(),sample);
assert.equal(writeSave({stage:'playing'}).persisted,true);
assert.equal(JSON.parse(raw).encoding,'battle-log-table-v1');
assert.deepEqual(loadSave().snapshot,sample.snapshot);
assert.equal(writeSave({playerName:'변경'}).persisted,true);
assert.equal(loadSave().playerName,'변경');
assert.deepEqual(loadSave().snapshot,sample.snapshot);
const previous=raw;full=true;
assert.equal(writeSave({playerName:'실패'}).persisted,false);
assert.equal(raw,previous);
assert.equal(loadSave().playerName,'변경');
raw='{';assert.equal(loadSave(),null);
console.log('PASS: lossless logs, legacy saves, repeated writes, invalid references and quota failure preservation');
