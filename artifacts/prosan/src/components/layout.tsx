import { Link, useLocation } from "wouter";
import { WelcomeTour } from "./welcome-tour";
import { useAuth } from "./auth-context";
import { useCompany } from "./company-context";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Building2,
  CreditCard,
  Clock,
  Sparkles,
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  X,
  ShieldOff,
  Building2 as BuildingLock,
} from "lucide-react";
import { useFeatures } from "@/components/use-features";
import { getNavLockReason, lockUiText, filterVisibleNavGroups, type AccountType, type LockReason } from "@/lib/nav-lock";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMenuPrefs } from "@/components/use-menu-prefs";
import { FeatureGate } from "@/components/feature-gate";
import { navItemId, navIdToTestSlug, NAV_GROUPS, type NavItem } from "@/components/nav-config";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "./notification-center";
import { GlobalSearch } from "./global-search";
import { QuickAction } from "./quick-action";
import { TrialBadge } from "./trial-badge";
import { DemoDataBanner } from "./demo-data-banner";
import { CommandPalette } from "./command-palette";
import { SetupChecklistPopover } from "./setup-checklist-popover";
import { QuickBarcodeFab } from "./quick-barcode-fab";
import { BrandLogo } from "./brand-logo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trackProductEvent } from "@/lib/product-analytics";
import { initialLetter } from "@/lib/display-initial";
import { cn } from "@/lib/utils";
import { prefetchNavHref } from "@/lib/nav-prefetch";

const TOP_ITEM: NavItem = {
  href: "/dashboard",
  label: "Ana Panel",
  icon: LayoutDashboard,
  roles: ["admin", "staff", "viewer", "super_admin"],
};

const HERO_ITEM: NavItem = {
  href: "/eticarium-merkezi",
  label: "Online Satış Merkezi",
  icon: Sparkles,
  roles: ["admin", "staff", "viewer"],
};

function resolveLayoutPageTitle(path: string, skipHeroAndTop: boolean): string {
  let bestHref = "";
  let bestLabel = "Ticarium365";
  const consider = (href: string, label: string) => {
    if (path === href || path.startsWith(href + "/")) {
      if (href.length >= bestHref.length) {
        bestHref = href;
        bestLabel = label;
      }
    }
  };
  if (!skipHeroAndTop) {
    consider(TOP_ITEM.href, TOP_ITEM.label);
    consider(HERO_ITEM.href, HERO_ITEM.label);
  }
  consider("/super-admin", "Platform merkezi");
  for (const g of NAV_GROUPS) {
    for (const i of g.items) consider(i.href, i.label);
  }
  return bestLabel;
}

function roleChipLabel(role: string): string {
  switch (role) {
    case "admin":
      return "Yönetici";
    case "staff":
      return "Personel";
    case "viewer":
      return "Görüntüleyici";
    case "super_admin":
      return "Süper Admin";
    default:
      return role;
  }
}

function useNavLayoutMedia() {
  const [state, setState] = useState({ desktopNav: true, wideSidebar: true });
  useEffect(() => {
    const q768 = window.matchMedia("(min-width: 768px)");
    const q1280 = window.matchMedia("(min-width: 1280px)");
    const sync = () =>
      setState({
        desktopNav: q768.matches,
        wideSidebar: q1280.matches,
      });
    sync();
    q768.addEventListener("change", sync);
    q1280.addEventListener("change", sync);
    return () => {
      q768.removeEventListener("change", sync);
      q1280.removeEventListener("change", sync);
    };
  }, []);
  return state;
}

