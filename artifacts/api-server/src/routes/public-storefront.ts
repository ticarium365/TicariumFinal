import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  storefrontsTable,
  storefrontProductsTable,
  productsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";

// Auth GEREKMEZ — public storefront uçları.
const router: IRouter = Router();

// GET /api/public/v1/storefronts/:slug
router.get("/public/v1/storefronts/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").toLowerCase().trim();
  if (!slug) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Slug gerekli" } });
    return;
  }
  const [sf] = await db.select().from(storefrontsTable).where(eq(storefrontsTable.slug, slug));
  if (!sf || sf.status !== "active") {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı veya yayında değil" } });
    return;
  }

  const links = await db.select().from(storefrontProductsTable)
    .where(and(eq(storefrontProductsTable.storefrontId, sf.id), eq(storefrontProductsTable.isActive, true)));

  let products: any[] = [];
  if (links.length > 0) {
    const pids = links.map((l) => l.productId);
    const prods = await db.select({
      id: productsTable.id,
      name: productsTable.name,
      productCode: productsTable.productCode,
      description: productsTable.description,
      salePrice: productsTable.salePrice,
      stock: productsTable.stock,
    }).from(productsTable)
      .where(and(eq(productsTable.companyId, sf.companyId), inArray(productsTable.id, pids)));
    const byId = new Map(prods.map((p) => [p.id, p]));
    products = links
      .map((l) => {
        const p = byId.get(l.productId);
        if (!p) return null;
        return {
          linkId: l.id,
          productId: p.id,
          productCode: p.productCode,
          title: l.customTitle || p.name,
          description: p.description,
          price: l.customPrice ?? p.salePrice,
          imageUrl: null as string | null,
          stockQty: p.stock,
          displayOrder: l.displayOrder,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.displayOrder - b.displayOrder);
  }

  // Hassas alanları (paymentConfig'in tam içeriği, agreementNotes vs) public'e açma
  const publicPaymentConfig: Record<string, any> = {};
  const pc: any = sf.paymentConfig || {};
  if (sf.paymentMode === "merchant_pos" && pc.redirectUrl) publicPaymentConfig.redirectUrl = pc.redirectUrl;
  if (sf.paymentMode === "whatsapp_only" && pc.whatsappNumber) publicPaymentConfig.whatsappNumber = pc.whatsappNumber;

  res.json({
    storefront: {
      id: sf.id,
      slug: sf.slug,
      name: sf.name,
      type: sf.type,
      status: sf.status,
      paymentMode: sf.paymentMode,
      themeConfig: sf.themeConfig || {},
      paymentConfig: publicPaymentConfig,
      seoTitle: sf.seoTitle,
      seoDescription: sf.seoDescription,
    },
    products,
  });
});

// POST /api/public/v1/storefronts/:slug/orders
const orderSchema = z.object({
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(7).max(40),
  customerEmail: z.string().email().max(160).optional(),
  customerAddress: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(50),
});

