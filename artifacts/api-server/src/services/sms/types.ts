// ─────────────────────────────────────────────────────────────────────────────
// Provider-bağımsız SMS sözleşmesi.
// NetGSM, İletimerkezi, Vatansms, Twilio, Mock vb. bu interface'i uygular.
// ─────────────────────────────────────────────────────────────────────────────

export interface SmsAccountConfig {
  provider: string;
  sandbox: boolean;
  senderHeader: string | null;
  credentials: Record<string, any>;
}

export interface SmsSendInput {
  toPhone: string;     // E.164 ya da TR formatında — provider normalize eder
  body: string;
  ref?: string | null; // istemci tarafında izlenebilir referans
}

export interface SmsSendResult {
  ok: boolean;
  externalId?: string | null;
  rawCode?: string | null;
  message?: string;
}

export interface SmsHealth {
  ok: boolean;
  message: string;
  meta?: any;
  checkedAt: Date;
}

export interface SmsProvider {
  readonly key: string;
  readonly displayName: string;
  readonly capabilities: { sendSingle: boolean; sendBulk: boolean };
  healthCheck(): Promise<SmsHealth>;
  sendSingle(input: SmsSendInput): Promise<SmsSendResult>;
}

// ─── Yardımcı: TR mobil normalizasyonu ──────────────────────────────────────
export function normalizeTrPhone(phone: string): string {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+90")) p = p.slice(3);
  else if (p.startsWith("90") && p.length === 12) p = p.slice(2);
  else if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  return p;
}

export function isValidTrMobile(phone: string): boolean {
  const p = normalizeTrPhone(phone);
  return /^5\d{9}$/.test(p);
}
