const BASE='https://xn--gck1f423k.xn--1bvt37a.tools/race/vsevents/chm2/factor';

function decodeRscChunks(html) {
  return [...String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)]
    .map(([, chunk]) => chunk
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\'))
    .join('');
}

function windowsAround(text, needles, radius=1600) {
  const out=[];
  for (const needle of needles) {
    let from=0, count=0;
    while (count<4) {
      const i=text.indexOf(String(needle),from);
      if(i<0) break;
      const start=Math.max(0,i-radius), end=Math.min(text.length,i+String(needle).length+radius);
      out.push({needle,index:i,text:text.slice(start,end)});
      from=i+String(needle).length;
      count++;
    }
  }
  return out;
}

function keyFrequency(text) {
  const counts=new Map();
  for(const m of text.matchAll(/"([A-Za-z_$][A-Za-z0-9_$]{1,60})":/g)){
    counts.set(m[1],(counts.get(m[1])||0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}

let inspected=0;
for (const style of ['runner','leader','betweener','chaser']) {
  const url=`${BASE}/${style}`;
  const response=await fetch(url,{
    headers:{
      accept:'text/html,application/xhtml+xml',
      'accept-language':'ja,en;q=0.7',
      'user-agent':'Mozilla/5.0 (compatible; UmaTrainingLabFactorInspector/1.0)',
    },
  });
  if(!response.ok) {
    console.log(`SKIP ${style}: direct factor HTML returned ${response.status} ${response.statusText}`);
    continue;
  }
  inspected++;
  const html=await response.text();
  const rsc=decodeRscChunks(html);
  console.log(`\n=== ${style} html=${html.length} rsc=${rsc.length} ===`);
  console.log('Interesting keys:',keyFrequency(rsc).filter(([k])=>/score|factor|hint|skill|point|pt|value|effect|event|support|rank|table|penal|eff|level|lv/i.test(k)).slice(0,100));

  const probes = style==='chaser'
    ? ['51.57','49.07','30287','30250','Luz de ensueño','星跨ぐメッセージ','本育成デッキ']
    : style==='runner' ? ['37.7','35.35','30287']
    : [];
  for(const hit of windowsAround(rsc,probes,1200)){
    console.log(`\n--- ${style} probe ${hit.needle} @ ${hit.index} ---\n${hit.text}\n--- end ---`);
  }
}

if (!inspected) {
  console.log('No raw factor pages were directly accessible from this runner; rendered-page verification remains available through the benchmark targets.');
}
