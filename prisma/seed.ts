import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash },
  });

  const priceLists: { nama: string; tipe: string; harga: number }[] = [
    { nama: "Cuci Kering Reguler", tipe: "PER_KG", harga: 7000 },
    { nama: "Cuci Setrika Reguler", tipe: "PER_KG", harga: 9000 },
    { nama: "Cuci Express", tipe: "PER_KG", harga: 15000 },
    { nama: "Selimut", tipe: "PER_ITEM", harga: 25000 },
    { nama: "Bed Cover", tipe: "PER_ITEM", harga: 30000 },
    { nama: "Jaket Tebal", tipe: "PER_ITEM", harga: 20000 },
  ];

  for (const p of priceLists) {
    const existing = await prisma.priceList.findFirst({ where: { nama: p.nama } });
    if (!existing) {
      await prisma.priceList.create({ data: p });
    }
  }

  console.log("Seed selesai. Login admin: admin / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
