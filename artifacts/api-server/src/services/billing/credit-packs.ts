/**
 * Dalga 23 — Ek kontör (top-up) paket kataloğu.
 * Her pack: code (unique), metric, quantity, unit price (TRY).
 * Frontend `/abonelik/topup` sayfası bunu /api/billing/credit-packs üzerinden okur.
 */
import type { UsageMetric } from "../usage";

export interface CreditPack {
  code: string;
  metric: UsageMetric;
  quantity: number;
  unitPrice: number;   // TRY / 1 birim (informational)
  totalPrice: number;  // TRY (faturalanan tutar)
  label: string;
  description: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  // E-Fatura paketleri
  { code: "einvoice_100",  metric: "einvoice", quantity: 100,  unitPrice: 1.50, totalPrice: 149,  label: "100 E-Fatura",  description: "Ek 100 e-fatura kontörü" },
  { code: "einvoice_500",  metric: "einvoice", quantity: 500,  unitPrice: 1.30, totalPrice: 649,  label: "500 E-Fatura",  description: "Ek 500 e-fatura kontörü" },
  { code: "einvoice_2000", metric: "einvoice", quantity: 2000, unitPrice: 1.10, totalPrice: 2199, label: "2000 E-Fatura", description: "Ek 2000 e-fatura kontörü" },
  // OCR paketleri
  { code: "ocr_50",   metric: "ocr", quantity: 50,   unitPrice: 1.00, totalPrice: 49,  label: "50 OCR",   description: "Ek 50 fiş/fatura OCR" },
  { code: "ocr_200",  metric: "ocr", quantity: 200,  unitPrice: 0.85, totalPrice: 169, label: "200 OCR",  description: "Ek 200 fiş/fatura OCR" },
  { code: "ocr_1000", metric: "ocr", quantity: 1000, unitPrice: 0.70, totalPrice: 699, label: "1000 OCR", description: "Ek 1000 fiş/fatura OCR" },
  // API çağrı paketleri
  { code: "api_10k",  metric: "api_calls", quantity: 10000,  unitPrice: 0.010, totalPrice: 99,   label: "10.000 API",  description: "Ek 10.000 dış API çağrısı" },
  { code: "api_100k", metric: "api_calls", quantity: 100000, unitPrice: 0.008, totalPrice: 799,  label: "100.000 API", description: "Ek 100.000 dış API çağrısı" },
  // SMS paketleri
  { code: "sms_500",  metric: "sms", quantity: 500,  unitPrice: 0.40, totalPrice: 199, label: "500 SMS",  description: "Ek 500 SMS bildirimi" },
  { code: "sms_2000", metric: "sms", quantity: 2000, unitPrice: 0.32, totalPrice: 639, label: "2000 SMS", description: "Ek 2000 SMS bildirimi" },
];

export function findCreditPack(code: string): CreditPack | undefined {
  return CREDIT_PACKS.find(p => p.code === code);
}
