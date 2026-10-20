import http from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { localD1 } from './d1-local.mjs';
import { handleRequest } from '../server/api.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'.local'),{recursive:true});
const DB=localD1(resolve(root,'.local/dev.sqlite'));
await DB.exec(await readFile(resolve(root,'migrations/0001_initial.sql'),'utf8'));
let vars={};
try{for(const line of(await readFile(resolve(root,'.dev.vars'),'utf8')).split('\n')){const match=line.match(/^([A-Z_]+)\s*=\s*['"]?(.*?)['"]?\s*$/);if(match)vars[match[1]]=match[2];}}catch{}
const env={DB,ADMIN_PASSWORD:'sakura-local-development-only',SESSION_SECRET:'local-development-session-key-at-least-32-characters',...vars};
const args=process.argv.slice(2);const port=Number(process.env.PORT||args[args.indexOf('--port')+1])||4173;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain; charset=utf-8'};
const publicDir=resolve(root,'public');
const security={ 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" };
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname.startsWith('/api/')){
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);}
      const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await handleRequest(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    let file=resolve(publicDir,'.'+decodeURIComponent(url.pathname));
    if(file!==publicDir&&!file.startsWith(publicDir+sep)){res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store',...security});res.end(await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Halaman tidak ditemukan.');}
});
server.listen(port,'0.0.0.0',()=>console.log(`SAKURA local preview ready on port ${port}. Local data stays in .local/; never used in production.`));
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.close();process.exit(0);}));
