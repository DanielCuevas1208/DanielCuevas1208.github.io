const BASE='https://xn--gck1f423k.xn--1bvt37a.tools';

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

function decodeRscChunks(html) {
  const chunks=[...String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)];
  return chunks.map(([,chunk])=>chunk
    .replace(/\\"/g,'"')
    .replace(/\\n/g,'\n')
    .replace(/\\\\/g,'\\'))
    .join('');
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

let html=null;
let page=null;
for(const style of ['leader','betweener','chaser','runner']){
  const candidate=`${BASE}/race/vsevents/chm2/factor/${style}`;
  try{
    html=await fetchText(candidate);
    page=candidate;
    console.log(`Using raw factor page: ${style} (${html.length} chars)`);
    break;
  }catch(error){
    console.log(`SKIP raw ${style}: ${error.message}`);
  }
}
if(!html){
  console.log('No raw factor page was accessible; bundle inspection skipped.');
  process.exit(0);
}
const srcs=[...new Set(
  [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m)=>m[1].replace(/&amp;/g,'&'))
)];
console.log(`Page scripts: ${srcs.length}`);

const rsc=decodeRscChunks(html);
console.log(`Decoded page RSC: ${rsc.length} chars`);
for(const needle of ['"supportCards":','"courseEffectSet":','"hintSkillIds":','"randomSkillInfos":','"sequenceSkillInfos":','"id":30287']){
  const hits=snippets(rsc,needle,5000,2);
  console.log(`\n=== RSC ${needle} hits=${hits.length} ===`);
  for(const hit of hits){
    console.log(`\n--- RSC ${needle} @ ${hit.index} ---\n${hit.text}\n--- end RSC ---`);
  }
}

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
  const scoringStart=Math.max(0,js.indexOf('function v(e)')-7000);
  const scoringEnd=js.indexOf('var k=',scoringStart);
  if(scoringStart>=0 && scoringEnd>scoringStart){
    console.log(`\n=== EXACT SCORING REGION ${scoringStart}..${scoringEnd} ===\n${js.slice(scoringStart,scoringEnd)}\n=== END EXACT SCORING ===`);
  }
  const fwUses=[...js.matchAll(/\.fw\)/g)].map((m)=>m.index);
  for(const idx of fwUses.slice(0,8)){
    console.log(`\n=== fw use @ ${idx} ===\n${js.slice(Math.max(0,idx-5000),Math.min(js.length,idx+1800))}\n=== end fw use ===`);
  }
  for(const needle of matched){
    for(const hit of snippets(js,needle,2200,4)){
      console.log(`\n--- ${needle} @ ${hit.index} ---\n${hit.text}\n--- end ---`);
    }
  }
}
if(!hits.length) {
  console.log('No factor-related client chunk found among page scripts.');
} else {
  console.log('\nMatched chunks:',hits);
}
console.log('\n=== SEARCHING PAGE CHUNKS FOR BASE-SKILL HELPER MODULES ===');
for(const moduleId of ['88881','39320','38919']){
  for(const src of srcs){
    const url=src.startsWith('http')?src:`${BASE}${src}`;
    let js;
    try{js=await fetchText(url);}catch{continue;}
    const idx=js.indexOf(`${moduleId}:`);
    if(idx<0) continue;
    console.log(`\n=== MODULE ${moduleId} ${src} @ ${idx} ===\n${js.slice(Math.max(0,idx-1800),Math.min(js.length,idx+14000))}\n=== END MODULE ${moduleId} ===`);
    break;
  }
}

console.log('\n=== SEARCHING PAGE CHUNKS FOR fw EXPORT ===');
for(const src of srcs){
  const url=src.startsWith('http')?src:`${BASE}${src}`;
  let js;
  try{js=await fetchText(url);}catch{continue;}
  for(const re of [/fw:\(\)=>/g,/fw:=>/g,/fw/g]){
    const match=re.exec(js);
    if(!match) continue;
    console.log(`\n=== POSSIBLE fw DEFINITION ${src} @ ${match.index} ===\n${js.slice(Math.max(0,match.index-2400),Math.min(js.length,match.index+3000))}\n=== end possible fw ===`);
    break;
  }
}
