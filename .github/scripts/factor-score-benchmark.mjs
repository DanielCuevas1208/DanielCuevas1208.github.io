import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKILLS_URL = 'https://daftuyda.moe/assets/skills_all.json';
const SUPPORT_URL = 'https://raw.githubusercontent.com/mee1080/umasim/main/data/support_card.txt';

const STATUS_KEYS = [
  'friend','motivation','speedBonus','staminaBonus','powerBonus','gutsBonus','wisdomBonus','training',
  'initialSpeed','initialStamina','initialPower','initialGuts','initialWisdom','initialRelation','race','fan',
  'hintLevel','hintFrequency','specialtyRate','eventRecovery','eventEffect','failureRate','hpCost','skillPtBonus',
  'wisdomFriendRecovery','initialSkillPt',
];
const DISCOUNTS = [0, 0.10, 0.20, 0.30, 0.35, 0.40];

const BENCHMARKS = {
  current_runner: {
    courseId: 11203,
    style: 'runner',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[波間のオフショット] スマートファルコン','[無機の闘志] ミホノブルボン','[Innovator] フォーエバーヤング'],
    rows: [
      ['[My Beloved Scenery] サイレンススズカ',37.70],['[星跨ぐメッセージ] ネオユニヴァース',35.35],['[天まで焦がせ祈りの火] ヤエノムテキ',33.43],['[刀光散らしてClash！] タップダンスシチー',32.87],['[心覚えし、京の華] エアグルーヴ',32.63],['[Devilish Whispers] スティルインラブ',32.37],['[幸福の匂いにまどろむ] セイウンスカイ',31.81],['[その執念は怒濤が如く] メイショウドトウ',31.15],['[気まぐれ渡り星] ステイゴールド',30.57],['[TT Ignition!] ツインターボ',30.44],['[夏空チルタイム] アーモンドアイ',30.26],['[白に至る覚悟] デアリングハート',29.82],['[夕映えに身をゆだねて] メジロアルダン',29.65],['[月下麗人] メジロラモーヌ',29.44],['[As if Guided] エフフォーリア',28.44],['[雲煙飛動] シンボリルドルフ',27.99],['[ぬりぬりシェイプアップ！] ダンツフレーム',26.57],['[冬溶かす熾火] メジロラモーヌ',25.88],['[静寂を煎じ] サクラチトセオー',25.36],['[ウタエミンナノ] ツインターボ',25.26],
    ],
  },
  current_leader: {
    courseId: 11203,
    style: 'leader',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[天才的ユートピア] トウカイテイオー','[深窓の少女へ] メジロアルダン','[Innovator] フォーエバーヤング'],
    rows: [
      ['[心覚えし、京の華] エアグルーヴ',52.60],['[As if Guided] エフフォーリア',50.99],['[賑やかな未来を乗せて走れ！] サクラチヨノオー',48.74],['[雲煙飛動] シンボリルドルフ',48.08],['[星跨ぐメッセージ] ネオユニヴァース',47.58],['[冬溶かす熾火] メジロラモーヌ',46.70],['[天まで焦がせ祈りの火] ヤエノムテキ',40.34],['[大望は飛んでいく] エルコンドルパサー',39.97],['[ぬりぬりシェイプアップ！] ダンツフレーム',37.37],['[V.E.R.2285のあなたへ] ネオユニヴァース',36.99],['[夕映えに身をゆだねて] メジロアルダン',36.49],['[ゆかし、きらめきの旅路] ファインモーション',35.67],['[気まぐれ渡り星] ステイゴールド',34.56],['[その執念は怒濤が如く] メイショウドトウ',33.62],['[Devilish Whispers] スティルインラブ',33.31],['[歴史も美食も余すところなく] ファインモーション',32.54],['[咆哮のアポヤンド] ナリタブライアン',32.07],['[Time flies] トーセンジョーダン',32.04],['[白き稲妻の如く] タマモクロス',31.56],['[The frontier] ジャングルポケット',31.49],
    ],
  },
  current_betweener: {
    courseId: 11203,
    style: 'betweener',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[Zirkus der Träume] エイシンフラッシュ','[白き稲妻の如く] タマモクロス','[Innovator] フォーエバーヤング'],
    rows: [
      ['[氷結晶の静域] アドマイヤグルーヴ',62.00],['[心覚えし、京の華] エアグルーヴ',53.52],['[両手いっぱい、小倉愛] ナイスネイチャ',51.38],['[星跨ぐメッセージ] ネオユニヴァース',49.79],['[全てに挑む勇ましき者] アグネスデジタル',48.96],['[雲煙飛動] シンボリルドルフ',48.17],['[冬溶かす熾火] メジロラモーヌ',46.75],['[無垢の白妙] デアリングタクト',45.34],['[瞳に闘志を胸に勝利の渇望を] メジロライアン',42.60],['[不屈の遠吠え] メイショウドトウ',42.28],['[The frontier] ジャングルポケット',40.29],['[Ballroom Tempest] ウオッカ',39.97],['[行き先はあたたかな場所] マチカネタンホイザ',39.65],['[会心のウイニングスマイル] ヴィブロス',39.51],['[私たちのプリンセス流儀] カワカミプリンセス',37.92],['[V.E.R.2285のあなたへ] ネオユニヴァース',37.46],['[43、8、1] ナカヤマフェスタ',36.27],['[ぬりぬりシェイプアップ！] ダンツフレーム',35.89],['[トばすぜホットサマー！] ジャングルポケット',35.72],['[Devilish Whispers] スティルインラブ',35.55],
    ],
  },
  current_chaser: {
    courseId: 11203,
    style: 'chaser',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[誘うは夢心地] ドリームジャーニー','[白き稲妻の如く] タマモクロス','[Innovator] フォーエバーヤング'],
    rows: [
      ['[Luz de ensueño] ブエナビスタ',51.57],['[星跨ぐメッセージ] ネオユニヴァース',49.07],['[時に交わる海と空] ミスターシービー',41.85],['[フォルトゥーナの喝采] タニノギムレット',40.04],['[The frontier] ジャングルポケット',39.62],['[Take Them Down!] ナリタタイシン',38.84],['[牙を立て、リフレイン] ヒシアマゾン',37.48],['[V.E.R.2285のあなたへ] ネオユニヴァース',36.64],['[Devilish Whispers] スティルインラブ',35.88],['[Tranquillo] ドゥラメンテ',35.50],['[天まで焦がせ祈りの火] ヤエノムテキ',35.24],['[波をかきわけ夢がゆく] ゴールドシップ',34.87],['[その執念は怒濤が如く] メイショウドトウ',34.77],['[心覚えし、京の華] エアグルーヴ',34.24],['[気まぐれ渡り星] ステイゴールド',34.19],['[冬溶かす熾火] メジロラモーヌ',34.11],['[只、君臨す。] オルフェーヴル',33.92],['[白に至る純真] デアリングタクト',32.86],['[夕映えに身をゆだねて] メジロアルダン',32.69],['[月下麗人] メジロラモーヌ',32.65],
    ],
  },,
  loh2_chaser: {
    courseId: 10504,
    style: 'chaser',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[誘うは夢心地] ドリームジャーニー','[白き稲妻の如く] タマモクロス','[Innovator] フォーエバーヤング'],
    rows: [
      ['[星跨ぐメッセージ] ネオユニヴァース',45.41],['[Luz de ensueño] ブエナビスタ',41.64],['[The frontier] ジャングルポケット',39.48],['[歴史も美食も余すところなく] ファインモーション',35.39],['[冬溶かす熾火] メジロラモーヌ',34.18],['[Devilish Whispers] スティルインラブ',32.67],['[V.E.R.2285のあなたへ] ネオユニヴァース',32.05],['[天まで焦がせ祈りの火] ヤエノムテキ',30.23],['[フォルトゥーナの喝采] タニノギムレット',29.76],['[夕映えに身をゆだねて] メジロアルダン',29.74],['[夏空チルタイム] アーモンドアイ',29.27],['[気まぐれ渡り星] ステイゴールド',28.98],['[心覚えし、京の華] エアグルーヴ',28.94],['[月下麗人] メジロラモーヌ',28.49],['[白に至る純真] デアリングタクト',28.26],['[血脈の胎動] ドゥラメンテ',28.16],['[只、君臨す。] オルフェーヴル',27.71],['[その執念は怒濤が如く] メイショウドトウ',27.17],['[そびえ立つ背中] ヒシアマゾン',27.16],['[白に至る覚悟] デアリングハート',27.06],
    ],
  },
  september_chaser: {
    courseId: 10603,
    style: 'chaser',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[誘うは夢心地] ドリームジャーニー','[白き稲妻の如く] タマモクロス','[Innovator] フォーエバーヤング'],
    rows: [
      ['[スマイル・エバーアフター] グランアレグリア',45.19],['[月下のSunshine] タイキシャトル',40.76],['[告知]新刊あります！ アグネスデジタル',39.49],['[優しい月] ゴールドシチー',38.44],['[Unveiled Dream] ラインクラフト',33.14],['[鉄の乙女も微笑んで] イクノディクタス',32.16],['[白に至る純真] デアリングタクト',26.19],['[Devilish Whispers] スティルインラブ',25.32],['[お日さま天使ちゃん♪] ダイタクヘリオス',25.16],['[今宵、我が君のために] デュランダル',24.92],['[聖夜、変わるために] メジロドーベル',24.86],['[我が学び舎へ、愛をこめて] ブエナビスタ',24.62],['[Blooming Buds] デアリングハート',24.51],['[お任せ！オートクチュール] ノースフライト',24.41],['[Hands up, crook!] タイキシャトル',23.81],['[壇上より魔法を込めて] フジキセキ',23.07],['[あまえんぼNight] タイキシャトル',22.73],['[Take Them Down!] ナリタタイシン',22.07],['[NEW TALES AWAIT] グランアレグリア',22.02],['[朝焼け苺の畑にて] ニシノフラワー',21.99],
    ],
  },
  october_leader: {
    courseId: 10808,
    style: 'leader',
    deck: ['[American Dream] カジノドライヴ','[世界を変える眼差し] アーモンドアイ','[天才的ユートピア] トウカイテイオー','[深窓の少女へ] メジロアルダン','[Innovator] フォーエバーヤング'],
    rows: [
      ['[As if Guided] エフフォーリア',48.08],['[冬溶かす熾火] メジロラモーヌ',46.68],['[星跨ぐメッセージ] ネオユニヴァース',46.37],['[心覚えし、京の華] エアグルーヴ',45.46],['[賑やかな未来を乗せて走れ！] サクラチヨノオー',43.85],['[ゆかし、きらめきの旅路] ファインモーション',42.59],['[雲煙飛動] シンボリルドルフ',38.70],['[ぬりぬりシェイプアップ！] ダンツフレーム',37.03],['[天まで焦がせ祈りの火] ヤエノムテキ',36.70],['[V.E.R.2285のあなたへ] ネオユニヴァース',35.08],['[ゼッタイ☆天才伝説] フサイチパンドラ',33.73],['[歴史も美食も余すところなく] ファインモーション',33.36],['[夕映えに身をゆだねて] メジロアルダン',33.33],['[天才的ガチエモSUMMER!!] フサイチパンドラ',33.27],['[Devilish Whispers] スティルインラブ',32.59],['[白き稲妻の如く] タマモクロス',32.58],['[The frontier] ジャングルポケット',32.04],['[気まぐれ渡り星] ステイゴールド',31.92],['[咆哮のアポヤンド] ナリタブライアン',31.92],['[そして幕は上がる] ダンツフレーム',31.43],
    ],
  }
};

