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
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${t.id}: ${fg} contrast on ${bg}`);
}
if (process.argv.includes('--links')) {
  for (const url of external) {
    const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'mantis-website-check'}});
    assert(r.ok,`${url}: ${r.status}`);
  }
  console.log(`Checked ${external.size} live documentation URLs.`);
}
console.log(`Checked generated pages, ${links} local links, and all text colors in ${themes.length} themes.`);
