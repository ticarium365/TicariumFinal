import { Router, Request, Response } from "express";
import {
  db,
  accountingIntegrationsTable, accountingSyncLogsTable,
  ecommerceIntegrationsTable, ecommerceSyncLogsTable,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// DESTEKLENEN SAĞLAYICILAR
// ─────────────────────────────────────────────────────────────────────────────
const ACCOUNTING_PROVIDERS = [
  { id: "parasut",    name: "Paraşüt",      logo: "🧾", description: "Bulut tabanlı muhasebe yazılımı" },
  { id: "logo",       name: "Logo",         logo: "📊", description: "Logo Tiger / Go / Start" },
  { id: "mikro",      name: "Mikro",        logo: "📈", description: "Mikro ERP yazılımı" },
  { id: "luca",       name: "Luca",         logo: "🔢", description: "DYS Yazılım / Luca muhasebe" },
  { id: "netsis",     name: "Netsis",       logo: "🏢", description: "Netsis ERP sistemi" },
];

const ECOMMERCE_PLATFORMS = [
  { id: "trendyol",     name: "Trendyol",     logo: "🛍️", description: "Türkiye'nin en büyük e-ticaret pazaryeri" },
  { id: "hepsiburada",  name: "Hepsiburada",  logo: "🛒", description: "Hepsiburada.com" },
  { id: "n11",          name: "n11",          logo: "🏪", description: "n11.com pazaryeri" },
  { id: "pazarama",     name: "Pazarama",     logo: "🏬", description: "Pazarama.com" },
  { id: "shopify",      name: "Shopify",      logo: "🌐", description: "Kendi mağazanız (Shopify)" },
  { id: "woocommerce",  name: "WooCommerce",  logo: "🔌", description: "WordPress / WooCommerce" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER/PLATFORM LİSTELERİ
// ─────────────────────────────────────────────────────────────────────────────
router.get("/accounting/providers", requireAuth, (_req, res) => {
  res.json({ providers: ACCOUNTING_PROVIDERS });
});

router.get("/ecommerce/platforms", requireAuth, (_req, res) => {
  res.json({ platforms: ECOMMERCE_PLATFORMS });
});

// ─────────────────────────────────────────────────────────────────────────────
// MUHASEBE ENTEGRASYONLARI — CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get("/accounting", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const rows = await db.select().from(accountingIntegrationsTable)
      .where(eq(accountingIntegrationsTable.companyId, cid))
      .orderBy(desc(accountingIntegrationsTable.createdAt));

    // Credentials'ı maskele — güvenlik
    const result = rows.map(r => ({
      ...r,
      credentials: maskCredentials(r.credentials),
    }));
    res.json({ integrations: result });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/accounting", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { provider, displayName, credentials, syncOptions } = req.body as {
      provider?: string; displayName?: string; credentials?: object; syncOptions?: object;
    };

    if (!provider?.trim()) return void res.status(400).json(Errors.badRequest("Sağlayıcı seçiniz"));
    if (!ACCOUNTING_PROVIDERS.find(p => p.id === provider)) {
      return void res.status(400).json(Errors.badRequest("Desteklenmeyen muhasebe sağlayıcısı"));
    }

    // Şirket başına bir sağlayıcı (aynı sağlayıcıyı tekrar ekleyemez)
    const [existing] = await db.select({ id: accountingIntegrationsTable.id })
      .from(accountingIntegrationsTable)
      .where(and(
        eq(accountingIntegrationsTable.companyId, cid),
        eq(accountingIntegrationsTable.provider, provider)
      ));
    if (existing) return void res.status(409).json(Errors.conflict("Bu muhasebe sağlayıcısı zaten tanımlanmış"));

    const [row] = await db.insert(accountingIntegrationsTable).values({
      companyId: cid,
      provider,
      displayName: displayName?.trim() || null,
      credentials: credentials ? JSON.stringify(credentials) : "{}",
      syncOptions: syncOptions ? JSON.stringify(syncOptions) : "{}",
      createdBy: uid,
    }).returning();

    res.status(201).json({ integration: { ...row, credentials: maskCredentials(row.credentials) } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/accounting/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { displayName, credentials, syncOptions, isActive } = req.body as {
      displayName?: string; credentials?: object; syncOptions?: object; isActive?: boolean;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (displayName !== undefined) updateData.displayName = displayName.trim();
    if (credentials !== undefined) updateData.credentials = JSON.stringify(credentials);
    if (syncOptions !== undefined) updateData.syncOptions = JSON.stringify(syncOptions);
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(accountingIntegrationsTable)
      .set(updateData)
      .where(and(eq(accountingIntegrationsTable.id, id), eq(accountingIntegrationsTable.companyId, cid)))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Muhasebe entegrasyonu"));

    res.json({ integration: { ...updated, credentials: maskCredentials(updated.credentials) } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/accounting/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    // Logları sil önce
    await db.delete(accountingSyncLogsTable).where(eq(accountingSyncLogsTable.integrationId, id));
    const [deleted] = await db.delete(accountingIntegrationsTable)
      .where(and(eq(accountingIntegrationsTable.id, id), eq(accountingIntegrationsTable.companyId, cid)))
      .returning();
    if (!deleted) return void res.status(404).json(Errors.notFound("Muhasebe entegrasyonu"));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Senkronizasyon tetikleme (simülasyon)
router.post("/accounting/:id/sync", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [integration] = await db.select().from(accountingIntegrationsTable)
      .where(and(eq(accountingIntegrationsTable.id, id), eq(accountingIntegrationsTable.companyId, cid)));
    if (!integration) return void res.status(404).json(Errors.notFound("Muhasebe entegrasyonu"));
    if (!integration.isActive) return void res.status(400).json(Errors.badRequest("Entegrasyon pasif"));

    const { syncType = "sales" } = req.body as { syncType?: string };
    const validTypes = ["sales", "expenses", "products", "customers"];
    if (!validTypes.includes(syncType)) {
      return void res.status(400).json(Errors.badRequest(`Geçersiz syncType. Geçerliler: ${validTypes.join(", ")}`));
    }

    // Simülasyon: %90 başarı oranı
    const success = Math.random() > 0.1;
    const recordCount = success ? Math.floor(Math.random() * 150) + 5 : 0;

    const [log] = await db.insert(accountingSyncLogsTable).values({
      integrationId: id,
      companyId: cid,
      syncType,
      status: success ? "success" : "failed",
      recordCount,
      errorMessage: success ? null : "Bağlantı zaman aşımına uğradı (simülasyon)",
      completedAt: new Date(),
    }).returning();

    await db.update(accountingIntegrationsTable)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: success ? "success" : "failed",
        updatedAt: new Date(),
      })
      .where(eq(accountingIntegrationsTable.id, id));

    res.json({ log, success });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.get("/accounting/:id/logs", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [integration] = await db.select({ id: accountingIntegrationsTable.id })
      .from(accountingIntegrationsTable)
      .where(and(eq(accountingIntegrationsTable.id, id), eq(accountingIntegrationsTable.companyId, cid)));
    if (!integration) return void res.status(404).json(Errors.notFound("Muhasebe entegrasyonu"));

    const logs = await db.select().from(accountingSyncLogsTable)
      .where(eq(accountingSyncLogsTable.integrationId, id))
      .orderBy(desc(accountingSyncLogsTable.startedAt))
      .limit(50);

    res.json({ logs });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// E-TİCARET ENTEGRASYONLARI — CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get("/ecommerce", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const rows = await db.select().from(ecommerceIntegrationsTable)
      .where(eq(ecommerceIntegrationsTable.companyId, cid))
      .orderBy(desc(ecommerceIntegrationsTable.createdAt));

    const result = rows.map(r => ({ ...r, credentials: maskCredentials(r.credentials) }));
    res.json({ integrations: result });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.post("/ecommerce", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { platform, storeName, credentials, syncOptions } = req.body as {
      platform?: string; storeName?: string; credentials?: object; syncOptions?: object;
    };

    if (!platform?.trim()) return void res.status(400).json(Errors.badRequest("Platform seçiniz"));
    if (!storeName?.trim()) return void res.status(400).json(Errors.badRequest("Mağaza adı gerekli"));
    if (!ECOMMERCE_PLATFORMS.find(p => p.id === platform)) {
      return void res.status(400).json(Errors.badRequest("Desteklenmeyen e-ticaret platformu"));
    }

    const [row] = await db.insert(ecommerceIntegrationsTable).values({
      companyId: cid,
      platform,
      storeName: storeName.trim(),
      credentials: credentials ? JSON.stringify(credentials) : "{}",
      syncOptions: syncOptions ? JSON.stringify(syncOptions) : "{}",
      createdBy: uid,
    }).returning();

    res.status(201).json({ integration: { ...row, credentials: maskCredentials(row.credentials) } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.put("/ecommerce/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { storeName, credentials, syncOptions, isActive } = req.body as {
      storeName?: string; credentials?: object; syncOptions?: object; isActive?: boolean;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (storeName !== undefined) updateData.storeName = storeName.trim();
    if (credentials !== undefined) updateData.credentials = JSON.stringify(credentials);
    if (syncOptions !== undefined) updateData.syncOptions = JSON.stringify(syncOptions);
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(ecommerceIntegrationsTable)
      .set(updateData)
      .where(and(eq(ecommerceIntegrationsTable.id, id), eq(ecommerceIntegrationsTable.companyId, cid)))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("E-ticaret entegrasyonu"));

    res.json({ integration: { ...updated, credentials: maskCredentials(updated.credentials) } });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.delete("/ecommerce/:id", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    await db.delete(ecommerceSyncLogsTable).where(eq(ecommerceSyncLogsTable.integrationId, id));
    const [deleted] = await db.delete(ecommerceIntegrationsTable)
      .where(and(eq(ecommerceIntegrationsTable.id, id), eq(ecommerceIntegrationsTable.companyId, cid)))
      .returning();
    if (!deleted) return void res.status(404).json(Errors.notFound("E-ticaret entegrasyonu"));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Senkronizasyon tetikleme (simülasyon)
router.post("/ecommerce/:id/sync", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [integration] = await db.select().from(ecommerceIntegrationsTable)
      .where(and(eq(ecommerceIntegrationsTable.id, id), eq(ecommerceIntegrationsTable.companyId, cid)));
    if (!integration) return void res.status(404).json(Errors.notFound("E-ticaret entegrasyonu"));
    if (!integration.isActive) return void res.status(400).json(Errors.badRequest("Entegrasyon pasif"));

    const { syncType = "product_push" } = req.body as { syncType?: string };
    const validTypes = ["product_push", "order_pull", "inventory_update", "category_sync"];
    if (!validTypes.includes(syncType)) {
      return void res.status(400).json(Errors.badRequest(`Geçersiz syncType. Geçerliler: ${validTypes.join(", ")}`));
    }

    const success = Math.random() > 0.1;
    const recordCount = success ? Math.floor(Math.random() * 200) + 10 : 0;

    const [log] = await db.insert(ecommerceSyncLogsTable).values({
      integrationId: id,
      companyId: cid,
      syncType,
      status: success ? "success" : "failed",
      recordCount,
      errorMessage: success ? null : "Platform API bağlantısı kurulamadı (simülasyon)",
      completedAt: new Date(),
    }).returning();

    await db.update(ecommerceIntegrationsTable)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: success ? "success" : "failed",
        updatedAt: new Date(),
      })
      .where(eq(ecommerceIntegrationsTable.id, id));

    res.json({ log, success });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

router.get("/ecommerce/:id/logs", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [integration] = await db.select({ id: ecommerceIntegrationsTable.id })
      .from(ecommerceIntegrationsTable)
      .where(and(eq(ecommerceIntegrationsTable.id, id), eq(ecommerceIntegrationsTable.companyId, cid)));
    if (!integration) return void res.status(404).json(Errors.notFound("E-ticaret entegrasyonu"));

    const logs = await db.select().from(ecommerceSyncLogsTable)
      .where(eq(ecommerceSyncLogsTable.integrationId, id))
      .orderBy(desc(ecommerceSyncLogsTable.startedAt))
      .limit(50);

    res.json({ logs });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI: Credentials maskeleme
// ─────────────────────────────────────────────────────────────────────────────
function maskCredentials(credStr: string): object {
  try {
    const cred = JSON.parse(credStr) as Record<string, unknown>;
    const masked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cred)) {
      if (typeof v === "string" && v.length > 4) {
        masked[k] = v.slice(0, 4) + "•".repeat(Math.min(v.length - 4, 12));
      } else {
        masked[k] = v;
      }
    }
    return masked;
  } catch {
    return {};
  }
}

export default router;
