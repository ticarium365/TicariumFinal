-- Yapılandırılmış iptal nedeni (hunisi / founder raporları için). Idempotent.
ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason_detail text;

CREATE INDEX IF NOT EXISTS company_subscriptions_cancel_reason_idx
  ON company_subscriptions (cancel_reason)
  WHERE cancel_reason IS NOT NULL;
