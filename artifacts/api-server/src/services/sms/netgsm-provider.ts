// ─────────────────────────────────────────────────────────────────────────────
// NetGSM SMS provider (HTTP GET REST API).
// Doküman: https://www.netgsm.com.tr/dokuman/sms-api-dokumantasyonu/
// Sözleşme: SmsProvider (services/sms/types.ts)
// ─────────────────────────────────────────────────────────────────────────────

import {
  SmsProvider, SmsAccountConfig, SmsSendInput, SmsSendResult, SmsHealth,
  isValidTrMobile, normalizeTrPhone,
} from "./types.js";

const BASE = "https://api.netgsm.com.tr/sms/send/get";
// Bakiye sorgu — sağlık taraması için. Doc: /balance/list/get
const BALANCE_BASE = "https://api.netgsm.com.tr/balance/list/get";

// NetGSM yanıt kodları → açıklama
const ERROR_CODES: Record<string, string> = {
  "20": "Mesaj gövdesi hatalı veya çok uzun",
  "30": "Geçersiz kullanıcı adı / parola / API erişimi yok",
  "40": "Mesaj başlığı (msgheader) onaysız",
  "50": "IYS (İleti Yönetim Sistemi) izinli değil",
  "51": "Aboneliğiniz ticari mesaj göndermeye uygun değil",
  "70": "Hatalı parametre",
  "80": "Gönderim sınırı aşıldı",
  "85": "Tek seferde 20'den fazla aynı mesajla gönderim yapamazsınız",
  "100": "Sistem hatası",
};

export class NetgsmProvider implements SmsProvider {
  readonly key = "netgsm";
  readonly displayName = "NetGSM";
  readonly capabilities = { sendSingle: true, sendBulk: false };

  constructor(private cfg: SmsAccountConfig) {}

  private getCreds(): { username: string; password: string; msgheader: string } | { error: string } {
    const username = this.cfg.credentials?.username;
    const password = this.cfg.credentials?.password;
    const msgheader = this.cfg.senderHeader || this.cfg.credentials?.msgheader;
    if (!username || !password || !msgheader) {
      return { error: "NetGSM kimlik bilgileri eksik (username/password/msgheader)" };
    }
    return { username: String(username), password: String(password), msgheader: String(msgheader) };
  }

  async healthCheck(): Promise<SmsHealth> {
    const c = this.getCreds();
    if ("error" in c) return { ok: false, message: c.error, checkedAt: new Date() };
    try {
      const url = new URL(BALANCE_BASE);
      url.searchParams.set("usercode", c.username);
      url.searchParams.set("password", c.password);
      url.searchParams.set("stip", "1");
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const text = (await r.text()).trim();
      // Başarılı yanıt: "<bakiye> <birim>"  (ör. "150 TL" veya "1500.00 1")
      // Hata yanıtı: tek başına kod (ör. "30")
      if (/^\d+(\.\d+)?\s+/.test(text)) {
        return { ok: true, message: `NetGSM bağlantısı sağlıklı — bakiye: ${text}`, meta: { balance: text }, checkedAt: new Date() };
      }
      const code = text.split(" ")[0];
      const expl = ERROR_CODES[code] || "Bilinmeyen NetGSM yanıtı";
      return { ok: false, message: `NetGSM kod ${code}: ${expl}`, meta: { raw: text }, checkedAt: new Date() };
    } catch (e: any) {
      return { ok: false, message: `Bağlantı hatası: ${e?.message || e}`, checkedAt: new Date() };
    }
  }

  async sendSingle(input: SmsSendInput): Promise<SmsSendResult> {
    const c = this.getCreds();
    if ("error" in c) return { ok: false, message: c.error };
    if (!isValidTrMobile(input.toPhone)) {
      return { ok: false, message: "Geçersiz Türkiye mobil numarası (5xxxxxxxxx beklenir)" };
    }
    const phone = normalizeTrPhone(input.toPhone);

    try {
      const url = new URL(BASE);
      url.searchParams.set("usercode", c.username);
      url.searchParams.set("password", c.password);
      url.searchParams.set("gsmno", phone);
      url.searchParams.set("message", input.body);
      url.searchParams.set("msgheader", c.msgheader);
      url.searchParams.set("filter", "0");
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const text = (await r.text()).trim();
      const parts = text.split(/\s+/);
      const code = parts[0];
      // 00=tam başarı, 01=kısmi başarı, 02=tek mesaj başarı (NetGSM kodları)
      const ok = code === "00" || code === "01" || code === "02";
      if (ok) {
        return { ok: true, externalId: parts[1] || null, rawCode: code, message: `Gönderim başarılı (kod ${code})` };
      }
      const expl = ERROR_CODES[code] || "Bilinmeyen NetGSM yanıtı";
      return { ok: false, rawCode: code, message: `NetGSM kod ${code}: ${expl}` };
    } catch (e: any) {
      return { ok: false, message: `Gönderim hatası: ${e?.message || e}` };
    }
  }
}
