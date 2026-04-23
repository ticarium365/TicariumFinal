-- B2B teklif SLA / liste sorguları için bileşik indeks (idempotent).
CREATE INDEX IF NOT EXISTS b2b_qr_to_status_created_idx
  ON b2b_quote_requests (to_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS b2b_qr_from_status_created_idx
  ON b2b_quote_requests (from_company_id, status, created_at DESC);
