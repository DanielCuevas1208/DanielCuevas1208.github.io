import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeckSupportSkillMap, scoreSupportCardExact } from './utools-factor-score-exact.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','factor-score');
const inputs=JSON.parse(fs.readFileSync(path.join(root,'utools-support-cards.json'),'utf8'));
const style=String(inputs.style || '');
if(!style) throw new Error('Exact factor input asset has no style');
const ranking=JSON.parse(fs.readFileSync(path.join(root,'rankings','chm2',style+'.json'),'utf8'));
const courseEffects=inputs.courseEffectSet?.effects;
if(!courseEffects || !Object.keys(courseEffects).length) throw new Error('Exact input asset has no courseEffectSet.effects');

const cardsById=new Map((inputs.cards || []).map(card=>[Number(card.id),card]));
const deckIds=new Set((ranking.deck || []).map(row=>Number(row.id)));
const deckCards=[...deckIds].map(id=>cardsById.get(id)).filter(Boolean);
if(deckCards.length!==deckIds.size) throw new Error('Could not resolve every U-tools deck support from exact inputs');
const deckSupportSkillMap=buildDeckSupportSkillMap(deckCards);

const scored=(inputs.cards || [])
  .filter(card=>!deckIds.has(Number(card.id)))
  .map(card=>({
    id:Number(card.id),
    name:(String(card.title || '')+' '+String(card.name || '')).trim(),
    ...scoreSupportCardExact({supportCard:card,courseEffects,deckSupportSkillMap}),
  }))
  .sort((a,b)=>b.total-a.total || b.id-a.id);

const rankById=new Map(scored.map((row,index)=>[row.id,index+1]));
const scoreById=new Map(scored.map(row=>[row.id,row]));
let scoreMatches=0,rankMatches=0;
const mismatches=[];
for(const live of ranking.rows || []){
  const predicted=scoreById.get(Number(live.id));
  const rank=rankById.get(Number(live.id));
  const scoreOk=predicted && Number(predicted.total)===Number(live.score);
  const rankOk=rank===Number(live.rank);
  if(scoreOk) scoreMatches++;
  if(rankOk) rankMatches++;
  if(!scoreOk || !rankOk){
    mismatches.push({
      id:Number(live.id),
      name:live.name,
      liveRank:Number(live.rank),
      predictedRank:rank,
      liveScore:Number(live.score),
      predictedScore:predicted?.total,
      hint:predicted?.hint,
      random:predicted?.random,
      sequence:predicted?.sequence,
    });
  }
}
const liveTopIds=(ranking.rows || []).map(row=>Number(row.id));
const predictedTopIds=scored.slice(0,liveTopIds.length).map(row=>row.id);
const overlap=predictedTopIds.filter(id=>liveTopIds.includes(id)).length;

console.log('Exact U-tools factor parity '+inputs.eventKey+'/'+style+': score='+scoreMatches+'/'+ranking.rows.length+', rank='+rankMatches+'/'+ranking.rows.length+', top-'+liveTopIds.length+' overlap='+overlap+'/'+liveTopIds.length);
for(const row of mismatches.slice(0,20)) console.log(JSON.stringify(row));
if(scoreMatches!==ranking.rows.length || rankMatches!==ranking.rows.length || overlap!==liveTopIds.length){
  process.exitCode=1;
}
