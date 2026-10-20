import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localPostgres } from '../scripts/postgres-local.mjs';
import { createAdminVerifier, rewriteAuthCookie } from '../server/auth.mjs';
import { ADMIN_EMAIL } from '../public/assets/shared.js';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { handleRequest, csvCell } from '../server/api.mjs';
const origin='https://sakura.example';
const schema=await readFile(new URL('../migrations/0001_neon.sql',import.meta.url),'utf8');
let env;
const authOrigin='https://auth.example';
const {privateKey,publicKey}=await generateKeyPair('EdDSA');
const key={...await exportJWK(publicKey),kid:'test-key',alg:'EdDSA',use:'sig'};
const verifyAdmin=createAdminVerifier({baseURL:authOrigin+'/sakura/auth',keySet:createLocalJWKSet({keys:[key]})});
async function token(patch={},options={}){return new SignJWT({email:ADMIN_EMAIL,emailVerified:true,banned:false,...patch}).setProtectedHeader({alg:'EdDSA',kid:'test-key'}).setSubject('test-admin').setIssuer(options.issuer||authOrigin).setAudience(options.audience||authOrigin).setIssuedAt().setExpirationTime(options.expiry||'10m').sign(privateKey);}
beforeEach(async()=>{env={DB:await localPostgres(),SESSION_SECRET:'test-session-secret-at-least-32-characters'};await env.DB.exec(schema);});
afterEach(async()=>{await env.DB.close();});
const valid=(patch={})=>({fullName:'Bunda Aisyah',phone:'081234567890',domicile:'Rawalumbu',relation:'public',childStages:['tk'],knownSchool:'yes',schoolSource:'instagram',sourceOther:'',interest:'yes',standCode:'SAKURA3',privacyConsent:true,contactConsent:false,...patch});
async function request(path,{method='GET',body,headers={},...rest}={},options={}){return handleRequest(new Request(origin+path,{method,headers:{...(method!=='GET'?{'Origin':origin,'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),...rest}),env,{verifyAdmin,...options});}
async function login(){return{Authorization:'Bearer '+await token()};}
async function add(patch={}){const response=await request('/api/register',{method:'POST',body:valid(patch)});assert.equal(response.status,201,await response.clone().text());return(await response.json()).ticket;}

test('configuration exposes ten active referral codes and no participant records',async()=>{const response=await request('/api/config');const data=await response.json();assert.equal(data.stands.length,10);assert.equal(data.stands[0].code,'SAKURA1');assert.equal(data.registrationOpen,true);assert.equal(data.stands[0].owner,undefined);const offline=await handleRequest(new Request(origin+'/api/config'),{});assert.equal((await offline.json()).registrationOpen,false);});
test('registration normalizes WhatsApp, preserves separate source/referral and separate consent',async()=>{const ticket=await add();assert.match(ticket.code,/^SG-[A-F0-9]{15}$/);const row=await env.DB.prepare('SELECT * FROM registrations').first();assert.equal(row.phone,'6281234567890');assert.equal(row.school_source,'instagram');assert.equal(row.stand_code,'SAKURA3');assert.equal(row.contact_consent,0);assert.equal(row.privacy_consent,1);assert.equal(ticket.phone,undefined);});
test('new-to-school answer overrides source and never assumes PPDB consent',async()=>{await add({knownSchool:'no',schoolSource:'other',sourceOther:'Ignore this stale hidden answer'});const row=await env.DB.prepare('SELECT * FROM registrations').first();assert.equal(row.school_source,'first_time');assert.equal(row.source_other,'');assert.equal(row.contact_consent,0);});
test('server rejects malformed fields, conflicting child ages, missing consent, and oversized bodies',async()=>{const invalid=await request('/api/register',{method:'POST',body:valid({fullName:'a',phone:'1234',childStages:['none','tk'],privacyConsent:false})});assert.equal(invalid.status,422);const fields=(await invalid.json()).fields;assert.ok(fields.phone&&fields.fullName&&fields.childStages&&fields.privacyConsent);assert.equal((await request('/api/register',{method:'POST',body:'{bad json'})).status,400);assert.equal((await request('/api/register',{method:'POST',body:JSON.stringify({padding:'x'.repeat(17000)})})).status,413);});
test('duplicate WhatsApp is prevented by a unique database constraint, including alternative formatting',async()=>{await add();const response=await request('/api/register',{method:'POST',body:valid({phone:'+62 812-3456-7890',fullName:'Other registrant'})});assert.equal(response.status,409);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM registrations').first()).count,1);assert.ok(!(await response.text()).includes('Bunda Aisyah'));});
test('inactive referrals, invalid referrals, closed registrations and honeypot are rejected',async()=>{await env.DB.prepare('UPDATE stands SET active = 0 WHERE code = ?').bind('SAKURA3').run();assert.equal((await request('/api/register',{method:'POST',body:valid()})).status,422);assert.equal((await request('/api/register',{method:'POST',body:valid({standCode:'NOPE'})})).status,422);assert.equal((await request('/api/register',{method:'POST',body:valid({website:'spam.test'})})).status,422);env.REGISTRATION_OPEN='false';assert.equal((await request('/api/register',{method:'POST',body:valid()})).status,409);});
test('cross-origin submissions are blocked and admin data is inaccessible anonymously',async()=>{
  assert.equal((await request('/api/register',{method:'POST',body:valid(),headers:{Origin:'https://other.example'}})).status,403);
  for(const path of['stats','participants','export'])assert.equal((await request('/api/admin/'+path)).status,401);
  assert.equal((await request('/api/auth/sign-in/email',{method:'POST',body:{email:ADMIN_EMAIL,password:'test-password'},headers:{Origin:'https://other.example'}})).status,403);
});
test('admin authorization rejects unverified, wrong-email, banned, expired, wrong-issuer, wrong-audience, and tampered tokens',async()=>{
  for(const claims of[{emailVerified:false},{email:'other@example.com'},{banned:true}])assert.equal((await request('/api/admin/stats',{headers:{Authorization:'Bearer '+await token(claims)}})).status,403);
  for(const options of[{expiry:'-10s'},{issuer:'https://other.example'},{audience:'https://other.example'}])assert.equal((await request('/api/admin/stats',{headers:{Authorization:'Bearer '+await token({},options)}})).status,401);
  const auth=await login();assert.equal((await request('/api/admin/session',{headers:auth})).status,200);
  assert.equal((await request('/api/admin/session',{headers:{Authorization:auth.Authorization+'tampered'}})).status,401);
  assert.equal((await request('/api/admin/stands/SAKURA3',{method:'PATCH',headers:{...auth,Origin:'https://other.example'},body:{name:'Stand Baru',owner:'',className:'',active:true}})).status,403);
});
test('auth proxy permits only the owner, strips role input, rewrites cookies, and rejects unsafe paths',async()=>{
  let forwarded;
  const authFetch=async(url,options)=>{forwarded={url:String(url),...options};return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':'__Secure-neon-auth.session_token=TEST_ONLY; Domain=auth.example; Path=/; Secure; HttpOnly; SameSite=None'}});};
  assert.equal((await request('/api/auth/sign-up/email',{method:'POST',body:{email:'other@example.com',password:'Test-only-long-password'}},{authFetch})).status,403);
  assert.equal(forwarded,undefined);
  const response=await request('/api/auth/sign-up/email',{method:'POST',body:{email:ADMIN_EMAIL,password:'Test-only-long-password',role:'admin',callbackURL:'https://evil.example'}},{authFetch});
  assert.equal(response.status,200);const body=JSON.parse(forwarded.body);assert.equal(body.role,undefined);assert.equal(body.callbackURL,undefined);assert.equal(body.email,ADMIN_EMAIL);
  const cookie=response.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Path=\/api\/auth/);assert.ok(!cookie.includes('Domain='));
  assert.equal((await request('/api/auth/admin/list-users',{method:'POST',body:{}},{authFetch})).status,404);
  assert.match(rewriteAuthCookie('__Host-token=value; Path=/; Secure',true),/Path=\/$/);
});
test('auth rate limiting refuses repeated attempts',async()=>{
  const authFetch=async()=>new Response(JSON.stringify({message:'Invalid credentials'}),{status:401});
  for(let i=0;i<12;i++)assert.equal((await request('/api/auth/sign-in/email',{method:'POST',body:{email:ADMIN_EMAIL,password:'wrong-password'}},{authFetch})).status,401);
  assert.equal((await request('/api/auth/sign-in/email',{method:'POST',body:{email:ADMIN_EMAIL,password:'wrong-password'}},{authFetch})).status,429);
});
test('canonical referrals have no leading zero and old invitation links normalize safely',async()=>{
  await add({standCode:'SAKURA03'});const row=await env.DB.prepare('SELECT stand_code FROM registrations').first();assert.equal(row.stand_code,'SAKURA3');
  const config=await(await request('/api/config')).json();assert.deepEqual(config.stands.map(s=>s.code),Array.from({length:10},(_,i)=>'SAKURA'+(i+1)));
});
test('check-in is idempotent, souvenir requires presence, and canceling presence clears souvenir',async()=>{await add();const auth=await login();const row=await env.DB.prepare('SELECT id FROM registrations').first();const path='/api/admin/participants/'+row.id;assert.equal((await request(path,{method:'PATCH',headers:auth,body:{souvenir:true}})).status,422);assert.equal((await request(path,{method:'PATCH',headers:auth,body:{present:true}})).status,200);const first=(await env.DB.prepare('SELECT checked_in_at FROM registrations').first()).checked_in_at;await request(path,{method:'PATCH',headers:auth,body:{present:true}});assert.equal((await env.DB.prepare('SELECT checked_in_at FROM registrations').first()).checked_in_at,first);await request(path,{method:'PATCH',headers:auth,body:{souvenir:true}});let stats=await(await request('/api/admin/stats',{headers:auth})).json();assert.equal(stats.summary.present,1);assert.equal(stats.stands[0].public_present,1);assert.equal(stats.stands[0].target_present,1);await request(path,{method:'PATCH',headers:auth,body:{present:false}});const reset=await env.DB.prepare('SELECT checked_in_at, souvenir_at FROM registrations').first();assert.equal(reset.checked_in_at,null);assert.equal(reset.souvenir_at,null);});
test('stand edits preserve code/history and public config hides inactive stands',async()=>{await add();const auth=await login();const response=await request('/api/admin/stands/SAKURA3',{method:'PATCH',headers:auth,body:{name:'Dapur Bunda Rei',owner:'Bunda Rei',className:'Kelas 4',active:false}});assert.equal(response.status,200);const config=await(await request('/api/config')).json();assert.equal(config.stands.length,9);const stats=await(await request('/api/admin/stats',{headers:auth})).json();const stand=stats.stands.find((s)=>s.code==='SAKURA3');assert.equal(stand.name,'Dapur Bunda Rei');assert.equal(stand.total,1);});
test('analytics count source independently and distinguish school families from public guests',async()=>{await add();await add({phone:'081234567891',standCode:'SAKURA4',relation:'parent',knownSchool:'no',contactConsent:true});const auth=await login();const rows=await env.DB.prepare('SELECT id FROM registrations').all();for(const row of rows.results)await request('/api/admin/participants/'+row.id,{method:'PATCH',headers:auth,body:{present:true}});const stats=await(await request('/api/admin/stats',{headers:auth})).json();assert.equal(stats.summary.present,2);assert.equal(stats.summary.publicPresent,1);assert.equal(stats.summary.contactConsent,1);assert.equal(stats.summary.newToSchool,1);assert.equal(stats.sources.length,2);});
test('search, pagination, export filters and spreadsheet formula escaping work',async()=>{await add({fullName:'=HYPERLINK dangerous',contactConsent:true});await add({phone:'081234567892',standCode:'SAKURA4',fullName:'Nama Lain'});const auth=await login();const listing=await(await request('/api/admin/participants?stand=SAKURA3&consent=yes',{headers:auth})).json();assert.equal(listing.total,1);assert.equal(listing.participants[0].stand_code,'SAKURA3');const empty=await(await request('/api/admin/participants?q='+encodeURIComponent('%_'),{headers:auth})).json();assert.equal(empty.total,0);const csv=await request('/api/admin/export?consent=yes',{headers:auth});assert.match(csv.headers.get('Content-Type'),/text\/csv/);const text=await csv.text();assert.ok(text.includes("'=HYPERLINK dangerous"));assert.ok(!text.includes('Nama Lain'));assert.ok(text.includes('Instagram'));assert.equal(csvCell('  +SUM(A1)'), '"\'  +SUM(A1)"');assert.equal(csvCell('a"b'),'"a""b"');});
test('unknown routes and public ticket lookup never expose personal records',async()=>{const ticket=await add();for(const path of['/api/tickets/'+ticket.code,'/api/unknown'])assert.equal((await request(path)).status,404);});
test('spreadsheet export includes every row beyond the 500-row database batch',async()=>{
  await env.DB.exec(`INSERT INTO registrations(id,ticket_code,full_name,phone,domicile,relation,child_stages,known_school,school_source,interest,privacy_consent,stand_code) SELECT md5(n::text)::uuid, 'TEST-'||n, 'Peserta uji '||n, '6289'||lpad(n::text,9,'0'), 'Contoh', 'public', '["tk"]'::jsonb, 'yes', 'instagram', 'yes', 1, 'SAKURA1' FROM generate_series(1,501) AS n`);
  const response=await request('/api/admin/export',{headers:await login()});assert.equal(response.status,200);
  const csv=await response.text();assert.equal(csv.split('\r\n').length,502);assert.ok(csv.includes('Peserta uji 501'));
});
