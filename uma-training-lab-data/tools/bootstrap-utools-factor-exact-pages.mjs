import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUtoolsFactorPage } from './utools-factor-rsc.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','factor-score','exact-pages');
const styles=['runner','leader','betweener','chaser'];
const knownEvents=[
  {eventKey:'loh2',courseId:10504,label:'2026-08 League of Heroes'},
  {eventKey:'chm',courseId:10603,label:'2026-09 Champions Meeting'},
  {eventKey:'chm2',courseId:11203,label:'2026-09 Special Champions Meeting'},
  {eventKey:'chm3',courseId:10808,label:'2026-10 Champions Meeting'},
];
const requested=process.env.UTOOLS_FACTOR_EVENT;
const events=requested
  ? knownEvents.filter(row=>row.eventKey===requested)
  : knownEvents;
if(requested && !events.length) throw new Error('Unknown UTOOLS_FACTOR_EVENT: '+requested);

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    pageUrl:data.pageUrl,
    finalUrl:data.finalUrl,
    eventKey:data.eventKey,
    courseId:data.courseId,
    style:data.style,
    cards:data.cards,
    skillMap:data.skillMap,
    courseEffectSet:data.courseEffectSet,
  };
}

let changed=0;
const index={schemaVersion:1,courses:{}};
for(const event of events){
  const courseEntry={
    courseId:event.courseId,
    eventKey:event.eventKey,
    label:event.label,
    styles:{},
  };
  for(const style of styles){
    const data={
      ...(await fetchUtoolsFactorPage(event.eventKey,style)),
      courseId:event.courseId,
    };
    const dir=path.join(root,event.eventKey);
    const file=path.join(dir,style+'.json');
    fs.mkdirSync(dir,{recursive:true});
    let previous=null;
    try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    const same=previous &&
      JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data));
    if(same){
      process.stdout.write(`${event.eventKey}/${style}: exact page current (${data.cards.length} cards, ${Object.keys(data.courseEffectSet.effects||{}).length} effects)\n`);
    }else{
      fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
      changed++;
      process.stdout.write(`${event.eventKey}/${style}: wrote exact page (${data.cards.length} cards, ${Object.keys(data.courseEffectSet.effects||{}).length} effects)\n`);
    }
    courseEntry.styles[style]={
      path:`exact-pages/${event.eventKey}/${style}.json`,
      effects:Object.keys(data.courseEffectSet.effects||{}).length,
    };
  }
  index.courses[String(event.courseId)]=courseEntry;
}

if(!requested){
  const indexFile=path.join(root,'index.json');
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(indexFile,'utf8'));}catch{}
  if(JSON.stringify(previous)!==JSON.stringify(index)){
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n','utf8');
    changed++;
    process.stdout.write(`Wrote exact factor course index for ${Object.keys(index.courses).length} courses.\n`);
  }
}
process.stdout.write(`Exact factor page refresh complete: ${changed} file(s) changed.\n`);
