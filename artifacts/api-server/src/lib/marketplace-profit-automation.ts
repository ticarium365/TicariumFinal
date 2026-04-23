/**
 * Pazaryeri kâr sinyalleri — salt okunur öneriler; fiyat/stok yazmaz.
 * Satış, ürün, kanal eşlemesi ve çekilen sipariş verisinden türetilir.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const PRICE_GAP_WARN_PCT = 12;
const LOW_MARGIN_PCT = 10;
const WEAK_SALE_MARGIN_PCT = 8;
const HIGH_RETURN_RATIO = 0.2;
const ZERO_SALE_DAYS = 45;
const STALE_SYNC_DAYS = 14;

export type ProfitLowStockRiskV1 = {
  productId: number;
  name: string;
  stock: number;
  minStock: number;
  accountId: number;
  accountName: string;
  provider: string;
  severity: "warning" | "critical";
  message: string;
};

export type ProfitPriceSignalV1 = {
  mappingId: number;
  productId: number;
  productName: string;
  accountId: number;
  accountName: string;
  provider: string;
  masterSalePrice: number;
  purchasePrice: number;
  channelPrice: number;
  gapPct: number;
  signal: "overpriced_vs_master" | "underpriced_vs_master";
  message: string;
};

export type ProfitZeroSaleListedV1 = {
  mappingId: number;
  productId: number;
  productName: string;
  accountId: number;
  accountName: string;
  provider: string;
  message: string;
};

export type ProfitHighReturnSkuV1 = {
  productId: number;
  productName: string;
  returnedQty: number;
  soldQty: number;
  returnRatio: number;
  message: string;
};

export type ProfitTopChannelV1 = {
  channelKey: string;
  salesRevenue30d: number;
  saleLines30d: number;
  pulledOrderRevenue30d: number;
  pulledOrderCount30d: number;
  combinedHint: string;
};

export type ProfitLowMarginProductV1 = {
  productId: number;
  name: string;
  salePrice: number;
  purchasePrice: number;
  marginPct: number | null;
  message: string;
};

export type ProfitStaleListingV1 = {
  mappingId: number;
  productId: number;
  productName: string;
  accountId: number;
  accountName: string;
  provider: string;
  lastSyncedAtIso: string | null;
  syncStatus: string;
  message: string;
};

export type ProfitRepricingRecommendationV1 = {
  mappingId: number;
  productId: number;
  productName: string;
  accountId: number;
  accountName: string;
  provider: string;
  currentChannelPrice: number;
  masterSalePrice: number;
  suggestedPrice: number;
  signal: ProfitPriceSignalV1["signal"];
  rationale: string;
  nonDestructive: true;
};

export type MarketplaceProfitAutomationV1 = {
  version: 1;
  generatedAtIso: string;
  lowStockSalesRisk: ProfitLowStockRiskV1[];
  priceChannelSignals: ProfitPriceSignalV1[];
  zeroSaleListedProducts: ProfitZeroSaleListedV1[];
  highReturnSkus: ProfitHighReturnSkuV1[];
  topRevenueChannels: ProfitTopChannelV1[];
  lowMarginProducts: ProfitLowMarginProductV1[];
  staleListings: ProfitStaleListingV1[];
  repricingRecommendations: ProfitRepricingRecommendationV1[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildMarketplaceProfitAutomationV1(
  companyId: number,
): Promise<MarketplaceProfitAutomationV1> {
  const now = new Date();

  const [
    lowStockRows,
    priceRows,
    zeroRows,
    returnRows,
    salesChRows,
    orderChRows,
    marginRows,
    staleRows,
  ] = await Promise.all([
    db.execute<{
      product_id: number;
      name: string;
      stock: number;
      min_stock: number;
      account_id: number;
      account_name: string;
      provider: string;
    }>(sql`
      SELECT p.id AS product_id, p.name, p.stock, p.min_stock,
        ca.id AS account_id, ca.name AS account_name, ca.provider
      FROM product_channel_mappings pcm
      INNER JOIN products p ON p.id = pcm.product_id AND p.company_id = ${companyId}
      INNER JOIN channel_accounts ca ON ca.id = pcm.account_id AND ca.company_id = ${companyId}
      WHERE pcm.company_id = ${companyId}
        AND pcm.is_published = true AND pcm.is_active = true AND ca.is_active = true
        AND p.is_active = true
        AND p.stock <= p.min_stock
        AND EXISTS (
          SELECT 1 FROM sales s
          WHERE s.company_id = ${companyId} AND s.product_id = p.id
            AND s.created_at >= NOW() - INTERVAL '30 days'
            AND COALESCE(s.returned, false) = false
        )
      ORDER BY p.stock ASC, p.name
      LIMIT 35
    `),
    db.execute<{
      mapping_id: number;
      product_id: number;
      product_name: string;
      account_id: number;
      account_name: string;
      provider: string;
      master_sale_price: number;
      purchase_price: number;
      channel_price: number;
      gap_pct: number;
      signal: string;
    }>(sql`
      SELECT * FROM (
        SELECT pcm.id AS mapping_id, p.id AS product_id, p.name AS product_name,
          ca.id AS account_id, ca.name AS account_name, ca.provider,
          p.sale_price::float AS master_sale_price,
          p.purchase_price::float AS purchase_price,
          COALESCE(pcm.price_override, p.sale_price)::float AS channel_price,
          CASE WHEN p.sale_price > 0 THEN
            round(((COALESCE(pcm.price_override, p.sale_price) - p.sale_price) / p.sale_price * 100)::numeric, 1)::float
          ELSE 0 END AS gap_pct,
          CASE
            WHEN p.sale_price > 0 AND COALESCE(pcm.price_override, p.sale_price) > p.sale_price * (1 + ${PRICE_GAP_WARN_PCT / 100.0}) THEN 'overpriced_vs_master'
            WHEN p.sale_price > 0 AND COALESCE(pcm.price_override, p.sale_price) < p.sale_price * (1 - ${PRICE_GAP_WARN_PCT / 100.0}) THEN 'underpriced_vs_master'
            ELSE 'ok'
          END AS signal
        FROM product_channel_mappings pcm
        INNER JOIN products p ON p.id = pcm.product_id AND p.company_id = ${companyId}
        INNER JOIN channel_accounts ca ON ca.id = pcm.account_id AND ca.company_id = ${companyId}
        WHERE pcm.company_id = ${companyId}
          AND pcm.is_published = true AND pcm.is_active = true AND p.is_active = true AND p.sale_price > 0
      ) t
      WHERE t.signal IN ('overpriced_vs_master', 'underpriced_vs_master')
      ORDER BY abs(t.gap_pct) DESC
      LIMIT 40
    `),
    db.execute<{
      mapping_id: number;
      product_id: number;
      product_name: string;
      account_id: number;
      account_name: string;
      provider: string;
    }>(sql`
      SELECT pcm.id AS mapping_id, p.id AS product_id, p.name AS product_name,
        ca.id AS account_id, ca.name AS account_name, ca.provider
      FROM product_channel_mappings pcm
      INNER JOIN products p ON p.id = pcm.product_id AND p.company_id = ${companyId}
      INNER JOIN channel_accounts ca ON ca.id = pcm.account_id AND ca.company_id = ${companyId}
      WHERE pcm.company_id = ${companyId}
        AND pcm.is_published = true AND pcm.is_active = true AND p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM sales s
          WHERE s.company_id = ${companyId} AND s.product_id = pcm.product_id
            AND s.created_at >= NOW() - (${ZERO_SALE_DAYS}::int * INTERVAL '1 day')
            AND COALESCE(s.returned, false) = false
        )
      ORDER BY pcm.updated_at DESC NULLS LAST
      LIMIT 55
    `),
    db.execute<{
      product_id: number;
      product_name: string;
      returned_qty: number;
      sold_qty: number;
      return_ratio: number;
    }>(sql`
      SELECT s.product_id, p.name AS product_name,
        SUM(CASE WHEN s.returned THEN s.quantity ELSE 0 END)::int AS returned_qty,
        SUM(s.quantity)::int AS sold_qty,
        (SUM(CASE WHEN s.returned THEN s.quantity ELSE 0 END)::float
          / NULLIF(SUM(s.quantity), 0))::float AS return_ratio
      FROM sales s
      INNER JOIN products p ON p.id = s.product_id AND p.company_id = ${companyId}
      WHERE s.company_id = ${companyId}
        AND s.created_at >= NOW() - INTERVAL '60 days'
        AND s.channel_key IS NOT NULL AND s.channel_key <> 'pos'
      GROUP BY s.product_id, p.name
      HAVING SUM(s.quantity) > 0
        AND (SUM(CASE WHEN s.returned THEN s.quantity ELSE 0 END)::float / SUM(s.quantity)) >= ${HIGH_RETURN_RATIO}
      ORDER BY return_ratio DESC, returned_qty DESC
      LIMIT 28
    `),
    db.execute<{ channel_key: string; revenue: number; n: number }>(sql`
      SELECT COALESCE(s.channel_key, 'unknown') AS channel_key,
        SUM(s.total_price)::float AS revenue,
        COUNT(*)::int AS n
      FROM sales s
      WHERE s.company_id = ${companyId}
        AND s.created_at >= NOW() - INTERVAL '30 days'
        AND COALESCE(s.returned, false) = false
        AND s.channel_key IS NOT NULL AND s.channel_key <> ''
      GROUP BY s.channel_key
      ORDER BY revenue DESC NULLS LAST
      LIMIT 12
    `),
    db.execute<{ channel_key: string; revenue: number; n: number }>(sql`
      SELECT mo.channel_key,
        SUM(mo.total_amount)::float AS revenue,
        COUNT(*)::int AS n
      FROM marketplace_orders mo
      WHERE mo.company_id = ${companyId}
        AND mo.pulled_at >= NOW() - INTERVAL '30 days'
        AND mo.converted_sale_id IS NULL
      GROUP BY mo.channel_key
      ORDER BY revenue DESC NULLS LAST
      LIMIT 12
    `),
    db.execute<{
      product_id: number;
      name: string;
      sale_price: number;
      purchase_price: number;
      margin_pct: number | null;
    }>(sql`
      SELECT p.id AS product_id, p.name,
        p.sale_price::float AS sale_price,
        p.purchase_price::float AS purchase_price,
        CASE WHEN p.sale_price > 0 THEN
          round(((p.sale_price - p.purchase_price) / p.sale_price * 100)::numeric, 1)::float
        ELSE NULL END AS margin_pct
      FROM products p
      WHERE p.company_id = ${companyId} AND p.is_active = true AND p.sale_price > 0
        AND ((p.sale_price - p.purchase_price) / p.sale_price) < (${LOW_MARGIN_PCT} / 100.0)
      ORDER BY margin_pct ASC NULLS LAST
      LIMIT 35
    `),
    db.execute<{
      mapping_id: number;
      product_id: number;
      product_name: string;
      account_id: number;
      account_name: string;
      provider: string;
      last_synced_at: Date | null;
      sync_status: string;
    }>(sql`
      SELECT pcm.id AS mapping_id, p.id AS product_id, p.name AS product_name,
        ca.id AS account_id, ca.name AS account_name, ca.provider,
        pcm.last_synced_at, pcm.sync_status
      FROM product_channel_mappings pcm
      INNER JOIN products p ON p.id = pcm.product_id AND p.company_id = ${companyId}
      INNER JOIN channel_accounts ca ON ca.id = pcm.account_id AND ca.company_id = ${companyId}
      WHERE pcm.company_id = ${companyId}
        AND pcm.is_published = true AND pcm.is_active = true
        AND (
          pcm.last_synced_at IS NULL
          OR pcm.last_synced_at < NOW() - (${STALE_SYNC_DAYS}::int * INTERVAL '1 day')
          OR pcm.sync_status = 'error'
        )
      ORDER BY pcm.last_synced_at ASC NULLS FIRST
      LIMIT 45
    `),
  ]);

  const lowStockSalesRisk: ProfitLowStockRiskV1[] = ((lowStockRows as { rows?: any[] }).rows ?? []).map((r) => {
    const crit = Number(r.stock) <= Math.max(0, Number(r.min_stock) - 2);
    return {
      productId: Number(r.product_id),
      name: String(r.name ?? ""),
      stock: Number(r.stock ?? 0),
      minStock: Number(r.min_stock ?? 0),
      accountId: Number(r.account_id),
      accountName: String(r.account_name ?? ""),
      provider: String(r.provider ?? ""),
      severity: crit ? "critical" : "warning",
      message: crit
        ? "Stok minimumun altında veya eşiğinde — son 30 günde satış var; stoksuz kalma riski yüksek."
        : "Stok minimuma yakın — son 30 günde satış var; kanal stokunu ve tedariki gözden geçirin.",
    };
  });

  const priceChannelSignals: ProfitPriceSignalV1[] = ((priceRows as { rows?: any[] }).rows ?? []).map((r) => {
    const signal = r.signal as ProfitPriceSignalV1["signal"];
    const gap = Number(r.gap_pct ?? 0);
    return {
      mappingId: Number(r.mapping_id),
      productId: Number(r.product_id),
      productName: String(r.product_name ?? ""),
      accountId: Number(r.account_id),
      accountName: String(r.account_name ?? ""),
      provider: String(r.provider ?? ""),
      masterSalePrice: Number(r.master_sale_price ?? 0),
      purchasePrice: Number(r.purchase_price ?? 0),
      channelPrice: Number(r.channel_price ?? 0),
      gapPct: gap,
      signal,
      message:
        signal === "overpriced_vs_master"
          ? `Kanal fiyatı ana satış fiyatından ~${Math.abs(gap).toFixed(1)}% yüksek; rekabet ve dönüşüm riski.`
          : `Kanal fiyatı ana satış fiyatından ~${Math.abs(gap).toFixed(1)}% düşük; marj baskısı veya hatalı override olabilir.`,
    };
  });

  const zeroSaleListedProducts: ProfitZeroSaleListedV1[] = ((zeroRows as { rows?: any[] }).rows ?? []).map((r) => ({
    mappingId: Number(r.mapping_id),
    productId: Number(r.product_id),
    productName: String(r.product_name ?? ""),
    accountId: Number(r.account_id),
    accountName: String(r.account_name ?? ""),
    provider: String(r.provider ?? ""),
    message: `Yayında listelenmiş; son ${ZERO_SALE_DAYS} günde satış satırı yok (iade hariç). Görünürlük veya fiyat kontrolü önerilir.`,
  }));

  const highReturnSkus: ProfitHighReturnSkuV1[] = ((returnRows as { rows?: any[] }).rows ?? []).map((r) => {
    const ratio = Number(r.return_ratio ?? 0);
    return {
      productId: Number(r.product_id),
      productName: String(r.product_name ?? ""),
      returnedQty: Number(r.returned_qty ?? 0),
      soldQty: Number(r.sold_qty ?? 0),
      returnRatio: ratio,
      message: `Son 60 günde iade oranı %${(ratio * 100).toFixed(1)} — kalite, kategori veya kargo beklentisini inceleyin.`,
    };
  });

  const salesByCh = new Map<string, { revenue: number; n: number }>();
  for (const r of (salesChRows as { rows?: any[] }).rows ?? []) {
    salesByCh.set(String(r.channel_key), { revenue: Number(r.revenue ?? 0), n: Number(r.n ?? 0) });
  }
  const ordersByCh = new Map<string, { revenue: number; n: number }>();
  for (const r of (orderChRows as { rows?: any[] }).rows ?? []) {
    ordersByCh.set(String(r.channel_key), { revenue: Number(r.revenue ?? 0), n: Number(r.n ?? 0) });
  }
  const allKeys = new Set([...salesByCh.keys(), ...ordersByCh.keys()]);
  const topRevenueChannels: ProfitTopChannelV1[] = [...allKeys].map((channelKey) => {
    const s = salesByCh.get(channelKey) ?? { revenue: 0, n: 0 };
    const o = ordersByCh.get(channelKey) ?? { revenue: 0, n: 0 };
    const parts: string[] = [];
    if (s.revenue > 0) parts.push(`satış kaydı ${roundMoney(s.revenue)} ₺`);
    if (o.revenue > 0) parts.push(`çekilen sipariş (satışa dönmemiş) ${roundMoney(o.revenue)} ₺`);
    return {
      channelKey,
      salesRevenue30d: roundMoney(s.revenue),
      saleLines30d: s.n,
      pulledOrderRevenue30d: roundMoney(o.revenue),
      pulledOrderCount30d: o.n,
      combinedHint: parts.length ? parts.join(" · ") : "Veri yok",
    };
  }).sort((a, b) => (b.salesRevenue30d + b.pulledOrderRevenue30d) - (a.salesRevenue30d + a.pulledOrderRevenue30d))
    .slice(0, 8);

  const lowMarginProducts: ProfitLowMarginProductV1[] = ((marginRows as { rows?: any[] }).rows ?? []).map((r) => ({
    productId: Number(r.product_id),
    name: String(r.name ?? ""),
    salePrice: Number(r.sale_price ?? 0),
    purchasePrice: Number(r.purchase_price ?? 0),
    marginPct: r.margin_pct != null ? Number(r.margin_pct) : null,
    message: `Birim marj ~${r.margin_pct ?? "?"}% — fiyat veya maliyet güncellemesi değerlendirin (otomatik değişiklik yok).`,
  }));

  const staleListings: ProfitStaleListingV1[] = ((staleRows as { rows?: any[] }).rows ?? []).map((r) => ({
    mappingId: Number(r.mapping_id),
    productId: Number(r.product_id),
    productName: String(r.product_name ?? ""),
    accountId: Number(r.account_id),
    accountName: String(r.account_name ?? ""),
    provider: String(r.provider ?? ""),
    lastSyncedAtIso: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
    syncStatus: String(r.sync_status ?? ""),
    message:
      r.sync_status === "error"
        ? "Senkron hata durumunda — log ve mapping alanlarını kontrol edin."
        : `Son senkron ${STALE_SYNC_DAYS} günden eski veya hiç yok — fiyat/stok sapması riski.`,
  }));

  const repricingRecommendations: ProfitRepricingRecommendationV1[] = priceChannelSignals.map((p) => {
    const master = p.masterSalePrice;
    const cur = p.channelPrice;
    let suggested = cur;
    let rationale = "";
    if (p.signal === "overpriced_vs_master") {
      suggested = roundMoney(master * 1.05);
      rationale =
        "Ana fiyatın ~%5 üstüne çekmek genelde marjı korur; önce kanal rekabetini ve komisyonu kontrol edin. Uygulama manuel.";
    } else {
      const cost = p.purchasePrice;
      suggested = roundMoney(Math.max(master * 0.97, cost > 0 ? cost * 1.02 : master * 0.95));
      rationale =
        "Ana fiyata yaklaştırmak marjı iyileştirir; minimum olarak maliyet + küçük tampon düşünün. Uygulama manuel.";
    }
    return {
      mappingId: p.mappingId,
      productId: p.productId,
      productName: p.productName,
      accountId: p.accountId,
      accountName: p.accountName,
      provider: p.provider,
      currentChannelPrice: roundMoney(cur),
      masterSalePrice: roundMoney(master),
      suggestedPrice: roundMoney(suggested),
      signal: p.signal,
      rationale,
      nonDestructive: true,
    };
  });

  return {
    version: 1,
    generatedAtIso: now.toISOString(),
    lowStockSalesRisk,
    priceChannelSignals,
    zeroSaleListedProducts,
    highReturnSkus,
    topRevenueChannels,
    lowMarginProducts,
    staleListings,
    repricingRecommendations,
  };
}

export async function buildMarketplaceProfitFounderAlertsV1(): Promise<{
  generatedAtIso: string;
  alerts: {
    severity: "critical" | "warning";
    code: string;
    message: string;
    companyId: number;
    companyName: string;
    metric?: number;
  }[];
}> {
  const zeroLoad = await db.execute<{
    company_id: number;
    company_name: string;
    zero_cnt: number;
    pub_cnt: number;
  }>(sql`
    WITH pub AS (
      SELECT company_id, count(*)::int AS c
      FROM product_channel_mappings
      WHERE is_published = true AND is_active = true
      GROUP BY company_id
    ),
    z AS (
      SELECT pcm.company_id,
        count(*)::int AS zero_cnt
      FROM product_channel_mappings pcm
      WHERE pcm.is_published = true AND pcm.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM sales s
          WHERE s.company_id = pcm.company_id AND s.product_id = pcm.product_id
            AND s.created_at >= NOW() - INTERVAL '45 days'
            AND COALESCE(s.returned, false) = false
        )
      GROUP BY pcm.company_id
    )
    SELECT z.company_id, c.name AS company_name, z.zero_cnt, pub.c AS pub_cnt
    FROM z
    INNER JOIN companies c ON c.id = z.company_id
    INNER JOIN pub ON pub.company_id = z.company_id
    WHERE pub.c >= 15 AND z.zero_cnt::float / NULLIF(pub.c, 0) >= 0.35
    ORDER BY z.zero_cnt DESC
    LIMIT 22
  `);

  const marginWeak = await db.execute<{
    company_id: number;
    company_name: string;
    m: number;
    lines: number;
  }>(sql`
    WITH x AS (
      SELECT s.company_id,
        avg(s.profit / NULLIF(s.total_price, 0))::float AS m,
        count(*)::int AS lines
      FROM sales s
      WHERE s.created_at >= NOW() - INTERVAL '30 days'
        AND COALESCE(s.returned, false) = false
        AND s.channel_key IS NOT NULL AND s.channel_key <> 'pos'
      GROUP BY s.company_id
      HAVING count(*) >= 20
    )
    SELECT x.company_id, c.name AS company_name, x.m, x.lines
    FROM x
    INNER JOIN companies c ON c.id = x.company_id
    WHERE x.m < (${WEAK_SALE_MARGIN_PCT} / 100.0)
    ORDER BY x.m ASC
    LIMIT 22
  `);

  const gmvLeaders = await db.execute<{
    company_id: number;
    company_name: string;
    gmv: number;
  }>(sql`
    SELECT mo.company_id, c.name AS company_name, SUM(mo.total_amount)::float AS gmv
    FROM marketplace_orders mo
    INNER JOIN companies c ON c.id = mo.company_id
    WHERE mo.pulled_at >= NOW() - INTERVAL '7 days'
    GROUP BY mo.company_id, c.name
    HAVING SUM(mo.total_amount) > 0
    ORDER BY gmv DESC NULLS LAST
    LIMIT 12
  `);

  const alerts: {
    severity: "critical" | "warning";
    code: string;
    message: string;
    companyId: number;
    companyName: string;
    metric?: number;
  }[] = [];

  for (const r of (zeroLoad as { rows?: any[] }).rows ?? []) {
    const ratio = Number(r.pub_cnt) > 0 ? Number(r.zero_cnt) / Number(r.pub_cnt) : 0;
    alerts.push({
      severity: ratio >= 0.5 ? "critical" : "warning",
      code: "zero_sale_listing_load",
      companyId: Number(r.company_id),
      companyName: String(r.company_name ?? ""),
      metric: Number(r.zero_cnt),
      message: `${r.company_name}: yayınlı ${r.pub_cnt} eşleşmeden ${r.zero_cnt} tanesinde son 45 günde satış yok — vitrin/SEO/fiyat incelemesi.`,
    });
  }
  for (const r of (marginWeak as { rows?: any[] }).rows ?? []) {
    const m = Number(r.m ?? 0);
    alerts.push({
      severity: m < 0.04 ? "critical" : "warning",
      code: "weak_marketplace_sale_margin",
      companyId: Number(r.company_id),
      companyName: String(r.company_name ?? ""),
      metric: m,
      message: `${r.company_name}: pazaryeri satış satırlarında ortalama kâr/tutar oranı %${(m * 100).toFixed(1)} (${r.lines} satır, 30g).`,
    });
  }
  for (const r of (gmvLeaders as { rows?: any[] }).rows ?? []) {
    alerts.push({
      severity: "warning",
      code: "marketplace_gmv_spotlight_7d",
      companyId: Number(r.company_id),
      companyName: String(r.company_name ?? ""),
      metric: Number(r.gmv ?? 0),
      message: `${r.company_name}: son 7 günde çekilen sipariş hacmi ~${roundMoney(Number(r.gmv))} ₺ (satışa dönüşüm fırsatı).`,
    });
  }

  return { generatedAtIso: new Date().toISOString(), alerts };
}
