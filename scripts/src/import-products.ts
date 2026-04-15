import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

import { db, productsTable } from "@workspace/db";

const FILE_PATH = "/home/runner/workspace/attached_assets/Prosan_End_1776259040522.xlsx";

function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

async function main() {
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets["GENEL"];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Başlık satırını atla, ürün kodu boş olanları filtrele
  const rows = rawData.slice(1).filter((r: any) => r[0]) as any[][];

  console.log(`Toplam ${rows.length} ürün okundu.`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of rows) {
    const productCode = String(r[0]).trim();

    // --- İsim ---
    const nameParts: string[] = [];
    if (r[2]) nameParts.push(String(r[2]).trim()); // ÜRÜN ADI
    else if (r[4]) nameParts.push(String(r[4]).trim()); // CİNS (yedek)
    if (r[6]) nameParts.push(String(r[6]).trim()); // RENK
    if (!r[2] && r[7]) nameParts.push(String(r[7]).trim()); // AMBALAJ (ürün adı yoksa)
    const name = nameParts.filter(Boolean).join(" ").trim() || productCode;

    // --- Marka / Kategori ---
    const brand: string | null = r[3] ? String(r[3]).trim() : null;
    const category: string | null = r[5] ? String(r[5]).trim() : null;

    // --- Açıklama ---
    const descParts: string[] = [];
    if (r[4] && r[2]) descParts.push(String(r[4]).trim()); // CİNS varsa açıklamaya
    if (r[7]) descParts.push(String(r[7]).trim()); // AMBALAJ
    if (r[8]) descParts.push(String(r[8]).trim()); // ÖLÇÜ
    const description: string | null = descParts.join(" | ").trim() || null;

    // --- Stok ---
    const stock = r[9] !== undefined && r[9] !== null && r[9] !== "" ? parseInt(String(r[9])) : 0;

    // --- Fiyatlar ---
    const purchasePrice = parsePrice(r[11]) ?? parsePrice(r[10]) ?? 0;
    let salePrice = parsePrice(r[12]);
    if (!salePrice && purchasePrice > 0) {
      // Satış fiyatı yoksa alışın %30 üzeri
      salePrice = Math.round(purchasePrice * 1.3 * 100) / 100;
    }
    if (!salePrice) salePrice = 0;

    const profitPercent =
      purchasePrice > 0
        ? Math.round(((salePrice - purchasePrice) / purchasePrice) * 100 * 100) / 100
        : 0;

    try {
      await db
        .insert(productsTable)
        .values({
          productCode,
          name,
          brand,
          category,
          description,
          stock,
          minStock: 2,
          purchasePrice,
          salePrice,
          profitPercent,
          barcode: null,
        })
        .onConflictDoNothing();
      inserted++;
    } catch (e: any) {
      console.error(`  HATA [${productCode}]: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n✓ Eklendi : ${inserted}`);
  console.log(`  Atlandı : ${skipped}`);
  console.log(`  Hata    : ${errors}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
