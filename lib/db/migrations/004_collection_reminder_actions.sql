-- Tahsilat hatırlatma → operasyon aksiyon kuyruğu (idempotent anahtar, idempotent SQL).
CREATE TABLE IF NOT EXISTS collection_reminder_actions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  reminder_tier text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  notes text,
  overdue_try_snapshot integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  created_by_user_id integer REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cra_company_period_idx
  ON collection_reminder_actions (company_id, period_key);

CREATE INDEX IF NOT EXISTS cra_status_created_idx
  ON collection_reminder_actions (status, created_at DESC);
