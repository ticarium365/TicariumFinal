-- Bekleyen B2B teklif yaşlandırma / sıkışma sorguları (status = pending + created_at).
CREATE INDEX IF NOT EXISTS b2b_qr_status_created_idx
  ON b2b_quote_requests (status, created_at DESC);