function TrialBanner() {
  const { user } = useAuth();
  const { data: status } = usePaymentStatus();

  if (!user || user.role === "super_admin") return null;
  if (!status || status.planType !== "trial" || status.trialDaysLeft === null) return null;
  if (status.isTrialExpired) return null;

  const days = status.trialDaysLeft;
  const bg =
    days <= 3
      ? "var(--color-semantic-danger)"
      : days <= 7
        ? "var(--color-semantic-warning)"
        : "color-mix(in srgb, var(--color-semantic-info) 80%, var(--color-surface-card))";
  const fg =
    days <= 3
      ? "var(--color-semantic-danger-fg)"
      : days <= 7
        ? "var(--color-semantic-warning-fg)"
        : "var(--color-semantic-info-fg)";

  return (
    <div
      className="mx-3 mb-2 rounded-[var(--radius-lg)] px-3 py-2 text-xs"
      style={{ background: bg, color: fg }}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <Clock className="h-3 w-3 shrink-0" />
        Deneme süresi: {days} gün kaldı
      </div>
      {days <= 7 && (
        <p className="mt-0.5 opacity-90">
          Süre dolmadan uygun paketi seçebilir veya ekibimizle görüşebilirsiniz.
        </p>
      )}
    </div>
  );
}

const TRIAL_STRIP_DISMISS_KEY = "t365_trial_strip_dismiss";

function hashMsgKey(s: string) {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 120); i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

function RetentionHintBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const tracked = useRef(false);

  const { data } = useQuery<{
    message: string | null;
    ctaHref: string | null;
  }>({
    queryKey: ["dashboard", "retention-hint"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/retention-hint", { credentials: "include" });
      if (!r.ok) return { message: null, ctaHref: null };
      return r.json();
    },
    staleTime: 4 * 60 * 60 * 1000,
    enabled: !!user && user.role !== "super_admin" && ["admin", "staff"].includes(user.role),
  });

  useEffect(() => {
    const msg = data?.message;
    if (!msg) return;
    try {
      const k = `t365_retention_ok_${hashMsgKey(msg)}`;
      if (localStorage.getItem(k) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, [data?.message]);

  useEffect(() => {
    if (!data?.message || dismissed || tracked.current) return;
    tracked.current = true;
    trackProductEvent("retention_hint_view", {});
  }, [data?.message, dismissed]);

  if (!user || user.role === "super_admin" || !data?.message || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(`t365_retention_ok_${hashMsgKey(data.message!)}`, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-lg)] border px-3 py-2.5 text-sm"
      style={{
        borderColor: "color-mix(in srgb, var(--color-semantic-info) 35%, var(--color-border-subtle))",
        backgroundColor: "color-mix(in srgb, var(--color-semantic-info) 12%, var(--color-surface-card))",
        color: "var(--color-neutral-900)",
      }}
      data-testid="retention-hint-banner"
    >
      <p className="min-w-0 flex-1 leading-snug">{data.message}</p>
      <div className="flex shrink-0 items-center gap-2">
        {data.ctaHref ? (
          <Button variant="secondary" size="sm" className="h-8" asChild>
            <Link href={data.ctaHref} onClick={() => trackProductEvent("retention_hint_cta", { to: data.ctaHref ?? "" })}>
              Aç
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="h-8" type="button" onClick={dismiss}>
          Tamam
        </Button>
      </div>
    </div>
  );
}

function TrialReminderStrip() {
  const { user } = useAuth();
  const { data: status } = usePaymentStatus();
  const [dismissed, setDismissed] = useState(false);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!status?.trialEndsAt) return;
    try {
      const raw = localStorage.getItem(TRIAL_STRIP_DISMISS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as { until: number; trialEndsAt: string };
      if (o.trialEndsAt !== status.trialEndsAt) return;
      if (Date.now() < o.until) setDismissed(true);
    } catch {
      /* ignore */
    }
  }, [status?.trialEndsAt]);

  const days = status?.trialDaysLeft;
  const visible =
    !!user &&
    user.role !== "super_admin" &&
    status &&
    status.planType === "trial" &&
    !status.isTrialExpired &&
    days != null &&
    days <= 7 &&
    !dismissed;

  useEffect(() => {
    if (!visible || trackedRef.current) return;
    trackedRef.current = true;
    trackProductEvent("trial_layout_strip_view", { days_left: days ?? -1 });
  }, [visible, days]);

  if (!visible) return null;

  const dismiss = () => {
    if (status?.trialEndsAt) {
      try {
        localStorage.setItem(
          TRIAL_STRIP_DISMISS_KEY,
          JSON.stringify({ until: Date.now() + 12 * 3600 * 1000, trialEndsAt: status.trialEndsAt }),
        );
      } catch {
        /* ignore */
      }
    }
    setDismissed(true);
  };

  const urgent = (days ?? 8) <= 3;
  const borderColor = urgent
    ? "color-mix(in srgb, var(--color-semantic-danger) 40%, var(--color-border-subtle))"
    : "color-mix(in srgb, var(--color-semantic-warning) 40%, var(--color-border-subtle))";
  const backgroundColor = urgent
    ? "color-mix(in srgb, var(--color-semantic-danger) 10%, var(--color-surface-card))"
    : "color-mix(in srgb, var(--color-semantic-warning) 10%, var(--color-surface-card))";

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2.5 text-sm"
      style={{ borderColor, backgroundColor, color: "var(--color-neutral-900)" }}
      data-testid="trial-reminder-strip"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Deneme süreniz {days} gün içinde bitiyor</p>
          <p className="mt-0.5 text-xs opacity-90">
            Kesintisiz kullanım için plan seçin; faturalama ve abonelik ayarlarından devam edebilirsiniz.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="default" size="sm" className="h-8" asChild>
          <Link href="/pricing" onClick={() => trackProductEvent("trial_cta_click", { from: "layout_strip", to: "pricing" })}>
            Planları gör
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={dismiss} title="12 saat gizle" type="button">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const STORAGE_KEY = "ticarium365_nav_open_groups_v1";
const COLLAPSE_KEY = "ticarium365_sidebar_collapsed_v1";

function loadOpenGroups(): Record<string, boolean> {
  return {};
}

function saveOpenGroups(_state: Record<string, boolean>) {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* */
  }
}

function navRowStyle(active: boolean, locked: boolean): React.CSSProperties {
  return {
    borderRadius: "var(--radius-md)",
    minHeight: 40,
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)",
    color: active ? "var(--color-nav-text-active)" : locked ? "var(--color-neutral-400)" : "var(--color-nav-text)",
    backgroundColor: active ? "var(--color-nav-item-active-bg)" : undefined,
  };
}

