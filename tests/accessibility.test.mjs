import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const readingSource=await readFile(new URL('../assets/reading-preferences.js',import.meta.url),'utf8');
function field(value='') {return {value,checked:false,disabled:false,events:{},attrs:{},focused:false,scrolled:false,textContent:'',addEventListener(n,f){this.events[n]=f;},setAttribute(n,v){this.attrs[n]=v;},removeAttribute(n){delete this.attrs[n];},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};}
function readingFixture(saved=null,storageFails=false) {
  const root={dataset:{},style:{setProperty(n,v){this[n]=v;}}};
  const values={size:field(),reading:field(),foreground:field(),background:field()};
  const reset=field(),undo=field(),submit=field(),status=field(),error=field();
  const form={elements:values,events:{},addEventListener(n,f){this.events[n]=f;},querySelector(s){return s==='[data-reading-reset]'?reset:s==='[data-reading-undo]'?undo:submit;}};
  let stored=typeof saved==='string'?saved:JSON.stringify(saved);
  const documentEvents={},windowEvents={};
  vm.runInNewContext(readingSource,{document:{documentElement:root,querySelector:s=>s==='[data-reading-settings]'?form:s==='[data-reading-status]'?status:null,getElementById:()=>error,addEventListener(n,f){documentEvents[n]=f;}},window:{addEventListener(n,f){windowEvents[n]=f;}},localStorage:{getItem(){if(storageFails)throw Error('Blocked');return stored;},setItem(k,v){if(storageFails)throw Error('Blocked');stored=v;}}});
  documentEvents.DOMContentLoaded();
  return {root,values,reset,undo,submit,status,error,save:()=>form.events.submit({preventDefault(){}}),stored:()=>JSON.parse(stored),windowEvents};
}

test('stored reading settings restore size, layout, and custom colors',()=>{
  const f=readingFixture({size:'200',reading:true,foreground:'#ffffff',background:'#000000'});
  assert.equal(f.root.style.fontSize,'200%');assert.equal(f.root.dataset.readingView,'true');
  assert.equal(f.root.style['--reading-fg'],'#ffffff');assert.equal(f.values.size.value,'200');
});
test('malformed preferences and unsafe color values fall back without breaking the page',()=>{
  for(const saved of ['not JSON',null,{size:'9999',reading:'true',foreground:'url(https://example.com)',background:'#000000'}]) {
    const f=readingFixture(saved);assert.equal(f.root.style.fontSize,'100%');assert.equal(f.root.dataset.customColors,'false');
  }
});
test('invalid custom color pairs retain the applied settings and focus the invalid field',()=>{
  const f=readingFixture();f.values.foreground.value='#ffffff';f.values.background.value='red';f.values.size.value='200';f.save();
  assert.equal(f.root.style.fontSize,'100%');assert.equal(f.values.background.focused,true);assert.equal(f.values.background.attrs['aria-invalid'],'true');assert.match(f.error.textContent,/Enter both colors/);
});
test('save, reset, and restore remain reversible across a page reload',()=>{
  const f=readingFixture();f.values.size.value='200';f.values.reading.checked=true;f.save();
  f.reset.events.click();assert.equal(f.root.style.fontSize,'100%');
  const next=readingFixture(f.stored());next.undo.events.click();
  assert.equal(next.root.style.fontSize,'200%');assert.equal(next.root.dataset.readingView,'true');
  next.undo.events.click();assert.equal(next.root.style.fontSize,'100%');
});
test('blocked local storage still permits reading changes and explains their lifetime',()=>{
  const f=readingFixture(null,true);f.values.size.value='150';f.save();
  assert.equal(f.root.style.fontSize,'150%');assert.match(f.status.textContent,/could not save/);
});
test('choosing a theme removes custom colors without losing text size',()=>{
  const f=readingFixture({size:'200',foreground:'#eeeeee',background:'#111111'});
  f.windowEvents['mantis:theme-change']();assert.equal(f.root.dataset.customColors,'false');assert.equal(f.root.style.fontSize,'200%');
});
test('copy feedback keeps the control enabled and never expires on a timer',async()=>{
  const source=await readFile(new URL('../assets/footer.js',import.meta.url),'utf8');
  const button=field(),status=field(),feedback=field();button.textContent='Copy install command';
  let complete, copied, timers=0;
  const wrap={querySelector:s=>s==='.copy-feedback'?feedback:{textContent:'brew install privacykey/tap/mantis'}};button.closest=()=>wrap;
  vm.runInNewContext(source,{document:{getElementById:id=>id==='interaction-status'?status:null,querySelector:()=>null,querySelectorAll:()=>[button]},navigator:{clipboard:{writeText(text){copied=text;return new Promise(resolve=>{complete=resolve;});}}},setTimeout(){timers++;}});
  const pending=button.events.click();assert.equal(button.disabled,false);assert.equal(button.attrs['aria-busy'],'true');
  complete();await pending;
  assert.equal(copied,'brew install privacykey/tap/mantis');assert.match(status.textContent,/Copied/);assert.match(feedback.textContent,/clipboard/);assert.equal(button.textContent,'Copy install command');assert.equal(timers,0);
});
test('menu closes when keyboard focus leaves and Escape returns to its summary',async()=>{
  const source=(await readFile(new URL('../site/theme.js',import.meta.url),'utf8')).replace('THEME_IDS','["mono"]');
  const events={},summary=field(),inside={};
  const menu={open:true,contains:e=>e===inside,querySelector:()=>summary,querySelectorAll:()=>[]};
  vm.runInNewContext(source,{document:{documentElement:{dataset:{}},querySelectorAll:()=>[],querySelector:s=>s==='.nav-menu'?menu:null,addEventListener(n,f){events[n]=f;}},window:{}});
  events.focusin({target:inside});assert.equal(menu.open,true);
  events.focusin({target:{}});assert.equal(menu.open,false);
  menu.open=true;events.keydown({key:'Escape'});assert.equal(menu.open,false);assert.equal(summary.focused,true);
});
