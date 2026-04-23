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
  callbackUrl: string;  // ödeme dönüş/sonuç adresi
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
    ip?: string;
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
  /** Gerçek PSP transport'u hazır mı? (Dürüst readiness check). */
  healthCheck(): Promise<{ ok: boolean; message: string; checkedAt: Date; mode: "sandbox" | "live" | "unknown" }>;
  /** callbackUrl'den gelen `token` ile sonucu çekip normalize eder. */
  retrieveCheckoutResult(input: { token: string; conversationId?: string | null }): Promise<WebhookEvent>;
}

/* ------------------------- Mock Provider ------------------------- */
class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;
  async healthCheck() {
    return {
      ok: true,
      message: "Ödeme sağlayıcısı: MOCK (sandbox). Gerçek tahsilat yapılmaz.",
      checkedAt: new Date(),
      mode: "sandbox" as const,
    };
  }
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
  async retrieveCheckoutResult(input: { token: string; conversationId?: string | null }): Promise<WebhookEvent> {
    const conversationId = input.conversationId || input.token.replace(/^mock_/, "");
    return {
      eventType: "payment.succeeded",
      conversationId,
      externalId: input.token,
      raw: { provider: "mock", token: input.token },
    };
  }
}

/* ------------------------- Iyzico Provider (real transport via IYZWSv2) ------------------------- */
type IyzicoMode = "sandbox" | "live";

function pickMode(): IyzicoMode {
  const forced = (process.env.IYZICO_MODE || "").trim().toLowerCase();
  if (forced === "sandbox" || forced === "live") return forced;
  return process.env.NODE_ENV === "production" ? "live" : "sandbox";
}

function baseUrlForMode(mode: IyzicoMode): string {
  return mode === "live" ? "https://api.iyzipay.com" : "https://sandbox-api.iyzipay.com";
}

function hmacSha256Hex(data: string, secretKey: string): string {
  return crypto.createHmac("sha256", secretKey).update(data).digest("hex");
}

function toBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function safeTrailingZero(x: unknown): string {
  // iyzico signature docs: trailing zero normalize
  if (x == null) return "";
  const s = String(x).trim();
  if (!s) return "";
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  // remove trailing zeros after decimal
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "").replace(/\.$/, "");
}

function verifyIyzicoResponseSignature(secretKey: string, params: Array<unknown>, signature: unknown): boolean {
  const got = String(signature ?? "").trim();
  if (!got || got.length < 16) return false;
  const dataToEncrypt = params.map(safeTrailingZero).join(":");
  const expected = hmacSha256Hex(dataToEncrypt, secretKey);
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function iyzicoPost(opts: {
  path: string;
  body: unknown;
  apiKey: string;
  secretKey: string;
  mode: IyzicoMode;
}): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = `${baseUrlForMode(opts.mode)}${opts.path}`;
  const randomKey = String(Date.now()) + crypto.randomBytes(4).toString("hex");
  const bodyStr = JSON.stringify(opts.body ?? {});
  const payloadToSign = `${randomKey}${opts.path}${bodyStr}`;
  const encryptedData = hmacSha256Hex(payloadToSign, opts.secretKey);
  const base64EncodedAuthorization = toBase64(`apiKey:${opts.apiKey}&randomKey:${randomKey}&signature:${encryptedData}`);
  const authorization = `IYZWSv2 ${base64EncodedAuthorization}`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "x-iyzi-rnd": randomKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: bodyStr,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: r.ok, status: r.status, json, text };
}

