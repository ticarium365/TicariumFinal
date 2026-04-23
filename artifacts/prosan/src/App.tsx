import { Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { CompanyProvider } from "@/components/company-context";
import { Layout } from "@/components/layout";
import { TrialGateway } from "@/components/trial-gateway";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import RegisterPage from "@/pages/register";
import VerifyPage from "@/pages/verify";
import ForgotPassword from "@/pages/forgot-password";
import HomePage from "@/pages/home";
import { RouteFallback } from "@/components/route-fallback";
import {
  EntegrasyonlarPage,
  KarsilastirPage,
  HakkimizdaPage,
  AmacimizPage,
  PaketlerPage,
  OdemeSonucPage,
  IletisimPage,
  KvkkPage,
  Catalog,
  Dashboard,
  ProductsList,
  ProductNew,
  ProductDetail,
  ProductEdit,
  BarcodeScanner,
  SalesScreen,
  SalesHistory,
  StockEntry,
  Reports,
  DailySummary,
  UsersList,
  Settings,
  FirmaProfili,
  SetupScore,
  MusteriDoluluk,
  CompaniesAdmin,
  AdminPayments,
  PlatformSettings,
  Onboarding,
  CustomersList,
  CustomerDetail,
  SuppliersList,
  SupplierDetail,
  PurchasesList,
  NewPurchase,
  BarcodesPage,
  StockCountsPage,
  StockCountDetail,
  FinancePage,
  BranchesPage,
  IntegrationsPage,
  SubscriptionPage,
  DocumentsPage,
  FinanceDocumentsPage,
  BankingPage,
  FinanceDashboardPage,
  EInvoicePage,
  MarketplacePage,
  ETicariumMerkeziPage,
  MagazaListesi,
  MagazaDetay,
  FiyatMotoru,
  KargoYonetimi,
  KarlilikKanalPage,
  PublicStorefrontPage,
  ProfitPage,
  MuhasebeciPage,
  BudgetsPage,
  AdBudgetPage,
  PazarPage,
  AggregatorAdminPage,
  ContactRequestsAdmin,
  AuditLogsPage,
  NewTenantWizard,
  ImportPage,
  POSPage,
  ProductionPage,
  LoyaltyPage,
  CurrencyPage,
  NotificationSettingsPage,
  MenuPrefsPage,
  NotificationsPage,
  PersonnelPage,
  CampaignsPage,
  NetworkPage,
  CompanyProfilePage,
  MyNetworkProfilePage,
  QuotesListPage,
  QuoteNewPage,
  QuoteDetailPage,
  OrdersListPage,
  OrderDetailPage,
  CatalogManagePage,
  B2BVitrinPage,
  ChannelsListPage,
  ChannelDetailPage,
  ChannelsBulkPage,
  PricingPage,
  AdminBillingPage,
  GercekKarDashboard,
  GercekKarAyarlar,
  GercekKarOneriler,
  RuntimeFlagsAdminPage,
  AdminPlanlarPage,
  PazaryeriSaglikPage,
  SistemSaglikPage,
  SuperAdminHubPage,
  SatinalmaDiscovery,
  SatinalmaNewRfq,
  SatinalmaRfqsList,
  SatinalmaRfqDetail,
  SatinalmaSellerInbox,
  SatinalmaHome,
  SatinalmaMerkeziPage,
} from "@/routes/lazy-pages";
import { UpgradeModal, installFeatureLockInterceptor } from "@/components/upgrade-modal";
import CookieConsentBanner from "@/components/cookie-consent-banner";

installFeatureLockInterceptor();

const queryClient = new QueryClient();

/**
 * Sprint I — kök rotada accountType'a göre yönlendirme.
 * - purchasing → /satinalma-merkezi (sade B2B vitrin)
 * - diğerleri  → /dashboard
 */
function HomeRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  // Public landing page — giriş yapmamış kullanıcı için
  if (!isAuthenticated) {
    return <HomePage />;
  }
  const at = ((user as any)?.accountType ?? "seller") as string;
  window.location.href = at === "purchasing" ? "/satinalma-merkezi" : "/dashboard";
  return null;
}

