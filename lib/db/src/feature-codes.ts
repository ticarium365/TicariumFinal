/**
 * Ticarium365 — Paket Özellik Kodları (TEK GERÇEK KAYNAK)
 *
 * Bu dosya hem backend (`requireFeature(...)` middleware) hem frontend
 * (`nav-config.ts`, `useFeatures()`) tarafından import edilir.
 *
 * Kural: Yeni bir özellik eklerken:
 *   1. Aşağıya sabit olarak ekle (camel-yerine-noktalı string).
 *   2. `subscription_plans.features` JSON sütunundaki paketlere dağıt.
 *   3. Frontend `nav-config.ts`'te ilgili NavItem'a `feature: FEATURES.XXX` yaz.
 *   4. Backend `routes/index.ts`'te ilgili router'ı `requireFeature(FEATURES.XXX)` ile koru.
 *
 * String yerine sabit kullanmak tipo riskini sıfırlar — `"loyalty.point"` yerine
 * `"loyalty.points"` yazmak sessizce kilitli görünmeye sebep olurdu.
 */
export const FEATURES = {
  // Envanter & Stok
  INVENTORY_CORE: "inventory.core",
  STOCK_COUNTS: "stock.counts",
  BARCODE_PRINT: "barcode.print",

  // Satış
  SALES_POS: "sales.pos",
  SALES_INVOICES: "sales.invoices",

  // Müşteri / Tedarikçi
  CUSTOMERS_CRM: "customers.crm",
  SUPPLIERS: "suppliers",

  // e-Fatura
  EINVOICE_BASIC: "einvoice.basic",
  EINVOICE_PRO: "einvoice.pro",

  // Finans
  FINANCE_EXPENSES: "finance.expenses",
  FINANCE_BANKING: "finance.banking",

  // İK
  HR_STAFF: "hr.staff",
  HR_PAYROLL: "hr.payroll",

  // Sabit kıymet & dijital evrak
  ASSETS_FIXED: "assets.fixed",
  OCR_RECEIPTS: "ocr.receipts",
  DOCUMENTS: "documents",

  // Karlılık
  PROFIT_DASHBOARD: "profit.dashboard",
  PROFIT_HOLDING_COST: "profit.holding_cost",
  PROFIT_TRUE_DASHBOARD: "profit.true_dashboard",
  PROFIT_AI_ADVISOR: "profit.ai_advisor",

  // Pazaryeri & e-ticaret
  MARKETPLACE_BASIC: "marketplace.basic",
  MARKETPLACE_PRO: "marketplace.pro",

  // Pazarlama
  CAMPAIGNS: "campaigns",
  LOYALTY_POINTS: "loyalty.points",

  // Çoklu para
  CURRENCY_MULTI: "currency.multi",

  // Raporlama
  REPORTS_ADVANCED: "reports.advanced",

  // Geliştirici / kurumsal
  API_PUBLIC: "api.public",
  INTEGRATIONS_ACCOUNTING: "integrations.accounting",
  INTEGRATIONS_WEBHOOKS: "integrations.webhooks",
  PRODUCTION_BOM: "production.bom",
  ACCOUNTANT_PANEL: "accountant.panel",
} as const;

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES];

/** Tüm feature kodlarının listesi (test/seed için). */
export const ALL_FEATURE_CODES: readonly FeatureCode[] = Object.values(FEATURES);

/** Wildcard sentinel — trial tenant'larda `["*"]` olarak set edilir. */
export const FEATURE_WILDCARD = "*" as const;
