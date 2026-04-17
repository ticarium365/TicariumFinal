import { Router, Request, Response } from "express";
import { db, notificationsTable, productsTable, auditLogsTable } from "@workspace/db";
import { eq, and, desc, lte, count as dbCount } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/notifications — list (admin+, şirket kapsamlı)
// ?unread=true → sadece okunmamışlar
// ?limit=20&offset=0
// ---------------------------------------------------------------------------
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const unread = req.query.unread === "true";
    const limit = Math.min(Number(req.query.limit ?? 30), 100);
    const offset = Number(req.query.offset ?? 0);

    const where = unread
      ? and(eq(notificationsTable.companyId, cid), eq(notificationsTable.isRead, false))
      : eq(notificationsTable.companyId, cid);

    const [rows, [{ total }]] = await Promise.all([
      db.select()
        .from(notificationsTable)
        .where(where)
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: dbCount() })
        .from(notificationsTable)
        .where(where),
    ]);

    res.json({ notifications: rows, total });
  } catch (err) {
    req.log?.error({ err }, "Get notifications error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/notifications/count — okunmamış sayısı
// ---------------------------------------------------------------------------
router.get("/count", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const [{ total }] = await db
      .select({ total: dbCount() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.companyId, cid), eq(notificationsTable.isRead, false)));
    res.json({ unread: total });
  } catch (err) {
    req.log?.error({ err }, "Notification count error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/notifications/read-all — tümünü okundu işaretle
// ---------------------------------------------------------------------------
router.put("/read-all", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.companyId, req.companyId), eq(notificationsTable.isRead, false)));
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "Read all notifications error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/notifications/:id/read — tekil okundu işaretle
// ---------------------------------------------------------------------------
router.put("/:id/read", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const cid = req.companyId;

    const [updated] = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.companyId, cid)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Bildirim bulunamadı", details: null } });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log?.error({ err }, "Mark notification read error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/notifications/generate — güncel stok durumuna göre bildirim üret
// Low stock ve zero stock için bildirim oluşturur (aynı gün tekrar üretmez)
// ---------------------------------------------------------------------------
router.post("/generate", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Bu gün için zaten üretilmiş low_stock / stock_zero bildirimlerini kontrol et
    const existingTypes = new Set(
      (await db
        .select({ type: notificationsTable.type })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.companyId, cid),
            // createdAt >= todayStart
            ...[] as any[]
          )
        )).map((r) => r.type)
    );

    // Kritik stok ürünlerini çek
    const criticalProducts = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        productCode: productsTable.productCode,
        stock: productsTable.stock,
        minStock: productsTable.minStock,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.companyId, cid),
          eq(productsTable.isActive, true),
          lte(productsTable.stock, productsTable.minStock)
        )
      )
      .limit(50);

    const zeroProd = criticalProducts.filter((p) => p.stock === 0);
    const lowProd = criticalProducts.filter((p) => p.stock > 0);

    const newNotifications: typeof notificationsTable.$inferInsert[] = [];

    if (zeroProd.length > 0) {
      newNotifications.push({
        companyId: cid,
        type: "stock_zero",
        title: `${zeroProd.length} ürün tamamen tükendi`,
        message: `Stoku sıfıra düşen ürünler: ${zeroProd.slice(0, 3).map((p) => p.name).join(", ")}${zeroProd.length > 3 ? ` ve ${zeroProd.length - 3} ürün daha` : ""}`,
        entityType: "product",
        entityId: zeroProd[0]!.id,
      });
    }

    if (lowProd.length > 0) {
      newNotifications.push({
        companyId: cid,
        type: "low_stock",
        title: `${lowProd.length} ürün kritik stok seviyesinde`,
        message: `Minimum stok altına düşen ürünler: ${lowProd.slice(0, 3).map((p) => p.name).join(", ")}${lowProd.length > 3 ? ` ve ${lowProd.length - 3} ürün daha` : ""}`,
        entityType: "product",
        entityId: lowProd[0]!.id,
      });
    }

    let created = 0;
    if (newNotifications.length > 0) {
      await db.insert(notificationsTable).values(newNotifications);
      created = newNotifications.length;
    }

    res.json({ created, total: criticalProducts.length });
  } catch (err) {
    req.log?.error({ err }, "Generate notifications error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası", details: null } });
  }
});

// ---------------------------------------------------------------------------
// GET /api/notifications/templates — WhatsApp / E-posta mesaj şablonları
// ---------------------------------------------------------------------------
router.get("/templates", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { type, productName, stock, companyName } = req.query as Record<string, string>;

  const templates = {
    low_stock_whatsapp: `Merhaba,\n\n"${productName ?? "Ürün Adı"}" ürününün stok miktarı kritik seviyeye düştü.\n\nMevcut stok: *${stock ?? "0"} adet*\n\nLütfen en kısa sürede sipariş veriniz.\n\n_${companyName ?? "Firma"} Stok Yönetim Sistemi_`,
    low_stock_email: {
      subject: `[STOK UYARI] ${productName ?? "Ürün"} kritik stok seviyesinde`,
      body: `Sayın Yetkili,\n\nBilginize sunmak isteriz ki "${productName ?? "Ürün Adı"}" ürününün stok miktarı kritik seviyenin altına düşmüştür.\n\nMevcut Stok: ${stock ?? 0} adet\n\nSiparişinizi verebilmek için aşağıdaki linki kullanabilirsiniz.\n\nSaygılarımızla,\n${companyName ?? "Firma"} Stok Yönetim Sistemi`,
    },
    daily_summary_whatsapp: `*Günlük Özet — ${new Date().toLocaleDateString("tr-TR")}*\n\n📦 Bugünün satışları hazır.\nDetaylar için sisteme giriş yapabilirsiniz.\n\n_${companyName ?? "Firma"}_`,
    restock_request_whatsapp: `Merhaba,\n\n"${productName ?? "Ürün"}" ürününden *${stock ?? "adet"} adet* temin etmemiz gerekmektedir.\n\nFiyat ve teslimat bilginizi paylaşabilir misiniz?\n\nTeşekkürler,\n${companyName ?? "Firma"}`,
  };

  res.json(templates);
});

export default router;
