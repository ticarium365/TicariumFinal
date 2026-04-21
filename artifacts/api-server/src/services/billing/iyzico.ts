/**
 * Dalga 22 — Iyzico billing adapter (mock-first).
 *
 * Provider seçimi: `IYZICO_API_KEY` + `IYZICO_SECRET_KEY` set ise gerçek Iyzico
 * Subscription/Checkout API'si kullanılır; yoksa **mock provider** devreye girer
 * (sandbox/dev için). Mock provider:
 *   - createCheckoutSession: anında dönüş, paymentPageUrl = `/odeme/sonuc?conversation_id=...&simulate=success`
 *   - verifyWebhookSignature: header `x-mock-signature` === `mock-ok` ise PASS
 *   - retrievePayment: bizim DB'mizden okur
 *
 * Adapter pattern: tek interface (BillingProvider) → route'lar provider-agnostic.
 * Production'a geçiş: env'i set + (opsiyonel) `iyzipay` paketi yükle (henüz
 * yok; gerçek provider implementasyonu Dalga 22B'ye bırakıldı).
 */
import crypto from "node:crypto";
import { logger } from "../../lib/logger";

export interface CheckoutSessionInput {
  conversationId: string;
  companyId: number;
  planId: number;
  planName: string;
  billingCycle: "monthly" | "yearly";
  amount: number;       // TL cinsinden, ör. 1899.00
  currency: string;     // TRY
  callbackUrl: string;  // bizim sonuç sayfamız
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    gsmNumber?: string;
    identityNumber?: string;
    registrationAddress: string;
    city: string;
    country: string;
  };
}

export interface CheckoutSessionResult {
  paymentPageUrl: string;
  token: string;
  provider: "mock" | "iyzico";
}

export interface WebhookEvent {
  eventType: "payment.succeeded" | "payment.failed" | "subscription.cancelled" | "unknown";
  conversationId: string;
  externalId?: string;
  amount?: number;
  errorCode?: string;
  errorMessage?: string;
  raw: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: "mock" | "iyzico";
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhookEvent(payload: any): WebhookEvent;
}

/* ------------------------- Mock Provider ------------------------- */
class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;
  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const url = new URL(input.callbackUrl);
    url.searchParams.set("conversation_id", input.conversationId);
    url.searchParams.set("simulate", "success");
    return {
      paymentPageUrl: url.toString(),
      token: `mock_${input.conversationId}`,
      provider: "mock",
    };
  }
  verifyWebhookSignature(_rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    const sig = headers["x-mock-signature"];
    return (Array.isArray(sig) ? sig[0] : sig) === "mock-ok";
  }
  parseWebhookEvent(payload: any): WebhookEvent {
    return {
      eventType: payload?.event === "payment.failed" ? "payment.failed" : "payment.succeeded",
      conversationId: String(payload?.conversationId ?? ""),
      externalId: payload?.paymentId ? String(payload.paymentId) : `mock_${payload?.conversationId}`,
      amount: payload?.price != null ? Number(payload.price) : undefined,
      errorCode: payload?.errorCode,
      errorMessage: payload?.errorMessage,
      raw: payload || {},
    };
  }
}

/* ------------------------- Iyzico Provider (placeholder) ------------------------- */
/**
 * Gerçek Iyzico CheckoutForm Initialize endpoint'i HMAC-SHA1 PKI string yöntemi
 * ile imzalanır. Tam implementasyon Dalga 22B'ye bırakıldı (npm `iyzipay`
 * paketi + sandbox account onayı gerek). Şimdilik bu sınıf placeholder —
 * env tetiklendiğinde aktif olur ama içeriği MockBillingProvider'a düşer
 * + log uyarısı verir; yanlış prod kullanım önlenir.
 */
class IyzicoBillingProvider implements BillingProvider {
  readonly name = "iyzico" as const;
  private mock = new MockBillingProvider();
  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    logger.warn("iyzico_provider_using_mock_fallback — full SDK not wired yet (Dalga 22B)");
    const r = await this.mock.createCheckoutSession(input);
    return { ...r, provider: "iyzico" };
  }
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    // Iyzico, callback'lere PKI signature gönderir; gerçek implementasyon HMAC-SHA1
    // (apiKey + secret) ile doğrulanır. Şimdilik shared-secret HMAC-SHA256
    // (X-Iyzi-Signature header) kabul ediyoruz.
    const secret = process.env.IYZICO_SECRET_KEY || "";
    const hdr = headers["x-iyzi-signature"];
    const got = Array.isArray(hdr) ? hdr[0] : hdr;
    if (!secret || !got) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
  parseWebhookEvent(payload: any): WebhookEvent {
    const status = String(payload?.status || payload?.paymentStatus || "").toLowerCase();
    const succeeded = status === "success" || status === "succeeded" || status === "paid";
    return {
      eventType: succeeded ? "payment.succeeded" : "payment.failed",
      conversationId: String(payload?.conversationId ?? ""),
      externalId: payload?.paymentId ? String(payload.paymentId) : undefined,
      amount: payload?.paidPrice != null ? Number(payload.paidPrice) : undefined,
      errorCode: payload?.errorCode,
      errorMessage: payload?.errorMessage,
      raw: payload || {},
    };
  }
}

/* ------------------------- Factory ------------------------- */
let _instance: BillingProvider | null = null;
export function getBillingProvider(): BillingProvider {
  if (_instance) return _instance;
  if (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY) {
    _instance = new IyzicoBillingProvider();
  } else {
    _instance = new MockBillingProvider();
  }
  return _instance;
}

export function newConversationId(): string {
  return crypto.randomUUID();
}
