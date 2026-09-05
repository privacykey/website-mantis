import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Parse only pnpm v9's importer dependency records, failing on unresolved entries.
// No installation or package execution is involved; licences come from exact npm metadata.
export function parseImporters(lock) {
  if (!/^lockfileVersion: '9\.0'/m.test(lock)) throw new Error('Expected pnpm lockfile v9');
  const result=[]; let active=false, importer, section, name;
  for (const line of lock.split('\n')) {
    if (line==='importers:') { active=true; continue; }
    if (!active) continue;
    if (/^\S/.test(line)) break;
    let m;
    if ((m=line.match(/^  (\S.*):$/))) { importer=m[1].replace(/^'|'$/g,''); section=null; }
    else if ((m=line.match(/^    (dependencies|devDependencies):$/))) section=m[1];
    else if ((m=line.match(/^      (\S.*):$/))) name=m[1].replace(/^'|'$/g,'');
    else if ((m=line.match(/^        version: (.+)$/))) {
      const version=m[1].replace(/^'|'$/g,'').split('(')[0];
      if (section && !version.startsWith('link:')) result.push({importer,section,name,version});
    }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const repo=process.argv[2]; const ref=process.argv[3] || 'origin/main';
  if (!repo) throw new Error('Usage: node scripts/sync-dependencies.mjs /path/to/mantis [git-ref]');
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  const productRef=git('rev-parse',ref);
  const entries=parseImporters(git('show',`${productRef}:pnpm-lock.yaml`));
  const scopes={'.':'full server','cli':'CLI','packages/core':'shared core'};
  const packages=new Map();
  for (const e of entries) {
    let scope;
    if (e.section==='dependencies' && scopes[e.importer]) scope=scopes[e.importer];
    else if (e.section==='devDependencies' && e.name==='typescript' && e.importer==='.') scope='development tooling';
    else if (e.section==='devDependencies' && e.name==='wrangler' && e.importer==='mantis-edge') scope='edge deployment tooling';
    else continue;
    if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(e.version)) throw new Error(`Unresolved version: ${e.name} ${e.version}`);
    const key=e.name+'@'+e.version;
    if (!packages.has(key)) packages.set(key,{name:e.name,version:e.version,scopes:[]});
    packages.get(key).scopes.push(scope);
  }
  if (!packages.has('ua-parser-js@2.0.10') && ![...packages.values()].some(p=>p.name==='ua-parser-js')) throw new Error('Product dependency inventory is incomplete');
  packages.set('three@0.160.0',{name:'three',version:'0.160.0',scopes:['website (bundled)']});
  const out=[];
  for (const p of packages.values()) {
    const metadataUrl=`https://registry.npmjs.org/${encodeURIComponent(p.name)}/${p.version}`;
    const response=await fetch(metadataUrl,{signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`${metadataUrl}: ${response.status}`);
    const data=await response.json();
    if (data.version!==p.version) throw new Error('Metadata version mismatch');
    const license=typeof data.license==='string'?data.license:data.license?.type;
    if (!license) throw new Error(`Missing licence metadata: ${p.name}`);
    out.push({...p,license,metadataUrl});
  }
  out.sort((a,b)=>a.name.localeCompare(b.name));
  await writeFile(new URL('../site/dependencies.json',import.meta.url),JSON.stringify({productRef,checkedAt:new Date().toISOString().slice(0,10),packages:out},null,2)+'\n');
  console.log(`Recorded exact licence metadata for ${out.length} packages at ${productRef.slice(0,7)}.`);
}
