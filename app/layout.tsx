import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laundry Kiloan - Tracking",
  description: "Aplikasi manajemen laundry kiloan dengan tracking status cucian",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
