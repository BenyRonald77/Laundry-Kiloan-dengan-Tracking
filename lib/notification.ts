import { prisma } from "./prisma";
import { NOTIFICATION_TYPE } from "./constants";

/**
 * Mock sender WhatsApp - dalam produksi ini akan memanggil API WA asli.
 * Di sini kita hanya mencatat "pesan terkirim" secara in-memory/log agar
 * bisa diverifikasi jumlah pengiriman aktual saat testing konkurensi.
 */
let mockSentCount = 0;
export function __getMockSentCount() {
  return mockSentCount;
}
export function __resetMockSentCount() {
  mockSentCount = 0;
}

async function mockSendWhatsApp(telepon: string, message: string) {
  mockSentCount += 1;
  // simulasi latency jaringan supaya kondisi race lebih mudah terjadi saat testing
  await new Promise((r) => setTimeout(r, 5));
  return { ok: true, telepon, message };
}

/**
 * Mengirim notifikasi "SIAP_DIAMBIL" dengan anti-duplikat.
 *
 * Strategi: buat baris NotificationLog dengan unique(orderId, type)
 * SEBELUM mengirim pesan. Jika insert berhasil, baru kirim WA. Jika insert
 * gagal karena melanggar unique constraint (P2002), berarti proses lain
 * sudah/lagi mengirim notifikasi ini -> kita tidak mengirim lagi.
 *
 * Ini membuat pengiriman idempoten walau dipanggil berkali-kali secara
 * konkuren (misalnya akibat retry, atau dua transisi status yang nyaris
 * bersamaan memicu path yang sama).
 */
export async function sendSiapDiambilNotification(orderId: string) {
  try {
    await prisma.notificationLog.create({
      data: {
        orderId,
        type: NOTIFICATION_TYPE.SIAP_DIAMBIL,
        status: "SENT",
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Sudah dikirim oleh proses lain, tidak perlu kirim lagi.
      return { sent: false, reason: "already_sent" as const };
    }
    throw err;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { sent: false, reason: "order_not_found" as const };

  await mockSendWhatsApp(
    order.customer.telepon,
    `Halo ${order.customer.nama}, cucian Anda dengan kode ${order.kodeTracking} sudah SIAP DIAMBIL.`
  );

  return { sent: true as const };
}
