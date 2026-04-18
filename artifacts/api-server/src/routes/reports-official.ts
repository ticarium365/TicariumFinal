// Resmi Raporlar — KDV, BA-BS, Mizan, Stopaj
// Logo / Mikro / Paraşüt'ün muhasebeci-tarafı raporlarına denk gelir
import { Router } from "express";
import {
  db,
  salesTable, expensesTable, expenseDetailsTable, expenseCategoriesTable,
  purchasesTable, suppliersTable, customersTable,
} from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { accountantAccessTable } from "@workspace/db";

const router = Router();
router.use(requireAuth);

// Resmi raporları yalnızca tenant admin/staff/viewer/super_admin VEYA
// bu firmaya tanımlı aktif "accountant_access" sahibi muhasebeci görebilir.
async function requireReportAccess(req: any, res: any, next: any) {
  const role = req.session?.user?.role;
  if (["admin", "staff", "viewer", "super_admin"].includes(role)) return next();
  const userId = req.session?.user?.id;
  const companyId = req.companyId;
  if (!userId || !companyId) return res.status(403).json({ error: "forbidden" });
  const [acc] = await db.select().from(accountantAccessTable).where(and(
    eq(accountantAccessTable.userId, userId),
    eq(accountantAccessTable.companyId, companyId),
    eq(accountantAccessTable.isActive, true),
  )).limit(1);
  if (!acc) return res.status(403).json({ error: "no_accountant_access" });
  next();
}
router.use(requireReportAccess);

function periodToRange(period: string): [Date, Date] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const from = new Date(y, mo, 1, 0, 0, 0);
  const to = new Date(y, mo + 1, 0, 23, 59, 59);
  return [from, to];
}

