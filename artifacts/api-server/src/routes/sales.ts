import { Router, Request, Response } from "express";
import { db, salesTable, productsTable, stockMovementsTable, customersTable, customerTransactionsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { idempotencyMiddleware } from "../middlewares/idempotency.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

router.get("/daily-stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const days = Math.min(parseInt(String(req.query.days || "30")), 90);
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        date: sql<string>`DATE(${salesTable.createdAt} AT TIME ZONE 'Europe/Istanbul')`,
        revenue: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
        profit: sql<number>`COALESCE(SUM(${salesTable.profit}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(salesTable)
      .where(and(eq(salesTable.companyId, cid), gte(salesTable.createdAt, since)))
      .groupBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'Europe/Istanbul')`)
      .orderBy(sql`DATE(${salesTable.createdAt} AT TIME ZONE 'Europe/Istanbul')`);

    const result: { date: string; revenue: number; profit: number; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = rows.find(r => r.date === dateStr);
      result.push({
        date: dateStr,
        revenue: found ? Number(found.revenue) : 0,
        profit: found ? Number(found.profit) : 0,
        count: found ? found.count : 0,
      });
    }

    res.json(result);
  } catch (err) {
    req.log?.error({ err }, "Get daily stats error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/today", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sales = await db
      .select()
      .from(salesTable)
      .where(and(
        eq(salesTable.companyId, cid),
        gte(salesTable.createdAt, today),
        lte(salesTable.createdAt, tomorrow)
      ))
      .orderBy(desc(salesTable.createdAt));

    const totalQuantity = sales.reduce((s, item) => s + item.quantity, 0);
    const grossRevenue = sales.reduce((s, item) => s + item.totalPrice, 0);
    const netRevenue = sales.reduce((s, item) => s + (item.purchasePrice * item.quantity), 0);
    const totalProfit = grossRevenue - netRevenue;
    const profitPercent = netRevenue > 0 ? (totalProfit / netRevenue) * 100 : 0;

    res.json({ totalSales: sales.length, totalQuantity, grossRevenue, netRevenue, totalProfit, profitPercent, sales });
  } catch (err) {
    req.log?.error({ err }, "Get today sales error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** Tek gün için tam özet: tüm satırları çekmeden top ürün + saat dağılımı + ciro (Satış Geçmişi widget'ları). */
router.get("/day-summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Bad Request", message: "date=YYYY-MM-DD gerekli" });
    }
    const saleTypeRaw = req.query.saleType;
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const rangeConds = [
      eq(salesTable.companyId, cid),
      gte(salesTable.createdAt, dayStart),
      lte(salesTable.createdAt, dayEnd),
    ];
    if (saleTypeRaw === "wholesale" || saleTypeRaw === "retail") {
      rangeConds.push(eq(salesTable.saleType, String(saleTypeRaw)));
    }
    const rangeWhere = and(...rangeConds);

    const hourExpr = sql<number>`(extract(hour from (${salesTable.createdAt} at time zone 'Europe/Istanbul')))::int`;

    const [[totalRow], [validAgg], [returnedRow], topRows, hourRows] = await Promise.all([
      db.select({ c: count() }).from(salesTable).where(rangeWhere),
      db.select({
        revenue: sql<number>`coalesce(sum(${salesTable.totalPrice}), 0)::double precision`,
        profit: sql<number>`coalesce(sum(${salesTable.profit}), 0)::double precision`,
        cnt: sql<number>`count(*)::int`,
      }).from(salesTable).where(and(rangeWhere, eq(salesTable.returned, false))),
      db.select({ c: count() }).from(salesTable).where(and(rangeWhere, eq(salesTable.returned, true))),
      db
        .select({
          name: salesTable.productName,
          qty: sql<number>`sum(${salesTable.quantity})::int`,
          revenue: sql<number>`coalesce(sum(${salesTable.totalPrice}), 0)::double precision`,
        })
        .from(salesTable)
        .where(and(rangeWhere, eq(salesTable.returned, false)))
        .groupBy(salesTable.productName)
        .orderBy(desc(sql`sum(${salesTable.quantity})`))
        .limit(5),
      db
        .select({
          hour: hourExpr,
          cnt: sql<number>`count(*)::int`,
        })
        .from(salesTable)
        .where(and(rangeWhere, eq(salesTable.returned, false)))
        .groupBy(hourExpr),
    ]);

    const hourBuckets = Array.from({ length: 24 }, () => 0);
    for (const row of hourRows) {
      const h = Number(row.hour);
      const c = Number(row.cnt);
      if (Number.isFinite(h) && h >= 0 && h < 24) hourBuckets[h] = c;
    }
    let peakHour: number | null = null;
    let peakVal = 0;
    for (let i = 0; i < 24; i++) {
      if (hourBuckets[i] > peakVal) {
        peakVal = hourBuckets[i];
        peakHour = i;
      }
    }
    if (peakVal === 0) peakHour = null;

    const validCount = Number(validAgg?.cnt ?? 0);
    const topProducts = topRows.map((r) => ({
      name: r.name,
      qty: Number(r.qty) || 0,
      revenue: Number(r.revenue) || 0,
    }));

    return res.json({
      date,
      saleType: saleTypeRaw === "wholesale" || saleTypeRaw === "retail" ? saleTypeRaw : "all",
      totalLines: Number(totalRow?.c ?? 0),
      returnedCount: Number(returnedRow?.c ?? 0),
      validCount,
      validRevenue: Number(validAgg?.revenue ?? 0),
      validProfit: Number(validAgg?.profit ?? 0),
      topProducts,
      hourBuckets,
      peakHour,
    });
  } catch (err) {
    req.log?.error({ err }, "Day summary error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { startDate, endDate, productId, saleType, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(String(page));
    const limitNum = Math.min(parseInt(String(limit)), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(salesTable.companyId, cid)];

    if (startDate) conditions.push(gte(salesTable.createdAt, new Date(String(startDate))));
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(salesTable.createdAt, end));
    }
    if (productId) conditions.push(eq(salesTable.productId, parseInt(String(productId))));
    if (saleType === "wholesale" || saleType === "retail") {
      conditions.push(eq(salesTable.saleType, String(saleType)));
    }

    const whereClause = and(...conditions);

    const [sales, totalResult] = await Promise.all([
      db.select().from(salesTable).where(whereClause).orderBy(desc(salesTable.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: count() }).from(salesTable).where(whereClause),
    ]);

    res.json({
      sales,
      total: totalResult[0]?.count ?? 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limitNum),
    });
  } catch (err) {
    req.log?.error({ err }, "List sales error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requireAuth, idempotencyMiddleware, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { productId, quantity, unitPrice, paymentMethod, customerId, saleType: saleTypeRaw, channelKey } = req.body;
    if (!productId || !quantity || !unitPrice) {
      res.status(400).json({ error: "Bad Request", message: "Zorunlu alanlar eksik" });
      return;
    }
    const validPaymentMethods = ["cash", "card", "transfer", "other", "credit"];
    const pm = validPaymentMethods.includes(paymentMethod) ? paymentMethod : null;

    const [product] = await db.select().from(productsTable).where(
      and(eq(productsTable.id, parseInt(productId)), eq(productsTable.companyId, cid))
    );
    if (!product) {
      res.status(404).json({ error: "Not Found", message: "Ürün bulunamadı" });
      return;
    }

    const qty = parseInt(quantity);
    if (product.stock < qty) {
      res.status(400).json(Errors.insufficientStock(product.stock));
      return;
    }

    // Müşteri validasyonu
    let customer = null;
    if (customerId) {
      const rows = await db.select().from(customersTable)
        .where(and(eq(customersTable.id, parseInt(customerId)), eq(customersTable.companyId, cid)));
      if (!rows.length) {
        res.status(404).json({ error: "Not Found", message: "Müşteri bulunamadı" });
        return;
      }
      if (!rows[0].isActive) {
        res.status(400).json({ error: "Bad Request", message: "Pasif müşteriye satış yapılamaz" });
        return;
      }
      customer = rows[0];
    }

    const totalPrice = parseFloat(unitPrice) * qty;
    const profit = (parseFloat(unitPrice) - product.purchasePrice) * qty;

    // saleType: kullanıcı açıkça gönderdiyse onu kullan;
    // yoksa akıllı default — POS / hızlı satış (channel=pos veya kanal yok ve müşteri yok) → retail,
    // diğerleri (cari müşteriye satış / marketplace / B2B) → wholesale.
    let saleType: "wholesale" | "retail";
    if (saleTypeRaw === "wholesale" || saleTypeRaw === "retail") {
      saleType = saleTypeRaw;
    } else {
      const ch = String(channelKey ?? "").toLowerCase();
      if (ch === "pos" || (!ch && !customer)) saleType = "retail";
      else saleType = customer ? "wholesale" : "retail";
    }

    const [sale] = await db.insert(salesTable).values({
      companyId: cid,
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      barcode: product.barcode,
      quantity: qty,
      unitPrice: parseFloat(unitPrice),
      totalPrice,
      purchasePrice: product.purchasePrice,
      profit,
      userId: req.session.user?.id,
      soldBy: req.session.user?.fullName,
      paymentMethod: pm,
      customerId: customer ? customer.id : null,
      channelKey: channelKey ? String(channelKey) : null,
      saleType,
    }).returning();

    await db.update(productsTable)
      .set({ stock: product.stock - qty, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));

    // Müşteriye bağlıysa cari debit kaydı
    if (customer && sale) {
      await db.insert(customerTransactionsTable).values({
        companyId: cid,
        customerId: customer.id,
        type: "sale",
        direction: "debit",
        amount: totalPrice,
        referenceType: "sale",
        referenceId: sale.id,
        description: `Satış: ${product.name} x${qty}`,
        createdBy: req.session.user?.id ?? null,
      });
      // Bakiye güncelle
      const balRows = await db.select({
        debit: sql<number>`COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END), 0)`,
        credit: sql<number>`COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0)`,
      }).from(customerTransactionsTable).where(and(
        eq(customerTransactionsTable.customerId, customer.id),
        eq(customerTransactionsTable.companyId, cid),
      ));
      const newBalance = Number(balRows[0]?.debit ?? 0) - Number(balRows[0]?.credit ?? 0);
      await db.update(customersTable).set({ currentBalance: newBalance, updatedAt: new Date() })
        .where(and(eq(customersTable.id, customer.id), eq(customersTable.companyId, cid)));

      await audit({ req, action: "SALE_LINKED_CUSTOMER", entity: "customer", entityId: customer.id,
        details: { saleId: sale.id, amount: totalPrice } });
    }

    await audit({
      req,
      action: "SALE_CREATE",
      entity: "sale",
      entityId: sale!.id,
      details: { productId: product.id, productName: product.name, quantity: qty, unitPrice, totalPrice, customerId: customer?.id },
    });

    res.status(201).json(sale);
  } catch (err) {
    req.log?.error({ err }, "Create sale error");
    res.status(500).json(Errors.internal());
  }
});

