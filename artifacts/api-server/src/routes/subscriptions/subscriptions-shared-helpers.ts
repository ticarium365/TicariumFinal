/**
 * subscriptions ortak yardımcılar — router'dan ayrıldı.
 */
import {
  db,
  companiesTable,
  subscriptionInvoicesTable,
  collectionReminderActionsTable,
  productFunnelEventsTable,
  usersTable,
  productsTable,
  branchesTable,
  salesTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte } from "drizzle-orm";

const MAX_SUBSCRIPTION_NOTES_CHARS = 12_000;

export function appendSubscriptionNote(previous: string | null | undefined, newLine: string): string {
  const base = (previous ?? "").trim();
  const next = base ? `${newLine}\n${base}` : newLine;
  return next.length > MAX_SUBSCRIPTION_NOTES_CHARS ? next.slice(0, MAX_SUBSCRIPTION_NOTES_CHARS) : next;
}

export function buildCancelNoteLine(reason: string | undefined): string {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const tail = reason?.trim()
    ? reason.trim().slice(0, 500).replace(/\s+/g, " ")
    : "Kullanıcı tarafından iptal";
  return `[cancel ${stamp}] ${tail}`;
}

const CANCEL_REASON_CODES = new Set(["price", "features", "support", "pause", "other", "unknown"]);

const CANCEL_REASON_LABELS: Record<string, string> = {
  price: "Fiyat",
  features: "Özellik",
  support: "Destek",
  pause: "Geçici durdurma",
  other: "Diğer",
  unknown: "Belirtilmedi",
};

export function normalizeCancelReasonCode(input: unknown): string {
  const s = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (CANCEL_REASON_CODES.has(s)) return s;
  return "unknown";
}

export function parseCancelReasonLabel(notes: string | null | undefined): string {
  if (!notes) return "Belirtilmedi";
  const m = notes.match(/\[cancel[^\]\n]*\]\s*(.+?)(?:\n|$)/s);
  if (m?.[1]) {
    const t = m[1].trim();
    return t ? t.slice(0, 120) : "Belirtilmedi";
  }
  const trimmed = notes.trim();
  if (!trimmed) return "Belirtilmedi";
  return trimmed.length <= 120 ? trimmed : `${trimmed.slice(0, 117)}…`;
}

export function churnReasonDisplay(row: { cancelReason: string | null; notes: string | null }): string {
  const c = row.cancelReason?.trim().toLowerCase() ?? "";
  if (c && CANCEL_REASON_CODES.has(c)) {
    return CANCEL_REASON_LABELS[c] ?? c;
  }
  return parseCancelReasonLabel(row.notes);
}

export function collectionReminderLevel(oldestDueDays: number): "soft" | "firm" | "urgent" {
  if (oldestDueDays <= 7) return "soft";
  if (oldestDueDays <= 30) return "firm";
  return "urgent";
}

/** Heuristik: tahsil edilebilirlik / ödeme olasılığı (0–100), eğitimli model değil. */
export function collectionRecoverability01(
  overdueTry: number,
  oldestDueDays: number,
  tier: "soft" | "firm" | "urgent",
): { payProbability0to100: number; basis: string } {
  const tierBoost = tier === "urgent" ? 22 : tier === "firm" ? 12 : 0;
  const safeTry = Math.max(0, overdueTry);
  const money = Math.min(55, Math.log10(100 + safeTry) * 14);
  const age = Math.min(40, oldestDueDays * 1.15);
  const p = Math.min(100, Math.round(money + age + tierBoost));
  const basis = `log(TRY+100)→${money.toFixed(0)} + yaş(${oldestDueDays}g)→${age.toFixed(0)} + ${tier}(+${tierBoost})`;
  return { payProbability0to100: p, basis };
}

export type RecoV2Shape = {
  id: string;
  kind: string;
  roiScore: number;
  headline: string;
  rationale: string;
  companyId?: number;
  sellerCompanyId?: number;
  requestId?: number;
  amountTry?: number;
  badges: string[];
};

