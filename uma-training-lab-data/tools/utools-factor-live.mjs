const UTOOLS_BASE='https://xn--gck1f423k.xn--1bvt37a.tools';

function sleep(ms) {
  return new Promise((resolve)=>setTimeout(resolve,ms));
}

async function fetchText(url,attempts=4) {
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          accept:'text/plain',
          'user-agent':'uma-training-lab-factor-ranking/1.0',
        },
      });
      if(response.ok) return response.text();
      lastError=new Error(`${response.status} ${response.statusText}: ${url}`);
      if(attempt===attempts || ![403,408,425,429,500,502,503,504].includes(response.status)) throw lastError;
    }catch(error){
      lastError=error;
      if(attempt===attempts) throw error;
    }
    await sleep(600*attempt);
  }
  throw lastError || new Error(`Unable to fetch ${url}`);
}

function imageRows(text,kind) {
  const suffix=kind==='deck'?'thumb':'full';
  const re=new RegExp(
    String.raw`!\\[Image \\d+: (.+?)\\]\\(https://static\\.kouryaku\\.tools/umamusume/images/supports/(\\d+)/${suffix}\\.png[^)]*\\)`,
    'g',
  );
  return [...String(text).matchAll(re)].map((match)=>({
    name:match[1].trim(),
    id:Number(match[2]),
    index:match.index,
    end:match.index+match[0].length,
  }));
}

export function parseUtoolsFactorReader(text) {
  const source=String(text);
  const heading=source.indexOf('## オススメのサポートカード');
  if(heading<0) throw new Error('U-tools factor reader did not contain recommendation heading');

  const deckSectionStart=source.indexOf('本育成デッキによる減点補正');
  const deckSectionEnd=source.indexOf('### 不足しているかもしれないスキル');
  const deckSlice=deckSectionStart>=0 && deckSectionEnd>deckSectionStart
    ? source.slice(deckSectionStart,deckSectionEnd)
    : source.slice(0,heading);
  const deck=imageRows(deckSlice,'deck').map(({id,name})=>({id,name}));

  const rankingSlice=source.slice(heading);
  const images=imageRows(rankingSlice,'ranking');
  const rows=[];
  for(let i=0;i<images.length;i++){
    const image=images[i];
    const nextStart=i+1<images.length?images[i+1].index:rankingSlice.length;
    const window=rankingSlice.slice(image.end,nextStart);
    const scoreMatch=window.match(/(?:^|\n)\s*(-?\d+(?:\.\d+)?)\s*(?:\n|$)/);
    const levelMatch=window.match(/(?:^|\n)\s*Lv\s*(\d+)\s*(?:\n|$)/i);
    if(!scoreMatch || !levelMatch) continue;
    const score=Number(scoreMatch[1]);
    const level=Number(levelMatch[1]);
    if(!Number.isFinite(score) || !Number.isInteger(level)) continue;
    rows.push({
      rank:rows.length+1,
      id:image.id,
      name:image.name,
      score,
      level,
    });
  }

  if(rows.length<10) throw new Error(`U-tools factor reader matched only ${rows.length} ranking rows`);
  return {deck,rows};
}

export async function fetchUtoolsFactorRanking(eventKey,style) {
  const pageUrl=`${UTOOLS_BASE}/race/vsevents/${eventKey}/factor/${style}`;
  const readerUrl=`https://r.jina.ai/${pageUrl}`;
  const text=await fetchText(readerUrl);
  const parsed=parseUtoolsFactorReader(text);
  return {
    schemaVersion:1,
    eventKey:String(eventKey),
    style:String(style),
    pageUrl,
    fetchedAt:new Date().toISOString(),
    transport:'Jina Reader proxy of live U-tools',
    ...parsed,
  };
}
