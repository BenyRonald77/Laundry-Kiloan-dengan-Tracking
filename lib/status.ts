import { prisma } from "./prisma";
import { nextStatus, STATUS_ORDER, StatusOrder } from "./constants";
import { sendSiapDiambilNotification } from "./notification";

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order tidak ditemukan");
  }
}

export class StaleStatusError extends Error {
  constructor() {
    super(
      "Status order sudah berubah (mungkin diproses kasir lain). Silakan muat ulang."
    );
  }
}

export class TerminalStatusError extends Error {
  constructor() {
    super("Order sudah pada status akhir (DIAMBIL), tidak bisa dimajukan lagi");
  }
}

/**
 * Memajukan status order satu langkah dari `expectedCurrentStatus`.
 *
 * Implementasi menggunakan conditional `updateMany` (bukan read-then-write)
 * sebagai satu operasi atomik di level database: WHERE id=? AND status=?.
 * Jika ada 2 request bersamaan yang mencoba memajukan status order yang
 * sama dari status yang sama, hanya SATU yang akan mengenai baris (count=1);
 * request lainnya akan mendapati count=0 dan dianggap gagal (stale),
 * sehingga status tidak pernah "melompat" atau dobel-transisi akibat race
 * condition antar kasir yang memindai QR yang sama secara bersamaan.
 */
export async function advanceOrderStatus(
  orderId: string,
  expectedCurrentStatus: StatusOrder
) {
  const target = nextStatus(expectedCurrentStatus);
  if (!target) {
    throw new TerminalStatusError();
  }

  const result = await prisma.order.updateMany({
    where: { id: orderId, status: expectedCurrentStatus },
    data: { status: target },
  });

  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError();
    throw new StaleStatusError();
  }

  await prisma.statusHistory.create({
    data: { orderId, statusDari: expectedCurrentStatus, statusKe: target },
  });

  if (target === "SIAP_DIAMBIL") {
    await sendSiapDiambilNotification(orderId);
  }

  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return updated;
}

export { STATUS_ORDER };
