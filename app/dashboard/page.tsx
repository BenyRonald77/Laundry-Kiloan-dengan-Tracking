"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";

interface PriceList {
  id: string;
  nama: string;
  tipe: string;
  harga: number;
}

interface OrderRow {
  id: string;
  kodeTracking: string;
  status: string;
  totalHarga: number;
  createdAt: string;
  customer: { nama: string; telepon: string };
  items: { id: string }[];
}

const TABS = ["ALL", ...STATUS_ORDER] as const;

export default function DashboardPage() {
  const [tab, setTab] = useState<string>("ALL");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function loadOrders(status: string) {
    setLoading(true);
    const qs = status === "ALL" ? "" : `?status=${status}`;
    const res = await fetch(`/api/orders${qs}`);
    const data = await res.json();
    setOrders(data.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders(tab);
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Daftar Order</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          {showForm ? "Tutup Form" : "+ Buat Order Baru"}
        </button>
      </div>

      {showForm && (
        <CreateOrderForm
          onCreated={() => {
            setShowForm(false);
            loadOrders(tab);
          }}
        />
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t === "ALL" ? "Semua" : STATUS_LABEL[t as keyof typeof STATUS_LABEL]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada order.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Kode Tracking</th>
                <th className="px-4 py-2">Pelanggan</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono">{o.kodeTracking}</td>
                  <td className="px-4 py-2">{o.customer.nama}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {STATUS_LABEL[o.status as keyof typeof STATUS_LABEL] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">Rp{o.totalHarga.toLocaleString("id-ID")}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/dashboard/orders/${o.id}`} className="text-slate-900 underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateOrderForm({ onCreated }: { onCreated: () => void }) {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [customerNama, setCustomerNama] = useState("");
  const [customerTelepon, setCustomerTelepon] = useState("");
  const [items, setItems] = useState<{ priceListId: string; qty: number }[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/pricelist")
      .then((r) => r.json())
      .then((d) => setPriceLists(d.priceLists ?? []));
  }, []);

  function addItem() {
    if (priceLists.length === 0) return;
    setItems((prev) => [...prev, { priceListId: priceLists[0].id, qty: 1 }]);
  }

  function updateItem(idx: number, patch: Partial<{ priceListId: string; qty: number }>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((sum, it) => {
    const pl = priceLists.find((p) => p.id === it.priceListId);
    return sum + (pl ? pl.harga * it.qty : 0);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerNama || !customerTelepon) {
      setError("Nama dan telepon pelanggan wajib diisi");
      return;
    }
    if (items.length === 0) {
      setError("Tambahkan minimal 1 item");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerNama, customerTelepon, items }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gagal membuat order");
      return;
    }
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Nama Pelanggan</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={customerNama}
            onChange={(e) => setCustomerNama(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Telepon</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={customerTelepon}
            onChange={(e) => setCustomerTelepon(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Item</label>
          <button
            type="button"
            onClick={addItem}
            className="text-sm text-slate-900 underline"
          >
            + tambah item
          </button>
        </div>
        {items.map((it, idx) => {
          const pl = priceLists.find((p) => p.id === it.priceListId);
          return (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={it.priceListId}
                onChange={(e) => updateItem(idx, { priceListId: e.target.value })}
              >
                {priceLists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama} ({p.tipe === "PER_KG" ? "per kg" : "per item"}) - Rp
                    {p.harga.toLocaleString("id-ID")}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.1}
                step={0.1}
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={it.qty}
                onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
              />
              <span className="w-28 text-right text-sm text-slate-600">
                Rp{pl ? (pl.harga * it.qty).toLocaleString("id-ID") : 0}
              </span>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-sm text-red-500"
              >
                hapus
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="font-medium">Total: Rp{total.toLocaleString("id-ID")}</span>
        <div className="flex gap-2">
          {error && <p className="self-center text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Menyimpan..." : "Simpan Order"}
          </button>
        </div>
      </div>
    </form>
  );
}
