import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKILLS_URL = 'https://daftuyda.moe/assets/skills_all.json';
const SUPPORT_URL = 'https://raw.githubusercontent.com/mee1080/umasim/main/data/support_card.txt';
const GAMETORA_BASE = 'https://gametora.com';
const UTOOLS_CURRENT_FACTOR_BASE = 'https://xn--gck1f423k.xn--1bvt37a.tools/race/vsevents/chm2/factor';
const GT_REWARD_OFFSET = 36;

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
  },
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

const CURRENT_FACTOR_RANKING_ROOT=path.join(
  ROOT,
  'uma-training-lab-data',
  'factor-score',
  'rankings',
  'chm2',
);
for (const style of ['runner','leader','betweener','chaser']) {
  const key=`current_${style}`;
  const file=path.join(CURRENT_FACTOR_RANKING_ROOT,`${style}.json`);
  if (!fs.existsSync(file) || !BENCHMARKS[key]) continue;
  const live=JSON.parse(fs.readFileSync(file,'utf8'));
  if (!Array.isArray(live.rows) || live.rows.length<20) {
    throw new Error(`Current factor ranking ${style} has only ${live.rows?.length || 0} rows`);
  }
  BENCHMARKS[key].deckIds=(live.deck || []).map((row)=>Number(row.id)).filter(Number.isInteger);
  BENCHMARKS[key].rows=live.rows.map((row)=>[
    String(row.name || ''),
    Number(row.score),
    Number(row.id),
    Number(row.level),
  ]);
  BENCHMARKS[key].liveRankingFile=file;
}
console.log(
  'Current U-tools live ranking rows:',
  ['runner','leader','betweener','chaser']
    .map((style)=>`${style}=${BENCHMARKS[`current_${style}`]?.rows?.length || 0}`)
    .join(', '),
);

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

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function nextNonEmpty(lines, start) {
  for (let i=start;i<lines.length;i++) {
    const value=String(lines[i] || '').trim();
    if (value) return { value, index:i };
  }
  return null;
}