function normalizeName(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, '').replace(/[［【]/g, '[').replace(/[］】]/g, ']');
}
function flattenIds(value) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) for (const y of x) walk(y);
    else if (Number.isFinite(Number(x))) out.push(Number(x));
  };
  walk(value);
  return out;
}
function parseStatus(cols, index) {
  const out = {};
  for (const key of STATUS_KEYS) out[key] = Number(cols[index++]) || 0;
  return [out, index];
}
function parseSpecial(text) {
  const values = String(text || '').split(',').map(Number).filter(Number.isFinite);
  const out = [];
  for (let i = 0; i + 5 < values.length; i += 6) {
    out.push({ type: values[i], v0: values[i+1], v1: values[i+2], v2: values[i+3], v3: values[i+4], v4: values[i+5] });
  }
  return out;
}
function parseSupports(text) {
  const byName = new Map();
  const byId = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const a = line.split('	');
    if (a.length < 60) continue;
    let i = 0;
    const id = Number(a[i++]);
    const name = a[i++];
    const chara = a[i++];
    const rarity = Number(a[i++]);
    const talent = Number(a[i++]);
    const maxLevel = Number(a[i++]);
    const type = a[i++];
    let status; [status, i] = parseStatus(a, i);
    let unique; [unique, i] = parseStatus(a, i);
    const skills = String(a[i++] || '').split(', ').map(x => x.trim()).filter(Boolean);
    const hintStatus = a[i++] || '';
    const special = parseSpecial(a[i++] || '');
    if (talent !== 4) continue;
    const card = { id, name, chara, rarity, talent, maxLevel, type, status, unique, skills, hintStatus, special };
    byName.set(normalizeName(name), card);
    byId.set(id, card);
  }
  return { byName, byId };
}
function hintCountUp(card) {
  return card.special.reduce((sum, s) => sum + (s.type === 101 && 100 >= s.v0 ? (s.v1 === 33 ? s.v2 : 0) + (s.v3 === 33 ? s.v4 : 0) : 0), 0);
}
function hintChance(card) {
  return Math.min(1, 0.025 + 0.05 * (100 + card.status.hintFrequency) * (100 + card.unique.hintFrequency) / 10000);
}
function hintBonusLevel(card) {
  return Math.max(0, Math.min(4, Math.floor(card.status.hintLevel + card.unique.hintLevel)));
}
function acquiredHintLevel(card) {
  return Math.max(1, Math.min(5, 1 + hintBonusLevel(card)));
}
function discountForLevel(level) {
  return DISCOUNTS[Math.max(0, Math.min(5, Math.floor(level)))] || 0;
}
function sourceSet(skill, skillById) {
  const support = new Map();
  const members = [skill, ...(skill.versions || []).map(id => skillById.get(Number(id))).filter(Boolean)];
  for (const member of members) {
    const via = Number(member.id) !== Number(skill.id);
    for (const id of flattenIds(member.sup_hint)) {
      const row = support.get(id) || { hint:false, viaHint:false, event:false, viaEvent:false };
      if (via) row.viaHint = true; else row.hint = true;
      support.set(id, row);
    }
    for (const id of flattenIds(member.sup_e)) {
      const row = support.get(id) || { hint:false, viaHint:false, event:false, viaEvent:false };
      if (via) row.viaEvent = true; else row.event = true;
      support.set(id, row);
    }
  }
  return support;
}
function ranks(values) {
  const indexed = values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
  const out = Array(values.length);
  for (let p=0;p<indexed.length;) {
    let q=p+1;
    while(q<indexed.length && indexed[q].v===indexed[p].v) q++;
    const rank=(p+q-1)/2+1;
    for(let j=p;j<q;j++) out[indexed[j].i]=rank;
    p=q;
  }
  return out;
}
function pearson(a,b) {
  if (a.length<2) return 0;
  const ma=a.reduce((x,y)=>x+y,0)/a.length, mb=b.reduce((x,y)=>x+y,0)/b.length;
  let num=0, da=0, db=0;
  for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;num+=x*y;da+=x*x;db+=y*y;}
  return da>0&&db>0?num/Math.sqrt(da*db):0;
}
function spearman(rows, predicted) {
  return pearson(ranks(rows.map(r=>r.target)), ranks(predicted));
}
function scaleFit(xs, ys) {
  let xy=0, xx=0;
  for(let i=0;i<xs.length;i++){xy+=xs[i]*ys[i];xx+=xs[i]*xs[i];}
  return xx>0 ? Math.max(0,xy/xx) : 0;
}
function nrmse(xs, ys) {
  if (!ys.length) return 1;
  let s=0;
  for(let i=0;i<ys.length;i++) s+=(xs[i]-ys[i])**2;
  const rmse=Math.sqrt(s/ys.length);
  const mean=ys.reduce((a,b)=>a+b,0)/ys.length || 1;
  return rmse/mean;
}
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'uma-training-lab-factor-benchmark/1.0' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return r.text();
}

