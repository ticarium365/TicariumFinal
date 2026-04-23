import { Router, type IRouter } from "express";
import { FEATURES } from "@workspace/db/feature-codes";
import { requireAuth } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/features.js";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import productsRouter from "./products.js";
import salesRouter from "./sales.js";
import dashboardRouter from "./dashboard.js";
import reportsRouter from "./reports.js";
import settingsRouter from "./settings.js";
import firmaProfiliRouter from "./firma-profili.js";
import kurulumSkoruRouter, { adminMusteriDolulukRouter } from "./kurulum-skoru.js";
import onboardingRouter from "./onboarding.js";
import productAnalyticsRouter from "./product-analytics.js";
import catalogRouter from "./catalog.js";
import stockRouter from "./stock.js";
import companiesRouter from "./companies.js";
import paymentRouter from "./payment.js";
import alertsRouter from "./alerts.js";
import notificationsRouter from "./notifications.js";
import customersRouter from "./customers.js";
import suppliersRouter from "./suppliers.js";
import purchasesRouter from "./purchases.js";
import stockCountsRouter from "./stock-counts.js";
import financeRouter from "./finance.js";
import branchesRouter from "./branches.js";
import integrationsRouter from "./integrations.js";
import extIntegrationsRouter from "./ext-integrations.js";
import subscriptionsRouter from "./subscriptions.js";
import billingRouter from "./billing.js";
import storageRouter from "./storage.js";
import documentsRouter from "./documents.js";
import financeDocumentsRouter from "./finance-documents.js";
import bankingRouter from "./banking.js";
import financeDashboardRouter from "./finance-dashboard.js";
import notificationRulesRouter from "./notification-rules.js";
import personnelRouter from "./personnel.js";
import campaignsRouter from "./campaigns.js";
import catalogSettingsRouter from "./catalog-settings.js";
import ordersManageRouter from "./orders-manage.js";
import customerGroupsRouter from "./customer-groups.js";
import orderAnalyticsRouter from "./order-analytics.js";
import networkRouter from "./network.js";
import b2bRouter from "./b2b.js";
import b2bOrdersRouter from "./b2b-orders.js";
import b2bCatalogRouter from "./b2b-catalog.js";
import channelsRouter from "./channels.js";
import einvoiceRouter from "./einvoice.js";
import marketplaceRouter from "./marketplace.js";
import profitRouter from "./profit.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
// T017 (Phase A): Temel modül guard'ları — pratik etki düşük (en küçük paket bile bu feature'ları içerir)
// ama doğruluk + ileride paket "downgrade" senaryoları (örn. "salt görüntüleme" planı) için zorunlu.
router.use("/products", requireAuth, requireFeature(FEATURES.INVENTORY_CORE), productsRouter);
router.use("/sales", requireAuth, requireFeature(FEATURES.SALES_INVOICES), salesRouter);
router.use("/stock", requireAuth, requireFeature(FEATURES.INVENTORY_CORE), stockRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/settings", settingsRouter);
router.use("/firma-profili", firmaProfiliRouter);
router.use("/kurulum-skoru", kurulumSkoruRouter);
router.use("/onboarding", onboardingRouter);
router.use("/product-analytics", productAnalyticsRouter);
router.use("/admin/musteri-doluluk", adminMusteriDolulukRouter);
router.use("/catalog", catalogRouter);
router.use("/companies", companiesRouter);
router.use("/payment", paymentRouter);
router.use("/alerts", alertsRouter);
router.use("/notifications", notificationsRouter);
router.use("/customers", requireAuth, requireFeature(FEATURES.CUSTOMERS_CRM), customersRouter);
router.use("/suppliers", requireAuth, requireFeature(FEATURES.SUPPLIERS), suppliersRouter);
router.use("/purchases", requireAuth, requireFeature(FEATURES.SUPPLIERS), purchasesRouter);
router.use("/stock-counts", requireAuth, requireFeature(FEATURES.STOCK_COUNTS), stockCountsRouter);
router.use("/finance", requireAuth, requireFeature(FEATURES.FINANCE_EXPENSES), financeRouter);
router.use("/branches", branchesRouter);
router.use("/integrations", integrationsRouter);
router.use("/ext-integrations", extIntegrationsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/billing", billingRouter);
router.use(storageRouter);
// documents path-prefix'siz mount → sadece /documents* yollarında "documents" feature gate
const _documentsGate = requireFeature(FEATURES.DOCUMENTS);
const _documentsPathRe = /^\/documents(\/|$)/;
router.use(requireAuth, (req, res, next) => {
  if (_documentsPathRe.test(req.path)) return _documentsGate(req, res, next);
  next();
}, documentsRouter);
router.use("/finance-documents", financeDocumentsRouter);
router.use("/banking", requireAuth, requireFeature(FEATURES.FINANCE_BANKING), bankingRouter);
router.use("/finance-dashboard", requireAuth, requireFeature(FEATURES.PROFIT_DASHBOARD), financeDashboardRouter);
router.use(notificationRulesRouter);
// Personnel router için: hr.staff gate'i SADECE personel modülü yollarında uygulanır.
// Path filtresi tam segment eşleşmesi ile kapsanır (alt yollarla birlikte) — aksi halde
// path-prefix'siz mount tüm sonraki rotaları kilitler.
const _hrStaffGate = requireFeature(FEATURES.HR_STAFF);
const _hrPathRe = /^\/(personnel|departments|leave-requests)(\/|$)/;
router.use(requireAuth, (req, res, next) => {
  if (_hrPathRe.test(req.path)) return _hrStaffGate(req, res, next);
  next();
}, personnelRouter);
// Sprint 87 (T015) — eksik backend feature guards. UI lock pazarlama, server-side guard
// gerçek kapı. Trial'da features=["*"] olduğundan trial kullanıcılar etkilenmez.
const _campaignsGate = requireFeature(FEATURES.CAMPAIGNS);
const _campaignsPathRe = /^\/campaigns(\/|$)/;
router.use(requireAuth, (req, res, next) => {
  if (_campaignsPathRe.test(req.path)) return _campaignsGate(req, res, next);
  next();
}, campaignsRouter);

router.use(catalogSettingsRouter);
router.use(orderAnalyticsRouter);
router.use(ordersManageRouter);
router.use(customerGroupsRouter);
router.use("/network", networkRouter);
router.use("/b2b", requireAuth, requireFeature(FEATURES.CUSTOMERS_CRM), b2bRouter);
router.use("/b2b/orders", requireAuth, requireFeature(FEATURES.CUSTOMERS_CRM), b2bOrdersRouter);
router.use("/b2b/catalog", requireAuth, requireFeature(FEATURES.CUSTOMERS_CRM), b2bCatalogRouter);
router.use("/channels", requireAuth, requireFeature(FEATURES.MARKETPLACE_PRO), channelsRouter);
router.use("/einvoice", requireAuth, requireFeature(FEATURES.EINVOICE_BASIC), einvoiceRouter);
router.use("/marketplace", requireAuth, requireFeature(FEATURES.MARKETPLACE_BASIC), marketplaceRouter);
router.use("/profit", requireAuth, requireFeature(FEATURES.PROFIT_DASHBOARD), profitRouter);
import accountantRouter from "./accountant.js";
import reportsOfficialRouter from "./reports-official.js";
import budgetsRouter from "./budgets.js";
import adBudgetsRouter from "./ad-budgets.js";
import auditLogsRouter from "./audit-logs.js";
import aggregatorRouter from "./aggregator.js";
import importsRouter from "./imports.js";
import productionRouter from "./production.js";
import loyaltyRouter from "./loyalty.js";
import currencyRouter from "./currency.js";
import ticariumCenterRouter from "./ticarium-center.js";
router.use("/ticarium-center", requireAuth, ticariumCenterRouter);
router.use("/accountant", requireAuth, requireFeature(FEATURES.ACCOUNTANT_PANEL), accountantRouter);
router.use("/reports-official", requireAuth, requireFeature(FEATURES.ACCOUNTANT_PANEL), reportsOfficialRouter);
router.use("/budgets", requireAuth, requireFeature(FEATURES.PROFIT_DASHBOARD), budgetsRouter);
router.use("/ad-budgets", requireAuth, requireFeature(FEATURES.PROFIT_DASHBOARD), adBudgetsRouter);
router.use("/audit-logs", auditLogsRouter);
// aggregator path-prefix'siz mount → sadece /aggregator* yollarında marketplace.pro gate
const _aggregatorGate = requireFeature(FEATURES.MARKETPLACE_PRO);
const _aggregatorPathRe = /^\/aggregator(\/|$)/;
router.use(requireAuth, (req, res, next) => {
  if (_aggregatorPathRe.test(req.path)) return _aggregatorGate(req, res, next);
  next();
}, aggregatorRouter);
router.use("/import", requireAuth, requireFeature(FEATURES.INVENTORY_CORE), importsRouter);
router.use("/production", requireAuth, requireFeature(FEATURES.PRODUCTION_BOM), productionRouter);
router.use("/loyalty", requireAuth, requireFeature(FEATURES.LOYALTY_POINTS), loyaltyRouter);
router.use("/currency", requireAuth, requireFeature(FEATURES.CURRENCY_MULTI), currencyRouter);

// Sprint 72 — Gerçek Kârlılık Motoru (paket kapıları router içinde)
import profitEngineRouter from "./profit-engine.js";
router.use("/profit-engine", profitEngineRouter);

import storefrontsRouter from "./storefronts.js";
router.use("/storefronts", requireAuth, requireFeature(FEATURES.MARKETPLACE_BASIC), storefrontsRouter);

import pricingRulesRouter from "./pricing-rules.js";
router.use("/pricing-rules", requireAuth, requireFeature(FEATURES.MARKETPLACE_PRO), pricingRulesRouter);

import shippingRouter from "./shipping.js";
router.use("/shipping", requireAuth, requireFeature(FEATURES.MARKETPLACE_BASIC), shippingRouter);

// Sprint 80 — KVKK + Multi-currency + Feature flags runtime + SMS/Push
import featureFlagsRuntimeRouter from "./feature-flags-runtime.js";
import currencyRatesRouter from "./currency-rates.js";
import smsPushRouter from "./sms-push.js";
import smsRouter from "./sms.js";
router.use("/admin", featureFlagsRuntimeRouter);
import { buyerRouter, sellerRouter } from "./buyer-portal.js";
router.use("/buyer", buyerRouter);
router.use("/seller", sellerRouter);
router.use("/currency", currencyRatesRouter);
router.use(smsPushRouter);
router.use("/sms", smsRouter);

export default router;
