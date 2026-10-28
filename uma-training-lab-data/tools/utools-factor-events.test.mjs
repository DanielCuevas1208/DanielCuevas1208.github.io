import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FactorPageUnavailableError,parseUtoolsFactorRsc} from './utools-factor-rsc.mjs';
import {hasCurrentConditionPolicy} from './global-delta-policy.mjs';
import {parseEventTitle,parseEventCourseId,eventIdentity,listSnapshots,FACTOR_ROOT,FACTOR_STYLES} from './utools-factor-events.mjs';
import {refreshExactPages} from './bootstrap-utools-factor-exact-pages.mjs';
import {refreshRankings} from './bootstrap-utools-factor-rankings.mjs';

test('refreshes older popularity calculations without invalidating unrelated rows',()=>{
  assert.equal(hasCurrentConditionPolicy({condition:'popularity>=4'},{}),false);
  assert.equal(hasCurrentConditionPolicy({condition:'popularity<=3'},{conditionPolicyVersion:1}),true);
  assert.equal(hasCurrentConditionPolicy({condition:'phase==2'},{}),true);
});

test('detects Next.js soft 404 responses',()=>{
  const payload='1:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}\n';
  assert.throws(()=>parseUtoolsFactorRsc(`self.__next_f.push([1,${JSON.stringify(payload)}])`),FactorPageUnavailableError);
});

const overview=(month,name,courseId)=>`<title>【${month}】${name}の攻略まとめ | U-tools</title><a href="/race/courses/${courseId}">course</a><a href="https://u.tools/race/courses/${courseId}">again</a>`;
const factorTitle=(month,name)=>`【${month}】${name}の因子周回（先行） | U-tools（ウマ娘攻略ツール集）`;
const tmpRoot=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'factor-events-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const quiet=()=>{};

test('event identity comes from the page title and course link, not the slug',()=>{
  assert.deepEqual(parseEventTitle('【2026/11】リーグオブヒーローズの攻略まとめ | U-tools'),{month:'2026-11',kind:'loh',name:'リーグオブヒーローズ'});
  assert.equal(parseEventTitle(factorTitle('2026/12','チャンピオンズミーティング')).kind,'chm');
  assert.equal(parseEventTitle('【2026/09】スペシャルチャンピオンズミーティングの因子周回（差し）').kind,'spchm');
  assert.equal(parseEventTitle('U-tools（ウマ娘攻略ツール集）'),null);
  assert.equal(parseEventCourseId(overview('2026/11','リーグオブヒーローズ',10810)),10810);
  assert.throws(()=>parseEventCourseId('<a href="/race/courses/10810"></a><a href="/race/courses/10504"></a>'),/exactly one course/);
  assert.throws(()=>parseEventCourseId('<title>x</title>'),/exactly one course/);
  assert.deepEqual(eventIdentity('loh2',overview('2026/11','リーグオブヒーローズ',10810)),
    {slug:'loh2',key:'loh-2026-11',kind:'loh',month:'2026-11',courseId:10810,label:'2026-11 League of Heroes',title:'リーグオブヒーローズ'});
});

function fakePage(slug,style,title,marker){
  return {schemaVersion:1,pageUrl:`u/${slug}/${style}`,finalUrl:`u/${slug}/${style}`,eventKey:slug,style,fetchedAt:'now',pageTitle:title,
    cards:Array.from({length:100},(_,id)=>({id,hintSkillIds:[]})),skillMap:{},courseEffectSet:{base:{},effects:{[marker]:{point:100,effect:1}}}};
}

