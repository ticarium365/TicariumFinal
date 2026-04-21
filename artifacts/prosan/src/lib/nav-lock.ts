/**
 * Dalga 17 — Lock reason ayrımı (TypeScript wrapper).
 * Saf JS implementasyonu .mjs içinde — node:test runner doğrudan import eder.
 * Bu wrapper TS tipleri sağlar (NavItem ile uyum) ve uygulamada kullanılır.
 */

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

// Re-export saf .mjs implementasyonu — nav-lock.d.mts ile tip güvenli.
import {
  getNavLockReason as _getNavLockReason,
  lockUiText as _lockUiText,
  filterVisibleNavGroups as _filterVisibleNavGroups,
} from "./nav-lock.mjs";

export const getNavLockReason: (i: NavLockInput, c: NavLockContext) => LockReason = _getNavLockReason;
export const lockUiText: (r: LockReason) => { tooltip: string; cta: string; href: string | null } = _lockUiText;

export interface VisibleGroupInput {
  id: string;
  accountTypes?: AccountType[];
  items: Array<{
    href: string;
    roles: string[];
    accountTypes?: AccountType[];
    [k: string]: any;
  }>;
  [k: string]: any;
}
export interface VisibleFilterContext {
  role: string;
  accountType: AccountType;
  isItemHidden?: (id: string) => boolean;
  navItemId?: (i: { href: string; id?: string }) => string;
}
export const filterVisibleNavGroups: <G extends VisibleGroupInput>(g: G[], c: VisibleFilterContext) => G[] =
  _filterVisibleNavGroups;
