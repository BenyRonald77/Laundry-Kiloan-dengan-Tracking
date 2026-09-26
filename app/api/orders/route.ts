import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { createOrder, EmptyOrderError, InvalidPriceListError } from "@/lib/order";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.customerNama || !body?.customerTelepon || !Array.isArray(body?.items)) {
    return NextResponse.json({ error: "Data order tidak lengkap" }, { status: 400 });
  }

  try {
    const order = await createOrder({
      customerNama: body.customerNama,
      customerTelepon: body.customerTelepon,
      items: body.items,
      catatan: body.catatan,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyOrderError || err instanceof InvalidPriceListError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Gagal membuat order" }, { status: 500 });
  }
}
