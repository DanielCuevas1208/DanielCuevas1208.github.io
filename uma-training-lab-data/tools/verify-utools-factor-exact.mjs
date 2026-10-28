import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeckSupportSkillMap, scoreSupportCardExact } from './utools-factor-score-exact.mjs';
import { FACTOR_ROOT, FACTOR_STYLES, listSnapshots } from './utools-factor-events.mjs';

export function checkParity(inputs,ranking,where){
  const courseEffects=inputs.courseEffectSet?.effects;
  if(!courseEffects || !Object.keys(courseEffects).length) throw new Error(where+': exact page has no courseEffectSet.effects');

  const cardsById=new Map((inputs.cards || []).map(card=>[Number(card.id),card]));
  const deckIds=new Set((ranking.deck || []).map(row=>Number(row.id)));
  const deckCards=[...deckIds].map(id=>cardsById.get(id)).filter(Boolean);
  if(deckCards.length!==deckIds.size) throw new Error(where+': could not resolve every main-deck support');
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
  const rows=liveTopIds.length;
  return {rows,scoreMatches,rankMatches,overlap,mismatches,exact:rows>0 && scoreMatches===rows && rankMatches===rows && overlap===rows};
}

export function verifyAll(root=FACTOR_ROOT,{log=console.log,only=null}={}){
  let failed=false,pages=0,totalRows=0,totalScore=0,totalRank=0,totalOverlap=0;
  const courses=[];
  for(const snap of listSnapshots(root)){
    if(only && snap.key!==only) continue;
    courses.push(snap.courseId);
    for(const style of FACTOR_STYLES){
      const where=`${snap.key}/${style} (course ${snap.courseId})`;
      const exactFile=path.join(root,'exact-pages',snap.key,style+'.json');
      const rankingFile=path.join(root,'rankings',snap.key,style+'.json');
      if(!fs.existsSync(exactFile) || !fs.existsSync(rankingFile)){
        console.error(`Missing exact factor verification assets for ${where}`);
        failed=true;
        continue;
      }
      const inputs=JSON.parse(fs.readFileSync(exactFile,'utf8'));
      const ranking=JSON.parse(fs.readFileSync(rankingFile,'utf8'));
      if(ranking.eventKey!==snap.key || ranking.style!==style || Number(ranking.courseId)!==snap.courseId){
        console.error(`${where}: ranking identity (${ranking.eventKey}/${ranking.style}, course ${ranking.courseId}) does not match its exact page`);
        failed=true;
        continue;
      }
      const result=checkParity(inputs,ranking,where);
      pages++;
      totalRows+=result.rows;
      totalScore+=result.scoreMatches;
      totalRank+=result.rankMatches;
      totalOverlap+=result.overlap;
      log(`Exact U-tools factor parity ${where}: score=${result.scoreMatches}/${result.rows}, rank=${result.rankMatches}/${result.rows}, top-${result.rows} overlap=${result.overlap}/${result.rows}`);
      for(const row of result.mismatches.slice(0,10)) log(JSON.stringify(row));
      if(!result.exact) failed=true;
    }
  }
  log(`Exact factor aggregate parity (${pages} pages, ${new Set(courses).size} courses): score=${totalScore}/${totalRows}, rank=${totalRank}/${totalRows}, top-set=${totalOverlap}/${totalRows}`);
  return {failed,pages,totalRows,totalScore,totalRank,totalOverlap};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const result=verifyAll(FACTOR_ROOT,{only:process.env.UTOOLS_FACTOR_EVENT||null});
  if(result.failed || !result.pages) process.exitCode=1;
}
