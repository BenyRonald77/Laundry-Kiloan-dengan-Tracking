"use client";

import { useState } from "react";
import { STATUS_LABEL, StatusOrder } from "@/lib/constants";

interface TrackResult {
  kodeTracking: string;
  status: StatusOrder;
  totalHarga: number;
  createdAt: string;
  items: { nama: string; tipe: string; qty: number; subtotal: number }[];
  history: { statusKe: string; changedAt: string }[];
}

export default function TrackPage() {
  const [kode, setKode] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kode.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    const res = await fetch(`/api/track/${encodeURIComponent(kode.trim())}`);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kode tracking tidak ditemukan");
      return;
    }
    const data = await res.json();
    setResult(data.order);
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Cek Status Cucian</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="Masukkan kode tracking (LK-XXXXXXXX)"
          value={kode}
          onChange={(e) => setKode(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Cek
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-mono font-semibold">{result.kodeTracking}</h2>
            <span className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
              {STATUS_LABEL[result.status] ?? result.status}
            </span>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-500">Item</h3>
            <ul className="space-y-1 text-sm">
              {result.items.map((it, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>
                    {it.nama} ({it.qty} {it.tipe === "PER_KG" ? "kg" : "item"})
                  </span>
                  <span>Rp{it.subtotal.toLocaleString("id-ID")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right font-medium">
              Total: Rp{result.totalHarga.toLocaleString("id-ID")}
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-500">Riwayat</h3>
            <ol className="space-y-1 text-sm text-slate-600">
              {result.history.map((h, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{STATUS_LABEL[h.statusKe as StatusOrder] ?? h.statusKe}</span>
                  <span>{new Date(h.changedAt).toLocaleString("id-ID")}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
