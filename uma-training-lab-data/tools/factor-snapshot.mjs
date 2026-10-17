import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchUtoolsFactorPage,FactorPageUnavailableError} from './utools-factor-rsc.mjs';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../factor-score');
// Exact inputs and rankings form one historical snapshot. Never mix archived
// rankings with current inputs, or turn network/parser failures into success.
export async function fetchFactorPageOrSnapshot(eventKey,style,{root=defaultRoot,fetchPage=fetchUtoolsFactorPage}={}){
  try{return {page:await fetchPage(eventKey,style),archived:false};}
  catch(error){
    if(!(error instanceof FactorPageUnavailableError)) throw error;
    const read=dir=>JSON.parse(fs.readFileSync(path.join(root,dir,eventKey,style+'.json'),'utf8'));
    let page,ranking;
    try{
      page=read('exact-pages');ranking=read('rankings');
      for(const data of [page,ranking]) if(data.schemaVersion!==1 || data.eventKey!==eventKey || data.style!==style) throw new Error('identity mismatch');
      if(!Number.isInteger(page.courseId) || page.cards?.length<100 || !Object.keys(page.courseEffectSet?.effects||{}).length) throw new Error('missing inputs');
      const ids=new Set(page.cards.map(c=>Number(c.id)));
      if(ranking.deck?.length!==5 || !ranking.deck.every(c=>ids.has(Number(c.id))) || ranking.rows?.length<20 || !ranking.rows.every((r,i)=>ids.has(Number(r.id))&&Number(r.rank)===i+1&&Number.isFinite(Number(r.score)))) throw new Error('invalid ranking');
    }catch(cause){throw new Error(`${eventKey}/${style}: unavailable upstream page has no complete matching saved snapshot`,{cause});}
    return {page,ranking,archived:true};
  }
}
