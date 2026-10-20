import { CHILD_STAGES, RELATIONS, SOURCES, INTERESTS, labelFor, normalizePhone, normalizeStandCode } from './shared.js';
import { api, escapeHTML as esc, qrSvg, download, toast, setupDialogs } from './common.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#registration-form');
let step = 0, config = null, currentTicket = null, submitting = false;
const stages = [ ['fullName','phone','domicile','relation','childStages'], ['knownSchool','schoolSource','sourceOther','interest'], ['standCode','privacyConsent'] ];
const rawReferral = new URLSearchParams(location.search).get('ref');
const referral = normalizeStandCode(rawReferral);

function fillOptions(id, options) { const select = $(id); options.forEach(([value,label])=>select.add(new Option(label,value))); }
fillOptions('#relation',RELATIONS); fillOptions('#schoolSource',SOURCES.filter(([key])=>key!=='first_time'));
$('#child-choices').innerHTML=CHILD_STAGES.map(([value,label])=>`<label class="choice"><input type="checkbox" name="childStages" value="${value}"><span>${esc(label)}</span></label>`).join('');
$('#interest-choices').innerHTML=INTERESTS.map(([value,label])=>`<label class="choice"><input type="radio" name="interest" value="${value}"><span>${esc(label)}</span></label>`).join('');
for (const name of ['fullName','phone','domicile','relation','schoolSource','sourceOther','standCode']) { const field = form.elements.namedItem(name); const error = $(`#error-${name}`); if(error)field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),`error-${name}`].filter(Boolean).join(' ')); }

