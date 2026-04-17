import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  notificationRulesTable,
  notificationPreferencesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// ─── Desteklenen bildirim tipleri ──────────────────────────────────────────
export const NOTIFICATION_TYPES = [
  "low_stock",
  "new_sale",
  "daily_summary",
  "subscription_expiry",
  "overdue_payment",
  "new_purchase",
  "stock_count_closed",
] as const;

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  low_stock: "Düşük Stok Uyarısı",
  new_sale: "Yeni Satış",
  daily_summary: "Günlük Özet",
  subscription_expiry: "Abonelik Sona Erme",
  overdue_payment: "Vadesi Geçmiş Ödeme",
  new_purchase: "Yeni Alış Faturası",
  stock_count_closed: "Stok Sayım Tamamlandı",
};

// ─── Zod şemaları ──────────────────────────────────────────────────────────
const CreateRuleBody = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(NOTIFICATION_TYPES),
  channel: z.enum(["in_app", "webhook"]).optional().default("in_app"),
  threshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

const UpdatePrefsBody = z.object({
  preferences: z.array(z.object({
    type: z.enum(NOTIFICATION_TYPES),
    enabled: z.boolean(),
  })),
});

// ─────────────────────────────────────────────────────────────────────────────
// KURAL YÖNETİMİ
// ─────────────────────────────────────────────────────────────────────────────

// GET /notification-rules — kural listesi
router.get("/notification-rules", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  try {
    const rules = await db.select().from(notificationRulesTable)
      .where(eq(notificationRulesTable.companyId, companyId))
      .orderBy(desc(notificationRulesTable.createdAt));
    res.json({
      rules: rules.map((r) => ({
        ...r,
        typeLabel: NOTIFICATION_TYPE_LABELS[r.type] ?? r.type,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "notification rules list error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /notification-rules/types — desteklenen tipler listesi
router.get("/notification-rules/types", async (_req: Request, res: Response) => {
  res.json({
    types: NOTIFICATION_TYPES.map((t) => ({
      value: t,
      label: NOTIFICATION_TYPE_LABELS[t],
      hasThreshold: t === "low_stock",
    })),
  });
});

// POST /notification-rules — kural oluştur
router.post("/notification-rules", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    const [rule] = await db.insert(notificationRulesTable).values({
      companyId,
      ...parsed.data,
    }).returning();
    res.status(201).json({ ...rule, typeLabel: NOTIFICATION_TYPE_LABELS[rule.type] ?? rule.type });
  } catch (err) {
    req.log.error({ err }, "notification rule create error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /notification-rules/:id — kural güncelle
router.put("/notification-rules/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  const parsed = CreateRuleBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db.update(notificationRulesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(notificationRulesTable.id, id), eq(notificationRulesTable.companyId, companyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.json({ ...updated, typeLabel: NOTIFICATION_TYPE_LABELS[updated.type] ?? updated.type });
  } catch (err) {
    req.log.error({ err }, "notification rule update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /notification-rules/:id/toggle — aktif/pasif değiştir
router.patch("/notification-rules/:id/toggle", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [existing] = await db.select().from(notificationRulesTable)
      .where(and(eq(notificationRulesTable.id, id), eq(notificationRulesTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Bulunamadı" }); return; }
    const [updated] = await db.update(notificationRulesTable)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(notificationRulesTable.id, id))
      .returning();
    res.json({ ok: true, isActive: updated.isActive });
  } catch (err) {
    req.log.error({ err }, "rule toggle error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /notification-rules/:id — kural sil
router.delete("/notification-rules/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [deleted] = await db.delete(notificationRulesTable)
      .where(and(eq(notificationRulesTable.id, id), eq(notificationRulesTable.companyId, companyId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Bulunamadı" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "rule delete error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /notification-rules/:id/test — test bildirimi gönder
router.post("/notification-rules/:id/test", requireRole(["admin"]), async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const id = parseInt(req.params.id, 10);
  try {
    const [rule] = await db.select().from(notificationRulesTable)
      .where(and(eq(notificationRulesTable.id, id), eq(notificationRulesTable.companyId, companyId)));
    if (!rule) { res.status(404).json({ error: "Bulunamadı" }); return; }

    // Test bildirimi oluştur
    await db.insert(notificationsTable).values({
      companyId,
      type: rule.type,
      title: `[Test] ${NOTIFICATION_TYPE_LABELS[rule.type] ?? rule.type}`,
      message: `Bu bir test bildirimidir. Kural: "${rule.name}"`,
      isRead: false,
    });

    res.json({ ok: true, message: "Test bildirimi gönderildi" });
  } catch (err) {
    req.log.error({ err }, "rule test error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// KULLANICI TERCİHLERİ
// ─────────────────────────────────────────────────────────────────────────────

// GET /notification-rules/preferences — kullanıcı tercihlerini getir
router.get("/notification-rules/preferences", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const userId = req.session?.user?.id as number;
  try {
    const prefs = await db.select().from(notificationPreferencesTable)
      .where(and(
        eq(notificationPreferencesTable.userId, userId),
        eq(notificationPreferencesTable.companyId, companyId),
      ));

    // Her tip için tercih yoksa default (enabled=true) ekle
    const prefMap = Object.fromEntries(prefs.map((p) => [p.type, p.enabled]));
    const result = NOTIFICATION_TYPES.map((type) => ({
      type,
      label: NOTIFICATION_TYPE_LABELS[type],
      enabled: prefMap[type] !== undefined ? prefMap[type] : true,
    }));

    res.json({ preferences: result });
  } catch (err) {
    req.log.error({ err }, "preferences get error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /notification-rules/preferences — kullanıcı tercihlerini güncelle
router.put("/notification-rules/preferences", async (req: Request, res: Response) => {
  const companyId = (req as any).companyId as number;
  const userId = req.session?.user?.id as number;
  const parsed = UpdatePrefsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    for (const pref of parsed.data.preferences) {
      // Upsert: varsa güncelle, yoksa ekle
      const existing = await db.select({ id: notificationPreferencesTable.id })
        .from(notificationPreferencesTable)
        .where(and(
          eq(notificationPreferencesTable.userId, userId),
          eq(notificationPreferencesTable.companyId, companyId),
          eq(notificationPreferencesTable.type, pref.type),
        ));

      if (existing.length > 0) {
        await db.update(notificationPreferencesTable)
          .set({ enabled: pref.enabled, updatedAt: new Date() })
          .where(eq(notificationPreferencesTable.id, existing[0].id));
      } else {
        await db.insert(notificationPreferencesTable).values({
          userId,
          companyId,
          type: pref.type,
          enabled: pref.enabled,
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "preferences update error");
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TETIK FONKSİYONLARI — dışarıdan çağrılabilir
// Diğer route'lar bu fonksiyonları import edebilir
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bir bildirim tipini tetikle: aktif kuralı varsa bildirim oluştur
 */
export async function triggerNotification(
  companyId: number,
  type: typeof NOTIFICATION_TYPES[number],
  title: string,
  message: string,
) {
  try {
    // Aktif kural var mı?
    const [rule] = await db.select().from(notificationRulesTable).where(
      and(
        eq(notificationRulesTable.companyId, companyId),
        eq(notificationRulesTable.type, type),
        eq(notificationRulesTable.isActive, true),
      ),
    );
    if (!rule) return;

    await db.insert(notificationsTable).values({
      companyId,
      type,
      title,
      message,
      isRead: false,
    });
  } catch (err) {
    // Sessizce hata — kritik iş akışını engellemez
    console.error("[trigger-notification] Error:", err);
  }
}

export default router;
