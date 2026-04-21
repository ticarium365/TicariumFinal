// ─────────────────────────────────────────────────────────────────────────────
// SMS provider factory + per-tenant resolver.
// E-fatura ve marketplace tarafında kullanılan aynı registry kalıbına uygundur.
// ─────────────────────────────────────────────────────────────────────────────

import { db, smsSettingsTable, smsMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptSecrets } from "../../lib/secret-crypto.js";
import { logger } from "../../lib/logger.js";
import { assertWithinUsageLimit, incrementUsageSafe } from "../usage.js";
import { SmsProvider, SmsAccountConfig, SmsSendInput } from "./types.js";
import { NetgsmProvider } from "./netgsm-provider.js";
import { MockSmsProvider } from "./mock-provider.js";
import { IletimerkeziProvider, VatansmsProvider } from "./stub-providers.js";

export const SMS_REGISTRY: Record<string, new (cfg: SmsAccountConfig) => SmsProvider> = {
  mock: MockSmsProvider,
  netgsm: NetgsmProvider,
  iletimerkezi: IletimerkeziProvider,
  vatansms: VatansmsProvider,
};

export const SMS_META = [
  { key: "mock", label: "Mock (Sandbox)", needs: [], description: "Geliştirme/test — gerçek gönderim yapılmaz" },
  { key: "netgsm", label: "NetGSM", needs: ["username", "password"], description: "msgheader senderHeader alanından okunur" },
  { key: "iletimerkezi", label: "İletimerkezi", needs: ["username", "password"], description: "Stub — HTTP eklenmeyi bekliyor" },
  { key: "vatansms", label: "Vatansms", needs: ["apiId", "apiKey"], description: "Stub — HTTP eklenmeyi bekliyor" },
];

/**
 * Tenant için aktif SMS provider'ı döndürür.
 * Karar ağacı:
 *   1) sms_settings satırı var ve isActive=false  → "disabled" (gönderim yasak)
 *   2) Satır var, sandbox veya provider=mock      → MockSmsProvider (tenant kararı)
 *   3) Satır var, bilinen provider                → o provider (DB credentials)
 *   4) Satır yok, env NetGSM tanımlı              → legacy NetGSM (env)
 *   5) Aksi halde                                  → "missing" (provider yok, gönderim engellenir)
 */
export type SmsResolveSource = "db" | "env" | "missing" | "disabled";

export async function getSmsProviderForCompany(companyId: number): Promise<{
  provider: SmsProvider;
  source: SmsResolveSource;
  resolvedKey: string;
  reason?: string;
}> {
  const [row] = await db.select().from(smsSettingsTable)
    .where(eq(smsSettingsTable.companyId, companyId)).limit(1);

  if (row) {
    if (!row.isActive) {
      // Tenant açıkça kapattı — env fallback'ine düşmek yetki ihlali olur.
      const cfg: SmsAccountConfig = { provider: "mock", sandbox: true, senderHeader: row.senderHeader, credentials: {} };
      return {
        provider: new MockSmsProvider(cfg),
        source: "disabled",
        resolvedKey: "disabled",
        reason: "Tenant SMS gönderimini devre dışı bırakmış (isActive=false)",
      };
    }
    if (row.sandbox || row.provider === "mock") {
      const cfg: SmsAccountConfig = { provider: "mock", sandbox: true, senderHeader: row.senderHeader, credentials: {} };
      return { provider: new MockSmsProvider(cfg), source: "db", resolvedKey: "mock" };
    }
    const Klass = SMS_REGISTRY[row.provider];
    if (Klass) {
      const cfg: SmsAccountConfig = {
        provider: row.provider,
        sandbox: row.sandbox,
        senderHeader: row.senderHeader,
        credentials: decryptSecrets((row.credentials as any) || {}),
      };
      return { provider: new Klass(cfg), source: "db", resolvedKey: row.provider };
    }
  }

  // Legacy: env değişkenleriyle NetGSM (eski tek-tenant deploy'lar için geriye dönük destek).
  // YALNIZ DB satırı yokken VE SMS_ALLOW_ENV_FALLBACK=true ise devreye girer.
  // Multi-tenant SaaS modunda paylaşılan kimlik bilgileri tenant izolasyonunu bozar.
  const envUser = process.env.NETGSM_USERNAME;
  const envPass = process.env.NETGSM_PASSWORD;
  const envHeader = process.env.NETGSM_HEADER;
  const envFallbackAllowed = process.env.SMS_ALLOW_ENV_FALLBACK === "true";
  if (!row && envFallbackAllowed && envUser && envPass && envHeader) {
    const cfg: SmsAccountConfig = {
      provider: "netgsm", sandbox: false, senderHeader: envHeader,
      credentials: { username: envUser, password: envPass },
    };
    return { provider: new NetgsmProvider(cfg), source: "env", resolvedKey: "netgsm" };
  }

  // Hiçbir şey yok — gönderim engellenmeli. Üst katman bu durumu hata olarak yansıtır.
  return {
    provider: new MockSmsProvider({ provider: "mock", sandbox: true, senderHeader: null, credentials: {} }),
    source: "missing",
    resolvedKey: "none",
    reason: "Hiçbir SMS provider yapılandırılmamış",
  };
}

