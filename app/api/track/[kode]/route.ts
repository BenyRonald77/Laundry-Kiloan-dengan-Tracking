import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { kode: string } }) {
  const order = await prisma.order.findUnique({
    where: { kodeTracking: params.kode.trim().toUpperCase() },
    include: {
      items: true,
      history: { orderBy: { changedAt: "asc" } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Kode tracking tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      kodeTracking: order.kodeTracking,
      status: order.status,
      totalHarga: order.totalHarga,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        nama: i.namaSnapshot,
        tipe: i.tipeSnapshot,
        qty: i.qty,
        subtotal: i.subtotal,
      })),
      history: order.history.map((h) => ({ statusKe: h.statusKe, changedAt: h.changedAt })),
    },
  });
}
