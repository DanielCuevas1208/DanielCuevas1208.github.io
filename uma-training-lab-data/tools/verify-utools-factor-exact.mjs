import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeckSupportSkillMap, scoreSupportCardExact } from './utools-factor-score-exact.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','factor-score');
const styles=['runner','leader','betweener','chaser'];
const requested=process.env.UTOOLS_FACTOR_EVENT;
const events=requested?[requested]:['loh2','chm','chm2','chm3'];

let failed=false,totalRows=0,totalScore=0,totalRank=0,totalOverlap=0;
for(const eventKey of events){
  for(const style of styles){
    const exactFile=path.join(root,'exact-pages',eventKey,style+'.json');
    const rankingFile=path.join(root,'rankings',eventKey,style+'.json');
    if(!fs.existsSync(exactFile) || !fs.existsSync(rankingFile)){
      console.error(`Missing exact factor verification assets for ${eventKey}/${style}`);
      failed=true;
      continue;
    }
    const inputs=JSON.parse(fs.readFileSync(exactFile,'utf8'));
    const ranking=JSON.parse(fs.readFileSync(rankingFile,'utf8'));
    const courseEffects=inputs.courseEffectSet?.effects;
    if(!courseEffects || !Object.keys(courseEffects).length) throw new Error(style+': exact page has no courseEffectSet.effects');

    const cardsById=new Map((inputs.cards || []).map(card=>[Number(card.id),card]));
    const deckIds=new Set((ranking.deck || []).map(row=>Number(row.id)));
    const deckCards=[...deckIds].map(id=>cardsById.get(id)).filter(Boolean);
    if(deckCards.length!==deckIds.size) throw new Error(eventKey+'/'+style+': could not resolve every main-deck support');
    const deckSupportSkillMap=buildDeckSupportSkillMap(deckCards);

    const scored=(inputs.cards || [])
      .filter(card=>!deckIds.has(Number(card.id)))
      .map(card=>({
        id:Number(card.id),
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

    totalRows+=ranking.rows.length;
    totalScore+=scoreMatches;
    totalRank+=rankMatches;
    totalOverlap+=overlap;
    console.log(
      'Exact U-tools factor parity '+eventKey+'/'+style+
      ': score='+scoreMatches+'/'+ranking.rows.length+
      ', rank='+rankMatches+'/'+ranking.rows.length+
      ', top-'+liveTopIds.length+' overlap='+overlap+'/'+liveTopIds.length
    );
    for(const row of mismatches.slice(0,10)) console.log(JSON.stringify(row));

    if(scoreMatches!==ranking.rows.length || rankMatches!==ranking.rows.length || overlap!==liveTopIds.length){
      failed=true;
    }
  }
}
console.log(`Exact factor aggregate parity: score=${totalScore}/${totalRows}, rank=${totalRank}/${totalRows}, top-set=${totalOverlap}/${totalRows}`);
if(failed) process.exitCode=1;
