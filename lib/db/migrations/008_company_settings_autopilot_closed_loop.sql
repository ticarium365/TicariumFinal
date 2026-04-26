-- Reversible tenant preferences for closed-loop autopilot (rank boost / suppress overrides)
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS autopilot_closed_loop jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN company_settings.autopilot_closed_loop IS
  'JSON: { version, promotedActionTypes[], suppressedActionTypes[], autoApplyLearnedBoost?: boolean } — yalnızca sıralama; otomatik uygulama yok.';
