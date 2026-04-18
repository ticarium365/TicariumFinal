import { pgTable, serial, integer, text, real, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { usersTable } from "./users";

// Üretim reçeteleri (BOM): bir mamul ürünün hangi hammaddelerden üretildiği
export const productionRecipesTable = pgTable("production_recipes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id), // mamul
  name: text("name").notNull(), // reçete adı (varyant için: "Standart", "Eko" vs)
  outputQuantity: real("output_quantity").notNull().default(1), // 1 batch'te kaç adet mamul üretilir
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  productCompanyIdx: index("production_recipes_product_company_idx").on(t.companyId, t.productId),
  uniqRecipe: uniqueIndex("production_recipes_unique_per_product").on(t.companyId, t.productId, t.name),
}));

export const recipeComponentsTable = pgTable("recipe_components", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => productionRecipesTable.id, { onDelete: "cascade" }),
  componentProductId: integer("component_product_id").notNull().references(() => productsTable.id),
  quantity: real("quantity").notNull(),
  unit: text("unit"), // adet | kg | lt | mt
}, (t) => ({
  uniqComp: uniqueIndex("recipe_components_unique").on(t.recipeId, t.componentProductId),
  recipeIdx: index("recipe_components_recipe_idx").on(t.recipeId),
}));

// Üretim emirleri
export const productionOrdersTable = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  recipeId: integer("recipe_id").notNull().references(() => productionRecipesTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  plannedQuantity: real("planned_quantity").notNull(), // mamul cinsinden hedef
  producedQuantity: real("produced_quantity").notNull().default(0),
  scrapQuantity: real("scrap_quantity").notNull().default(0), // fire
  status: text("status").notNull().default("planned"), // planned | in_progress | completed | cancelled
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  companyStatusIdx: index("production_orders_company_status_idx").on(t.companyId, t.status),
  companyDateIdx: index("production_orders_company_date_idx").on(t.companyId, t.createdAt),
}));
