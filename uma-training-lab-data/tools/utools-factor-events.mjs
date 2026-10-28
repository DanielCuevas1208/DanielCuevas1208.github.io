import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// U-tools reuses event slugs (`loh2`, `chm`, …) for whichever event is current,
// so a slug never identifies a course. Snapshots are keyed by what the page
// itself says: event kind + month from the title, course from the overview.
export const UTOOLS_FACTOR_SLUGS=['loh','loh2','chm','chm2','chm3'];
export const FACTOR_STYLES=['runner','leader','betweener','chaser'];
export const FACTOR_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','factor-score');

const KIND_LABEL={loh:'League of Heroes',chm:'Champions Meeting',spchm:'Special Champions Meeting'};

export function parseEventTitle(text){
  const match=String(text).match(/【(\d{4})\/(\d{1,2})】([^<|\n"\\]*?)の(?:攻略まとめ|因子周回|有効スキル)/);
  if(!match) return null;
  const [,year,month,name]=match;
  const kind=/リーグオブヒーローズ/.test(name) ? 'loh'
    : /チャンピオンズミーティング/.test(name) ? (/スペシャル|SP/.test(name) ? 'spchm' : 'chm')
    : null;
  if(!kind) return null;
  return {month:`${year}-${month.padStart(2,'0')}`,kind,name:name.trim()};
}

export function parseEventCourseId(text){
  const ids=new Set([...String(text).matchAll(/\/race\/courses\/(\d{5})(?!\d)/g)].map(m=>Number(m[1])));
  if(ids.size!==1) throw new Error(`expected exactly one course link on the event overview, found ${ids.size ? [...ids].join(', ') : 'none'}`);
  return [...ids][0];
}

export function eventIdentity(slug,overviewHtml){
  const title=parseEventTitle(overviewHtml);
  if(!title) throw new Error(`${slug}: event overview has no recognisable 【YYYY/MM】 event title`);
  const courseId=parseEventCourseId(overviewHtml);
  return {
    slug,
    key:`${title.kind}-${title.month}`,
    kind:title.kind,
    month:title.month,
    courseId,
    label:`${title.month} ${KIND_LABEL[title.kind]}`,
    title:title.name,
  };
}

export function identityFields(identity){
  return {
    eventKey:identity.key,
    slug:identity.slug,
    eventMonth:identity.month,
    eventKind:identity.kind,
    label:identity.label,
    courseId:identity.courseId,
  };
}

// A page's own title must name the same event and month as its overview.
export function assertPageMatchesIdentity(identity,pageTitle,where){
  const title=parseEventTitle(pageTitle);
  if(!title) throw new Error(`${where}: factor page has no recognisable event title`);
  if(title.kind!==identity.kind || title.month!==identity.month){
    throw new Error(`${where}: factor page is ${title.kind} ${title.month} but the overview is ${identity.kind} ${identity.month}`);
  }
}

// Keys collide only if one month had two events of the same kind on different
// courses; keep both rather than overwrite.
export function resolveSnapshotKey(identity,root=FACTOR_ROOT){
  const existing=readSnapshotIdentity(path.join(root,'exact-pages',identity.key));
  if(existing && existing.courseId!==identity.courseId) return {...identity,key:`${identity.key}-${identity.courseId}`};
  return identity;
}

function readSnapshotIdentity(dir){
  for(const style of FACTOR_STYLES){
    try{
      const page=JSON.parse(fs.readFileSync(path.join(dir,style+'.json'),'utf8'));
      return {courseId:Number(page.courseId),month:page.eventMonth,kind:page.eventKind,label:page.label};
    }catch{}
  }
  return null;
}

export function listSnapshots(root=FACTOR_ROOT){
  const base=path.join(root,'exact-pages');
  if(!fs.existsSync(base)) return [];
  return fs.readdirSync(base,{withFileTypes:true})
    .filter(entry=>entry.isDirectory())
    .map(entry=>{
      const dir=path.join(base,entry.name);
      const styles={};
      let identity=null;
      for(const style of FACTOR_STYLES){
        const file=path.join(dir,style+'.json');
        if(!fs.existsSync(file)) continue;
        const page=JSON.parse(fs.readFileSync(file,'utf8'));
        if(page.eventKey!==entry.name || page.style!==style || !Number.isInteger(page.courseId) || !/^\d{4}-\d{2}$/.test(page.eventMonth||'')){
          throw new Error(`exact-pages/${entry.name}/${style}.json: identity fields do not match its directory`);
        }
        if(identity && identity.courseId!==page.courseId) throw new Error(`exact-pages/${entry.name}: styles disagree on courseId`);
        identity={key:entry.name,courseId:page.courseId,month:page.eventMonth,kind:page.eventKind,label:page.label};
        styles[style]={path:`exact-pages/${entry.name}/${style}.json`,effects:Object.keys(page.courseEffectSet?.effects||{}).length};
      }
      return identity ? {...identity,styles} : null;
    })
    .filter(Boolean)
    .sort((a,b)=>a.month.localeCompare(b.month) || a.key.localeCompare(b.key));
}

// The app looks pages up by course; when a course hosted several events the
// newest complete snapshot wins.
export function buildExactIndex(snapshots){
  const courses={};
  for(const snap of snapshots){
    if(Object.keys(snap.styles).length!==FACTOR_STYLES.length) continue;
    const current=courses[String(snap.courseId)];
    if(current && current.month>snap.month) continue;
    courses[String(snap.courseId)]={courseId:snap.courseId,eventKey:snap.key,label:snap.label,month:snap.month,styles:snap.styles};
  }
  const sorted=Object.fromEntries(Object.entries(courses).sort(([a],[b])=>Number(a)-Number(b)));
  return {schemaVersion:1,courses:sorted};
}
