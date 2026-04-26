-- P0 — Yavaş sorgu denetimi (DBA / staging’de çalıştırın; üretimde pg_stat_statements gerektirir)
-- 1) CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- 2) Aşağıdaki sorguları read-only çalıştırın.

-- En çok toplam süre harcayan ifadeler (örnek)
-- SELECT queryid, calls, total_exec_time, mean_exec_time, left(query, 200) AS q
-- FROM pg_stat_statements
-- ORDER BY total_exec_time DESC
-- LIMIT 25;

-- Şema: sık join edilen tablolar için index varlığı (manuel kontrol listesi)
--   sales (company_id, created_at), (product_id, created_at)
--   product_channel_mappings (company_id, product_id, account_id)
--   marketplace_autopilot_action_logs (company_id, applied_at DESC)
