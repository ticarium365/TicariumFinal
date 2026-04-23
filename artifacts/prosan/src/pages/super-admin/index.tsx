import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, CreditCard, Flag, Activity, Inbox, ScrollText, UserPlus,
  HeartPulse, Radio, TrendingUp, Users, AlertTriangle, BarChart3, Gauge, Rocket, ClipboardList,
  Sparkles, Radar, Lightbulb, CircleDollarSign, ShieldAlert, Briefcase, Timer, BookOpen,
} from "lucide-react";

type FounderSignals = {
  trialsEndingWithin7Days: number;
  churnCancelledLast30Days: number;
  unpaidSubscriptionInvoicesLast7Days: number;
  newActiveSubscriptionsLast7Days: number;
  tenantsWithSalesLast7Days: number;
  newActiveSubscriptionsLast30Days: number;
  topTenantsBySales7d: { companyId: number; name: string; salesCount: number }[];
};

type FounderSignalsV3 = {
  inactiveSellerTenantsNoSales7d: number;
  fastGrowingTenants: {
    companyId: number;
    name: string;
    deltaSalesCount: number;
    salesLast7Days: number;
  }[];
  invoiceRiskTenants: {
    companyId: number;
    name: string;
    overdueAmountTry: number;
    pendingInvoiceCount: number;
  }[];
  topPlansStartedThisMonth: { planSlug: string; planName: string; newSubscriptionStarts: number }[];
  supportHeavyTenants: { companyId: number; name: string; openContactRequests: number }[];
  trialMomentumCandidates: { companyId: number; name: string; salesLast14Days: number }[];
  funnelUpgradeTouchesLast30Days: number;
  funnelCheckoutStartsLast30Days: number;
};

type FounderSignalsV4 = {
  overduePendingInvoicesTotalTry: number;
  dormantActiveSubNoSales30d: number;
  newCompaniesThisCalendarMonth: number;
  funnelEventsTop7d: { eventKey: string; count: number }[];
  topDormantTenants: { companyId: number; name: string; productCount: number }[];
};

type FounderSignalsV5 = {
  cashDueNext7DaysTry: number;
  cashDueNext7DaysCount: number;
  overdueBucketsTry: { days0to7: number; days8to30: number; days31Plus: number };
  overdueBucketsCount: { days0to7: number; days8to30: number; days31Plus: number };
  collectionPriority: {
    companyId: number;
    name: string;
    collectionScore: number;
    overdueTry: number;
    oldestDueDays: number;
    pendingInvoiceCount: number;
  }[];
  atRiskMrrTry: number;
  churnReasonSummary: { reason: string; count: number }[];
  gracePeriodStarts7d: number;
  operatingSnapshot30d: {
    mrrTry: number;
    churnSubsCancelled30d: number;
    overduePendingTry: number;
    overdueInvoicesRecovered30d: number;
    cancelRescueViews30d: number;
    cancelConfirmed30d: number;
  };
  billingReturnSources30d: { source: string; count: number }[];
};

type FounderSignalsV6 = {
  moneyDueThisWeekTry: number;
  moneyDueThisWeekCount: number;
  recoverableMrrTry: number;
  churnRiskMrrTry: number;
  topGrowthTenants: { companyId: number; name: string; deltaSalesCount: number; salesLast7Days: number }[];
  weakEngagementTenants: { companyId: number; name: string; salesLast30d: number }[];
  churnReasonByCode: { code: string; count: number }[];
  recoveredCashTryLast30d: number;
  reminderSegments: { soft: number; firm: number; urgent: number; totalCompanies: number };
  reminderSignalQueue: {
    companyId: number;
    name: string;
    overdueTry: number;
    oldestDueDays: number;
    reminderLevel: "soft" | "firm" | "urgent";
    pendingInvoiceCount: number;
  }[];
  monthlyExecutiveSnapshot: {
    calendarMonth: string;
    mrrTry: number;
    newCompaniesThisMonth: number;
    churnSubsCancelled30d: number;
    overduePendingTry: number;
    trialsEndingWithin7Days: number;
    dormantActiveSubNoSales30d: number;
    overdueRecoveredEvents30d: number;
  };
  sellerQuoteAcceptance: {
    sellerCompanyId: number;
    sellerName: string;
    acceptedCount: number;
    decidedCount: number;
    acceptanceRate: number;
  }[];
};

type FounderSignalsV7 = {
  openReminderActionCount: number;
  contactedReminderActions7d: number;
  resolvedReminderActions7d: number;
  recoveredAfterReminder30d: number;
  comebackPricingViews30d: number;
  comebackOfferClicks30d: number;
  churnGraceSavesThisMonth: number;
  upgradeOpportunityTop: {
    companyId: number;
    name: string;
    planSlug: string;
    upsellScore: number;
    sales30d: number;
    productCount: number;
    planLimitPressurePct?: number;
    maxProducts?: number;
  }[];
  sellerLeaderboardByVolume: {
    sellerCompanyId: number;
    sellerName: string;
    decidedCount: number;
    acceptancePct: number;
  }[];
  growthHotspots: { companyId: number; name: string; salesLast7Days: number }[];
  weeklyMoneyActionsDigest: string;
  engagedLowPlanCandidates: {
    companyId: number;
    name: string;
    planSlug: string;
    engagementScore: number;
    sales30d: number;
    productCount: number;
    planLimitPressurePct?: number;
  }[];
};

type FounderSignalsV8 = {
  weeklyActionScoreboard: {
    collectionActionsOpen: number;
    collectionContacted7d: number;
    collectionResolved7d: number;
    b2bQuotesStuckPending3dPlus: number;
    b2bQuotesStuckPending7dPlus: number;
    trackedUpgradeLeads: number;
  };
  moneyRecoveredOverdueTryThisWeek: number;
  billingCheckoutStartsThisMonth: number;
  billingPaidSuccessThisMonth: number;
  churnGraceSavesThisMonth: number;
  topRiskTenants: { companyId: number; name: string; overdueTry: number; oldestDueDays: number }[];
  growthOpportunityLabels: string[];
  b2bStuckQuoteSamples: {
    requestId: number;
    code: string;
    sellerName: string;
    buyerName: string;
    ageDays: number;
  }[];
  b2bSellersMostStuckPending: { sellerCompanyId: number; sellerName: string; stuckPending3dPlus: number }[];
  collectionOutcomes30d: {
    resolved: number;
    dismissed: number;
    snoozed: number;
    contactedStale14d: number;
  };
  openReminderActionsByTier: { tier: string; count: number }[];
  weeklyExecutionDigest: string;
};

type FounderSignalsV9 = {
  planUpgradedEvents30d: number;
  planUpgradedEventsThisMonth: number;
  planUpgradeDestinationsMonth: { planSlug: string; count: number }[];
  planUpgradeSourceBreakdown30d: { source: string; count: number }[];
  b2bGlobalMedianFirstResponseHours: number | null;
  b2bSlowestMedianResponseSellers: {
    sellerCompanyId: number;
    sellerName: string;
    medianFirstResponseHours: number;
  }[];
  strategicDigestV9: string;
  todayRecommendedActions: string[];
};

type FounderSignalsV10 = {
  dailyCeoBriefing: string;
  weeklyExecutiveDigest: string;
  moneyRiskMapLine: string;
  growthMapLine: string;
  whatToDoNext: string[];
  recommendationsV2: {
    id: string;
    kind: string;
    roiScore: number;
    headline: string;
    rationale: string;
    companyId?: number;
    sellerCompanyId?: number;
    requestId?: number;
    amountTry?: number;
    badges: string[];
  }[];
  collectionRecoverabilityPreview: {
    companyId: number;
    name: string;
    payProbability0to100: number;
    basis: string;
  }[];
  planUpgradeSourceBreakdown30d: { source: string; count: number }[];
};

type RevenueAttributionV2 = {
  medianDaysSignupToFirstBillingSuccess: number | null;
  trialTouchCompanies30d: number;
  trialTouchAndBillingPaid30d: number;
  trialCohortPaidConversionPct: number;
  graceRescueViewCompanies30d: number;
  graceViewAndReactivateCompanies30d: number;
  graceComebackConversionPct: number;
  billingPaidSuccessByPage30d: { page: string; count: number }[];
  checkoutToPaidRateThisMonthPct: number;
  planUpgradedEventsPrev30d: number;
  planUpgradedEventsLast30d: number;
};

type RevenueAttributionV3 = RevenueAttributionV2 & {
  billingPaidSuccessByUtm30d: { utmSource: string; count: number }[];
  billingPaidSuccessByPropsSource30d: { source: string; count: number }[];
  graceRescueViewsBySource30d: { source: string; count: number }[];
  medianDaysSignupToPaidByPlanSlug: { planSlug: string; medianDays: number; sampleSize: number }[];
  livePaymentsThisMonth?: { paidCount: number; paidAmountTry: number };
  identityGateThisMonth?: {
    shownCount: number;
    savedCount: number;
    phoneShownCount?: number;
    phoneSavedCount?: number;
    checkoutFailedCount?: number;
  };
  paymentFailureClusters30d?: { errorCode: string; count: number }[];
  trialCohortByMonth: {
    monthKey: string;
    trialCompanies: number;
    paidSameMonthCompanies: number;
    conversionPct: number;
  }[];
  pricingViewToPaidWithin7dCompanies30d: number;
  upsellConversionsByTrigger30d: { trigger: string; count: number }[];
  billingReturnRedirectErrorsThisMonth?: number;
  billingTopupFailedThisMonth?: number;
};

type FounderCopilotV1 = {
  actions: (FounderSignalsV10["recommendationsV2"][0] & {
    whyNow: string;
    expectedRoiBand: string;
    ifIgnored: string;
    estimatedImpactTryBand: string;
  })[];
  fastestWinToday: string;
  bestGrowthBetThisWeek: string;
  biggestRiskToday: string;
};

type ExpansionEngineV1 = {
  upgradeProbabilityTop: {
    companyId: number;
    name: string;
    planSlug: string;
    upgradeProbability0to100: number;
    upsellScore: number;
    planLimitPressurePct: number;
    signals: string[];
  }[];
  warmAccountsToContact: { companyId: number; name: string; reasonTag: string; priority0to100: number }[];
  planMismatchHints: string[];
  expansionTimingLine: string;
};

