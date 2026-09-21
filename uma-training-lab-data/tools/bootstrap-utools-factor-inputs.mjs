import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUtoolsFactorSupportCards } from './utools-factor-rsc.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const outFile=path.resolve(here,'..','factor-score','utools-support-cards.json');

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    pageUrl:data.pageUrl,
    finalUrl:data.finalUrl,
    eventKey:data.eventKey,
    style:data.style,
    cards:data.cards,
    skillMap:data.skillMap,
  };
}

const data=await fetchUtoolsFactorSupportCards();
let previous=null;
try{previous=JSON.parse(fs.readFileSync(outFile,'utf8'));}catch{}

const same=previous &&
  JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data));

if(same){
  process.stdout.write(`U-tools factor support metadata already current: ${data.cards.length} cards.\n`);
}else{
  fs.mkdirSync(path.dirname(outFile),{recursive:true});
  fs.writeFileSync(outFile,`${JSON.stringify(data,null,2)}\n`,'utf8');
  process.stdout.write(
    `Wrote U-tools factor support metadata: ${data.cards.length} cards from ${data.eventKey}/${data.style} (final URL: ${data.finalUrl}).\n`
  );
}
