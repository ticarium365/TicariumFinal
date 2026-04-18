import { pgTable, serial, text, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const featureFlagsRuntimeTable = pgTable("feature_flags_runtime", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  companyId: integer("company_id"),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPct: integer("rollout_pct").notNull().default(100),
  description: text("description"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("feature_flags_runtime_key_company_uniq").on(t.key, t.companyId),
}));

export type FeatureFlagRuntime = typeof featureFlagsRuntimeTable.$inferSelect;