function values() {
  const data = new FormData(form);
  return { fullName:(data.get('fullName')||'').trim(), phone:(data.get('phone')||'').trim(), domicile:(data.get('domicile')||'').trim(), relation:data.get('relation'), childStages:data.getAll('childStages'), knownSchool:data.get('knownSchool'), schoolSource:data.get('schoolSource'), sourceOther:(data.get('sourceOther')||'').trim(), interest:data.get('interest'), standCode:data.get('standCode'), privacyConsent:data.get('privacyConsent')==='on', contactConsent:data.get('contactConsent')==='on', website:data.get('website')||'' };
}
function clearErrors() {
  document.querySelectorAll('.field-error').forEach((el)=>el.textContent='');
  form.querySelectorAll('[aria-invalid]').forEach((el)=>el.removeAttribute('aria-invalid'));
  $('#form-error').hidden=true;
}
function showFieldErrors(fields, focus=true) {
  for (const [name,message] of Object.entries(fields)) {
    const error=$(`#error-${name}`); if(error)error.textContent=message;
    form.querySelectorAll(`[name="${name}"]`).forEach((el)=>el.setAttribute('aria-invalid','true'));
  }
  if(focus)form.querySelector('[aria-invalid="true"]')?.focus();
}
function validateCurrent() {
  clearErrors(); const data=values(), errors={};
  if(step===0){
    if(data.fullName.length<3)errors.fullName='Isi nama lengkap, minimal 3 karakter.';
    if(!normalizePhone(data.phone))errors.phone='Isi nomor WhatsApp Indonesia yang valid.';
    if(data.domicile.length<2)errors.domicile='Isi kelurahan atau kecamatan tempat tinggal.';
    if(!data.relation)errors.relation='Pilih hubungan dengan SAKURA.';
    if(!data.childStages.length)errors.childStages='Pilih kelompok usia anak atau “Belum memiliki anak”.';
  }
  if(step===1){
    if(!data.knownSchool)errors.knownSchool='Pilih salah satu jawaban.';
    if(data.knownSchool==='yes'&&!data.schoolSource)errors.schoolSource='Pilih sumber informasi sekolah.';
    if(data.knownSchool==='yes'&&data.schoolSource==='other'&&data.sourceOther.length<2)errors.sourceOther='Ceritakan sumber informasi secara singkat.';
    if(!data.interest)errors.interest='Pilih salah satu jawaban.';
  }
  if(step===2){
    if(!data.standCode)errors.standCode='Pilih stand bazar yang mengundang.';
    if(!data.privacyConsent)errors.privacyConsent='Persetujuan pendataan acara diperlukan untuk mendaftar.';
  }
  showFieldErrors(errors); return !Object.keys(errors).length;
}
function goTo(next, focus=true) {
  step=next;
  form.querySelectorAll('[data-step]').forEach((el)=>el.hidden=Number(el.dataset.step)!==step);
  document.querySelectorAll('.form-steps li').forEach((el,index)=>{el.classList.toggle('is-active',index===step);el.classList.toggle('is-complete',index<step);if(index===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  $('#previous-step').hidden=step===0; $('#next-step').hidden=step===2; $('#submit-button').hidden=step!==2; $('#step-caption').textContent=`Langkah ${step+1} dari 3`;
  if(step===2)updateReview();
  if(focus){const legend=form.querySelector(`[data-step="${step}"] legend`);legend.tabIndex=-1;legend.focus({preventScroll:true});$('.form-card').scrollIntoView({behavior:'smooth',block:'start'});}
}
function updateSource() {
  const data=values(); $('#source-field').hidden=data.knownSchool!=='yes'; $('#source-other-field').hidden=data.knownSchool!=='yes'||data.schoolSource!=='other';
}
function updateReferral() {
  const stand=config?.stands.find((s)=>s.code===$('#standCode').value);
  $('#referral-selected').hidden=!stand;
  $('#referral-name').textContent=stand ? `${stand.name}${stand.class_name ? ` · ${stand.class_name}` : ''}` : '';
}
function updateReview() {
  const data=values();
  const rows=[['Nama',data.fullName],['WhatsApp',normalizePhone(data.phone)?`+${normalizePhone(data.phone)}`:data.phone],['Domisili',data.domicile],['Hubungan',labelFor(RELATIONS,data.relation)],['Usia anak',data.childStages.map((v)=>labelFor(CHILD_STAGES,v)).join(', ')],['Kenal SAKURA',data.knownSchool==='yes'?'Sudah pernah':'Baru mengetahui sekarang'],['Sumber sekolah',data.knownSchool==='no'?'Halaman acara ini':data.schoolSource==='other'?data.sourceOther:labelFor(SOURCES,data.schoolSource)],['Minat TK / SD',labelFor(INTERESTS,data.interest)]];
  $('#review-details').innerHTML=rows.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join(''); updateReferral();
}

$('#next-step').addEventListener('click',()=>{if(validateCurrent())goTo(step+1);});
$('#previous-step').addEventListener('click',()=>{clearErrors();goTo(step-1);});
form.addEventListener('change',(event)=>{
  if(event.target.name==='childStages'&&event.target.checked){if(event.target.value==='none')form.querySelectorAll('[name="childStages"]:not([value="none"])').forEach((el)=>el.checked=false);else form.querySelector('[name="childStages"][value="none"]').checked=false;}
  if(['knownSchool','schoolSource'].includes(event.target.name))updateSource();
  if(event.target.name==='standCode')updateReferral();
});
form.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'&&step<2){event.preventDefault();$('#next-step').click();}});

async function loadConfig() {
  const notice=$('#config-notice');
  try {
    config=await api('/api/config');
    $('[data-venue]').textContent=config.event.venue;
    const select=$('#standCode'); select.replaceChildren(new Option('Pilih kode / nama stand',''));
    config.stands.forEach((stand)=>select.add(new Option(`${stand.code} · ${stand.name}${stand.class_name ? ` (${stand.class_name})` : ''}`,stand.code)));
    select.disabled=!config.registrationOpen;
    $('#submit-button').disabled=!config.registrationOpen;
    if(!config.registrationOpen){notice.textContent=config.ready?'Pendaftaran saat ini ditutup. Silakan hubungi panitia.':'Formulir belum dibuka. Silakan kembali setelah panitia menyiapkan pendaftaran.';notice.hidden=false;}
    else {notice.hidden=true;if(rawReferral){if(referral&&config.stands.some((s)=>s.code===referral)){select.value=referral;$('#referral-hint').textContent='Referral terisi dari tautan undangan. Pastikan nama stand sudah sesuai.';}else{notice.textContent='Kode referral pada tautan tidak ditemukan atau tidak aktif. Pilih stand yang mengundang pada tahap konfirmasi.';notice.hidden=false;}}}
    updateReferral();
  } catch {
    notice.replaceChildren(document.createTextNode('Daftar stand belum berhasil dimuat. Periksa koneksi, lalu '));
    const retry=document.createElement('button');retry.type='button';retry.className='inline-link';retry.textContent='coba lagi';retry.addEventListener('click',loadConfig);notice.append(retry);notice.hidden=false;$('#submit-button').disabled=true;
  }
}

form.addEventListener('submit',async(event)=>{
  event.preventDefault(); if(submitting)return;
  if(step!==2){if(validateCurrent())goTo(step+1);return;}
  if(!validateCurrent())return;
  if(!config?.registrationOpen){toast('Pendaftaran belum dibuka.');return;}
  submitting=true; const button=$('#submit-button');button.disabled=true;button.textContent='Mengirim pendaftaran…';button.setAttribute('aria-busy','true');
  try {
    const result=await api('/api/register',{method:'POST',body:JSON.stringify(values())});
    currentTicket={...result.ticket,event:result.event};
    try{sessionStorage.setItem('sakura-ticket',JSON.stringify(currentTicket));}catch{}
    $('#reopen-ticket').hidden=false; form.reset();goTo(0,false);updateSource();updateReferral();showTicket();
  } catch(error) {
    const first=Object.keys(error.fields||{})[0];const errorStep=stages.findIndex((names)=>names.includes(first));
    if(errorStep>=0)goTo(errorStep);
    showFieldErrors(error.fields||{});$('#form-error').textContent=error.message||'Koneksi terputus. Coba kembali saat internet stabil.';$('#form-error').hidden=false;
  } finally {submitting=false;button.disabled=!config?.registrationOpen;button.innerHTML='Daftar sekarang <span aria-hidden="true">↗</span>';button.removeAttribute('aria-busy');}
});

function showTicket() {
  if(!currentTicket)return;
  const ticket=currentTicket;
  $('#ticket-paper').innerHTML=`<span class="eyebrow">${esc(ticket.event.name)}</span><h3>${esc(ticket.event.title)}</h3><p class="ticket-name">${esc(ticket.fullName)}</p>${qrSvg(ticket.code)}<strong class="ticket-code">${esc(ticket.code)}</strong><p>${esc(ticket.event.date)}</p><p>${esc(ticket.event.venue)}</p><p class="ticket-ref">Undangan ${esc(ticket.standName)} · ${esc(ticket.standCode)}</p>`;
  $('#ticket-dialog').showModal();
}
$('#download-ticket').addEventListener('click',()=>{
  if(!currentTicket)return;const t=currentTicket;
  const nameLines=[];let line='';for(const word of t.fullName.split(/\s+/)){if((line+' '+word).length>32&&line){nameLines.push(line);line=word;}else line=line?`${line} ${word}`:word;}if(line)nameLines.push(line);
  // QR keeps the library viewBox so every generated module remains square.
  const nativeQr=qrSvg(t.code,190).replace('<svg ','<svg x="255" y="370" ');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="850" viewBox="0 0 700 850"><rect width="700" height="850" rx="24" fill="#faf9f4"/><rect x="30" y="30" width="640" height="790" rx="18" fill="none" stroke="#b8c7ad" stroke-dasharray="5 5"/><g text-anchor="middle" fill="#214f43" font-family="Arial,sans-serif"><text x="350" y="95" font-size="16" letter-spacing="3">SEKOLAH SAKURA</text><text x="350" y="145" font-size="30" font-family="Georgia,serif">${esc(t.event.name)}</text><text x="350" y="187" font-size="19">Ketika Ibu Juga Ingin Menangis</text><text x="350" y="235" font-size="13" letter-spacing="2">BUKTI PENDAFTARAN</text>${nameLines.slice(0,3).map((l,i)=>`<text x="350" y="${285+i*29}" font-size="22">${esc(l)}</text>`).join('')}<text x="350" y="598" font-size="19" letter-spacing="2">${esc(t.code)}</text><text x="350" y="648" font-size="20">${esc(t.event.date)}</text><text x="350" y="680" font-size="15">${esc(t.event.venue)}</text><text x="350" y="724" font-size="14">Referral: ${esc(t.standCode)}</text><text x="350" y="755" font-size="12">Tunjukkan bukti ini kepada panitia saat datang.</text></g>${nativeQr}</svg>`;
  download(`Bukti-SORGA-${t.code}.svg`,svg,'image/svg+xml');toast('Bukti pendaftaran berhasil diunduh.');
});
$('#print-ticket').addEventListener('click',()=>window.print());
$('#reopen-ticket').addEventListener('click',showTicket);
$('#privacy-open').addEventListener('click',()=>$('#privacy-dialog').showModal());
setupDialogs();
try{const saved=JSON.parse(sessionStorage.getItem('sakura-ticket'));if(saved?.code&&saved.event){currentTicket=saved;$('#reopen-ticket').hidden=false;}}catch{}
loadConfig();
