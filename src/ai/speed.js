// Read-only speed estimate shared by move power and turn order.
export function effectiveSpeed(mon){
  let speed=mon.getStat('spe',false,true);
  if(mon.status==='par'&&mon.ability!=='quickfeet')speed*=.5;
  if(mon.status&&mon.ability==='quickfeet')speed*=1.5;
  if(mon.item==='choicescarf')speed*=1.5;
  if(mon.item==='ironball')speed*=.5;
  if(mon.side.sideConditions.tailwind)speed*=2;
  const weather=mon.battle.field.weather;
  if((mon.ability==='swiftswim'&&['raindance','primordialsea'].includes(weather))||
    (mon.ability==='chlorophyll'&&['sunnyday','desolateland'].includes(weather))||
    (mon.ability==='sandrush'&&weather==='sandstorm')||
    (mon.ability==='slushrush'&&['snow','hail'].includes(weather)))speed*=2;
  return speed;
}
