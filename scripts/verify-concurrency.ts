/**
 * Script verifikasi konkurensi terhadap DATABASE LIVE (SQLite dev.db).
 * Jalankan: npm run verify:concurrency
 *
 * Menjalankan 3 skenario riil dengan data sungguhan di database, TIDAK
 * memakai mock/stub Prisma - semua request beneran hit database yang sama.
 */
import { prisma } from "../lib/prisma";
import { createOrder } from "../lib/order";
import { advanceOrderStatus, StaleStatusError } from "../lib/status";
import {
  sendSiapDiambilNotification,
  __getMockSentCount,
  __resetMockSentCount,
} from "../lib/notification";

let pass = 0;
let fail = 0;

function ok(desc: string) {
  pass++;
  console.log(`  PASS - ${desc}`);
}
function bad(desc: string) {
  fail++;
  console.log(`  FAIL - ${desc}`);
}

async function ensurePriceLists() {
  const perKg = await prisma.priceList.upsert({
    where: { id: "verify-per-kg" },
    update: { aktif: true, harga: 8000 },
    create: {
      id: "verify-per-kg",
      nama: "[verify] Cuci Kg",
      tipe: "PER_KG",
      harga: 8000,
    },
  });
  const perItem = await prisma.priceList.upsert({
    where: { id: "verify-per-item" },
    update: { aktif: true, harga: 20000 },
    create: {
      id: "verify-per-item",
      nama: "[verify] Selimut",
      tipe: "PER_ITEM",
      harga: 20000,
    },
  });
  return { perKg, perItem };
}

async function scenario1_statusRace() {
  console.log("\n[Skenario 1] 10 request konkuren memajukan status order yang sama");
  const { perKg } = await ensurePriceLists();
  const order = await createOrder({
    customerNama: "Verify Customer 1",
    customerTelepon: "081200000001",
    items: [{ priceListId: perKg.id, qty: 3 }],
  });

  const results = await Promise.allSettled(
    Array.from({ length: 10 }).map(() => advanceOrderStatus(order.id, "DITERIMA"))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  const staleFails = failed.filter(
    (r) => r.status === "rejected" && r.reason instanceof StaleStatusError
  );

  console.log(`  -> sukses: ${succeeded.length}, gagal: ${failed.length} (stale: ${staleFails.length})`);

  if (succeeded.length === 1) ok("Tepat 1 dari 10 request berhasil memajukan status");
  else bad(`Diharapkan tepat 1 request sukses, didapat ${succeeded.length}`);

  if (failed.length === 9 && staleFails.length === 9) {
    ok("9 request lainnya gagal dengan StaleStatusError (bukan korupsi data)");
  } else {
    bad(`Diharapkan 9 gagal dgn StaleStatusError, didapat ${failed.length} gagal (${staleFails.length} stale)`);
  }

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  if (finalOrder.status === "DICUCI") {
    ok("Status final order tepat 'DICUCI' (satu langkah maju, tidak lompat)");
  } else {
    bad(`Status final order seharusnya DICUCI, malah '${finalOrder.status}'`);
  }

  const historyCount = await prisma.statusHistory.count({
    where: { orderId: order.id, statusKe: "DICUCI" },
  });
  if (historyCount === 1) ok("Hanya 1 baris StatusHistory tercatat untuk transisi ini");
  else bad(`Diharapkan 1 baris history, didapat ${historyCount}`);
}

async function scenario2_pricingSnapshot() {
  console.log("\n[Skenario 2] Harga campuran per-kg + per-item & snapshot harga");
  const { perKg, perItem } = await ensurePriceLists();

  const order = await createOrder({
    customerNama: "Verify Customer 2",
    customerTelepon: "081200000002",
    items: [
      { priceListId: perKg.id, qty: 2.5 }, // 2.5kg x 8000 = 20000
      { priceListId: perItem.id, qty: 3 }, // 3 x 20000 = 60000
    ],
  });

  const expectedTotal = 2.5 * 8000 + 3 * 20000;
  if (order.totalHarga === expectedTotal) {
    ok(`Total harga campuran benar: ${order.totalHarga} (manual: ${expectedTotal})`);
  } else {
    bad(`Total harga salah: got ${order.totalHarga}, expected ${expectedTotal}`);
  }

  const kgItem = order.items.find((i) => i.priceListId === perKg.id)!;
  const itemItem = order.items.find((i) => i.priceListId === perItem.id)!;
  if (kgItem.subtotal === 20000 && itemItem.subtotal === 60000) {
    ok("Subtotal per item cocok manual (per-kg dan per-item)");
  } else {
    bad(`Subtotal salah: kg=${kgItem.subtotal}, item=${itemItem.subtotal}`);
  }

  // Ubah harga di price list, snapshot lama harus tidak berubah
  await prisma.priceList.update({ where: { id: perKg.id }, data: { harga: 99999 } });
  const reread = await prisma.orderItem.findUniqueOrThrow({ where: { id: kgItem.id } });
  if (reread.hargaSatuanSnapshot === 8000 && reread.subtotal === 20000) {
    ok("Snapshot harga OrderItem TIDAK berubah walau PriceList diubah");
  } else {
    bad(`Snapshot berubah! hargaSatuanSnapshot=${reread.hargaSatuanSnapshot}`);
  }
  // restore
  await prisma.priceList.update({ where: { id: perKg.id }, data: { harga: 8000 } });
}

async function scenario3_notificationDedupe() {
  console.log("\n[Skenario 3] 10 panggilan konkuren notifikasi SIAP_DIAMBIL untuk order yang sama");
  const { perKg } = await ensurePriceLists();
  const order = await createOrder({
    customerNama: "Verify Customer 3",
    customerTelepon: "081200000003",
    items: [{ priceListId: perKg.id, qty: 1 }],
  });

  __resetMockSentCount();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }).map(() => sendSiapDiambilNotification(order.id))
  );

  const sent = results.filter((r) => r.status === "fulfilled" && (r.value as any).sent === true);
  const skipped = results.filter(
    (r) => r.status === "fulfilled" && (r.value as any).sent === false
  );

  console.log(`  -> terkirim: ${sent.length}, dilewati (sudah terkirim): ${skipped.length}`);

  if (sent.length === 1) ok("Tepat 1 dari 10 panggilan yang benar-benar mengirim");
  else bad(`Diharapkan tepat 1 terkirim, didapat ${sent.length}`);

  const mockCount = __getMockSentCount();
  if (mockCount === 1) ok("Mock WA sender dipanggil tepat 1 kali (tidak ada pesan dobel)");
  else bad(`Mock sender dipanggil ${mockCount} kali, diharapkan 1`);

  const logCount = await prisma.notificationLog.count({
    where: { orderId: order.id, type: "SIAP_DIAMBIL" },
  });
  if (logCount === 1) ok("Tepat 1 baris NotificationLog tercipta (unique constraint bekerja)");
  else bad(`Ada ${logCount} baris NotificationLog, diharapkan 1`);
}

async function main() {
  console.log("=== Verifikasi Konkurensi Laundry Kiloan (database live) ===");
  await scenario1_statusRace();
  await scenario2_pricingSnapshot();
  await scenario3_notificationDedupe();

  console.log(`\n=== Hasil: ${pass} PASS, ${fail} FAIL ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Verifikasi crash:", e);
  await prisma.$disconnect();
  process.exit(1);
});