function ProtectedRoute({
  component: Component,
  roles,
  skipOnboardingCheck,
  noLayout,
}: {
  component: React.ComponentType;
  roles?: string[];
  skipOnboardingCheck?: boolean;
  noLayout?: boolean;
}) {
  const { user, isAuthenticated, isLoading, needsOnboarding } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  if (!skipOnboardingCheck && needsOnboarding) {
    navigate("/onboarding");
    return null;
  }

  if (roles && user && !roles.includes((user as any).role)) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold text-destructive">Erişim Reddedildi</h2>
          <p className="mt-2 text-muted-foreground">Bu sayfayı görüntüleme yetkiniz yok.</p>
        </div>
      </Layout>
    );
  }

  if (noLayout) {
    return <Component />;
  }

  return (
    <Layout>
      <TrialGateway>
        <Component />
      </TrialGateway>
    </Layout>
  );
}

function AuthenticatedRouter() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/kayit" component={RegisterPage} />
        <Route path="/kayit/isletme">{() => <RegisterPage />}</Route>
        <Route path="/kayit/satinalmaci">{() => <RegisterPage />}</Route>
        <Route path="/verify" component={VerifyPage} />
        <Route path="/entegrasyonlar">
          {() => <ProtectedRoute component={EntegrasyonlarPage} />}
        </Route>
        <Route path="/sifremi-unuttum" component={ForgotPassword} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/karsilastir" component={KarsilastirPage} />
        <Route path="/neden-ticarium365" component={KarsilastirPage} />
        <Route path="/hakkimizda" component={HakkimizdaPage} />
        <Route path="/amacimiz" component={AmacimizPage} />
        <Route path="/paketler" component={PaketlerPage} />
        <Route path="/odeme/sonuc" component={OdemeSonucPage} />
        <Route path="/iletisim" component={IletisimPage} />
        <Route path="/kvkk" component={KvkkPage} />

        <Route path="/">
          {() => <HomeRedirect />}
        </Route>

        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>

        {/* Sprint I — Satınalma Hesabı (purchasing): B2B Vitrin */}
        <Route path="/satinalma-merkezi">
          {() => <ProtectedRoute component={SatinalmaMerkeziPage} />}
        </Route>

        {/* Sprint H — Satınalma rotaları (eski buyer-portal birleştirildi) */}
        <Route path="/satinalma">
          {() => <ProtectedRoute component={SatinalmaHome} />}
        </Route>
        <Route path="/satinalma/kesfet">
          {() => <ProtectedRoute component={SatinalmaDiscovery} />}
        </Route>
        <Route path="/satinalma/rfqs/new">
          {() => <ProtectedRoute component={SatinalmaNewRfq} roles={["admin", "staff"]} />}
        </Route>
        <Route path="/satinalma/rfqs/:id">
          {() => <ProtectedRoute component={SatinalmaRfqDetail} />}
        </Route>
        <Route path="/satinalma/rfqs">
          {() => <ProtectedRoute component={SatinalmaRfqsList} />}
        </Route>
        <Route path="/satinalma/inbox">
          {() => <ProtectedRoute component={SatinalmaSellerInbox} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/products">
          {() => <ProtectedRoute component={ProductsList} />}
        </Route>

        <Route path="/products/new">
          {() => <ProtectedRoute component={ProductNew} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/products/:id/edit">
          {(params) => <ProtectedRoute component={() => <ProductEdit id={params.id} />} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/products/:id">
          {(params) => <ProtectedRoute component={() => <ProductDetail id={params.id} />} />}
        </Route>

        <Route path="/barcode">
          {() => <ProtectedRoute component={BarcodeScanner} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/sales">
          {() => <ProtectedRoute component={SalesScreen} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/sales/history">
          {() => <ProtectedRoute component={SalesHistory} />}
        </Route>

        <Route path="/stock">
          {() => <ProtectedRoute component={StockEntry} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/reports">
          {() => <ProtectedRoute component={Reports} roles={["admin", "viewer"]} />}
        </Route>

        <Route path="/reports/daily-summary">
          {() => <ProtectedRoute component={DailySummary} roles={["admin", "viewer"]} />}
        </Route>

        <Route path="/customers">
          {() => <ProtectedRoute component={CustomersList} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/customers/:id">
          {(params) => <ProtectedRoute component={() => <CustomerDetail id={params.id} />} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/suppliers">
          {() => <ProtectedRoute component={SuppliersList} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/suppliers/:id">
          {() => <ProtectedRoute component={SupplierDetail} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/purchases">
          {() => <ProtectedRoute component={PurchasesList} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/purchases/new">
          {() => <ProtectedRoute component={NewPurchase} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/barcodes">
          {() => <ProtectedRoute component={BarcodesPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/stock-counts">
          {() => <ProtectedRoute component={StockCountsPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/stock-counts/:id">
          {(params) => <ProtectedRoute component={() => <StockCountDetail id={params.id} />} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/finance">
          {() => <ProtectedRoute component={FinancePage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/branches">
          {() => <ProtectedRoute component={BranchesPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/settings/integrations">
          {() => <ProtectedRoute component={IntegrationsPage} roles={["admin"]} />}
        </Route>

        <Route path="/settings/subscription">
          {() => <ProtectedRoute component={SubscriptionPage} roles={["admin"]} />}
        </Route>

        <Route path="/documents">
          {() => <ProtectedRoute component={DocumentsPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/finance-documents">
          {() => <ProtectedRoute component={FinanceDocumentsPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/banking">
          {() => <ProtectedRoute component={BankingPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/einvoice">
          {() => <ProtectedRoute component={EInvoicePage} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/magaza">
          {() => <ProtectedRoute component={MagazaListesi} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/magaza/:id">
          {() => <ProtectedRoute component={MagazaDetay} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/fiyat-motoru">
          {() => <ProtectedRoute component={FiyatMotoru} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/kargo">
          {() => <ProtectedRoute component={KargoYonetimi} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/karlilik-kanal">
          {() => <ProtectedRoute component={KarlilikKanalPage} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/eticarium-merkezi">
          {() => <ProtectedRoute component={ETicariumMerkeziPage} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/marketplace">
          {() => <ProtectedRoute component={MarketplacePage} roles={["admin", "staff"]} />}
        </Route>
        <Route path="/profit">
          {() => <ProtectedRoute component={ProfitPage} roles={["admin", "staff", "viewer"]} />}
        </Route>
        <Route path="/muhasebeci">
          {() => <ProtectedRoute component={MuhasebeciPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/butce">
          {() => <ProtectedRoute component={BudgetsPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/reklam-butce">
          {() => <ProtectedRoute component={AdBudgetPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/pazar" component={PazarPage} />
        <Route path="/aggregator">
          {() => <ProtectedRoute component={AggregatorAdminPage} roles={["admin", "super_admin"]} />}
        </Route>
        <Route path="/super-admin/talepler">
          {() => <ProtectedRoute component={ContactRequestsAdmin} roles={["super_admin"]} />}
        </Route>
        <Route path="/super-admin/audit-logs">
          {() => <ProtectedRoute component={AuditLogsPage} roles={["super_admin"]} />}
        </Route>
        <Route path="/super-admin/yeni-firma">
          {() => <ProtectedRoute component={NewTenantWizard} roles={["super_admin"]} />}
        </Route>
        <Route path="/ice-aktarim">
          {() => <ProtectedRoute component={ImportPage} roles={["admin", "staff", "super_admin"]} />}
        </Route>
        <Route path="/pos">
          {() => <ProtectedRoute component={POSPage} roles={["admin", "staff", "super_admin"]} />}
        </Route>
        <Route path="/uretim">
          {() => <ProtectedRoute component={ProductionPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/sadakat">
          {() => <ProtectedRoute component={LoyaltyPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/doviz">
          {() => <ProtectedRoute component={CurrencyPage} roles={["admin", "staff", "viewer", "super_admin"]} />}
        </Route>
        <Route path="/finance-dashboard">
          {() => <ProtectedRoute component={FinanceDashboardPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/settings/notifications">
          {() => <ProtectedRoute component={NotificationSettingsPage} roles={["admin"]} />}
        </Route>

        <Route path="/settings/menu">
          {() => <ProtectedRoute component={MenuPrefsPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/bildirimler">
          {() => <ProtectedRoute component={NotificationsPage} roles={["admin", "super_admin"]} />}
        </Route>

        <Route path="/personnel">
          {() => <ProtectedRoute component={PersonnelPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/campaigns">
          {() => <ProtectedRoute component={CampaignsPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/network">
          {() => <ProtectedRoute component={NetworkPage} />}
        </Route>

        <Route path="/network/my-profile">
          {() => <ProtectedRoute component={MyNetworkProfilePage} roles={["admin"]} />}
        </Route>

        <Route path="/network/:subdomain">
          {(params) => <ProtectedRoute component={() => <CompanyProfilePage subdomain={params.subdomain} />} />}
        </Route>

        <Route path="/b2b/quotes">
          {() => <ProtectedRoute component={QuotesListPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/quotes/new">
          {() => <ProtectedRoute component={QuoteNewPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/quotes/:id">
          {(params) => <ProtectedRoute component={() => <QuoteDetailPage id={params.id} />} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/orders">
          {() => <ProtectedRoute component={OrdersListPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/orders/:id">
          {() => <ProtectedRoute component={OrderDetailPage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/catalog">
          {() => <ProtectedRoute component={CatalogManagePage} roles={["admin", "staff"]} />}
        </Route>

        <Route path="/b2b/vitrin">
          {() => <ProtectedRoute component={B2BVitrinPage} roles={["admin", "staff", "viewer"]} />}
        </Route>

        <Route path="/channels">
          {() => <ProtectedRoute component={ChannelsListPage} roles={["admin", "staff"]} />}
        </Route>
        <Route path="/channels/bulk">
          {() => <ProtectedRoute component={ChannelsBulkPage} roles={["admin"]} />}
        </Route>
        <Route path="/channels/:channelKey">
          {(params) => (
            <ProtectedRoute
              component={() => <ChannelDetailPage channelKey={params.channelKey} />}
              roles={["admin", "staff"]}
            />
          )}
        </Route>

        <Route path="/users">
          {() => <ProtectedRoute component={UsersList} roles={["admin"]} />}
        </Route>

        <Route path="/settings">
          {() => <ProtectedRoute component={Settings} roles={["admin"]} />}
        </Route>

        <Route path="/firma-profili">
          {() => <ProtectedRoute component={FirmaProfili} roles={["admin"]} />}
        </Route>

        <Route path="/kurulum-skoru">
          {() => <ProtectedRoute component={SetupScore} roles={["admin"]} />}
        </Route>

        <Route path="/admin/musteri-doluluk">
          {() => <ProtectedRoute component={MusteriDoluluk} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/companies">
          {() => <ProtectedRoute component={CompaniesAdmin} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/payments">
          {() => <ProtectedRoute component={AdminPayments} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/platform-settings">
          {() => <ProtectedRoute component={PlatformSettings} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/billing">
          {() => <ProtectedRoute component={AdminBillingPage} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/runtime-flags">
          {() => <ProtectedRoute component={RuntimeFlagsAdminPage} roles={["super_admin"]} />}
        </Route>

        <Route path="/admin/planlar">
          {() => <ProtectedRoute component={AdminPlanlarPage} roles={["super_admin"]} />}
        </Route>

        <Route path="/super-admin/sistem-saglik">
          {() => <ProtectedRoute component={SistemSaglikPage} roles={["super_admin"]} />}
        </Route>
        <Route path="/super-admin/pazaryeri-saglik">
          {() => <ProtectedRoute component={PazaryeriSaglikPage} roles={["super_admin"]} />}
        </Route>
        <Route path="/super-admin">
          {() => <ProtectedRoute component={SuperAdminHubPage} roles={["super_admin"]} />}
        </Route>

        <Route path="/pricing">
          {() => <ProtectedRoute component={PricingPage} />}
        </Route>

        <Route path="/gercek-kar">
          {() => <ProtectedRoute component={GercekKarDashboard} />}
        </Route>
        <Route path="/gercek-kar/ayarlar">
          {() => <ProtectedRoute component={GercekKarAyarlar} roles={["admin", "super_admin"]} />}
        </Route>
        <Route path="/gercek-kar/oneriler">
          {() => <ProtectedRoute component={GercekKarOneriler} />}
        </Route>

        <Route path="/onboarding">
          {() => <ProtectedRoute component={Onboarding} roles={["admin"]} skipOnboardingCheck noLayout />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </AuthProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CompanyProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Suspense fallback={<RouteFallback />}>
            <Switch>
              <Route path="/catalog" component={Catalog} />
              <Route path="/s/:slug" component={PublicStorefrontPage} />
              <Route>
                {() => <AuthenticatedRouter />}
              </Route>
            </Switch>
            </Suspense>
          </WouterRouter>
          <Toaster />
          <UpgradeModal />
          <CookieConsentBanner />
        </CompanyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
