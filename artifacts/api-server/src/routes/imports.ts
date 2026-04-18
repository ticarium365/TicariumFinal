// Paraşüt / Bizim Hesap / Logo CSV-Excel'den SMSYSTEMS'e veri içe aktarımı
// Adım 1: /api/import/preview ile dosyayı parse et, kolon haritasını döndür
// Adım 2: /api/import/{kind} ile haritayı uygula
import { Router } from "express";
import multer from "multer";
import {
  db,
  customersTable,
  suppliersTable,
  productsTable,
  expensesTable,
  expenseCategoriesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";

function rowHash(parts: (string | number)[]): string {
  return crypto.createHash("sha1").update(parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|")).digest("hex").slice(0, 12);
}
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireWriter = requireRole(["admin", "staff", "super_admin"]);
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

// ─── CSV parser (basit, RFC 4180 yaklaşımı) ───
function parseCSV(text: string): string[][] {
  // BOM temizle
  text = text.replace(/^\uFEFF/, "");
  // Ayırıcı tahmini: ; mi , mı?
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => String(x).trim().length > 0));
}

function normalize(s: string): string {
  return String(s || "").toLowerCase().trim().replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c");
}
function toNumber(v: any): number {
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// Auto-mapping kuralları — kolon isminden hedef alana
const AUTO_MAPPINGS: Record<string, Record<string, string[]>> = {
  customers: {
    name: ["unvan", "musteri", "musteriadi", "ad", "adi", "isim", "name", "company"],
    code: ["kod", "musterikodu", "code"],
    taxNumber: ["vkn", "tckn", "vergi no", "vergino", "vergi numarasi", "tax number", "tax_no"],
    taxOffice: ["vergi dairesi", "vergidairesi", "tax office"],
    phone: ["telefon", "phone", "gsm", "tel"],
    email: ["eposta", "e-posta", "email", "mail"],
    city: ["sehir", "il", "city"],
    district: ["ilce", "district"],
    address: ["adres", "address"],
    contactPerson: ["yetkili", "contact"],
    openingBalance: ["acilis", "acilisbakiye", "bakiye", "opening", "opening balance", "balance"],
  },
  suppliers: {
    name: ["unvan", "tedarikci", "ad", "adi", "isim", "name", "company"],
    code: ["kod", "tedarikcikodu", "code"],
    taxNumber: ["vkn", "tckn", "vergi no", "vergino", "tax number"],
    taxOffice: ["vergi dairesi", "vergidairesi"],
    phone: ["telefon", "phone", "gsm", "tel"],
    email: ["eposta", "email", "mail"],
    city: ["sehir", "il", "city"],
    district: ["ilce"],
    address: ["adres", "address"],
    contactPerson: ["yetkili"],
    openingBalance: ["acilis", "acilisbakiye", "bakiye", "balance"],
  },
  products: {
    name: ["urunadi", "ad", "isim", "urun", "name"],
    productCode: ["urunkodu", "stokkodu", "kod", "sku", "code"],
    barcode: ["barkod", "barcode", "ean"],
    category: ["kategori", "category"],
    brand: ["marka", "brand"],
    purchasePrice: ["alisfiyati", "alisfiyat", "alis", "maliyet", "cost", "purchase"],
    salePrice: ["satisfiyati", "satisfiyat", "fiyat", "satis", "price", "sale"],
    stock: ["stok", "miktar", "stock", "quantity"],
    minStock: ["minstok", "minimumstok", "kritikstok", "min stock"],
  },
  expenses: {
    description: ["aciklama", "konu", "tanim", "description"],
    amount: ["tutar", "tutarbrut", "toplam", "amount", "total"],
    expenseDate: ["tarih", "fis tarihi", "fistarihi", "date"],
    category: ["kategori", "category", "tur"],
  },
};

function autoMap(headers: string[], kind: string): Record<string, number> {
  const rules = AUTO_MAPPINGS[kind] || {};
  const map: Record<string, number> = {};
  const norm = headers.map((h) => normalize(h).replace(/[\s_-]/g, ""));
  for (const [target, candidates] of Object.entries(rules)) {
    for (const cand of candidates) {
      const c = normalize(cand).replace(/[\s_-]/g, "");
      const idx = norm.findIndex((h) => h === c || h.includes(c));
      if (idx >= 0) { map[target] = idx; break; }
    }
  }
  return map;
}

// ─── PREVIEW ───
router.post("/preview", upload.single("file"), (req, res) => {
  const kind = String(req.body?.kind || "customers");
  if (!req.file) return res.status(400).json({ error: "file zorunlu" });
  if (!AUTO_MAPPINGS[kind]) return res.status(400).json({ error: "geçersiz kind" });
  const text = req.file.buffer.toString("utf-8");
  const rows = parseCSV(text);
  if (rows.length === 0) return res.status(400).json({ error: "boş dosya" });
  const headers = rows[0].map((h) => String(h).trim());
  const data = rows.slice(1, 21);
  const mapping = autoMap(headers, kind);
  res.json({
    kind, totalRows: rows.length - 1, headers, sample: data,
    mapping, fields: Object.keys(AUTO_MAPPINGS[kind]),
  });
});

// ─── IMPORT (mapping ile) ───
router.post("/run", requireWriter, upload.single("file"), async (req, res) => {
  const kind = String(req.body?.kind || "");
  const mapping = JSON.parse(String(req.body?.mapping || "{}")) as Record<string, number>;
  const dryRun = String(req.body?.dryRun || "false") === "true";
  if (!req.file) return res.status(400).json({ error: "file zorunlu" });
  if (!AUTO_MAPPINGS[kind]) return res.status(400).json({ error: "geçersiz kind" });

  const text = req.file.buffer.toString("utf-8");
  const rows = parseCSV(text);
  if (rows.length < 2) return res.status(400).json({ error: "veri satırı yok" });
  const data = rows.slice(1);
  const companyId = req.companyId!;
  const get = (row: string[], key: string) => {
    const idx = mapping[key];
    if (idx === undefined || idx < 0) return "";
    return String(row[idx] || "").trim();
  };

  const results = { created: 0, updated: 0, skipped: 0, errors: [] as any[] };

  try {
    if (kind === "customers" || kind === "suppliers") {
      const table = kind === "customers" ? customersTable : suppliersTable;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const name = get(row, "name");
        if (!name) { results.skipped++; continue; }
        const code = get(row, "code") || `IMP-${Date.now()}-${i}`;
        const values: any = {
          companyId, name, code,
          taxOffice: get(row, "taxOffice") || null,
          taxNumber: get(row, "taxNumber") || null,
          phone: get(row, "phone") || null,
          email: get(row, "email") || null,
          city: get(row, "city") || null,
          district: get(row, "district") || null,
          address: get(row, "address") || null,
          contactPerson: get(row, "contactPerson") || null,
          openingBalance: toNumber(get(row, "openingBalance")),
          currentBalance: toNumber(get(row, "openingBalance")),
        };
        if (dryRun) { results.created++; continue; }
        try {
          // VKN ile tekilleştir; yoksa name+code
          const dupWhere = values.taxNumber
            ? and(eq(table.companyId, companyId), eq(table.taxNumber, values.taxNumber))
            : and(eq(table.companyId, companyId), eq(table.name, values.name));
          const [existing] = await db.select().from(table).where(dupWhere).limit(1);
          if (existing) {
            await db.update(table).set({
              phone: values.phone || existing.phone,
              email: values.email || existing.email,
              city: values.city || existing.city,
              address: values.address || existing.address,
              taxOffice: values.taxOffice || existing.taxOffice,
              updatedAt: new Date(),
            }).where(eq(table.id, existing.id));
            results.updated++;
          } else {
            await db.insert(table).values(values);
            results.created++;
          }
        } catch (e: any) {
          results.errors.push({ row: i + 2, error: e?.message || "fail", name });
        }
      }
    } else if (kind === "products") {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const name = get(row, "name");
        if (!name) { results.skipped++; continue; }
        // Deterministic fallback: hash of name+barcode+brand so re-runs match
        const productCode = get(row, "productCode") ||
          `IMP-${rowHash([name, get(row, "barcode"), get(row, "brand")])}`;
        const values: any = {
          companyId, name, productCode,
          barcode: get(row, "barcode") || null,
          category: get(row, "category") || null,
          brand: get(row, "brand") || null,
          purchasePrice: toNumber(get(row, "purchasePrice")),
          salePrice: toNumber(get(row, "salePrice")),
          stock: Math.max(0, Math.floor(toNumber(get(row, "stock")))),
          minStock: Math.max(0, Math.floor(toNumber(get(row, "minStock")) || 5)),
        };
        if (dryRun) { results.created++; continue; }
        try {
          const [existing] = await db.select().from(productsTable).where(and(
            eq(productsTable.companyId, companyId),
            eq(productsTable.productCode, productCode),
          )).limit(1);
          if (existing) {
            await db.update(productsTable).set({
              salePrice: values.salePrice || existing.salePrice,
              purchasePrice: values.purchasePrice || existing.purchasePrice,
              stock: values.stock,
              updatedAt: new Date(),
            }).where(eq(productsTable.id, existing.id));
            results.updated++;
          } else {
            await db.insert(productsTable).values(values);
            results.created++;
          }
        } catch (e: any) {
          results.errors.push({ row: i + 2, error: e?.message || "fail", name });
        }
      }
    } else if (kind === "expenses") {
      // Kategori cache
      const catCache = new Map<string, number>();
      const ensureCat = async (catName: string): Promise<number | null> => {
        if (!catName) return null;
        const key = normalize(catName);
        if (catCache.has(key)) return catCache.get(key)!;
        const [existing] = await db.select().from(expenseCategoriesTable).where(and(
          eq(expenseCategoriesTable.companyId, companyId),
          sql`LOWER(${expenseCategoriesTable.name}) = LOWER(${catName})`,
        )).limit(1);
        if (existing) { catCache.set(key, existing.id); return existing.id; }
        const [created] = await db.insert(expenseCategoriesTable).values({
          companyId, name: catName, isActive: true,
        }).returning();
        catCache.set(key, created.id);
        return created.id;
      };

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const description = get(row, "description") || `Aktarılan gider ${i + 1}`;
        const amount = toNumber(get(row, "amount"));
        if (amount <= 0) { results.skipped++; continue; }
        const dateStr = get(row, "expenseDate");
        let expenseDate = new Date();
        if (dateStr) {
          const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(dateStr) ||
                    /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr);
          if (m) {
            if (m[1].length === 4) expenseDate = new Date(+m[1], +m[2] - 1, +m[3]);
            else expenseDate = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
          }
        }
        // Deterministic dedup key: date+amount+description
        const dedupKey = `IMP:${rowHash([
          expenseDate.toISOString().slice(0, 10),
          amount.toFixed(2),
          description,
          get(row, "category"),
        ])}`;
        if (dryRun) { results.created++; continue; }
        try {
          const catId = await ensureCat(get(row, "category"));
          // notes alanına dedup anahtarını koy → re-run'da tekilleştir
          const [existing] = await db.select().from(expensesTable).where(and(
            eq(expensesTable.companyId, companyId),
            eq(expensesTable.notes, dedupKey),
          )).limit(1);
          if (existing) {
            await db.update(expensesTable).set({
              amount: String(amount), categoryId: catId, expenseDate,
            }).where(eq(expensesTable.id, existing.id));
            results.updated++;
          } else {
            await db.insert(expensesTable).values({
              companyId, description, amount: String(amount),
              expenseDate, categoryId: catId,
              createdBy: req.session.user!.id, notes: dedupKey,
            });
            results.created++;
          }
        } catch (e: any) {
          results.errors.push({ row: i + 2, error: e?.message || "fail", description });
        }
      }
    } else {
      return res.status(400).json({ error: "desteklenmeyen kind" });
    }

    res.json({ ok: true, dryRun, kind, ...results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "fail", partial: results });
  }
});

export default router;