const availableBenchmarks = Object.fromEntries(Object.entries(BENCHMARKS).filter(([key, bench]) => {
  const file=path.join(ROOT,'uma-training-lab-data','skill-effects','jp',String(bench.courseId),`${bench.style}.json`);
  if (fs.existsSync(file)) return true;
  console.log(`Skipping ${key}: course ${bench.courseId}/${bench.style} effect file is not present yet.`);
  return false;
}));
if (!Object.keys(availableBenchmarks).length) {
  console.log('No benchmark course files are present; benchmark skipped.');
  process.exit(0);
}

const [skillsText, supportText] = await Promise.all([fetchText(SKILLS_URL), fetchText(SUPPORT_URL)]);
const skillList = JSON.parse(skillsText);
const skillById = new Map();
for (const skill of skillList) {
  skillById.set(Number(skill.id), skill);
  if (skill.gene_version?.id) skillById.set(Number(skill.gene_version.id), { ...skill.gene_version, __geneParentId:Number(skill.id) });
}
const { byName: supportByName } = parseSupports(supportText);
const whiteSkills = skillList.filter(s => Number(s.rarity) === 1);
const sourcesBySkill = new Map(whiteSkills.map(s => [Number(s.id), sourceSet(s, skillById)]));

const datasets = {};
const missingCards = new Set();
for (const [scenario, bench] of Object.entries(availableBenchmarks)) {
  const effects = JSON.parse(fs.readFileSync(path.join(ROOT,'uma-training-lab-data','skill-effects','jp',String(bench.courseId),`${bench.style}.json`),'utf8'));
  const effectById = new Map((effects.skills || []).map(r => [Number(r.id),r]));
  const deckIds = new Set();
  for (const label of bench.deck) {
    const card=supportByName.get(normalizeName(label));
    if(card) deckIds.add(card.id); else missingCards.add(label);
  }
  const covered = new Set();
  for (const skill of whiteSkills) {
    const src = sourcesBySkill.get(Number(skill.id));
    if (!src) continue;
    for (const deckId of deckIds) if (src.has(deckId)) { covered.add(Number(skill.id)); break; }
  }
  const rows=[];
  for (const [label,target] of bench.rows) {
    const card=supportByName.get(normalizeName(label));
    if(!card){missingCards.add(label);continue;}
    const entries=[];
    for (const skill of whiteSkills) {
      const effect=effectById.get(Number(skill.id));
      if(!effect || !(Number(effect.expectedEffect)>0)) continue;
      const src=sourcesBySkill.get(Number(skill.id))?.get(card.id);
      if(!src) continue;
      entries.push({
        id:Number(skill.id),
        value:Number(effect.expectedEffect),
        cost:Number(skill.cost),
        covered:covered.has(Number(skill.id)),
        hint:src.hint||src.viaHint,
        directHint:src.hint,
        viaHint:src.viaHint,
        event:src.event||src.viaEvent,
        directEvent:src.event,
        viaEvent:src.viaEvent,
      });
    }
    rows.push({ scenario,style:bench.style,courseId:bench.courseId,label,target,card,entries });
  }
  if (rows.length >= 5) datasets[scenario]=rows;
}

