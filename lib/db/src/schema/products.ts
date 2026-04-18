import { pgTable, serial, text, integer, real, boolean, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  productCode: text("product_code").notNull(),
  barcode: text("barcode"),
  name: text("name").notNull(),
  brand: text("brand"),
  category: text("category"),
  description: text("description"),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  purchasePrice: real("purchase_price").notNull().default(0),
  salePrice: real("sale_price").notNull().default(0),
  profitPercent: real("profit_percent").notNull().default(0),
  discountSalePct: real("discount_sale_pct").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // Sprint 72: rafta geçen süreyi izlemek için son stok girişi
  lastStockInAt: timestamp("last_stock_in_at", { withTimezone: true }),
  // Sprint 72: özel m² (boş ise raf kuralındaki default kullanılır)
  shelfM2: real("shelf_m2"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // İş kuralı: aynı şirkette aynı ürün kodu olamaz
  productCodeCompanyIdx: uniqueIndex("products_code_company_idx").on(table.productCode, table.companyId),
  // İş kuralı: aynı şirkette aynı barkod olamaz (NULL barkodlar muaf — PostgreSQL NULL != NULL)
  barcodeCompanyIdx: uniqueIndex("products_barcode_company_idx").on(table.barcode, table.companyId),
  // İş kuralı: stok negatife düşemez
  stockNonNegative: check("products_stock_non_negative", sql`${table.stock} >= 0`),
  // Performans indexleri — aktif ürün listesi ve filtreler
  companyActiveIdx: index("products_company_active_idx").on(table.companyId, table.isActive),
  companyCategoryIdx: index("products_company_category_idx").on(table.companyId, table.category),
  companyBrandIdx: index("products_company_brand_idx").on(table.companyId, table.brand),
  companyNameIdx: index("products_company_name_idx").on(table.companyId, table.name),
}));

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
