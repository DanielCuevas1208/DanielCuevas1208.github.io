const BASE='https://xn--gck1f423k.xn--1bvt37a.tools';
const PAGE=`${BASE}/race/vsevents/chm2/factor/chaser`;

async function fetchText(url) {
  const response=await fetch(url,{
    headers:{
      accept:'text/html,application/javascript,text/javascript,*/*',
      'accept-language':'ja,en;q=0.7',
      'user-agent':'Mozilla/5.0 (compatible; UmaTrainingLabBundleInspector/1.0)',
    },
  });
  if(!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function snippets(text,needle,radius=1800,limit=8) {
  const out=[];
  let from=0;
  while(out.length<limit){
    const i=text.indexOf(needle,from);
    if(i<0) break;
    out.push({index:i,text:text.slice(Math.max(0,i-radius),Math.min(text.length,i+needle.length+radius))});
    from=i+needle.length;
  }
  return out;
}

const html=await fetchText(PAGE);
const srcs=[...new Set(
  [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m)=>m[1].replace(/&amp;/g,'&'))
)];
console.log(`Page scripts: ${srcs.length}`);

const needles=[
  'hintSkillIds',
  'randomSkillInfos',
  'sequenceSkillInfos',
  'courseEffectSet',
  'supportCards',
  '本育成デッキによる減点補正',
  'オススメのサポートカード',
];
const hits=[];
for(const src of srcs){
  const url=src.startsWith('http')?src:`${BASE}${src}`;
  let js;
  try{js=await fetchText(url);}catch(error){
    console.log(`SKIP ${src}: ${error.message}`);
    continue;
  }
  const matched=needles.filter((needle)=>js.includes(needle));
  if(!matched.length) continue;
  hits.push({src,url,size:js.length,matched});
  console.log(`\n=== MATCH ${src} size=${js.length} needles=${matched.join(',')} ===`);
  for(const needle of matched){
    for(const hit of snippets(js,needle,2200,4)){
      console.log(`\n--- ${needle} @ ${hit.index} ---\n${hit.text}\n--- end ---`);
    }
  }
}
if(!hits.length) throw new Error('No factor-related client chunk found');
console.log('\nMatched chunks:',hits);