router.post("/public/v1/storefronts/:slug/orders", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").toLowerCase().trim();
  const parse = orderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Geçersiz sipariş", details: parse.error.flatten() } });
    return;
  }
  const body = parse.data;

  const [sf] = await db.select().from(storefrontsTable).where(eq(storefrontsTable.slug, slug));
  if (!sf || sf.status !== "active") {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Mağaza bulunamadı" } });
    return;
  }

  const pids = body.items.map((i) => i.productId);
  // Sadece bu storefront'un linkli & aktif ürünleri
  const links = await db.select().from(storefrontProductsTable)
    .where(and(
      eq(storefrontProductsTable.storefrontId, sf.id),
      eq(storefrontProductsTable.isActive, true),
      inArray(storefrontProductsTable.productId, pids),
    ));
  if (links.length !== pids.length) {
    res.status(400).json({ error: { code: "INVALID_ITEMS", message: "Sepetinizde geçersiz ürün var" } });
    return;
  }

  const prods = await db.select().from(productsTable)
    .where(and(eq(productsTable.companyId, sf.companyId), inArray(productsTable.id, pids)));
  const prodById = new Map(prods.map((p) => [p.id, p]));
  const linkById = new Map(links.map((l) => [l.productId, l]));

  let total = 0;
  const itemsToInsert: Array<{ productId: number; productName: string; quantity: number; unitPrice: number; totalPrice: number; productCode: string }> = [];
  for (const it of body.items) {
    const p = prodById.get(it.productId);
    const lk = linkById.get(it.productId);
    if (!p || !lk) { res.status(400).json({ error: { code: "INVALID_ITEM", message: `Ürün ${it.productId} bulunamadı` } }); return; }
    if (p.stock < it.quantity) { res.status(400).json({ error: { code: "OUT_OF_STOCK", message: `${p.name} yetersiz stok (${p.stock})` } }); return; }
    const price = lk.customPrice ?? p.salePrice;
    const sub = price * it.quantity;
    total += sub;
    itemsToInsert.push({
      productId: p.id, productName: lk.customTitle || p.name, productCode: p.productCode,
      quantity: it.quantity, unitPrice: price, totalPrice: sub,
    });
  }

  const orderNo = `SF-${sf.id}-${Date.now().toString(36).toUpperCase()}`;
  try {
    const created = await db.transaction(async (tx) => {
      // Atomic koşullu stok düşümü — race condition'a karşı koruma
      for (const it of itemsToInsert) {
        const result: any = await tx.execute(sql`
          UPDATE products SET stock = stock - ${it.quantity}
          WHERE id = ${it.productId}
            AND company_id = ${sf.companyId}
            AND stock >= ${it.quantity}
          RETURNING id
        `);
        const rows = result.rows ?? result;
        if (!rows || rows.length === 0) {
          const err: any = new Error("OUT_OF_STOCK_RACE");
          err.code = "OUT_OF_STOCK";
          err.productName = it.productName;
          throw err;
        }
      }
      const [order] = await tx.insert(ordersTable).values({
        companyId: sf.companyId,
        orderNo,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail || null,
        customerAddress: body.customerAddress || null,
        notes: body.note || null,
        source: `storefront:${sf.slug}`,
        status: "pending",
        totalAmount: total,
      } as any).returning();
      await tx.insert(orderItemsTable).values(
        itemsToInsert.map((it) => ({
          orderId: order.id,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        } as any)),
      );
      return order;
    });

    // Ödeme moduna göre yönlendirme
    const pc: any = sf.paymentConfig || {};
    let redirectUrl: string | undefined;
    let whatsappUrl: string | undefined;
    if (sf.paymentMode === "merchant_pos" && pc.redirectUrl) {
      const url = new URL(pc.redirectUrl);
      url.searchParams.set("order", orderNo);
      url.searchParams.set("amount", total.toFixed(2));
      redirectUrl = url.toString();
    }
    if (sf.paymentMode === "whatsapp_only" && pc.whatsappNumber) {
      const phone = String(pc.whatsappNumber).replace(/\D/g, "");
      const msg = encodeURIComponent(`Yeni sipariş: ${orderNo}\nTutar: ₺${total.toFixed(2)}\nMüşteri: ${body.customerName} (${body.customerPhone})`);
      whatsappUrl = `https://wa.me/${phone}?text=${msg}`;
    }

    res.status(201).json({
      orderId: created.id,
      orderNo,
      total,
      paymentMode: sf.paymentMode,
      redirectUrl,
      whatsappUrl,
    });
  } catch (e: any) {
    if (e?.code === "OUT_OF_STOCK") {
      res.status(409).json({ error: { code: "OUT_OF_STOCK", message: `${e.productName || "Ürün"} stok sırasında tükendi, lütfen tekrar deneyin` } });
      return;
    }
    console.error("[public-storefront] order create failed", { orderNo, slug, err: e?.message });
    res.status(500).json({ error: { code: "ORDER_FAILED", message: "Sipariş oluşturulamadı" } });
  }
});

export default router;
