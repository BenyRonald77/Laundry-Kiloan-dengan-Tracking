import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const priceLists = await prisma.priceList.findMany({
    where: { aktif: true },
    orderBy: { nama: "asc" },
  });
  return NextResponse.json({ priceLists });
}
