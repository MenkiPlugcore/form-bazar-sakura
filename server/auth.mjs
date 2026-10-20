import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './validation.mjs';
import { ADMIN_EMAIL } from '../public/assets/shared.js';
import { DEFAULT_AUTH_URL } from './deployment-config.mjs';

export const authUrlFor = (env) => (env.NEON_AUTH_BASE_URL || DEFAULT_AUTH_URL).replace(/\/$/,'');
const keySets = new Map();

export function createAdminVerifier({ baseURL, keySet }) {
  const origin = new URL(baseURL).origin;
  return async (request) => {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token || token.length > 16000) throw new ApiError(401,'Silakan masuk dengan akun admin.');
    let payload;
    try {
      ({payload} = await jwtVerify(token,keySet,{algorithms:['EdDSA'],issuer:origin,audience:origin,maxTokenAge:'15m',clockTolerance:5}));
    } catch { throw new ApiError(401,'Sesi berakhir. Silakan masuk kembali.'); }
    if (!payload.sub || payload.email?.toLowerCase() !== ADMIN_EMAIL || payload.emailVerified !== true || payload.banned === true) throw new ApiError(403,'Akses hanya untuk email admin yang telah diverifikasi.');
    return { id:payload.sub, email:ADMIN_EMAIL };
  };
}

export async function requireAdmin(request,env) {
  const baseURL = authUrlFor(env);
  if (!keySets.has(baseURL)) keySets.set(baseURL,createRemoteJWKSet(new URL(`${baseURL}/.well-known/jwks.json`),{timeoutDuration:8000,cooldownDuration:30000,cacheMaxAge:600000}));
  return createAdminVerifier({baseURL,keySet:keySets.get(baseURL)})(request);
}

export function rewriteAuthCookie(cookie,secure) {
  let rewritten = cookie.replace(/;\s*Domain=[^;]*/gi,'').replace(/;\s*Path=[^;]*/gi,'');
  rewritten = rewritten.replace(/;\s*SameSite=None/gi,'; SameSite=Lax');
  // __Secure- cookies need HTTPS. Local development never uses real admin credentials.
  if (secure && !/;\s*Secure(?:;|$)/i.test(rewritten)) rewritten += '; Secure';
  return `${rewritten}; Path=${cookie.startsWith('__Host-')?'/':'/api/auth'}`;
}

const readPaths = new Set(['get-session','token']);
const writePaths = new Set(['sign-up/email','sign-in/email','sign-out','email-otp/send-verification-otp','email-otp/verify-email','forget-password/email-otp','email-otp/reset-password']);

export async function proxyAuth(request,env,{readJson,sameOrigin,rateLimit,securityHeaders,fetcher=fetch}) {
  const url = new URL(request.url), path = url.pathname.slice('/api/auth/'.length).replace(/\/$/,'');
  if (!((request.method==='GET'&&readPaths.has(path))||(request.method==='POST'&&writePaths.has(path)))) throw new ApiError(404,'Halaman tidak ditemukan.');
  const upstream = new URL(`${authUrlFor(env)}/${path}`);
  const headers = new Headers({'Accept':'application/json','Origin':upstream.origin,'Referer':`${upstream.origin}/`});
  const cookie = request.headers.get('Cookie');
  if (cookie) headers.set('Cookie',cookie);
  let body;
  if (request.method==='POST') {
    sameOrigin(request);
    if (path!=='sign-out') await rateLimit(env,request,path==='sign-up/email'?'auth-setup':'auth-login',path==='sign-up/email'?4:12,900);
    let data = await readJson(request);
    if (path!=='sign-out' && String(data.email || '').trim().toLowerCase()!==ADMIN_EMAIL) throw new ApiError(403,'Email ini tidak terdaftar sebagai admin.');
    if (path!=='sign-out') data.email=ADMIN_EMAIL;
    const allowed={
      'sign-up/email':['email','password','name'], 'sign-in/email':['email','password','rememberMe'],
      'sign-out':[], 'email-otp/send-verification-otp':['email','type'],
      'email-otp/verify-email':['email','otp'], 'forget-password/email-otp':['email'],
      'email-otp/reset-password':['email','otp','password'],
    }[path];
    data=Object.fromEntries(Object.entries(data).filter(([key])=>allowed.includes(key)));
    if(path==='email-otp/send-verification-otp'&&data.type!=='email-verification')throw new ApiError(422,'Jenis kode tidak sesuai.');
    if(path==='sign-in/email'&&(typeof data.password!=='string'||!data.password.length||data.password.length>128))throw new ApiError(422,'Isi kata sandi admin.');
    if (path==='sign-up/email' || path==='email-otp/reset-password') {
      if (typeof data.password!=='string'||data.password.length<12||data.password.length>128) throw new ApiError(422,'Gunakan kata sandi 12–128 karakter.');
    }
    if (path==='sign-up/email') data.name='Admin SAKURA';
    // No caller-controlled redirect URLs or arbitrary provider plugins.
    delete data.callbackURL; delete data.redirectTo; delete data.fetchOptions;
    body=JSON.stringify(data);headers.set('Content-Type','application/json');
  }
  const response=await fetcher(upstream,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status>=300&&response.status<400)throw new ApiError(502,'Layanan login tidak dapat menyelesaikan permintaan.');
  const outputHeaders=new Headers({...securityHeaders,'Content-Type':'application/json; charset=utf-8'});
  const cookies=response.headers.getSetCookie?.() || (response.headers.get('Set-Cookie')||'').split(/,(?=\s*[^;,]+=)/).filter(Boolean);
  for(const item of cookies)outputHeaders.append('Set-Cookie',rewriteAuthCookie(item,url.protocol==='https:'));
  return new Response(response.body,{status:response.status,headers:outputHeaders});
}
