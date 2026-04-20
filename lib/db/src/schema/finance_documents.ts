import {
  pgTable, serial, integer, text, timestamp, boolean, decimal, jsonb, index, unique,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { suppliersTable } from "./suppliers";
import { customersTable } from "./customers";

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 56 — BELGE & FATURA MERKEZİ
// Stok/satış için var olan `documents` tablosundan FARKLI: bu, finansal
// belgelerin (fatura, dekont, gider fişi, sözleşme vb.) merkezi kutusu.
// ─────────────────────────────────────────────────────────────────────────────

// Belge tipleri (sabit liste — adapter/UI bunlara göre etiketler)
export const FINANCE_DOC_TYPES = [
  "gelen_fatura",     // tedarikçiden gelen alış faturası
  "giden_fatura",     // müşteriye kesilen satış faturası
  "e_arsiv",          // e-arşiv PDF
  "e_fatura",         // resmi e-fatura
  "dekont",           // banka dekontu
  "gider_fisi",       // gider fişi / harcama makbuzu
  "irsaliye",         // sevkiyat irsaliyesi
  "sozlesme",         // kira/personel/tedarikçi sözleşmesi
  "diger",
] as const;
export type FinanceDocType = typeof FINANCE_DOC_TYPES[number];

// Belge durumları (workflow)
export const FINANCE_DOC_STATUSES = [
  "yeni",
  "islendi",
  "onay_bekliyor",
  "iptal",
  "arsiv",
] as const;
export type FinanceDocStatus = typeof FINANCE_DOC_STATUSES[number];

// Geliş kaynağı (audit)
export const FINANCE_DOC_SOURCES = [
  "manual",       // elle yüklendi
  "mail",         // mail kutusundan
  "drive",        // drive senkron
  "e_fatura_api", // e-fatura entegratör çekti
  "ocr",          // OCR ile oluşturuldu
] as const;
export type FinanceDocSource = typeof FINANCE_DOC_SOURCES[number];

// ─────────────────────────────────────────────────────────────────────────────
// KLASÖRLER (hiyerarşik — ileride parent_id ile ağaç)
// ─────────────────────────────────────────────────────────────────────────────
export const financeDocFoldersTable = pgTable("finance_doc_folders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  parentId: integer("parent_id"),  // self-ref (uygulama tarafında doğrulanır)
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon"),  // lucide icon adı
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("finance_doc_folders_company_idx").on(t.companyId),
  index("finance_doc_folders_parent_idx").on(t.parentId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// FİNANSAL BELGELER
// ─────────────────────────────────────────────────────────────────────────────
export const financeDocumentsTable = pgTable("finance_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  folderId: integer("folder_id").references(() => financeDocFoldersTable.id),

  // Dosya bilgileri
  fileName: text("file_name").notNull(),         // sistem adı
  originalName: text("original_name").notNull(), // kullanıcının yüklediği ad
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  objectPath: text("object_path").notNull(),     // /objects/uploads/<uuid>

  // Sınıflandırma
  docType: text("doc_type").notNull().default("diger"),       // FINANCE_DOC_TYPES
  status: text("status").notNull().default("yeni"),            // FINANCE_DOC_STATUSES
  source: text("source").notNull().default("manual"),          // FINANCE_DOC_SOURCES

  // Belge meta
  title: text("title"),                          // gösterim başlığı
  description: text("description"),
  documentNumber: text("document_number"),       // fatura no, dekont no
  documentDate: timestamp("document_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),

  // Karşı taraf
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  partyName: text("party_name"),                 // OCR'dan çıkarılan ham ad
  partyTaxNumber: text("party_tax_number"),

  // Tutarlar
  subtotal: decimal("subtotal", { precision: 14, scale: 2 }),
  vatAmount: decimal("vat_amount", { precision: 14, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("TRY"),

  // İşaretler
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  hasOcr: boolean("has_ocr").notNull().default(false),
  ocrText: text("ocr_text"),                     // OCR ham metin (Sprint 57)
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),

  // Bağlı kayıtlar (Sprint 58'de doldurulacak — alış/satış/gider fişine dönüştürülünce)
  convertedToType: text("converted_to_type"),    // "purchase" | "expense" | null
  convertedToId: integer("converted_to_id"),

  // Audit
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  processedBy: integer("processed_by").references(() => usersTable.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("finance_documents_company_idx").on(t.companyId, t.createdAt),
  index("finance_documents_folder_idx").on(t.folderId),
  index("finance_documents_status_idx").on(t.companyId, t.status),
  index("finance_documents_type_idx").on(t.companyId, t.docType),
  index("finance_documents_supplier_idx").on(t.supplierId),
  index("finance_documents_customer_idx").on(t.customerId),
  index("finance_documents_doc_date_idx").on(t.companyId, t.documentDate),
]);

// ─────────────────────────────────────────────────────────────────────────────
// MAİL POSTASI YAPILANDIRMASI (Sprint 56 — mail ile otomatik belge alma)
// ─────────────────────────────────────────────────────────────────────────────
export const financeDocMailboxesTable = pgTable("finance_doc_mailboxes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  // İleride her tenant'a özel inbound adres: belgeler+co<id>@ticarium365.com
  // veya IMAP ile pull. Şu an sadece konfig saklıyoruz.
  inboundAddress: text("inbound_address").notNull(),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  imapUser: text("imap_user"),
  imapPassword: text("imap_password"),  // (gizli — masklenir)
  defaultFolderId: integer("default_folder_id").references(() => financeDocFoldersTable.id),
  defaultDocType: text("default_doc_type").notNull().default("gelen_fatura"),
  isActive: boolean("is_active").notNull().default(false),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("finance_doc_mailboxes_company_unique").on(t.companyId),
]);

export type FinanceDocFolder = typeof financeDocFoldersTable.$inferSelect;
export type FinanceDocument = typeof financeDocumentsTable.$inferSelect;
export type FinanceDocMailbox = typeof financeDocMailboxesTable.$inferSelect;
