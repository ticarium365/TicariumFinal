-- Autopilot ROI: outcome snapshots (evidence-based, recomputable) + intent events (preview vs apply funnel)
ALTER TABLE marketplace_autopilot_action_logs
  ADD COLUMN IF NOT EXISTS outcome_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_metrics jsonb;

COMMENT ON COLUMN marketplace_autopilot_action_logs.outcome_metrics IS
  'JSON: windowed sales aggregates vs apply time; correlational not causal; see runbook.';

CREATE TABLE IF NOT EXISTS marketplace_autopilot_intent_events (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id integer REFERENCES users (id),
  intent_kind text NOT NULL,
  scope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_autopilot_intent_company_created_idx
  ON marketplace_autopilot_intent_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mp_autopilot_intent_kind_idx
  ON marketplace_autopilot_intent_events (intent_kind, created_at DESC);
