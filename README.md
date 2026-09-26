# Laundry Kiloan dengan Tracking

Aplikasi manajemen laundry kiloan: order dengan harga otomatis (per kg / per item),
tracking status cucian via kode unik + QR code, dan notifikasi WhatsApp (mock) saat
cucian siap diambil. Lihat PRD lengkap di [`docs/PRD.md`](docs/PRD.md).

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma 5 + SQLite (`file:./dev.db?connection_limit=1&socket_timeout=20`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT disimpan di cookie httpOnly
- QR code: library `qrcode`

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env   # sudah cukup untuk SQLite lokal
npx prisma migrate deploy
npm run seed            # buat admin (admin/admin123) + price list contoh
npm run dev
```

Buka `http://localhost:3000`:
- `/login` — login kasir (`admin` / `admin123`)
- `/dashboard` — kelola order
- `/track` — publik, cek status cucian

## Arsitektur & Keputusan Desain Penting

### 1. Transisi status atomik (forward-only), anti race condition

Order berjalan lewat status: `DITERIMA -> DICUCI -> DISETRIKA -> SIAP_DIAMBIL -> DIAMBIL`.

Alih-alih membaca status lalu menulis status baru (rentan race condition saat 2 kasir
memindai QR order yang sama hampir bersamaan), `advanceOrderStatus`
(`lib/status.ts`) memakai **conditional `updateMany`** sebagai satu operasi atomik
di level database:

```ts
const result = await prisma.order.updateMany({
  where: { id: orderId, status: expectedCurrentStatus },
  data: { status: target },
});
if (result.count === 0) throw new StaleStatusError();
```

Karena kondisi `status: expectedCurrentStatus` dievaluasi oleh database pada saat
UPDATE (bukan dibaca lebih dulu oleh aplikasi lalu ditulis belakangan), dari 10
request yang mencoba memajukan status yang sama secara bersamaan, tepat **satu**
yang akan mengubah baris (`count === 1`); sisanya mendapati `count === 0` dan
ditolak sebagai `StaleStatusError` tanpa pernah merusak data atau melompati status.

### 2. Notifikasi WhatsApp (mock) yang idempoten

`sendSiapDiambilNotification` (`lib/notification.ts`) membuat baris
`NotificationLog` dengan `@@unique([orderId, type])` **sebelum** mengirim pesan.
Panggilan konkuren/duplikat yang mencoba insert baris yang sama akan gagal dengan
`P2002` (unique constraint violation) dan tidak pernah mengirim pesan mock kedua
kalinya — insert-first, bukan check-then-send, sehingga aman terhadap race
condition.

### 3. Snapshot harga

`createOrder` (`lib/order.ts`) menghitung `subtotal` dan `totalHarga` 100% di
server dari `PriceList` aktif, lalu menyalin `nama`, `tipe`, dan `harga` ke
`OrderItem` sebagai snapshot (`namaSnapshot`, `tipeSnapshot`,
`hargaSatuanSnapshot`). Perubahan harga di katalog setelahnya tidak memengaruhi
order yang sudah dibuat.

### 4. Enum di SQLite

Prisma dengan connector SQLite tidak mendukung native `enum`. Field seperti
`status`, `tipe`, `type` disimpan sebagai `String` dengan nilai yang divalidasi
di level aplikasi (`lib/constants.ts`).

## Verifikasi Konkurensi (dijalankan terhadap database live)

Dijalankan dengan `npm run verify:concurrency` (`scripts/verify-concurrency.ts`) —
skrip ini benar-benar memanggil `lib/order.ts`, `lib/status.ts`, `lib/notification.ts`
yang hit SQLite `dev.db` sungguhan, bukan mock/stub.

```
=== Verifikasi Konkurensi Laundry Kiloan (database live) ===
[Skenario 1] 10 request konkuren memajukan status order yang sama
  -> sukses: 1, gagal: 9 (stale: 9)
  PASS - Tepat 1 dari 10 request berhasil memajukan status
  PASS - 9 request lainnya gagal dengan StaleStatusError (bukan korupsi data)
  PASS - Status final order tepat 'DICUCI' (satu langkah maju, tidak lompat)
  PASS - Hanya 1 baris StatusHistory tercatat untuk transisi ini
[Skenario 2] Harga campuran per-kg + per-item & snapshot harga
  PASS - Total harga campuran benar: 80000 (manual: 80000)
  PASS - Subtotal per item cocok manual (per-kg dan per-item)
  PASS - Snapshot harga OrderItem TIDAK berubah walau PriceList diubah
[Skenario 3] 10 panggilan konkuren notifikasi SIAP_DIAMBIL untuk order yang sama
  -> terkirim: 1, dilewati (sudah terkirim): 9
  PASS - Tepat 1 dari 10 panggilan yang benar-benar mengirim
  PASS - Mock WA sender dipanggil tepat 1 kali (tidak ada pesan dobel)
  PASS - Tepat 1 baris NotificationLog tercipta (unique constraint bekerja)
=== Hasil: 10 PASS, 0 FAIL ===
```

(Log `prisma:error ... Unique constraint failed` yang muncul di stdout saat
Skenario 3 adalah error P2002 yang **memang diharapkan dan ditangkap** oleh
`sendSiapDiambilNotification` — bukan kegagalan.)

## Verifikasi UI (Playwright, browser Chromium sungguhan)

Dijalankan dengan `node scripts/e2e-playwright.js` terhadap `npm run dev` di
`localhost:3000` (bukan curl, benar-benar mengendalikan browser):

```
[1] Login kasir
  PASS - Berhasil login dan redirect ke /dashboard
[2] Buat order baru (campuran per-kg + per-item)
  PASS - Order baru tampil di daftar order setelah disimpan
[3] Buka detail order, cek QR code, majukan status
  PASS - QR code tampil di halaman detail order
  PASS - Status awal order = Diterima
  PASS - Status berhasil maju ke Dicuci setelah klik tombol
[4] Cek halaman publik /track dengan kode tracking tersebut
  PASS - Halaman /track publik menampilkan status terkini order dengan benar
[5] Cek kode tracking yang tidak ada -> pesan error
  PASS - Kode tracking tidak valid menampilkan pesan error yang jelas
=== Hasil E2E: 7 PASS, 0 FAIL ===
```

`npm run build` (production build) juga sukses tanpa error TypeScript/ESLint.

## Bug yang Ditemukan & Diperbaiki Selama Development

1. **Enum tidak didukung SQLite** — skema awal memakai `enum` Prisma untuk
   `status`, `tipe`, dan tipe notifikasi; `prisma migrate dev` gagal validasi
   karena connector SQLite tidak mendukung enum native. Diperbaiki dengan
   mengganti semua enum menjadi `String` + konstanta tervalidasi di
   `lib/constants.ts`.
2. **`.gitignore` dari `create-next-app` menimpa `.gitignore` kustom** —
   setelah scaffold, file `.env` dan `prisma/dev.db` sempat ikut ter-stage
   untuk commit karena `create-next-app` menulis ulang `.gitignore` default
   yang tidak mengecualikan `.env` biasa atau file `*.db`. Ditemukan dengan
   memeriksa `git status --short` sebelum commit, lalu diperbaiki dengan
   menambahkan kembali aturan tersebut ke `.gitignore`.
3. **Kode tracking berpotensi kolisi** — generator kode tracking acak (8
   karakter) secara teoretis bisa menghasilkan duplikat pada `kodeTracking`
   yang unik. Ditangani dengan retry otomatis (maksimal 5x) khusus untuk
   error `P2002` pada field `kodeTracking` di `createOrder`.
4. **`useEffect` dependency warning** pada halaman detail order (regenerasi
   QR code) — diperbaiki dengan menyalin nilai yang dibutuhkan ke variabel
   lokal sebelum dependency array `[order]`, sesuai saran `react-hooks/exhaustive-deps`.

## Struktur Model Data

Lihat `prisma/schema.prisma` — `Admin`, `PriceList`, `Customer`, `Order`,
`OrderItem`, `StatusHistory`, `NotificationLog`.

## Login Default (development/seed)

- Username: `admin`
- Password: `admin123`

Ganti kredensial ini sebelum deploy ke production.
