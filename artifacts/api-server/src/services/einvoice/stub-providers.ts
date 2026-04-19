import {
  EInvoiceProvider, EInvoiceProviderConfig, EInvoiceCreatePayload,
  EInvoiceCreateResult, EInvoiceSendResult, EInvoiceCancelResult,
  IncomingInvoice, ProviderHealth,
} from "./types.js";
import { buildInvoiceXml } from "./ubl-tr-builder.js";

// ─────────────────────────────────────────────────────────────────────────────
// Gerçek connector'lar — şu an stub. Kimlik bilgileri geldiğinde her provider
// için createInvoice/sendInvoice/cancelInvoice/getIncomingInvoices override
// edilir. Mimari hazır: BaseHttpStubProvider HTTP iskeletini, base URL ayrımını
// ve healthCheck'i (gerçek endpoint ping'i) sağlar.
// ─────────────────────────────────────────────────────────────────────────────

export type EndpointMap = {
  baseSandbox: string;
  baseProd: string;
  // healthCheck için ping yapılan göreli yol — genelde docs / status / oauth-token
  pingPath?: string;
};

abstract class BaseHttpStubProvider implements EInvoiceProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  readonly supportsEarsiv = true;

  constructor(protected cfg: EInvoiceProviderConfig) {}

  protected abstract endpoints(): EndpointMap;
  protected abstract requiredKeys(): string[];

  protected baseUrl(): string {
    const m = this.endpoints();
    return this.cfg.sandbox ? m.baseSandbox : m.baseProd;
  }

  protected requireConfig(keys: string[]): string | null {
    for (const k of keys) {
      if (!this.cfg.config?.[k]) return `Eksik config: ${k}`;
    }
    return null;
  }

  /**
   * Provider HTTP istemcisi — Node 18+ fetch tabanlı.
   * Auth header'ları her provider'da override edilebilir (Bearer, Basic, custom).
   * API key gelince override gerektirmeden direkt config.token / config.bearerToken kullanılır.
   */
  protected async http(method: string, path: string, opts: {
    body?: any;
    headers?: Record<string, string>;
    timeoutMs?: number;
    expectJson?: boolean;
  } = {}): Promise<{ ok: boolean; status: number; data: any; raw?: string }> {
    const url = new URL(path, this.baseUrl()).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...this.authHeaders(),
        ...(opts.headers || {}),
      };
      const res = await fetch(url, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: any = null;
      if (opts.expectJson !== false) {
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      }
      return { ok: res.ok, status: res.status, data, raw: text };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Override edilmediyse: Bearer (config.token) → Basic (config.username/password) → boş.
   * Provider'lar gerekirse override eder (örn. Paraşüt OAuth2 token cache'i).
   */
  protected authHeaders(): Record<string, string> {
    const c = this.cfg.config || {};
    if (c.token || c.bearerToken) {
      return { Authorization: `Bearer ${c.token || c.bearerToken}` };
    }
    if (c.username && c.password) {
      const b64 = Buffer.from(`${c.username}:${c.password}`).toString("base64");
      return { Authorization: `Basic ${b64}` };
    }
    return {};
  }

  async healthCheck(): Promise<ProviderHealth> {
    const missing = this.requireConfig(this.requiredKeys());
    if (missing) {
      return {
        ok: false,
        message: `${missing}. Ayarlar → E-Fatura → ${this.displayName} altından doldurun.`,
        checkedAt: new Date(),
        meta: { sandbox: this.cfg.sandbox, baseUrl: this.baseUrl() },
      };
    }
    // Gerçek HTTP ping — config doluysa endpoint'e ulaşılabiliyor mu?
    // 2xx/3xx → sunucu sağlıklı. 401/403/405 → sunucu ayakta ama yetki/method farklı (ping için kabul).
    // Diğer 4xx/5xx → degraded. Network/timeout → down.
    try {
      const path = this.endpoints().pingPath || "/";
      const r = await this.http("GET", path, { timeoutMs: 5_000, expectJson: false });
      const meta = { sandbox: this.cfg.sandbox, status: r.status };
      if (r.status >= 200 && r.status < 400) {
        return {
          ok: true,
          message: `${this.displayName} sunucusu yanıt verdi (HTTP ${r.status}).`,
          checkedAt: new Date(), meta,
        };
      }
      if (r.status === 405) {
        // Method Not Allowed — sunucu ayakta, sadece bu endpoint farklı method bekliyor.
        return {
          ok: true,
          message: `${this.displayName} sunucusu ayakta (HTTP 405 — endpoint farklı method bekliyor, normal).`,
          checkedAt: new Date(), meta,
        };
      }
      if (r.status === 401 || r.status === 403) {
        return {
          ok: false,
          message: `${this.displayName} sunucusu ayakta fakat kimlik doğrulama reddedildi (HTTP ${r.status}). Kullanıcı adı/parola/token kontrol edin.`,
          checkedAt: new Date(), meta,
        };
      }
      return {
        ok: false,
        message: `${this.displayName} beklenmeyen yanıt verdi (HTTP ${r.status}).`,
        checkedAt: new Date(), meta,
      };
    } catch (e: any) {
      const msg = e?.name === "AbortError"
        ? "Bağlantı zaman aşımına uğradı (5 sn)."
        : (e?.message || "Bağlantı kurulamadı.");
      return {
        ok: false,
        message: `${this.displayName} sunucusuna ulaşılamadı: ${msg}`,
        checkedAt: new Date(),
        meta: { sandbox: this.cfg.sandbox, error: e?.code || e?.name || "network_error" },
      };
    }
  }

  // CRUD operasyonları:
  //   createInvoice → UBL-TR 1.2 XML üretir + draft döner (transport API key gerektirir).
  //   sendInvoice/cancelInvoice → API key gelene kadar transport throw.
  //   getIncomingInvoices → boş (gerçek polling'i provider override eder).
  async createInvoice(payload: EInvoiceCreatePayload): Promise<EInvoiceCreateResult> {
    const built = buildInvoiceXml(payload);
    return {
      externalId: built.ettn,
      externalNo: built.documentNumber,
      status: "draft",
      raw: { xml: built.xml, totals: built.totals, generatedBy: "ubl-tr-builder", note: `${this.displayName} draft — transport API key bekliyor.` },
    };
  }
  async sendInvoice(_id: string): Promise<EInvoiceSendResult> {
    throw new Error(`${this.displayName} sendInvoice transport'u henüz uygulanmadı (UBL-TR XML hazır; gerçek API key bekleniyor).`);
  }
  async cancelInvoice(_id: string): Promise<EInvoiceCancelResult> {
    throw new Error(`${this.displayName} cancelInvoice transport'u henüz uygulanmadı.`);
  }
  async getIncomingInvoices(): Promise<IncomingInvoice[]> {
    return [];
  }
  async getInvoiceXml(_externalId: string): Promise<{ xml: string } | null> {
    // Cache'lemiyoruz — DB'de saklanan raw.xml frontend tarafından okunabilir.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete stub provider'lar — base URL'leri ve kimlik bilgisi şartları
// resmi dokümanlardan. CRUD endpoint mapping'leri API key gelince eklenecek.
// ─────────────────────────────────────────────────────────────────────────────

export class ParasutEInvoiceProvider extends BaseHttpStubProvider {
  readonly key = "parasut";
  readonly displayName = "Paraşüt e-Fatura";
  protected requiredKeys() { return ["clientId", "clientSecret", "username", "password", "companyId"]; }
  protected endpoints(): EndpointMap {
    return {
      baseSandbox: "https://api.parasut.com/v4/",
      baseProd: "https://api.parasut.com/v4/",
      pingPath: "/oauth/token", // OAuth uç noktası canlı mı?
    };
  }
  // Paraşüt OAuth2 password grant — token alınmadan diğer çağrılar yapılamaz.
  // Token cache + refresh işi gerçek implementasyonda eklenecek.
}

export class QnbEFinansProvider extends BaseHttpStubProvider {
  readonly key = "qnb_efinans";
  readonly displayName = "QNB eFinans";
  protected requiredKeys() { return ["username", "password", "vkn"]; }
  protected endpoints(): EndpointMap {
    return {
      baseSandbox: "https://efaturatest.qnbefinans.com/",
      baseProd: "https://efatura.qnbefinans.com/",
      pingPath: "/EarsivWebService/EarsivWebService?wsdl",
    };
  }
}

export class ForibaProvider extends BaseHttpStubProvider {
  readonly key = "foriba";
  readonly displayName = "Foriba (Sovos) e-Fatura";
  protected requiredKeys() { return ["username", "password", "vkn"]; }
  protected endpoints(): EndpointMap {
    return {
      baseSandbox: "https://services.fitcons.com/",
      baseProd: "https://services.fitcons.com/",
      pingPath: "/intepp/services/Connector?wsdl",
    };
  }
}

export class LogoEFlowProvider extends BaseHttpStubProvider {
  readonly key = "logo_eflow";
  readonly displayName = "Logo e-Flow";
  protected requiredKeys() { return ["apiKey", "username", "password"]; }
  protected endpoints(): EndpointMap {
    return {
      baseSandbox: "https://demoeflow.logo.com.tr/",
      baseProd: "https://eflow.logo.com.tr/",
      pingPath: "/Service.svc",
    };
  }
}

export class MikroProvider extends BaseHttpStubProvider {
  readonly key = "mikro";
  readonly displayName = "Mikro e-Fatura";
  protected requiredKeys() { return ["apiKey", "vkn"]; }
  protected endpoints(): EndpointMap {
    return {
      baseSandbox: "https://test.mikrofatura.com.tr/",
      baseProd: "https://api.mikrofatura.com.tr/",
      pingPath: "/api/health",
    };
  }
  protected authHeaders(): Record<string, string> {
    const k = this.cfg.config?.apiKey;
    return k ? { "X-API-KEY": String(k) } : {};
  }
}
