import {
  pgTable, serial, integer, text, real, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const PRICING_MODES = [
  "markup_pct",      // basePrice * (1 + value/100)
  "markup_amount",   // basePrice + value
  "fixed_price",     // value
  "cost_plus_pct",   // purchasePrice * (1 + value/100)
  "discount_pct",    // basePrice * (1 - value/100)
] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const ROUNDING_MODES = [
  "none",
  "nearest_1",     // 12.43 → 12
  "nearest_5",     // 12.43 → 10
  "ceil_99",       // 12.43 → 12.99
  "ceil_95",       // 12.43 → 12.95
  "psychological_9", // 100 → 99.99
] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const priceEngineRulesTable = pgTable(
  "price_engine_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),

    // Scope filters — boş = tümü
    channelKey: text("channel_key"), // null=tüm kanallar; "trendyol"|"shopify"|"hosted"...
    categoryFilter: jsonb("category_filter").$type<string[] | null>(),
    brandFilter: jsonb("brand_filter").$type<string[] | null>(),
    productIds: jsonb("product_ids").$type<number[] | null>(),

    // Hesaplama
    mode: text("mode").notNull(),
    value: real("value").notNull(),
    minPrice: real("min_price"),
    maxPrice: real("max_price"),
    roundingMode: text("rounding_mode").notNull().default("none"),

    // Geçerlilik
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("price_engine_company_active_idx").on(t.companyId, t.isActive, t.priority),
    index("price_engine_company_channel_idx").on(t.companyId, t.channelKey),
  ]
);

export type PricingRule = typeof priceEngineRulesTable.$inferSelect;
export type NewPricingRule = typeof priceEngineRulesTable.$inferInsert;

// ─── Saf hesaplama yardımcıları ──────────────────────────────────────────────
// Tek kanonik yuvarlama fonksiyonu. Davranış:
//   nearest_1: 12.43 → 12,  12.6 → 13
//   nearest_5: 12.43 → 10,  13.0 → 15
//   ceil_99:   12.43 → 12.99, 100 → 100.99   (floor + 0.99 + +1 if needed)
//   ceil_95:   12.43 → 12.95, 100 → 100.95
//   psychological_9: 12.43 → 12.99, 100 → 99.99, 99.99 → 99.99 (whole numbers go down to .99)
export function roundPrice(price: number, mode: RoundingMode): number {
  if (price <= 0) return 0;
  let r: number;
  switch (mode) {
    case "nearest_1":
      r = Math.round(price);
      break;
    case "nearest_5":
      r = Math.round(price / 5) * 5;
      break;
    case "ceil_99": {
      // Her zaman .99 ile bitir, fiyatı hiç düşürme
      const f = Math.floor(price);
      r = price <= f + 0.99 ? f + 0.99 : f + 1 + 0.99;
      break;
    }
    case "ceil_95": {
      const f = Math.floor(price);
      r = price <= f + 0.95 ? f + 0.95 : f + 1 + 0.95;
      break;
    }
    case "psychological_9": {
      // Tam sayı veya .99 üzerinde tam sayıdan büyükse → bir önceki tam sayı + .99
      // 12.43 → 12.99 (kesirli, floor+0.99), 100 → 99.99 (tam sayı bir aşağı), 99.99 → 99.99 (zaten uygun)
      const f = Math.floor(price);
      const frac = Math.round((price - f) * 100) / 100;
      if (frac === 0) {
        // Tam sayı: bir aşağı + .99
        r = f >= 1 ? f - 1 + 0.99 : 0.99;
      } else if (frac === 0.99) {
        // Zaten .99 — değiştirme
        r = price;
      } else {
        // Diğer kesirler: floor + 0.99
        r = f + 0.99;
      }
      break;
    }
    default:
      r = price;
  }
  return Math.round(r * 100) / 100;
}

export function computePriceFromRule(opts: {
  basePrice: number;
  purchasePrice: number;
  rule: Pick<PricingRule, "mode" | "value" | "minPrice" | "maxPrice" | "roundingMode">;
}): number {
  const { basePrice, purchasePrice, rule } = opts;
  let p: number;
  switch (rule.mode as PricingMode) {
    case "markup_pct": p = basePrice * (1 + rule.value / 100); break;
    case "markup_amount": p = basePrice + rule.value; break;
    case "fixed_price": p = rule.value; break;
    case "cost_plus_pct": p = purchasePrice * (1 + rule.value / 100); break;
    case "discount_pct": p = basePrice * (1 - rule.value / 100); break;
    default: p = basePrice;
  }
  p = roundPrice(p, (rule.roundingMode || "none") as RoundingMode);
  if (rule.minPrice != null) p = Math.max(p, rule.minPrice);
  if (rule.maxPrice != null) p = Math.min(p, rule.maxPrice);
  return Math.round(p * 100) / 100;
}

export function ruleMatches(opts: {
  rule: PricingRule;
  channelKey: string;
  product: { id: number; category: string | null; brand: string | null };
  now?: Date;
}): boolean {
  const { rule, channelKey, product } = opts;
  const now = opts.now ?? new Date();
  if (!rule.isActive) return false;
  if (rule.validFrom && rule.validFrom > now) return false;
  if (rule.validTo && rule.validTo < now) return false;
  if (rule.channelKey && rule.channelKey !== channelKey) return false;
  if (rule.categoryFilter?.length && !rule.categoryFilter.includes(product.category || "")) return false;
  if (rule.brandFilter?.length && !rule.brandFilter.includes(product.brand || "")) return false;
  if (rule.productIds?.length && !rule.productIds.includes(product.id)) return false;
  return true;
}
