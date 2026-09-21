import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUtoolsFactorRanking } from './utools-factor-live.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','factor-score','rankings');
const styles=['runner','leader','betweener','chaser'];
const knownEvents=['loh2','chm','chm2','chm3'];
const requested=process.env.UTOOLS_FACTOR_EVENT;
const events=requested?[requested]:knownEvents;

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    eventKey:data.eventKey,
    style:data.style,
    pageUrl:data.pageUrl,
    transport:data.transport,
    deck:data.deck,
    rows:data.rows,
  };
}

let changed=0;
for(const eventKey of events){
  for(const style of styles){
    const data=await fetchUtoolsFactorRanking(eventKey,style);
    const dir=path.join(root,eventKey);
    const file=path.join(dir,style+'.json');
    fs.mkdirSync(dir,{recursive:true});

    let previous=null;
    try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    const same=previous &&
      JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data));
    if(same){
      process.stdout.write(`${eventKey}/${style}: current (${data.rows.length} rows, deck ${data.deck.length})\n`);
      continue;
    }

    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
    changed++;
    process.stdout.write(`${eventKey}/${style}: wrote ${data.rows.length} rows, deck ${data.deck.length}\n`);
  }
}
process.stdout.write(`Factor ranking refresh complete: ${changed} file(s) changed.\n`);
