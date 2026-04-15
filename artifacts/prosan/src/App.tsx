import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { Layout } from "@/components/layout";
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
import Reports from "@/pages/reports/index";
import UsersList from "@/pages/users/index";
import Settings from "@/pages/settings/index";

const queryClient = new QueryClient();

function ProtectedRoute({ 
  component: Component, 
  roles 
}: { 
  component: React.ComponentType; 
  roles?: string[];
}) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  if (roles && user && !roles.includes(user.role)) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold text-destructive">Erişim Reddedildi</h2>
          <p className="mt-2 text-muted-foreground">Bu sayfayı görüntüleme yetkiniz yok.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Component />
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

        <Route path="/reports">
          {() => <ProtectedRoute component={Reports} roles={["admin", "viewer"]} />}
        </Route>

        <Route path="/users">
          {() => <ProtectedRoute component={UsersList} roles={["admin"]} />}
        </Route>

        <Route path="/settings">
          {() => <ProtectedRoute component={Settings} roles={["admin"]} />}
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/catalog" component={Catalog} />
            <Route>
              {() => <AuthenticatedRouter />}
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
