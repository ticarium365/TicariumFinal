#!/usr/bin/env node
/**
 * P0 — Migration / şema doğrulama (salt okunur).
 * DATABASE_URL gerekir. CI ve deploy öncesi: `node scripts/verify-production-schema.mjs`
 *
 * Kontroller: kritik tablolar + marketplace autopilot ROI kolonları + company_settings.autopilot_closed_loop
 */
import pg from "pg";

if (process.env.SKIP_SCHEMA_VERIFY === "1" && process.env.NODE_ENV === "production") {
  console.error("verify-production-schema: SKIP_SCHEMA_VERIFY=1 production ortamında yasaktır");
  process.exit(1);
}

if (process.env.SKIP_SCHEMA_VERIFY === "1") {
  console.warn("verify-production-schema: SKIP_SCHEMA_VERIFY=1 — atlandı (yalnızca yerel kısa devre)");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("verify-production-schema: DATABASE_URL gerekli (veya geçici: SKIP_SCHEMA_VERIFY=1)");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 2 });

const REQUIRED = [
  { table: "companies", cols: ["id", "subdomain", "is_active", "plan_type"] },
  { table: "users", cols: ["id", "company_id", "username", "role"] },
  { table: "marketplace_autopilot_action_logs", cols: ["company_id", "action_type", "outcome_metrics"] },
  { table: "marketplace_autopilot_intent_events", cols: ["company_id", "intent_kind"] },
  { table: "company_settings", cols: ["company_id", "autopilot_closed_loop"] },
];

async function columnExists(client, table, col) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, col],
  );
  return r.rowCount > 0;
}

async function tableExists(client, table) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return r.rowCount > 0;
}

try {
  const client = await pool.connect();
  try {
    let failed = false;
    for (const { table, cols } of REQUIRED) {
      const tOk = await tableExists(client, table);
      if (!tOk) {
        console.error(`MISSING TABLE: ${table}`);
        failed = true;
        continue;
      }
      for (const c of cols) {
        const cOk = await columnExists(client, table, c);
        if (!cOk) {
          console.error(`MISSING COLUMN: ${table}.${c} — migration uygulanmamış olabilir`);
          failed = true;
        }
      }
    }
    if (failed) {
      console.error("verify-production-schema: BAŞARISIZ");
      process.exit(1);
    }
    console.log("verify-production-schema: OK — kritik tablolar ve kolonlar mevcut");
    process.exit(0);
  } finally {
    client.release();
  }
} catch (e) {
  console.error("verify-production-schema:", e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
