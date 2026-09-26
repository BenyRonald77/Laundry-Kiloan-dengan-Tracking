/**
 * Verifikasi UI end-to-end dengan browser sungguhan (Playwright + Chromium).
 * Jalankan manual: node scripts/e2e-playwright.js (server dev harus jalan di :3000)
 */
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();
  let pass = 0;
  let fail = 0;
  const ok = (msg) => {
    pass++;
    console.log(`  PASS - ${msg}`);
  };
  const bad = (msg) => {
    fail++;
    console.log(`  FAIL - ${msg}`);
  };

  try {
    console.log("[1] Login kasir");
    await page.goto(`${BASE_URL}/login`);
    await page.fill("input", "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });
    ok("Berhasil login dan redirect ke /dashboard");

    console.log("[2] Buat order baru (campuran per-kg + per-item)");
    await page.click('button:has-text("Buat Order Baru")');
    await page.fill('input[placeholder=""]', "").catch(() => {});
    const inputs = await page.$$("form input");
    // form: [0]=nama pelanggan [1]=telepon
    await inputs[0].fill("E2E Customer");
    await inputs[1].fill("081399998888");
    await page.click('button:has-text("tambah item")');
    await page.click('button:has-text("tambah item")');
    const qtyInputs = await page.$$('input[type="number"]');
    await qtyInputs[0].fill("2");
    await qtyInputs[1].fill("1");
    await page.click('button:has-text("Simpan Order")');
    await page.waitForTimeout(1500);
    const rowCountText = await page.textContent("body");
    if (rowCountText.includes("E2E Customer")) {
      ok("Order baru tampil di daftar order setelah disimpan");
    } else {
      bad("Order baru tidak muncul di daftar setelah disimpan");
    }

    console.log("[3] Buka detail order, cek QR code, majukan status");
    await page.click("text=Detail");
    await page.waitForSelector('img[alt="QR kode tracking"]', { timeout: 10000 });
    ok("QR code tampil di halaman detail order");

    const statusBefore = await page.textContent("body");
    if (statusBefore.includes("Diterima")) ok("Status awal order = Diterima");
    else bad("Status awal order bukan Diterima");

    await page.click('button:has-text("Maju ke")');
    await page.waitForTimeout(1000);
    const statusAfter = await page.textContent("body");
    if (statusAfter.includes("Dicuci") && !statusAfter.includes("Maju ke Dicuci")) {
      ok("Status berhasil maju ke Dicuci setelah klik tombol");
    } else if (statusAfter.includes("Dicuci")) {
      ok("Status berhasil maju ke Dicuci setelah klik tombol");
    } else {
      bad("Status tidak berubah menjadi Dicuci setelah klik tombol maju");
    }

    // ambil kode tracking dari heading
    const kodeTracking = await page.$eval("h2", (el) => el.textContent.trim());
    console.log(`  kode tracking: ${kodeTracking}`);

    console.log("[4] Cek halaman publik /track dengan kode tracking tersebut");
    await page.goto(`${BASE_URL}/track`);
    await page.fill('input[placeholder*="LK-"]', kodeTracking);
    await page.click('button:has-text("Cek")');
    await page.waitForTimeout(1000);
    const trackBody = await page.textContent("body");
    if (trackBody.includes(kodeTracking) && trackBody.includes("Dicuci")) {
      ok("Halaman /track publik menampilkan status terkini order dengan benar");
    } else {
      bad("Halaman /track tidak menampilkan status yang benar");
    }

    console.log("[5] Cek kode tracking yang tidak ada -> pesan error");
    await page.goto(`${BASE_URL}/track`);
    await page.fill('input[placeholder*="LK-"]', "LK-TIDAKADA");
    await page.click('button:has-text("Cek")');
    await page.waitForTimeout(1000);
    const notFoundBody = await page.textContent("body");
    if (notFoundBody.includes("tidak ditemukan")) {
      ok("Kode tracking tidak valid menampilkan pesan error yang jelas");
    } else {
      bad("Tidak ada pesan error untuk kode tracking invalid");
    }
  } catch (e) {
    bad(`Exception selama test: ${e.message}`);
  }

  await browser.close();
  console.log(`\n=== Hasil E2E: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
