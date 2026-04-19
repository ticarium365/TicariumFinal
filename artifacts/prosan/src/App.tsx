import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { CompanyProvider } from "@/components/company-context";
import { Layout } from "@/components/layout";
import { TrialGateway } from "@/components/trial-gateway";
import NotFound from "@/pages/not-found";

// Pages
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import KarsilastirPage from "@/pages/karsilastir";
import HakkimizdaPage from "@/pages/hakkimizda";
import AmacimizPage from "@/pages/amacimiz";
import PaketlerPage from "@/pages/paketler";
import IletisimPage from "@/pages/iletisim";
import Catalog from "@/pages/catalog/index";
import Dashboard from "@/pages/dashboard";
import ProductsList from "@/pages/products/index";
import ProductNew from "@/pages/products/new";
import ProductDetail from "@/pages/products/detail";
import ProductEdit from "@/pages/products/edit";
import BarcodeScanner from "@/pages/barcode/index";
import SalesScreen from "@/pages/sales/index";
import SalesHistory from "@/pages/sales/history";
import StockEntry from "@/pages/stock/index";
import Reports from "@/pages/reports/index";
import DailySummary from "@/pages/reports/daily-summary";
import UsersList from "@/pages/users/index";
import Settings from "@/pages/settings/index";
import CompaniesAdmin from "@/pages/admin/companies";
import AdminPayments from "@/pages/admin/payments";
import PlatformSettings from "@/pages/admin/platform-settings";
import Onboarding from "@/pages/onboarding/index";
import CustomersList from "@/pages/customers/index";
import CustomerDetail from "@/pages/customers/detail";
import SuppliersList from "@/pages/suppliers/index";
import SupplierDetail from "@/pages/suppliers/detail";
import PurchasesList from "@/pages/purchases/index";
import NewPurchase from "@/pages/purchases/new";
import BarcodesPage from "@/pages/barcodes/index";
import StockCountsPage from "@/pages/stock-counts/index";
import StockCountDetail from "@/pages/stock-counts/detail";
import FinancePage from "@/pages/finance/index";
import BranchesPage from "@/pages/branches/index";
import IntegrationsPage from "@/pages/settings/integrations";
import SubscriptionPage from "@/pages/settings/subscription";
import DocumentsPage from "@/pages/documents/index";
import FinanceDocumentsPage from "@/pages/finance-documents/index";
import BankingPage from "@/pages/banking/index";
import FinanceDashboardPage from "@/pages/finance-dashboard/index";
import EInvoicePage from "@/pages/einvoice/index";
import MarketplacePage from "@/pages/marketplace/index";
import ETicariumMerkeziPage from "@/pages/eticarium-merkezi/index";
import MagazaListesi from "@/pages/magaza/index";
import MagazaDetay from "@/pages/magaza/detail";
import FiyatMotoru from "@/pages/fiyat-motoru/index";
import KargoYonetimi from "@/pages/kargo/index";
import KarlilikKanalPage from "@/pages/karlilik-kanal/index";
import PublicStorefrontPage from "@/pages/storefront-public/index";
import ProfitPage from "@/pages/profit/index";
import MuhasebeciPage from "@/pages/muhasebeci/index";
import BudgetsPage from "@/pages/butce/index";
import AdBudgetPage from "@/pages/reklam-butce/index";
import PazarPage from "@/pages/pazar/index";
import AggregatorAdminPage from "@/pages/aggregator-admin/index";
import ContactRequestsAdmin from "@/pages/super-admin/talepler";
import AuditLogsPage from "@/pages/super-admin/audit-logs";
import NewTenantWizard from "@/pages/super-admin/yeni-firma";
import ImportPage from "@/pages/ice-aktarim/index";
import POSPage from "@/pages/sales/pos";
import ProductionPage from "@/pages/uretim/index";
import LoyaltyPage from "@/pages/sadakat/index";
import CurrencyPage from "@/pages/doviz/index";
import NotificationSettingsPage from "@/pages/settings/notifications";
import NotificationsPage from "@/pages/notifications/index";
import PersonnelPage from "@/pages/personnel";
import CampaignsPage from "@/pages/campaigns";
import NetworkPage from "@/pages/network/index";
import CompanyProfilePage from "@/pages/network/company-profile";
import MyNetworkProfilePage from "@/pages/network/my-profile";
import QuotesListPage from "@/pages/b2b/quotes-list";
import QuoteNewPage from "@/pages/b2b/quote-new";
import QuoteDetailPage from "@/pages/b2b/quote-detail";
import OrdersListPage from "@/pages/b2b/orders-list";
import OrderDetailPage from "@/pages/b2b/order-detail";
import CatalogManagePage from "@/pages/b2b/catalog-manage";
import B2BVitrinPage from "@/pages/b2b/vitrin";
import ChannelsListPage from "@/pages/channels/channels-list";
import ChannelDetailPage from "@/pages/channels/channel-detail";
import ChannelsBulkPage from "@/pages/channels/channels-bulk";
import PricingPage from "@/pages/pricing";
import AdminBillingPage from "@/pages/admin/billing";
import GercekKarDashboard from "@/pages/gercek-kar/dashboard";
import GercekKarAyarlar from "@/pages/gercek-kar/ayarlar";
import GercekKarOneriler from "@/pages/gercek-kar/oneriler";
import { UpgradeModal, installFeatureLockInterceptor } from "@/components/upgrade-modal";
import CookieConsentBanner from "@/components/cookie-consent-banner";
import KvkkPage from "@/pages/kvkk";
import RuntimeFlagsAdminPage from "@/pages/admin/runtime-flags";
import PazaryeriSaglikPage from "@/pages/super-admin/pazaryeri-saglik";

installFeatureLockInterceptor();

const queryClient = new QueryClient();

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
        <Route path="/sifremi-unuttum" component={ForgotPassword} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/karsilastir" component={KarsilastirPage} />
        <Route path="/neden-ticarium365" component={KarsilastirPage} />
        <Route path="/neden-smsystems" component={KarsilastirPage} />
        <Route path="/hakkimizda" component={HakkimizdaPage} />
        <Route path="/amacimiz" component={AmacimizPage} />
        <Route path="/paketler" component={PaketlerPage} />
        <Route path="/iletisim" component={IletisimPage} />
        <Route path="/kvkk" component={KvkkPage} />

        <Route path="/">
          {() => {
            window.location.href = "/dashboard";
            return null;
          }}
        </Route>

        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
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

        <Route path="/super-admin/pazaryeri-saglik">
          {() => <ProtectedRoute component={PazaryeriSaglikPage} roles={["super_admin"]} />}
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
            <Switch>
              <Route path="/catalog" component={Catalog} />
              <Route path="/s/:slug" component={PublicStorefrontPage} />
              <Route>
                {() => <AuthenticatedRouter />}
              </Route>
            </Switch>
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
