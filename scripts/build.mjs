import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(resolve(root, path), 'utf8');
export const escape = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digest = content => createHash('sha256').update(content).digest('hex').slice(0,12);
function render(source, values) {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Missing template value: ${key}`);
    return values[key];
  });
}

export async function build({ check = false } = {}) {
  const config = JSON.parse(await read('site/config.json'));
  const themes = JSON.parse(await read('site/themes.json'));
  const versions = JSON.parse(await read('version.json'));
  const dependencies = JSON.parse(await read('site/dependencies.json'));
  const layout = await read('site/layout.html');
  const releases = Object.entries(versions.components).filter(([,v]) => v).map(([name,v]) =>
    `<a data-release-link="${name}" href="${escape(v.url)}">${name === 'cli' ? 'CLI' : name} release <span data-release="${name}">v${escape(v.version)}</span></a>`).join(' · ') || 'No tagged releases yet';
  const themeOptions = ['dark','light'].map(mode => `<optgroup label="${mode}">${themes.filter(t=>t.mode===mode).map(t=>`<option value="${t.id}">${mode==='light'?'○':'●'} ${escape(t.label)} · ${escape(t.description)}</option>`).join('')}</optgroup>`).join('');
  const themeIds = themes.map(t=>t.id);
  const themeBootstrap = `(function(){var d=document.documentElement;d.classList.replace('no-js','js');try{var t=localStorage.getItem('mantis-theme');if(${JSON.stringify(themeIds)}.includes(t))d.dataset.theme=t;}catch(e){}})();`;
  const values = { origin: config.origin, releases, themeOptions, themeBootstrap, reviewedAt: escape(config.reviewedAt), themeNames: themes.map(t=>escape(t.label)).join(', ') };
  values.navigation = render(await read('site/partials/navigation.html'), values);
  values.footer = render(await read('site/partials/footer.html'), values);
  values.dependencyRows = dependencies.packages.map(p=>`<tr><th scope="row"><a href="${escape(p.metadataUrl)}">${escape(p.name)}</a></th><td>${escape(p.version)}</td><td>${escape(p.license)}</td><td>${escape(p.scopes.join(', '))}</td></tr>`).join('\n');
  values.dependencyRef = escape(dependencies.productRef);
  values.dependencyDate = escape(dependencies.checkedAt);
  values.capabilityCards = JSON.parse(await read('site/capabilities.json')).map(c=>`<article class="cap"><div class="cap-head"><span class="cap-id">${escape(c.scope)}</span></div><h3>${escape(c.title)}</h3><p>${escape(c.description)}</p><a href="${escape(c.url)}">${escape(c.linkLabel)} →</a></article>`).join('\n');
  const outputs = new Map();
  for (const page of config.pages) {
    const graph = page.name === 'index' ? [{
      '@type': 'SoftwareSourceCode', name: 'mantis', description: page.description,
      codeRepository: config.product, url: config.origin + '/en/', license: 'https://opensource.org/license/mit/'
    }, ...Object.entries(versions.components).filter(([,v])=>v).map(([name,v])=>({
      '@type':'SoftwareApplication', name:`mantis ${name}`, applicationCategory:'SecurityApplication',
      softwareVersion:v.version, downloadUrl:v.url, license:'https://opensource.org/license/mit/'
    }))] : null;
    const structuredData = graph ? `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script>` : '';
    const content = render(await read(`site/pages/${page.name}.html`), values);
    const html = render(layout, { ...values, title: escape(page.title), description: escape(page.description), canonical: config.origin + page.path, robots: page.noindex ? 'noindex' : 'index, follow, max-image-preview:large', structuredData, content, pageScripts: page.name==='index' ? '<script src="/assets/vendor/three.min.js"></script>\n<script type="module" src="/assets/mantis-terminal.js"></script>' : '' });
    outputs.set(page.name==='404' ? '404.html' : `en/${page.name}.html`, html.replace(/[ \t]+$/gm,''));
  }
  outputs.set('assets/themes.css', '/* Generated from site/themes.json. */\n' + themes.map(t => `${t.id==='mono'?':root, ':''}:root[data-theme="${t.id}"] {\n  color-scheme: ${t.mode};\n${Object.entries(t.colors).map(([k,v])=>`  --${k}: ${v};`).join('\n')}\n}`).join('\n'));
  outputs.set('assets/theme.js', `/* Generated from site/themes.json by scripts/build.mjs. */\n${await read('site/theme.js')}`.replace('THEME_IDS', JSON.stringify(themeIds)));
  outputs.set('assets/mantis-terminal.js', (await read('site/mantis-terminal.js')).replace('/assets/demo-state.js', `/assets/demo-state.js?v=${digest(await read('assets/demo-state.js'))}`));
  // Content hashes keep returning visitors from mixing new HTML with old scripts.
  for (const [path, content] of outputs) {
    if (!path.endsWith('.html')) continue;
    let html = content;
    for (const [match, asset] of content.matchAll(/(?:src|href)="\/(assets\/[^"?]+\.(?:js|css))"/g)) {
      const source = outputs.get(asset) ?? await read(asset);
      html = html.replace(match, match.slice(0,-1) + `?v=${digest(source)}"`);
    }
    outputs.set(path, html);
  }
  for (const [path, content] of outputs) {
    if (check) {
      if (await read(path) !== content) throw new Error(`${path} is stale; run node scripts/build.mjs`);
    } else {
      await writeFile(resolve(root,path), content);
    }
  }
  return [...outputs.keys()];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(resolve(root,'en'), { recursive:true });
  const files = await build({check:process.argv.includes('--check')});
  console.log(`${process.argv.includes('--check')?'Verified':'Generated'} ${files.length} static files.`);
}
