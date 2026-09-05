import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDemo } from '../assets/demo-state.js';
import { selectReleases } from '../scripts/sync-releases.mjs';
import { parseImporters } from '../scripts/sync-dependencies.mjs';

test('demo keys, generated files, and hits stay consistent',()=>{
  const d=createDemo();
  d.execute('mantis new "Payroll sample" -w https://hook.example.com/demo');
  assert.match(d.execute('mantis list').join('\n'),/Payroll sample · 0/);
  d.execute('mantis download last --docx payroll.docx');
  assert.deepEqual(d.snapshot().keys[0].files,['payroll.docx']);
  assert.match(d.trigger().join('\n'),/Webhook alert delivered/);
  assert.match(d.execute('mantis list').join('\n'),/Payroll sample · 1/);
  assert.match(d.execute('mantis hits').join('\n'),/198\.51\.100\.24/);
  d.reset(); assert.equal(d.snapshot().keys.length,0);
});
test('demo never reports delivery when no destination is configured',()=>{
  const d=createDemo(); d.execute('mantis new "No destination"');
  assert.match(d.trigger().join('\n'),/No notification destination/);
  assert.match(d.execute('mantis login').join('\n'),/not implemented/);
  assert.match(d.execute('mantis new "Invalid" -w').join('\n'),/Give -w/);
  assert.equal(d.snapshot().keys.length,1);
});
test('release selection distinguishes real component releases from package versions and drafts',()=>{
  const r=(tag_name,published_at,draft=false)=>({tag_name,published_at,draft});
  const out=selectReleases([r('cli-v0.1.0','2026-01-01'),r('cli-v0.2.0','2026-08-01'),r('cli-v9.0.0','2026-09-01',true),r('v0.1.4','2026-09-01')]);
  assert.deepEqual(Object.keys(out.components),['cli']);
  assert.equal(out.components.cli.version,'0.2.0');
  assert.equal(out.components.full,undefined);
});
test('lockfile reader keeps importer scope, exact versions, and excludes workspace links',()=>{
  const lock=`lockfileVersion: '9.0'\nimporters:\n\n  .:\n    dependencies:\n      '@mantis/core':\n        version: link:packages/core\n      ua-parser-js:\n        specifier: ^2.0.10\n        version: 2.0.10\n    devDependencies:\n      typescript:\n        version: 6.0.3\n  cli:\n    dependencies:\n      qrcode:\n        version: 1.5.4\npackages:\n  bogus:\n    version: 9.0.0\n`;
  assert.deepEqual(parseImporters(lock),[
    {importer:'.',section:'dependencies',name:'ua-parser-js',version:'2.0.10'},
    {importer:'.',section:'devDependencies',name:'typescript',version:'6.0.3'},
    {importer:'cli',section:'dependencies',name:'qrcode',version:'1.5.4'}
  ]);
  assert.throws(()=>parseImporters("lockfileVersion: '8.0'"));
});

