import { Link } from "wouter";
import { Sparkles, AlertTriangle } from "lucide-react";
import { usePaymentStatus } from "@/hooks/use-payment-status";

/**
 * Trial Badge — Header'da görünür kompakt CTA.
 * Trial dışındaki planlarda hiç render edilmez (gürültü olmasın).
 *
 * Stratejik niyet: kullanıcı her sayfada kalan günleri ve "Yükselt" linkini görsün.
 * - Yeşil: 7+ gün kaldı.
 * - Sarı: 3-6 gün kaldı.
 * - Kırmızı (yanıp söner): 0-2 gün veya süresi dolmuş.
 */
export function TrialBadge() {
  const { data, isLoading } = usePaymentStatus();

  if (isLoading || !data) return null;
  if (data.planType !== "trial") return null;

  const daysLeft = data.trialDaysLeft ?? 0;
  const expired = data.isTrialExpired || daysLeft <= 0;

  const tone = expired || daysLeft <= 2
    ? {
        bg: "bg-[color-mix(in_srgb,var(--color-semantic-danger)_12%,var(--color-surface-card))]",
        text: "text-[color:var(--color-semantic-danger)]",
        border: "border-[color:color-mix(in_srgb,var(--color-semantic-danger)_35%,var(--color-border-subtle))]",
        dot: "bg-[var(--color-semantic-danger)]",
      }
    : daysLeft <= 6
      ? {
          bg: "bg-[color-mix(in_srgb,var(--color-semantic-warning)_14%,var(--color-surface-card))]",
          text: "text-[color:var(--color-semantic-warning)]",
          border: "border-[color:color-mix(in_srgb,var(--color-semantic-warning)_35%,var(--color-border-subtle))]",
          dot: "bg-[var(--color-semantic-warning)]",
        }
      : {
          bg: "bg-[color-mix(in_srgb,var(--color-semantic-success)_12%,var(--color-surface-card))]",
          text: "text-[color:var(--color-semantic-success)]",
          border: "border-[color:color-mix(in_srgb,var(--color-semantic-success)_35%,var(--color-border-subtle))]",
          dot: "bg-[var(--color-semantic-success)]",
        };

  const label = expired
    ? "Deneme süresi doldu"
    : daysLeft === 1
    ? "Son 1 gün"
    : `Trial: ${daysLeft} gün kaldı`;

  const Icon = expired ? AlertTriangle : Sparkles;

  return (
    <Link
      href="/settings/subscription"
      className={`inline-flex items-center gap-2 rounded-full border ${tone.border} ${tone.bg} px-3 py-1 text-xs font-medium ${tone.text} transition-all hover:shadow-sm hover:scale-[1.02]`}
      data-testid="link-trial-badge"
      title="Plan karşılaştır ve şimdi yükselt"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${expired || daysLeft <= 2 ? "animate-pulse" : ""}`} />
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="hidden lg:inline text-[11px] opacity-80">• Şimdi yükselt →</span>
    </Link>
  );
}
