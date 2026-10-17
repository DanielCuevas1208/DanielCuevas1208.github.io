import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fetchFactorPageOrSnapshot} from './factor-snapshot.mjs';
import {FactorPageUnavailableError,parseUtoolsFactorRsc} from './utools-factor-rsc.mjs';

test('detects Next.js soft 404 responses',()=>{
  const payload='1:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}\n';
  assert.throws(()=>parseUtoolsFactorRsc(`self.__next_f.push([1,${JSON.stringify(payload)}])`),FactorPageUnavailableError);
});
test('only a confirmed unavailable page can use a complete matching saved pair',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'factor-snapshot-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const page={schemaVersion:1,eventKey:'chm2',style:'runner',courseId:11203,cards:Array.from({length:100},(_,id)=>({id})),courseEffectSet:{effects:{1:1}},fetchedAt:'original'};
  const ranking={schemaVersion:1,eventKey:'chm2',style:'runner',deck:[0,1,2,3,4].map(id=>({id})),rows:Array.from({length:20},(_,i)=>({id:i+5,rank:i+1,score:i}))};
  for(const [dir,data] of [['exact-pages',page],['rankings',ranking]]){
    const folder=path.join(root,dir,'chm2');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'runner.json'),JSON.stringify(data));
  }
  const unavailable=async()=>{throw new FactorPageUnavailableError('retired');};
  const result=await fetchFactorPageOrSnapshot('chm2','runner',{root,fetchPage:unavailable});
  assert.equal(result.archived,true);assert.deepEqual(result.page,page);assert.deepEqual(result.ranking,ranking);
  await assert.rejects(fetchFactorPageOrSnapshot('chm2','runner',{root,fetchPage:async()=>{throw new Error('malformed live payload');}}),/malformed live payload/);
  ranking.style='leader';fs.writeFileSync(path.join(root,'rankings/chm2/runner.json'),JSON.stringify(ranking));
  await assert.rejects(fetchFactorPageOrSnapshot('chm2','runner',{root,fetchPage:unavailable}),/saved snapshot/);
});
