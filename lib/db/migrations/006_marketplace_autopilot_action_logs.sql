-- Marketplace autopilot: manuel onaylı aksiyonlar + rollback için snapshot
CREATE TABLE IF NOT EXISTS marketplace_autopilot_action_logs (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id integer REFERENCES users (id),
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb,
  estimated_impact jsonb,
  notes text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  rolled_back_by_user_id integer REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS mp_autopilot_company_applied_idx
  ON marketplace_autopilot_action_logs (company_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS mp_autopilot_status_idx
  ON marketplace_autopilot_action_logs (status, applied_at DESC);
