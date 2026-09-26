import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  advanceOrderStatus,
  OrderNotFoundError,
  StaleStatusError,
  TerminalStatusError,
} from "@/lib/status";
import { StatusOrder } from "@/lib/constants";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const currentStatus = body?.currentStatus as StatusOrder | undefined;
  if (!currentStatus) {
    return NextResponse.json({ error: "currentStatus wajib dikirim" }, { status: 400 });
  }

  try {
    const order = await advanceOrderStatus(params.id, currentStatus);
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof StaleStatusError) {
      return NextResponse.json({ error: err.message, code: "STALE" }, { status: 409 });
    }
    if (err instanceof OrderNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof TerminalStatusError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Gagal memajukan status" }, { status: 500 });
  }
}
