import { Router, Request, Response } from "express";
import {
  db, suppliersTable, supplierTransactionsTable,
  purchasesTable, purchaseItemsTable, productsTable, stockMovementsTable,
} from "@workspace/db";
import { eq, and, desc, count, sql, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ FATURALARI LİSTESİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { supplierId, page = "1", limit = "50", from, to } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(purchasesTable.companyId, cid)];
    if (supplierId) conditions.push(eq(purchasesTable.supplierId, parseInt(String(supplierId))));
    if (from) conditions.push(gte(purchasesTable.invoiceDate, new Date(String(from))));
    if (to) {
      const toDate = new Date(String(to));
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(purchasesTable.invoiceDate, toDate));
    }
    const whereClause = and(...conditions);

    const [purchases, totalResult] = await Promise.all([
      db.select().from(purchasesTable).where(whereClause)
        .orderBy(desc(purchasesTable.invoiceDate)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(purchasesTable).where(whereClause),
    ]);

    // Tedarikçi adlarını getir
    const supplierIds = [...new Set(purchases.map(p => p.supplierId))];
    const suppliers = supplierIds.length > 0
      ? await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable)
          .where(eq(suppliersTable.companyId, cid))
      : [];

    const suppMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));
    const enriched = purchases.map(p => ({ ...p, supplierName: suppMap[p.supplierId] ?? "" }));

    res.json({
      purchases: enriched,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List purchases error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ FATURASI DETAYI
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [purchase] = await db.select().from(purchasesTable)
      .where(and(eq(purchasesTable.id, id), eq(purchasesTable.companyId, cid)));
    if (!purchase) return void res.status(404).json(Errors.notFound("Alış faturası"));

    const items = await db.select().from(purchaseItemsTable)
      .where(and(eq(purchaseItemsTable.purchaseId, id), eq(purchaseItemsTable.companyId, cid)));

    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, purchase.supplierId), eq(suppliersTable.companyId, cid)));

    res.json({ purchase, items, supplier });
  } catch (err) {
    req.log?.error({ err }, "Get purchase error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ FATURASI OLUŞTURMA
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole(["admin", "staff"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { supplierId, invoiceNo, invoiceDate, items, taxAmount, discountAmount, note } = req.body;

    if (!supplierId) return void res.status(400).json(Errors.badRequest("Tedarikçi seçilmedi"));
    if (!items || !Array.isArray(items) || items.length === 0)
      return void res.status(400).json(Errors.badRequest("En az bir ürün kalemi giriniz"));
    if (!invoiceDate) return void res.status(400).json(Errors.badRequest("Fatura tarihi zorunludur"));

    const [supplier] = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.id, parseInt(supplierId)), eq(suppliersTable.companyId, cid)));
    if (!supplier) return void res.status(404).json(Errors.notFound("Tedarikçi"));
    if (!supplier.isActive) return void res.status(400).json(Errors.badRequest("Pasif tedarikçiye fatura girilemiyor"));

    // Ürünleri doğrula
    const productIds = items.map((it: { productId: number }) => it.productId);
    const products = await db.select().from(productsTable)
      .where(and(eq(productsTable.companyId, cid)));
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    for (const item of items) {
      const p = productMap[item.productId];
      if (!p) return void res.status(404).json(Errors.notFound(`Ürün (ID: ${item.productId})`));
      if (!p.isActive) return void res.status(400).json(Errors.badRequest(`Pasif ürüne alış girilemez: ${p.name}`));
      if (!item.quantity || item.quantity <= 0) return void res.status(400).json(Errors.badRequest("Miktar 0'dan büyük olmalı"));
      if (item.unitCost === undefined || item.unitCost < 0) return void res.status(400).json(Errors.badRequest("Birim maliyet geçersiz"));
    }

    const tax = parseFloat(taxAmount) || 0;
    const discount = parseFloat(discountAmount) || 0;
    const subtotal = items.reduce((s: number, it: { quantity: number; unitCost: number }) =>
      s + it.quantity * it.unitCost, 0);
    const total = subtotal + tax - discount;

    // Fatura oluştur
    const [purchase] = await db.insert(purchasesTable).values({
      companyId: cid,
      supplierId: parseInt(supplierId),
      invoiceNo: invoiceNo || null,
      invoiceDate: new Date(invoiceDate),
      subtotalAmount: subtotal,
      taxAmount: tax,
      discountAmount: discount,
      totalAmount: total,
      paymentStatus: "unpaid",
      note: note || null,
      createdBy: req.session.user.id,
    }).returning();

    // Kalemleri oluştur + stok güncelle + maliyet güncelle
    for (const item of items) {
      const product = productMap[item.productId];
      const lineTotal = item.quantity * item.unitCost;

      await db.insert(purchaseItemsTable).values({
        companyId: cid,
        purchaseId: purchase.id,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineTotal,
      });

      // Stok artır
      await db.update(productsTable)
        .set({ stock: product.stock + item.quantity, purchasePrice: item.unitCost, updatedAt: new Date() })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.companyId, cid)));

      // Stok hareketi
      await db.insert(stockMovementsTable).values({
        companyId: cid,
        productId: item.productId,
        productName: product.name,
        productCode: product.productCode,
        type: "in",
        quantity: item.quantity,
        note: `Alış faturası #${purchase.id}${invoiceNo ? ` (${invoiceNo})` : ""}`,
        createdBy: req.session.user.id,
      });

      await audit({ req, action: "PRODUCT_COST_UPDATED", entity: "product", entityId: item.productId,
        details: { newCost: item.unitCost, purchaseId: purchase.id } });
    }

    // Tedarikçi debit transaction
    await db.insert(supplierTransactionsTable).values({
      companyId: cid,
      supplierId: parseInt(supplierId),
      type: "purchase",
      direction: "debit",
      amount: total,
      referenceType: "purchase",
      referenceId: purchase.id,
      description: `Alış faturası${invoiceNo ? ` ${invoiceNo}` : ""}`,
      createdBy: req.session.user.id,
    });

    // Tedarikçi bakiyesi güncelle
    const balRows = await db.select({
      debit: sql<number>`COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END), 0)`,
      credit: sql<number>`COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0)`,
    }).from(supplierTransactionsTable).where(and(
      eq(supplierTransactionsTable.supplierId, parseInt(supplierId)),
      eq(supplierTransactionsTable.companyId, cid),
    ));
    const newBalance = Number(balRows[0]?.debit ?? 0) - Number(balRows[0]?.credit ?? 0);
    await db.update(suppliersTable).set({ currentBalance: newBalance, updatedAt: new Date() })
      .where(and(eq(suppliersTable.id, parseInt(supplierId)), eq(suppliersTable.companyId, cid)));

    await audit({ req, action: "PURCHASE_CREATE", entity: "purchase", entityId: purchase.id,
      details: { supplierId, total, itemCount: items.length } });

    res.status(201).json({ purchase, newSupplierBalance: newBalance });
  } catch (err) {
    req.log?.error({ err }, "Create purchase error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SON ALIŞLAR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/recent", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const purchases = await db.select().from(purchasesTable)
      .where(eq(purchasesTable.companyId, cid))
      .orderBy(desc(purchasesTable.invoiceDate)).limit(10);
    res.json({ purchases });
  } catch (err) {
    req.log?.error({ err }, "Recent purchases error");
    res.status(500).json(Errors.internal());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALIŞ ÖZETI (son 30 gün)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/summary", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await db.select({
      totalPurchases: count(),
      totalAmount: sql<number>`COALESCE(SUM(total_amount), 0)`,
    }).from(purchasesTable).where(and(
      eq(purchasesTable.companyId, cid),
      gte(purchasesTable.invoiceDate, since),
    ));
    res.json({
      last30Days: {
        purchaseCount: rows[0]?.totalPurchases ?? 0,
        totalAmount: Number(rows[0]?.totalAmount ?? 0),
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Purchase summary error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
