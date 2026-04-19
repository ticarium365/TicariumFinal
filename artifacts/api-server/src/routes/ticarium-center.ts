import { Router, Request, Response } from "express";
import {
  db,
  productsTable,
  salesTable,
  storefrontsTable,
  storefrontProductsTable,
  productChannelMappingsTable,
  channelAccountsTable,
  b2bQuoteRequestsTable,
  b2bOrdersTable,
} from "@workspace/db";
import { and, eq, gte, count, sum, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId!;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      pazaryeriPublished,
      storefrontPublished,
      ortakVitrinPublished,
      todayQuotes,
      pendingQuotes,
      monthSales,
      pendingOrders,
      activeStorefronts,
      activeChannels,
    ] = await Promise.all([
      db.select({ count: count() })
        .from(productChannelMappingsTable)
        .where(and(
          eq(productChannelMappingsTable.companyId, cid),
          eq(productChannelMappingsTable.isPublished, true),
          eq(productChannelMappingsTable.isActive, true),
        )),
      db.select({ count: count() })
        .from(storefrontProductsTable)
        .innerJoin(storefrontsTable, eq(storefrontProductsTable.storefrontId, storefrontsTable.id))
        .where(and(
          eq(storefrontsTable.companyId, cid),
          eq(storefrontProductsTable.isActive, true),
        )),
      db.select({ count: count() })
        .from(storefrontProductsTable)
        .innerJoin(storefrontsTable, eq(storefrontProductsTable.storefrontId, storefrontsTable.id))
        .where(and(
          eq(storefrontsTable.companyId, cid),
          eq(storefrontsTable.type, "aggregator"),
          eq(storefrontProductsTable.isActive, true),
        )),
      db.select({ count: count() })
        .from(b2bQuoteRequestsTable)
        .where(and(
          eq(b2bQuoteRequestsTable.toCompanyId, cid),
          gte(b2bQuoteRequestsTable.createdAt, today),
        )),
      db.select({ count: count() })
        .from(b2bQuoteRequestsTable)
        .where(and(
          eq(b2bQuoteRequestsTable.toCompanyId, cid),
          sql`${b2bQuoteRequestsTable.status} IN ('pending','replied')`,
        )),
      db.select({ total: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)` })
        .from(salesTable)
        .where(and(
          eq(salesTable.companyId, cid),
          gte(salesTable.createdAt, startOfMonth),
        )),
      db.select({ count: count() })
        .from(b2bOrdersTable)
        .where(and(
          eq(b2bOrdersTable.sellerCompanyId, cid),
          sql`${b2bOrdersTable.status} IN ('pending','accepted','processing')`,
        )),
      db.select({
        type: storefrontsTable.type,
        slug: storefrontsTable.slug,
        status: storefrontsTable.status,
      })
        .from(storefrontsTable)
        .where(eq(storefrontsTable.companyId, cid)),
      db.select({
        provider: channelAccountsTable.provider,
        name: channelAccountsTable.name,
        isActive: channelAccountsTable.isActive,
        lastSyncAt: channelAccountsTable.lastSyncAt,
      })
        .from(channelAccountsTable)
        .where(eq(channelAccountsTable.companyId, cid)),
    ]);

    res.json({
      kpis: {
        yayindakiUrun: (pazaryeriPublished[0]?.count ?? 0) + (storefrontPublished[0]?.count ?? 0),
        bugunGelenTalep: todayQuotes[0]?.count ?? 0,
        buAySatis: Number(monthSales[0]?.total ?? 0),
        bekleyenTeklif: pendingQuotes[0]?.count ?? 0,
      },
      kanallar: {
        pazaryeri: {
          aktifSayisi: activeChannels.filter((c) => c.isActive).length,
          toplamSayi: activeChannels.length,
          urunSayisi: pazaryeriPublished[0]?.count ?? 0,
          sonSenkron: activeChannels.reduce<Date | null>((acc, c) => {
            if (!c.lastSyncAt) return acc;
            const d = new Date(c.lastSyncAt as any);
            return !acc || d > acc ? d : acc;
          }, null),
        },
        webSitem: {
          aktifSayisi: activeStorefronts.filter((s) => s.status === "active" && s.type !== "aggregator").length,
          toplamSayi: activeStorefronts.filter((s) => s.type !== "aggregator").length,
          urunSayisi: (storefrontPublished[0]?.count ?? 0) - (ortakVitrinPublished[0]?.count ?? 0),
        },
        ortakVitrin: {
          aktifSayisi: activeStorefronts.filter((s) => s.status === "active" && s.type === "aggregator").length,
          toplamSayi: activeStorefronts.filter((s) => s.type === "aggregator").length,
          urunSayisi: ortakVitrinPublished[0]?.count ?? 0,
        },
      },
      siparisler: {
        bekleyen: pendingOrders[0]?.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[ticarium-center/overview] error", err);
    res.status(500).json({ error: "Genel bakış yüklenemedi" });
  }
});

export default router;
