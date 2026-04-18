// ─────────────────────────────────────────────────────────────────────────────
// Provider-bağımsız E-Fatura sözleşmesi
// Her entegratör (Paraşüt, QNB eFinans, Foriba, Logo, Mikro, mock) bu interface'i
// uygular. Üst katman bunları tanımayı bilir; provider değişimi config ile olur.
// ─────────────────────────────────────────────────────────────────────────────

export type EInvoiceScenario = "EFATURA" | "EARSIV";
export type EInvoiceProfile = "TEMELFATURA" | "TICARIFATURA" | "EARSIVFATURA";
export type EInvoiceType = "SATIS" | "IADE" | "ISTISNA" | "OZELMATRAH";

export interface EInvoiceParty {
  vkn?: string | null;          // VKN/TCKN
  alias?: string | null;        // GİB alias (urn:mail:...)
  name: string;
  taxOffice?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;      // ISO-2 (TR)
  email?: string | null;
  phone?: string | null;
}

export interface EInvoiceLine {
  productCode?: string | null;
  name: string;
  quantity: number;
  unitCode?: string;            // C62 (adet), KGM, LTR…
  unitPrice: number;
  vatRate: number;              // 0 / 1 / 8 / 18 / 20
  discountAmount?: number;
  description?: string | null;
}

export interface EInvoiceCreatePayload {
  invoiceType: EInvoiceType;
  profile: EInvoiceProfile;
  scenario: EInvoiceScenario;
  invoiceDate: Date;
  documentNumber?: string | null;   // bizim iç fatura no
  currency?: string;                // default TRY
  notes?: string[];
  sender: EInvoiceParty;
  receiver: EInvoiceParty;
  lines: EInvoiceLine[];
}

export interface EInvoiceCreateResult {
  externalId: string;               // ETTN
  externalNo?: string | null;       // Provider tarafından üretilen fatura no (varsa)
  status: "draft" | "queued";
  raw?: any;
}

export interface EInvoiceSendResult {
  externalId: string;
  status: "sent" | "accepted" | "queued" | "failed";
  message?: string;
  raw?: any;
}

export interface IncomingInvoice {
  externalId: string;
  invoiceNo?: string | null;
  invoiceDate: Date;
  receivedAt?: Date;
  senderVkn?: string | null;
  senderName: string;
  senderAlias?: string | null;
  totalAmount: number;
  taxAmount: number;
  currency: string;
  profile?: string | null;
  pdfUrl?: string | null;
  rawXml?: string | null;
  raw?: any;
}

export interface EInvoiceCancelResult {
  externalId: string;
  status: "cancelled" | "rejected" | "failed";
  message?: string;
  raw?: any;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  meta?: any;
  checkedAt: Date;
}

export interface EInvoiceProviderConfig {
  provider: string;
  sandbox: boolean;
  config: Record<string, any>;
}

export interface EInvoiceProvider {
  readonly key: string;             // 'mock' | 'parasut' | 'qnb_efinans' | …
  readonly displayName: string;
  readonly supportsEarsiv: boolean;

  healthCheck(): Promise<ProviderHealth>;
  createInvoice(payload: EInvoiceCreatePayload): Promise<EInvoiceCreateResult>;
  sendInvoice(externalId: string): Promise<EInvoiceSendResult>;
  cancelInvoice(externalId: string, reason?: string): Promise<EInvoiceCancelResult>;
  getIncomingInvoices(opts?: { since?: Date; limit?: number }): Promise<IncomingInvoice[]>;
  getInvoicePdf?(externalId: string): Promise<{ buffer: Buffer; mime: string } | null>;
  getInvoiceXml?(externalId: string): Promise<{ xml: string } | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────────────────────

export function calculateInvoiceTotals(lines: EInvoiceLine[]) {
  let subtotal = 0;
  let vat = 0;
  let discount = 0;
  for (const l of lines) {
    const lineSub = l.quantity * l.unitPrice;
    const lineDisc = l.discountAmount || 0;
    const lineNet = lineSub - lineDisc;
    const lineVat = lineNet * (l.vatRate / 100);
    subtotal += lineSub;
    discount += lineDisc;
    vat += lineVat;
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total: Math.round((subtotal - discount + vat) * 100) / 100,
  };
}