if (missingCards.size) console.error(`WARN: ${missingCards.size} benchmark card(s) did not map: ${[...missingCards].join(' | ')}`);

function rawScore(row,p) {
  const card=row.card;
  const level=acquiredHintLevel(card);
  const hintDiscount=discountForLevel(level);
  const pHint=hintChance(card);
  const extra=hintCountUp(card);
  const tableSize=Math.max(1,card.skills.length);
  let hintSum=0,eventSum=0,usefulHints=0;
  for(const x of row.entries){
    const deckMul=x.covered?p.deckPenalty:1;
    if(deckMul<=0) continue;
    const baseCost=Number.isFinite(x.cost)&&x.cost>0?x.cost:null;
    if(x.hint){
      const effCost=baseCost?baseCost*(1-hintDiscount):null;
      const eff=effCost?x.value/effCost*100:x.value;
      const u=Math.pow(Math.max(1e-9,x.value),p.a)*Math.pow(Math.max(1e-9,eff),p.b);
      hintSum+=u*deckMul;
      usefulHints+=1;
    }
    if(x.event){
      const eventDiscount=discountForLevel(p.eventHintLevel);
      const effCost=baseCost?baseCost*(1-eventDiscount):null;
      const eff=effCost?x.value/effCost*100:x.value;
      let u=Math.pow(Math.max(1e-9,x.value),p.a)*Math.pow(Math.max(1e-9,eff),p.b);
      if(x.viaEvent&&!x.directEvent) u*=p.viaEventWeight;
      eventSum+=u*deckMul;
    }
  }
  const tableQuality=hintSum/tableSize;
  const breadth=1+p.breadth*Math.log1p(usefulHints);
  const hintRate=Math.pow(Math.max(1e-9,pHint/0.075),p.hintRatePower);
  const multi=Math.pow(1+Math.max(0,extra),p.extraHintPower);
  return tableQuality*breadth*hintRate*multi + p.eventWeight*eventSum;
}

