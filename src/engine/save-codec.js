// Lossless log interning. Replays are reconstructed, never re-simulated or discarded.
export function encodeSave(data){
  const lines=[],indices=new Map();
  const encoded=JSON.parse(JSON.stringify(data,(key,value)=>{
    if(key==='log'&&Array.isArray(value)&&value.length&&value.every(v=>typeof v==='string')){
      return {$battleLog:value.map(line=>{
        if(!indices.has(line)){indices.set(line,lines.length);lines.push(line);}
        return indices.get(line);
      })};
    }
    return value;
  }));
  if(!lines.length)return JSON.stringify(data);
  return JSON.stringify({encoding:'battle-log-table-v1',lines,data:encoded});
}
export function decodeSave(raw){
  const parsed=JSON.parse(raw);
  if(parsed.encoding!=='battle-log-table-v1')return parsed;
  if(!Array.isArray(parsed.lines)||!parsed.lines.every(v=>typeof v==='string'))throw new Error('잘못된 경기 로그 저장입니다.');
  return JSON.parse(JSON.stringify(parsed.data),(key,value)=>{
    if(key==='log'&&value&&Array.isArray(value.$battleLog))return value.$battleLog.map(i=>{
      if(!Number.isInteger(i)||i<0||i>=parsed.lines.length)throw new Error('경기 로그 번호를 확인할 수 없습니다.');
      return parsed.lines[i];
    });
    return value;
  });
}
