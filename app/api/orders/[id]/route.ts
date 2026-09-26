import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      items: true,
      history: { orderBy: { changedAt: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ order });
}
