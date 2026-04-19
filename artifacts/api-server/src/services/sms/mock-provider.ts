import { SmsProvider, SmsAccountConfig, SmsSendInput, SmsSendResult, SmsHealth } from "./types.js";

/**
 * Geliştirme/test modu — gerçek SMS göndermez, başarılı yanıt simüle eder.
 * sandbox=true ya da provider=mock olduğunda kullanılır.
 */
export class MockSmsProvider implements SmsProvider {
  readonly key = "mock";
  readonly displayName = "Mock SMS (Sandbox)";
  readonly capabilities = { sendSingle: true, sendBulk: false };

  constructor(private cfg: SmsAccountConfig) {}

  async healthCheck(): Promise<SmsHealth> {
    return { ok: true, message: "Mock provider — gerçek gönderim yapılmaz", checkedAt: new Date() };
  }

  async sendSingle(input: SmsSendInput): Promise<SmsSendResult> {
    const externalId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      ok: true,
      externalId,
      rawCode: "00",
      message: `Mock gönderim başarılı (${input.toPhone}, ${input.body.length} karakter)`,
    };
  }
}
