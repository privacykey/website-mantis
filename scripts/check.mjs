import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, root } from './build.mjs';

await build({check:true});
const config=JSON.parse(await readFile(resolve(root,'site/config.json'),'utf8'));
const htmlFiles=config.pages.map(p=>p.name==='404'?'404.html':`en/${p.name}.html`);
const pages=new Map(await Promise.all(htmlFiles.map(async f=>[f,await readFile(resolve(root,f),'utf8')])));
const external=new Set();
let links=0;
for (const [file,html] of pages) {
  assert(/<html\b[^>]*\blang="en"/.test(html),`${file}: declared page language`);
  assert.equal((html.match(/<main(?:\s|>)/g)||[]).length,1,`${file}: one main landmark`);
  assert(/class="skip-link" href="#main"/.test(html),`${file}: skip link`);
  assert(html.includes('aria-label="Primary"'),`${file}: primary navigation landmark`);
  if(file!=='en/index.html')assert(html.includes('aria-label="Breadcrumb"'),`${file}: breadcrumb landmark`);
  assert(html.includes('Plain-language summary') && html.includes('/en/glossary.html') && html.includes('/en/accessibility.html'),`${file}: reading help`);
  assert(!/tabindex="[1-9][0-9]*"/.test(html),`${file}: preserve natural keyboard order`);
  assert(!/target="_blank"/.test(html),`${file}: keep navigation in the requested context`);
  assert(!/maximum-scale|user-scalable\s*=\s*(?:no|0)/.test(html),`${file}: browser zoom allowed`);
  assert(!/__audit\/|axe(?:\.min)?\.js/.test(html),`${file}: development audit is not published`);
  for(const [,attributes] of html.matchAll(/<img\b([^>]*)>/g)) assert(/\balt="[^"]*"/.test(attributes),`${file}: image alternative`);
  for(const [,id] of html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)) assert(html.includes(`for="${id}"`),`${file}: input ${id} has a visible label`);
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${file}: one h1`);
  assert(!/\{\{\w+\}\}/.test(html),`${file}: unresolved template`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,`${file}: duplicate IDs`);
  for (const [,raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url=new URL(raw.replaceAll('&amp;','&'),`https://mantis.privacykey.org/${file}`);
    if (url.hostname==='docs.mantis.privacykey.org') external.add(url.href);
    if (url.origin!==config.origin) continue;
    const target=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
    assert(await stat(resolve(root,'.'+target)).catch(()=>false),`${file}: missing ${target}`);
    if (url.hash && target.endsWith('.html')) {
      const text=pages.get(target.slice(1)) || await readFile(resolve(root,'.'+target),'utf8');
      assert(text.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${file}: missing anchor ${raw}`);
    }
    links++;
  }
  assert(!/https:\/\/(?:github\.com|avatars\.githubusercontent\.com)[^"]+\.(?:png|jpg)/.test(html),`${file}: external avatar`);
  assert(!/aria-live="polite"[^>]*class="term-body"|class="term-body"[^>]*aria-live/.test(html),`${file}: animated transcript must not be live`);
}
const themes=JSON.parse(await readFile(resolve(root,'site/themes.json'),'utf8'));
function luminance(hex) {
  const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
for(const t of themes) for(const fg of ['accent','accent-bright','accent-soft','accent-dim','alarm']) for(const bg of ['bg','bg-soft','bg-deep']) {
  const a=luminance(t.colors[fg]),b=luminance(t.colors[bg]);
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=7,`${t.id}: ${fg} AAA contrast on ${bg}`);
}
for(const t of themes) for(const bg of ['bg','bg-soft','bg-deep']) {
  const a=luminance(t.colors['accent-line-strong']),b=luminance(t.colors[bg]);
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,`${t.id}: control boundary contrast on ${bg}`);
}
if (process.argv.includes('--links')) {
  for (const url of external) {
    const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'mantis-website-check'}});
    assert(r.ok,`${url}: ${r.status}`);
  }
  console.log(`Checked ${external.size} live documentation URLs.`);
}
console.log(`Checked generated pages, accessibility structure, ${links} local links, AAA text contrast, and control boundaries in ${themes.length} themes.`);