function parseUtoolsFactorReader(text) {
  const lines=String(text).split(/\r?\n/);
  const recommendIndex=lines.findIndex((line)=>String(line).includes('オススメのサポートカード'));
  if (recommendIndex < 0) throw new Error('U-tools factor reader did not contain recommendation heading');
  const imageRe=/^!\[Image \d+: (.+?)\]\(https:\/\/static\.kouryaku\.tools\/umamusume\/images\/supports\/(\d+)\/(thumb|full)\.png/i;
  const deckIds=[];
  const rows=[];
  for (let i=0;i<lines.length;i++) {
    const match=String(lines[i]).trim().match(imageRe);
    if (!match) continue;
    const label=match[1].trim();
    const supportId=Number(match[2]);
    const kind=match[3].toLowerCase();
    if (i < recommendIndex && kind === 'thumb') {
      if (!deckIds.includes(supportId)) deckIds.push(supportId);
      continue;
    }
    if (i <= recommendIndex || kind !== 'full') continue;
    const scoreLine=nextNonEmpty(lines,i+1);
    if (!scoreLine || !/^-?\d+(?:\.\d+)?$/.test(scoreLine.value)) continue;
    const score=Number(scoreLine.value);
    const lvLabel=nextNonEmpty(lines,scoreLine.index+1);
    const lvValue=lvLabel && /^Lv$/i.test(lvLabel.value)
      ? nextNonEmpty(lines,lvLabel.index+1)
      : null;
    const level=lvValue && /^\d+$/.test(lvValue.value) ? Number(lvValue.value) : null;
    rows.push([label,score,supportId,level]);
  }
  return { deckIds, rows };
}

async function refreshCurrentBenchmarksFromUtools() {
  let refreshed=0;
  for (const style of ['runner','leader','betweener','chaser']) {
    const key=`current_${style}`;
    const bench=BENCHMARKS[key];
    if (!bench) continue;
    const page=`${UTOOLS_CURRENT_FACTOR_BASE}/${style}`;
    try {
      const text=await fetchText(`https://r.jina.ai/${page}`);
      const parsed=parseUtoolsFactorReader(text);
      if (parsed.deckIds.length < 4 || parsed.rows.length < 15) {
        throw new Error(`parsed only ${parsed.deckIds.length} deck cards and ${parsed.rows.length} ranking rows`);
      }
      bench.deckIds=parsed.deckIds;
      bench.rows=parsed.rows.slice(0,20);
      bench.liveSource=page;
      refreshed++;
      console.log(`Live U-tools ${style}: ${bench.rows.length} targets, deck ${bench.deckIds.join(',')}`);
    } catch (error) {
      console.error(`WARN live U-tools ${style} benchmark refresh failed: ${error.message}; using embedded fallback`);
    }
  }
  return refreshed;
}


async function loadSupportHintCountMeta() {
  const manifest = await fetchJson(`${GAMETORA_BASE}/data/manifests/umamusume.json`);
  const cardHash = manifest['support-cards'];
  const effectsHash = manifest['support_effects'];
  if (!cardHash) throw new Error('GameTora manifest has no support-cards');
  if (!effectsHash) throw new Error('GameTora manifest has no support_effects');
  const [cards, effectDefs] = await Promise.all([
    fetchJson(`${GAMETORA_BASE}/data/umamusume/support-cards.${cardHash}.json`),
    fetchJson(`${GAMETORA_BASE}/data/umamusume/support_effects.${effectsHash}.json`),
  ]);
  const hintCountIds = new Set();
  for (const effect of effectDefs || []) {
    const text = [effect?.name_en, effect?.name, effect?.name_ja, effect?.symbol]
      .filter(Boolean).join(' ').toLowerCase();
    if ((text.includes('hint') && (text.includes('count') || text.includes('number')))
        || text.includes('ヒント獲得数')) {
      hintCountIds.add(Number(effect.id));
    }
  }
  if (!hintCountIds.size) {
    throw new Error('Could not resolve GameTora Hint Count Up support-effect ID');
  }
  console.log(`GameTora Hint Count Up effect ID(s): ${[...hintCountIds].join(',')}`);
  const out = new Map();
  for (const card of cards || []) {
    const id = Number(card?.support_id);
    if (!Number.isInteger(id)) continue;
    let hintCount = 0;
    for (const effect of card?.unique?.effects || []) {
      if (hintCountIds.has(Number(effect?.type))) hintCount += Math.max(0, Number(effect?.value) || 0);
    }
    if (hintCount > 0) out.set(id, hintCount);
  }
  return out;
}

async function loadEventTopology(canonicalWhiteByAnyId) {
  const manifest = await fetchJson(`${GAMETORA_BASE}/data/manifests/umamusume.json`);
  const manifestUrl = (key) => {
    const hash = manifest[key];
    if (!hash) throw new Error(`GameTora manifest has no ${key}`);
    return `${GAMETORA_BASE}/data/umamusume/${key}.${hash}.json`;
  };
  const [evrew, ssr, sr] = await Promise.all([
    fetchJson(manifestUrl('dict/evrew')),
    fetchJson(manifestUrl('training_events/ssr')),
    fetchJson(manifestUrl('training_events/sr')),
  ]);
  const bySupport = new Map();
  for (const entry of [...(ssr || []), ...(sr || [])]) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const supportId = Number(entry[0]);
    if (!Number.isInteger(supportId)) continue;
    const events = [];
    for (const evt of entry[1] || []) {
      if (!Array.isArray(evt) || !Array.isArray(evt[1])) continue;
      const choices = [];
      for (const choice of evt[1]) {
        if (!Array.isArray(choice) || !Array.isArray(choice[1])) continue;
        const hints = [];
        for (const rewardId of choice[1]) {
          const reward = evrew?.[Number(rewardId) - GT_REWARD_OFFSET];
          if (!Array.isArray(reward) || reward[0] !== 'sk') continue;
          const skillId = Number(reward[2]);
          const hintLevel = Math.max(1, Math.min(5, Math.abs(Number(reward[1])) || 1));
          if (!Number.isInteger(skillId) || skillId <= 0) continue;
          hints.push({
            skillId,
            canonicalId: canonicalWhiteByAnyId.get(skillId) || skillId,
            hintLevel,
          });
        }
        if (hints.length) choices.push(hints);
      }
      if (choices.length) events.push({ choices });
    }
    if (events.length) bySupport.set(supportId, events);
  }
  return bySupport;
}

