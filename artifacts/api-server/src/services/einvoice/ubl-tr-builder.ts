// ─────────────────────────────────────────────────────────────────────────────
// UBL-TR 1.2 e-Fatura XML Üretici
// GİB E-Fatura/E-Arşiv için minimum geçerli (well-formed + mandatory alanlar)
// XML çıktısı üretir. Provider-bağımsız — entegratör implementasyonları aynı
// XML'i farklı transport'larla GİB'e iletir.
//
// Spec: https://efatura.gov.tr/EFaturaTeknikDetaylar.html
// Bu üretici "core" alanları kapsar; provider gerektiğinde extension paketleri
// (ör. UBL-TR Extensions, electronic signature) ekler.
//
// Test edilebilir & saf — DB IO yok, dış bağımlılık yok.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import {
  EInvoiceCreatePayload, EInvoiceParty, EInvoiceLine,
  calculateInvoiceTotals,
} from "./types.js";

// ─── XML escape ──────────────────────────────────────────────────────────────

function xmlEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtDate(d: Date): string {
  // YYYY-MM-DD (UBL IssueDate)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(d: Date): string {
  // HH:MM:SS (UBL IssueTime)
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function num(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(dp);
}

// ─── Party (Sender / Receiver) ───────────────────────────────────────────────

function validatePartyVkn(p: EInvoiceParty, role: "Supplier" | "Customer"): { scheme: "VKN" | "TCKN"; value: string } {
  const v = String(p.vkn ?? "");
  // Strict: tamamen rakamlardan oluşmalı, 10 (VKN) veya 11 (TCKN) hane.
  if (/^\d{10}$/.test(v)) return { scheme: "VKN", value: v };
  if (/^\d{11}$/.test(v)) return { scheme: "TCKN", value: v };
  throw new Error(`UBL-TR: ${role} party VKN/TCKN geçersiz — sadece rakam, 10 hane (VKN) veya 11 hane (TCKN) olmalı, geldi: "${p.vkn || "(boş)"}"`);
}

function buildParty(p: EInvoiceParty, role: "Supplier" | "Customer"): string {
  const { scheme: idScheme, value: idValue } = validatePartyVkn(p, role);
  const tag = role === "Supplier" ? "AccountingSupplierParty" : "AccountingCustomerParty";
  return `<cac:${tag}>
  <cac:Party>
    ${p.alias ? `<cbc:WebsiteURI>${xmlEscape(p.alias)}</cbc:WebsiteURI>` : ""}
    <cac:PartyIdentification>
      <cbc:ID schemeID="${idScheme}">${idValue}</cbc:ID>
    </cac:PartyIdentification>
    <cac:PartyName>
      <cbc:Name>${xmlEscape(p.name)}</cbc:Name>
    </cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${xmlEscape(p.address || "")}</cbc:StreetName>
      <cbc:CitySubdivisionName>${xmlEscape(p.district || "")}</cbc:CitySubdivisionName>
      <cbc:CityName>${xmlEscape(p.city || "")}</cbc:CityName>
      <cac:Country>
        <cbc:Name>${xmlEscape(p.country || "Türkiye")}</cbc:Name>
      </cac:Country>
    </cac:PostalAddress>
    ${p.taxOffice ? `<cac:PartyTaxScheme>
      <cac:TaxScheme>
        <cbc:Name>${xmlEscape(p.taxOffice)}</cbc:Name>
      </cac:TaxScheme>
    </cac:PartyTaxScheme>` : ""}
    <cac:Contact>
      ${p.phone ? `<cbc:Telephone>${xmlEscape(p.phone)}</cbc:Telephone>` : ""}
      ${p.email ? `<cbc:ElectronicMail>${xmlEscape(p.email)}</cbc:ElectronicMail>` : ""}
    </cac:Contact>
  </cac:Party>
</cac:${tag}>`;
}

// ─── Lines ───────────────────────────────────────────────────────────────────

function buildLine(line: EInvoiceLine, idx: number, currency: string): string {
  const lineSub = line.quantity * line.unitPrice;
  const lineDisc = line.discountAmount || 0;
  const lineNet = lineSub - lineDisc;
  const lineVat = lineNet * (line.vatRate / 100);
  const unitCode = line.unitCode || "C62";
  return `<cac:InvoiceLine>
  <cbc:ID>${idx + 1}</cbc:ID>
  <cbc:InvoicedQuantity unitCode="${xmlEscape(unitCode)}">${num(line.quantity, 3)}</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="${xmlEscape(currency)}">${num(lineNet)}</cbc:LineExtensionAmount>
  ${lineDisc > 0 ? `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:Amount currencyID="${xmlEscape(currency)}">${num(lineDisc)}</cbc:Amount>
  </cac:AllowanceCharge>` : ""}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${xmlEscape(currency)}">${num(lineVat)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${xmlEscape(currency)}">${num(lineNet)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${xmlEscape(currency)}">${num(lineVat)}</cbc:TaxAmount>
      <cbc:Percent>${num(line.vatRate, 2)}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:Item>
    <cbc:Name>${xmlEscape(line.name)}</cbc:Name>
    ${line.productCode ? `<cac:SellersItemIdentification>
      <cbc:ID>${xmlEscape(line.productCode)}</cbc:ID>
    </cac:SellersItemIdentification>` : ""}
    ${line.description ? `<cbc:Description>${xmlEscape(line.description)}</cbc:Description>` : ""}
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="${xmlEscape(currency)}">${num(line.unitPrice, 4)}</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>`;
}

// ─── Tax Totals ──────────────────────────────────────────────────────────────

function buildTaxTotals(lines: EInvoiceLine[], currency: string): string {
  // KDV oranına göre grupla
  const groups = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const lineSub = l.quantity * l.unitPrice;
    const lineDisc = l.discountAmount || 0;
    const lineNet = lineSub - lineDisc;
    const lineVat = lineNet * (l.vatRate / 100);
    const g = groups.get(l.vatRate) || { taxable: 0, tax: 0 };
    g.taxable += lineNet;
    g.tax += lineVat;
    groups.set(l.vatRate, g);
  }
  const totalVat = Array.from(groups.values()).reduce((s, g) => s + g.tax, 0);
  const subtotals = Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${xmlEscape(currency)}">${num(g.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${xmlEscape(currency)}">${num(g.tax)}</cbc:TaxAmount>
      <cbc:Percent>${num(rate, 2)}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join("\n");
  return `<cac:TaxTotal>
  <cbc:TaxAmount currencyID="${xmlEscape(currency)}">${num(totalVat)}</cbc:TaxAmount>
  ${subtotals}
</cac:TaxTotal>`;
}

