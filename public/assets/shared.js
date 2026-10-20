export const ADMIN_EMAIL = 'menkiestes@gmail.com';
export const INSTAGRAM_ACCOUNTS = ['tk_shibghahakhlakquran','sds_shibghahakhlakquran'];
export function normalizeStandCode(value) {
  const match=String(value||'').trim().toUpperCase().match(/^SAKURA(?:0([1-9])|([1-9]|10))$/);
  return match ? `SAKURA${match[1]||match[2]}` : null;
}
export const EVENT = Object.freeze({
  name: 'Parenting SORGA Akbar',
  title: 'Ketika Ibu Juga Ingin Menangis',
  date: 'Ahad, 8 November 2026',
  shortDate: '8 November 2026',
  bazaarTime: '07.00–12.30 WIB',
  mainTime: '09.00–10.30 WIB',
  venue: 'Area Sekolah SAKURA',
  school: 'Sekolah Shibghah Akhlak Quran',
});
export const CHILD_STAGES = [
  ['preschool', 'Usia prasekolah (0–3 tahun)'],
  ['tk', 'Usia TK (4–6 tahun)'],
  ['sd', 'Usia SD (7–12 tahun)'],
  ['older', 'Di atas 12 tahun'],
  ['none', 'Belum memiliki anak'],
];
export const RELATIONS = [
  ['public', 'Masyarakat umum / belum menjadi keluarga SAKURA'],
  ['parent', 'Wali murid SAKURA'],
  ['alumni', 'Keluarga alumni SAKURA'],
  ['staff', 'Guru / karyawan SAKURA'],
];
export const SOURCES = [
  ['instagram', 'Instagram / media sosial'],
  ['whatsapp', 'WhatsApp / grup komunitas'],
  ['friends', 'Teman / keluarga / tetangga'],
  ['parent', 'Wali murid SAKURA'],
  ['stand', 'Pemilik stand bazar'],
  ['event', 'Kegiatan / acara sekolah'],
  ['passing', 'Melihat sekolah secara langsung'],
  ['first_time', 'Baru tahu melalui halaman ini'],
  ['other', 'Lainnya'],
];
export const INTERESTS = [['yes', 'Ya, saya tertarik'], ['maybe', 'Mungkin nanti'], ['no', 'Belum tertarik']];
export const labelFor = (options, value) => options.find(([key]) => key === value)?.[1] || value || '—';
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizePhone(value) {
  let phone = String(value ?? '').replace(/[\s()+.\-]/g, '');
  if (phone.startsWith('0')) phone = `62${phone.slice(1)}`;
  else if (phone.startsWith('8')) phone = `62${phone}`;
  return /^628\d{7,11}$/.test(phone) ? phone : null;
}