function element() {
  return {textContent:'',children:[],events:{},disabled:false,hidden:false,
    addEventListener(name,handler){this.events[name]=handler;},
    appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},
    focus(){},setAttribute(name,value){this[name]=value;},
    get firstElementChild(){return this.children[0];},
    get scrollHeight(){return this.children.length;}
  };
}
async function simulationFixture({reduced=false,reading=false,saved=null,focusedInput=false}={}) {
  const body=element(),form=element(),input=element(),status=element(),replay=element(),skip=element(),trigger=element(),motion=element();
  const elements={'.term-body':body,'form':form,'.term-input':input,'[data-demo-status]':status,'[data-demo-replay]':replay,'[data-demo-skip]':skip,'[data-demo-trigger]':trigger,'[data-demo-motion]':motion};
  const timers=new Map(),storage=new Map(saved?[['mantis-motion-v1',saved]]:[]);let timerId=0;
  const media={matches:reduced,addEventListener(name,handler){this.change=handler;}};
  const terminal={querySelector:s=>elements[s],querySelectorAll:()=>[],contains:el=>Object.values(elements).includes(el)};
  const document={documentElement:{dataset:{readingView:String(reading)}},activeElement:focusedInput?input:null,querySelector:s=>s==='.hero-terminal'?terminal:null,createElement:()=>element()};
  for(const el of Object.values(elements))el.focus=()=>{document.activeElement=el;};
  const source=(await readFile(new URL('../assets/mantis-terminal.js',import.meta.url),'utf8')).replace(/^import .*?;\n/,'');
  vm.runInNewContext(source,{createDemo,console:{warn(){}},window:{matchMedia:()=>media},document,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}});
  return {body,form,input,status,replay,skip,trigger,motion,document,media,timers,storage,
    transcript:()=>body.children.map(e=>e.textContent).join('\n'),
    finish(){let limit=10;while(timers.size&&limit--){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}assert.equal(timers.size,0);}};
}
test('autoplay starts by default, completes silently, and never takes keyboard focus',async()=>{
  const f=await simulationFixture();
  assert.equal(f.motion.textContent,'Pause animation');assert.equal(f.timers.size,1);
  assert.match(f.transcript(),/created demo-01/);assert.equal(f.document.activeElement,null);
  assert.equal(f.input.disabled,false);assert.equal(f.trigger.disabled,false);
  f.finish();assert.match(f.transcript(),/1 total/);assert.equal(f.skip.hidden,true);
  assert.equal(f.status.textContent,'');assert.equal(f.document.activeElement,null);
});
test('pause freezes the sequence, persists, and resumes from the same step',async()=>{
  const f=await simulationFixture();const before=f.transcript();f.motion.focus();f.motion.events.click();
  assert.equal(f.timers.size,0);assert.equal(f.transcript(),before);
  assert.equal(f.motion.textContent,'Resume animation');assert.equal(f.document.activeElement,f.motion);
  assert.equal(f.storage.get('mantis-motion-v1'),'paused');
  f.body.focus();f.body.events.focus();assert.equal(f.transcript(),before);
  const next=await simulationFixture({saved:f.storage.get('mantis-motion-v1')});assert.equal(next.timers.size,0);
  f.motion.events.click();assert.equal(f.timers.size,1);f.finish();assert.match(f.transcript(),/1 total/);
});
for(const options of [{reduced:true},{reading:true},{saved:'paused'}])test(`${JSON.stringify(options)} suppresses autoplay and keeps immediate replay interactive`,async()=>{
  const f=await simulationFixture(options);assert.equal(f.timers.size,0);
  f.replay.focus();f.replay.events.click();assert.equal(f.timers.size,0);
  assert.match(f.transcript(),/Generated Q4_forecast.docx/);assert.match(f.status.textContent,/Demo complete/);
  assert.equal(f.document.activeElement,f.replay);assert.equal(f.skip.hidden,true);
  f.trigger.events.click();assert.match(f.status.textContent,/2 total/);
});
test('typing interrupts autoplay so later timer steps cannot overwrite a user command',async()=>{
  const f=await simulationFixture();f.input.focus();f.input.events.focus();assert.equal(f.timers.size,0);
  f.input.value='help';f.form.events.submit({preventDefault(){}});
  assert.match(f.transcript(),/Demo commands:/);assert.equal(f.document.activeElement,f.input);assert.equal(f.skip.hidden,true);
});
test('a late-loading demo script does not start autoplay when the visitor is already using its input',async()=>{
  const f=await simulationFixture({focusedInput:true});assert.equal(f.timers.size,0);
  assert.equal(f.document.activeElement,f.input);assert.equal(f.status.textContent,'');
});
test('skipping a replay restores focus and changing reduced motion stops a running sequence',async()=>{
  const f=await simulationFixture();f.skip.focus();f.skip.events.click();
  assert.equal(f.document.activeElement,f.replay);assert.equal(f.timers.size,0);assert.match(f.transcript(),/1 total/);
  f.replay.events.click();assert.equal(f.timers.size,1);
  f.media.matches=true;f.media.change({matches:true});assert.equal(f.timers.size,0);
  assert.equal(f.motion.disabled,true);assert.equal(f.motion.textContent,'Reduced motion on');assert.equal(f.skip.hidden,true);
});

async function badgeFixture(run,cache=null,fail=false) {
  const badge=element(),checked=element(); let request;
  const storage=new Map(cache?[['mantis-main-ci-v1',JSON.stringify(cache)]]:[]);
  const source=await readFile(new URL('../assets/footer.js',import.meta.url),'utf8');
  const context={Date,Number,JSON,URL,AbortController,setTimeout,clearTimeout,
    document:{getElementById:()=>null,querySelector:s=>s==='[data-build-status]'?badge:s==='[data-build-checked]'?checked:null,querySelectorAll:()=>[]},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    fetch:async(url,options)=>{request={url,options};if(fail)throw new Error('offline');return {ok:true,json:async()=>({workflow_runs:run?[run]:[]})};}
  };
  vm.runInNewContext(source,context);
  await new Promise(r=>setImmediate(r));
  return {badge,checked,request,storage};
}
const mainRun={head_branch:'main',event:'push',status:'completed',conclusion:'success',html_url:'https://github.com/privacykey/mantis/actions/runs/123'};
test('CI badge filters main push runs and omits credentials and referrer',async()=>{
  const f=await badgeFixture(mainRun);
  assert.match(f.request.url,/workflows\/ci.yml\/runs\?branch=main&event=push/);
  assert.equal(f.request.options.credentials,'omit');
  assert.equal(f.request.options.referrerPolicy,'no-referrer');
  assert.equal(f.badge.textContent,'main CI · passing');
  assert.equal(f.badge.href,mainRun.html_url);
  assert.match(f.checked.textContent,/checked/);
});
test('a pull-request run cannot paint a passing main badge',async()=>{
  const f=await badgeFixture({...mainRun,head_branch:'feature',event:'pull_request'});
  assert.equal(f.badge.textContent,'main CI · unavailable');
  assert.equal(f.storage.size,0);
});
test('cached main CI results avoid another network request',async()=>{
  const f=await badgeFixture(null,{run:mainRun,time:Date.now()-1000});
  assert.equal(f.request,undefined);
  assert.equal(f.badge.textContent,'main CI · passing');
});
test('expired cache and network failure show unavailable rather than stale success',async()=>{
  const f=await badgeFixture(null,{run:mainRun,time:Date.now()-6*60*1000},true);
  assert(f.request); assert.equal(f.badge.textContent,'main CI · unavailable');
});