type FounderSignalsV11 = {
  dailyCeoBriefing: string;
  weeklyBoardSummary: string;
  top3MovesThisWeek: FounderCopilotV1["actions"];
  riskRadar: { level: string; summary: string; signals: string[] };
  growthRadar: { level: string; summary: string; signals: string[] };
  cashRadar: { level: string; summary: string; signals: string[] };
  recommendedPlaybook: { title: string; steps: string[] }[];
};

type FounderOvernightPackV1 = {
  planUpgradeRoiBoardV1: {
    windowDays: number;
    eventsInWindow: number;
    estimatedMrrDeltaTryFromUpgrades: number;
    byDestinationPlan: { planSlug: string; count: number; estimatedMrrDeltaTry: number }[];
    bySource: { source: string; count: number; estimatedMrrDeltaTry: number }[];
    byCompanySizeBand: { band: string; count: number }[];
  };
  revenueForecastsV1: {
    mrrBaselineTry: number;
    mrrForecast30dTry: number;
    mrrForecast90dTry: number;
    narrative: string;
  };
  collectionsBoardV2: {
    cashDueNext7dTry: number;
    cashDueNext30dTry: number;
    overduePendingTotalTry: number;
    medianDaysOverdueBeforePay90d: number | null;
    topDebtors: { companyId: number; name: string; overdueTry: number; invoiceCount: number }[];
    recoveryAfterReminder30dEvents: number;
    weeklyCollectionDigestLine: string;
  };
  retentionChurnBoardV1: {
    cancelReasons30d: { reason: string; count: number }[];
    estimatedMrrLostToChurn30dTry: number;
    dormantPayingActiveLowSales30d: { companyId: number; name: string; planSlug: string; sales30d: number }[];
    churnRiskHints: string[];
  };
  b2bOpsBoardV1: {
    pendingQuoteAgingBuckets: { bucket: string; count: number }[];
    sellerCloseRatesSample: { sellerCompanyId: number; sellerName: string; decided: number; accepted: number; closeRatePct: number }[];
    monthlyOpsDigestLine: string;
  };
  funnelHygieneV1: {
    checkoutStartedThisMonth: number;
    billingPaidThisMonth: number;
    billingErrorThisMonth: number;
    checkoutDropOffPct: number;
    billingReturnRedirectErrorsThisMonth?: number;
    billingTopupFailedThisMonth?: number;
    funnelDelta24h: { eventKey: string; last24h: number; prev24h: number; delta: number }[];
  };
  executiveAttentionV1: {
    top10AccountsToCall: { companyId: number; name: string; tag: string; score: number }[];
    topRisksToday: string[];
    whatChangedSinceYesterday: string[];
    founderAttentionLine: string;
  };
};

type BillingMetrics = {
  mrr: number;
  arr: number;
  activeTenantCount: number;
  trialTenantCount: number;
  expiredTenantCount: number;
  totalTenants: number;
  churnedSubscriptions: number;
  planBreakdown: Record<string, { count: number; mrr: number; name: string }>;
  founderSignals?: FounderSignals;
  founderSignalsV3?: FounderSignalsV3;
  founderSignalsV4?: FounderSignalsV4;
  founderSignalsV5?: FounderSignalsV5;
  founderSignalsV6?: FounderSignalsV6;
  founderSignalsV7?: FounderSignalsV7;
  founderSignalsV8?: FounderSignalsV8;
  founderSignalsV9?: FounderSignalsV9;
  founderSignalsV10?: FounderSignalsV10;
  founderSignalsV11?: FounderSignalsV11;
  founderCopilotV1?: FounderCopilotV1;
  expansionEngineV1?: ExpansionEngineV1;
  revenueAttributionV2?: RevenueAttributionV2;
  revenueAttributionV3?: RevenueAttributionV3;
  founderOvernightPackV1?: FounderOvernightPackV1;
  founderIntelligenceV2?: {
    dailyPriorities: string[];
    moneyDueSoonLine: string;
    moneyDueSoonTry7d: number;
    moneyDueSoonTry30d: number;
    hiddenRisks: string[];
    easiestWins: string[];
    topOpportunities: string[];
    watchlistAccounts: { companyId: number; name: string; reason: string; score0to100: number }[];
    recommendedActions: string[];
  };
  revenueEngineBundleV1?: {
    upgradeProbabilityLeaders: { companyId: number; name: string; planSlug: string; probability0to100: number }[];
    expansionCandidates: { companyId: number; name: string; reasonTag: string; priority0to100: number }[];
    pricingPathWinners: { pageOrLabel: string; paidSuccessCount30d: number; note: string }[];
    comebackWinners: { headline: string; detail: string }[];
    lostRevenueMap: { bucket: string; approxTry: number; note: string }[];
    forecast30dTry: number;
    forecast90dTry: number;
    bundleNarrative: string;
  };
  founderIntelligenceV3?: {
    generatedAtIso: string;
    scoringNote: string;
    rollupLine: string;
    rankedDailyActions: {
      id: string;
      headline: string;
      kind: string;
      source: string;
      totalScore0to100: number;
      drivers: { label: string; points: number }[];
    }[];
  };
  churnPreventionBundleV1?: {
    bundleHeadline: string;
    churnRiskMrrTry: number;
    estimatedMrrLostToChurn30dTry: number;
    cancelReasons30d: { reason: string; count: number }[];
    silentChurnWatchlist: {
      companyId: number;
      name: string;
      reason: string;
      sales30d: number;
      planSlug?: string;
    }[];
    rescueFunnelSignals: {
      recoveredAfterReminder30d: number;
      comebackPricingViews30d: number;
      comebackOfferClicks30d: number;
      churnGraceSavesThisMonth: number;
      cancelRescueViews30d: number;
      cancelConfirmed30d: number;
    };
    saveTriggers: string[];
    consolidatedPlaybook: string[];
  };
  b2bOpsBundleV1?: {
    digestLine: string;
    pendingQuoteAgingBuckets: { bucket: string; count: number }[];
    sellerCloseRatesSample: { sellerCompanyId: number; sellerName: string; decided: number; accepted: number; closeRatePct: number }[];
    sellerQuoteAcceptanceLeaders: {
      sellerCompanyId: number;
      sellerName: string;
      acceptanceRate: number;
      decidedCount: number;
      acceptedCount: number;
    }[];
    repeatBuyerRelationships: {
      buyerCompanyId: number;
      buyerName: string;
      sellerCompanyId: number;
      sellerName: string;
      acceptedQuotesInWindow: number;
    }[];
    coachingHints: string[];
  };
  billingMetricsPerformanceBundleV1?: {
    serverDurationMs: number;
    parallelSqlSlotsFounderPack: number;
    supplementalSqlSlotsB2b: number;
    clientStaleTimeSuggestionSeconds: number;
    healthNotes: string[];
  };
  docsPlaybooksBundleV1?: {
    docIndex: { path: string; title: string; oneLiner: string }[];
    mirroredBoardPlaybooks: { title: string; steps: string[] }[];
  };
  /** payments tablosu: abonelik vs kontör top-up (bu takvim ayı, succeeded). */
  billingPaymentsRevenueV1?: {
    subscriptionPaymentsTryThisMonth: number;
    subscriptionPaymentCountThisMonth: number;
    topupPaymentsTryThisMonth: number;
    topupPaymentCountThisMonth: number;
    topupRepeaters90d: number;
    topupAmongActivePlanCompanies90d: number;
  };
  /** Founder otomasyonu: 7g spike + top-up provider hata kodları (30g). */
  billingReliabilityAutomationV1?: {
    returnRedirectLast7d: number;
    returnRedirectPrev7d: number;
    returnRedirectSpike7d: boolean;
    topupFailFunnelLast7d: number;
    topupFailFunnelPrev7d: number;
    topupFailFunnelSpike7d: boolean;
    topupProviderFailedByCode30d: { code: string; count: number }[];
  };
};

type ReminderActionRow = {
  id: number;
  companyId: number;
  companyName: string;
  periodKey: string;
  reminderTier: string;
  status: string;
  overdueTrySnapshot: number;
  createdAt: string;
};

type ContactSummary = {
  openContactRequests: number;
  newCompaniesLast7Days: number;
};

const links = [
  { href: "/admin/companies", title: "Firmalar", desc: "Kiracı listesi ve yönetim", icon: Building2 },
  { href: "/admin/planlar", title: "Abonelik planları", desc: "Paket ve özellik kataloğu", icon: CreditCard },
  { href: "/admin/payments", title: "Ödemeler", desc: "Tahsilat ve işlem kayıtları", icon: CreditCard },
  { href: "/admin/billing", title: "Faturalama", desc: "Fatura ve abonelik faturaları", icon: CreditCard },
  { href: "/admin/runtime-flags", title: "Özellik bayrakları", desc: "Anlık davranış anahtarları", icon: Flag },
  { href: "/admin/musteri-doluluk", title: "Müşteri doluluk", desc: "Kurulum ve kullanım skoru", icon: HeartPulse },
  { href: "/super-admin/sistem-saglik", title: "Sistem sağlığı", desc: "API ve bağımlılık özeti", icon: Activity },
  { href: "/super-admin/pazaryeri-saglik", title: "Pazaryeri sağlığı", desc: "Kanal bağlantı özeti", icon: Radio },
  { href: "/super-admin/talepler", title: "İletişim talepleri", desc: "Web formu gelen kutusu", icon: Inbox },
  { href: "/super-admin/audit-logs", title: "Denetim günlüğü", desc: "Kritik işlem kayıtları", icon: ScrollText },
  { href: "/super-admin/yeni-firma", title: "Yeni firma", desc: "Kiracı oluşturma sihirbazı", icon: UserPlus },
];

const fmtTRY = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);

