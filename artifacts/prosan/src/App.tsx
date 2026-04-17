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
import NotificationSettingsPage from "@/pages/settings/notifications";

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

        <Route path="/settings/notifications">
          {() => <ProtectedRoute component={NotificationSettingsPage} roles={["admin"]} />}
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
              <Route>
                {() => <AuthenticatedRouter />}
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster />
        </CompanyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