/**
 * Backward-compat shim — eski çağrı imzasını korur.
 * Yeni kod doğrudan getSmsProviderForCompany() kullanmalı.
 */
export async function sendSms(opts: {
  companyId: number;
  toPhone: string;
  body: string;
}): Promise<{ ok: boolean; messageId?: number; externalId?: string; error?: string; quotaExceeded?: boolean }> {
  // Dalga 23 — SMS kontör gating (companyId=0 → sistem mesajı, gating yok)
  if (opts.companyId > 0) {
    try { await assertWithinUsageLimit(opts.companyId, "sms", 1); }
    catch (err: any) {
      if (err?.code === "QUOTA_EXCEEDED") {
        const [msg] = await db.insert(smsMessagesTable).values({
          companyId: opts.companyId,
          toPhone: opts.toPhone,
          body: opts.body,
          provider: "n/a",
          status: "quota_exceeded",
          errorMessage: "SMS kontörü aşıldı — ek kontör satın alın",
        }).returning();
        logger.warn({ messageId: msg.id, companyId: opts.companyId }, "sms_quota_exceeded");
        return { ok: false, messageId: msg.id, error: "SMS kontörü aşıldı", quotaExceeded: true };
      }
      throw err;
    }
  }

  const { provider, source, resolvedKey, reason } = await getSmsProviderForCompany(opts.companyId);

  // Tenant kapatmış ya da hiçbir provider yok → DB'ye failed yaz, gönderme.
  if (source === "missing" || source === "disabled") {
    const [msg] = await db.insert(smsMessagesTable).values({
      companyId: opts.companyId,
      toPhone: opts.toPhone,
      body: opts.body,
      provider: resolvedKey,
      status: source === "missing" ? "no_provider" : "disabled",
      errorMessage: reason || "SMS gönderimi yapılamıyor",
    }).returning();
    logger.warn({ messageId: msg.id, companyId: opts.companyId, source }, "sms_send_blocked");
    return { ok: false, messageId: msg.id, error: reason || "SMS provider yapılandırılmamış" };
  }

  // Gerçek/sandbox gönderim — once kayıt aç, sonra provider'ı çağır.
  const [msg] = await db.insert(smsMessagesTable).values({
    companyId: opts.companyId,
    toPhone: opts.toPhone,
    body: opts.body,
    provider: resolvedKey,
    status: "queued",
  }).returning();

  const r = await provider.sendSingle({ toPhone: opts.toPhone, body: opts.body });

  await db.update(smsMessagesTable).set({
    status: r.ok ? "sent" : "failed",
    externalId: r.externalId ?? null,
    errorMessage: r.ok ? null : (r.message || "send_failed"),
    sentAt: r.ok ? new Date() : null,
  }).where(eq(smsMessagesTable.id, msg.id));

  if (r.ok && opts.companyId > 0) incrementUsageSafe(opts.companyId, "sms", 1);
  return r.ok
    ? { ok: true, messageId: msg.id, externalId: r.externalId || undefined }
    : { ok: false, messageId: msg.id, error: r.message || "send_failed" };
}
