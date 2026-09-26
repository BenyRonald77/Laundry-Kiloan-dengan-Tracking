"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { STATUS_LABEL, nextStatus, StatusOrder } from "@/lib/constants";

interface OrderDetail {
  id: string;
  kodeTracking: string;
  status: StatusOrder;
  totalHarga: number;
  createdAt: string;
  customer: { nama: string; telepon: string };
  items: {
    id: string;
    namaSnapshot: string;
    tipeSnapshot: string;
    hargaSatuanSnapshot: number;
    qty: number;
    subtotal: number;
  }[];
  history: { id: string; statusDari: string; statusKe: string; changedAt: string }[];
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${params.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setOrder(data.order);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    const kode = order.kodeTracking;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(kode, { width: 200, margin: 1 }).then(setQrDataUrl);
    });
  }, [order]);

  async function handleAdvance() {
    if (!order) return;
    setAdvancing(true);
    setError("");
    const res = await fetch(`/api/orders/${order.id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: order.status }),
    });
    setAdvancing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gagal memajukan status");
      await load();
      return;
    }
    await load();
  }

  if (!order) return <p className="text-sm text-slate-500">Memuat...</p>;

  const target = nextStatus(order.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{order.kodeTracking}</h2>
            <p className="text-sm text-slate-500">
              {order.customer.nama} - {order.customer.telepon}
            </p>
          </div>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR kode tracking" width={120} height={120} />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
            {STATUS_LABEL[order.status]}
          </span>
          {target ? (
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {advancing ? "Memproses..." : `Maju ke ${STATUS_LABEL[target]}`}
            </button>
          ) : (
            <span className="text-sm text-slate-500">Status akhir</span>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-3 font-medium">Item</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Nama</th>
              <th className="py-1">Qty</th>
              <th className="py-1">Harga Satuan</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="py-1">{it.namaSnapshot}</td>
                <td className="py-1">
                  {it.qty} {it.tipeSnapshot === "PER_KG" ? "kg" : "item"}
                </td>
                <td className="py-1">Rp{it.hargaSatuanSnapshot.toLocaleString("id-ID")}</td>
                <td className="py-1 text-right">Rp{it.subtotal.toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right font-medium">
          Total: Rp{order.totalHarga.toLocaleString("id-ID")}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-3 font-medium">Riwayat Status</h3>
        <ol className="space-y-2 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex justify-between text-slate-600">
              <span>
                {h.statusDari} &rarr; {h.statusKe}
              </span>
              <span>{new Date(h.changedAt).toLocaleString("id-ID")}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