export default function SuperAdminHubPage() {
  const qc = useQueryClient();
  const { data: metrics, isLoading: mLoading, isError: mErr } = useQuery<BillingMetrics>({
    queryKey: ["/api/subscriptions/admin/billing/metrics"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/admin/billing/metrics", { credentials: "include" });
      if (!r.ok) throw new Error("metrics");
      return r.json();
    },
    staleTime: 180_000,
  });

  const { data: reminderSignals } = useQuery<{
    reminderPolicyNote: string;
    segments: { soft: number; firm: number; urgent: number; totalCompanies: number };
    queue: {
      companyId: number;
      name: string;
      overdueTry: number;
      oldestDueDays: number;
      reminderLevel: "soft" | "firm" | "urgent";
      pendingInvoiceCount: number;
    }[];
  }>({
    queryKey: ["/api/subscriptions/admin/billing/collection-reminder-signals"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/admin/billing/collection-reminder-signals", { credentials: "include" });
      if (!r.ok) throw new Error("reminders");
      return r.json();
    },
    staleTime: 120_000,
  });

  const { data: reminderActions } = useQuery<{ actions: ReminderActionRow[] }>({
    queryKey: ["/api/subscriptions/admin/billing/collection-reminder-actions"],
    queryFn: async () => {
      const r = await fetch("/api/subscriptions/admin/billing/collection-reminder-actions?status=open&limit=40", { credentials: "include" });
      if (!r.ok) return { actions: [] };
      return r.json();
    },
    staleTime: 45_000,
    retry: false,
  });

  const patchReminderAction = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/subscriptions/admin/billing/collection-reminder-actions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "patch");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/collection-reminder-actions"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/metrics"] });
    },
  });

  const enqueueReminderAction = useMutation({
    mutationFn: async (p: { companyId: number; reminderTier: string; overdueTrySnapshot: number }) => {
      const r = await fetch("/api/subscriptions/admin/billing/collection-reminder-actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: p.companyId,
          reminderTier: p.reminderTier,
          overdueTrySnapshot: p.overdueTrySnapshot,
          status: "queued",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.message === "string" ? j.message : "enqueue");
      return j as { idempotent?: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/collection-reminder-actions"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/admin/billing/metrics"] });
    },
  });

  const { data: contactSum, isLoading: cLoading } = useQuery<ContactSummary>({
    queryKey: ["/api/contact/admin/summary"],
    queryFn: async () => {
      const r = await fetch("/api/contact/admin/summary", { credentials: "include" });
      if (!r.ok) throw new Error("summary");
      return r.json();
    },
    staleTime: 90_000,
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6" data-testid="super-admin-hub">
      <div>
        <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>
          Platform komuta merkezi
        </h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
          Tüm kiracı, fatura ve operasyon araçlarına tek ekrandan gidin. Aşağıdaki özet canlı veridir; detay için ilgili sayfayı açın.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : mErr || !metrics ? (
          <Card className="sm:col-span-2 lg:col-span-4 border-destructive/30">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Abonelik metrikleri yüklenemedi. Oturum veya ağ kontrolü yapın.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" /> Tahmini MRR
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{fmtTRY(metrics.mrr)}</p>
                <p className="text-xs text-muted-foreground mt-1">{metrics.activeTenantCount} aktif abonelik</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" /> Kiracılar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{metrics.totalTenants}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.trialTenantCount} deneme · {metrics.expiredTenantCount} süresi dolmuş / askıda
                </p>
              </CardContent>
            </Card>
            <Card className={contactSum && contactSum.openContactRequests > 0 ? "border-amber-300/60" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Açık talepler
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{contactSum?.openContactRequests ?? "—"}</p>
                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                      <Link href="/super-admin/talepler">Kutuya git</Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <UserPlus className="h-4 w-4" /> Yeni kayıt (7 gün)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{contactSum?.newCompaniesLast7Days ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Yeni firma oluşturma</p>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {metrics && metrics.churnedSubscriptions > 0 && (
        <p className="text-xs text-muted-foreground rounded-lg border bg-muted/20 px-3 py-2">
          İptal durumunda <strong className="text-foreground">{metrics.churnedSubscriptions}</strong> abonelik kaydı (tüm zaman) —{" "}
          <Link href="/admin/payments" className="text-primary underline font-medium">Ödemeler</Link>
          {" · "}
          <Link href="/admin/billing" className="text-primary underline font-medium">Faturalama</Link>
        </p>
      )}

      {metrics && Object.keys(metrics.planBreakdown ?? {}).length > 0 && (
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <p className="font-semibold text-foreground mb-2">Aktif abonelik — plan dağılımı</p>
          <ul className="space-y-1.5">
            {Object.entries(metrics.planBreakdown)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 6)
              .map(([slug, v]) => (
                <li key={slug} className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate" title={slug}>{v.name}</span>
                  <span className="tabular-nums shrink-0 text-foreground">{v.count} kiracı · {fmtTRY(v.mrr)}/ay</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {metrics && metrics.expiredTenantCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>{metrics.expiredTenantCount}</strong> kiracı denemesi dolmuş veya askıda görünüyor — tahsilat ve destek için{" "}
            <Link href="/admin/billing" className="underline font-medium">Faturalama</Link> ve{" "}
            <Link href="/admin/companies" className="underline font-medium">Firmalar</Link> sayfalarını kontrol edin.
          </span>
        </div>
      )}

      {metrics?.founderSignals && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Operasyon sinyalleri (7 / 30 gün)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">7 gün içinde bitecek deneme</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.trialsEndingWithin7Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">30 günde iptal (abonelik)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.churnCancelledLast30Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">7 günde ödenmemiş fatura</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.unpaidSubscriptionInvoicesLast7Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Yeni aktif abonelik (7 gün)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.newActiveSubscriptionsLast7Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Satış yapan kiracı (7 gün)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.tenantsWithSalesLast7Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Yeni aktif abonelik (30 gün)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignals.newActiveSubscriptionsLast30Days}</p>
            </div>
          </div>
          {metrics.founderSignals.topTenantsBySales7d.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Son 7 gün — satış adedi (üst 5)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignals.topTenantsBySales7d.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground" title={t.name}>{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{t.salesCount} satış</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV3 && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Büyüme & risk (v3)
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Satıcı tipi kiracı — 7 gün satış yok</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV3.inactiveSellerTenantsNoSales7d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Funnel dokunuşu (30 gün, DB)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV3.funnelUpgradeTouchesLast30Days}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Ödeme başlatma (30 gün)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV3.funnelCheckoutStartsLast30Days}</p>
            </div>
          </div>
          {metrics.founderSignalsV3.topPlansStartedThisMonth.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Bu ay başlayan abonelikler — plan</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV3.topPlansStartedThisMonth.map((p) => (
                  <li key={p.planSlug} className="flex justify-between gap-2">
                    <span className="truncate text-foreground" title={p.planSlug}>{p.planName}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{p.newSubscriptionStarts} yeni</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV3.fastGrowingTenants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Hızlı ivme (7g vs önceki 7g satış adedi)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV3.fastGrowingTenants.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">Δ{t.deltaSalesCount} · 7g {t.salesLast7Days}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV3.invoiceRiskTenants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-800 mb-1.5">Vadesi geçmiş bekleyen faturalar (TRY)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV3.invoiceRiskTenants.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{fmtTRY(t.overdueAmountTry)} · {t.pendingInvoiceCount} fatura</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV3.supportHeavyTenants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Açık CRM talebi (satıcıya bağlı)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV3.supportHeavyTenants.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{t.openContactRequests} açık</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV3.trialMomentumCandidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Deneme + onboarding + 14g satış</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV3.trialMomentumCandidates.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{t.salesLast14Days} satış</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV5 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Tahsilat & risk (v5)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">7 gün içinde vadesi gelecek (TRY)</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV5.cashDueNext7DaysTry)}</p>
              <p className="text-[10px] text-muted-foreground">{metrics.founderSignalsV5.cashDueNext7DaysCount} fatura</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Risk altındaki MRR (TRY / ay)</p>
              <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">{fmtTRY(metrics.founderSignalsV5.atRiskMrrTry)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Grace başlangıcı (7 gün)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV5.gracePeriodStarts7d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">30g özet — vadesi geçmiş tahsilat</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV5.operatingSnapshot30d.overduePendingTry)}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border px-2 py-1.5">
              <p className="text-muted-foreground font-medium">Gecikme 0–7g (TRY)</p>
              <p className="tabular-nums font-semibold">{fmtTRY(metrics.founderSignalsV5.overdueBucketsTry.days0to7)} · {metrics.founderSignalsV5.overdueBucketsCount.days0to7} fatura</p>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <p className="text-muted-foreground font-medium">Gecikme 8–30g</p>
              <p className="tabular-nums font-semibold">{fmtTRY(metrics.founderSignalsV5.overdueBucketsTry.days8to30)} · {metrics.founderSignalsV5.overdueBucketsCount.days8to30}</p>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <p className="text-muted-foreground font-medium">31g+</p>
              <p className="tabular-nums font-semibold">{fmtTRY(metrics.founderSignalsV5.overdueBucketsTry.days31Plus)} · {metrics.founderSignalsV5.overdueBucketsCount.days31Plus}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <p className="font-medium text-foreground">30 günlük işletme özeti</p>
              <p className="text-muted-foreground">MRR: <span className="text-foreground tabular-nums font-medium">{fmtTRY(metrics.founderSignalsV5.operatingSnapshot30d.mrrTry)}</span></p>
              <p className="text-muted-foreground">İptal (30g): <span className="text-foreground tabular-nums">{metrics.founderSignalsV5.operatingSnapshot30d.churnSubsCancelled30d}</span></p>
              <p className="text-muted-foreground">Vadesi geçmiş ödendi (olay): <span className="text-foreground tabular-nums">{metrics.founderSignalsV5.operatingSnapshot30d.overdueInvoicesRecovered30d}</span></p>
              <p className="text-muted-foreground">İptal kurtarma görüntü / onay: <span className="text-foreground tabular-nums">{metrics.founderSignalsV5.operatingSnapshot30d.cancelRescueViews30d}</span> / <span className="tabular-nums">{metrics.founderSignalsV5.operatingSnapshot30d.cancelConfirmed30d}</span></p>
            </div>
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <p className="font-medium text-foreground">Ödeme dönüşü kaynakları (30g)</p>
              {metrics.founderSignalsV5.billingReturnSources30d.length === 0 ? (
                <p className="text-muted-foreground">Veri yok veya props alanı kullanılmıyor.</p>
              ) : (
                <ul className="space-y-0.5">
                  {metrics.founderSignalsV5.billingReturnSources30d.map((s) => (
                    <li key={s.source} className="flex justify-between gap-2 font-mono text-[11px]">
                      <span className="truncate">{s.source}</span>
                      <span className="tabular-nums shrink-0">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {metrics.founderSignalsV5.churnReasonSummary.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">İptal notu özeti (30g, üst kalemler)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {metrics.founderSignalsV5.churnReasonSummary.map((r) => (
                  <li key={r.reason} className="max-w-[220px] truncate" title={r.reason}>
                    <span className="text-foreground">{r.reason}</span>
                    <span className="text-muted-foreground tabular-nums ml-1">×{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV5.collectionPriority.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1.5">Tahsilat önceliği (skor = tutar × gecikme ağırlığı)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV5.collectionPriority.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">
                      skor {t.collectionScore.toLocaleString("tr-TR")} · {fmtTRY(t.overdueTry)} · {t.oldestDueDays}g · {t.pendingInvoiceCount} fatura
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV6 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Executive cockpit (v6)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Bu hafta vadesi gelen (takvim haftası, TRY)</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV6.moneyDueThisWeekTry)}</p>
              <p className="text-[10px] text-muted-foreground">{metrics.founderSignalsV6.moneyDueThisWeekCount} fatura</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Tahsil edilebilir MRR (vadesi geçmiş, TRY/ay)</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmtTRY(metrics.founderSignalsV6.recoverableMrrTry)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Churn riski MRR (grace, TRY/ay)</p>
              <p className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300">{fmtTRY(metrics.founderSignalsV6.churnRiskMrrTry)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">30g tahsil edilen (vadesi geçmişti, TRY)</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV6.recoveredCashTryLast30d)}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="font-medium text-foreground mb-1">Büyüyen kiracılar (7g satış ivmesi)</p>
              {metrics.founderSignalsV6.topGrowthTenants.length === 0 ? (
                <p className="text-muted-foreground">Veri yok.</p>
              ) : (
                <ul className="space-y-0.5">
                  {metrics.founderSignalsV6.topGrowthTenants.map((t) => (
                    <li key={t.companyId} className="flex justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">Δ{t.deltaSalesCount} · {t.salesLast7Days} satış</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="font-medium text-foreground mb-1">Zayıf etkileşim (30g 1–6 satış, aktif abonelik)</p>
              {metrics.founderSignalsV6.weakEngagementTenants.length === 0 ? (
                <p className="text-muted-foreground">Veri yok.</p>
              ) : (
                <ul className="space-y-0.5">
                  {metrics.founderSignalsV6.weakEngagementTenants.map((t) => (
                    <li key={t.companyId} className="flex justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">{t.salesLast30d} satış</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md border px-2 py-2">
              <p className="font-medium text-foreground mb-1">İptal kodu dağılımı (90g)</p>
              {metrics.founderSignalsV6.churnReasonByCode.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">Sütun henüz yok veya iptal kaydı yok — migrate:sql çalıştırın.</p>
              ) : (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
                  {metrics.founderSignalsV6.churnReasonByCode.map((c) => (
                    <li key={c.code}><span className="text-foreground">{c.code}</span> ×{c.count}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border px-2 py-2">
              <p className="font-medium text-foreground mb-1">B2B teklif — satıcı kabul oranı (90g, min 2 karar)</p>
              {metrics.founderSignalsV6.sellerQuoteAcceptance.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">Yeterli hacim yok.</p>
              ) : (
                <ul className="space-y-0.5 text-[11px]">
                  {metrics.founderSignalsV6.sellerQuoteAcceptance.slice(0, 8).map((s) => (
                    <li key={s.sellerCompanyId} className="flex justify-between gap-2">
                      <span className="truncate">{s.sellerName}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">{s.acceptanceRate}% · {s.acceptedCount}/{s.decidedCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="rounded-md border bg-muted/15 px-2 py-2 text-xs space-y-1">
            <p className="font-medium text-foreground">Aylık yönetici özeti ({metrics.founderSignalsV6.monthlyExecutiveSnapshot.calendarMonth})</p>
            <p className="text-muted-foreground">
              MRR {fmtTRY(metrics.founderSignalsV6.monthlyExecutiveSnapshot.mrrTry)} · yeni firma {metrics.founderSignalsV6.monthlyExecutiveSnapshot.newCompaniesThisMonth} ·
              deneme bitiş 7g {metrics.founderSignalsV6.monthlyExecutiveSnapshot.trialsEndingWithin7Days} · uykuda aktif {metrics.founderSignalsV6.monthlyExecutiveSnapshot.dormantActiveSubNoSales30d}
            </p>
          </div>
          {metrics.founderSignalsV6.reminderSignalQueue.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Tahsilat hatırlatma kuyruğu (özet, metriklerden)</p>
              <ul className="space-y-1 text-[11px]">
                {metrics.founderSignalsV6.reminderSignalQueue.slice(0, 8).map((q) => (
                  <li key={q.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{q.name}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{q.reminderLevel} · {fmtTRY(q.overdueTry)} · {q.oldestDueDays}g</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reminderSignals && (
            <div className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground space-y-2">
              <p>
                <span className="font-medium text-foreground">Geniş hatırlatma kuyruğu:</span>{" "}
                yumuşak {reminderSignals.segments.soft}, sıkı {reminderSignals.segments.firm}, acil {reminderSignals.segments.urgent} ({reminderSignals.segments.totalCompanies} firma).{" "}
                {reminderSignals.reminderPolicyNote}
              </p>
              {reminderSignals.queue.length > 0 && (
                <ul className="space-y-1.5 text-foreground/90">
                  {reminderSignals.queue.slice(0, 12).map((q) => {
                    const tier = q.reminderLevel;
                    const enqBusy =
                      enqueueReminderAction.isPending && enqueueReminderAction.variables?.companyId === q.companyId;
                    return (
                      <li key={q.companyId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-border/40 pt-1.5 first:border-0 first:pt-0">
                        <span className="truncate">
                          <span className="font-medium">{q.name}</span>{" "}
                          <span className="font-mono text-muted-foreground">{tier} · {fmtTRY(q.overdueTry)} · {q.oldestDueDays}g · {q.pendingInvoiceCount} ftr</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 shrink-0 text-[11px] self-start sm:self-auto"
                          disabled={patchReminderAction.isPending || enqBusy}
                          onClick={() =>
                            enqueueReminderAction.mutate({
                              companyId: q.companyId,
                              reminderTier: tier,
                              overdueTrySnapshot: q.overdueTry,
                            })
                          }
                        >
                          {enqBusy ? "…" : "Aksiyona al"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV7 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            İşletme aksiyonları (v7)
          </p>
          <p className="text-[11px] text-muted-foreground">{metrics.founderSignalsV7.weeklyMoneyActionsDigest}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Açık tahsilat aksiyonu</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV7.openReminderActionCount}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Hatırlatma sonrası tahsilat (30g)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV7.recoveredAfterReminder30d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Comeback fiyat sayfası (30g)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV7.comebackPricingViews30d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Grace kurtarma (bu ay)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV7.churnGraceSavesThisMonth}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="font-medium text-foreground mb-1">Yükseltme fırsatı (düşük plan + yüksek kullanım)</p>
              {metrics.founderSignalsV7.upgradeOpportunityTop.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">Eşik altı veya veri yok.</p>
              ) : (
                <ul className="space-y-0.5 text-[11px]">
                  {metrics.founderSignalsV7.upgradeOpportunityTop.map((u) => (
                    <li key={u.companyId} className="flex justify-between gap-2">
                      <span className="truncate">{u.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        skor {u.upsellScore}
                        {u.planLimitPressurePct != null ? ` · limit %${u.planLimitPressurePct}` : ""} · {u.planSlug}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="font-medium text-foreground mb-1">Düşük planda etkileşimli (yükseltme adayı)</p>
              {(metrics.founderSignalsV7.engagedLowPlanCandidates ?? []).length === 0 ? (
                <p className="text-muted-foreground text-[11px]">Eşik altı veya veri yok.</p>
              ) : (
                <ul className="space-y-0.5 text-[11px]">
                  {(metrics.founderSignalsV7.engagedLowPlanCandidates ?? []).map((u) => (
                    <li key={u.companyId} className="flex justify-between gap-2">
                      <span className="truncate">{u.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        skor {u.engagementScore}
                        {u.planLimitPressurePct != null ? ` · limit %${u.planLimitPressurePct}` : ""} · {u.sales30d} sat · {u.productCount} ürün
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="font-medium text-foreground mb-1">Satıcı hacim lideri (90g teklif kararı)</p>
              {metrics.founderSignalsV7.sellerLeaderboardByVolume.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">Veri yok.</p>
              ) : (
                <ul className="space-y-0.5 text-[11px]">
                  {metrics.founderSignalsV7.sellerLeaderboardByVolume.slice(0, 6).map((s) => (
                    <li key={s.sellerCompanyId} className="flex justify-between gap-2">
                      <span className="truncate">{s.sellerName}</span>
                      <span className="tabular-nums shrink-0 text-muted-foreground">{s.decidedCount} karar · %{s.acceptancePct}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {metrics.founderSignalsV7.growthHotspots.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Büyüme sıcak noktaları (7g satış)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {metrics.founderSignalsV7.growthHotspots.map((g) => (
                  <li key={g.companyId}><span className="text-foreground">{g.name}</span> · {g.salesLast7Days}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV8 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Haftalık icra panosu (v8)
          </p>
          <p className="text-[11px] text-muted-foreground">{metrics.founderSignalsV8.weeklyExecutionDigest}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Tahsilat (bu hafta, gecikmiş→ödendi TRY)</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV8.moneyRecoveredOverdueTryThisWeek)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Checkout başlangıcı (bu ay)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV8.billingCheckoutStartsThisMonth}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Başarılı ödeme dönüşü (bu ay)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV8.billingPaidSuccessThisMonth}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Grace kurtarma (bu ay)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV8.churnGraceSavesThisMonth}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <p className="font-medium text-foreground">Aksiyon skoru</p>
              <p className="text-muted-foreground">
                Tahsilat açık: <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.collectionActionsOpen}</span>
                {" · "}7g iletişim: <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.collectionContacted7d}</span>
                {" · "}7g çözüldü: <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.collectionResolved7d}</span>
              </p>
              <p className="text-muted-foreground">
                B2B bekleyen (3+g): <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.b2bQuotesStuckPending3dPlus}</span>
                {" · "}(7+g): <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.b2bQuotesStuckPending7dPlus}</span>
              </p>
              <p className="text-muted-foreground">
                İzlenen yükseltme adayı: <span className="text-foreground font-mono">{metrics.founderSignalsV8.weeklyActionScoreboard.trackedUpgradeLeads}</span>
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <p className="font-medium text-foreground">Tahsilat aksiyon sonuçları (30g)</p>
              <p className="text-muted-foreground tabular-nums">
                Çözüldü {metrics.founderSignalsV8.collectionOutcomes30d.resolved}
                {" · "}Kapatıldı {metrics.founderSignalsV8.collectionOutcomes30d.dismissed}
                {" · "}Ertelendi {metrics.founderSignalsV8.collectionOutcomes30d.snoozed}
              </p>
              <p className="text-amber-800 dark:text-amber-200">
                14+ gün iletişimde, yanıt yok: {metrics.founderSignalsV8.collectionOutcomes30d.contactedStale14d}
              </p>
              {metrics.founderSignalsV8.openReminderActionsByTier.length > 0 && (
                <p className="text-muted-foreground">
                  Açık kuyruk kademe:{" "}
                  {metrics.founderSignalsV8.openReminderActionsByTier.map((t) => (
                    <span key={t.tier || "—"} className="font-mono text-foreground/90 ml-1">{t.tier}:{t.count}</span>
                  ))}
                </p>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <p className="font-medium text-foreground">Üst risk (vadesi geçmiş tahsilat)</p>
              {metrics.founderSignalsV8.topRiskTenants.length === 0 ? (
                <p className="text-muted-foreground">Öncelik listesi boş.</p>
              ) : (
                <ul className="space-y-0.5">
                  {metrics.founderSignalsV8.topRiskTenants.map((r) => (
                    <li key={r.companyId} className="flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">{fmtTRY(r.overdueTry)} · {r.oldestDueDays}g</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {metrics.founderSignalsV8.growthOpportunityLabels.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Büyüme / yükseltme fırsat özeti</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/90">
                {metrics.founderSignalsV8.growthOpportunityLabels.map((label, i) => (
                  <li key={i}>{label}</li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderSignalsV8.b2bStuckQuoteSamples.length > 0 || metrics.founderSignalsV8.b2bSellersMostStuckPending.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
              {metrics.founderSignalsV8.b2bStuckQuoteSamples.length > 0 && (
                <div className="rounded-md border border-dashed p-2">
                  <p className="font-medium text-foreground mb-1">B2B bekleyen teklif (3+ gün, örnek)</p>
                  <ul className="space-y-1">
                    {metrics.founderSignalsV8.b2bStuckQuoteSamples.map((s) => (
                      <li key={s.requestId} className="text-muted-foreground">
                        <span className="font-mono text-foreground">{s.code}</span>
                        {" · "}{s.ageDays}g · {s.sellerName} ← {s.buyerName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {metrics.founderSignalsV8.b2bSellersMostStuckPending.length > 0 && (
                <div className="rounded-md border border-dashed p-2">
                  <p className="font-medium text-foreground mb-1">En çok bekleyen satıcı (3+ gün)</p>
                  <ul className="space-y-0.5">
                    {metrics.founderSignalsV8.b2bSellersMostStuckPending.map((s) => (
                      <li key={s.sellerCompanyId} className="flex justify-between gap-2">
                        <span className="truncate">{s.sellerName}</span>
                        <span className="shrink-0 font-mono tabular-nums">{s.stuckPending3dPlus}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV9 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Strateji ve önerilen aksiyonlar (v9)
          </p>
          <p className="text-[11px] text-muted-foreground">{metrics.founderSignalsV9.strategicDigestV9}</p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">plan_upgraded (30g)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV9.planUpgradedEvents30d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">plan_upgraded (bu ay)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV9.planUpgradedEventsThisMonth}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">B2B ilk yanıt medyanı (saat, 90g)</p>
              <p className="text-lg font-bold tabular-nums">
                {metrics.founderSignalsV9.b2bGlobalMedianFirstResponseHours ?? "—"}
              </p>
            </div>
          </div>
          {metrics.founderSignalsV9.planUpgradeDestinationsMonth.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Bu ay plan hedefleri (plan_upgraded)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono">
                {metrics.founderSignalsV9.planUpgradeDestinationsMonth.map((p) => (
                  <li key={p.planSlug}>{p.planSlug}: {p.count}</li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderSignalsV9.planUpgradeSourceBreakdown30d?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">plan_upgraded kaynağı (30g)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono">
                {metrics.founderSignalsV9.planUpgradeSourceBreakdown30d!.map((s) => (
                  <li key={s.source}>{s.source}: {s.count}</li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV9.b2bSlowestMedianResponseSellers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">B2B en yavaş ilk yanıt (medyan saat, 90g)</p>
              <ul className="space-y-0.5 text-[11px]">
                {metrics.founderSignalsV9.b2bSlowestMedianResponseSellers.map((s) => (
                  <li key={s.sellerCompanyId} className="flex justify-between gap-2">
                    <span className="truncate">{s.sellerName}</span>
                    <span className="shrink-0 font-mono tabular-nums">{s.medianFirstResponseHours} sa</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV9.todayRecommendedActions.length > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
              <p className="text-xs font-medium text-foreground mb-1">Bugün odak</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-foreground/90">
                {metrics.founderSignalsV9.todayRecommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV10 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Founder cockpit (v10)
          </p>
          <div className="rounded-md border bg-muted/20 p-2 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Günlük CEO özeti</p>
            <p className="text-xs text-foreground/90 leading-relaxed">{metrics.founderSignalsV10.dailyCeoBriefing}</p>
          </div>
          <div className="rounded-md border p-2 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Haftalık yönetici özeti</p>
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {metrics.founderSignalsV10.weeklyExecutiveDigest}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Para riski</p>
              <p className="text-foreground/90 leading-snug">{metrics.founderSignalsV10.moneyRiskMapLine}</p>
            </div>
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Büyüme</p>
              <p className="text-foreground/90 leading-snug">{metrics.founderSignalsV10.growthMapLine}</p>
            </div>
          </div>
          {(metrics.founderSignalsV10.whatToDoNext?.length ?? 0) > 0 && (
            <div className="rounded-md border border-primary/25 bg-primary/5 p-2">
              <p className="text-xs font-medium text-foreground mb-1">Sıradaki 5 aksiyon</p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-foreground/90">
                {metrics.founderSignalsV10.whatToDoNext.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>
          )}
          {(metrics.founderSignalsV10.recommendationsV2?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">ROI sıralı öneriler (v2)</p>
              <ul className="space-y-2 text-[11px]">
                {metrics.founderSignalsV10.recommendationsV2.map((r) => (
                  <li key={r.id} className="rounded-md border bg-muted/20 p-2 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">{r.headline}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">ROI {r.roiScore}</span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">{r.rationale}</p>
                    <div className="flex flex-wrap gap-1">
                      {r.badges.map((b) => (
                        <span key={b} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono border">{b}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderSignalsV10.collectionRecoverabilityPreview?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Tahsilat: ödeme olasılığı (önizleme)</p>
              <ul className="space-y-1 text-[11px]">
                {metrics.founderSignalsV10.collectionRecoverabilityPreview.map((c) => (
                  <li key={c.companyId} className="space-y-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="font-mono tabular-nums shrink-0 text-muted-foreground">{c.payProbability0to100}/100</span>
                    </div>
                    <p className="text-muted-foreground text-[10px] leading-relaxed">{c.basis}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderSignalsV10.planUpgradeSourceBreakdown30d?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Yükseltme kaynağı (30g, v10)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono">
                {metrics.founderSignalsV10.planUpgradeSourceBreakdown30d.map((s) => (
                  <li key={s.source}>{s.source}: {s.count}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderSignalsV11 && metrics.founderSignalsV11.dailyCeoBriefing && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Radar className="h-4 w-4 text-violet-600" />
            Founder cockpit (v11) — radar + kurul özeti
          </p>
          <div className="rounded-md border bg-card p-2 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">CEO brifing (v11)</p>
            <p className="text-xs text-foreground/90 leading-relaxed">{metrics.founderSignalsV11.dailyCeoBriefing}</p>
          </div>
          <div className="rounded-md border bg-muted/15 p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Haftalık kurul özeti</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{metrics.founderSignalsV11.weeklyBoardSummary}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div className="rounded-md border px-2 py-2 space-y-1">
              <p className="font-medium text-foreground">Risk radar · {metrics.founderSignalsV11.riskRadar.level}</p>
              <p className="text-muted-foreground leading-snug">{metrics.founderSignalsV11.riskRadar.summary}</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {metrics.founderSignalsV11.riskRadar.signals.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border px-2 py-2 space-y-1">
              <p className="font-medium text-foreground">Büyüme radar · {metrics.founderSignalsV11.growthRadar.level}</p>
              <p className="text-muted-foreground leading-snug">{metrics.founderSignalsV11.growthRadar.summary}</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {metrics.founderSignalsV11.growthRadar.signals.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border px-2 py-2 space-y-1">
              <p className="font-medium text-foreground">Nakit radar · {metrics.founderSignalsV11.cashRadar.level}</p>
              <p className="text-muted-foreground leading-snug">{metrics.founderSignalsV11.cashRadar.summary}</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {metrics.founderSignalsV11.cashRadar.signals.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
          {(metrics.founderSignalsV11.top3MovesThisWeek?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Bu hafta top 3 hamle (Copilot)</p>
              <ul className="space-y-2 text-[11px]">
                {metrics.founderSignalsV11.top3MovesThisWeek.map((a) => (
                  <li key={a.id} className="rounded-md border bg-card p-2 space-y-1">
                    <span className="font-medium text-foreground">{a.headline}</span>
                    <p className="text-muted-foreground"><span className="text-foreground/80">Neden şimdi:</span> {a.whyNow}</p>
                    <p className="text-muted-foreground"><span className="text-foreground/80">Beklenen:</span> {a.expectedRoiBand}</p>
                    <p className="text-amber-800/90 dark:text-amber-200/90"><span className="font-medium">Yok sayılırsa:</span> {a.ifIgnored}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderSignalsV11.recommendedPlaybook?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Önerilen playbook</p>
              {metrics.founderSignalsV11.recommendedPlaybook.map((pb) => (
                <div key={pb.title} className="rounded-md border bg-muted/20 p-2">
                  <p className="text-xs font-semibold text-foreground">{pb.title}</p>
                  <ol className="list-decimal pl-4 mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {pb.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {metrics?.founderCopilotV1 && (metrics.founderCopilotV1.fastestWinToday || (metrics.founderCopilotV1.actions?.length ?? 0) > 0) && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Founder Copilot (v1)
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">En hızlı kazanım (bugün)</p>
              <p className="text-foreground/90 leading-snug">{metrics.founderCopilotV1.fastestWinToday || "—"}</p>
            </div>
            <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Bu haftanın büyüme bahsi</p>
              <p className="text-foreground/90 leading-snug">{metrics.founderCopilotV1.bestGrowthBetThisWeek}</p>
            </div>
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Bugünün en büyük riski</p>
              <p className="text-foreground/90 leading-snug">{metrics.founderCopilotV1.biggestRiskToday}</p>
            </div>
          </div>
          {(metrics.founderCopilotV1.actions?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Aksiyonlar (neden / ROI / yok sayma)</p>
              <ul className="space-y-2 text-[11px] max-h-64 overflow-y-auto">
                {metrics.founderCopilotV1.actions.map((a) => (
                  <li key={a.id} className="rounded-md border bg-muted/15 p-2 space-y-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-foreground">{a.headline}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{a.estimatedImpactTryBand}</span>
                    </div>
                    <p className="text-muted-foreground">{a.whyNow}</p>
                    <p className="text-muted-foreground">{a.expectedRoiBand}</p>
                    <p className="text-amber-900/85 dark:text-amber-100/85">{a.ifIgnored}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderOvernightPackV1 && (
        <div className="rounded-lg border border-slate-500/20 bg-slate-500/[0.03] p-4 space-y-3 max-h-[min(80vh,720px)] overflow-y-auto">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Executive overnight pack (v1)
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {metrics.founderOvernightPackV1.executiveAttentionV1.founderAttentionLine}
          </p>
          <div className="grid gap-2 lg:grid-cols-2 text-xs">
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">Plan yükseltme ROI (30g, heuristik)</p>
              <p className="text-muted-foreground tabular-nums">
                Olay: {metrics.founderOvernightPackV1.planUpgradeRoiBoardV1.eventsInWindow} · Tahmini MRR Δ:{" "}
                {fmtTRY(metrics.founderOvernightPackV1.planUpgradeRoiBoardV1.estimatedMrrDeltaTryFromUpgrades)}/ay
              </p>
              <ul className="font-mono text-[10px] text-muted-foreground space-y-0.5">
                {metrics.founderOvernightPackV1.planUpgradeRoiBoardV1.byDestinationPlan.slice(0, 5).map((x) => (
                  <li key={x.planSlug}>{x.planSlug}: {x.count} → ~{fmtTRY(x.estimatedMrrDeltaTry)}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">MRR öngörü (basit)</p>
              <p className="text-muted-foreground tabular-nums">
                30g: {fmtTRY(metrics.founderOvernightPackV1.revenueForecastsV1.mrrForecast30dTry)} · 90g:{" "}
                {fmtTRY(metrics.founderOvernightPackV1.revenueForecastsV1.mrrForecast90dTry)}
              </p>
              <p className="text-[10px] text-muted-foreground">{metrics.founderOvernightPackV1.revenueForecastsV1.narrative}</p>
            </div>
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">Tahsilat tahtası v2</p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {metrics.founderOvernightPackV1.collectionsBoardV2.weeklyCollectionDigestLine}
              </p>
              <p className="text-[10px] tabular-nums">
                7g vade: {fmtTRY(metrics.founderOvernightPackV1.collectionsBoardV2.cashDueNext7dTry)} · 30g vade:{" "}
                {fmtTRY(metrics.founderOvernightPackV1.collectionsBoardV2.cashDueNext30dTry)} · Gecikmiş:{" "}
                {fmtTRY(metrics.founderOvernightPackV1.collectionsBoardV2.overduePendingTotalTry)}
              </p>
            </div>
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">Huni / düşüş</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                Checkout {metrics.founderOvernightPackV1.funnelHygieneV1.checkoutStartedThisMonth} · Ödeme{" "}
                {metrics.founderOvernightPackV1.funnelHygieneV1.billingPaidThisMonth} · Hata{" "}
                {metrics.founderOvernightPackV1.funnelHygieneV1.billingErrorThisMonth} · Düşüş %{" "}
                {metrics.founderOvernightPackV1.funnelHygieneV1.checkoutDropOffPct}
                {" · "}return_redirect {metrics.founderOvernightPackV1.funnelHygieneV1.billingReturnRedirectErrorsThisMonth ?? 0}
                {" · "}topup_fail {metrics.founderOvernightPackV1.funnelHygieneV1.billingTopupFailedThisMonth ?? 0}
              </p>
            </div>
          </div>
          {(metrics.founderOvernightPackV1.executiveAttentionV1.top10AccountsToCall?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Aranacak üst 10 hesap (skor)</p>
              <ul className="text-[11px] space-y-0.5">
                {metrics.founderOvernightPackV1.executiveAttentionV1.top10AccountsToCall.map((a) => (
                  <li key={a.companyId} className="flex justify-between gap-2 font-mono">
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-muted-foreground">{a.tag} · {a.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderIntelligenceV2 && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-indigo-600" />
            Founder Intelligence (v2)
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{metrics.founderIntelligenceV2.moneyDueSoonLine}</p>
          <p className="text-[10px] tabular-nums text-muted-foreground">
            7g: {fmtTRY(metrics.founderIntelligenceV2.moneyDueSoonTry7d)} · 30g: {fmtTRY(metrics.founderIntelligenceV2.moneyDueSoonTry30d)}
          </p>
          {(metrics.founderIntelligenceV2.dailyPriorities?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Günlük öncelikler</p>
              <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-foreground/90">
                {metrics.founderIntelligenceV2.dailyPriorities.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </div>
          )}
          {(metrics.founderIntelligenceV2.hiddenRisks?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Gizli / ikincil riskler</p>
              <ul className="list-disc pl-4 text-[11px] text-amber-900/90 dark:text-amber-100/80 space-y-0.5">
                {metrics.founderIntelligenceV2.hiddenRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
            {(metrics.founderIntelligenceV2.easiestWins?.length ?? 0) > 0 && (
              <div className="rounded-md border bg-card p-2">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">En kolay kazanımlar</p>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  {metrics.founderIntelligenceV2.easiestWins.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {(metrics.founderIntelligenceV2.topOpportunities?.length ?? 0) > 0 && (
              <div className="rounded-md border bg-card p-2">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Üst fırsatlar</p>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  {metrics.founderIntelligenceV2.topOpportunities.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {(metrics.founderIntelligenceV2.watchlistAccounts?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">İzleme listesi</p>
              <ul className="text-[11px] space-y-1">
                {metrics.founderIntelligenceV2.watchlistAccounts.map((w) => (
                  <li key={`${w.companyId}-${w.reason}`} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1 last:border-0">
                    <span className="truncate">{w.name}</span>
                    <span className="shrink-0 text-muted-foreground font-mono text-[10px]">{w.reason} · {w.score0to100}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.founderIntelligenceV2.recommendedActions?.length ?? 0) > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
              <p className="text-xs font-medium text-foreground mb-1">Önerilen aksiyonlar</p>
              <ul className="list-disc pl-4 text-[11px] text-foreground/90 space-y-0.5">
                {metrics.founderIntelligenceV2.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.founderIntelligenceV3 && (metrics.founderIntelligenceV3.rankedDailyActions?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.04] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Founder Intelligence (v3 — günlük aksiyon skoru)
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">{metrics.founderIntelligenceV3.generatedAtIso}</p>
          <p className="text-[11px] text-muted-foreground">{metrics.founderIntelligenceV3.scoringNote}</p>
          <p className="text-xs text-foreground/90 leading-snug">{metrics.founderIntelligenceV3.rollupLine}</p>
          <ul className="space-y-2 text-[11px] max-h-72 overflow-y-auto">
            {metrics.founderIntelligenceV3.rankedDailyActions.map((a) => (
              <li key={a.id} className="rounded-md border bg-card p-2 space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-foreground">{a.headline}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {a.totalScore0to100}/100 · {a.source}
                  </span>
                </div>
                <ul className="list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">
                  {a.drivers.map((d, i) => (
                    <li key={i}>{d.label}: +{d.points}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {metrics?.churnPreventionBundleV1 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600" />
            Churn önleme (bundle v1)
          </p>
          <p className="text-xs text-foreground/90 leading-snug">{metrics.churnPreventionBundleV1.bundleHeadline}</p>
          <p className="text-[10px] tabular-nums text-muted-foreground">
            Grace risk MRR sinyali: {fmtTRY(metrics.churnPreventionBundleV1.churnRiskMrrTry)}/ay · Tahmini iptal MRR (30g):{" "}
            {fmtTRY(metrics.churnPreventionBundleV1.estimatedMrrLostToChurn30dTry)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">Rescue hunisi (sinyal)</p>
              <p className="text-muted-foreground tabular-nums">
                Hatırlatma sonrası tahsil (30g): {metrics.churnPreventionBundleV1.rescueFunnelSignals.recoveredAfterReminder30d} ·
                Comeback görüntü: {metrics.churnPreventionBundleV1.rescueFunnelSignals.comebackPricingViews30d} ·
                Rescue tık: {metrics.churnPreventionBundleV1.rescueFunnelSignals.comebackOfferClicks30d} ·
                Grace save (ay): {metrics.churnPreventionBundleV1.rescueFunnelSignals.churnGraceSavesThisMonth}
              </p>
              <p className="text-muted-foreground tabular-nums text-[10px]">
                İptal kurtarma görüntü (30g): {metrics.churnPreventionBundleV1.rescueFunnelSignals.cancelRescueViews30d} ·
                Onaylı iptal (30g): {metrics.churnPreventionBundleV1.rescueFunnelSignals.cancelConfirmed30d}
              </p>
            </div>
            <div className="rounded-md border bg-card p-2 space-y-1">
              <p className="font-medium text-foreground">İptal nedeni (30g)</p>
              <ul className="font-mono text-[10px] text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                {metrics.churnPreventionBundleV1.cancelReasons30d.slice(0, 8).map((r) => (
                  <li key={r.reason}>{r.reason}: {r.count}</li>
                ))}
              </ul>
            </div>
          </div>
          {(metrics.churnPreventionBundleV1.saveTriggers?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Save tetikleyicileri</p>
              <ul className="list-disc pl-4 text-[11px] text-amber-900/85 dark:text-amber-100/80 space-y-0.5">
                {metrics.churnPreventionBundleV1.saveTriggers.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.churnPreventionBundleV1.silentChurnWatchlist?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sessiz churn izleme</p>
              <ul className="text-[11px] space-y-1 max-h-40 overflow-y-auto">
                {metrics.churnPreventionBundleV1.silentChurnWatchlist.map((w) => (
                  <li key={w.companyId} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1 last:border-0">
                    <span className="truncate">{w.name}</span>
                    <span className="shrink-0 text-muted-foreground font-mono text-[10px]">{w.reason} · satış30g {w.sales30d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.churnPreventionBundleV1.consolidatedPlaybook?.length ?? 0) > 0 && (
            <div className="rounded-md border border-primary/15 bg-primary/5 p-2">
              <p className="text-xs font-medium text-foreground mb-1">Mini playbook</p>
              <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-0.5">
                {metrics.churnPreventionBundleV1.consolidatedPlaybook.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {metrics?.b2bOpsBundleV1 && (
        <div className="rounded-lg border border-sky-600/20 bg-sky-600/[0.04] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-sky-600" />
            B2B operasyon (bundle v1)
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{metrics.b2bOpsBundleV1.digestLine}</p>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-muted-foreground">
            {metrics.b2bOpsBundleV1.pendingQuoteAgingBuckets.map((b) => (
              <span key={b.bucket} className="rounded border bg-card px-2 py-0.5">{b.bucket}: {b.count}</span>
            ))}
          </div>
          {(metrics.b2bOpsBundleV1.sellerQuoteAcceptanceLeaders?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Satıcı kabul oranı (üst örnek)</p>
              <ul className="text-[11px] space-y-0.5 max-h-32 overflow-y-auto">
                {metrics.b2bOpsBundleV1.sellerQuoteAcceptanceLeaders.map((s) => (
                  <li key={s.sellerCompanyId} className="flex justify-between gap-2">
                    <span className="truncate">{s.sellerName}</span>
                    <span className="shrink-0 font-mono">%{s.acceptanceRate} ({s.acceptedCount}/{s.decidedCount})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.b2bOpsBundleV1.repeatBuyerRelationships?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Tekrar alan alıcı → satıcı (90g, ≥2 kabul)</p>
              <ul className="text-[11px] space-y-1 max-h-36 overflow-y-auto">
                {metrics.b2bOpsBundleV1.repeatBuyerRelationships.map((r) => (
                  <li key={`${r.buyerCompanyId}-${r.sellerCompanyId}`} className="rounded-md bg-muted/25 px-2 py-1">
                    <span className="font-medium">{r.buyerName}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{r.sellerName}</span>
                    <span className="text-muted-foreground font-mono text-[10px] ml-2">×{r.acceptedQuotesInWindow}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.b2bOpsBundleV1.coachingHints?.length ?? 0) > 0 && (
            <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
              {metrics.b2bOpsBundleV1.coachingHints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {metrics?.revenueEngineBundleV1 && (
        <div className="rounded-lg border border-emerald-600/20 bg-emerald-600/[0.04] p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-emerald-600" />
            Revenue Engine (bundle v1)
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{metrics.revenueEngineBundleV1.bundleNarrative}</p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md border bg-card p-2">
              <p className="font-medium text-foreground mb-1">Öngörü (TRY)</p>
              <p className="tabular-nums text-muted-foreground">30g: {fmtTRY(metrics.revenueEngineBundleV1.forecast30dTry)} · 90g: {fmtTRY(metrics.revenueEngineBundleV1.forecast90dTry)}</p>
            </div>
            <div className="rounded-md border bg-card p-2">
              <p className="font-medium text-foreground mb-1">Kayıp gelir haritası (yaklaşık)</p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                {metrics.revenueEngineBundleV1.lostRevenueMap.map((x) => (
                  <li key={x.bucket}>{x.bucket}: {fmtTRY(x.approxTry)} — {x.note}</li>
                ))}
              </ul>
            </div>
          </div>
          {(metrics.revenueEngineBundleV1.pricingPathWinners?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Kazanan fiyatlandırma yolları</p>
              <ul className="text-[11px] font-mono flex flex-wrap gap-x-3 gap-y-1">
                {metrics.revenueEngineBundleV1.pricingPathWinners.map((p) => (
                  <li key={p.pageOrLabel}>{p.pageOrLabel}: {p.paidSuccessCount30d}</li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.revenueEngineBundleV1.comebackWinners?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Comeback / grace kazananları</p>
              <ul className="space-y-1 text-[11px]">
                {metrics.revenueEngineBundleV1.comebackWinners.map((c, i) => (
                  <li key={i} className="rounded-md bg-muted/30 px-2 py-1">
                    <span className="font-medium text-foreground">{c.headline}</span>
                    <span className="text-muted-foreground ml-2">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(metrics?.billingMetricsPerformanceBundleV1 || metrics?.docsPlaybooksBundleV1) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {metrics?.billingMetricsPerformanceBundleV1 && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Performans (metrik endpoint)
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Sunucu süresi: {metrics.billingMetricsPerformanceBundleV1.serverDurationMs} ms · Founder pack paralel slot:{" "}
                {metrics.billingMetricsPerformanceBundleV1.parallelSqlSlotsFounderPack} · B2B ek sorgu:{" "}
                {metrics.billingMetricsPerformanceBundleV1.supplementalSqlSlotsB2b} · Önerilen staleTime:{" "}
                {metrics.billingMetricsPerformanceBundleV1.clientStaleTimeSuggestionSeconds}s
              </p>
              <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
                {metrics.billingMetricsPerformanceBundleV1.healthNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {metrics?.docsPlaybooksBundleV1 && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                Dokümantasyon / playbook indeksi
              </p>
              <ul className="text-[11px] space-y-1">
                {metrics.docsPlaybooksBundleV1.docIndex.map((d) => (
                  <li key={d.path} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{d.title}</span>
                    <span className="block text-[10px] font-mono">{d.path}</span>
                    <span className="block">{d.oneLiner}</span>
                  </li>
                ))}
              </ul>
              {(metrics.docsPlaybooksBundleV1.mirroredBoardPlaybooks?.length ?? 0) > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Board&apos;dan yansıyan playbook</p>
                  <ul className="space-y-2 text-[11px]">
                    {metrics.docsPlaybooksBundleV1.mirroredBoardPlaybooks.map((p, i) => (
                      <li key={i} className="rounded-md bg-muted/20 p-2">
                        <p className="font-medium text-foreground">{p.title}</p>
                        <ol className="list-decimal pl-4 text-muted-foreground mt-1 space-y-0.5">
                          {p.steps.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </ol>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {metrics?.expansionEngineV1 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Expansion motoru (v1)
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{metrics.expansionEngineV1.expansionTimingLine}</p>
          {(metrics.expansionEngineV1.warmAccountsToContact?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sıcak arama listesi</p>
              <ul className="space-y-1 text-[11px]">
                {metrics.expansionEngineV1.warmAccountsToContact.map((w) => (
                  <li key={w.companyId} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1 last:border-0">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-muted-foreground font-mono">{w.reasonTag} · {w.priority0to100}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.expansionEngineV1.upgradeProbabilityTop?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Yükseltme olasılığı (heuristik)</p>
              <ul className="space-y-1 text-[11px]">
                {metrics.expansionEngineV1.upgradeProbabilityTop.map((u) => (
                  <li key={u.companyId} className="flex flex-wrap justify-between gap-2">
                    <span className="truncate">{u.name}</span>
                    <span className="font-mono tabular-nums shrink-0">%{u.upgradeProbability0to100}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(metrics.expansionEngineV1.planMismatchHints?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Plan uyumsuzluğu ipuçları</p>
              <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
                {metrics.expansionEngineV1.planMismatchHints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {metrics?.revenueAttributionV2 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Gelir atfedilmesi (v2)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Kayıt → ilk ödeme (medyan gün)</p>
              <p className="text-lg font-bold tabular-nums">
                {metrics.revenueAttributionV2.medianDaysSignupToFirstBillingSuccess ?? "—"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Trial dokunuş → 30g ödeme</p>
              <p className="text-lg font-bold tabular-nums">
                %{metrics.revenueAttributionV2.trialCohortPaidConversionPct}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  ({metrics.revenueAttributionV2.trialTouchAndBillingPaid30d}/{metrics.revenueAttributionV2.trialTouchCompanies30d} firma)
                </span>
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Grace kurtarma görüntü → yeniden aktivasyon</p>
              <p className="text-lg font-bold tabular-nums">
                %{metrics.revenueAttributionV2.graceComebackConversionPct}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  ({metrics.revenueAttributionV2.graceViewAndReactivateCompanies30d}/{metrics.revenueAttributionV2.graceRescueViewCompanies30d})
                </span>
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">Checkout → ödeme (bu ay %)</p>
              <p className="text-lg font-bold tabular-nums">{metrics.revenueAttributionV2.checkoutToPaidRateThisMonthPct}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-2">
              <p className="text-muted-foreground">plan_upgraded (önceki 30g / son 30g)</p>
              <p className="text-lg font-bold tabular-nums">
                {metrics.revenueAttributionV2.planUpgradedEventsPrev30d} / {metrics.revenueAttributionV2.planUpgradedEventsLast30d}
              </p>
            </div>
          </div>
          {(metrics.revenueAttributionV2.billingPaidSuccessByPage30d?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Ödeme başarısı sayfa (30g, props.page)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono">
                {metrics.revenueAttributionV2.billingPaidSuccessByPage30d.map((p) => (
                  <li key={p.page}>{p.page}: {p.count}</li>
                ))}
              </ul>
            </div>
          )}
          {metrics?.revenueAttributionV3 && (
            <div className="rounded-md border border-dashed border-primary/25 bg-primary/[0.02] p-2 space-y-2 mt-2">
              <p className="text-xs font-semibold text-foreground">v3 derinlik (UTM / plan / ay)</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Canlı ödemeler (bu ay)</p>
                  <p className="font-mono text-foreground">
                    {metrics.revenueAttributionV3.livePaymentsThisMonth?.paidCount ?? 0} adet · {fmtTRY(metrics.revenueAttributionV3.livePaymentsThisMonth?.paidAmountTry ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Kimlik kapısı (bu ay)</p>
                  <p className="font-mono text-foreground">
                    VKN/TCKN gösterim {metrics.revenueAttributionV3.identityGateThisMonth?.shownCount ?? 0} · kaydet {metrics.revenueAttributionV3.identityGateThisMonth?.savedCount ?? 0}
                    {" · "}GSM gösterim {metrics.revenueAttributionV3.identityGateThisMonth?.phoneShownCount ?? 0} · kaydet {metrics.revenueAttributionV3.identityGateThisMonth?.phoneSavedCount ?? 0}
                    {" · "}checkout_failed {metrics.revenueAttributionV3.identityGateThisMonth?.checkoutFailedCount ?? 0}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Return / topup (bu ay, funnel)</p>
                  <p className="font-mono text-foreground">
                    billing_return_redirect_error {metrics.revenueAttributionV3.billingReturnRedirectErrorsThisMonth ?? 0}
                    {" · "}billing_topup_failed {metrics.revenueAttributionV3.billingTopupFailedThisMonth ?? 0}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-2">
                  <p className="text-muted-foreground">Ödeme hata kümeleri (30g)</p>
                  <ul className="font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                    {(metrics.revenueAttributionV3.paymentFailureClusters30d ?? []).length === 0
                      ? <li className="text-muted-foreground">—</li>
                      : (metrics.revenueAttributionV3.paymentFailureClusters30d ?? []).map((x) => (
                        <li key={x.errorCode}>{x.errorCode}: {x.count}</li>
                      ))}
                  </ul>
                </div>
              </div>
              {(metrics.billingPaymentsRevenueV1 || metrics.billingReliabilityAutomationV1) && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px] mt-2">
                  {metrics.billingPaymentsRevenueV1 && (
                    <div className="rounded-md border bg-muted/30 px-2 py-2 sm:col-span-1">
                      <p className="text-muted-foreground font-medium mb-1">Gelir ayrımı (payments, bu ay succeeded)</p>
                      <p className="font-mono text-foreground">
                        Abonelik: {fmtTRY(metrics.billingPaymentsRevenueV1.subscriptionPaymentsTryThisMonth)}
                        <span className="text-muted-foreground"> ({metrics.billingPaymentsRevenueV1.subscriptionPaymentCountThisMonth} işlem)</span>
                      </p>
                      <p className="font-mono text-foreground mt-0.5">
                        Kontör top-up: {fmtTRY(metrics.billingPaymentsRevenueV1.topupPaymentsTryThisMonth)}
                        <span className="text-muted-foreground"> ({metrics.billingPaymentsRevenueV1.topupPaymentCountThisMonth} işlem)</span>
                      </p>
                      <p className="text-muted-foreground mt-1.5 leading-snug">
                        90g top-up tekrarı (≥2 başarılı / firma):{" "}
                        <span className="font-mono text-foreground">{metrics.billingPaymentsRevenueV1.topupRepeaters90d}</span>
                        {" · "}aktif planda top-up yapan firma:{" "}
                        <span className="font-mono text-foreground">{metrics.billingPaymentsRevenueV1.topupAmongActivePlanCompanies90d}</span>
                      </p>
                    </div>
                  )}
                  {metrics.billingReliabilityAutomationV1 && (
                    <>
                      <div
                        className={`rounded-md border px-2 py-2 ${
                          metrics.billingReliabilityAutomationV1.returnRedirectSpike7d
                            ? "border-destructive/40 bg-destructive/5"
                            : "bg-muted/30"
                        }`}
                      >
                        <p className="text-muted-foreground font-medium mb-1">Return redirect (7g vs önceki 7g)</p>
                        <p className="font-mono">
                          {metrics.billingReliabilityAutomationV1.returnRedirectLast7d} / {metrics.billingReliabilityAutomationV1.returnRedirectPrev7d}
                          {metrics.billingReliabilityAutomationV1.returnRedirectSpike7d ? (
                            <span className="text-destructive font-semibold ml-1">SPIKE</span>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground mt-1 leading-snug">
                          İnceleme: <code className="text-[10px]">/api/billing/return</code>, imza başlığı, üretim host ↔ callbackUrl, <code className="text-[10px]">/odeme/sonuc</code>.
                        </p>
                      </div>
                      <div
                        className={`rounded-md border px-2 py-2 ${
                          metrics.billingReliabilityAutomationV1.topupFailFunnelSpike7d
                            ? "border-destructive/40 bg-destructive/5"
                            : "bg-muted/30"
                        }`}
                      >
                        <p className="text-muted-foreground font-medium mb-1">Top-up funnel hatası (7g vs önceki 7g)</p>
                        <p className="font-mono">
                          {metrics.billingReliabilityAutomationV1.topupFailFunnelLast7d} / {metrics.billingReliabilityAutomationV1.topupFailFunnelPrev7d}
                          {metrics.billingReliabilityAutomationV1.topupFailFunnelSpike7d ? (
                            <span className="text-destructive font-semibold ml-1">SPIKE</span>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground mt-1 leading-snug">
                          <code className="text-[10px]">billing_topup_failed</code> + payments <code className="text-[10px]">billing_cycle=topup</code> failed kümesi.
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/30 px-2 py-2 sm:col-span-2 lg:col-span-3">
                        <p className="text-muted-foreground font-medium mb-1">Top-up provider başarısız (30g, error_code)</p>
                        <ul className="font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                          {(metrics.billingReliabilityAutomationV1.topupProviderFailedByCode30d ?? []).length === 0
                            ? <li className="text-muted-foreground">—</li>
                            : (metrics.billingReliabilityAutomationV1.topupProviderFailedByCode30d ?? []).map((x) => (
                              <li key={x.code}>{x.code}: {x.count}</li>
                            ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
                <div>
                  <p className="text-muted-foreground mb-0.5">Ödeme başarısı UTM (30g)</p>
                  <ul className="font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                    {(metrics.revenueAttributionV3.billingPaidSuccessByUtm30d ?? []).map((u) => (
                      <li key={u.utmSource}>{u.utmSource}: {u.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Ödeme props.source (30g)</p>
                  <ul className="font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                    {(metrics.revenueAttributionV3.billingPaidSuccessByPropsSource30d ?? []).map((u) => (
                      <li key={u.source}>{u.source}: {u.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Grace görüntü kaynağı (30g)</p>
                  <ul className="font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                    {(metrics.revenueAttributionV3.graceRescueViewsBySource30d ?? []).map((u) => (
                      <li key={u.source}>{u.source}: {u.count}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Kayıt→ödeme medyan (gün) / plan</p>
                  <ul className="space-y-0.5">
                    {(metrics.revenueAttributionV3.medianDaysSignupToPaidByPlanSlug ?? []).map((p) => (
                      <li key={p.planSlug} className="font-mono">
                        {p.planSlug}: {p.medianDays}g <span className="text-muted-foreground">(n={p.sampleSize})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {(metrics.revenueAttributionV3.trialCohortByMonth?.length ?? 0) > 0 && (
                <div>
                  <p className="text-muted-foreground text-[11px] mb-0.5">Trial kohortu (ay bazlı, aynı ay ödeme)</p>
                  <ul className="text-[11px] font-mono space-y-0.5">
                    {metrics.revenueAttributionV3.trialCohortByMonth.map((m) => (
                      <li key={m.monthKey}>
                        {m.monthKey}: %{m.conversionPct} ({m.paidSameMonthCompanies}/{m.trialCompanies})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                pricing_view → 7g içinde ödeme: <span className="font-mono text-foreground">{metrics.revenueAttributionV3.pricingViewToPaidWithin7dCompanies30d}</span> firma
              </p>
              {(metrics.revenueAttributionV3.upsellConversionsByTrigger30d?.length ?? 0) > 0 && (
                <div>
                  <p className="text-muted-foreground text-[11px] mb-0.5">Yükseltme tetik kaynağı (30g)</p>
                  <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-mono">
                    {metrics.revenueAttributionV3.upsellConversionsByTrigger30d.map((t) => (
                      <li key={t.trigger}>{t.trigger}: {t.count}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(reminderActions?.actions?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Tahsilat aksiyon kuyruğu (açık kayıtlar)
          </p>
          <ul className="space-y-2 text-xs">
            {reminderActions!.actions.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-foreground">{a.companyName}</span>
                  <span className="text-muted-foreground ml-2 font-mono">{a.reminderTier}</span>
                  <span className="text-muted-foreground ml-2">{fmtTRY(a.overdueTrySnapshot)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" className="h-7 text-[11px]" disabled={patchReminderAction.isPending}
                    onClick={() => patchReminderAction.mutate({ id: a.id, status: "contacted" })}>İletişimde</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={patchReminderAction.isPending}
                    onClick={() => patchReminderAction.mutate({ id: a.id, status: "snoozed" })}>Ertele</Button>
                  <Button size="sm" variant="default" className="h-7 text-[11px]" disabled={patchReminderAction.isPending}
                    onClick={() => patchReminderAction.mutate({ id: a.id, status: "resolved" })}>Çözüldü</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {metrics?.founderSignalsV4 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Gelir & uyku (v4)
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Vadesi geçmiş bekleyen faturalar (TRY, toplam)</p>
              <p className="text-lg font-bold tabular-nums">{fmtTRY(metrics.founderSignalsV4.overduePendingInvoicesTotalTry)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Aktif abonelik, 30 gün satış yok</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV4.dormantActiveSubNoSales30d}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-2">
              <p className="text-muted-foreground">Bu ay yeni firma</p>
              <p className="text-lg font-bold tabular-nums">{metrics.founderSignalsV4.newCompaniesThisCalendarMonth}</p>
            </div>
          </div>
          {metrics.founderSignalsV4.funnelEventsTop7d.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Funnel olayları (7 gün, üst kalemler)</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-foreground/90">
                {metrics.founderSignalsV4.funnelEventsTop7d.map((e) => (
                  <li key={e.eventKey}>{e.eventKey}: <span className="tabular-nums">{e.count}</span></li>
                ))}
              </ul>
            </div>
          )}
          {metrics.founderSignalsV4.topDormantTenants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Çok ürün, 30 gün satış yok (aktif abonelik)</p>
              <ul className="space-y-1 text-xs">
                {metrics.founderSignalsV4.topDormantTenants.map((t) => (
                  <li key={t.companyId} className="flex justify-between gap-2">
                    <span className="truncate text-foreground" title={t.name}>{t.name}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{t.productCount} ürün</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Card key={l.href} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  {l.title}
                </CardTitle>
                <CardDescription className="text-xs">{l.desc}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href={l.href}>Aç</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Seçili funnel olayları <code className="text-[10px] bg-muted px-1 rounded">product_funnel_events</code> tablosunda; ayrıca loglarda{" "}
        <code className="text-[10px] bg-muted px-1 rounded">product_event</code> anahtarı kullanılabilir.
      </p>
    </div>
  );
}
