// ─────────────────────────────────────────────────────────────────────────────
// Sprint B — Notification Dispatch Service
// Tek noktadan in-app notification yazımı + günlük dedup.
// Bütçe alarmları, e-fatura olayları, ileride buyer portal RFQ leadleri burada
// birleşir. Kontrat: aynı (companyId + type + entityType + entityId) için aynı
// gün içinde yalnızca 1 kayıt yazılır → bell badge spam'i engellenir.
//
// Eşzamanlılık: dedup transaction içinde pg advisory lock ile korunur — aynı
// dispatch key'i için iki paralel istek serileştirilir; race-driven dup üretimi
// engellenir. Bu yaklaşım schema migration gerektirmez.
//
// notification-rules ile ilişki: notification-rules.ts kullanıcı tercih/eşik
// katmanıdır (kim hangi tipi alır, kanal seçimi). Bu modül **doğrudan in-app
// kayıt** yazar; rules bypass edilir çünkü Sprint B kapsamında bütçe ve e-fatura
// olayları sistem-kritik kabul ediliyor (hep yaz). Sprint B+ sonrası bu iki
// katman birleştirilebilir; o zamana kadar yeni tipler rules tablosuna manuel
// eklenmedikçe rules engine'inin filtre uygulamadığını dökümante ediyoruz.
// ─────────────────────────────────────────────────────────────────────────────

import { db, notificationsTable } from "@workspace/db";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { BudgetAlert } from "../finance/budget-alerts.js";

export type NotificationType =
  | "low_stock" | "stock_zero" | "daily_summary" | "system"
  // Sprint B yeni tipler:
  | "budget_alert_critical" | "budget_alert_warning" | "budget_alert_info"
  | "einvoice_sent" | "einvoice_failed" | "einvoice_cancelled";

export interface DispatchInput {
  companyId: number;
  userId?: number | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  /** true ise dedup atlanır; sistem alarmlarında dikkatli kullanılmalı. */
  bypassDedup?: boolean;
}

export interface DispatchResult {
  created: boolean;
  id: number | null;
  reason?: "duplicate" | "ok";
}

/**
 * Aynı gün için (companyId + type + entityType + entityId) eşleşen kayıt varsa
 * yeniden yazmaz. entityId null ise (companyId + type + entityType) üzerinden
 * dedup yapılır.
 */
/** Tek dispatch key için 64-bit advisory lock anahtarı üretir. */
function dispatchLockKey(input: DispatchInput, dayBucket: number): bigint {
  // Stabil string → BigInt hash (FNV-1a, 64-bit). Aynı dispatch key aynı kilit alır.
  const s = `${input.companyId}|${input.type}|${input.entityType ?? ""}|${input.entityId ?? "null"}|${dayBucket}`;
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  // pg_advisory_xact_lock signed bigint ister; en yüksek bit'i kırparak signed range'e indir
  return h & 0x7fffffffffffffffn;
}

export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  // bypassDedup → tek insert, lock yok
  if (input.bypassDedup) {
    const [row] = await db.insert(notificationsTable).values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    }).returning({ id: notificationsTable.id });
    return { created: true, id: row?.id ?? null, reason: "ok" };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayBucket = Math.floor(todayStart.getTime() / 86_400_000);
  const lockKey = dispatchLockKey(input, dayBucket);

  // Transaction + advisory lock: aynı dispatch key için paralel istekleri serileştir.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
    const where = and(
      eq(notificationsTable.companyId, input.companyId),
      eq(notificationsTable.type, input.type),
      input.entityType
        ? eq(notificationsTable.entityType, input.entityType)
        : isNull(notificationsTable.entityType),
      input.entityId != null
        ? eq(notificationsTable.entityId, input.entityId)
        : isNull(notificationsTable.entityId),
      gte(notificationsTable.createdAt, todayStart),
    );
    const existing = await tx.select({ id: notificationsTable.id })
      .from(notificationsTable).where(where).limit(1);
    if (existing.length > 0) {
      return { created: false, id: existing[0]!.id, reason: "duplicate" as const };
    }
    const [row] = await tx.insert(notificationsTable).values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    }).returning({ id: notificationsTable.id });
    return { created: true, id: row?.id ?? null, reason: "ok" as const };
  });
}

// ─── Bütçe alarmları ─────────────────────────────────────────────────────────

/** computeBudgetAlerts çıktısını notification olarak dağıtır. */
export async function dispatchBudgetAlerts(
  companyId: number,
  alerts: BudgetAlert[],
): Promise<{ created: number; deduped: number; total: number }> {
  let created = 0;
  let deduped = 0;
  for (const a of alerts) {
    const type: NotificationType =
      a.severity === "critical" ? "budget_alert_critical"
      : a.severity === "warning" ? "budget_alert_warning"
      : "budget_alert_info";
    const r = await dispatchNotification({
      companyId,
      type,
      title: `Bütçe uyarısı (${a.period}): ${a.label}`,
      message: a.message,
      entityType: "budget",
      // Aynı kategori + dönem kombinasyonu için günlük dedup
      // entityId null olanlarda (orphan_expense kategorisiz) dönem hash'lenir
      entityId: a.categoryId ?? hashPeriod(a.period, a.type),
    });
    if (r.created) created++; else deduped++;
  }
  return { created, deduped, total: alerts.length };
}

function hashPeriod(period: string, type: string): number {
  // Deterministik hash → NEGATIF integer namespace (gerçek categoryId'ler her
  // zaman pozitif olduğundan synthetic id'lerle collision olmaz).
  let h = 0;
  const s = `${period}:${type}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  // -2,000,000,000 .. -1 aralığına yerleştir
  return -1 * ((Math.abs(h) % 2_000_000_000) + 1);
}

// ─── E-fatura olayları ───────────────────────────────────────────────────────

export type EinvoiceEvent = "sent" | "failed" | "cancelled";

export async function dispatchEinvoiceEvent(opts: {
  companyId: number;
  outboxId: number;
  externalNo?: string | null;
  receiverName?: string | null;
  event: EinvoiceEvent;
  reason?: string | null;
}): Promise<DispatchResult> {
  const typeMap: Record<EinvoiceEvent, NotificationType> = {
    sent: "einvoice_sent",
    failed: "einvoice_failed",
    cancelled: "einvoice_cancelled",
  };
  const titleMap: Record<EinvoiceEvent, string> = {
    sent: "E-Fatura gönderildi",
    failed: "E-Fatura gönderimi başarısız",
    cancelled: "E-Fatura iptal edildi",
  };
  const ref = opts.externalNo ? ` #${opts.externalNo}` : "";
  const recv = opts.receiverName ? ` — ${opts.receiverName}` : "";
  const reasonSuffix = opts.reason ? ` (${opts.reason})` : "";
  return dispatchNotification({
    companyId: opts.companyId,
    type: typeMap[opts.event],
    title: `${titleMap[opts.event]}${ref}`,
    message: `Outbox kaydı #${opts.outboxId}${recv}${reasonSuffix}`,
    entityType: "einvoice_outbox",
    entityId: opts.outboxId,
    // Outbox event'leri statü değişimi → dedup'ı bypass et (failed→retry→sent
    // gibi geçişlerde her olay görünmeli)
    bypassDedup: true,
  });
}

// suppress unused import warning (sql may be needed for future complex queries)
void sql;
