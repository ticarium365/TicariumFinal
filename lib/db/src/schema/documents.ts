import {
  pgTable, serial, integer, text, timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// DOSYA/EVRAK KATEGORİLERİ
// ─────────────────────────────────────────────────────────────────────────────
export const documentCategoriesTable = pgTable("document_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("document_categories_company_idx").on(t.companyId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// EVRAKLAR
// entityType: "product" | "purchase" | "sale" | "supplier" | "customer" | "general"
// ─────────────────────────────────────────────────────────────────────────────
export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  categoryId: integer("category_id").references(() => documentCategoriesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),  // bytes
  mimeType: text("mime_type").notNull(),
  objectPath: text("object_path").notNull(), // GCS object path
  entityType: text("entity_type"),           // ilişkili nesne tipi
  entityId: integer("entity_id"),            // ilişkili nesne ID
  tags: text("tags"),                        // JSON string array
  isPublic: boolean("is_public").notNull().default(false),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("documents_company_idx").on(t.companyId, t.createdAt),
  index("documents_entity_idx").on(t.entityType, t.entityId),
  index("documents_category_idx").on(t.categoryId),
]);

export type Document = typeof documentsTable.$inferSelect;
export type DocumentCategory = typeof documentCategoriesTable.$inferSelect;
