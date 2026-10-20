import { CHILD_STAGES, RELATIONS, SOURCES, INTERESTS, labelFor } from './shared.js';
import { api, escapeHTML as esc, qrSvg, download, toast, setupDialogs, formatDate } from './common.js';
const $=(selector)=>document.querySelector(selector);
let csrf='',stats=null,tab='overview',page=1,total=0,participants=[],loadId=0,sharedStand=null;
setupDialogs();
async function authorized(path,options={}) {
  try {return await api(path,{...options,headers:{...options.headers,...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{})}});}
  catch(error){if(error.status===401){showLogin();$('#login-error').textContent=error.message;$('#login-error').hidden=false;}throw error;}
}
function showLogin(){csrf='';stats=null;participants=[];document.querySelectorAll('dialog[open]').forEach((el)=>el.close());$('#dashboard-view').hidden=true;$('#login-view').hidden=false;$('#password').value='';$('#participants-body').replaceChildren();$('#participant-details').replaceChildren();}
function showError(error){$('#dashboard-error').textContent=error.message||'Koneksi terputus. Coba muat ulang.';$('#dashboard-error').hidden=false;}
async function showDashboard(){ $('#login-view').hidden=true;$('#dashboard-view').hidden=false;$('#password').value='';await refresh(); }
$('#login-form').addEventListener('submit',async(event)=>{
  event.preventDefault();const button=$('#login-button');button.disabled=true;button.textContent='Memeriksa akses…';$('#login-error').hidden=true;
  try{const data=await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});csrf=data.csrf;await showDashboard();}
  catch(error){$('#login-error').textContent=error.message||'Tidak dapat terhubung. Coba lagi.';$('#login-error').hidden=false;}
  finally{button.disabled=false;button.innerHTML='Masuk dashboard <span aria-hidden="true">↗</span>';}
});
$('#logout').addEventListener('click',async()=>{try{await authorized('/api/admin/logout',{method:'POST',body:'{}'});showLogin();toast('Berhasil keluar.');}catch(error){showError(error);}});

