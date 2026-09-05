import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

// A tagged prerelease is still a release. Drafts are never published on the site.
export function selectReleases(releases) {
  const components={};
  for (const component of ['cli','full','edge']) {
    const matches=releases.filter(r=>!r.draft && new RegExp(`^${component}-v\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?$`).test(r.tag_name));
    matches.sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
    if (matches[0]) {
      const r=matches[0];
      if (!r.published_at || !Number.isFinite(Date.parse(r.published_at))) throw new Error('Missing publication date');
      components[component]={tag:r.tag_name,version:r.tag_name.slice(component.length+2),url:`https://github.com/privacykey/mantis/releases/tag/${encodeURIComponent(r.tag_name)}`,published_at:r.published_at};
    }
  }
  return {source:'privacykey/mantis',components};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let releases=[];
  for (let page=1; ; page++) {
    if (page>100) throw new Error('Release pagination limit exceeded; refusing a partial update');
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if (process.env.GITHUB_TOKEN) headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
    const response=await fetch(`https://api.github.com/repos/privacykey/mantis/releases?per_page=100&page=${page}`,{headers,signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`Release fetch failed: ${response.status}`);
    const batch=await response.json();
    if (!Array.isArray(batch)) throw new Error('Invalid releases response');
    releases.push(...batch);
    if (batch.length<100) break;
  }
  const version=selectReleases(releases);
  if (!Object.keys(version.components).length) throw new Error('No tagged component releases; refusing to erase the current data');
  await writeFile(new URL('../version.json',import.meta.url),JSON.stringify(version,null,2)+'\n');
  await build();
  console.log('Updated release data and generated pages.');
}
