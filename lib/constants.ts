export const STATUS_ORDER = [
  "DITERIMA",
  "DICUCI",
  "DISETRIKA",
  "SIAP_DIAMBIL",
  "DIAMBIL",
] as const;

export type StatusOrder = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<StatusOrder, string> = {
  DITERIMA: "Diterima",
  DICUCI: "Dicuci",
  DISETRIKA: "Disetrika",
  SIAP_DIAMBIL: "Siap Diambil",
  DIAMBIL: "Diambil",
};

export function nextStatus(current: StatusOrder): StatusOrder | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

export const TIPE_HARGA = ["PER_KG", "PER_ITEM"] as const;
export type TipeHarga = (typeof TIPE_HARGA)[number];

export const NOTIFICATION_TYPE = {
  SIAP_DIAMBIL: "SIAP_DIAMBIL",
} as const;