// ─── Ana Builder ─────────────────────────────────────────────────────────────

export interface BuildInvoiceXmlResult {
  xml: string;
  ettn: string;             // UUID — UBL UUID alanı
  documentNumber: string;
  totals: ReturnType<typeof calculateInvoiceTotals>;
}

export function buildInvoiceXml(payload: EInvoiceCreatePayload): BuildInvoiceXmlResult {
  const ettn = randomUUID();
  const documentNumber = payload.documentNumber || generateInvoiceNumber(payload.invoiceDate);
  const currency = payload.currency || "TRY";
  const totals = calculateInvoiceTotals(payload.lines);

  const profileId = payload.profile === "TICARIFATURA"
    ? "TICARIFATURA"
    : payload.profile === "EARSIVFATURA"
      ? "EARSIVFATURA"
      : "TEMELFATURA";

  const invoiceTypeCode =
    payload.invoiceType === "IADE" ? "IADE" :
    payload.invoiceType === "ISTISNA" ? "ISTISNA" :
    payload.invoiceType === "OZELMATRAH" ? "OZELMATRAH" : "SATIS";

  const notes = (payload.notes || []).map((n) => `<cbc:Note>${xmlEscape(n)}</cbc:Note>`).join("\n");
  const linesXml = payload.lines.map((l, i) => buildLine(l, i, currency)).join("\n");
  const taxTotalsXml = buildTaxTotals(payload.lines, currency);

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${xmlEscape(profileId)}</cbc:ProfileID>
  <cbc:ID>${xmlEscape(documentNumber)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${fmtDate(payload.invoiceDate)}</cbc:IssueDate>
  <cbc:IssueTime>${fmtTime(payload.invoiceDate)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${xmlEscape(invoiceTypeCode)}</cbc:InvoiceTypeCode>
  ${notes}
  <cbc:DocumentCurrencyCode>${xmlEscape(currency)}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${payload.lines.length}</cbc:LineCountNumeric>

  ${buildParty(payload.sender, "Supplier")}
  ${buildParty(payload.receiver, "Customer")}

  ${taxTotalsXml}

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${xmlEscape(currency)}">${num(totals.subtotal - totals.discount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${xmlEscape(currency)}">${num(totals.subtotal - totals.discount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${xmlEscape(currency)}">${num(totals.total)}</cbc:TaxInclusiveAmount>
    ${totals.discount > 0 ? `<cbc:AllowanceTotalAmount currencyID="${xmlEscape(currency)}">${num(totals.discount)}</cbc:AllowanceTotalAmount>` : ""}
    <cbc:PayableAmount currencyID="${xmlEscape(currency)}">${num(totals.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${linesXml}
</Invoice>`;

  return { xml, ettn, documentNumber, totals };
}

function generateInvoiceNumber(date: Date): string {
  // Geçici fatura no — gerçek kullanımda DB sequence'tan gelmeli.
  // Format: ABC + YYYY + NNNNNNNNN
  const yy = date.getFullYear();
  const rnd = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
  return `TIC${yy}${rnd}`;
}

// Test/QA için minimum doğrulama (well-formed + mandatory tag'ler)
export function validateXml(xml: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!xml.startsWith("<?xml")) errors.push("XML deklarasyonu eksik");
  for (const tag of ["UBLVersionID", "CustomizationID", "ProfileID", "ID", "UUID", "IssueDate",
                     "InvoiceTypeCode", "DocumentCurrencyCode", "AccountingSupplierParty",
                     "AccountingCustomerParty", "LegalMonetaryTotal", "InvoiceLine"]) {
    if (!xml.includes(`<cbc:${tag}`) && !xml.includes(`<cac:${tag}`)) {
      errors.push(`Zorunlu eleman eksik: ${tag}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
