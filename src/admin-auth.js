import './uuid-compat.js';
import { createAuthClient } from '@neondatabase/auth';
import { ADMIN_EMAIL } from '../public/assets/shared.js';

// Same-origin proxy keeps provider session cookies first-party, including on mobile Safari.
const auth=createAuthClient(new URL('/api/auth',location.origin).href);
let accessToken=null,refreshAt=0;
function failure(result) {
  if(!result.error)return result.data;
  const messages={USER_ALREADY_EXISTS:'Akun admin sudah dibuat. Silakan masuk atau gunakan lupa kata sandi.',USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:'Akun admin sudah dibuat. Silakan masuk atau gunakan lupa kata sandi.',INVALID_EMAIL_OR_PASSWORD:'Email atau kata sandi tidak sesuai.',INVALID_OTP:'Kode verifikasi tidak sesuai atau sudah kedaluwarsa.',OTP_EXPIRED:'Kode sudah kedaluwarsa. Minta kode baru.',TOO_MANY_ATTEMPTS:'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.',EMAIL_NOT_VERIFIED:'Verifikasi email admin terlebih dahulu.'};
  const providerMessage=result.error.message||'';
  const error=new Error(messages[result.error.code]||(/^HTTP \d{3}/.test(providerMessage)?'Layanan akun sedang tidak terhubung. Coba lagi beberapa saat.':providerMessage)||'Layanan login tidak dapat dihubungi.');error.code=result.error.code;throw error;
}
function validatePassword(password) {if(password.length<12||password.length>128)throw new Error('Gunakan kata sandi 12–128 karakter. Frasa panjang lebih mudah diingat.');}
export async function signInOwner(password) {accessToken=null;return failure(await auth.signIn.email({email:ADMIN_EMAIL,password}));}
export async function activateOwner(password) {
  validatePassword(password);
  failure(await auth.signUp.email({email:ADMIN_EMAIL,password,name:'Admin SAKURA'}));
  return sendOwnerOtp();
}
export async function sendOwnerOtp(){return failure(await auth.emailOtp.sendVerificationOtp({email:ADMIN_EMAIL,type:'email-verification'}));}
export async function verifyOwnerEmail(otp){failure(await auth.emailOtp.verifyEmail({email:ADMIN_EMAIL,otp}));await signOutOwner();}
export async function requestPasswordReset(){return failure(await auth.forgetPassword.emailOtp({email:ADMIN_EMAIL}));}
export async function resetOwnerPassword(otp,password){validatePassword(password);failure(await auth.emailOtp.resetPassword({email:ADMIN_EMAIL,otp,password}));await signOutOwner();}
export async function signOutOwner(){try{failure(await auth.signOut());}finally{accessToken=null;refreshAt=0;}}
export async function restoreOwnerSession(){const session=failure(await auth.getSession());return session?.user||null;}
export async function getAdminToken(force=false){
  if(accessToken&&!force&&Date.now()<refreshAt)return accessToken;
  const data=failure(await auth.token());
  if(!data?.token){const error=new Error('Silakan masuk dengan akun admin.');error.status=401;throw error;}
  accessToken=data.token;refreshAt=Date.now()+10*60*1000;return accessToken;
}