await refreshCurrentBenchmarksFromUtools();

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
const { byName: supportByName, byId: supportById } = parseSupports(supportText);
const whiteSkills = skillList.filter(s => Number(s.rarity) === 1);
const sourcesBySkill = new Map(whiteSkills.map(s => [Number(s.id), sourceSet(s, skillById)]));

const familyParent = new Map(whiteSkills.map((skill) => [Number(skill.id), Number(skill.id)]));
function familyFind(id) {
  id=Number(id);
  if (!familyParent.has(id)) return id;
  const parent=familyParent.get(id);
  if (parent===id) return id;
  const root=familyFind(parent);
  familyParent.set(id,root);
  return root;
}
function familyUnion(a,b) {
  a=familyFind(a); b=familyFind(b);
  if (a===b) return;
  const root=Math.min(a,b), child=Math.max(a,b);
  familyParent.set(child,root);
}
for (const skill of whiteSkills) {
  for (const versionId of flattenIds(skill.versions)) {
    const version=skillById.get(Number(versionId));
    if (version && Number(version.rarity)===1) familyUnion(Number(skill.id),Number(versionId));
  }
}
function canonicalWhiteFamily(id) {
  const skill=skillById.get(Number(id));
  if (!skill) return Number(id);
  if (Number(skill.rarity)===1) return familyFind(Number(skill.id));
  if (Number(skill.rarity)===2) {
    for (const versionId of flattenIds(skill.versions)) {
      const lower=skillById.get(Number(versionId));
      if (lower && Number(lower.rarity)===1) return familyFind(Number(lower.id));
    }
  }
  return Number(skill.id);
}
function skillDirectSupportIds(skill) {
  return new Set([
    ...flattenIds(skill?.sup_hint),
    ...flattenIds(skill?.sup_e),
  ].map(Number));
}
const whiteByJpName = new Map();
for (const skill of whiteSkills) {
  const name = String(skill.jpname || '').trim();
  if (!name) continue;
  const rows = whiteByJpName.get(name) || [];
  rows.push(skill);
  whiteByJpName.set(name, rows);
}
const canonicalWhiteByAnyId = new Map();
for (const skill of whiteSkills) {
  canonicalWhiteByAnyId.set(Number(skill.id), Number(skill.id));
  for (const versionId of flattenIds(skill.versions)) canonicalWhiteByAnyId.set(Number(versionId), Number(skill.id));
}
let eventTopology = new Map();
try {
  eventTopology = await loadEventTopology(canonicalWhiteByAnyId);
  console.log(`Loaded exact GameTora event topology for ${eventTopology.size} support cards.`);
} catch (error) {
  console.error(`WARN: exact support-event topology unavailable: ${error.message}`);
}
let supportHintCountMeta = new Map();
try {
  supportHintCountMeta = await loadSupportHintCountMeta();
  console.log(`Loaded Hint Count Up metadata for ${supportHintCountMeta.size} GameTora support cards.`);
} catch (error) {
  console.error(`WARN: GameTora support unique metadata unavailable: ${error.message}`);
}

