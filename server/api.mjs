import { EVENT, CHILD_STAGES, RELATIONS, SOURCES, INTERESTS, ADMIN_EMAIL, labelFor, eventLocation } from '../public/assets/shared.js';
import { ApiError, validateRegistration, validateStand } from './validation.mjs';
import { databaseFor } from './database.mjs';
import { requireAdmin, proxyAuth } from './auth.mjs';

const encoder = new TextEncoder();
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const now = () => Math.floor(Date.now() / 1000);
const stagesFor = (value) => Array.isArray(value) ? value : JSON.parse(value);
function requireDatabase(env) { if (!env.DB) throw new ApiError(503, 'Pendaftaran belum siap. Silakan hubungi panitia atau coba lagi nanti.'); }
async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join(''); }

function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new ApiError(403, 'Permintaan tidak diizinkan. Muat ulang halaman.');
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
  const key = await digest(`${env.SESSION_SECRET || env.DATABASE_URL || 'sakura-local-development'}:${scope}:${ip}:${bucket}`);
  const row = await env.DB.prepare('INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = rate_limits.hits + 1 RETURNING hits').bind(key, (bucket + 1) * period).first();
  if (row.hits > limit) throw new ApiError(429, 'Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba lagi.');
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now() - 3600).run();
}


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
    if (String(error.message).includes('registrations_phone_key')) throw new ApiError(409, 'Nomor WhatsApp ini sudah terdaftar. Periksa bukti pendaftaran sebelumnya atau hubungi panitia saat datang.', { phone: 'Nomor WhatsApp sudah terdaftar.' });
    throw error;
  }
  return json({ ticket: { code: ticketCode, fullName: data.fullName, standCode: stand.code, standName: stand.name, createdAt }, event: eventFor(env) }, 201);
}
function eventFor(env) { return { ...EVENT, ...eventLocation(env.EVENT_VENUE, env.EVENT_MAPS_URL) }; }

async function getConfig(env) {
  let stands = [], ready = false;
  if (env.DB) {
    try { stands = (await env.DB.prepare('SELECT code, name, class_name FROM stands WHERE active = 1 ORDER BY position').all()).results; ready = true; }
    catch { /* A missing migration keeps registration closed; no fake submissions. */ }
  }
  return json({ event: eventFor(env), stands, ready, registrationOpen: ready && env.REGISTRATION_OPEN !== 'false' });
}

