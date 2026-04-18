import { randomUUID } from "crypto";
import {
  EInvoiceProvider, EInvoiceProviderConfig, EInvoiceCreatePayload,
  EInvoiceCreateResult, EInvoiceSendResult, EInvoiceCancelResult,
  IncomingInvoice, ProviderHealth, calculateInvoiceTotals,
} from "./types.js";

// In-memory store — sandbox/test ortamı için. Sunucu restart olunca temizlenir.
const memInvoices: Record<string, { payload: EInvoiceCreatePayload; status: string; createdAt: Date }> = {};
const memIncoming: Record<string, IncomingInvoice[]> = {};

export class MockEInvoiceProvider implements EInvoiceProvider {
  readonly key = "mock";
  readonly displayName = "Mock E-Fatura (Sandbox)";
  readonly supportsEarsiv = true;

  constructor(private cfg: EInvoiceProviderConfig) {}

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: true,
      message: "Mock provider hazır (sandbox=" + this.cfg.sandbox + ").",
      checkedAt: new Date(),
      meta: { mode: "in-memory" },
    };
  }

  async createInvoice(payload: EInvoiceCreatePayload): Promise<EInvoiceCreateResult> {
    const externalId = randomUUID();
    const externalNo = "MOCK" + new Date().getFullYear() + String(Object.keys(memInvoices).length + 1).padStart(9, "0");
    memInvoices[externalId] = { payload, status: "draft", createdAt: new Date() };
    return {
      externalId,
      externalNo,
      status: "draft",
      raw: { totals: calculateInvoiceTotals(payload.lines) },
    };
  }

  async sendInvoice(externalId: string): Promise<EInvoiceSendResult> {
    const inv = memInvoices[externalId];
    if (!inv) return { externalId, status: "failed", message: "Fatura bulunamadı" };
    inv.status = "accepted";
    return { externalId, status: "accepted", message: "Mock provider tarafından kabul edildi" };
  }

  async cancelInvoice(externalId: string, reason?: string): Promise<EInvoiceCancelResult> {
    const inv = memInvoices[externalId];
    if (!inv) return { externalId, status: "failed", message: "Fatura bulunamadı" };
    inv.status = "cancelled";
    return { externalId, status: "cancelled", message: reason || "Mock iptal" };
  }

  async getIncomingInvoices(opts?: { since?: Date; limit?: number }): Promise<IncomingInvoice[]> {
    const key = JSON.stringify(this.cfg.config?.tenant || "default");
    const list = memIncoming[key] || [];
    let filtered = list;
    if (opts?.since) filtered = filtered.filter((i) => i.invoiceDate >= opts.since!);
    if (opts?.limit) filtered = filtered.slice(0, opts.limit);
    // Sandbox modunda örnek bir fake gelen fatura üret (test kolaylığı)
    if (this.cfg.sandbox && list.length === 0) {
      const fake: IncomingInvoice = {
        externalId: randomUUID(),
        invoiceNo: "MOCK_IN_" + Date.now(),
        invoiceDate: new Date(),
        receivedAt: new Date(),
        senderVkn: "1234567890",
        senderName: "Test Tedarikçi A.Ş.",
        senderAlias: "urn:mail:test@tedarikci.com",
        totalAmount: 1180,
        taxAmount: 180,
        currency: "TRY",
        profile: "TICARIFATURA",
      };
      memIncoming[key] = [fake];
      return [fake];
    }
    return filtered;
  }

  async getInvoicePdf(externalId: string) {
    const inv = memInvoices[externalId];
    if (!inv) return null;
    const text = `MOCK E-FATURA PDF\nETTN: ${externalId}\nAlıcı: ${inv.payload.receiver.name}\n`;
    return { buffer: Buffer.from(text, "utf-8"), mime: "text/plain" };
  }

  async getInvoiceXml(externalId: string) {
    const inv = memInvoices[externalId];
    if (!inv) return null;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<MockInvoice ettn="${externalId}">\n  <Receiver>${inv.payload.receiver.name}</Receiver>\n</MockInvoice>`;
    return { xml };
  }
}
