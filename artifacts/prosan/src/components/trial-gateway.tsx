import { usePaymentStatus } from "@/hooks/use-payment-status";
import { useAuth } from "./auth-context";
import PaymentPage from "@/pages/payment";

export function TrialGateway({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: status, isLoading } = usePaymentStatus();

  if (!user || user.role === "super_admin") return <>{children}</>;
  if (isLoading) return <>{children}</>;

  if (status?.isTrialExpired || status?.planType === "suspended") {
    return <PaymentPage />;
  }

  return <>{children}</>;
}
