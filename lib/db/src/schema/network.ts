import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const companyNetworkProfilesTable = pgTable(
  "company_network_profiles",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" })
      .unique(),
    sector: text("sector"),
    city: text("city"),
    district: text("district"),
    description: text("description"),
    address: text("address"),
    phone: text("phone"),
    website: text("website"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    isVisible: boolean("is_visible").notNull().default(false),
    showStock: boolean("show_stock").notNull().default(false),
    showPrice: boolean("show_price").notNull().default(true),
    showPhone: boolean("show_phone").notNull().default(false),
    showLocation: boolean("show_location").notNull().default(false),
    acceptOffers: boolean("accept_offers").notNull().default(false),
    acceptOrders: boolean("accept_orders").notNull().default(false),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    trustScore: real("trust_score").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    tags: jsonb("tags").$type<string[]>().default([]),
    isOnline: boolean("is_online").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cnp_city_idx").on(t.city),
    index("cnp_sector_idx").on(t.sector),
    index("cnp_visible_idx").on(t.isVisible),
  ]
);

export const companyNetworkReviewsTable = pgTable(
  "company_network_reviews",
  {
    id: serial("id").primaryKey(),
    fromCompanyId: integer("from_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    toCompanyId: integer("to_company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cnr_unique_idx").on(t.fromCompanyId, t.toCompanyId),
    index("cnr_to_idx").on(t.toCompanyId),
  ]
);

export const insertNetworkProfileSchema = createInsertSchema(companyNetworkProfilesTable).omit({
  id: true,
  companyId: true,
  trustScore: true,
  reviewCount: true,
  isOnline: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNetworkReviewSchema = createInsertSchema(companyNetworkReviewsTable).omit({
  id: true,
  fromCompanyId: true,
  createdAt: true,
}).extend({
  rating: z.number().int().min(1).max(5),
});

export type NetworkProfile = typeof companyNetworkProfilesTable.$inferSelect;
export type InsertNetworkProfile = z.infer<typeof insertNetworkProfileSchema>;
export type NetworkReview = typeof companyNetworkReviewsTable.$inferSelect;
