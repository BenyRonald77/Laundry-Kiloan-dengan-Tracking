import { prisma } from "./prisma";
import { customAlphabet } from "./tracking-code";

interface OrderItemInput {
  priceListId: string;
  qty: number;
}

interface CreateOrderInput {
  customerNama: string;
  customerTelepon: string;
  items: OrderItemInput[];
  catatan?: string;
}

export class EmptyOrderError extends Error {
  constructor() {
    super("Order harus memiliki minimal 1 item");
  }
}

export class InvalidPriceListError extends Error {
  constructor(id: string) {
    super(`Price list ${id} tidak ditemukan atau tidak aktif`);
  }
}

/**
 * Membuat order baru. Harga dihitung 100% di server dari PriceList aktif,
 * lalu di-snapshot ke OrderItem supaya perubahan harga katalog di masa depan
 * tidak mempengaruhi order yang sudah dibuat.
 */
export async function createOrder(input: CreateOrderInput) {
  if (!input.items || input.items.length === 0) {
    throw new EmptyOrderError();
  }

  const priceListIds = Array.from(new Set(input.items.map((i) => i.priceListId)));
  const priceLists = await prisma.priceList.findMany({
    where: { id: { in: priceListIds }, aktif: true },
  });
  const priceListMap = new Map(priceLists.map((p) => [p.id, p]));

  for (const id of priceListIds) {
    if (!priceListMap.has(id)) throw new InvalidPriceListError(id);
  }

  const itemsWithSubtotal = input.items.map((item) => {
    const pl = priceListMap.get(item.priceListId)!;
    const subtotal = pl.harga * item.qty;
    return {
      priceListId: pl.id,
      namaSnapshot: pl.nama,
      tipeSnapshot: pl.tipe,
      hargaSatuanSnapshot: pl.harga,
      qty: item.qty,
      subtotal,
    };
  });

  const totalHarga = itemsWithSubtotal.reduce((sum, i) => sum + i.subtotal, 0);

  // kodeTracking unik dijamin di level DB; pada kemungkinan kecil kolisi
  // (P2002), coba lagi dengan kode baru.
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const kodeTracking = generateKodeTracking();
    try {
      const order = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: { nama: input.customerNama, telepon: input.customerTelepon },
        });

        return tx.order.create({
          data: {
            kodeTracking,
            customerId: customer.id,
            status: "DITERIMA",
            totalHarga,
            catatan: input.catatan,
            items: { create: itemsWithSubtotal },
            history: {
              create: { statusDari: "DITERIMA", statusKe: "DITERIMA" },
            },
          },
          include: { items: true, customer: true },
        });
      });
      return order;
    } catch (err: unknown) {
      const prismaErr = err as { code?: string; meta?: { target?: string[] } };
      const isUniqueKodeTrackingClash =
        prismaErr?.code === "P2002" && prismaErr?.meta?.target?.includes("kodeTracking");
      if (!isUniqueKodeTrackingClash || attempt === maxAttempts - 1) throw err;
    }
  }
  throw new Error("Gagal membuat kode tracking unik setelah beberapa percobaan");
}

function generateKodeTracking(): string {
  const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
  return `LK-${nanoid()}`;
}
