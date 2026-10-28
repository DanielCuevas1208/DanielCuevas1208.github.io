import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUtoolsFactorRanking } from './utools-factor-live.mjs';
import { fetchUtoolsEventOverview } from './utools-factor-rsc.mjs';
import { resolveSlug } from './bootstrap-utools-factor-exact-pages.mjs';
import { UTOOLS_FACTOR_SLUGS, FACTOR_STYLES, FACTOR_ROOT, identityFields, parseEventTitle } from './utools-factor-events.mjs';
import { checkParity } from './verify-utools-factor-exact.mjs';

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    eventKey:data.eventKey,
    courseId:data.courseId,
    style:data.style,
    pageUrl:data.pageUrl,
    transport:data.transport,
    deck:data.deck,
    rows:data.rows,
  };
}

// A ranking is only saved next to the exact page it reproduces 48/48: the
// reader proxy fetches separately, so this is what proves both came from the
// same event even if U-tools moved the slug in between.
export async function refreshRankings({
  slugs=UTOOLS_FACTOR_SLUGS,
  root=FACTOR_ROOT,
  fetchOverview=fetchUtoolsEventOverview,
  fetchRanking=fetchUtoolsFactorRanking,
  log=console.log,
}={}){
  let changed=0;
  const seen=new Set();
  for(const slug of slugs){
    const identity=await resolveSlug(slug,{fetchOverview,root,log});
    if(!identity || seen.has(identity.key)) continue;
    seen.add(identity.key);
    for(const style of FACTOR_STYLES){
      const where=`${identity.key}/${style} (${slug}, course ${identity.courseId})`;
      const pageFile=path.join(root,'exact-pages',identity.key,style+'.json');
      if(!fs.existsSync(pageFile)) throw new Error(`${where}: no exact page; run bootstrap-utools-factor-exact-pages.mjs first`);
      const page=JSON.parse(fs.readFileSync(pageFile,'utf8'));
      const fetched=await fetchRanking(slug,style);
      const title=parseEventTitle(fetched.pageTitle);
      if(title && (title.kind!==identity.kind || title.month!==identity.month)) throw new Error(`${where}: ranking page is ${title.kind} ${title.month}`);
      const data={...fetched,...identityFields(identity),style};
      const parity=checkParity(page,data,where);
      if(!parity.exact) throw new Error(`${where}: ranking does not reproduce from the saved exact page (score ${parity.scoreMatches}/${parity.rows}, rank ${parity.rankMatches}/${parity.rows})`);
      const file=path.join(root,'rankings',identity.key,style+'.json');
      let previous=null;
      try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
      if(previous && JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data))){
        log(`${where}: current (${data.rows.length} rows, deck ${data.deck.length})`);
        continue;
      }
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
      changed++;
      log(`${where}: wrote ${data.rows.length} rows, deck ${data.deck.length}`);
    }
  }
  log(`Factor ranking refresh complete: ${changed} file(s) changed.`);
  return changed;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const requested=process.env.UTOOLS_FACTOR_EVENT;
  await refreshRankings(requested ? {slugs:[requested]} : {});
}
