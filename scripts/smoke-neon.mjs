// Manual integration check. Run only against a dedicated test branch: writes one test participant.
// Reads connection configuration from stdin so credentials never enter command arguments or logs.
import assert from 'node:assert/strict';
import { handleRequest } from '../server/api.mjs';
import { createInterface } from 'node:readline';
const reader=createInterface({input:process.stdin});
const input=await new Promise(resolve=>reader.once('line',resolve));reader.close();
const env=JSON.parse(input);
console.log('Konfigurasi diterima; memeriksa API pada branch pengujian.');
const base='https://sakura-test.example';
const body={fullName:'Peserta Uji Integrasi Neon',phone:'081200001234',domicile:'Kecamatan Contoh',relation:'public',childStages:['tk'],knownSchool:'yes',schoolSource:'instagram',interest:'yes',standCode:'SAKURA3',privacyConsent:true,contactConsent:false};
const request=new Request(base+'/api/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
const response=await handleRequest(request,env);assert.equal(response.status,201,'Registration must succeed on test branch.');
const result=await response.json();assert.equal(result.ticket.standCode,'SAKURA3');
const stats=await handleRequest(new Request(base+'/api/admin/stats'),env,{verifyAdmin:async()=>({id:'test-only',email:'menkiestes@gmail.com'})});
assert.equal(stats.status,200);const report=await stats.json();assert.ok(report.summary.total>=1);
console.log('PASS: registrasi API tersimpan di Neon, referral SAKURA3 benar, dan rekap terbaca.');
