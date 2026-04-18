import {
  EInvoiceProvider, EInvoiceProviderConfig, EInvoiceCreatePayload,
  EInvoiceCreateResult, EInvoiceSendResult, EInvoiceCancelResult,
  IncomingInvoice, ProviderHealth,
} from "./types.js";

/**
 * Paraşüt e-Fatura connector — gerçek HTTP entegrasyonu (OAuth2 password grant + REST v4).
 *
 * Doc: https://apidocs.parasut.com
 *
 * Kimlik bilgileri eksikse / OAuth başarısızsa graceful hata döner; başarılıysa
 * gerçek fatura oluşturma + e-fatura/e-arşiv yollama + iptal + gelen kutusu çalışır.
 *
 * Token in-memory cache: clientId+username başına 7000s saklanır (Paraşüt 7200s veriyor).
 */

const TOKEN_TTL_MS = 7000 * 1000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

interface ParasutTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export class ParasutEInvoiceProvider implements EInvoiceProvider {
  readonly key = "parasut";
  readonly displayName = "Paraşüt e-Fatura";
  readonly supportsEarsiv = true;

  private readonly baseUrl = "https://api.parasut.com";

  constructor(private cfg: EInvoiceProviderConfig) {}

  // ─── Yardımcılar ─────────────────────────────────────────────────────────

  private requireConfig(): { ok: true } | { ok: false; missing: string } {
    const need = ["clientId", "clientSecret", "username", "password", "companyId"];
    for (const k of need) {
      if (!this.cfg.config?.[k]) return { ok: false, missing: k };
    }
    return { ok: true };
  }

  private cacheKey(): string {
    const c = this.cfg.config || {};
    return `${c.clientId}::${c.username}::${this.cfg.sandbox ? "sb" : "prod"}`;
  }

