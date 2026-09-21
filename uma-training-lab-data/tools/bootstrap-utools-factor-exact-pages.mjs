import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUtoolsFactorPage } from './utools-factor-rsc.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','factor-score','exact-pages');
const eventKey=process.env.UTOOLS_FACTOR_EVENT || 'chm2';
const styles=['runner','leader','betweener','chaser'];

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    pageUrl:data.pageUrl,
    finalUrl:data.finalUrl,
    eventKey:data.eventKey,
    style:data.style,
    cards:data.cards,
    skillMap:data.skillMap,
    courseEffectSet:data.courseEffectSet,
  };
}

let changed=0;
for(const style of styles){
  const data=await fetchUtoolsFactorPage(eventKey,style);
  const dir=path.join(root,eventKey);
  const file=path.join(dir,style+'.json');
  fs.mkdirSync(dir,{recursive:true});
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const same=previous &&
    JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data));
  if(same){
    process.stdout.write(`${eventKey}/${style}: exact page current (${data.cards.length} cards, ${Object.keys(data.courseEffectSet.effects||{}).length} effects)\n`);
    continue;
  }
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
  changed++;
  process.stdout.write(`${eventKey}/${style}: wrote exact page (${data.cards.length} cards, ${Object.keys(data.courseEffectSet.effects||{}).length} effects)\n`);
}
process.stdout.write(`Exact factor page refresh complete: ${changed} file(s) changed.\n`);
