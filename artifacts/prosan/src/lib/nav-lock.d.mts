// TypeScript declarations for nav-lock.mjs (saf JS implementasyonu).
// Re-export edildiğinde tip güvenliği sağlar.

export type AccountType = "buyer" | "seller" | "both" | "purchasing";
export type LockReason = "package" | "role" | "accountType" | null;

export interface NavLockInput {
  roles: string[];
  accountTypes?: AccountType[];
  feature?: string | null;
}

export interface NavLockContext {
  role: string;
  accountType: AccountType;
  hasFeature: (code?: string | null) => boolean;
}

export function getNavLockReason(item: NavLockInput, ctx: NavLockContext): LockReason;
export function lockUiText(reason: LockReason): {
  tooltip: string;
  cta: string;
  href: string | null;
};

export interface VisibleGroupInput {
  id: string;
  accountTypes?: AccountType[];
  items: Array<{ href: string; roles: string[]; accountTypes?: AccountType[]; [k: string]: any }>;
  [k: string]: any;
}
export interface VisibleFilterContext {
  role: string;
  accountType: AccountType;
  isItemHidden?: (id: string) => boolean;
  navItemId?: (i: { href: string; id?: string }) => string;
}
export function filterVisibleNavGroups<G extends VisibleGroupInput>(
  groups: G[],
  ctx: VisibleFilterContext,
): G[];
