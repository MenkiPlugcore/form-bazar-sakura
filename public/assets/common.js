export { escapeHTML } from './shared.js';
export async function api(path, options = {}) {
  const response = await fetch(path, { credentials:'same-origin', ...options, headers:{ ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers } });
  const data = await response.json().catch(() => ({error:'Layanan tidak dapat dibaca. Coba muat ulang halaman.'}));
  if (!response.ok) { const error = new Error(data.error || 'Permintaan gagal.'); error.status = response.status; error.fields = data.fields || {}; throw error; }
  return data;
}
export function qrSvg(value, size = 180) {
  if (!window.qrcode) return '';
  const qr = window.qrcode(0,'M'); qr.addData(value); qr.make();
  return qr.createSvgTag({ cellSize:4, margin:16, scalable:true }).replace('<svg ', `<svg role="img" aria-label="Kode QR" width="${size}" height="${size}" `);
}
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),10000);
}
let toastTimer;
export function toast(message) {
  const element = document.querySelector('#toast');
  if (!element) return;
  element.textContent=message; element.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{element.hidden=true;},4500);
}
export function setupDialogs() {
  document.querySelectorAll('[data-close]').forEach((button)=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((dialog)=>dialog.addEventListener('click',(event)=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
}
export const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value))+' WIB' : '—';
