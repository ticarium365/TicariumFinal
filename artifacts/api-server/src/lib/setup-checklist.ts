/**
 * Kurulum & Kullanım Skoru — tek listeli (sektör bağımsız) ilk sürüm.
 * Her item için bir sorgu çalıştırıp {done, value, hint} döndürür.
 * Toplam ağırlıklı skor + kategori bazlı ilerleme hesaplanır.
 *
 * V2 not: sektöre göre farklı şablonlar `buildChecklist(sector)` ile
 * branch'lenecek. Şu an tek liste döner.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  companySettingsTable,
  customersTable,
  suppliersTable,
  personnelTable,
  branchesTable,
  productsTable,
  salesTable,
  stockCountSessionsTable,
  channelAccountsTable,
  einvoiceSettingsTable,
  smsSettingsTable,
  notificationRulesTable,
  bankAccountsTable,
  stockMovementsTable,
} from "@workspace/db";

export type ChecklistCategory = "profil" | "veri" | "kullanim";

export type ChecklistItem = {
  id: string;
  category: ChecklistCategory;
  label: string;
  hint?: string;
  link?: string;
  weight: number;
  done: boolean;
  value?: string | number; // gösterimde "1.818 ürün" gibi
};

export type ChecklistResult = {
  scorePercent: number;
  weightedDone: number;
  weightedTotal: number;
  itemsDone: number;
  itemsTotal: number;
  categories: {
    id: ChecklistCategory;
    label: string;
    scorePercent: number;
    weightedDone: number;
    weightedTotal: number;
    items: ChecklistItem[];
  }[];
};

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  profil: "Firma Profili",
  veri: "Açılış Verileri",
  kullanim: "Modül Kullanımı",
};

async function countSafe(
  fn: () => Promise<{ c: number }[]>,
): Promise<number> {
  try {
    const r = await fn();
    return Number(r[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function computeChecklist(companyId: number): Promise<ChecklistResult> {
  // Tek seferde paralel veri çekimi
  const [
    [profile],
    customerCount,
    supplierCount,
    personnelCount,
    branchCount,
    productCount,
    salesLast30,
    stockCountSessions,
    channelAccountsActive,
    [einvoiceCfg],
    [smsCfg],
    notificationRulesActive,
    bankAccountCount,
    stockMovementCount,
  ] = await Promise.all([
    db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId)),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(customersTable).where(eq(customersTable.companyId, companyId)),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(suppliersTable).where(eq(suppliersTable.companyId, companyId)),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(personnelTable).where(eq(personnelTable.companyId, companyId)),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(branchesTable).where(eq(branchesTable.companyId, companyId)),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.companyId, companyId)),
    ),
    countSafe(() => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      return db
        .select({ c: sql<number>`count(*)::int` })
        .from(salesTable)
        .where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, since)));
    }),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(stockCountSessionsTable).where(eq(stockCountSessionsTable.companyId, companyId)),
    ),
    countSafe(() =>
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(channelAccountsTable)
        .where(and(eq(channelAccountsTable.companyId, companyId), eq(channelAccountsTable.isActive, true))),
    ),
    db.select().from(einvoiceSettingsTable).where(eq(einvoiceSettingsTable.companyId, companyId)).limit(1),
    db.select().from(smsSettingsTable).where(eq(smsSettingsTable.companyId, companyId)).limit(1),
    countSafe(() =>
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(notificationRulesTable)
        .where(and(eq(notificationRulesTable.companyId, companyId), eq(notificationRulesTable.isActive, true))),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId)),
    ),
    countSafe(() =>
      db.select({ c: sql<number>`count(*)::int` }).from(stockMovementsTable).where(eq(stockMovementsTable.companyId, companyId)),
    ),
  ]);

  const p: any = profile ?? {};

  const items: ChecklistItem[] = [
    // ── PROFİL ─────────────────────────────────────────────────────────────
    {
      id: "profile.companyName", category: "profil", weight: 3,
      label: "Firma ünvanı girildi",
      done: !!p.companyName, link: "/firma-profili",
      hint: "Künye sekmesi · vergi levhasındaki tam ünvan",
    },
    {
      id: "profile.taxNumber", category: "profil", weight: 3,
      label: "Vergi numarası girildi",
      done: !!p.taxNumber, link: "/firma-profili",
      hint: "Faturalarda ve resmi belgelerde kullanılır",
    },
    {
      id: "profile.sector", category: "profil", weight: 2,
      label: "Sektör seçildi",
      done: !!p.sector, link: "/firma-profili",
      hint: "Sektör bazlı raporlar ve şablonlar bunu kullanır",
    },
    {
      id: "profile.iban", category: "profil", weight: 1,
      label: "IBAN ve banka bilgisi",
      done: !!p.iban, link: "/firma-profili",
      hint: "Müşterilere gönderilen tahsilat linklerinde gözükür",
    },
    {
      id: "profile.contact", category: "profil", weight: 1,
      label: "Telefon, e-posta, adres",
      done: !!(p.phone && p.email && p.address), link: "/firma-profili",
    },
    {
      id: "profile.fixedCosts", category: "profil", weight: 3,
      label: "Aylık sabit giderler girildi",
      done:
        Number(p.monthlyRent) > 0 ||
        Number(p.monthlyUtilities) > 0 ||
        (Array.isArray(p.payrollLines) && p.payrollLines.length > 0),
      link: "/firma-profili",
      hint: "Kira + faturalar + personel — başabaş ciroyu hesaplamak için kritik",
    },
    {
      id: "profile.targetMargin", category: "profil", weight: 2,
      label: "Hedef brüt kâr marjı belirlendi",
      done: Number(p.targetGrossMargin) > 0,
      link: "/firma-profili",
      hint: "Performans sekmesi · hedef ciroyu hesaplamak için",
    },
    {
      id: "profile.refRevenue", category: "profil", weight: 1,
      label: "Aylık ortalama ciro (referans)",
      done: Number(p.monthlyAvgRevenue) > 0,
      link: "/firma-profili",
    },

    // ── AÇILIŞ VERİLERİ ────────────────────────────────────────────────────
    {
      id: "data.products", category: "veri", weight: 3,
      label: "Ürün kataloğu", value: `${productCount.toLocaleString("tr-TR")} ürün`,
      done: productCount > 0, link: "/products",
    },
    {
      id: "data.customers", category: "veri", weight: 2,
      label: "Müşteri kayıtları", value: `${customerCount} müşteri`,
      done: customerCount > 0, link: "/customers",
      hint: "İlk müşterinizi ekleyin — satışlarda seçim için lazım",
    },
    {
      id: "data.suppliers", category: "veri", weight: 1,
      label: "Tedarikçi kayıtları", value: `${supplierCount} tedarikçi`,
      done: supplierCount > 0, link: "/suppliers",
    },
    {
      id: "data.personnel", category: "veri", weight: 2,
      label: "Personel kayıtları", value: `${personnelCount} personel`,
      done: personnelCount > 0, link: "/personnel",
      hint: "Maaş ve performans takibi için",
    },
    {
      id: "data.branch", category: "veri", weight: 1,
      label: "En az 1 şube tanımlı", value: `${branchCount} şube`,
      done: branchCount > 0, link: "/branches",
    },
    {
      id: "data.openingStock", category: "veri", weight: 2,
      label: "Açılış stoğu girildi", value: `${stockMovementCount} hareket`,
      done: stockMovementCount > 0, link: "/stock",
      hint: "Mevcut stok miktarlarınız sisteme aktarılmadan kâr raporları doğru çıkmaz",
    },
    {
      id: "data.bankAccount", category: "veri", weight: 1,
      label: "Banka hesabı tanımlı", value: `${bankAccountCount} hesap`,
      done: bankAccountCount > 0, link: "/banking",
    },

    // ── MODÜL KULLANIMI ────────────────────────────────────────────────────
    {
      id: "usage.sales30d", category: "kullanim", weight: 3,
      label: "Son 30 günde satış kaydı", value: `${salesLast30} satış`,
      done: salesLast30 > 0, link: "/sales",
      hint: "Sistem aktif kullanılıyor mu? Günlük satışlarınızı buradan girin",
    },
    {
      id: "usage.stockCount", category: "kullanim", weight: 1,
      label: "Envanter sayımı yapıldı",
      value: stockCountSessions > 0 ? `${stockCountSessions} oturum` : undefined,
      done: stockCountSessions > 0, link: "/stock-count",
      hint: "Periyodik sayım fire/kayıpları görmenizi sağlar",
    },
    {
      id: "usage.marketplace", category: "kullanim", weight: 2,
      label: "Pazaryeri bağlantısı aktif",
      value: channelAccountsActive > 0 ? `${channelAccountsActive} kanal` : undefined,
      done: channelAccountsActive > 0, link: "/marketplace",
      hint: "Trendyol, Hepsiburada, N11 — stok ve sipariş otomatik akar",
    },
    {
      id: "usage.einvoice", category: "kullanim", weight: 1,
      label: "e-Fatura entegrasyonu",
      done: !!einvoiceCfg && !!(einvoiceCfg as any).enabled,
      link: "/settings/integrations",
      hint: "Paraşüt veya GİB entegrasyonu",
    },
    {
      id: "usage.sms", category: "kullanim", weight: 1,
      label: "SMS gönderimi yapılandırıldı",
      done: !!smsCfg && (smsCfg as any).isActive !== false,
      link: "/settings/integrations",
      hint: "Müşteriye tahsilat hatırlatma, sipariş bildirimi vb.",
    },
    {
      id: "usage.notifications", category: "kullanim", weight: 1,
      label: "Bildirim kuralları açık",
      value: notificationRulesActive > 0 ? `${notificationRulesActive} kural aktif` : undefined,
      done: notificationRulesActive > 0,
      link: "/settings/notifications",
      hint: "Düşük stok, vade dolan alacak, hedef sapması vb. uyarılar",
    },
  ];

  // Kategori bazlı + toplam skor
  const cats = (["profil", "veri", "kullanim"] as ChecklistCategory[]).map((cid) => {
    const its = items.filter((i) => i.category === cid);
    const wTotal = its.reduce((a, i) => a + i.weight, 0);
    const wDone = its.reduce((a, i) => a + (i.done ? i.weight : 0), 0);
    return {
      id: cid,
      label: CATEGORY_LABELS[cid],
      scorePercent: wTotal > 0 ? Math.round((wDone / wTotal) * 100) : 0,
      weightedDone: wDone,
      weightedTotal: wTotal,
      items: its,
    };
  });

  const weightedTotal = items.reduce((a, i) => a + i.weight, 0);
  const weightedDone = items.reduce((a, i) => a + (i.done ? i.weight : 0), 0);

  return {
    scorePercent: weightedTotal > 0 ? Math.round((weightedDone / weightedTotal) * 100) : 0,
    weightedDone,
    weightedTotal,
    itemsDone: items.filter((i) => i.done).length,
    itemsTotal: items.length,
    categories: cats,
  };
}
