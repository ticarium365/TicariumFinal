// Sprint 80 — PostgreSQL Row-Level Security uygulama scripti
// Tenant tablolarına RLS açar + tenant_isolation policy ekler.
// Manuel çalıştırma: pnpm --filter @workspace/api-server tsx src/scripts/apply-rls.ts
//
// NOT: RLS'in çalışması için her request'in transaction içinde
// `SET LOCAL app.current_company_id = ...` çağırması gerekir.
// Bunu rlsContextMiddleware sağlar (henüz aktif edilmedi — opt-in).
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const TENANT_TABLES = [
  "products", "sales", "stock_movements", "product_views",
  "customers", "suppliers", "stock_counts", "purchases",
  "branches", "personnel", "departments", "leave_requests",
  "campaigns", "loyalty_accounts", "loyalty_transactions",
  "ad_budgets", "budgets", "audit_logs", "notifications", "notification_rules",
  "channel_accounts", "marketplace_orders", "marketplace_listings",
  "marketplace_mappings", "sync_logs", "pricing_rules",
  "einvoice_documents", "einvoice_outbox",
  "company_settings", "company_subscriptions",
  "bank_accounts", "bank_transactions", "bank_payments",
  "finance_documents", "finance_categories",
  "production_orders", "boms", "bom_items",
  "storefronts", "storefront_orders",
  "shipping_rates", "channels", "integrations",
  "documents", "data_export_requests", "data_erasure_requests",
];

async function applyRls() {
  console.log("RLS uygulanıyor...");
  for (const table of TENANT_TABLES) {
    try {
      const exists = await db.execute(sql`SELECT 1 FROM information_schema.tables WHERE table_name = ${table} LIMIT 1`);
      if (!(exists as any).rows?.length) {
        console.log(`  - ${table}: tablo yok, atlanıyor`);
        continue;
      }

      const hasCompanyId = await db.execute(sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'company_id' LIMIT 1
      `);
      if (!(hasCompanyId as any).rows?.length) {
        console.log(`  - ${table}: company_id yok, atlanıyor`);
        continue;
      }

      await db.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
      await db.execute(sql.raw(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`));
      await db.execute(sql.raw(`
        CREATE POLICY tenant_isolation ON ${table}
        USING (
          company_id = NULLIF(current_setting('app.current_company_id', true), '')::int
          OR current_setting('app.bypass_rls', true) = 'true'
        )
        WITH CHECK (
          company_id = NULLIF(current_setting('app.current_company_id', true), '')::int
          OR current_setting('app.bypass_rls', true) = 'true'
        )
      `));
      console.log(`  ✓ ${table}`);
    } catch (err: any) {
      console.error(`  ✗ ${table}: ${err.message}`);
    }
  }
  console.log("RLS uygulaması tamamlandı.");
  process.exit(0);
}

applyRls().catch((e) => { console.error(e); process.exit(1); });
