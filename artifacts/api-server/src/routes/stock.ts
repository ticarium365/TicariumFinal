import { Router, Request, Response } from "express";
import { db, productsTable, stockMovementsTable, auditLogsTable } from "@workspace/db";
import { eq, desc, and, count, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import multer from "multer";
import * as XLSX from "xlsx";

const router = Router();

// ---------------------------------------------------------------------------
// Mevcut endpointler
// ---------------------------------------------------------------------------

router.post("/entry", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { productId, quantity, purchasePrice, note } = req.body;
    if (!productId || !quantity) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Ürün ve miktar zorunlu", details: null } });
      return;
    }
    const qty = parseInt(quantity);
    if (qty <= 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Miktar 0'dan büyük olmalı", details: null } });
      return;
    }

    const [product] = await db.select().from(productsTable).where(
      and(eq(productsTable.id, parseInt(productId)), eq(productsTable.companyId, cid))
    );
    if (!product) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Ürün bulunamadı", details: null } });
      return;
    }

    const newStock = product.stock + qty;
    const updateData: any = { stock: newStock, updatedAt: new Date(), lastStockInAt: new Date() };
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      updateData.purchasePrice = parseFloat(purchasePrice);
    }

    await db.update(productsTable).set(updateData).where(eq(productsTable.id, product.id));

    const [movement] = await db.insert(stockMovementsTable).values({
      companyId: cid,
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      type: "purchase",
      quantity: qty,
      note: note || null,
      createdBy: req.session.user?.fullName || req.session.user?.username,
    }).returning();

    res.status(201).json({ message: "Stok girişi kaydedildi", movement, newStock });
  } catch (err) {
    req.log?.error({ err }, "Stock entry error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

router.post("/correction", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { productId, newStock, note } = req.body;
    if (!productId || newStock === undefined) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Ürün ve yeni stok zorunlu", details: null } });
      return;
    }

    const [product] = await db.select().from(productsTable).where(
      and(eq(productsTable.id, parseInt(productId)), eq(productsTable.companyId, cid))
    );
    if (!product) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Ürün bulunamadı", details: null } });
      return;
    }

    const targetStock = parseInt(newStock);
    const diff = targetStock - product.stock;

    await db.update(productsTable)
      .set({ stock: targetStock, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));

    const [movement] = await db.insert(stockMovementsTable).values({
      companyId: cid,
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      type: "correction",
      quantity: diff,
      note: note || "Stok düzeltme",
      createdBy: req.session.user?.fullName || req.session.user?.username,
    }).returning();

    res.status(201).json({ message: "Stok düzeltildi", movement, newStock: targetStock });
  } catch (err) {
    req.log?.error({ err }, "Stock correction error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

router.get("/movements", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { productId, type, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(stockMovementsTable.companyId, cid)];
    if (productId) conditions.push(eq(stockMovementsTable.productId, parseInt(String(productId))));
    if (type) conditions.push(eq(stockMovementsTable.type, String(type)));

    const whereClause = and(...conditions);

    const [movements, totalResult] = await Promise.all([
      db.select().from(stockMovementsTable)
        .where(whereClause)
        .orderBy(desc(stockMovementsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: count() }).from(stockMovementsTable).where(whereClause),
    ]);

    res.json({
      movements,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List movements error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// Toplu Stok Güncelleme
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Yalnızca .xlsx, .xls veya .csv dosyaları kabul edilir") as any, ok);
  },
});

// GET /api/stock/import-template
router.get("/import-template", requireAuth, requireRole(["admin"]), (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const headers = ["product_code", "barcode", "quantity", "mode", "note"];
  const exampleRows = [
    ["PRO-001", "", "10", "set", "Yıllık sayım"],
    ["PRO-002", "", "5", "add", "Yeni alım"],
    ["PRO-003", "", "3", "subtract", "Fire/zarar"],
    ["", "1234567890123", "0", "set", "Stok sıfırlama"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
  ws["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];

  // Kılavuz sayfası
  const guide = XLSX.utils.aoa_to_sheet([
    ["Alan", "Açıklama"],
    ["product_code", "Ürün kodu (öncelikli eşleme)"],
    ["barcode", "Barkod (product_code bulunamazsa kullanılır)"],
    ["quantity", "Miktar (0 veya pozitif tam sayı)"],
    ["mode", "set = stoku bu değere çek | add = mevcut stoğa ekle | subtract = mevcut stoktan düş"],
    ["note", "İsteğe bağlı açıklama"],
  ]);
  guide["!cols"] = [{ wch: 18 }, { wch: 70 }];

  XLSX.utils.book_append_sheet(wb, ws, "Toplu Stok");
  XLSX.utils.book_append_sheet(wb, guide, "Kılavuz");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="toplu-stok-sablonu.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// Satır parse yardımcısı
function colVal(row: Record<string, any>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// POST /api/stock/import?dryRun=true|false
router.post(
  "/import",
  requireAuth,
  requireRole(["admin"]),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const cid = req.companyId;
      const dryRun = req.query.dryRun === "true";

      if (!req.file) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Dosya gerekli", details: null } });
        return;
      }

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Dosya boş veya geçersiz", details: null } });
        return;
      }

      // Şirkete ait tüm aktif ürünleri bir kere çek (hızlı lookup)
      const allProducts = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.companyId, cid), eq(productsTable.isActive, true)));

      const byCode = new Map(allProducts.map((p) => [p.productCode.toLowerCase(), p]));
      const byBarcode = new Map(allProducts.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p]));

      type RowResult = {
        row: number;
        productCode: string;
        productName: string;
        mode: string;
        quantity: number;
        currentStock: number;
        newStock: number;
        note: string;
      };

      const toProcess: RowResult[] = [];
      const errors: { row: number; code: string; message: string }[] = [];
      const VALID_MODES = ["set", "add", "subtract"];

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // Excel row (başlık = 1)
        const row = rows[i]!;

        const productCode = colVal(row, "product_code", "productCode", "Ürün Kodu", "urun_kodu");
        const barcode = colVal(row, "barcode", "Barkod", "barkod");
        const qtyRaw = colVal(row, "quantity", "Miktar", "miktar", "qty");
        const mode = colVal(row, "mode", "Mod", "mod").toLowerCase();
        const note = colVal(row, "note", "Not", "not");

        if (!productCode && !barcode) {
          errors.push({ row: rowNum, code: "MISSING_IDENTIFIER", message: "product_code veya barcode gerekli" });
          continue;
        }

        if (!VALID_MODES.includes(mode)) {
          errors.push({ row: rowNum, code: "INVALID_MODE", message: `Geçersiz mod: "${mode}". Geçerli değerler: set, add, subtract` });
          continue;
        }

        const qty = Number(qtyRaw);
        if (isNaN(qty) || !Number.isInteger(qty) || qty < 0) {
          errors.push({ row: rowNum, code: "INVALID_QUANTITY", message: `Geçersiz miktar: "${qtyRaw}". 0 veya pozitif tam sayı olmalı` });
          continue;
        }

        // Ürün eşleme
        let product = productCode ? byCode.get(productCode.toLowerCase()) : undefined;
        if (!product && barcode) product = byBarcode.get(barcode.toLowerCase());

        if (!product) {
          errors.push({ row: rowNum, code: "PRODUCT_NOT_FOUND", message: `Ürün bulunamadı: "${productCode || barcode}"` });
          continue;
        }

        // Yeni stok hesapla
        let newStock: number;
        if (mode === "set") newStock = qty;
        else if (mode === "add") newStock = product.stock + qty;
        else newStock = product.stock - qty; // subtract

        if (newStock < 0) {
          errors.push({
            row: rowNum,
            code: "NEGATIVE_STOCK",
            message: `${product.productCode}: mevcut stok ${product.stock}, ${qty} düşülünce negatife düşer`,
          });
          continue;
        }

        toProcess.push({
          row: rowNum,
          productCode: product.productCode,
          productName: product.name,
          mode,
          quantity: qty,
          currentStock: product.stock,
          newStock,
          note,
        });
      }

      // Dry-run: sadece önizleme döndür
      if (dryRun) {
        res.json({
          dryRun: true,
          total: rows.length,
          willUpdate: toProcess.length,
          skipped: rows.length - toProcess.length - errors.length,
          errors,
          preview: toProcess,
        });
        return;
      }

      // Gerçek import
      let updated = 0;

      for (const item of toProcess) {
        const product = byCode.get(item.productCode.toLowerCase())!;
        const diff = item.newStock - item.currentStock;
        const movType = item.mode === "add" ? "purchase" : "correction";

        await db.update(productsTable)
          .set({ stock: item.newStock, updatedAt: new Date() })
          .where(eq(productsTable.id, product.id));

        await db.insert(stockMovementsTable).values({
          companyId: cid,
          productId: product.id,
          productName: product.name,
          productCode: product.productCode,
          type: movType,
          quantity: diff,
          note: item.note || `Toplu stok - ${item.mode}`,
          createdBy: req.session.user?.fullName || req.session.user?.username,
        });

        updated++;
      }

      // Audit log
      await db.insert(auditLogsTable).values({
        companyId: cid,
        userId: req.session.user?.id,
        username: req.session.user?.username,
        action: "BULK_STOCK_IMPORT",
        entity: "stock",
        details: JSON.stringify({ total: rows.length, updated, errors: errors.length, filename: req.file.originalname }),
        ipAddress: req.ip,
      });

      res.json({
        dryRun: false,
        total: rows.length,
        updated,
        skipped: rows.length - updated - errors.length,
        errors,
      });
    } catch (err: any) {
      if (err.message?.includes("xlsx") || err.message?.includes("csv")) {
        res.status(400).json({ error: { code: "INVALID_FILE", message: "Dosya okunamadı. Geçerli bir Excel veya CSV dosyası yükleyin.", details: null } });
        return;
      }
      req.log?.error({ err }, "Stock bulk import error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
    }
  }
);

export default router;