const scenarios=Object.keys(datasets);
const allRows=scenarios.flatMap(s=>datasets[s]);
const grid={
  a:[0.25,0.5,0.75,1],
  b:[0,0.25,0.5,0.75,1],
  breadth:[0,0.15,0.3,0.5],
  hintRatePower:[0,0.5,1],
  extraHintPower:[0,0.5,1],
  eventWeight:[0.25,0.5,0.75,1,1.5,2],
  deckPenalty:[0,0.25,0.5,0.75,1],
  viaEventWeight:[0.5,0.75,1],
  eventHintLevel:[1,2],
};
let tested=0,best=null;
for(const a of grid.a)for(const b of grid.b)for(const breadth of grid.breadth)
for(const hintRatePower of grid.hintRatePower)for(const extraHintPower of grid.extraHintPower)
for(const eventWeight of grid.eventWeight)for(const deckPenalty of grid.deckPenalty)
for(const viaEventWeight of grid.viaEventWeight)for(const eventHintLevel of grid.eventHintLevel){
  const p={a,b,breadth,hintRatePower,extraHintPower,eventWeight,deckPenalty,viaEventWeight,eventHintLevel};
  let cvLoss=0,cvRho=0,cvRmse=0;
  for(const holdout of scenarios){
    const train=scenarios.filter(s=>s!==holdout).flatMap(s=>datasets[s]);
    const trainRaw=train.map(r=>rawScore(r,p)), trainY=train.map(r=>r.target);
    const scale=scaleFit(trainRaw,trainY);
    const test=datasets[holdout];
    const pred=test.map(r=>rawScore(r,p)*scale), y=test.map(r=>r.target);
    const rho=spearman(test,pred), err=nrmse(pred,y);
    cvRho+=rho;cvRmse+=err;cvLoss+=(1-rho)+0.35*err;
  }
  cvLoss/=scenarios.length;cvRho/=scenarios.length;cvRmse/=scenarios.length;tested++;
  if(!best||cvLoss<best.cvLoss) best={p,cvLoss,cvRho,cvRmse};
}

