import { CHILD_STAGES, INTERESTS, RELATIONS, SOURCES, normalizePhone, normalizeStandCode } from '../public/assets/shared.js';

export class ApiError extends Error {
  constructor(status, message, fields = {}) { super(message); this.status = status; this.fields = fields; }
}
const clean = (v, max) => typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max + 1) : '';
const includes = (options, value) => options.some(([key]) => key === value);

export function validateRegistration(input) {
  const fields = {};
  const fullName = clean(input.fullName, 80);
  const domicile = clean(input.domicile, 120);
  const phone = normalizePhone(input.phone);
  const standCode = normalizeStandCode(input.standCode);
  const sourceOther = clean(input.sourceOther, 160);
  const childStages = Array.isArray(input.childStages) ? [...new Set(input.childStages)] : [];
  if (fullName.length < 3 || fullName.length > 80) fields.fullName = 'Isi nama lengkap, 3–80 karakter.';
  if (!phone) fields.phone = 'Gunakan nomor WhatsApp Indonesia yang valid, misalnya 081234567890.';
  if (domicile.length < 2 || domicile.length > 120) fields.domicile = 'Isi kelurahan atau kecamatan, maksimal 120 karakter.';
  if (!includes(RELATIONS, input.relation)) fields.relation = 'Pilih hubungan Ayah/Bunda dengan SAKURA.';
  if (!childStages.length || childStages.some((v) => !includes(CHILD_STAGES, v)) || (childStages.includes('none') && childStages.length > 1)) fields.childStages = 'Pilih kelompok usia anak, atau “Belum memiliki anak”.';
  if (!['yes', 'no'].includes(input.knownSchool)) fields.knownSchool = 'Pilih apakah sudah pernah mendengar SAKURA.';
  const schoolSource = input.knownSchool === 'no' ? 'first_time' : input.schoolSource;
  if (!includes(SOURCES, schoolSource)) fields.schoolSource = 'Pilih sumber informasi tentang sekolah.';
  if (schoolSource === 'other' && (sourceOther.length < 2 || sourceOther.length > 160)) fields.sourceOther = 'Ceritakan sumber informasinya, 2–160 karakter.';
  if (!includes(INTERESTS, input.interest)) fields.interest = 'Pilih ketertarikan pada informasi sekolah.';
  if (!standCode) fields.standCode = 'Pilih kode referral dari stand yang mengundang.';
  if (input.privacyConsent !== true) fields.privacyConsent = 'Persetujuan pendataan acara diperlukan untuk mendaftar.';
  if (input.contactConsent !== undefined && typeof input.contactConsent !== 'boolean') fields.contactConsent = 'Pilihan persetujuan tidak valid.';
  if (Object.keys(fields).length) throw new ApiError(422, 'Periksa kembali bagian yang ditandai.', fields);
  return { fullName, phone, domicile, relation: input.relation, childStages, knownSchool: input.knownSchool, schoolSource, sourceOther: schoolSource === 'other' ? sourceOther : '', interest: input.interest, standCode, contactConsent: input.contactConsent === true };
}

export function validateStand(input) {
  const name = clean(input.name, 70), owner = clean(input.owner, 80), className = clean(input.className, 60);
  if (name.length < 2 || name.length > 70 || owner.length > 80 || className.length > 60 || typeof input.active !== 'boolean') throw new ApiError(422, 'Periksa nama stand (2–70 karakter), pemilik (maksimal 80), dan kelas (maksimal 60).');
  return { name, owner, className, active: input.active ? 1 : 0 };
}
