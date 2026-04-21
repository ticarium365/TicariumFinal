/**
 * Dalga 17 — Lock reason ayrımı (saf JS).
 * .ts wrapper'ı bu dosyayı re-export eder, ayrıca node:test runner doğrudan
 * import edebilir (tsx/loader gerekmez).
 */

/**
 * @typedef {"buyer" | "seller" | "both" | "purchasing"} AccountType
 * @typedef {"package" | "role" | "accountType" | null} LockReason
 */

/**
 * @param {{roles: string[], accountTypes?: AccountType[], feature?: string|null}} item
 * @param {{role: string, accountType: AccountType, hasFeature: (c?: string|null) => boolean}} ctx
 * @returns {LockReason}
 */
export function getNavLockReason(item, ctx) {
  if (item.roles.length > 0 && !item.roles.includes(ctx.role)) return "role";
  const xs = item.accountTypes;
  const accountAllowed =
    ctx.accountType === "purchasing"
      ? !!xs && xs.includes("purchasing")
      : !xs || xs.includes(ctx.accountType);
  if (!accountAllowed) return "accountType";
  if (item.feature && !ctx.hasFeature(item.feature)) return "package";
  return null;
}

/**
 * Saf visibility filter — layout.tsx'in `visibleGroups` mantığının testlenebilir hali.
 * Mevcut behavior ile aynıdır: rol uyumsuz veya accountType uyumsuz item'lar gizlenir,
 * boş kalan gruplar atılır. Lock UI bu filtre'den GEÇMİŞ item'lara uygulanır.
 *
 * @param {Array<{id: string, accountTypes?: AccountType[], items: Array<{href: string, roles: string[], accountTypes?: AccountType[]}>}>} groups
 * @param {{role: string, accountType: AccountType, isItemHidden?: (id: string) => boolean, navItemId?: (i: any) => string}} ctx
 */
export function filterVisibleNavGroups(groups, ctx) {
  const isHidden = ctx.isItemHidden ?? (() => false);
  const idOf = ctx.navItemId ?? ((i) => `nav:${i.href}`);
  const accountAllowed = (xs) =>
    ctx.accountType === "purchasing"
      ? !!xs && xs.includes("purchasing")
      : !xs || xs.includes(ctx.accountType);
  return groups
    .filter((g) => accountAllowed(g.accountTypes))
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        i.roles.includes(ctx.role) &&
        accountAllowed(i.accountTypes) &&
        !isHidden(idOf(i)),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function lockUiText(reason) {
  switch (reason) {
    case "package":
      return { tooltip: "Bu modül paketinizde yok. Yükselterek hemen açabilirsiniz.", cta: "Paketi Yükselt", href: "/pricing" };
    case "role":
      return { tooltip: "Bu modül rolünüze kapalı. Yetki için hesap yöneticinize başvurun.", cta: "Yöneticiye Bildir", href: "/users" };
    case "accountType":
      return { tooltip: "Bu modül hesap tipinize uygun değil.", cta: "Detay", href: "/firma-profili" };
    default:
      return { tooltip: "", cta: "", href: null };
  }
}
