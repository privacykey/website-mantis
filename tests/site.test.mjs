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
test('reduced motion keeps the terminal interactive and replay completes without animation',async()=>{
  const body=element(),form=element(),input=element(),status=element(),replay=element(),skip=element(),trigger=element();
  const elements={'.term-body':body,'form':form,'.term-input':input,'[data-demo-status]':status,'[data-demo-replay]':replay,'[data-demo-skip]':skip,'[data-demo-trigger]':trigger};
  const terminal={querySelector:s=>elements[s],querySelectorAll:()=>[]};
  const source=(await readFile(new URL('../assets/mantis-terminal.js',import.meta.url),'utf8')).replace(/^import .*?;\n/,'');
  const context={createDemo,console:{warn(){}},window:{matchMedia:()=>({matches:true,addEventListener(){}})},document:{querySelector:s=>s==='.hero-terminal'?terminal:null,createElement:()=>element()},setTimeout(){throw new Error('Reduced motion must not schedule animation');}};
  vm.runInNewContext(source,context);
  assert.equal(typeof form.events.submit,'function');
  await replay.events.click();
  assert.match(body.children.map(e=>e.textContent).join('\n'),/Generated Q4_forecast.docx/);
  assert.match(status.textContent,/Demo complete/);
  assert.equal(skip.hidden,true);
  trigger.events.click();
  assert.match(status.textContent,/2 total/);
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