router.post("/:id/return", requireAuth, requireRole(["admin", "staff"]), idempotencyMiddleware, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const saleId = parseInt(req.params.id);
    const { note } = req.body;

    const [sale] = await db.select().from(salesTable).where(
      and(eq(salesTable.id, saleId), eq(salesTable.companyId, cid))
    );
    if (!sale) {
      res.status(404).json({ error: "Not Found", message: "Satış kaydı bulunamadı" });
      return;
    }
    if (sale.returned) {
      res.status(400).json(Errors.alreadyReturned());
      return;
    }

    await db.update(salesTable).set({
      returned: true,
      returnedAt: new Date(),
      returnNote: note || null,
    }).where(eq(salesTable.id, saleId));

    const [product] = await db.select().from(productsTable).where(
      and(eq(productsTable.id, sale.productId), eq(productsTable.companyId, cid))
    );
    if (product) {
      await db.update(productsTable)
        .set({ stock: product.stock + sale.quantity, updatedAt: new Date() })
        .where(eq(productsTable.id, product.id));

      await db.insert(stockMovementsTable).values({
        companyId: cid,
        productId: product.id,
        productName: product.name,
        productCode: product.productCode,
        type: "return",
        quantity: sale.quantity,
        note: note || `Satış #${saleId} iadesi`,
        refId: saleId,
        createdBy: req.session.user?.fullName || req.session.user?.username,
      });
    }

    await audit({
      req,
      action: "SALE_RETURN",
      entity: "sale",
      entityId: saleId,
      details: { productId: sale.productId, quantity: sale.quantity, note },
    });

    res.json({ message: "İade başarıyla kaydedildi", saleId });
  } catch (err) {
    req.log?.error({ err }, "Return sale error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