const datasets = {};
const candidatePools = {};
const missingCards = new Set();
for (const [scenario, bench] of Object.entries(availableBenchmarks)) {
  const effects = JSON.parse(fs.readFileSync(path.join(ROOT,'uma-training-lab-data','skill-effects','jp',String(bench.courseId),`${bench.style}.json`),'utf8'));
  const effectById = new Map((effects.skills || []).map(r => [Number(r.id),r]));
  const deckIds = new Set();
  if (Array.isArray(bench.deckIds) && bench.deckIds.length) {
    for (const id of bench.deckIds) {
      if (supportById.has(Number(id))) deckIds.add(Number(id));
      else missingCards.add(`Support #${id}`);
    }
  } else {
    for (const label of bench.deck) {
      const card=supportByName.get(normalizeName(label));
      if(card) deckIds.add(card.id); else missingCards.add(label);
    }
  }
  const coveredNames = new Set();
  for (const deckId of deckIds) {
    const deckCard=supportById.get(Number(deckId));
    for (const hintName of deckCard?.skills || []) coveredNames.add(String(hintName).trim());
  }
  const coveredFamilies = new Set();
  for (const skill of skillList) {
    const rarity=Number(skill.rarity);
    if (rarity!==1 && rarity!==2) continue;
    const family=canonicalWhiteFamily(skill.id);
    const sources=sourceSet(skill,skillById);
    for (const deckId of deckIds) {
      if (sources.has(Number(deckId))) {
        coveredFamilies.add(family);
        break;
      }
    }
  }
  function buildScenarioCardRow(card,label,target=NaN,utoolsLevel=null) {
    const entries=[];
    for (const hintName of card.skills || []) {
      const candidates=(whiteByJpName.get(String(hintName).trim()) || [])
        .map((skill) => {
          const effect=effectById.get(Number(skill.id));
          const src=sourcesBySkill.get(Number(skill.id))?.get(card.id);
          return {skill,effect,src};
        })
        .filter((x)=>x.effect && Number(x.effect.expectedEffect)>0 && x.src && (x.src.hint||x.src.viaHint))
        .sort((a,b)=>Number(b.effect.expectedEffect)-Number(a.effect.expectedEffect));
      const chosen=candidates[0];
      if(!chosen) continue;
      entries.push({
        id:Number(chosen.skill.id),
        name:String(hintName).trim(),
        value:Number(chosen.effect.expectedEffect),
        cost:Number(chosen.skill.cost),
        exactCovered:coveredNames.has(String(hintName).trim()),
        familyCovered:coveredFamilies.has(canonicalWhiteFamily(chosen.skill.id)),
        hint:true,
        directHint:!!chosen.src.hint,
        viaHint:!!chosen.src.viaHint,
        event:false,
        directEvent:false,
        viaEvent:false,
      });
    }
    const exactEvents = (eventTopology.get(card.id) || []).map((event) => ({
      choices: event.choices.map((choice) => choice.map((reward) => {
        const skill = skillById.get(Number(reward.skillId));
        const effect = effectById.get(Number(reward.skillId));
        return {
          ...reward,
          value: effect && Number(effect.expectedEffect) > 0 ? Number(effect.expectedEffect) : 0,
          cost: skill ? Number(skill.cost) : NaN,
          rarity: skill ? Number(skill.rarity) : 1,
          exactCovered: (() => {
            const direct=skillDirectSupportIds(skill);
            for (const deckId of deckIds) if (direct.has(Number(deckId))) return true;
            return false;
          })(),
          familyCovered:coveredFamilies.has(canonicalWhiteFamily(reward.skillId)),
        };
      }).filter((reward) => reward.value > 0)),
    })).filter((event) => event.choices.some((choice) => choice.length));
    return { scenario,style:bench.style,courseId:bench.courseId,label,target,card,entries,exactEvents,utoolsLevel,verifiedExtraHints:supportHintCountMeta.get(card.id) || 0 };
  }

  const rows=[];
  for (const [label,target,supportId,utoolsLevel] of bench.rows) {
    const card=Number.isInteger(Number(supportId)) && Number(supportId)>0
      ? supportById.get(Number(supportId))
      : supportByName.get(normalizeName(label));
    if(!card){missingCards.add(label);continue;}
    rows.push(buildScenarioCardRow(card,label,target,utoolsLevel));
  }
  if (rows.length >= 5) datasets[scenario]=rows;

  candidatePools[scenario]=[...supportById.values()]
    .filter((card)=>Number(card.rarity)>=1 && !deckIds.has(Number(card.id)))
    .map((card)=>buildScenarioCardRow(card,card.name))
    .filter((row)=>row.entries.length || row.exactEvents.length);
}

if (missingCards.size) console.error(`WARN: ${missingCards.size} benchmark card(s) did not map: ${[...missingCards].join(' | ')}`);

const levelChecks=Object.entries(datasets)
  .filter(([scenario])=>scenario.startsWith('current_'))
  .flatMap(([scenario,rows])=>rows
    .filter((row)=>Number.isFinite(Number(row.utoolsLevel)))
    .map((row)=>({
      scenario,
      label:row.label,
      utools:Number(row.utoolsLevel),
      card:hintBonusLevel(row.card),
    })));