const raw=allRows.map(r=>rawScore(r,best.p));
const targets=allRows.map(r=>r.target);
const scale=scaleFit(raw,targets);
const pred=raw.map(x=>x*scale);
console.log(`Tested ${tested.toLocaleString()} interpretable parameter combinations across ${allRows.length} U-tools card/scenario targets.`);
console.log(`Best leave-one-scenario-out: Spearman=${best.cvRho.toFixed(4)} NRMSE=${best.cvRmse.toFixed(4)} loss=${best.cvLoss.toFixed(4)}`);
console.log(`Parameters: ${JSON.stringify({...best.p,scale:Number(scale.toFixed(6))})}`);
console.log(`All-data Spearman=${spearman(allRows,pred).toFixed(4)} NRMSE=${nrmse(pred,targets).toFixed(4)}`);
for(const scenario of scenarios){
  const rows=datasets[scenario];
  const pairs=rows.map(r=>({label:r.label,target:r.target,pred:rawScore(r,best.p)*scale}));
  console.log(`\n${scenario}: rho=${spearman(rows,pairs.map(x=>x.pred)).toFixed(4)} nrmse=${nrmse(pairs.map(x=>x.pred),pairs.map(x=>x.target)).toFixed(4)}`);
  for(const x of pairs.slice().sort((a,b)=>b.pred-a.pred).slice(0,10)) console.log(`${x.pred.toFixed(2)} vs ${x.target.toFixed(2)}  ${x.label}`);
}