function changeTab(next){tab=next;document.querySelectorAll('.tab-panel').forEach((el)=>el.hidden=el.id!==`tab-${tab}`);document.querySelectorAll('[data-tab]').forEach((el)=>{el.classList.toggle('is-active',el.dataset.tab===tab);if(el.dataset.tab===tab)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#current-tab').textContent={overview:'Ringkasan',participants:'Daftar peserta',stands:'Stand & referral'}[tab];if(tab==='participants')loadParticipants().catch(showError);}
document.querySelectorAll('[data-tab],[data-go]').forEach((el)=>el.addEventListener('click',()=>changeTab(el.dataset.tab||el.dataset.go)));
async function refresh(){
  $('#dashboard-error').hidden=true;$('#refresh').disabled=true;
  try{stats=await authorized('/api/admin/stats');renderStats();renderStands();renderStandFilter();if(tab==='participants')await loadParticipants();$('#last-updated').textContent=`Diperbarui ${formatDate(new Date())}`;}
  catch(error){showError(error);}finally{$('#refresh').disabled=false;}
}
$('#refresh').addEventListener('click',refresh);

function renderStats(){
  const s=stats.summary;
  $('#stat-total').textContent=s.total;$('#stat-present').textContent=s.present;$('#stat-new').textContent=s.newToSchool;$('#stat-interested').textContent=s.interested;$('#stat-attendance-caption').textContent=`${s.publicPresent} tamu masyarakat umum`;
  $('#stat-consent-caption').textContent=`${s.contactConsent} peserta setuju dihubungi`;$('#target-families').textContent=s.targetFamilies;
  const max=Math.max(1,...stats.stands.map((st)=>st.total));
  $('#referral-chart').innerHTML=stats.stands.map((st)=>`<div class="chart-row"><span title="${esc(st.name)}">${esc(st.name)}</span><div class="chart-bars" role="img" aria-label="${esc(st.name)}: ${st.total} pendaftar, ${st.public_present} tamu umum hadir"><i data-width="${st.total/max*100}"></i><i data-width="${st.public_present/max*100}"></i></div><b>${st.public_present}<span class="sr-only"> tamu umum hadir</span></b></div>`).join('');
  $('#referral-chart').querySelectorAll('[data-width]').forEach((el)=>el.style.width=`${el.dataset.width}%`);
  const sourceMax=Math.max(1,...stats.sources.map((source)=>source.total));
  $('#source-chart').innerHTML=stats.sources.length?stats.sources.map((source)=>`<div class="source-row"><div><span>${esc(labelFor(SOURCES,source.value))}</span><strong>${source.total}</strong></div><div class="source-track"><i data-width="${source.total/sourceMax*100}"></i></div></div>`).join(''):'<p class="loading-text">Sumber informasi akan muncul setelah ada pendaftaran.</p>';
  $('#source-chart').querySelectorAll('[data-width]').forEach((el)=>el.style.width=`${el.dataset.width}%`);
}
function renderStands(){
  $('#stands-body').innerHTML=stats.stands.map((stand)=>`<tr><td><strong>${esc(stand.name)}</strong><small>${esc(stand.code)}${stand.class_name?` · ${esc(stand.class_name)}`:''}</small>${stand.owner?`<small>${esc(stand.owner)}</small>`:''}${!stand.active?'<span class="status-label is-off">Nonaktif</span>':''}</td><td>${stand.total}</td><td>${stand.present}</td><td>${stand.public_present}</td><td>${stand.target_present}</td><td><span class="status-label ${stand.public_present>=3&&stand.target_present>=1?'is-good':''}">${stand.public_present>=3&&stand.target_present>=1?'✓ Terpenuhi':'Belum'}</span></td><td><div class="stand-actions"><button class="row-button" data-edit="${stand.code}" type="button">Edit</button><button class="row-button" data-share="${stand.code}" type="button">Tautan / QR ↗</button></div></td></tr>`).join('');
}
function renderStandFilter(){const select=$('#filter-stand'),value=select.value;select.replaceChildren(new Option('Semua stand',''));[...stats.stands].sort((a,b)=>a.code.localeCompare(b.code)).forEach((s)=>select.add(new Option(s.name,s.code)));select.value=value;}
$('#stands-body').addEventListener('click',(event)=>{const edit=event.target.closest('[data-edit]'),share=event.target.closest('[data-share]');if(edit)editStand(edit.dataset.edit);if(share)shareStand(share.dataset.share);});
function editStand(code){const stand=stats.stands.find((s)=>s.code===code);if(!stand)return;$('#stand-dialog-title').textContent=code;$('#edit-code').value=code;$('#edit-name').value=stand.name;$('#edit-owner').value=stand.owner;$('#edit-class').value=stand.class_name;$('#edit-active').checked=!!stand.active;$('#stand-error').hidden=true;$('#stand-dialog').showModal();}
$('#stand-form').addEventListener('submit',async(event)=>{event.preventDefault();const button=$('#save-stand');button.disabled=true;$('#stand-error').hidden=true;try{await authorized(`/api/admin/stands/${$('#edit-code').value}`,{method:'PATCH',body:JSON.stringify({name:$('#edit-name').value,owner:$('#edit-owner').value,className:$('#edit-class').value,active:$('#edit-active').checked})});$('#stand-dialog').close();toast('Informasi stand diperbarui.');await refresh();}catch(error){$('#stand-error').textContent=error.message;$('#stand-error').hidden=false;}finally{button.disabled=false;}});
function shareStand(code){sharedStand=stats.stands.find((s)=>s.code===code);if(!sharedStand)return;$('#share-title').textContent=sharedStand.name;$('#share-code').textContent=code;$('#share-url').value=`${location.origin}/?ref=${encodeURIComponent(code)}`;$('#share-qr').innerHTML=qrSvg($('#share-url').value,190);$('#share-dialog').showModal();}
$('#copy-referral').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#share-url').value);toast('Tautan referral disalin.');}catch{$('#share-url').select();toast('Tekan salin pada tautan yang dipilih.');}});
$('#download-qr').addEventListener('click',()=>{if(!sharedStand)return;download(`QR-${sharedStand.code}.svg`,qrSvg($('#share-url').value,600),'image/svg+xml');toast('QR referral diunduh.');});

function participantParams(){const params=new URLSearchParams();for(const [key,id]of[['q','search'],['stand','filter-stand'],['status','filter-status'],['consent','filter-consent']]){if($( '#'+id).value)params.set(key,$('#'+id).value);}return params;}
async function loadParticipants(){
  const id=++loadId;const params=participantParams();params.set('page',page);$('#participants-count').textContent='Memuat peserta…';
  const data=await authorized(`/api/admin/participants?${params}`);if(id!==loadId)return;
  total=data.total;participants=data.participants;
  if(page>1&&!participants.length&&total){page=Math.ceil(total/data.perPage);return loadParticipants();}
  $('#participants-body').innerHTML=participants.map((p)=>`<tr><td><strong>${esc(p.full_name)}</strong><small>+${esc(p.phone)}</small><small class="ticket-label">${esc(p.ticket_code)}</small></td><td>${esc(p.stand_name)}<small>${esc(p.stand_code)}</small></td><td>${esc(labelFor(RELATIONS,p.relation).split(' / ')[0])}</td><td><button class="row-button ${p.checked_in_at?'is-present':''}" type="button" data-presence="${p.id}">${p.checked_in_at?'✓ Hadir · batalkan':'Tandai hadir'}</button></td><td><button class="row-button ${p.souvenir_at?'is-present':''}" type="button" data-souvenir="${p.id}" ${!p.checked_in_at?'disabled':''}>${p.souvenir_at?'✓ Diambil · batalkan':'Serahkan'}</button></td><td><button class="text-action" type="button" data-detail="${p.id}">Detail ↗</button></td></tr>`).join('');
  $('#participants-empty').hidden=participants.length>0;$('#participants-count').textContent=total?`${(page-1)*data.perPage+1}–${Math.min(page*data.perPage,total)} dari ${total} peserta`:'0 peserta';$('#page-label').textContent=page;$('#page-prev').disabled=page===1;$('#page-next').disabled=page*data.perPage>=total;
}
let searchTimer;
$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;loadParticipants().catch(showError);},300);});
['filter-stand','filter-status','filter-consent'].forEach((id)=>$('#'+id).addEventListener('change',()=>{page=1;loadParticipants().catch(showError);}));
$('#page-prev').addEventListener('click',()=>{if(page>1){page--;loadParticipants().catch(showError);}});$('#page-next').addEventListener('click',()=>{page++;loadParticipants().catch(showError);});
$('#participants-body').addEventListener('click',async(event)=>{
  const button=event.target.closest('button');if(!button)return;
  const detail=button.dataset.detail;if(detail){showDetails(detail);return;}
  const id=button.dataset.presence||button.dataset.souvenir,person=participants.find((p)=>p.id===id);if(!person)return;
  const body=button.dataset.presence?{present:!person.checked_in_at}:{souvenir:!person.souvenir_at};
  button.disabled=true;try{await authorized(`/api/admin/participants/${id}`,{method:'PATCH',body:JSON.stringify(body)});toast('Data peserta diperbarui.');await refresh();}catch(error){showError(error);button.disabled=false;}
});
function showDetails(id){
  const p=participants.find((p)=>p.id===id);if(!p)return;
  $('#participant-name').textContent=p.full_name;
  const rows=[['Kode bukti',p.ticket_code],['WhatsApp','+'+p.phone],['Domisili',p.domicile],['Hubungan',labelFor(RELATIONS,p.relation)],['Usia anak',p.child_stages.map((v)=>labelFor(CHILD_STAGES,v)).join(', ')],['Kenal SAKURA',p.known_school==='yes'?'Sudah pernah':'Baru mengetahui sekarang'],['Sumber sekolah',p.school_source==='other'?p.source_other:labelFor(SOURCES,p.school_source)],['Minat TK / SD',labelFor(INTERESTS,p.interest)],['Izin dihubungi PPDB',p.contact_consent?'Ya, bersedia':'Tidak memberikan persetujuan'],['Stand referral',`${p.stand_name} · ${p.stand_code}`],['Mendaftar',formatDate(p.created_at)],['Kehadiran',formatDate(p.checked_in_at)],['Souvenir',formatDate(p.souvenir_at)],['Versi persetujuan',p.consent_version]];
  $('#participant-details').innerHTML=rows.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('');$('#participant-dialog').showModal();
}
$('#export-csv').addEventListener('click',()=>{location.href=`/api/admin/export?${participantParams()}`;});
try{const session=await api('/api/admin/session');csrf=session.csrf;await showDashboard();}catch(error){showLogin();if(error.status===503){$('#login-error').textContent=error.message;$('#login-error').hidden=false;}}
