# SAKURA — Registrasi Parenting SORGA Akbar

Website pendaftaran **“Ketika Ibu Juga Ingin Menangis”**, Ahad, **8 November 2026**, sekaligus pengenalan Sekolah Shibghah Akhlak Quran (TK / SD) dan pendataan referral **10 stand bazar**.

Disiapkan untuk **Cloudflare Pages + Pages Functions + D1**. Tanpa dependensi build, tanpa Supabase, dan tanpa API berbayar. Pendaftaran benar-benar disimpan di database; tidak memakai penyimpanan browser sebagai database peserta.

## Yang tersedia

- Landing page responsif, informasi acara, pengenalan TK / SD, dan FAQ.
- Form tiga langkah: data peserta → mengenal SAKURA → referral dan persetujuan.
- Pertanyaan pernah mendengar SAKURA, sumber informasi sekolah, hubungan dengan sekolah, kelompok usia anak, dan minat informasi TK / SD.
- **Sumber informasi sekolah terpisah dari referral stand.** Mengenal sekolah dari Instagram dan diundang Stand 03 tercatat sebagai dua informasi berbeda.
- Sepuluh kode tetap `SAKURA01` sampai `SAKURA10`. Tautan `/?ref=SAKURA03` mengisi stand secara otomatis. Nama, pemilik, kelas, dan status aktif dapat diubah panitia.
- Bukti pendaftaran dengan kode dan QR; bisa diunduh sebagai SVG atau dicetak / disimpan PDF melalui browser. Bukti hanya menyertakan nama, acara, dan referral; nomor WhatsApp tidak ada di QR.
- `/admin/`: login panitia, ringkasan, daftar peserta, pencarian, filter stand / kehadiran / izin PPDB, detail jawaban, check-in, souvenir, tautan / QR undangan, dan ekspor CSV yang dapat dibuka di Excel.
- Rekap terpisah antara pendaftar, seluruh peserta hadir, tamu umum hadir, dan tamu umum hadir dengan anak usia prasekolah / TK / SD. Urutan apresiasi memakai tamu umum yang hadir; keputusan tetap oleh panitia.
- Tidak meminta nama anak, alamat lengkap, atau data kesehatan. Persetujuan pendataan acara wajib; persetujuan untuk informasi sekolah / PPDB melalui WhatsApp **opsional dan tidak tercentang otomatis**.

## Deploy lewat dashboard Cloudflare

### 1. Buat database dan jalankan schema

1. Buka **Cloudflare → Storage & databases → D1 SQL database → Create database**.
2. Beri nama, misalnya **`sakura-sorga`**.
3. Buka database → **Console**.
4. Salin seluruh isi [`migrations/0001_initial.sql`](migrations/0001_initial.sql), lalu jalankan. Schema menyiapkan tabel dan sepuluh stand awal. Jangan hanya membuat database kosong.

Schema menggunakan `CREATE TABLE IF NOT EXISTS` dan `INSERT OR IGNORE`, sehingga menjalankannya lagi tidak menghapus peserta atau mengganti nama stand yang sudah diedit.

### 2. Hubungkan repository sebagai Pages

Di **Workers & Pages**, buat aplikasi **Pages**, lalu hubungkan repo `MenkiPlugcore/form-bazar-sakura`. Pilih **Pages**, karena kode ini menggunakan direktori `functions/` milik Pages.

| Pengaturan | Nilai |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Kosong / root repo |
| `NODE_VERSION` | `24` |

Tidak perlu `npm install`; QR generator sudah disertakan beserta atribusi lisensinya. Cloudflare akan mengambil `functions/` dari root repo ketika membangun Pages.

### 3. Pasang binding dan secrets

Di proyek Pages → **Settings → Bindings → Add → D1 database**, hubungkan database tadi:

| Pengaturan | Nilai |
| --- | --- |
| Variable / binding name | **`DB`** — huruf besar |
| D1 database | `sakura-sorga` |

Di **Settings → Variables and Secrets**, isi **Production**:

| Nama | Jenis | Isi |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Secret | Kata sandi panitia, minimal **16 karakter** |
| `SESSION_SECRET` | Secret | Teks acak, minimal **32 karakter** |
| `EVENT_VENUE` | Variable, opsional | Nama lokasi / alamat acara yang telah dikonfirmasi; bawaan `Area Sekolah SAKURA` |
| `REGISTRATION_OPEN` | Variable, opsional | `true` untuk membuka, `false` untuk menutup; bawaan terbuka jika database siap |

Contoh membuat nilai acak untuk `SESSION_SECRET` di komputer sendiri:

```bash
openssl rand -hex 32
```

Simpan hasilnya sebagai Secret. Jangan masukkan kata sandi atau secret ke kode, GitHub, atau chat.

**Setelah binding / secrets diisi, lakukan Redeploy / Retry deployment** agar Functions mendapat konfigurasi terbaru. Jangan gunakan database dan secret produksi yang sama untuk deployment Preview; gunakan database terpisah atau tutup registrasi Preview.

Tidak ada `wrangler.toml` aktif yang menimpa konfigurasi dashboard. File `wrangler.example.toml` hanya contoh untuk penggunaan CLI.

### 4. Siapkan sebelum tautan dibagikan

1. Buka `https://DOMAIN-PAGES/api/config`. Pastikan `ready` dan `registrationOpen` bernilai `true`, dan sepuluh stand muncul. Endpoint ini tidak menampilkan data peserta.
2. Buka `https://DOMAIN-PAGES/admin/`, masuk dengan `ADMIN_PASSWORD` yang diatur di Cloudflare.
3. Buka **Stand & referral**. Ubah `Stand 01` dan seterusnya menjadi nama stand sebenarnya; isi pemilik dan kelas bila diperlukan.
4. Buka **Tautan / QR**, lalu bagikan undangan ke pemilik stand masing-masing. Tautan selalu mengikuti domain tempat dashboard dibuka.
5. Pastikan lokasi acara dan informasi pada halaman sudah sesuai. Jika domain khusus dipakai, atur lebih dulu lalu buat QR dari domain tersebut.

