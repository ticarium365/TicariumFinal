// ─────────────────────────────────────────────────────────────────────────────
// Sprint D — Buyer Portal Foundation
// Alıcı (buyer) firma profilleri + RFQ (Request For Quote / Teklif Talebi) +
// hedef satıcı kayıtları. Sprint E: discovery + RFQ submit; Sprint F: quote
// response + comparison.
// ─────────────────────────────────────────────────────────────────────────────

import { pgTable, serial, text, integer, timestamp, pgEnum, jsonb, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

/** RFQ yaşam döngüsü. */
export const rfqStatusEnum = pgEnum("rfq_status", [
  "draft",      // hazırlanıyor (henüz satıcılara gönderilmedi)
  "sent",       // satıcılara dağıtıldı, yanıt bekleniyor
  "responded",  // en az 1 satıcı teklif verdi
  "awarded",    // alıcı bir teklifi kabul etti
  "cancelled",  // alıcı iptal etti
  "expired",    // teadline doldu
]);

/** RFQ hedef satırı: hangi satıcı firmaya hangi durumda gönderildi. */
export const rfqTargetStatusEnum = pgEnum("rfq_target_status", [
  "pending",    // satıcıya iletildi, henüz açılmadı
  "viewed",     // satıcı RFQ'yu açtı
  "quoted",     // satıcı teklif verdi
  "declined",   // satıcı reddetti
  "awarded",    // alıcı bu satıcının teklifini kabul etti
]);

/**
 * buyer_profiles — companyId tek alıcı profili (1:1).
 * companies.accountType IN ('buyer','both') olduğunda doldurulması beklenir.
 * Sprint E'de buyer onboarding akışı bunu set edecek.
 */
export const buyerProfilesTable = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }).unique(),
  /** Görünür alıcı adı (firma adı default) — discovery aramada gösterilir. */
  displayName: text("display_name").notNull(),
  /** İlgilendiği sektörler (jsonb string array). */
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  /** Aylık tahmini satınalma hacmi (bilgi amaçlı). */
  monthlyVolumeTry: numeric("monthly_volume_try", { precision: 14, scale: 2 }),
  /** Verified alıcı rozeti (super-admin onayı gerektirir). */
  isVerified: boolean("is_verified").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * buyer_rfqs — alıcı tarafından oluşturulan teklif talebi.
 * Multi-seller: tek RFQ birden fazla satıcıya hedeflenebilir (buyer_rfq_targets).
 */
export const buyerRfqsTable = pgTable("buyer_rfqs", {
  id: serial("id").primaryKey(),
  /** RFQ'yu oluşturan alıcı firma. */
  buyerCompanyId: integer("buyer_company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  /** Oluşturan kullanıcı (audit). */
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  /** RFQ kalemleri: [{ name, qty, unit, specs?, targetUnitPrice? }] */
  items: jsonb("items").$type<Array<{
    name: string; qty: number; unit: string; specs?: string; targetUnitPrice?: number;
  }>>().notNull().default([]),
  /** Teklif son tarihi — sonrasında otomatik 'expired' olur. */
  deadline: timestamp("deadline", { withTimezone: true }),
  /** Para birimi (default TRY). */
  currency: text("currency").notNull().default("TRY"),
  status: rfqStatusEnum("status").notNull().default("draft"),
  /** Award edilen target id (response satıcısı). */
  awardedTargetId: integer("awarded_target_id"),
  awardedAt: timestamp("awarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * buyer_rfq_targets — RFQ × satıcı firma matrisi. Aynı RFQ'da bir satıcı 1 kez yer alır.
 * Sprint F'de quote response (satır bazlı fiyat + teslimat süresi + notlar) buraya bağlanacak.
 */
export const buyerRfqTargetsTable = pgTable("buyer_rfq_targets", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => buyerRfqsTable.id, { onDelete: "cascade" }),
  /** Hedef satıcı firma. */
  sellerCompanyId: integer("seller_company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  status: rfqTargetStatusEnum("status").notNull().default("pending"),
  /** Satıcının tekliği: [{ itemIndex, unitPrice, leadTimeDays?, notes? }] */
  quoteLines: jsonb("quote_lines").$type<Array<{
    itemIndex: number; unitPrice: number; leadTimeDays?: number; notes?: string;
  }>>(),
  quoteTotal: numeric("quote_total", { precision: 14, scale: 2 }),
  quoteCurrency: text("quote_currency"),
  quoteValidUntil: timestamp("quote_valid_until", { withTimezone: true }),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfilesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertBuyerRfqSchema = createInsertSchema(buyerRfqsTable).omit({
  id: true, createdAt: true, updatedAt: true, awardedTargetId: true, awardedAt: true,
});
export const insertBuyerRfqTargetSchema = createInsertSchema(buyerRfqTargetsTable).omit({
  id: true, createdAt: true, updatedAt: true, viewedAt: true, quotedAt: true,
});

export type BuyerProfile = typeof buyerProfilesTable.$inferSelect;
export type BuyerRfq = typeof buyerRfqsTable.$inferSelect;
export type BuyerRfqTarget = typeof buyerRfqTargetsTable.$inferSelect;
export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type InsertBuyerRfq = z.infer<typeof insertBuyerRfqSchema>;
export type InsertBuyerRfqTarget = z.infer<typeof insertBuyerRfqTargetSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Sprint I — Satınalma Hesabı (purchasing): favori tedarikçi listesi.
// ─────────────────────────────────────────────────────────────────────────────
import { uniqueIndex } from "drizzle-orm/pg-core";
export const buyerFavoriteSellersTable = pgTable(
  "buyer_favorite_sellers",
  {
    id: serial("id").primaryKey(),
    buyerCompanyId: integer("buyer_company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    sellerCompanyId: integer("seller_company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("buyer_fav_unique").on(t.buyerCompanyId, t.sellerCompanyId),
  }),
);
export type BuyerFavoriteSeller = typeof buyerFavoriteSellersTable.$inferSelect;
