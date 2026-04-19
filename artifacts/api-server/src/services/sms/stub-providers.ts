import { SmsProvider, SmsAccountConfig, SmsSendInput, SmsSendResult, SmsHealth } from "./types.js";

abstract class BaseStub implements SmsProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  // capabilities=false ⇒ üst katman bu çağrıları "skipped" olarak işaretleyebilir
  readonly capabilities = { sendSingle: false, sendBulk: false };
  constructor(protected cfg: SmsAccountConfig) {}
  protected abstract requiredKeys(): string[];
  protected missing(): string | null {
    for (const k of this.requiredKeys()) if (!this.cfg.credentials?.[k]) return `Eksik: ${k}`;
    return null;
  }
  async healthCheck(): Promise<SmsHealth> {
    const m = this.missing();
    if (m) return { ok: false, message: m, checkedAt: new Date() };
    return {
      ok: false,
      message: `${this.displayName} HTTP entegrasyonu henüz uygulanmadı (kimlikler kayıtlı, çağrı eklenmeyi bekliyor).`,
      checkedAt: new Date(),
    };
  }
  async sendSingle(_input: SmsSendInput): Promise<SmsSendResult> {
    return { ok: false, message: `${this.displayName} sendSingle henüz uygulanmadı (sözleşme tamam, HTTP eklenmeyi bekliyor).` };
  }
}

export class IletimerkeziProvider extends BaseStub {
  readonly key = "iletimerkezi";
  readonly displayName = "İletimerkezi";
  protected requiredKeys() { return ["username", "password"]; }
}

export class VatansmsProvider extends BaseStub {
  readonly key = "vatansms";
  readonly displayName = "Vatansms";
  protected requiredKeys() { return ["apiId", "apiKey"]; }
}
