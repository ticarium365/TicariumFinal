import { useAuth } from "@/components/auth-context";

export type UserRole = "admin" | "staff" | "viewer" | "super_admin";

export type PermissionAction =
  | "users.manage"
  | "users.view"
  | "billing.manage"
  | "billing.view"
  | "settings.manage"
  | "settings.view"
  | "products.create"
  | "products.edit"
  | "products.delete"
  | "products.view"
  | "sales.create"
  | "sales.edit"
  | "sales.delete"
  | "sales.view"
  | "customers.create"
  | "customers.edit"
  | "customers.delete"
  | "customers.view"
  | "suppliers.create"
  | "suppliers.edit"
  | "suppliers.delete"
  | "suppliers.view"
  | "stock.create"
  | "stock.edit"
  | "stock.delete"
  | "stock.view"
  | "reports.view"
  | "finance.view"
  | "finance.manage"
  | "marketplace.manage"
  | "marketplace.view"
  | "einvoice.manage"
  | "einvoice.view"
  | "b2b.manage"
  | "b2b.view"
  | "channels.manage"
  | "channels.view"
  | "any";

// Role bazlı permission mapping
const ROLE_PERMISSIONS: Record<UserRole, Set<PermissionAction>> = {
  admin: new Set([
    "users.manage",
    "users.view",
    "billing.manage",
    "billing.view",
    "settings.manage",
    "settings.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.view",
    "sales.create",
    "sales.edit",
    "sales.delete",
    "sales.view",
    "customers.create",
    "customers.edit",
    "customers.delete",
    "customers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "suppliers.view",
    "stock.create",
    "stock.edit",
    "stock.delete",
    "stock.view",
    "reports.view",
    "finance.view",
    "finance.manage",
    "marketplace.manage",
    "marketplace.view",
    "einvoice.manage",
    "einvoice.view",
    "b2b.manage",
    "b2b.view",
    "channels.manage",
    "channels.view",
    "any",
  ]),
  staff: new Set([
    "users.view",
    "billing.view",
    "settings.view",
    "products.create",
    "products.edit",
    "products.view",
    "sales.create",
    "sales.edit",
    "sales.view",
    "customers.create",
    "customers.edit",
    "customers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.view",
    "stock.create",
    "stock.edit",
    "stock.view",
    "reports.view",
    "finance.view",
    "marketplace.manage",
    "marketplace.view",
    "einvoice.view",
    "b2b.manage",
    "b2b.view",
    "channels.manage",
    "channels.view",
    "any",
  ]),
  viewer: new Set([
    "users.view",
    "billing.view",
    "settings.view",
    "products.view",
    "sales.view",
    "customers.view",
    "suppliers.view",
    "stock.view",
    "reports.view",
    "finance.view",
    "marketplace.view",
    "einvoice.view",
    "b2b.view",
    "channels.view",
    "any",
  ]),
  super_admin: new Set([
    "users.manage",
    "users.view",
    "billing.manage",
    "billing.view",
    "settings.manage",
    "settings.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.view",
    "sales.create",
    "sales.edit",
    "sales.delete",
    "sales.view",
    "customers.create",
    "customers.edit",
    "customers.delete",
    "customers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "suppliers.view",
    "stock.create",
    "stock.edit",
    "stock.delete",
    "stock.view",
    "reports.view",
    "finance.view",
    "finance.manage",
    "marketplace.manage",
    "marketplace.view",
    "einvoice.manage",
    "einvoice.view",
    "b2b.manage",
    "b2b.view",
    "channels.manage",
    "channels.view",
    "any",
  ]),
};

/**
 * Role-based access control hook
 * @param action - Permission action to check
 * @returns true if current user has permission for the action
 */
export function usePermission(action: PermissionAction): boolean {
  const { user } = useAuth();
  const role = user?.role as UserRole | undefined;

  if (!role) {
    return false;
  }

  const permissions = ROLE_PERMISSIONS[role];
  return permissions.has(action);
}

/**
 * Helper to check if user can perform create/edit/delete operations
 */
export function useCanModify(): boolean {
  return usePermission("any") && !usePermission("products.view");
}

/**
 * Helper to check if user is admin or super_admin
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "admin" || user?.role === "super_admin";
}

/**
 * Helper to check if user is super_admin
 */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "super_admin";
}
