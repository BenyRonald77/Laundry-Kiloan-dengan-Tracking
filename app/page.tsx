import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Laundry Kiloan &amp; Tracking</h1>
      <p className="max-w-md text-slate-600">
        Kelola order laundry, cek harga otomatis, dan pantau status cucian dari
        diterima sampai diambil.
      </p>
      <div className="flex gap-4">
        <Link
          href="/track"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-700"
        >
          Cek Status Cucian
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-100"
        >
          Login Kasir
        </Link>
      </div>
    </main>
  );
}