Tidak ada pengiriman WhatsApp otomatis. Peserta perlu menyimpan bukti sendiri. Tamu yang kehilangan bukti dapat dicari panitia menggunakan nama / nomor WhatsApp.

## Alur panitia pada hari acara

1. Di **Daftar peserta**, cari kode dari bukti / hasil pemindaian QR, nama, atau nomor WhatsApp.
2. Klik **Tandai hadir** satu kali. Pengulangan tidak menambah jumlah hadir dan tidak mengganti waktu check-in pertama.
3. Setelah souvenir diserahkan, klik **Serahkan**. Souvenir hanya bisa ditandai untuk peserta yang telah hadir.
4. Jika salah peserta, kehadiran bisa dibatalkan; status souvenir ikut dibatalkan agar konsisten.
5. Pantau **Stand & referral**. Kolom “Target 3 + 1” terpenuhi jika ada setidaknya tiga tamu masyarakat umum hadir, termasuk satu dengan anak usia prasekolah / TK / SD. Angka berasal dari jawaban peserta; panitia perlu memverifikasi bila digunakan untuk apresiasi.
6. Klik **Ekspor CSV** untuk mengunduh data sesuai filter aktif. Gunakan filter **Bersedia dihubungi PPDB** untuk daftar tindak lanjut sekolah. CSV menyertakan kolom persetujuan terpisah.

QR bukti berisi **kode tiket saja**, bukan URL publik yang menampilkan data pribadi. Pemindai kamera dapat membaca kode untuk dimasukkan ke pencarian dashboard. Website belum menyediakan pemindaian kamera langsung.

## Menjalankan di komputer sendiri

Gunakan Node.js **24** (atau minimal 22.13 dengan dukungan `node:sqlite`). Tidak perlu memasang paket.

```bash
npm run dev
```

Buka `http://localhost:4173/`. Server lokal menggunakan SQLite di `.local/dev.sqlite` dan menyiapkan schema otomatis. Data ini **tidak ikut ke produksi** dan tidak masuk Git.

Untuk mencoba `/admin/` lokal, kata sandi bawaan khusus pengembangan adalah **`sakura-local-development-only`**. Kata sandi lokal ini tidak berlaku di Cloudflare. Untuk menggantinya, salin `.dev.vars.example` ke `.dev.vars`, isi konfigurasi lokal, lalu jalankan ulang server.

```bash
npm run check
npm test
npm run build
```

Tes mencakup registrasi, validasi server, keunikan WhatsApp, referral nonaktif, persetujuan, login, sesi bertanda tangan, CSRF, pembatasan percobaan, pencarian, check-in, souvenir, analitik, dan CSV.

Untuk menggunakan runtime Cloudflare secara lokal, pasang Wrangler resmi, salin `wrangler.example.toml` menjadi `wrangler.toml`, isi ID D1, lalu:

```bash
npx wrangler d1 migrations apply sakura-sorga --local
npm run build
npx wrangler pages dev dist
```

Untuk database remote melalui CLI (alternatif Console):

```bash
npx wrangler d1 migrations apply sakura-sorga --remote
```

## Data dan pengelolaan akses

- Admin memakai kata sandi server dan cookie `HttpOnly`, `SameSite=Strict`, `Secure` pada HTTPS; sesi berlaku delapan jam. Mengganti kata sandi atau `SESSION_SECRET` membatalkan sesi lama.
- Mutasi admin memerlukan Origin yang sama dan token CSRF. Query database memakai binding parameter. Nomor WhatsApp yang sama tidak bisa mendaftarkan peserta kedua.
- Login dibatasi enam percobaan per 15 menit per IP; registrasi dibatasi 15 percobaan per jam per IP. Untuk pendaftaran massal pada satu jaringan, sesuaikan batas di `server/api.mjs` setelah menilai kebutuhan. Jangan mengganti header IP Cloudflare dengan header dari pengunjung.
- IP mentah tidak disimpan; database menyimpan hash bucket pembatasan percobaan yang dibersihkan setelah kedaluwarsa. Isi formulir dan secret tidak dicatat ke log.
- Tidak ada data peserta yang di-seed ke produksi. Akses publik tidak bisa membaca daftar peserta atau mencari detail melalui kode tiket.
- CSV memakai escaping untuk mencegah nilai isian dibaca sebagai formula spreadsheet.
- Akses panitia masih menggunakan satu kata sandi bersama, belum akun / peran berbeda untuk masing-masing panitia. Bagikan hanya kepada pihak berwenang dan ganti setelah acara.
- Koreksi identitas, penarikan persetujuan, dan permintaan penghapusan ditangani pengelola melalui database D1. Dashboard versi ini mengubah kehadiran, souvenir, dan stand, belum mengedit / menghapus identitas peserta. Selalu cocokkan kode tiket sebelum perubahan database.
- Setelah acara, set `REGISTRATION_OPEN=false` dan redeploy. Sekolah perlu meninjau penyimpanan / penghapusan data sesuai kebutuhan acara dan persetujuan peserta.

## Struktur

```text
public/              Halaman pengunjung, admin, aset statis dan header
functions/api/       Entry Pages Functions untuk /api/*
server/              API, autentikasi, validasi dan query D1
migrations/          Schema SQL dan sepuluh referral awal
scripts/             Build, pemeriksaan, dan server lokal
tests/               Tes integrasi API dengan SQLite
```

Dokumentasi resmi: [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [D1 bindings untuk Pages](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases), dan [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
