import { build } from 'esbuild';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function bundleAuth(){
  await build({entryPoints:[resolve(root,'src/admin-auth.js')],outfile:resolve(root,'public/assets/admin-auth.bundle.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',logLevel:'warning'});
}
