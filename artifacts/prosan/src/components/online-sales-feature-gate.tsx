import { FEATURES } from "@workspace/db/feature-codes";
import { FeatureGate } from "@/components/feature-gate";

type Props = {
  children: React.ReactNode;
  /** Kilit ekranı başlığı */
  title?: string;
};

/**
 * `MARKETPLACE_BASIC` — Online Satış / pazaryeri ekranlarında paket yoksa
 * sayfa bağlamını koruyan yükseltme örtüsü (ayrı sayfaya yönlendirmez).
 */
export function OnlineSalesFeatureGate({ children, title }: Props) {
  return (
    <FeatureGate feature={FEATURES.MARKETPLACE_BASIC} title={title ?? "Online Satış modülü paketinizde yok"}>
      {children}
    </FeatureGate>
  );
}