async function getStats(env) {
  const target = `jsonb_exists_any(child_stages, ARRAY['preschool','tk','sd'])`;
  const [summary, stands, sources, interests] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS present, COUNT(*) FILTER (WHERE relation = 'public')::int AS "publicGuests", COUNT(*) FILTER (WHERE relation = 'public' AND checked_in_at IS NOT NULL)::int AS "publicPresent", COUNT(*) FILTER (WHERE known_school = 'no')::int AS "newToSchool", COUNT(*) FILTER (WHERE contact_consent = 1)::int AS "contactConsent", COUNT(*) FILTER (WHERE interest = 'yes')::int AS interested, COUNT(*) FILTER (WHERE ${target})::int AS "targetFamilies" FROM registrations`).first(),
    env.DB.prepare(`SELECT s.code, s.position, s.name, s.owner, s.class_name, s.active, COUNT(r.id)::int AS total, COUNT(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS present, COUNT(r.id) FILTER (WHERE r.relation = 'public' AND r.checked_in_at IS NOT NULL)::int AS public_present, COUNT(r.id) FILTER (WHERE r.relation = 'public' AND r.checked_in_at IS NOT NULL AND jsonb_exists_any(r.child_stages, ARRAY['preschool','tk','sd']))::int AS target_present FROM stands s LEFT JOIN registrations r ON r.stand_code = s.code GROUP BY s.code ORDER BY public_present DESC, present DESC, s.position ASC`).all(),
    env.DB.prepare('SELECT school_source AS value, COUNT(*)::int AS total FROM registrations GROUP BY school_source ORDER BY total DESC').all(),
    env.DB.prepare('SELECT interest AS value, COUNT(*)::int AS total FROM registrations GROUP BY interest ORDER BY total DESC').all(),
  ]);
  return json({ summary, stands: stands.results, sources: sources.results, interests: interests.results });
}

function filters(url) {
  const where = [], values = [];
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const stand = url.searchParams.get('stand');
  const status = url.searchParams.get('status');
  const consent = url.searchParams.get('consent');
  if (q) { where.push('(r.full_name ILIKE ? ESCAPE \'!\' OR r.phone ILIKE ? ESCAPE \'!\' OR r.ticket_code ILIKE ? ESCAPE \'!\')'); const pattern = `%${q.replace(/[!%_]/g, '!$&')}%`; values.push(pattern, pattern, pattern); }
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
    env.DB.prepare(`SELECT COUNT(*)::int AS total FROM registrations r${clause}`).bind(...values).first(),
    env.DB.prepare(`SELECT r.*, s.name AS stand_name FROM registrations r JOIN stands s ON r.stand_code = s.code${clause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage).all(),
  ]);
  return json({ total: count.total, page, perPage, participants: result.results.map((r) => ({...r, child_stages: stagesFor(r.child_stages)})) });
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
async function exportCsv(env, url) {
  const { clause, values } = filters(url);
  // Keyset batches avoid silently truncating exports and limit each Postgres response.
  const columns = ['Kode Tiket','Nama','WhatsApp','Domisili','Hubungan SAKURA','Usia Anak','Sudah Mengenal SAKURA','Sumber Informasi Sekolah','Sumber Lainnya','Minat Informasi TK/SD','Izin Dihubungi PPDB','Kode Stand','Nama Stand','Waktu Daftar','Waktu Hadir','Souvenir Diambil','Versi Persetujuan'];
  const rows = [columns.map(csvCell).join(',')];
  let cursor = null;
  while (true) {
    const extra = cursor ? `${clause}${clause ? ' AND ' : ' WHERE '}r.id > ?::uuid` : clause;
    const result = await env.DB.prepare(`SELECT r.*, s.name AS stand_name FROM registrations r JOIN stands s ON r.stand_code = s.code${extra} ORDER BY r.id ASC LIMIT 500`).bind(...values, ...(cursor ? [cursor] : [])).all();
    for (const r of result.results) rows.push([r.ticket_code, r.full_name, `'${r.phone}`, r.domicile, labelFor(RELATIONS,r.relation), stagesFor(r.child_stages).map((s)=>labelFor(CHILD_STAGES,s)).join('; '), r.known_school === 'yes' ? 'Ya' : 'Belum', labelFor(SOURCES,r.school_source), r.source_other, labelFor(INTERESTS,r.interest), r.contact_consent ? 'Ya' : 'Tidak', r.stand_code, r.stand_name, r.created_at, r.checked_in_at, r.souvenir_at, r.consent_version].map(csvCell).join(','));
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

export async function handleRequest(request, sourceEnv, options = {}) {
  try {
    const env={...sourceEnv,DB:databaseFor(sourceEnv)};
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, ''), method = request.method;
    if (path === '/api/config' && method === 'GET') return await getConfig(env);
    if (path === '/api/register' && method === 'POST') return await register(request, env);
    if (path.startsWith('/api/auth/')) {
      requireDatabase(env);
      return await proxyAuth(request,env,{readJson,sameOrigin,rateLimit,securityHeaders:headers,...(options.authFetch ? {fetcher:options.authFetch} : {})});
    }
    if (path === '/api/admin/auth-config' && method === 'GET') return json({email:ADMIN_EMAIL,ready:!!env.DB});
    if (!path.startsWith('/api/admin/')) throw new ApiError(404, 'Halaman tidak ditemukan.');
    requireDatabase(env);
    const identity=await (options.verifyAdmin || requireAdmin)(request,env);
    if (method === 'GET') {
      if (path === '/api/admin/session') return json({ ok:true, user:identity });
      if (path === '/api/admin/stats') return await getStats(env);
      if (path === '/api/admin/participants') return await getParticipants(env,url);
      if (path === '/api/admin/export') return await exportCsv(env,url);
    }
    if (method === 'PATCH') {
      sameOrigin(request);
      const standMatch = path.match(/^\/api\/admin\/stands\/(SAKURA(?:[1-9]|10))$/);
      if (standMatch) {
        const data = validateStand(await readJson(request));
        await env.DB.prepare('UPDATE stands SET name = ?, owner = ?, class_name = ?, active = ? WHERE code = ?').bind(data.name,data.owner,data.className,data.active,standMatch[1]).run();
        return json({ok:true});
      }
      const personMatch = path.match(/^\/api\/admin\/participants\/([a-f0-9-]{36})$/);
      if (personMatch) return await updateParticipant(request,env,personMatch[1]);
    }
    throw new ApiError(404, 'Halaman tidak ditemukan.');
  } catch (error) {
    if (error instanceof ApiError) return json({ error:error.message, fields:error.fields },error.status, error.status===429 ? {'Retry-After':'900'} : {});
    // Never log request bodies, database URLs, passwords, OTPs, or tokens.
    console.error('SAKURA API: request failed');
    return json({error:'Layanan sedang bermasalah. Silakan coba lagi atau hubungi panitia.'},503);
  }
}
