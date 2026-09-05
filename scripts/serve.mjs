import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { root } from './build.mjs';

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.txt':'text/plain'};
const port=Number(process.env.PORT||8742);
createServer(async(req,res)=>{
  try {
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/'){res.writeHead(301,{Location:'/en/'});res.end();return;}
    if(path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path);
    const hidden=/^\/(?:\.|site\/|scripts\/|tests\/|node_modules\/|package\.json|README\.md|justfile|wrangler\.jsonc)/.test(path);
    const found=!hidden && file.startsWith(resolve(root)+sep) && await stat(file).then(s=>s.isFile()).catch(()=>false);
    res.writeHead(found?200:404,{'Content-Type':found?(mime[extname(file)]||'text/plain'):'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(await readFile(found?file:resolve(root,'404.html')));
  }catch(e){res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}/en/`));
