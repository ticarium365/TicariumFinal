import {
  pgTable, serial, integer, text, timestamp, jsonb, boolean, index, uniqueIndex, real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Provider keys — config-driven
export const EINVOICE_PROVIDERS = [
  "mock",
  "parasut",
  "qnb_efinans",
  "foriba",
  "logo_eflow",
  "mikro",
] as const;
export type EInvoiceProviderKey = (typeof EINVOICE_PROVIDERS)[number];

// Bir firmanın seçtiği e-fatura entegratörü ve config'i
export const einvoiceSettingsTable = pgTable("einvoice_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("mock"), // EInvoiceProviderKey
  sandbox: boolean("sandbox").notNull().default(true),
  enabled: boolean("enabled").notNull().default(false),
  // Provider-specific credentials & config (apiKey, username, password, baseUrl, vkn, sender alias…)
  config: jsonb("config").$type<Record<string, any>>().notNull().default({}),
  defaultSenderAlias: text("default_sender_alias"),
  defaultProfile: text("default_profile").default("TICARIFATURA"), // TEMELFATURA | TICARIFATURA | EARSIVFATURA
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  lastHealthOk: boolean("last_health_ok"),
  lastHealthMessage: text("last_health_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("einvoice_settings_company_idx").on(t.companyId),
]);

// Outbox: bizim oluşturup karşıya gönderdiğimiz e-faturalar
export const einvoiceOutboxTable = pgTable("einvoice_outbox", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  // Domain bağlantısı
  saleId: integer("sale_id"), // satış faturası ise
  purchaseReturnId: integer("purchase_return_id"),
  documentNumber: text("document_number"), // bizim iç fatura no
  // Karşı taraf
  receiverVkn: text("receiver_vkn"),
  receiverName: text("receiver_name").notNull(),
  receiverAlias: text("receiver_alias"),
  receiverEmail: text("receiver_email"),
  // Fatura
  invoiceType: text("invoice_type").notNull().default("SATIS"), // SATIS | IADE | ISTISNA | OZELMATRAH
  profile: text("profile").notNull().default("TICARIFATURA"),
  scenario: text("scenario").notNull().default("EFATURA"), // EFATURA | EARSIV
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
  totalAmount: real("total_amount").notNull(),
  taxAmount: real("tax_amount").notNull().default(0),
  currency: text("currency").notNull().default("TRY"),
  // Provider entegrasyonu
  provider: text("provider").notNull(),
  externalId: text("external_id"), // ETTN / UUID
  externalNo: text("external_no"), // Karşıdan dönen fatura no (örn. ABC2026000000001)
  status: text("status").notNull().default("draft"),
  // draft | queued | sent | accepted | rejected | cancelled | failed
  statusMessage: text("status_message"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  // Payload + response — debug ve denetim için
  payload: jsonb("payload").$type<any>().notNull().default({}),
  lastResponse: jsonb("last_response").$type<any>(),
  // PDF / XML cache
  pdfUrl: text("pdf_url"),
  xmlUrl: text("xml_url"),
  // Idempotency — istemci aynı anahtarla 2 kez POST ederse aynı kayıt döner
  idempotencyKey: text("idempotency_key"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("einvoice_outbox_company_status_idx").on(t.companyId, t.status),
  index("einvoice_outbox_external_idx").on(t.companyId, t.externalId),
  uniqueIndex("einvoice_outbox_idem_idx").on(t.companyId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
]);

// Inbox: karşıdan gelen e-faturalar (otomatik çekilir)
export const einvoiceInboxTable = pgTable("einvoice_inbox", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(), // ETTN
  senderVkn: text("sender_vkn"),
  senderName: text("sender_name").notNull(),
  senderAlias: text("sender_alias"),
  invoiceNo: text("invoice_no"),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  totalAmount: real("total_amount").notNull(),
  taxAmount: real("tax_amount").notNull().default(0),
  currency: text("currency").notNull().default("TRY"),
  profile: text("profile"),
  status: text("status").notNull().default("new"), // new | read | accepted | rejected | converted | archived
  responseStatus: text("response_status"), // null | accepted | rejected (UBL Application Response)
  // Otomatik dönüşüm bilgisi (Sprint 58 ile entegre)
  convertedToType: text("converted_to_type"), // 'purchase' | 'expense' | 'finance_doc' | null
  convertedToId: integer("converted_to_id"),
  rawXml: text("raw_xml"),
  pdfUrl: text("pdf_url"),
  payload: jsonb("payload").$type<any>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("einvoice_inbox_unique").on(t.companyId, t.provider, t.externalId),
  index("einvoice_inbox_company_status_idx").on(t.companyId, t.status),
]);

// Provider event log — health checks, polling sonuçları, vs.
export const einvoiceEventsTable = pgTable("einvoice_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  outboxId: integer("outbox_id"),
  inboxId: integer("inbox_id"),
  event: text("event").notNull(), // health_check | invoice_sent | inbox_polled | error
  level: text("level").notNull().default("info"), // info | warn | error
  message: text("message"),
  payload: jsonb("payload").$type<any>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("einvoice_events_company_idx").on(t.companyId, t.createdAt),
]);
