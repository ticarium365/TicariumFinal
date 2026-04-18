import {
  pgTable, serial, integer, text, real, boolean, timestamp, jsonb, index, unique, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companiesTable } from "./companies";
import { productsTable } from "./products";

// 81 il + bölge sistemi: bir bölge bir veya birden fazla şehir kapsayabilir.
// Şehirler text olarak tutuluyor (TR il adları büyük harfle: ISTANBUL, ANKARA...).
export const shippingZonesTable = pgTable(
  "shipping_zones",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),         // Örn: "İstanbul İçi", "Marmara", "Doğu"
    cities: jsonb("cities").$type<string[]>().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false), // Hiçbir bölgeye girmeyen şehirler buraya
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("shipping_zones_company_idx").on(t.companyId),
    // Şirket başına en fazla bir varsayılan bölge
    uniqueIndex("shipping_zones_one_default_per_company")
      .on(t.companyId)
      .where(sql`${t.isDefault} = true`),
  ]
);

export const SHIPPING_CARRIERS = [
  "manual", "yurtici", "aras", "mng", "ptt", "ups", "ceva", "hepsijet", "trendyol_express", "sendeo",
] as const;
export type ShippingCarrier = (typeof SHIPPING_CARRIERS)[number];

// Kural: belirli bir bölge + desi aralığı için fiyat. freeOver: bu cart toplamının üzerine ücretsiz.
export const shippingRulesTable = pgTable(
  "shipping_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    zoneId: integer("zone_id").notNull()
      .references(() => shippingZonesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    carrier: text("carrier").notNull().default("manual"),
    minDesi: real("min_desi").notNull().default(0),    // dahil
    maxDesi: real("max_desi").notNull().default(999),  // dahil
    price: real("price").notNull(),                     // TL
    freeOverCartTotal: real("free_over_cart_total"),    // ≥ bu değerse 0 TL
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(100), // küçük = önce
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("shipping_rules_company_zone_idx").on(t.companyId, t.zoneId, t.isActive, t.priority),
  ]
);

// Ürün bazlı override — bu ürün için kargo bu fiyat (kural sistemini bypass eder)
export const productShippingOverridesTable = pgTable(
  "product_shipping_overrides",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    fixedPrice: real("fixed_price"),         // null + freeShipping=true → ücretsiz
    freeShipping: boolean("free_shipping").notNull().default(false),
    desi: real("desi"),                       // ürün için varsayılan desi (kural eşleşmesi için)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("product_ship_override_uq").on(t.companyId, t.productId),
  ]
);

export type ShippingZone = typeof shippingZonesTable.$inferSelect;
export type ShippingRule = typeof shippingRulesTable.$inferSelect;
export type ProductShippingOverride = typeof productShippingOverridesTable.$inferSelect;

// ─── Saf hesaplama yardımcısı ────────────────────────────────────────────────
// Türk il adları normalleştirme: tüm büyük harf, Türkçe karakterler ASCII'ye yakın.
export function normalizeCity(city: string): string {
  return city.trim().toLocaleUpperCase("tr-TR");
}

export function findZoneForCity(opts: {
  zones: ShippingZone[];
  city: string;
}): ShippingZone | null {
  const c = normalizeCity(opts.city);
  for (const z of opts.zones) {
    if ((z.cities ?? []).map(normalizeCity).includes(c)) return z;
  }
  return opts.zones.find((z) => z.isDefault) ?? null;
}

export type ShippingQuote = {
  price: number | null;
  ruleId: number | null;
  zoneId: number | null;
  reason: string;
  code: "OK" | "FREE_SHIPPING" | "NO_ZONE" | "NO_RULE";
};

export function quoteShipping(opts: {
  zones: ShippingZone[];
  rules: ShippingRule[];
  city: string;
  totalDesi: number;
  cartTotal: number;
  productOverride?: ProductShippingOverride | null;
}): ShippingQuote {
  // 1) Ürün bazlı ücretsiz/sabit (override her şeyin üstünde)
  if (opts.productOverride?.freeShipping) {
    return { price: 0, ruleId: null, zoneId: null, reason: "Ürün ücretsiz kargo", code: "FREE_SHIPPING" };
  }
  if (opts.productOverride && opts.productOverride.fixedPrice != null) {
    return { price: opts.productOverride.fixedPrice, ruleId: null, zoneId: null, reason: "Ürün sabit kargo", code: "OK" };
  }
  // 2) Şehir → bölge (deterministik: id'ye göre sıralı dolaş)
  const sortedZones = [...opts.zones].sort((a, b) => a.id - b.id);
  const zone = findZoneForCity({ zones: sortedZones, city: opts.city });
  if (!zone) {
    return {
      price: null, ruleId: null, zoneId: null, code: "NO_ZONE",
      reason: "Bu şehir için kargo bölgesi tanımlı değil — kargo hesaplanamadı",
    };
  }
  // 3) Kuralları (priority ASC, id ASC) ile deterministik sırala
  const sorted = [...opts.rules]
    .filter(r => r.zoneId === zone.id && r.isActive)
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const r of sorted) {
    if (opts.totalDesi >= r.minDesi && opts.totalDesi <= r.maxDesi) {
      if (r.freeOverCartTotal != null && opts.cartTotal >= r.freeOverCartTotal) {
        return {
          price: 0, ruleId: r.id, zoneId: zone.id, code: "FREE_SHIPPING",
          reason: `${r.name} (₺${r.freeOverCartTotal} üstü ücretsiz)`,
        };
      }
      return { price: r.price, ruleId: r.id, zoneId: zone.id, reason: r.name, code: "OK" };
    }
  }
  return {
    price: null, ruleId: null, zoneId: zone.id, code: "NO_RULE",
    reason: `${zone.name} bölgesinde ${opts.totalDesi} desi için kural tanımlı değil`,
  };
}
