import {
  EInvoiceProvider, EInvoiceProviderConfig, EInvoiceCreatePayload,
  EInvoiceCreateResult, EInvoiceSendResult, EInvoiceCancelResult,
  IncomingInvoice, ProviderHealth,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Gerçek connector'lar — şu an stub. Kimlik bilgileri geldiğinde HTTP çağrıları
// eklenir; interface aynı kaldığı için üst katman değişmez.
// ─────────────────────────────────────────────────────────────────────────────

abstract class BaseStubProvider implements EInvoiceProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  readonly supportsEarsiv = true;

  constructor(protected cfg: EInvoiceProviderConfig) {}

  protected requireConfig(keys: string[]): string | null {
    for (const k of keys) {
      if (!this.cfg.config?.[k]) return `Eksik config: ${k}`;
    }
    return null;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const missing = this.requireConfig(this.requiredKeys());
    if (missing) {
      return { ok: false, message: missing, checkedAt: new Date() };
    }
    return {
      ok: false,
      message: `${this.displayName} bağlantısı henüz uygulanmadı (stub). Kimlik bilgileri kayıtlı, gerçek API çağrısı eklenmeyi bekliyor.`,
      checkedAt: new Date(),
      meta: { sandbox: this.cfg.sandbox },
    };
  }

  protected abstract requiredKeys(): string[];

  async createInvoice(_p: EInvoiceCreatePayload): Promise<EInvoiceCreateResult> {
    throw new Error(`${this.displayName} createInvoice henüz uygulanmadı. API kimlik bilgileri eklenince HTTP entegrasyonu açılacak.`);
  }
  async sendInvoice(_id: string): Promise<EInvoiceSendResult> {
    throw new Error(`${this.displayName} sendInvoice henüz uygulanmadı.`);
  }
  async cancelInvoice(_id: string): Promise<EInvoiceCancelResult> {
    throw new Error(`${this.displayName} cancelInvoice henüz uygulanmadı.`);
  }
  async getIncomingInvoices(): Promise<IncomingInvoice[]> {
    return [];
  }
}

export class ParasutEInvoiceProvider extends BaseStubProvider {
  readonly key = "parasut";
  readonly displayName = "Paraşüt e-Fatura";
  protected requiredKeys() { return ["clientId", "clientSecret", "username", "password", "companyId"]; }
}

export class QnbEFinansProvider extends BaseStubProvider {
  readonly key = "qnb_efinans";
  readonly displayName = "QNB eFinans";
  protected requiredKeys() { return ["username", "password", "vkn"]; }
}

export class ForibaProvider extends BaseStubProvider {
  readonly key = "foriba";
  readonly displayName = "Foriba (Sovos) e-Fatura";
  protected requiredKeys() { return ["username", "password", "vkn"]; }
}

export class LogoEFlowProvider extends BaseStubProvider {
  readonly key = "logo_eflow";
  readonly displayName = "Logo e-Flow";
  protected requiredKeys() { return ["apiKey", "username", "password"]; }
}

export class MikroProvider extends BaseStubProvider {
  readonly key = "mikro";
  readonly displayName = "Mikro e-Fatura";
  protected requiredKeys() { return ["apiKey", "vkn"]; }
}
