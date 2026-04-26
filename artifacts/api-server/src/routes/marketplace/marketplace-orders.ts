import type { Router, RequestHandler } from "express";
import {
  db,
  marketplaceOrdersTable,
  salesTable,
  productChannelMappingsTable,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { idempotencyMiddleware } from "../../middlewares/idempotency.js";

export function registerMarketplaceOrdersRoutes(router: Router, opts: { requireWriter: RequestHandler }): void {
  const requireWriter = opts.requireWriter;

  // ─────────────────────────────────────────────────────────────────────────────
  // MARKETPLACE ORDERS — Sprint 51-55 (list, get, convert-to-sale)
  // ─────────────────────────────────────────────────────────────────────────────
  router.get("/orders", async (req, res) => {
    const companyId = req.companyId!;
    const { accountId, channelKey, status, converted, limit = "100" } = req.query as any;
    const conds = [eq(marketplaceOrdersTable.companyId, companyId)];
    if (accountId) conds.push(eq(marketplaceOrdersTable.accountId, Number(accountId)));
    if (channelKey) conds.push(eq(marketplaceOrdersTable.channelKey, String(channelKey)));
    if (status) conds.push(eq(marketplaceOrdersTable.status, String(status)));
    if (converted === "true") conds.push(sql`${marketplaceOrdersTable.convertedSaleId} IS NOT NULL`);
    if (converted === "false") conds.push(sql`${marketplaceOrdersTable.convertedSaleId} IS NULL`);
    const rows = await db.select().from(marketplaceOrdersTable).where(and(...conds))
      .orderBy(desc(marketplaceOrdersTable.pulledAt)).limit(Math.min(500, Number(limit) || 100));
    res.json(rows);
  });

  router.get("/orders/:id", async (req, res) => {
    const [row] = await db.select().from(marketplaceOrdersTable)
      .where(and(eq(marketplaceOrdersTable.id, Number(req.params.id)),
        eq(marketplaceOrdersTable.companyId, req.companyId!))).limit(1);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  });

  /**
   * POST /marketplace/orders/:id/convert-to-sale
   * Idempotent: convertedSaleId set ise mevcut sale ID döner, hiç insert yapılmaz.
   * Transactional: Sale insert + stock decrement + stock_movement + order.convertedSaleId atomik.
   * Multi-item: Her item için ayrı sale satırı; convertedSaleId = ilk satışın id'si.
   * Item product matching: önce product_channel_mappings (channelSku/externalProductId),
   * fallback olarak products tablosunda barcode/productCode.
   */
  router.post("/orders/:id/convert-to-sale", requireWriter, idempotencyMiddleware, async (req, res) => {
    const companyId = req.companyId!;
    const orderId = Number(req.params.id);
    const userId = req.session.user?.id;
    const userName = req.session.user?.fullName || req.session.user?.username;

    try {
      const result = await db.transaction(async (tx) => {
        // FOR UPDATE: paralel convert isteklerini serileştir
        const [order] = await tx.execute(sql`
        SELECT * FROM marketplace_orders
        WHERE id = ${orderId} AND company_id = ${companyId}
        FOR UPDATE
      `).then((r: any) => r.rows);
        if (!order) return { status: 404, body: { error: "order_not_found" } };

        // Idempotent: zaten dönüştürülmüşse mevcut bilgiyi dön (account+channel+order scope'lu)
        if (order.converted_sale_id) {
          const sales = await tx.select().from(salesTable)
            .where(and(eq(salesTable.companyId, companyId),
              eq(salesTable.channelKey, order.channel_key),
              eq(salesTable.channelOrderId, order.external_order_id)));
          return {
            status: 200, body: {
              alreadyConverted: true, orderId: order.id,
              primarySaleId: order.converted_sale_id, sales,
            },
          };
        }

        const items = (order.items_json || []) as any[];
        if (!items.length) return { status: 400, body: { error: "no_items" } };

        const createdSales: any[] = [];
        const skipped: any[] = [];
        // All-or-nothing: ilk skip'te tüm tx rollback edilir
        let abortReason: string | null = null;

        for (const it of items) {
          // 1. Mapping: önce externalProductId, sonra channelSku — ardışık dene
          let productId: number | null = null;
          const channelSku = it.channelSku || it.sku;
          const extPid = it.externalProductId;
          if (extPid) {
            const [m] = await tx.select().from(productChannelMappingsTable).where(and(
              eq(productChannelMappingsTable.companyId, companyId),
              eq(productChannelMappingsTable.accountId, order.account_id),
              eq(productChannelMappingsTable.externalProductId, String(extPid)),
            )).limit(1);
            if (m) productId = m.productId;
          }
          if (!productId && channelSku) {
            const [m] = await tx.select().from(productChannelMappingsTable).where(and(
              eq(productChannelMappingsTable.companyId, companyId),
              eq(productChannelMappingsTable.accountId, order.account_id),
              eq(productChannelMappingsTable.channelSku, String(channelSku)),
            )).limit(1);
            if (m) productId = m.productId;
          }
          // 2. Fallback: barcode (channelBarcode veya barcode), sonra productCode (channelSku ile eşleştir)
          const barcode = it.channelBarcode || it.barcode;
          if (!productId && barcode) {
            const [p] = await tx.select().from(productsTable).where(and(
              eq(productsTable.companyId, companyId),
              eq(productsTable.barcode, String(barcode)),
            )).limit(1);
            if (p) productId = p.id;
          }
          if (!productId && channelSku) {
            const [p] = await tx.select().from(productsTable).where(and(
              eq(productsTable.companyId, companyId),
              eq(productsTable.productCode, String(channelSku)),
            )).limit(1);
            if (p) productId = p.id;
          }
          if (!productId) {
            skipped.push({ item: it, reason: "product_not_matched" });
            abortReason = abortReason || "product_not_matched";
            continue;
          }

          // Ürünü kilitle (stok yarışı)
          const [product] = await tx.execute(sql`
          SELECT * FROM products WHERE id = ${productId} AND company_id = ${companyId} FOR UPDATE
        `).then((r: any) => r.rows);
          if (!product) {
            skipped.push({ item: it, reason: "product_disappeared" });
            abortReason = abortReason || "product_disappeared";
            continue;
          }

          const qty = Number(it.quantity || 1);
          const unitPrice = Number(it.unitPrice || (Number(it.totalPrice || 0) / Math.max(1, qty)) || 0);
          const totalPrice = Number(it.totalPrice ?? unitPrice * qty);
          const purchasePrice = Number(product.purchase_price || 0);
          const profit = (unitPrice - purchasePrice) * qty;

          if ((product.stock || 0) < qty) {
            skipped.push({ item: it, reason: "insufficient_stock", available: product.stock, requested: qty });
            abortReason = abortReason || "insufficient_stock";
            continue;
          }

          // Sale insert
          const [sale] = await tx.insert(salesTable).values({
            companyId, productId,
            productName: product.name,
            productCode: product.product_code,
            barcode: product.barcode || null,
            quantity: qty,
            unitPrice, totalPrice,
            purchasePrice, profit,
            userId, soldBy: userName,
            paymentMethod: "transfer",
            channelKey: order.channel_key,
            channelOrderId: order.external_order_id,
          } as any).returning();
          createdSales.push(sale);

          // Stok düş
          await tx.update(productsTable).set({
            stock: (product.stock || 0) - qty, updatedAt: new Date(),
          }).where(eq(productsTable.id, productId));

          // Stock movement
          await tx.insert(stockMovementsTable).values({
            companyId, productId,
            productName: product.name, productCode: product.product_code,
            type: "sale", quantity: -qty,
            note: `Pazaryeri ${order.channel_key} sipariş #${order.external_order_id}`,
            refId: sale.id,
            createdBy: userName,
          } as any);
        }

        // All-or-nothing: bir item bile başarısızsa tüm tx rollback (throw → drizzle rollback)
        if (abortReason) {
          // Throw ederek rollback'i tetikle; çağrı dışında 422 olarak yanıtla
          const err: any = new Error("conversion_aborted");
          err.code = "ABORT";
          err.skipped = skipped;
          err.abortReason = abortReason;
          throw err;
        }
        if (!createdSales.length) {
          return { status: 422, body: { error: "no_sales_created", skipped } };
        }

        // Order'ı işaretle (idempotency için)
        const primarySaleId = createdSales[0].id;
        await tx.update(marketplaceOrdersTable).set({
          convertedSaleId: primarySaleId,
          convertedAt: new Date(),
          status: "invoiced",
          updatedAt: new Date(),
        }).where(eq(marketplaceOrdersTable.id, orderId));

        return {
          status: 200, body: {
            ok: true, orderId, primarySaleId, sales: createdSales, skipped,
          },
        };
      });
      res.status(result.status).json(result.body);
    } catch (e: any) {
      if (e?.code === "ABORT") {
        return res.status(422).json({
          error: "conversion_aborted",
          reason: e.abortReason,
          skipped: e.skipped || [],
        });
      }
      req.log?.error({ err: e }, "convert-to-sale failed");
      res.status(500).json({ error: "conversion_failed", message: e?.message });
    }
  });
}

