import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchUtoolsEventOverview,fetchUtoolsFactorPage,FactorPageUnavailableError} from './utools-factor-rsc.mjs';
import {
  UTOOLS_FACTOR_SLUGS,FACTOR_STYLES,FACTOR_ROOT,
  eventIdentity,parseEventTitle,identityFields,assertPageMatchesIdentity,resolveSnapshotKey,listSnapshots,buildExactIndex,
} from './utools-factor-events.mjs';

function stablePayload(data){
  return {
    schemaVersion:data.schemaVersion,
    eventKey:data.eventKey,
    eventMonth:data.eventMonth,
    courseId:data.courseId,
    style:data.style,
    cards:data.cards,
    skillMap:data.skillMap,
    courseEffectSet:data.courseEffectSet,
  };
}

// Resolves which event a slug currently serves, or null when U-tools no longer
// publishes it. Archived snapshots stay on disk untouched either way.
export async function resolveSlug(slug,{fetchOverview=fetchUtoolsEventOverview,root=FACTOR_ROOT,log=console.log}={}){
  let html;
  try{html=await fetchOverview(slug);}
  catch(error){
    if(error instanceof FactorPageUnavailableError){log(`${slug}: not published upstream; keeping saved snapshots`);return null;}
    throw error;
  }
  if(!parseEventTitle(html)){log(`${slug}: overview has no event title; treating as unpublished`);return null;}
  return resolveSnapshotKey(eventIdentity(slug,html),root);
}

export async function refreshExactPages({
  slugs=UTOOLS_FACTOR_SLUGS,
  root=FACTOR_ROOT,
  fetchOverview=fetchUtoolsEventOverview,
  fetchPage=fetchUtoolsFactorPage,
  log=console.log,
}={}){
  let changed=0;
  const seen=new Map();
  for(const slug of slugs){
    const identity=await resolveSlug(slug,{fetchOverview,root,log});
    if(!identity) continue;
    // Several slugs can alias the same event (loh and loh2 today); import once.
    if(seen.has(identity.key)){log(`${slug}: same event as ${seen.get(identity.key)} (${identity.key}); skipped`);continue;}
    seen.set(identity.key,slug);
    const dir=path.join(root,'exact-pages',identity.key);
    for(const style of FACTOR_STYLES){
      const page=await fetchPage(slug,style);
      assertPageMatchesIdentity(identity,page.pageTitle,`${slug}/${style}`);
      const data={...page,...identityFields(identity),style};
      const file=path.join(dir,style+'.json');
      let previous=null;
      try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
      if(previous && previous.courseId!==data.courseId) throw new Error(`${identity.key}/${style}: saved snapshot is course ${previous.courseId}, refusing to overwrite with ${data.courseId}`);
      const effects=Object.keys(data.courseEffectSet.effects||{}).length;
      if(previous && JSON.stringify(stablePayload(previous))===JSON.stringify(stablePayload(data))){
        log(`${identity.key}/${style} (${slug}, course ${data.courseId}): exact page current (${data.cards.length} cards, ${effects} effects)`);
        continue;
      }
      fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
      changed++;
      log(`${identity.key}/${style} (${slug}, course ${data.courseId}): wrote exact page (${data.cards.length} cards, ${effects} effects)`);
    }
  }
  changed+=writeExactIndex(root,log);
  log(`Exact factor page refresh complete: ${changed} file(s) changed.`);
  return changed;
}

export function writeExactIndex(root=FACTOR_ROOT,log=console.log){
  const index=buildExactIndex(listSnapshots(root));
  const file=path.join(root,'exact-pages','index.json');
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  if(JSON.stringify(previous)===JSON.stringify(index)) return 0;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(index,null,2)+'\n','utf8');
  log(`Wrote exact factor course index for ${Object.keys(index.courses).length} courses.`);
  return 1;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const requested=process.env.UTOOLS_FACTOR_EVENT;
  await refreshExactPages(requested ? {slugs:[requested]} : {});
}
