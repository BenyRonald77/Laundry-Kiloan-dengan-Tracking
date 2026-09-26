# PRD — Laundry Kiloan dengan Tracking

## 1. Latar Belakang & Tujuan

Aplikasi manajemen laundry kiloan untuk kasir/admin, dengan tracking status cucian
berbasis kode unik (ditampilkan sebagai QR code) yang bisa dipantau pelanggan secara
publik, serta notifikasi WhatsApp (mock) otomatis saat cucian siap diambil.

Tujuan utama:
- Kasir bisa membuat order baru, menghitung harga otomatis (per kg atau per item).
- Setiap order punya kode tracking unik + QR code untuk dipindai/diberikan ke pelanggan.
- Status order berjalan searah (forward-only) dan **tidak boleh rusak** saat dua kasir
  memindai/mengubah status order yang sama secara bersamaan (race condition).
- Saat status berubah menjadi `SIAP_DIAMBIL`, sistem mengirim notifikasi WhatsApp
  (mock sender — tidak perlu integrasi WA asli) **tepat satu kali** meski dipanggil
  berulang/bersamaan.
- Pelanggan bisa mengecek status cucian sendiri lewat halaman publik `/track` dengan
  memasukkan kode tracking.

## 2. Aktor

- **Admin/Kasir** — login, kelola price list, buat order, ubah status order.
- **Pelanggan** — tidak login, hanya melihat status via `/track`.

## 3. Model Data (Prisma / SQLite)

```
Admin
  id, username (unique), passwordHash, createdAt

PriceList
  id, nama, tipe (PER_KG | PER_ITEM), harga (per kg / per item), aktif, createdAt, updatedAt

Customer
  id, nama, telepon, createdAt

Order
  id, kodeTracking (unique), customerId, status (DITERIMA|DICUCI|DISETRIKA|SIAP_DIAMBIL|DIAMBIL)
  totalHarga, catatan, createdAt, updatedAt

OrderItem
  id, orderId, priceListId, namaSnapshot, tipeSnapshot, hargaSatuanSnapshot,
  qty (kg atau jumlah item), subtotal

StatusHistory
  id, orderId, statusDari, statusKe, changedAt

NotificationLog
  id, orderId, type (SIAP_DIAMBIL), status (SENT), createdAt
  unique(orderId, type)
```

Kunci desain: `OrderItem` menyimpan **snapshot** nama/tipe/harga satuan dari
`PriceList` pada saat order dibuat, sehingga perubahan harga katalog di kemudian
hari tidak mempengaruhi nilai order lama.

## 4. Alur Status (Forward-Only, Atomik)

```
DITERIMA -> DICUCI -> DISETRIKA -> SIAP_DIAMBIL -> DIAMBIL
```

- Transisi hanya boleh maju satu langkah, tidak bisa mundur atau lompat.
- Implementasi **wajib** memakai conditional update, bukan read-then-write:

  ```ts
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: expectedCurrentStatus },
    data: { status: nextStatus },
  })
  if (result.count === 0) {
    // order sudah diubah kasir lain / status tidak sesuai -> tolak dengan jelas
    throw new StaleStatusError()
  }
  ```
  Ini mencegah race condition ketika 2 kasir memindai QR yang sama secara bersamaan:
  hanya satu request yang akan berhasil (count === 1), request lain gagal secara
  aman tanpa merusak data.
- Setiap transisi sukses menambah baris ke `StatusHistory`.
- Saat transisi ke `SIAP_DIAMBIL` sukses, sistem memicu pengiriman notifikasi WA (mock).

## 5. Notifikasi WhatsApp (Mock, Anti-Duplikat)

- Sebelum mengirim pesan, sistem membuat baris `NotificationLog` dengan
  `unique(orderId, type)`.
- Jika insert berhasil -> kirim mock WA -> tandai sukses.
- Jika insert gagal karena melanggar unique constraint (P2002) -> notifikasi
  dianggap sudah/lagi dikirim oleh proses lain -> **tidak** mengirim lagi.
- Pendekatan ini membuat notifikasi idempoten walau dipanggil banyak kali secara
  konkuren (misal retry, atau dua kasir memicu transisi hampir bersamaan).

## 6. Perhitungan Harga

- Setiap `OrderItem` merujuk satu `PriceList` aktif.
- Tipe `PER_KG`: `subtotal = qty(kg) * hargaSatuanSnapshot`.
- Tipe `PER_ITEM`: `subtotal = qty(item) * hargaSatuanSnapshot`.
- `totalHarga` order = SUM(subtotal semua item), dihitung di server saat order dibuat.
- Order boleh berisi campuran item per-kg dan per-item dalam satu order yang sama.

## 7. Verifikasi Wajib (dijalankan sebagai script terhadap database live, bukan hanya review kode)

1. **Konkurensi transisi status**: 10 request paralel memanggil transisi status yang
   sama pada order yang sama -> hasil akhir: tepat 1 request `success=true`, 9 gagal
   dengan alasan stale status; status order di DB konsisten (tidak "melompat" step).
2. **Perhitungan harga**: order campuran per-kg + per-item dibuat, subtotal & total
   dicocokkan manual; setelah itu harga di `PriceList` diubah, dan dipastikan
   `hargaSatuanSnapshot` pada `OrderItem` lama **tidak berubah**.
3. **Anti-duplikat notifikasi**: 10 pemanggilan konkuren fungsi pengirim notifikasi
   untuk order+type yang sama -> tepat 1 baris `NotificationLog` tercipta dan tepat
   1 "pesan" tercatat terkirim oleh mock sender.

Hasil verifikasi didokumentasikan di README (termasuk bug yang ditemukan & fix-nya).

## 8. Autentikasi

- Admin/kasir login via `/login` — JWT disimpan di httpOnly cookie.
- Password di-hash dengan bcryptjs.
- Semua route `/dashboard/**` dan API mutasi memerlukan cookie JWT valid.
- `/track` bersifat publik, tanpa login.

## 9. Halaman (UI)

- `/login` — form login kasir/admin.
- `/dashboard` — daftar order (tab per status), form buat order baru (pilih/₊ pelanggan,
  tambah item dari price list, lihat total otomatis).
- `/dashboard/orders/[id]` — detail order: QR code kode tracking, tombol "Maju Status"
  (hanya ke status berikutnya), riwayat status, daftar item & harga.
- `/track` — publik, input kode tracking -> tampilkan status & riwayat singkat.

## 10. Stack Teknis

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite (`DATABASE_URL="file:./dev.db?connection_limit=1&socket_timeout=20"`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT httpOnly cookie
- QR code: library ringan generate QR dari kodeTracking (render sebagai SVG/data URL)

## 11. Non-Goals

- Tidak ada integrasi WhatsApp asli (cukup mock sender yang mencatat log).
- Tidak ada pembayaran online.
- Tidak ada multi-cabang/multi-tenant.
