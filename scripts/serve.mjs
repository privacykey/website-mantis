import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { root } from './build.mjs';

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.txt':'text/plain'};
const port=Number(process.env.PORT||8742);
const audit=process.env.A11Y_AUDIT==='1' || process.argv.includes('--audit');
createServer(async(req,res)=>{
  try {
    const requestUrl=new URL(req.url,'http://localhost');
    let path=decodeURIComponent(requestUrl.pathname);
    if(audit && ['/__audit/axe.js','/__audit/check.js'].includes(path)) {
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
      res.end(await readFile(resolve(root,path.endsWith('axe.js')?'node_modules/axe-core/axe.min.js':'scripts/browser-audit.js')));return;
    }
    if(path==='/'){res.writeHead(301,{Location:'/en/'});res.end();return;}
    if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path);
    const hidden=/^\/(?:\.|site\/|scripts\/|tests\/|docs\/|node_modules\/|package(?:-lock)?\.json|README\.md|justfile|wrangler\.jsonc)/.test(path);
    const found=!hidden && file.startsWith(resolve(root)+sep) && await stat(file).then(s=>s.isFile()).catch(()=>false);
    res.writeHead(found?200:404,{'Content-Type':found?(mime[extname(file)]||'text/plain'):'text/html; charset=utf-8','Cache-Control':'no-store'});
    let body=await readFile(found?file:resolve(root,'404.html'));
    if(audit && (!found || extname(file)==='.html')) {
      let html=body.toString();
      if(requestUrl.searchParams.has('nojs')) html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      else html=html.replace('</body>','<script src="/__audit/axe.js"></script><script src="/__audit/check.js"></script></body>');
      body=html;
    }
    res.end(body);
  }catch(e){res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}/en/`));