test('a rolled-over slug files the new event separately and leaves the old snapshot alone',async t=>{
  const root=tmpRoot(t);
  let served={month:'2026/09',course:10603,marker:1};
  const fetchOverview=async slug=>{
    if(slug!=='chm') throw new FactorPageUnavailableError('gone');
    return overview(served.month,'チャンピオンズミーティング',served.course);
  };
  const fetchPage=async(slug,style)=>fakePage(slug,style,factorTitle(served.month,'チャンピオンズミーティング'),served.marker);
  await refreshExactPages({slugs:['chm','chm2'],root,fetchOverview,fetchPage,log:quiet});
  const september=fs.readFileSync(path.join(root,'exact-pages/chm-2026-09/leader.json'),'utf8');
  served={month:'2026/12',course:10506,marker:2};
  await refreshExactPages({slugs:['chm','chm2'],root,fetchOverview,fetchPage,log:quiet});
  assert.equal(fs.readFileSync(path.join(root,'exact-pages/chm-2026-09/leader.json'),'utf8'),september);
  const december=JSON.parse(fs.readFileSync(path.join(root,'exact-pages/chm-2026-12/leader.json'),'utf8'));
  assert.equal(december.courseId,10506);
  assert.equal(december.eventKey,'chm-2026-12');
  assert.equal(december.slug,'chm');
  assert.deepEqual(Object.keys(december.courseEffectSet.effects),['2']);
  const index=JSON.parse(fs.readFileSync(path.join(root,'exact-pages/index.json'),'utf8'));
  assert.deepEqual(Object.keys(index.courses),['10506','10603']);
  assert.equal(index.courses['10603'].styles.leader.path,'exact-pages/chm-2026-09/leader.json');
  assert.equal(index.courses['10506'].styles.leader.path,'exact-pages/chm-2026-12/leader.json');
});

test('aliased slugs import once; a factor page from another event is refused',async t=>{
  const root=tmpRoot(t);
  const fetchOverview=async()=>overview('2026/11','リーグオブヒーローズ',10810);
  const fetched=[];
  await refreshExactPages({slugs:['loh','loh2'],root,fetchOverview,log:quiet,
    fetchPage:async(slug,style)=>{fetched.push(slug);return fakePage(slug,style,factorTitle('2026/11','リーグオブヒーローズ'),1);}});
  assert.deepEqual([...new Set(fetched)],['loh']);
  assert.deepEqual(listSnapshots(root).map(s=>[s.key,s.courseId]),[['loh-2026-11',10810]]);

  const other=tmpRoot(t);
  await assert.rejects(refreshExactPages({slugs:['loh2'],root:other,fetchOverview,log:quiet,
    fetchPage:async(slug,style)=>fakePage(slug,style,factorTitle('2026/12','チャンピオンズミーティング'),1)}),/overview is loh 2026-11/);
  assert.equal(fs.existsSync(path.join(other,'exact-pages/loh-2026-11')),false);
});

test('a ranking is saved only when it reproduces from the saved exact page',async t=>{
  const root=tmpRoot(t);
  const read=(dir,key,style)=>JSON.parse(fs.readFileSync(path.join(FACTOR_ROOT,dir,key,style+'.json'),'utf8'));
  for(const style of FACTOR_STYLES){
    const folder=path.join(root,'exact-pages','loh-2026-11');
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,style+'.json'),JSON.stringify(read('exact-pages','loh-2026-11',style)));
  }
  const fetchOverview=async()=>overview('2026/11','リーグオブヒーローズ',10810);
  const title=factorTitle('2026/11','リーグオブヒーローズ');
  await refreshRankings({slugs:['loh2'],root,fetchOverview,log:quiet,
    fetchRanking:async(slug,style)=>({...read('rankings','loh-2026-11',style),pageTitle:title})});
  const saved=JSON.parse(fs.readFileSync(path.join(root,'rankings/loh-2026-11/leader.json'),'utf8'));
  assert.equal(saved.courseId,10810);
  assert.equal(saved.eventKey,'loh-2026-11');

  fs.rmSync(path.join(root,'rankings'),{recursive:true});
  await assert.rejects(refreshRankings({slugs:['loh2'],root,fetchOverview,log:quiet,
    fetchRanking:async(slug,style)=>({...read('rankings','chm-2026-12',style),pageTitle:title})}),/does not reproduce/);
  assert.equal(fs.existsSync(path.join(root,'rankings/loh-2026-11/runner.json')),false);
});