const levelMismatches=levelChecks.filter((row)=>row.utools!==row.card);
console.log(`U-tools displayed Lv audit: ${levelChecks.length-levelMismatches.length}/${levelChecks.length} match card Hint Lv Up.`);
if (levelMismatches.length) {
  console.error('WARN Hint Lv mismatches:', levelMismatches.slice(0,20));
}

function deckCoverageMultiplier(item,p) {
  if (item.exactCovered) return p.deckPenalty;
  if (item.familyCovered) return p.familyDeckPenalty;
  return 1;
}

function rawScore(row,p) {
  const card=row.card;
  const hintDiscount=discountForLevel(acquiredHintLevel(card));
  const hintFreq=Math.max(0,Number(card.status.hintFrequency)||0)+Math.max(0,Number(card.unique.hintFrequency)||0);
  const hintRate=Math.pow(1+hintFreq/100,p.hintRatePower);
  const tableSize=Math.max(1,card.skills.length);
  let hintSum=0;

  for(const x of row.entries){
    const deckMul=deckCoverageMultiplier(x,p);
    if(deckMul<=0) continue;
    const baseCost=Number.isFinite(x.cost)&&x.cost>0?x.cost:null;
    const effCost=baseCost?baseCost*(1-hintDiscount):null;
    const eff=effCost?x.value/effCost*100:x.value;
    hintSum+=Math.pow(Math.max(1e-9,x.value),p.a)
      *Math.pow(Math.max(1e-9,eff),p.b)*deckMul;
  }

  const usefulHints=row.entries.length;
  const tableQuality=hintSum/Math.pow(tableSize,p.tableExponent);
  const breadth=1+p.breadth*Math.log1p(usefulHints);
  let eventSum=0;
  for (const event of row.exactEvents || []) {
    let bestChoice=0;
    for (const choice of event.choices) {
      let choiceValue=0;
      for (const reward of choice) {
        const deckMul=deckCoverageMultiplier(reward,p);
        if(deckMul<=0) continue;
        const baseCost=Number.isFinite(reward.cost)&&reward.cost>0?reward.cost:null;
        const effCost=baseCost?baseCost*(1-discountForLevel(reward.hintLevel)):null;
        const eff=effCost?reward.value/effCost*100:reward.value;
        const sparkMultiplier=Number(reward.rarity)>=2?p.goldSparkMultiplier:1;
        choiceValue+=Math.pow(Math.max(1e-9,reward.value),p.a)
          *Math.pow(Math.max(1e-9,eff),p.b)*deckMul*sparkMultiplier;
      }
      bestChoice=Math.max(bestChoice,choiceValue);
    }
    eventSum+=bestChoice;
  }
  return tableQuality*breadth*hintRate+p.eventWeight*eventSum;
}