/** Aktif öğe — sol marka çubuğu scale-y ile (150ms). */
function navRowIndicator(active: boolean) {
  return cn(
    "relative overflow-visible",
    "before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:z-[1] before:h-[calc(100%-10px)] before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[var(--color-brand-500)] before:transition-transform before:duration-150 before:ease-out before:origin-center",
    active ? "before:scale-y-100" : "before:scale-y-0",
  );
}

function navRailIndicator(active: boolean) {
  return cn(
    "relative overflow-visible",
    "before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:z-[1] before:h-[60%] before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[var(--color-brand-500)] before:transition-transform before:duration-150 before:ease-out before:origin-center",
    active ? "before:scale-y-100" : "before:scale-y-0",
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();
  const [location] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => loadOpenGroups());
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const { has: hasFeature } = useFeatures();
  const { isHidden: isItemHidden } = useMenuPrefs();
  const { desktopNav, wideSidebar } = useNavLayoutMedia();
  const isMobileNav = !desktopNav;
  const iconRail = desktopNav && (!wideSidebar || collapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
  };

  const companyName = company?.name ?? "Ticarium365";

  const username = user ? (user as { username?: string | null }).username?.trim() : undefined;
  const sidebarDisplayName = user?.fullName?.trim() || username || "Kullanıcı";
  const sidebarInitial = initialLetter(user?.fullName?.trim() || username);

  const accountType = ((user as any)?.accountType ?? "seller") as AccountType;
  const isPurchasing = accountType === "purchasing";
  const pageTitle = resolveLayoutPageTitle(location, isPurchasing);

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    return filterVisibleNavGroups(NAV_GROUPS, {
      role: user.role,
      accountType,
      isItemHidden,
      navItemId,
    });
  }, [user, isItemHidden, accountType]);

  const currentRouteFeature = useMemo<string | null>(() => {
    let bestHref = "";
    let bestFeature: string | null = null;
    for (const g of NAV_GROUPS) {
      for (const i of g.items) {
        const match = location === i.href || location.startsWith(i.href + "/");
        if (match && i.href.length > bestHref.length) {
          bestHref = i.href;
          bestFeature = i.feature ?? null;
        }
      }
    }
    return bestFeature;
  }, [location]);

  const activeGroupId = useMemo(() => {
    for (const g of visibleGroups) {
      if (g.items.some((i) => location === i.href || location.startsWith(i.href + "/"))) {
        return g.id;
      }
    }
    return null;
  }, [visibleGroups, location]);

  useEffect(() => {
    if (activeGroupId && !openGroups[activeGroupId]) {
      const next = { ...openGroups, [activeGroupId]: true };
      setOpenGroups(next);
      saveOpenGroups(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    const next = { ...openGroups, [id]: !openGroups[id] };
    setOpenGroups(next);
    saveOpenGroups(next);
  };

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      window.location.href = "/login";
    } catch {
      toast({ title: "Hata", description: "Çıkış yapılamadı.", variant: "destructive" });
    }
  };

  const isItemActive = (href: string) => location === href || location.startsWith(href + "/");

  const closeMobile = () => setIsOpen(false);

  const renderLockedLink = (item: NavItem, reason: LockReason | null, linkBody: React.ReactNode, key: string) => {
    const locked = reason !== null;
    const ui = lockUiText(reason);
    const finalHref = locked && ui.href ? ui.href : item.href;
    if (!locked) {
      return (
        <Link
          key={key}
          href={item.href}
          onMouseEnter={() => prefetchNavHref(item.href, queryClient)}
        >
          {linkBody}
        </Link>
      );
    }
    return (
      <Tooltip key={key} delayDuration={200}>
        <TooltipTrigger asChild>
          <Link href={finalHref} onMouseEnter={() => prefetchNavHref(finalHref, queryClient)}>
            {linkBody}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          <div className="mb-1 font-semibold">{ui.tooltip}</div>
          <div className="text-[11px] opacity-80">→ {ui.cta}</div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const lockIconColor = (reason: LockReason | null) => {
    if (reason === "role") return "var(--color-semantic-danger)";
    if (reason === "accountType") return "var(--color-semantic-warning)";
    return "var(--color-neutral-400)";
  };

  const NavLinks = ({ forSheet }: { forSheet?: boolean }) => (
    <nav className="flex flex-col gap-0.5">
      {user && !isPurchasing && TOP_ITEM.roles.includes(user.role) && (
        <Link href={TOP_ITEM.href}>
          <div
            className={cn(
              "mb-1.5 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--color-nav-item-hover)] duration-150",
              navRowIndicator(isItemActive(TOP_ITEM.href)),
            )}
            style={navRowStyle(isItemActive(TOP_ITEM.href), false)}
            onClick={forSheet ? closeMobile : undefined}
            data-testid="nav-link-dashboard"
          >
            <TOP_ITEM.icon className="h-4 w-4 shrink-0" />
            <span>{TOP_ITEM.label}</span>
          </div>
        </Link>
      )}

      {user?.role === "super_admin" && (
        <Link
          href="/super-admin"
          onMouseEnter={() => prefetchNavHref("/super-admin", queryClient)}
        >
          <div
            className="mb-2 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--color-nav-item-hover)]"
            style={navRowStyle(location === "/super-admin" || location.startsWith("/super-admin/"), false)}
            onClick={forSheet ? closeMobile : undefined}
            data-testid="nav-link-super-admin-hub"
          >
            <Activity className="h-4 w-4 shrink-0" />
            <span>Platform merkezi</span>
          </div>
        </Link>
      )}

      {user && !isPurchasing && HERO_ITEM.roles.includes(user.role) && (
        <Link
          href={HERO_ITEM.href}
          onMouseEnter={() => prefetchNavHref(HERO_ITEM.href, queryClient)}
        >
          <div
            className="group relative mb-3 flex cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--radius-xl)] px-3 py-2.5 text-sm transition-shadow"
            style={{
              background: "linear-gradient(135deg, var(--color-brand-700) 0%, var(--color-nav-700) 100%)",
              color: "var(--color-nav-text-active)",
              boxShadow: isItemActive(HERO_ITEM.href) ? "var(--shadow-md)" : undefined,
            }}
            onClick={forSheet ? closeMobile : undefined}
            data-testid="nav-link-eticarium-merkezi"
          >
            <span
              aria-hidden
              className="absolute inset-0 opacity-30 transition-opacity group-hover:opacity-50"
              style={{
                background: "radial-gradient(circle at 20% 50%, rgb(255 255 255 / 0.45) 0%, transparent 60%)",
              }}
            />
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-nav-rail-muted)]">
              <HERO_ITEM.icon className="h-4 w-4" />
            </span>
            <div className="relative min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight">{HERO_ITEM.label}</div>
              <div className="mt-0.5 text-[10px] leading-tight opacity-90">Tek tıkla tüm kanallar</div>
            </div>
            <span className="relative rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--color-nav-rail-muted)]">
              Yeni
            </span>
          </div>
        </Link>
      )}

      {visibleGroups.map((group) => {
        const isOpenGroup = !!openGroups[group.id];
        const groupHasActive = group.id === activeGroupId;
        return (
          <div key={group.id} className="mb-0.5">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left font-bold uppercase tracking-wider transition-colors hover:bg-[var(--color-nav-item-hover)]"
              style={{
                fontSize: "11px",
                color: groupHasActive ? "var(--color-nav-text-active)" : "var(--color-neutral-400)",
              }}
              data-testid={`nav-group-${group.id}`}
              aria-expanded={isOpenGroup}
            >
              <group.icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-neutral-400)]" />
              <span className="flex-1">{group.label}</span>
              <span className="text-[10px] font-semibold opacity-60" style={{ color: "var(--color-neutral-400)" }}>
                {group.items.length}
              </span>
              {isOpenGroup ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
              )}
            </button>
            {isOpenGroup && (
              <div className="mb-1 ml-2 mt-0.5 border-l pl-2" style={{ borderColor: "var(--color-nav-border)" }}>
                {group.items.map((item) => {
                  const active = isItemActive(item.href);
                  const reason: LockReason = user
                    ? getNavLockReason(
                        { roles: item.roles, accountTypes: item.accountTypes, feature: item.feature },
                        { role: user.role, accountType, hasFeature },
                      )
                    : null;
                  const locked = reason !== null;
                  const LockIcon = reason === "role" ? ShieldOff : reason === "accountType" ? BuildingLock : Lock;
                  const itemId = navItemId(item);
                  const slug = navIdToTestSlug(itemId);
                  const linkContent = (
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-[var(--color-nav-item-hover)] duration-150",
                        navRowIndicator(active),
                      )}
                      style={navRowStyle(active, locked)}
                      onClick={forSheet ? closeMobile : undefined}
                      data-testid={`nav-link-${slug}`}
                      data-lock-reason={reason ?? undefined}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {locked && (
                        <LockIcon
                          className="h-3 w-3 shrink-0 opacity-80"
                          style={{ color: lockIconColor(reason) }}
                          data-testid={`nav-lock-${slug}`}
                          data-lock-reason={reason ?? undefined}
                        />
                      )}
                    </div>
                  );
                  return renderLockedLink(item, reason, linkContent, itemId);
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  /** Tek satır ikon + popover menü (dar yan panel veya geniş panel daraltılmış) */
  const NavIconRail = () => (
    <div className="flex flex-col items-center gap-1 py-3">
      {user && !isPurchasing && TOP_ITEM.roles.includes(user.role) && (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <Link href={TOP_ITEM.href}>
              <div
                className={cn(
                  "flex h-10 w-10 cursor-pointer items-center justify-center transition-colors hover:bg-[var(--color-nav-item-hover)] duration-150",
                  navRailIndicator(isItemActive(TOP_ITEM.href)),
                )}
                style={navRowStyle(isItemActive(TOP_ITEM.href), false)}
                data-testid="nav-link-collapsed-dashboard"
              >
                <TOP_ITEM.icon className="h-4 w-4 shrink-0" />
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{TOP_ITEM.label}</TooltipContent>
        </Tooltip>
      )}

      {user?.role === "super_admin" && (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Link
              href="/super-admin"
              onMouseEnter={() => prefetchNavHref("/super-admin", queryClient)}
            >
              <div
                className="flex h-10 w-10 cursor-pointer items-center justify-center transition-colors hover:bg-[var(--color-nav-item-hover)]"
                style={navRowStyle(location.startsWith("/super-admin"), false)}
              >
                <Activity className="h-4 w-4 shrink-0" />
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Platform merkezi</TooltipContent>
        </Tooltip>
      )}

      {user && !isPurchasing && HERO_ITEM.roles.includes(user.role) && (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <Link
              href={HERO_ITEM.href}
              onMouseEnter={() => prefetchNavHref(HERO_ITEM.href, queryClient)}
            >
              <div
                className={cn(
                  "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] transition-colors hover:opacity-95 duration-150",
                  navRailIndicator(isItemActive(HERO_ITEM.href)),
                )}
                style={{
                  background: "linear-gradient(135deg, var(--color-brand-700) 0%, var(--color-nav-700) 100%)",
                  color: "var(--color-nav-text-active)",
                  boxShadow: isItemActive(HERO_ITEM.href) ? "var(--shadow-md)" : undefined,
                }}
              >
                <HERO_ITEM.icon className="h-4 w-4 shrink-0" />
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{HERO_ITEM.label}</TooltipContent>
        </Tooltip>
      )}

      {visibleGroups.map((group) => (
        <Popover key={group.id}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={group.label}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-nav-item-hover)]"
              style={{
                color: group.id === activeGroupId ? "var(--color-nav-text-active)" : "var(--color-nav-text)",
              }}
              data-testid={`nav-group-collapsed-${group.id}`}
            >
              <group.icon className="h-4 w-4 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-72 border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] p-2"
            sideOffset={8}
          >
            <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-neutral-400)" }}>
              {group.label}
            </div>
            <div className="flex max-h-[min(70vh,24rem)] flex-col gap-0.5 overflow-y-auto">
              {group.items.map((item) => {
                const active = isItemActive(item.href);
                const reason: LockReason = user
                  ? getNavLockReason(
                      { roles: item.roles, accountTypes: item.accountTypes, feature: item.feature },
                      { role: user.role, accountType, hasFeature },
                    )
                  : null;
                const locked = reason !== null;
                const LockIcon = reason === "role" ? ShieldOff : reason === "accountType" ? BuildingLock : Lock;
                const itemId = navItemId(item);
                const slug = navIdToTestSlug(itemId);
                const row = (
                  <div
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm transition-colors hover:bg-[var(--color-neutral-100)] duration-150",
                      navRowIndicator(active),
                    )}
                    style={{
                      fontWeight: "var(--font-weight-medium)",
                      color: active ? "var(--color-neutral-900)" : locked ? "var(--color-neutral-400)" : "var(--color-neutral-700)",
                      backgroundColor: active ? "color-mix(in srgb, var(--color-brand-50) 90%, transparent)" : undefined,
                    }}
                    data-testid={`nav-link-${slug}`}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {locked && <LockIcon className="h-3 w-3 shrink-0 opacity-80" style={{ color: lockIconColor(reason) }} />}
                  </div>
                );
                const ui = lockUiText(reason);
                const finalHref = locked && ui.href ? ui.href : item.href;
                return (
                  <Link
                    key={itemId}
                    href={finalHref}
                    onMouseEnter={() => prefetchNavHref(finalHref, queryClient)}
                  >
                    {row}
                  </Link>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );

  if (!user) return null;

  const shellAsideStyle: React.CSSProperties = {
    backgroundColor: "var(--color-nav-bg)",
    borderRight: `1px solid var(--color-nav-border)`,
  };

  const avatarStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--color-brand-700) 0%, var(--color-nav-700) 100%)",
    color: "var(--color-nav-text-active)",
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden"
          style={{
            backgroundColor: "var(--color-surface-card)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-10 w-10 shrink-0"
                  style={{ color: "var(--color-neutral-700)" }}
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="left"
                className="flex h-full w-72 flex-col p-0"
                style={{ backgroundColor: "var(--color-nav-bg)", borderColor: "var(--color-nav-border)" }}
              >
                <SheetHeader
                  className="border-b p-5 text-left"
                  style={{ borderColor: "var(--color-nav-border)", backgroundColor: "var(--color-nav-bg)" }}
                >
                  <SheetTitle
                    className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight"
                    style={{ fontFamily: "var(--font-display)", color: "var(--color-nav-text-active)" }}
                  >
                    {company?.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        className="h-8 w-auto max-w-[140px] object-contain"
                      />
                    ) : (
                      <>
                        <BrandLogo size={32} />
                        <span className="t365-brand-gradient">Ticarium365</span>
                      </>
                    )}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-3">
                  <TrialBanner />
                  <NavLinks forSheet />
                </div>
                <div
                  className="mt-auto border-t p-4"
                  style={{ borderColor: "var(--color-nav-border)", backgroundColor: "var(--color-nav-bg)" }}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold shadow-sm"
                      style={avatarStyle}
                    >
                      {sidebarInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--color-nav-text-active)" }}>
                        {sidebarDisplayName}
                      </p>
                      <div className="flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--color-nav-text)" }}>
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{companyName}</span>
                      </div>
                      <span
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: "var(--color-nav-rail-muted)",
                          color: "var(--color-nav-text-active)",
                        }}
                      >
                        {roleChipLabel(user.role)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    style={{
                      borderColor: "var(--color-nav-border)",
                      color: "var(--color-nav-text)",
                      backgroundColor: "transparent",
                    }}
                    onClick={handleLogout}
                    data-testid="button-mobile-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Çıkış Yap
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <span className="truncate text-lg font-bold tracking-tight" style={{ color: "var(--color-neutral-900)" }}>
              {pageTitle}
            </span>
          </div>
          {user.role !== "super_admin" && <NotificationCenter />}
        </header>

        <aside
          className={`hidden h-screen flex-col sticky top-0 transition-[width] duration-200 md:flex ${
            iconRail ? "w-16" : "w-60"
          }`}
          style={shellAsideStyle}
          data-testid="desktop-sidebar"
          data-collapsed={iconRail ? "true" : "false"}
        >
          <div
            className={`relative flex items-center border-b px-3 py-5 ${
              wideSidebar && !iconRail ? "justify-between gap-2" : "justify-center"
            }`}
            style={{ borderColor: "var(--color-nav-border)" }}
          >
            {iconRail ? (
              company?.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="h-7 w-auto max-w-[120px] object-contain"
                />
              ) : (
                <BrandLogo size={28} />
              )
            ) : (
              <h1
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2 text-2xl font-extrabold tracking-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-nav-text-active)" }}
              >
                {company?.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={company.name}
                    className="h-8 w-auto max-w-[140px] object-contain"
                  />
                ) : (
                  <>
                    <BrandLogo size={32} />
                    <span className="t365-brand-gradient min-w-0 truncate">Ticarium365</span>
                  </>
                )}
              </h1>
            )}
            {wideSidebar ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
                className={`h-7 w-7 shrink-0 ${iconRail ? "absolute right-2 top-1/2 -translate-y-1/2" : ""}`}
                style={{ color: "var(--color-nav-text)" }}
                data-testid="button-sidebar-toggle"
              >
                {iconRail ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>

          {iconRail ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <NavIconRail />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <TrialBanner />
              <NavLinks />
            </div>
          )}

          <div className="mt-auto border-t p-3" style={{ borderColor: "var(--color-nav-border)" }}>
            {iconRail ? (
              <div className="flex flex-col items-center gap-2 px-0.5">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold"
                  style={avatarStyle}
                >
                  {sidebarInitial}
                </div>
                <span
                  className="line-clamp-2 max-w-full text-center text-[10px] font-medium leading-tight"
                  style={{ color: "var(--color-nav-text-active)" }}
                  title={sidebarDisplayName}
                  data-testid="sidebar-user-name"
                >
                  {sidebarDisplayName}
                </span>
                <span
                  className="max-w-full truncate text-center text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--color-nav-rail-muted)",
                    color: "var(--color-nav-text-active)",
                    borderRadius: "var(--radius-full)",
                    padding: "2px 6px",
                  }}
                  title={roleChipLabel(user.role)}
                >
                  {roleChipLabel(user.role)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Çıkış Yap"
                  className="h-9 w-9 shrink-0"
                  style={{ color: "var(--color-nav-text)" }}
                  data-testid="button-desktop-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-[var(--radius-lg)] px-2 py-2 transition-colors hover:bg-[var(--color-nav-item-hover)]">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold shadow-sm"
                  style={avatarStyle}
                >
                  {sidebarInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-nav-text-active)" }} data-testid="sidebar-user-name">
                    {sidebarDisplayName}
                  </p>
                  <div className="flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--color-nav-text)" }} data-testid="sidebar-tenant-name">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{companyName}</span>
                  </div>
                  <span
                    className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: "var(--color-nav-rail-muted)",
                      color: "var(--color-nav-text-active)",
                    }}
                  >
                    {roleChipLabel(user.role)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Çıkış Yap"
                  className="h-8 w-8 shrink-0"
                  style={{ color: "var(--color-nav-text)" }}
                  data-testid="button-desktop-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className="z-20 hidden h-14 w-full shrink-0 items-center gap-4 border-b px-6 md:flex"
            style={{
              borderColor: "var(--color-border-subtle)",
              backgroundColor: "var(--color-surface-card)",
            }}
          >
            <h1 className="max-w-[38%] shrink-0 truncate text-lg font-semibold" style={{ color: "var(--color-neutral-900)" }}>
              {pageTitle}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <TrialBadge />
              <QuickAction />
            </div>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-3">
              <div className="w-full max-w-md min-w-[12rem]">
                <GlobalSearch />
              </div>
              {user.role !== "super_admin" && <NotificationCenter />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-10 gap-2 px-2" style={{ color: "var(--color-neutral-700)" }}>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                      style={avatarStyle}
                    >
                      {sidebarInitial}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-semibold">{sidebarDisplayName}</div>
                    <div className="text-xs font-normal opacity-80">{companyName}</div>
                    <div
                      className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: "var(--color-neutral-100)",
                        color: "var(--color-neutral-700)",
                      }}
                    >
                      {roleChipLabel(user.role)}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Ayarlar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/firma-profili">
                      <Building2 className="mr-2 h-4 w-4" />
                      Firma profili
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/settings/subscription">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Abonelik
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Çıkış Yap
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <DemoDataBanner />
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: "var(--color-surface-bg)", padding: "var(--spacing-6)" }}>
            <div className="w-full max-w-none space-y-3">
              <TrialReminderStrip />
              <RetentionHintBanner />
              <div key={location} className="t365-page-main">
                <FeatureGate feature={currentRouteFeature ?? undefined}>{children}</FeatureGate>
              </div>
            </div>
          </div>
        </main>

        <WelcomeTour />
        <CommandPalette />
        <SetupChecklistPopover />
        <QuickBarcodeFab />
      </div>
    </TooltipProvider>
  );
}
