import { EVENT, CHILD_STAGES, RELATIONS, SOURCES, INTERESTS, labelFor } from '../public/assets/shared.js';
import { ApiError, validateRegistration, validateStand } from './validation.mjs';

const encoder = new TextEncoder();
const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE = 'sakura_session';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const bytesToBase64 = (data) => btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const base64ToBytes = (v) => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const now = () => Math.floor(Date.now() / 1000);

async function digest(value) { return bytesToBase64(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function equal(a, b) {
  const aa = await crypto.subtle.digest('SHA-256', encoder.encode(a));
  const bb = await crypto.subtle.digest('SHA-256', encoder.encode(b));
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(aa, bb) : new Uint8Array(aa).reduce((acc, v, i) => acc | (v ^ new Uint8Array(bb)[i]), 0) === 0;
}
function authConfigured(env) { return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 16 && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32; }
function requireDatabase(env) { if (!env.DB) throw new ApiError(503, 'Pendaftaran belum siap. Silakan hubungi panitia atau coba lagi nanti.'); }
function requireAuthConfig(env) { if (!authConfigured(env)) throw new ApiError(503, 'Akses panitia belum dikonfigurasi. Hubungi pengelola website.'); }
async function sessionKey(env) { return crypto.subtle.importKey('raw', encoder.encode(`${env.SESSION_SECRET}:${env.ADMIN_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function signSession(env, payload) {
  const body = bytesToBase64(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64(await crypto.subtle.sign('HMAC', await sessionKey(env), encoder.encode(body)));
  return `${body}.${signature}`;
}
async function requireSession(request, env) {
  requireAuthConfig(env);
  const cookie = request.headers.get('Cookie')?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  try {
    if (!cookie || cookie.length > 2048) throw new Error();
    const [body, signature, extra] = cookie.split('.');
    if (extra || !body || !signature || !await crypto.subtle.verify('HMAC', await sessionKey(env), base64ToBytes(signature), encoder.encode(body))) throw new Error();
    const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(body)));
    if (payload.exp <= now() || typeof payload.csrf !== 'string') throw new Error();
    return payload;
  } catch { throw new ApiError(401, 'Sesi berakhir. Silakan masuk kembali.'); }
}
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new ApiError(403, 'Permintaan tidak diizinkan. Muat ulang halaman.');
}
async function adminMutation(request, env) {
  sameOrigin(request);
  const session = await requireSession(request, env);
  if (!await equal(request.headers.get('X-CSRF-Token') || '', session.csrf)) throw new ApiError(403, 'Sesi tidak sesuai. Muat ulang halaman.');
  return session;
}
async function readJson(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new ApiError(415, 'Format permintaan harus JSON.');
  // Stream with a bound even when Content-Length is absent or false.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Data pendaftaran belum lengkap.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw new ApiError(413, 'Data terlalu panjang.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new ApiError(400, 'Data tidak dapat dibaca.'); }
}
async function rateLimit(env, request, scope, limit, period) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const bucket = Math.floor(now() / period);
  const key = await digest(`${env.SESSION_SECRET || env.RATE_LIMIT_SALT || 'sakura-event'}:${scope}:${ip}:${bucket}`);
  const row = await env.DB.prepare('INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits').bind(key, (bucket + 1) * period).first();
  if (row.hits > limit) throw new ApiError(429, 'Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba lagi.');
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now() - 3600).run();
}
function cookieHeader(request, value, maxAge) { return `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`; }

async function register(request, env) {
  sameOrigin(request); requireDatabase(env);
  await rateLimit(env, request, 'registration', 15, 3600);
  const input = await readJson(request);
  if (input.website) throw new ApiError(422, 'Pendaftaran tidak dapat diproses.');
  if (env.REGISTRATION_OPEN === 'false') throw new ApiError(409, 'Pendaftaran saat ini ditutup. Silakan hubungi panitia.');
  const data = validateRegistration(input);
  const stand = await env.DB.prepare('SELECT code, name, active FROM stands WHERE code = ?').bind(data.standCode).first();
  if (!stand || !stand.active) throw new ApiError(422, 'Kode referral tidak aktif. Minta kode yang benar kepada pemilik stand.', { standCode: 'Pilih stand yang masih aktif.' });
  const id = crypto.randomUUID();
  // 60 random bits; never expose participant records through public ticket lookup.
  const ticketCode = `SG-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (v) => v.toString(16).padStart(2, '0')).join('').slice(0, 15).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO registrations (id, ticket_code, full_name, phone, domicile, relation, child_stages, known_school, school_source, source_other, interest, contact_consent, privacy_consent, stand_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, ticketCode, data.fullName, data.phone, data.domicile, data.relation, JSON.stringify(data.childStages), data.knownSchool, data.schoolSource, data.sourceOther, data.interest, data.contactConsent ? 1 : 0, data.standCode, createdAt).run();
  } catch (error) {
    if (String(error.message).includes('registrations.phone')) throw new ApiError(409, 'Nomor WhatsApp ini sudah terdaftar. Periksa bukti pendaftaran sebelumnya atau hubungi panitia saat datang.', { phone: 'Nomor WhatsApp sudah terdaftar.' });
    throw error;
  }
  return json({ ticket: { code: ticketCode, fullName: data.fullName, standCode: stand.code, standName: stand.name, createdAt }, event: eventFor(env) }, 201);
}
function eventFor(env) { return { ...EVENT, venue: env.EVENT_VENUE || EVENT.venue }; }

async function getConfig(env) {
  let stands = [], ready = false;
  if (env.DB) {
    try { stands = (await env.DB.prepare('SELECT code, name, class_name FROM stands WHERE active = 1 ORDER BY code').all()).results; ready = true; }
    catch { /* A missing migration keeps registration closed; no fake submissions. */ }
  }
  return json({ event: eventFor(env), stands, ready, registrationOpen: ready && env.REGISTRATION_OPEN !== 'false' });
}

async function getStats(env) {
  const [summary, stands, sources, interests] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(checked_in_at IS NOT NULL), 0) AS present, COALESCE(SUM(relation = 'public'), 0) AS publicGuests, COALESCE(SUM(relation = 'public' AND checked_in_at IS NOT NULL), 0) AS publicPresent, COALESCE(SUM(known_school = 'no'), 0) AS newToSchool, COALESCE(SUM(contact_consent = 1), 0) AS contactConsent, COALESCE(SUM(interest = 'yes'), 0) AS interested, COALESCE(SUM(child_stages LIKE '%"preschool"%' OR child_stages LIKE '%"tk"%' OR child_stages LIKE '%"sd"%'), 0) AS targetFamilies FROM registrations`).first(),
    env.DB.prepare(`SELECT s.code, s.name, s.owner, s.class_name, s.active, COUNT(r.id) AS total, COALESCE(SUM(r.checked_in_at IS NOT NULL), 0) AS present, COALESCE(SUM(r.relation = 'public' AND r.checked_in_at IS NOT NULL), 0) AS public_present, COALESCE(SUM(r.relation = 'public' AND r.checked_in_at IS NOT NULL AND (r.child_stages LIKE '%"preschool"%' OR r.child_stages LIKE '%"tk"%' OR r.child_stages LIKE '%"sd"%')), 0) AS target_present FROM stands s LEFT JOIN registrations r ON r.stand_code = s.code GROUP BY s.code ORDER BY public_present DESC, present DESC, s.code ASC`).all(),
    env.DB.prepare('SELECT school_source AS value, COUNT(*) AS total FROM registrations GROUP BY school_source ORDER BY total DESC').all(),
    env.DB.prepare('SELECT interest AS value, COUNT(*) AS total FROM registrations GROUP BY interest ORDER BY total DESC').all(),
  ]);
  return json({ summary, stands: stands.results, sources: sources.results, interests: interests.results });
}
function filters(url) {
  const where = [], values = [];
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const stand = url.searchParams.get('stand');
  const status = url.searchParams.get('status');
  const consent = url.searchParams.get('consent');
  if (q) { where.push('(r.full_name LIKE ? ESCAPE \'!\' OR r.phone LIKE ? ESCAPE \'!\' OR r.ticket_code LIKE ? ESCAPE \'!\')'); const pattern = `%${q.replace(/[!%_]/g, '!$&')}%`; values.push(pattern, pattern, pattern); }
  if (stand) { where.push('r.stand_code = ?'); values.push(stand); }
  if (status === 'present') where.push('r.checked_in_at IS NOT NULL');
  if (status === 'absent') where.push('r.checked_in_at IS NULL');
  if (consent === 'yes') where.push('r.contact_consent = 1');
  return { clause: where.length ? ` WHERE ${where.join(' AND ')}` : '', values };
}
async function getParticipants(env, url) {
  const { clause, values } = filters(url);
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page'), 10) || 1));
  const perPage = 25;
  const [count, result] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM registrations r${clause}`).bind(...values).first(),
    env.DB.prepare(`SELECT r.*, s.name AS stand_name FROM registrations r JOIN stands s ON r.stand_code = s.code${clause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage).all(),
  ]);
  return json({ total: count.total, page, perPage, participants: result.results.map((r) => ({...r, child_stages: JSON.parse(r.child_stages)})) });
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
async function exportCsv(env, url) {
  const { clause, values } = filters(url);
  // Keyset batches avoid silently truncating exports and limit each D1 response.
  const columns = ['Kode Tiket','Nama','WhatsApp','Domisili','Hubungan SAKURA','Usia Anak','Sudah Mengenal SAKURA','Sumber Informasi Sekolah','Sumber Lainnya','Minat Informasi TK/SD','Izin Dihubungi PPDB','Kode Stand','Nama Stand','Waktu Daftar','Waktu Hadir','Souvenir Diambil','Versi Persetujuan'];
  const rows = [columns.map(csvCell).join(',')];
  let cursor = '';
  while (true) {
    const extra = `${clause}${clause ? ' AND ' : ' WHERE '}r.id > ?`;
    const result = await env.DB.prepare(`SELECT r.*, s.name AS stand_name FROM registrations r JOIN stands s ON r.stand_code = s.code${extra} ORDER BY r.id ASC LIMIT 500`).bind(...values, cursor).all();
    for (const r of result.results) rows.push([r.ticket_code, r.full_name, `'${r.phone}`, r.domicile, labelFor(RELATIONS,r.relation), JSON.parse(r.child_stages).map((s)=>labelFor(CHILD_STAGES,s)).join('; '), r.known_school === 'yes' ? 'Ya' : 'Belum', labelFor(SOURCES,r.school_source), r.source_other, labelFor(INTERESTS,r.interest), r.contact_consent ? 'Ya' : 'Tidak', r.stand_code, r.stand_name, r.created_at, r.checked_in_at, r.souvenir_at, r.consent_version].map(csvCell).join(','));
    if (result.results.length < 500) break;
    cursor = result.results.at(-1).id;
  }
  return new Response(`\uFEFF${rows.join('\r\n')}`, { headers: {...headers, 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="peserta-sorga-sakura.csv"'} });
}

async function updateParticipant(request, env, id) {
  const input = await readJson(request);
  if (typeof input.present !== 'boolean' && typeof input.souvenir !== 'boolean') throw new ApiError(422, 'Pilih perubahan kehadiran atau souvenir.');
  const row = await env.DB.prepare('SELECT id, checked_in_at, souvenir_at FROM registrations WHERE id = ?').bind(id).first();
  if (!row) throw new ApiError(404, 'Peserta tidak ditemukan.');
  let present = row.checked_in_at, souvenir = row.souvenir_at;
  if (typeof input.present === 'boolean') {
    present = input.present ? present || new Date().toISOString() : null;
    if (!input.present) souvenir = null;
  }
  if (typeof input.souvenir === 'boolean') {
    if (input.souvenir && !present) throw new ApiError(422, 'Tandai peserta hadir sebelum menyerahkan souvenir.');
    souvenir = input.souvenir ? souvenir || new Date().toISOString() : null;
  }
  await env.DB.prepare('UPDATE registrations SET checked_in_at = ?, souvenir_at = ? WHERE id = ?').bind(present, souvenir, id).run();
  return json({ ok:true, checkedInAt:present, souvenirAt:souvenir });
}

export async function handleRequest(request, env) {
  try {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, ''), method = request.method;
    if (path === '/api/config' && method === 'GET') return getConfig(env);
    if (path === '/api/register' && method === 'POST') return await register(request, env);
    if (!path.startsWith('/api/admin/')) throw new ApiError(404, 'Halaman tidak ditemukan.');
    requireAuthConfig(env); requireDatabase(env);
    if (path === '/api/admin/login' && method === 'POST') {
      sameOrigin(request);
      await rateLimit(env, request, 'login', 6, 900);
      const input = await readJson(request);
      if (typeof input.password !== 'string' || !await equal(input.password, env.ADMIN_PASSWORD)) throw new ApiError(401, 'Kata sandi tidak sesuai.');
      const session = { exp: now() + SESSION_SECONDS, csrf: crypto.randomUUID() };
      return json({ ok:true, csrf:session.csrf }, 200, {'Set-Cookie':cookieHeader(request, await signSession(env, session), SESSION_SECONDS)});
    }
    if (method === 'GET') {
      const session = await requireSession(request, env);
      if (path === '/api/admin/session') return json({ ok:true, csrf:session.csrf });
      if (path === '/api/admin/stats') return await getStats(env);
      if (path === '/api/admin/participants') return await getParticipants(env,url);
      if (path === '/api/admin/export') return await exportCsv(env,url);
    }
    if (['POST','PATCH'].includes(method)) {
      await adminMutation(request,env);
      if (path === '/api/admin/logout' && method === 'POST') return json({ok:true},200,{'Set-Cookie':cookieHeader(request,'',0)});
      const standMatch = path.match(/^\/api\/admin\/stands\/(SAKURA(?:0[1-9]|10))$/);
      if (standMatch && method === 'PATCH') {
        const data = validateStand(await readJson(request));
        await env.DB.prepare('UPDATE stands SET name = ?, owner = ?, class_name = ?, active = ? WHERE code = ?').bind(data.name,data.owner,data.className,data.active,standMatch[1]).run();
        return json({ok:true});
      }
      const personMatch = path.match(/^\/api\/admin\/participants\/([a-f0-9-]{36})$/);
      if (personMatch && method === 'PATCH') return await updateParticipant(request,env,personMatch[1]);
    }
    throw new ApiError(404, 'Halaman tidak ditemukan.');
  } catch (error) {
    if (error instanceof ApiError) return json({ error:error.message, fields:error.fields },error.status, error.status===429 ? {'Retry-After':'900'} : {});
    // No names, phone numbers, credentials, SQL values, or request bodies in logs.
    console.error('SAKURA API: request failed');
    return json({error:'Layanan sedang bermasalah. Silakan coba lagi atau hubungi panitia.'},503);
  }
}