const scenarios=Object.keys(datasets);
const allRows=scenarios.flatMap(s=>datasets[s]);
const grid={
  a:[0],
  b:[0.55,0.60,0.65,0.70,0.75],
  breadth:[0],
  tableExponent:[1.00,1.05,1.10,1.15,1.20,1.25,1.30],
  hintRatePower:[0.40,0.50,0.60,0.70,0.80],
  eventWeight:[0.010,0.015,0.01875,0.0225,0.025,0.030],
  goldSparkMultiplier:[1.0],
  deckPenalty:[0.70,0.75,0.80,0.85,0.90],
  familyDeckPenalty:[0.80,0.85,0.90,0.95,1.00],
};
let tested=0,best=null;
for(const a of grid.a)for(const b of grid.b)for(const breadth of grid.breadth)
for(const tableExponent of grid.tableExponent)for(const hintRatePower of grid.hintRatePower)
for(const eventWeight of grid.eventWeight)for(const goldSparkMultiplier of grid.goldSparkMultiplier)
for(const deckPenalty of grid.deckPenalty)for(const familyDeckPenalty of grid.familyDeckPenalty){
  const p={a,b,breadth,tableExponent,hintRatePower,eventWeight,goldSparkMultiplier,deckPenalty,familyDeckPenalty};
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

function fitSubset(keys,label) {
  let subsetTested=0, subsetBest=null;
  for(const a of grid.a)for(const b of grid.b)for(const breadth of grid.breadth)
  for(const tableExponent of grid.tableExponent)for(const hintRatePower of grid.hintRatePower)
  for(const eventWeight of grid.eventWeight)for(const goldSparkMultiplier of grid.goldSparkMultiplier)
  for(const deckPenalty of grid.deckPenalty)for(const familyDeckPenalty of grid.familyDeckPenalty){
    const p={a,b,breadth,tableExponent,hintRatePower,eventWeight,goldSparkMultiplier,deckPenalty,familyDeckPenalty};
    let cvLoss=0,cvRho=0,cvRmse=0;
    for(const holdout of keys){
      const train=keys.filter(s=>s!==holdout).flatMap(s=>datasets[s]);
      const trainRaw=train.map(r=>rawScore(r,p)), trainY=train.map(r=>r.target);
      const scale=scaleFit(trainRaw,trainY);
      const test=datasets[holdout];
      const predicted=test.map(r=>rawScore(r,p)*scale), y=test.map(r=>r.target);
      const rho=spearman(test,predicted), err=nrmse(predicted,y);
      cvRho+=rho;cvRmse+=err;cvLoss+=(1-rho)+0.35*err;
    }
    cvLoss/=keys.length;cvRho/=keys.length;cvRmse/=keys.length;subsetTested++;
    if(!subsetBest||cvLoss<subsetBest.cvLoss) subsetBest={p,cvLoss,cvRho,cvRmse};
  }
  const rows=keys.flatMap(k=>datasets[k]);
  const raw=rows.map(r=>rawScore(r,subsetBest.p));
  const target=rows.map(r=>r.target);
  const scale=scaleFit(raw,target);
  const predicted=raw.map(x=>x*scale);
  console.log(`\n${label}: tested ${subsetTested.toLocaleString()} combinations across ${rows.length} targets`);
  console.log(`${label} CV: Spearman=${subsetBest.cvRho.toFixed(4)} NRMSE=${subsetBest.cvRmse.toFixed(4)} loss=${subsetBest.cvLoss.toFixed(4)}`);
  console.log(`${label} parameters: ${JSON.stringify({...subsetBest.p,scale:Number(scale.toFixed(6))})}`);
  console.log(`${label} in-sample: Spearman=${spearman(rows,predicted).toFixed(4)} NRMSE=${nrmse(predicted,target).toFixed(4)}`);
  return {...subsetBest,scale};
}

const currentScenarios=scenarios.filter(s=>s.startsWith('current_'));
const currentFit=currentScenarios.length>=2?fitSubset(currentScenarios,'Current U-tools'):null;
if (currentFit) {
  const noEvent={...currentFit.p,eventWeight:0};
  let cvRho=0,cvRmse=0;
  for(const holdout of currentScenarios){
    const train=currentScenarios.filter(s=>s!==holdout).flatMap(s=>datasets[s]);
    const scale=scaleFit(train.map(r=>rawScore(r,noEvent)),train.map(r=>r.target));
    const test=datasets[holdout];
    const predicted=test.map(r=>rawScore(r,noEvent)*scale), target=test.map(r=>r.target);
    cvRho+=spearman(test,predicted);
    cvRmse+=nrmse(predicted,target);
  }
  cvRho/=currentScenarios.length;
  cvRmse/=currentScenarios.length;
  const rows=currentScenarios.flatMap(s=>datasets[s]);
  const scale=scaleFit(rows.map(r=>rawScore(r,noEvent)),rows.map(r=>r.target));
  const predicted=rows.map(r=>rawScore(r,noEvent)*scale), target=rows.map(r=>r.target);
  console.log(`Current hint-only ablation: CV Spearman=${cvRho.toFixed(4)} NRMSE=${cvRmse.toFixed(4)}; in-sample Spearman=${spearman(rows,predicted).toFixed(4)} NRMSE=${nrmse(predicted,target).toFixed(4)} scale=${scale.toFixed(6)}`);
}

function retrievalMetrics(keys,p,label) {
  console.log(`\n${label} full-pool retrieval:`);
  let totalOverlap=0,totalTargets=0;
  for (const scenario of keys) {
    const targets=datasets[scenario] || [];
    const topTargets=targets.slice(0,20);
    const targetIds=new Set(topTargets.map((row)=>Number(row.card.id)));
    const targetRank=new Map(targets.map((row,index)=>[Number(row.card.id),index+1]));
    const ranked=(candidatePools[scenario] || [])
      .map((row)=>({row,score:rawScore(row,p)}))
      .sort((a,b)=>b.score-a.score || b.row.card.id-a.row.card.id);
    const top=ranked.slice(0,20);
    const overlap=top.filter((x)=>targetIds.has(Number(x.row.card.id))).length;
    totalOverlap+=overlap;
    totalTargets+=Math.min(20,topTargets.length);
    const targetPositions=[...targetIds]
      .map((id)=>ranked.findIndex((x)=>Number(x.row.card.id)===id)+1)
      .filter((rank)=>rank>0)
      .sort((a,b)=>a-b);
    const outsiders=top.filter((x)=>!targetIds.has(Number(x.row.card.id))).slice(0,5);
    const missing=topTargets
      .filter((row)=>!top.some((x)=>Number(x.row.card.id)===Number(row.card.id)))
      .slice(0,5);
    console.log(
      `${scenario}: overlap@20=${overlap}/${Math.min(20,targets.length)}; `+
      `target median rank=${targetPositions.length?targetPositions[Math.floor((targetPositions.length-1)/2)]:'—'}; `+
      `worst target rank=${targetPositions.length?targetPositions.at(-1):'—'}`
    );
    if (outsiders.length) console.log('  outsiders:', outsiders.map((x)=>`#${x.row.card.id} R${x.row.card.rarity} ${x.row.card.name} (${x.score.toFixed(3)})`).join(' | '));
    if (missing.length) console.log('  displaced:', missing.map((row)=>`#${row.card.id} ${row.label} (U-tools #${targetRank.get(Number(row.card.id))})`).join(' | '));
  }
  console.log(`${label} aggregate overlap@20=${totalOverlap}/${totalTargets} (${(100*totalOverlap/Math.max(1,totalTargets)).toFixed(1)}%)`);
}

const v3RetrievalParams={
  a:0,b:0.65,breadth:0,tableExponent:1.10,hintRatePower:0.60,
  eventWeight:0.015,goldSparkMultiplier:1,deckPenalty:0.80,familyDeckPenalty:1,
};
if (currentScenarios.length) {
  retrievalMetrics(currentScenarios,v3RetrievalParams,'Factor Lab v3');
  if (currentFit) retrievalMetrics(currentScenarios,currentFit.p,'Tiered-coverage candidate');
}

const raw=allRows.map(r=>rawScore(r,best.p));
const targets=allRows.map(r=>r.target);
const scale=scaleFit(raw,targets);
const pred=raw.map(x=>x*scale);
const diagnostics=allRows.map((r,i)=>({
  scenario:r.scenario,
  label:r.label,
  target:r.target,
  predicted:pred[i],
  residual:r.target-pred[i],
  hintTable:r.card.skills.length,
  usefulHints:r.entries.filter(x=>x.hint).length,
  eventSkills:r.entries.filter(x=>x.event).length,
  exactEvents:r.exactEvents?.length || 0,
  covered:r.entries.filter(x=>x.exactCovered).length,
  familyCovered:r.entries.filter(x=>!x.exactCovered&&x.familyCovered).length,
  hintLevel:acquiredHintLevel(r.card),
  hintChance:hintChance(r.card),
  extraHints:hintCountUp(r.card),
}));
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

console.log('\nLargest absolute residuals:');
for(const d of diagnostics.slice().sort((a,b)=>Math.abs(b.residual)-Math.abs(a.residual)).slice(0,25)){
  console.log(`${d.residual>=0?'+':''}${d.residual.toFixed(2)} · target ${d.target.toFixed(2)} pred ${d.predicted.toFixed(2)} · Lv${d.hintLevel} pHint=${d.hintChance.toFixed(3)} table=${d.hintTable} useful=${d.usefulHints} event=${d.eventSkills}/${d.exactEvents} covered=${d.covered}+${d.familyCovered}fam extra=${d.extraHints} · ${d.scenario} · ${d.label}`);
}