/** Kuralsal kopya — LLM değil; aksiyon başına kısa karar desteği. */
export function copilotEnrichV1(a: RecoV2Shape): {
  whyNow: string;
  expectedRoiBand: string;
  ifIgnored: string;
  estimatedImpactTryBand: string;
} {
  switch (a.kind) {
    case "collect_call": {
      const amt = Math.max(0, a.amountTry ?? 0);
      const low = Math.round(amt * 0.12);
      const high = Math.round(amt * 0.42);
      return {
        whyNow: "Vadesi geçmiş bakiye yaşlandıkça tahsil maliyeti ve ilişki riski artar; skor bu yüzden öne çıktı.",
        expectedRoiBand: `Heuristik kısmi tahsil bandı ~${low}–${high} TRY (ROI skoru ${a.roiScore}).`,
        ifIgnored: "Nakit akışı baskısı ve tahsilat zinciri uzar; sonraki vade dönemleri üst üste biner.",
        estimatedImpactTryBand: `${low}–${high} TRY`,
      };
    }
    case "plan_upgrade": {
      return {
        whyNow: "Limit baskısı veya satış yoğunluğu yükseltme penceresini kısaltır; rakip kaçırılmaması için zaman kritik.",
        expectedRoiBand: `Segment skoru ${a.roiScore}; paket farkına göre MRR artışı kataloğa bağlı.`,
        ifIgnored: "Ürün/depo limiti tıkanınca büyüme durur ve memnuniyet düşebilir.",
        estimatedImpactTryBand: "MRR ↑",
      };
    }
    case "b2b_sla": {
      return {
        whyNow: "Bekleyen teklifler soğur; yanıt SLA’sı B2B güveninin doğrudan göstergesi.",
        expectedRoiBand: `Pipeline hızı; ROI skoru ${a.roiScore} (kapanan teklif başına gelir potansiyeli).`,
        ifIgnored: "Alıcı tarafında hayal kırıklığı ve teklif düşüşü; tekrarlayan kayıplar.",
        estimatedImpactTryBand: "Pipeline koruma",
      };
    }
    case "grace_churn_save": {
      return {
        whyNow: "Grace / iptal hattındaki MRR bugün kaybedilirse geri kazanım maliyeti çok artar.",
        expectedRoiBand: `MRR koruma önceliği; skor ${a.roiScore}.`,
        ifIgnored: "Aylık tekrarlayan gelir kaybı ve marka güveni zedelenmesi.",
        estimatedImpactTryBand: "MRR koruma",
      };
    }
    case "collect_followup": {
      return {
        whyNow: "Uzun süre “iletişimde” kalan kayıtlar operasyon gürültüsü yaratır ve sonuç belirsiz kalır.",
        expectedRoiBand: `Operasyon netliği; skor ${a.roiScore}.`,
        ifIgnored: "Tahsilat kuyruğu şişer; gerçek tahsil edilebilir vaka kaybolur.",
        estimatedImpactTryBand: "Operasyon",
      };
    }
    default:
      return {
        whyNow: "Sinyaller bu aksiyonu öne çıkardı; günlük yürütmede öncelik sırası netleşsin.",
        expectedRoiBand: `Öncelik skoru ${a.roiScore}.`,
        ifIgnored: "Fırsat maliyeti: ertelenen aksiyonlar birikerek haftayı zorlar.",
        estimatedImpactTryBand: "Belirsiz",
      };
  }
}

export function upgradeProbability01(args: {
  upsellScore: number;
  planLimitPressurePct: number;
  sales30d: number;
}): number {
  const p = 38
    + Math.min(32, args.upsellScore / 18)
    + Math.min(22, args.planLimitPressurePct / 4.2)
    + Math.min(8, args.sales30d / 4);
  return Math.min(100, Math.round(p));
}

/** Pazartesi başlangıçlı hafta anahtarı (YYYY-MM-DD, yerel). */
export function mondayPeriodKey(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export function reminderActionIdempotencyKey(companyId: number, periodKey: string, tier: string): string {
  return `cr:${companyId}:${periodKey}:${tier.toLowerCase()}:touch`;
}

const REMINDER_ACTION_STATUSES = new Set(["queued", "contacted", "snoozed", "dismissed", "resolved"]);

export async function recordOverdueInvoiceRecovered(args: {
  companyId: number;
  userId: number | null;
  invoiceId: number;
  amountTry: number;
}): Promise<void> {
  try {
    await db.insert(productFunnelEventsTable).values({
      companyId: args.companyId,
      userId: args.userId ?? undefined,
      eventKey: "overdue_invoice_recovered",
      props: JSON.stringify({
        invoiceId: args.invoiceId,
        amountTry: Math.round(args.amountTry),
      }).slice(0, 4000),
    });
  } catch {
    /* tablo yok / izin */
  }
  try {
    const ago14 = new Date(Date.now() - 14 * 86400000);
    const [touch] = await db.select({ id: collectionReminderActionsTable.id }).from(collectionReminderActionsTable)
      .where(and(
        eq(collectionReminderActionsTable.companyId, args.companyId),
        eq(collectionReminderActionsTable.status, "contacted"),
        gte(collectionReminderActionsTable.createdAt, ago14),
      ))
      .orderBy(desc(collectionReminderActionsTable.createdAt))
      .limit(1);
    if (!touch) return;
    await db.insert(productFunnelEventsTable).values({
      companyId: args.companyId,
      userId: args.userId ?? undefined,
      eventKey: "overdue_invoice_recovered_after_reminder",
      props: JSON.stringify({
        invoiceId: args.invoiceId,
        amountTry: Math.round(args.amountTry),
        reminderActionId: touch.id,
      }).slice(0, 4000),
    });
  } catch {
    /* aksiyon tablosu yok / izin */
  }
}

export async function calcUsage(companyId: number) {
  const [userCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(usersTable).where(eq(usersTable.companyId, companyId));
  const [productCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(productsTable).where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)));
  const [branchCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(branchesTable).where(and(eq(branchesTable.companyId, companyId), eq(branchesTable.isActive, true)));

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [salesCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(salesTable).where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, monthStart)));

  return {
    users: userCount?.count ?? 0,
    products: productCount?.count ?? 0,
    branches: branchCount?.count ?? 0,
    monthlySales: salesCount?.count ?? 0,
  };
}
