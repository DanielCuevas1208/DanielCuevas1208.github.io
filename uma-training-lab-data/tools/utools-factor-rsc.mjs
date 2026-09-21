const UTOOLS_BASE='https://xn--gck1f423k.xn--1bvt37a.tools';

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

export function decodeRscChunks(html){
  const chunks=[...String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)];
  return chunks.map(([,chunk])=>chunk
    .replace(/\\"/g,'"')
    .replace(/\\n/g,'\n')
    .replace(/\\\\/g,'\\'))
    .join('');
}

function scanBalanced(text,start,open,close){
  let depth=0;
  let inString=false;
  let escaped=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch===open) depth++;
    else if(ch===close){
      depth--;
      if(depth===0) return text.slice(start,i+1);
    }
  }
  return null;
}

function jsonValuesForKey(text,key,open,close){
  const needle=`"${key}":${open}`;
  const values=[];
  let from=0;
  while(true){
    const index=text.indexOf(needle,from);
    if(index<0) break;
    const start=index+needle.length-1;
    const raw=scanBalanced(text,start,open,close);
    if(raw){
      try{values.push(JSON.parse(raw));}catch{}
    }
    from=index+needle.length;
  }
  return values;
}

export function parseUtoolsFactorRsc(html){
  const rsc=decodeRscChunks(html);
  if(!rsc) throw new Error('Factor page contained no decodable Next.js RSC payload');

  const supportCards=jsonValuesForKey(rsc,'supportCards','[',']')
    .filter(value=>Array.isArray(value))
    .sort((a,b)=>b.length-a.length)
    .find(cards=>
      cards.length>=100 &&
      cards.some(card=>Number.isInteger(Number(card?.id)) && Array.isArray(card?.hintSkillIds))
    ) || null;

  const courseEffectSet=jsonValuesForKey(rsc,'courseEffectSet','{','}')
    .filter(value=>value && typeof value==='object')
    .find(value=>value.effects && typeof value.effects==='object') || null;

  const skillMaps=jsonValuesForKey(rsc,'skillMap','{','}')
    .filter(value=>value && typeof value==='object')
    .sort((a,b)=>Object.keys(b).length-Object.keys(a).length);
  const skillMap=skillMaps.find(value=>Object.keys(value).length>=100) || null;

  return {rsc,supportCards,courseEffectSet,skillMap};
}

async function fetchRaw(url,attempts=2){
  let last=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          accept:'text/html,application/xhtml+xml',
          'accept-language':'ja,en;q=0.7',
          'user-agent':'Mozilla/5.0 (compatible; UmaTrainingLabFactorRsc/1.0)',
        },
        redirect:'follow',
      });
      if(!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return {text:await response.text(),finalUrl:response.url};
    }catch(error){
      last=error;
      if(attempt<attempts) await sleep(500*attempt);
    }
  }
  throw last || new Error(`Unable to fetch ${url}`);
}

export async function fetchUtoolsFactorSupportCards({
  eventKeys=['chm2','chm','loh2','loh'],
  styles=['runner','leader','betweener','chaser'],
}={}){
  const errors=[];
  for(const eventKey of eventKeys){
    for(const style of styles){
      const url=`${UTOOLS_BASE}/race/vsevents/${eventKey}/factor/${style}`;
      try{
        const {text,finalUrl}=await fetchRaw(url);
        const parsed=parseUtoolsFactorRsc(text);
        if(!parsed.supportCards?.length){
          errors.push(`${eventKey}/${style}: no supportCards array`);
          continue;
        }
        return {
          schemaVersion:1,
          pageUrl:url,
          finalUrl,
          eventKey,
          style,
          fetchedAt:new Date().toISOString(),
          cards:parsed.supportCards,
        };
      }catch(error){
        errors.push(`${eventKey}/${style}: ${error.message}`);
      }
    }
  }
  throw new Error(`Unable to extract U-tools factor support metadata: ${errors.join(' | ')}`);
}
