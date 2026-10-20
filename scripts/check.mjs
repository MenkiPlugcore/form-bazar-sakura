import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function walk(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(['.git','dist','.local','node_modules','.openai'].includes(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(path));else files.push(path);}return files;}
let failures=0;
for(const file of await walk(root)){if(/\.(js|mjs)$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status){console.error(result.stderr);failures++;}}}
for(const file of['public/index.html','public/admin/index.html']){const html=await readFile(resolve(root,file),'utf8');for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)){try{await readFile(resolve(root,'public'+match[1]));}catch{console.error(`Missing asset: ${match[1]}`);failures++;}}}
if(failures)process.exit(1);console.log('JavaScript syntax and referenced assets checked.');