// ─────────────────────────────────────────────────────────────────────────────
// KDV BEYANNAMESİ ÖZETİ — period=YYYY-MM
// Hesaplanan KDV = sales × vat (varsayılan %20) ; İndirilecek KDV = expense_details.vatAmount + purchases.taxAmount
// ─────────────────────────────────────────────────────────────────────────────
router.get("/kdv", async (req, res) => {
  const companyId = req.companyId!;
  const period = String(req.query.period || "");
  const range = periodToRange(period);
  if (!range) return res.status(400).json({ error: "period YYYY-MM" });
  const [from, to] = range;
  const defaultVat = Number(req.query.defaultVat ?? 20);

  // Satışlar — toplam KDV'siz baz ve hesaplanan KDV
  // Sales tablosunda vatRate yok — varsayılan kullanıyoruz
  const [salesAgg] = await db.select({
    totalGross: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
    rowCount: sql<number>`COUNT(*)`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, from),
    lte(salesTable.createdAt, to),
  ));
  const salesGross = Number(salesAgg?.totalGross || 0);
  const salesBase = salesGross / (1 + defaultVat / 100);
  const salesVat = salesGross - salesBase;

  // Alış faturaları — taxAmount kullan
  const [purchAgg] = await db.select({
    totalNet: sql<number>`COALESCE(SUM(${purchasesTable.subtotalAmount}), 0)`,
    totalTax: sql<number>`COALESCE(SUM(${purchasesTable.taxAmount}), 0)`,
    rowCount: sql<number>`COUNT(*)`,
  }).from(purchasesTable).where(and(
    eq(purchasesTable.companyId, companyId),
    gte(purchasesTable.invoiceDate, from),
    lte(purchasesTable.invoiceDate, to),
  ));

  // Giderler içindeki KDV
  const [expAgg] = await db.select({
    totalAmount: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
    totalVat: sql<number>`COALESCE(SUM(COALESCE(${expenseDetailsTable.vatAmount}, 0)), 0)`,
  }).from(expensesTable)
    .leftJoin(expenseDetailsTable, eq(expenseDetailsTable.expenseId, expensesTable.id))
    .where(and(
      eq(expensesTable.companyId, companyId),
      gte(expensesTable.expenseDate, from),
      lte(expensesTable.expenseDate, to),
    ));

  const inputVat = Number(purchAgg?.totalTax || 0) + Number(expAgg?.totalVat || 0);
  const outputVat = salesVat;
  const payable = Math.max(0, outputVat - inputVat);
  const carry = Math.max(0, inputVat - outputVat);

  res.json({
    period,
    defaultVat,
    sales: {
      gross: round2(salesGross), base: round2(salesBase), vat: round2(salesVat),
      rowCount: Number(salesAgg?.rowCount || 0),
    },
    purchases: {
      net: round2(Number(purchAgg?.totalNet || 0)),
      vat: round2(Number(purchAgg?.totalTax || 0)),
      rowCount: Number(purchAgg?.rowCount || 0),
    },
    expenses: {
      gross: round2(Number(expAgg?.totalAmount || 0)),
      vat: round2(Number(expAgg?.totalVat || 0)),
    },
    inputVat: round2(inputVat),
    outputVat: round2(outputVat),
    payable: round2(payable),     // Devlete ödenecek
    carryForward: round2(carry),  // Devreden KDV
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FORM BA / BS — KDV hariç 5.000+ TL alış (BA) ve satışlar (BS), mükellef bazında
// ─────────────────────────────────────────────────────────────────────────────
router.get("/ba-bs", async (req, res) => {
  const companyId = req.companyId!;
  const period = String(req.query.period || "");
  const range = periodToRange(period);
  if (!range) return res.status(400).json({ error: "period YYYY-MM" });
  const [from, to] = range;
  const threshold = Number(req.query.threshold ?? 5000);

  // BA — alımlar VKN bazında gruplanır (aynı VKN'li çoklu kart birleşir)
  const baRowsRaw = await db.select({
    supplierId: suppliersTable.id,
    name: suppliersTable.name,
    taxNumber: suppliersTable.taxNumber,
    netTotal: sql<number>`COALESCE(SUM(${purchasesTable.subtotalAmount}), 0)`,
    vatTotal: sql<number>`COALESCE(SUM(${purchasesTable.taxAmount}), 0)`,
    invoiceCount: sql<number>`COUNT(*)`,
  }).from(purchasesTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchasesTable.supplierId))
    .where(and(
      eq(purchasesTable.companyId, companyId),
      gte(purchasesTable.invoiceDate, from),
      lte(purchasesTable.invoiceDate, to),
    ))
    .groupBy(suppliersTable.id, suppliersTable.name, suppliersTable.taxNumber);

  // VKN'ye göre toplulaştır — VKN yoksa supplier id ile ayır (BA'ya dahil etme)
  const baMap = new Map<string, { vkn: string; name: string; netTotal: number; vatTotal: number; invoiceCount: number; valid: boolean }>();
  for (const r of baRowsRaw) {
    const vkn = (r.taxNumber || "").trim();
    const key = vkn ? `vkn:${vkn}` : `sid:${r.supplierId}`;
    const cur = baMap.get(key) || { vkn: vkn || "—", name: r.name || "—", netTotal: 0, vatTotal: 0, invoiceCount: 0, valid: !!vkn };
    cur.netTotal += Number(r.netTotal || 0);
    cur.vatTotal += Number(r.vatTotal || 0);
    cur.invoiceCount += Number(r.invoiceCount || 0);
    baMap.set(key, cur);
  }
  const ba = Array.from(baMap.values())
    .map((r) => ({ vkn: r.vkn, name: r.name, netTotal: round2(r.netTotal), vatTotal: round2(r.vatTotal), invoiceCount: r.invoiceCount, hasVkn: r.valid }))
    .filter((r) => r.netTotal >= threshold && r.hasVkn);

  // BS — satışlar (sales ↔ customers)
  const bsRows = await db.select({
    customerId: customersTable.id,
    name: customersTable.name,
    taxNumber: customersTable.taxNumber,
    grossTotal: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
    rows: sql<number>`COUNT(*)`,
  }).from(salesTable)
    .leftJoin(customersTable, eq(customersTable.id, salesTable.customerId))
    .where(and(
      eq(salesTable.companyId, companyId),
      eq(salesTable.returned, false),
      gte(salesTable.createdAt, from),
      lte(salesTable.createdAt, to),
    ))
    .groupBy(customersTable.id, customersTable.name, customersTable.taxNumber);

  // VKN bazında topla (aynı VKN'li mükerrer müşteri kartları birleşir)
  const vatRate = Number(req.query.defaultVat ?? 20);
  const vatDiv = 1 + vatRate / 100;
  const bsMap = new Map<string, { vkn: string; name: string; gross: number; rows: number; valid: boolean }>();
  for (const r of bsRows) {
    if (r.customerId === null) continue; // perakende toplam BS'ye girmez
    const vkn = (r.taxNumber || "").trim();
    const key = vkn ? `vkn:${vkn}` : `cid:${r.customerId}`;
    const cur = bsMap.get(key) || { vkn: vkn || "—", name: r.name || "—", gross: 0, rows: 0, valid: !!vkn };
    cur.gross += Number(r.grossTotal || 0);
    cur.rows += Number(r.rows || 0);
    bsMap.set(key, cur);
  }
  const bs = Array.from(bsMap.values())
    .map((r) => ({
      vkn: r.vkn, name: r.name,
      netTotal: round2(r.gross / vatDiv),
      vatTotal: round2(r.gross - r.gross / vatDiv),
      rows: r.rows, hasVkn: r.valid,
    }))
    .filter((r) => r.netTotal >= threshold && r.hasVkn);

  res.json({ period, threshold, ba, bs, baCount: ba.length, bsCount: bs.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// MİZAN (basit) — kategori bazında gelir/gider toplam
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mizan", async (req, res) => {
  const companyId = req.companyId!;
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 90 * 86400000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const [salesAgg] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalPrice}), 0)`,
    cogs: sql<number>`COALESCE(SUM(${salesTable.purchasePrice} * ${salesTable.quantity}), 0)`,
  }).from(salesTable).where(and(
    eq(salesTable.companyId, companyId),
    eq(salesTable.returned, false),
    gte(salesTable.createdAt, from),
    lte(salesTable.createdAt, to),
  ));

  const expRows = await db.select({
    categoryId: expensesTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expenseCategoriesTable.id, expensesTable.categoryId))
    .where(and(
      eq(expensesTable.companyId, companyId),
      gte(expensesTable.expenseDate, from),
      lte(expensesTable.expenseDate, to),
    ))
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name);

  const expenses = expRows.map((r) => ({
    categoryId: r.categoryId, category: r.categoryName || "Kategorisiz",
    total: round2(Number(r.total || 0)), count: Number(r.count || 0),
  }));
  const totalExpense = expenses.reduce((s, e) => s + e.total, 0);
  const revenue = round2(Number(salesAgg?.revenue || 0));
  const cogs = round2(Number(salesAgg?.cogs || 0));

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    cogs,
    grossProfit: round2(revenue - cogs),
    expenses,
    totalExpense: round2(totalExpense),
    netProfit: round2(revenue - cogs - totalExpense),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export — KDV / BA / BS
// ─────────────────────────────────────────────────────────────────────────────
function csv(rows: any[], headers: string[]) {
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(";")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(";"));
  return lines.join("\n");
}

router.get("/ba-bs.csv", async (req, res) => {
  const r = await fetch(`http://localhost:${process.env.PORT}/api/reports-official/ba-bs?` + new URLSearchParams(req.query as any).toString(), {
    headers: { cookie: req.headers.cookie || "" },
  }).then((x) => x.json());
  const rows = [
    ...(r.ba || []).map((x: any) => ({ tip: "BA", ...x })),
    ...(r.bs || []).map((x: any) => ({ tip: "BS", ...x })),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ba-bs-${r.period}.csv"`);
  res.send("\uFEFF" + csv(rows, ["tip", "vkn", "name", "netTotal", "vatTotal"]));
});

function round2(n: number): number { return Math.round(n * 100) / 100; }

export default router;
