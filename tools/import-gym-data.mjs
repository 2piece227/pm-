import fs from 'node:fs';
import path from 'node:path';
import {Dex} from '@pkmn/dex';
const dir=process.argv[2];
const fr=fs.readFileSync(path.join(dir,'pm-fr-parties.h'),'utf8');
const hg=JSON.parse(fs.readFileSync(path.join(dir,'pm-hg-trainers.json'),'utf8')).trainers;
const names=[
 ['Brock','웅','pewter','Rock','회색배지'],['Misty','이슬','cerulean','Water','블루배지'],['LtSurge','마티스','vermilion','Electric','오렌지배지'],['Erika','민화','celadon','Grass','무지개배지'],['Koga','독수','fuchsia','Poison','핑크배지'],['Sabrina','초련','saffron','Psychic','골드배지'],['Blaine','강연','cinnabar','Fire','진홍색배지'],['Giovanni','비주기','viridian','Ground','그린배지'],
 ['Falkner','비상','violet','Flying','윙배지'],['Bugsy','호일','azalea','Bug','인섹트배지'],['Whitney','꼭두','goldenrod','Normal','레귤러배지'],['Morty','유빈','ecruteak','Ghost','팬텀배지'],['Chuck','사도','cianwood','Fighting','쇼크배지'],['Jasmine','규리','olivine','Steel','스틸배지'],['Pryce','류옹','mahogany','Ice','아이스배지'],['Clair','이향','blackthorn','Dragon','라이징배지']];
const norm=(str,prefix)=>str.replace(prefix,'').toLowerCase().replace(/_/g,'');
const spName=str=>{let n=norm(str,'SPECIES_');if(n==='nidoranf')n='nidoranf';if(n==='nidoranm')n='nidoranm';const s=Dex.species.get(n);if(!s.exists)throw Error(str);return s.name;};
const mvName=str=>{let n=norm(str,'MOVE_');if(n==='none')return null;const aliases={hiJumpKick:'High Jump Kick',hijumpkick:'High Jump Kick',smokescreen:'Smokescreen',doubleslap:'Double Slap'};const m=Dex.moves.get(aliases[n]||n);if(!m.exists)throw Error(str);return m.name;};
const convert=m=>({species:spName(m.species),level:m.level,moves:(m.moves||[]).map(mvName).filter(Boolean),item:m.item&&m.item!=='ITEM_NONE'?Dex.items.get(norm(m.item,'ITEM_')).name:null});
const output=names.map(([en,name,location,type,badge],i)=>{
 const matches=hg.filter(t=>t.name.replace('{TRNAME}','').replace(/[^a-zA-Z]/g,'')===en);
 let party;
 if(i<8){const body=fr.match(new RegExp('sParty_Leader'+en+'\\[\\] = \\{([\\s\\S]*?)\\n\\};'))?.[1];if(!body)throw Error(en);
 party=[...body.matchAll(/\{([^{}]*?\.species = (SPECIES_\w+),[\s\S]*?\.moves = \{([^}]+)\})[\s\S]*?\}/g)].map(m=>convert({species:m[2],level:Number(m[1].match(/\.lvl = (\d+)/)[1]),moves:m[3].match(/MOVE_\w+/g)}));
 }else party=matches[0].party.map(convert);
 if(!party?.length)throw Error('empty '+en);
 const rematches=matches.filter(t=>t.party.length>=5).sort((a,b)=>Math.max(...b.party.map(p=>p.level))-Math.max(...a.party.map(p=>p.level)));
 let serious=rematches[0]?.party.map(convert),seriousSource='HGSS 재대결';
 if(en==='Giovanni') {seriousSource='PWT 준비용 자체 편성 (미확정)';serious=[['Rhyperior',['Earthquake','Stone Edge','Megahorn','Hammer Arm']],['Nidoking',['Earth Power','Sludge Wave','Ice Beam','Thunderbolt']],['Nidoqueen',['Earth Power','Sludge Bomb','Flamethrower','Ice Beam']],['Kangaskhan',['Fake Out','Body Slam','Crunch','Earthquake']],['Dugtrio',['Earthquake','Stone Edge','Sucker Punch','Aerial Ace']],['Persian',['Fake Out','Slash','Bite','U-turn']]].map(([species,moves])=>({species,level:60,moves,item:null}));}
 return {id:en.toLowerCase(),name,location,type,badge,region:i<8?'kanto':'johto',order:i%8+1,source:i<8?'FRLG 첫 도전':'HGSS 첫 도전',party,seriousParty:serious,seriousSource};
});
fs.writeFileSync('src/data/gyms.js', '// Species, levels and moves extracted from pret game data. See CREDITS.md.\nexport const GYMS = '+JSON.stringify(output,null,2)+';\nexport const gymById = id => GYMS.find(g=>g.id===id);\n');
console.log(output.map(g=>g.name+': '+g.party.map(p=>p.species+p.level).join(', ')+' / serious '+g.seriousParty?.length).join('\n'));