class IyzicoBillingProvider implements BillingProvider {
  readonly name = "iyzico" as const;
  async healthCheck() {
    const hasEnv = Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);
    const mode = pickMode();
    return {
      ok: hasEnv,
      message: hasEnv
        ? `Iyzico transport hazır (IYZWSv2, ${mode}). Anahtar doğrulaması ilk initialize/retrieve çağrısıyla kanıtlanır.`
        : "Iyzico anahtarları tanımlı değil; ödeme akışı mock provider ile çalışır.",
      checkedAt: new Date(),
      mode: mode === "sandbox" ? "sandbox" as const : "live" as const,
    };
  }
  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const apiKey = process.env.IYZICO_API_KEY || "";
    const secretKey = process.env.IYZICO_SECRET_KEY || "";
    if (!apiKey || !secretKey) throw new Error("IYZICO_API_KEY/IYZICO_SECRET_KEY eksik");
    const mode = pickMode();

    // callbackUrl'ye conversation_id'yi taşı — iyzico token POST etse de redirect/trace için.
    const cb = new URL(input.callbackUrl);
    cb.searchParams.set("conversation_id", input.conversationId);

    // PWI buyer gereksinimleri: ip + gsm + identityNumber. Trust-first: placeholder kullanma.
    const gsmNumber = (input.buyer.gsmNumber || "").replace(/[^\d+]/g, "");
    const identityNumber = (input.buyer.identityNumber || "").replace(/[^\d]/g, "");
    const ip = input.buyer.ip || "127.0.0.1";
    if (!gsmNumber) throw new Error("buyer.gsmNumber zorunlu");
    if (!identityNumber) throw new Error("buyer.identityNumber (VKN/TCKN) zorunlu");

    const reqBody = {
      locale: "tr",
      conversationId: input.conversationId,
      price: input.amount.toFixed(2),
      paidPrice: input.amount.toFixed(2),
      currency: input.currency || "TRY",
      basketId: `sub-${input.companyId}-${input.planId}-${input.billingCycle}`,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl: cb.toString(),
      buyer: {
        id: input.buyer.id,
        name: input.buyer.name,
        surname: input.buyer.surname,
        identityNumber,
        email: input.buyer.email,
        gsmNumber,
        registrationAddress: input.buyer.registrationAddress,
        city: input.buyer.city,
        country: input.buyer.country || "Turkey",
        ip,
      },
      shippingAddress: {
        contactName: `${input.buyer.name} ${input.buyer.surname}`.trim(),
        city: input.buyer.city,
        country: input.buyer.country || "Turkey",
        address: input.buyer.registrationAddress,
      },
      billingAddress: {
        contactName: `${input.buyer.name} ${input.buyer.surname}`.trim(),
        city: input.buyer.city,
        country: input.buyer.country || "Turkey",
        address: input.buyer.registrationAddress,
      },
      basketItems: [
        {
          id: String(input.planId || "subscription"),
          name: input.planName || "Abonelik",
          category1: "subscription",
          itemType: "VIRTUAL",
          price: input.amount.toFixed(2),
        },
      ],
    };

    const r = await iyzicoPost({
      path: "/payment/pay-with-iyzico/initialize",
      body: reqBody,
      apiKey,
      secretKey,
      mode,
    });
    const j = r.json || {};
    if (!r.ok || String(j.status || "").toLowerCase() !== "success") {
      const msg = j.errorMessage || j.errorCode || r.text?.slice(0, 260) || `HTTP ${r.status}`;
      throw new Error(`Iyzico initialize failed: ${msg}`);
    }
    const paymentPageUrl = j.payWithIyzicoPageUrl || j.paymentPageUrl;
    const token = j.token;
    if (!paymentPageUrl || !token) throw new Error("Iyzico initialize: token/pageUrl eksik");
    // Response signature doğrulama (PWI Initialize): conversationId, token
    if (j.signature && !verifyIyzicoResponseSignature(secretKey, [j.conversationId, j.token], j.signature)) {
      throw new Error("Iyzico initialize signature doğrulaması başarısız");
    }
    return { paymentPageUrl, token, provider: "iyzico" };
  }
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    // Webhook doğrulaması: iyzico webhook V3 (hesapta aktif edilmesi gerekebilir).
    // Ref: docs.iyzico.com/en/advanced/webhook
    const secretKey = process.env.IYZICO_SECRET_KEY || "";
    const merchantId = process.env.IYZICO_MERCHANT_ID || "";
    if (!secretKey || !merchantId) return false;
    const hdr = headers["x-iyz-signature-v3"] || headers["x-iyz-signature"];
    const got = Array.isArray(hdr) ? hdr[0] : String(hdr || "");
    if (!got) return false;
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return false; }
    const eventType = String(payload?.eventType ?? payload?.event ?? "");
    const subscriptionReferenceCode = String(payload?.subscriptionReferenceCode ?? "");
    const orderReferenceCode = String(payload?.orderReferenceCode ?? payload?.conversationId ?? payload?.conversation_id ?? "");
    const customerReferenceCode = String(payload?.customerReferenceCode ?? "");
    const message = `${merchantId}${secretKey}${eventType}${subscriptionReferenceCode}${orderReferenceCode}${customerReferenceCode}`;
    const expected = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }
  parseWebhookEvent(payload: any): WebhookEvent {
    const status = String(payload?.status || payload?.paymentStatus || "").toLowerCase();
    const succeeded = status === "success" || status === "succeeded" || status === "paid" || status === "successed";
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

  async retrieveCheckoutResult(input: { token: string; conversationId?: string | null }): Promise<WebhookEvent> {
    const apiKey = process.env.IYZICO_API_KEY || "";
    const secretKey = process.env.IYZICO_SECRET_KEY || "";
    if (!apiKey || !secretKey) throw new Error("IYZICO_API_KEY/IYZICO_SECRET_KEY eksik");
    const mode = pickMode();
    const reqBody: any = { locale: "tr", token: input.token };
    if (input.conversationId) reqBody.conversationId = input.conversationId;
    const r = await iyzicoPost({
      path: "/payment/iyzipos/checkoutform/auth/ecom/detail",
      body: reqBody,
      apiKey,
      secretKey,
      mode,
    });
    const j = r.json || {};
    if (!r.ok || String(j.status || "").toLowerCase() !== "success") {
      const msg = j.errorMessage || j.errorCode || r.text?.slice(0, 260) || `HTTP ${r.status}`;
      return {
        eventType: "payment.failed",
        conversationId: String(input.conversationId || ""),
        errorMessage: `Iyzico retrieve failed: ${msg}`,
        raw: j || { text: r.text },
      };
    }
    // Response signature validation (Retrieve Payment Result): paymentStatus, paymentId, currency, basketId, conversationId, paidPrice, price, token
    if (j.signature) {
      const okSig = verifyIyzicoResponseSignature(secretKey, [
        j.paymentStatus,
        j.paymentId,
        j.currency,
        j.basketId,
        j.conversationId,
        j.paidPrice,
        j.price,
        j.token,
      ], j.signature);
      if (!okSig) {
        throw new Error("Iyzico retrieve signature doğrulaması başarısız");
      }
    }
    const paymentStatus = String(j.paymentStatus || "").toUpperCase();
    const succeeded = paymentStatus === "SUCCESS";
    return {
      eventType: succeeded ? "payment.succeeded" : "payment.failed",
      conversationId: String(j.conversationId || input.conversationId || ""),
      externalId: j.paymentId ? String(j.paymentId) : input.token,
      amount: j.paidPrice != null ? Number(j.paidPrice) : undefined,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      raw: j || {},
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