  private async getToken(): Promise<string> {
    const key = this.cacheKey();
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const c = this.cfg.config!;
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: String(c.clientId),
      client_secret: String(c.clientSecret),
      username: String(c.username),
      password: String(c.password),
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    });

    const res = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Paraşüt OAuth başarısız (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ParasutTokenResponse;
    if (!json.access_token) throw new Error("Paraşüt OAuth: access_token gelmedi");
    tokenCache.set(key, {
      token: json.access_token,
      expiresAt: Date.now() + Math.min(TOKEN_TTL_MS, (json.expires_in || 7200) * 1000 - 60_000),
    });
    return json.access_token;
  }

  private async api(method: string, path: string, body?: any): Promise<any> {
    const token = await this.getToken();
    const c = this.cfg.config!;
    const url = `${this.baseUrl}/v4/${encodeURIComponent(String(c.companyId))}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
    if (!res.ok) {
      const detail = parsed?.errors?.[0]?.detail || parsed?.errors?.[0]?.title || text.slice(0, 300);
      throw new Error(`Paraşüt ${method} ${path} → HTTP ${res.status}: ${detail}`);
    }
    return parsed;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<ProviderHealth> {
    const cfg = this.requireConfig();
    if (!cfg.ok) return { ok: false, message: `Eksik config: ${cfg.missing}`, checkedAt: new Date() };
    try {
      // /me endpoint bilinen public — token geçerliliğini doğrular
      const me = await this.api("GET", "");
      return {
        ok: true,
        message: "Paraşüt bağlantısı sağlandı",
        checkedAt: new Date(),
        meta: { sandbox: this.cfg.sandbox, companyId: this.cfg.config?.companyId, raw: me?.data?.attributes?.name || null },
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e), checkedAt: new Date() };
    }
  }

  async createInvoice(p: EInvoiceCreatePayload): Promise<EInvoiceCreateResult> {
    const cfg = this.requireConfig();
    if (!cfg.ok) throw new Error(`Eksik config: ${cfg.missing}`);

    // 1) Müşteri (contact) bul/oluştur — burada çok basitleştiriyoruz: receiver.name ile arar; yoksa yeni contact yaratır.
    const contactId = await this.upsertContact(p.receiver);

    // 2) Sales invoice oluştur
    const itemAttrs = p.lines.map((l) => ({
      type: "sales_invoice_details",
      attributes: {
        quantity: l.quantity,
        unit_price: l.unitPrice,
        vat_rate: l.vatRate || 0,
        discount_value: l.discountAmount || 0,
        discount_type: "amount",
        description: l.name,
      },
    }));

    const payload = {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: (p.notes || []).join(" ") || `Ticarium365 Outbox`,
          issue_date: (p.invoiceDate || new Date()).toISOString().slice(0, 10),
          due_date: (p.invoiceDate || new Date()).toISOString().slice(0, 10),
          currency: p.currency || "TRL",
        },
        relationships: {
          contact: { data: { id: contactId, type: "contacts" } },
          details: { data: itemAttrs.map((_, i) => ({ id: `tmp-${i}`, type: "sales_invoice_details" })) },
        },
      },
      included: itemAttrs.map((it, i) => ({ ...it, id: `tmp-${i}` })),
    };

    const created = await this.api("POST", "/sales_invoices", payload);
    const id = String(created?.data?.id);
    return {
      externalId: id,
      externalNo: created?.data?.attributes?.invoice_no || null,
      status: "draft",
      raw: created,
    };
  }

  private async upsertContact(receiver: EInvoiceCreatePayload["receiver"]): Promise<string> {
    // Basit: VKN/TCKN ile arar; bulamazsa yeni contact oluşturur.
    if (receiver?.vkn) {
      const found = await this.api("GET", `/contacts?filter[tax_number]=${encodeURIComponent(receiver.vkn)}&page[size]=1`);
      const id = found?.data?.[0]?.id;
      if (id) return String(id);
    }
    const created = await this.api("POST", "/contacts", {
      data: {
        type: "contacts",
        attributes: {
          name: receiver.name,
          contact_type: receiver.vkn ? "company" : "person",
          tax_number: receiver.vkn || undefined,
          email: receiver.email || undefined,
        },
      },
    });
    return String(created?.data?.id);
  }

  async sendInvoice(externalId: string): Promise<EInvoiceSendResult> {
    const cfg = this.requireConfig();
    if (!cfg.ok) throw new Error(`Eksik config: ${cfg.missing}`);
    // E-fatura mı e-arşiv mi otomatik karar Paraşüt tarafında verilir; biz e_invoices endpoint'ini deneriz, hatada e_archives.
    try {
      const sent = await this.api("POST", `/sales_invoices/${externalId}/e_invoices`, {
        data: { type: "e_invoices", attributes: { scenario: "basic", to: undefined } },
      });
      return { status: "queued", externalNo: sent?.data?.attributes?.uuid || null, raw: sent };
    } catch (eFatura) {
      const sent = await this.api("POST", `/sales_invoices/${externalId}/e_archives`, {
        data: { type: "e_archives", attributes: { internet_sale: null } },
      });
      return { status: "queued", externalNo: sent?.data?.attributes?.uuid || null, raw: sent };
    }
  }

  async cancelInvoice(externalId: string): Promise<EInvoiceCancelResult> {
    const cfg = this.requireConfig();
    if (!cfg.ok) throw new Error(`Eksik config: ${cfg.missing}`);
    // Paraşüt: faturayı iptal etmek için DELETE
    await this.api("DELETE", `/sales_invoices/${externalId}`);
    return { status: "cancelled", message: "Paraşüt'te fatura silindi" };
  }

  async getIncomingInvoices(): Promise<IncomingInvoice[]> {
    const cfg = this.requireConfig();
    if (!cfg.ok) return [];
    try {
      const list = await this.api("GET", "/e_invoice_inboxes?page[size]=50&sort=-issue_date");
      const items: any[] = list?.data || [];
      return items.map((it) => ({
        externalId: String(it.id),
        senderVkn: it.attributes?.sender_tax_number || null,
        senderName: it.attributes?.sender_name || "Bilinmeyen Tedarikçi",
        invoiceNo: it.attributes?.invoice_number || String(it.id),
        invoiceDate: it.attributes?.issue_date ? new Date(it.attributes.issue_date) : new Date(),
        totalAmount: Number(it.attributes?.net_total || it.attributes?.gross_total || 0),
        currency: it.attributes?.currency || "TRY",
        raw: it,
      }));
    } catch {
      return [];
    }
  }
}

// Test/yardımcı: token cache'i temizle
export function _clearParasutTokenCache(): void {
  tokenCache.clear();
}
