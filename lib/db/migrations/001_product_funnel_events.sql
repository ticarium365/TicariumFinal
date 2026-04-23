-- Production-safe, idempotent. Run once per environment:
--   pnpm -C lib/db run migrate:funnel
-- Or: psql "$DATABASE_URL" -f lib/db/migrations/001_product_funnel_events.sql

CREATE TABLE IF NOT EXISTS product_funnel_events (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id integer REFERENCES users (id) ON DELETE SET NULL,
  event_key text NOT NULL,
  props text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_funnel_events_company_created_idx
  ON product_funnel_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_funnel_events_key_created_idx
  ON product_funnel_events (event_key, created_at DESC);

CREATE INDEX IF NOT EXISTS product_funnel_events_company_key_created_idx
  ON product_funnel_events (company_id, event_key, created_at DESC);

COMMENT ON TABLE product_funnel_events IS 'Append-only product/funnel analytics; low-cardinality props JSON text.';
