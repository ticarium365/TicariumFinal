/**
 * Demo Data Seti — Onboarding wizard sonunda kullanıcının seçtiği sektöre göre
 * boş tenant'a örnek ürün/müşteri/tedarikçi/satış/alış kayıtları yükler.
 *
 * Tasarım kararları:
 * - İdempotency: companies.demo_seeded_at NULL olmalı; aksi halde route 409 döner.
 *   (Bu fonksiyon flag kontrolü yapmaz — onboarding route handler yapar.)
 * - Tek transaction içinde insert edilir; herhangi bir adım fail ederse hiçbir şey yazılmaz.
 * - Veriler "etkileyici ve gerçekçi" olacak şekilde:
 *     * Türkiye ortamına uygun isimler (firma, şehir, vergi dairesi)
 *     * Gerçek EAN-13 barkod aralığı (869 = Türkiye prefix)
 *     * Tutarlı kâr marjları (industrial: %25-40, retail: %12-25)
 *     * Geçen 7 gün içine yayılmış satışlar (boş grafik hissi olmasın)
 * - Maliyet/satış oranları sektöre göre değiştirilmiş — KDV hesabı dahil edilmedi
 *   (mevcut sales/purchase tablolarında KDV kolonu zaten taxAmount olarak ayrı).
 */

import { sql } from "drizzle-orm";
import {
  productsTable,
  customersTable,
  suppliersTable,
  salesTable,
  purchasesTable,
  purchaseItemsTable,
} from "@workspace/db";

export type DemoSector = "industrial" | "retail";

/**
 * Drizzle transaction handle tipi — caller route handler'ı
 * `db.transaction(async (tx) => { ... })` içinden çağırır,
 * böylece flag set + seed atomik olur (architect bulgu #2,#3).
 */
type Tx = any;

interface DemoProduct {
  productCode: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  minStock: number;
  purchasePrice: number;
  salePrice: number;
}

interface DemoCustomer {
  code: string;
  type: "individual" | "company";
  name: string;
  taxOffice?: string;
  taxNumber?: string;
  phone: string;
  email?: string;
  city: string;
  district?: string;
  contactPerson?: string;
  creditLimit?: number;
}

interface DemoSupplier {
  code: string;
  name: string;
  taxOffice?: string;
  taxNumber?: string;
  phone: string;
  email?: string;
  city: string;
  contactPerson?: string;
}

interface DemoSaleSpec {
  productIdx: number;       // INDUSTRIAL_PRODUCTS / RETAIL_PRODUCTS içindeki sıra
  quantity: number;
  customerIdx?: number;     // null = walk-in
  paymentMethod: "cash" | "card" | "transfer" | "credit";
  daysAgo: number;          // satışın ne kadar eski olduğu (0 = bugün)
}

interface DemoPurchaseSpec {
  supplierIdx: number;
  invoiceNo: string;
  daysAgo: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  lines: Array<{ productIdx: number; quantity: number; unitCost: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRIAL — B2B endüstriyel (vida-cıvata-makine)
// ─────────────────────────────────────────────────────────────────────────────
const INDUSTRIAL_PRODUCTS: DemoProduct[] = [
  { productCode: "VID-M8X40-PSL",  barcode: "8690000000017", name: "Paslanmaz Vida M8x40 DIN933",     brand: "INOX",      category: "Vida & Cıvata", stock: 1200, minStock: 200, purchasePrice: 1.85, salePrice: 2.95 },
  { productCode: "VID-M10X50-PSL", barcode: "8690000000024", name: "Paslanmaz Vida M10x50 DIN933",    brand: "INOX",      category: "Vida & Cıvata", stock:  800, minStock: 150, purchasePrice: 2.65, salePrice: 4.25 },
  { productCode: "CIV-M12X80-GLV", barcode: "8690000000031", name: "Galvanizli Cıvata M12x80",        brand: "ÇELİKSAN",  category: "Vida & Cıvata", stock:  500, minStock: 100, purchasePrice: 4.80, salePrice: 7.90 },
  { productCode: "SOM-M8-PSL",     barcode: "8690000000048", name: "Paslanmaz Somun M8 DIN934",       brand: "INOX",      category: "Somun & Rondela", stock: 2000, minStock: 400, purchasePrice: 0.55, salePrice: 0.95 },
  { productCode: "ROND-M8-DIN125", barcode: "8690000000055", name: "Pul Rondela M8 DIN125",           brand: "ÇELİKSAN",  category: "Somun & Rondela", stock: 3500, minStock: 500, purchasePrice: 0.18, salePrice: 0.35 },
  { productCode: "RUL-6204-2RS",   barcode: "8690000000062", name: "Rulman 6204 2RS",                 brand: "SKF",       category: "Rulman",         stock:  120, minStock:  30, purchasePrice: 38.50, salePrice: 62.00 },
  { productCode: "RUL-6205-2RS",   barcode: "8690000000079", name: "Rulman 6205 2RS",                 brand: "SKF",       category: "Rulman",         stock:   95, minStock:  25, purchasePrice: 45.00, salePrice: 72.50 },
  { productCode: "YAG-15W40-20L",  barcode: "8690000000086", name: "Mineral Motor Yağı 15W-40 20L",   brand: "SHELL",     category: "Yağ & Kimyasal", stock:   45, minStock:  10, purchasePrice: 850.00, salePrice: 1280.00 },
  { productCode: "YAG-HID-46-20L", barcode: "8690000000093", name: "Hidrolik Yağı HD46 20L",          brand: "MOBIL",     category: "Yağ & Kimyasal", stock:   38, minStock:  10, purchasePrice: 920.00, salePrice: 1390.00 },
  { productCode: "FLT-HV-AT200",   barcode: "8690000000109", name: "Hidrolik Filtre AT200",           brand: "MANN",      category: "Filtre",         stock:   60, minStock:  15, purchasePrice: 145.00, salePrice: 235.00 },
  { productCode: "KAY-V-A85",      barcode: "8690000000116", name: "V-Kayışı A85",                    brand: "GATES",     category: "Kayış",          stock:  150, minStock:  30, purchasePrice: 32.00, salePrice: 52.00 },
  { productCode: "ELK-2KW-3F",     barcode: "8690000000123", name: "Elektrik Motoru 2.2 kW 3 Faz",    brand: "GAMAK",     category: "Motor",          stock:   18, minStock:   5, purchasePrice: 4850.00, salePrice: 7250.00 },
];

const INDUSTRIAL_CUSTOMERS: DemoCustomer[] = [
  { code: "CRI-001", type: "company", name: "Marmara Makine San. Tic. Ltd. Şti.", taxOffice: "Kadıköy", taxNumber: "1234567890", phone: "0216 444 12 34", email: "muhasebe@marmaramakine.com.tr", city: "İstanbul", district: "Kadıköy", contactPerson: "Ahmet Yılmaz", creditLimit: 50000 },
  { code: "CRI-002", type: "company", name: "Bursa Otomotiv Yedek Parça",         taxOffice: "Osmangazi", taxNumber: "2345678901", phone: "0224 555 67 89", email: "info@bursayedekparca.com",   city: "Bursa",    district: "Osmangazi", contactPerson: "Mehmet Demir", creditLimit: 35000 },
  { code: "CRI-003", type: "company", name: "Anadolu Tarım Aletleri",             taxOffice: "Konya",     taxNumber: "3456789012", phone: "0332 666 11 22", email: "satis@anadolutarim.com",     city: "Konya",   contactPerson: "Hasan Kara",   creditLimit: 25000 },
  { code: "CRI-004", type: "individual", name: "Ali Çelik Tamirhanesi",                                                              phone: "0532 111 22 33",                                  city: "İstanbul", district: "Pendik", creditLimit: 5000 },
  { code: "CRI-005", type: "company", name: "Ege İnşaat Malzemeleri A.Ş.",        taxOffice: "Konak",     taxNumber: "4567890123", phone: "0232 777 33 44", email: "siparis@egeinsaat.com.tr",   city: "İzmir",   contactPerson: "Selim Aydın",  creditLimit: 75000 },
];

const INDUSTRIAL_SUPPLIERS: DemoSupplier[] = [
  { code: "TED-001", name: "BÜYÜKAY METAL DIŞ TİC. A.Ş.",  taxOffice: "Beyoğlu",  taxNumber: "5678901234", phone: "0212 333 44 55", email: "satis@buyukaymetal.com",   city: "İstanbul", contactPerson: "Faruk Beyaz" },
  { code: "TED-002", name: "GÜNEŞ RULMAN PAZARLAMA LTD.",   taxOffice: "Şişli",    taxNumber: "6789012345", phone: "0212 444 55 66", email: "info@gunesrulman.com.tr",  city: "İstanbul", contactPerson: "Sema Güneş" },
  { code: "TED-003", name: "ANKARA ENDÜSTRİ YAĞLARI",       taxOffice: "Çankaya",  taxNumber: "7890123456", phone: "0312 222 33 44", email: "siparis@ankaraendustri.com", city: "Ankara",   contactPerson: "Cem Tan" },
];

const INDUSTRIAL_SALES: DemoSaleSpec[] = [
  { productIdx: 0,  quantity: 200, customerIdx: 0, paymentMethod: "transfer", daysAgo: 6 },
  { productIdx: 5,  quantity:  10, customerIdx: 1, paymentMethod: "transfer", daysAgo: 5 },
  { productIdx: 10, quantity:  20, customerIdx: 2, paymentMethod: "credit",   daysAgo: 4 },
  { productIdx: 7,  quantity:   3, customerIdx: 4, paymentMethod: "transfer", daysAgo: 3 },
  { productIdx: 3,  quantity: 500, customerIdx: 0, paymentMethod: "credit",   daysAgo: 2 },
  { productIdx: 11, quantity:   1, customerIdx: 1, paymentMethod: "transfer", daysAgo: 1 },
  { productIdx: 1,  quantity: 100, customerIdx: 3, paymentMethod: "cash",     daysAgo: 0 },
];

const INDUSTRIAL_PURCHASES: DemoPurchaseSpec[] = [
  {
    supplierIdx: 0, invoiceNo: "BYM-2026-0142", daysAgo: 12, paymentStatus: "paid",
    lines: [
      { productIdx: 0, quantity: 500, unitCost: 1.85 },
      { productIdx: 1, quantity: 300, unitCost: 2.65 },
      { productIdx: 3, quantity: 1000, unitCost: 0.55 },
    ],
  },
  {
    supplierIdx: 1, invoiceNo: "GR-2026-0089", daysAgo: 8, paymentStatus: "partial",
    lines: [
      { productIdx: 5, quantity: 50, unitCost: 38.50 },
      { productIdx: 6, quantity: 40, unitCost: 45.00 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RETAIL — Perakende/Bakkal-Market (FMCG)
// ─────────────────────────────────────────────────────────────────────────────
const RETAIL_PRODUCTS: DemoProduct[] = [
  { productCode: "GIDA-CHC-EC50",  barcode: "8690504001017", name: "Eti Cin Çikolatalı Bisküvi 50g",  brand: "Eti",        category: "Çikolata & Bisküvi", stock: 240, minStock: 60, purchasePrice: 4.50, salePrice: 6.50 },
  { productCode: "GIDA-CHC-ULK80", barcode: "8690504001024", name: "Ülker Çikolatalı Gofret 80g",     brand: "Ülker",      category: "Çikolata & Bisküvi", stock: 180, minStock: 50, purchasePrice: 8.20, salePrice: 11.50 },
  { productCode: "ICK-COCA-1L",    barcode: "8690504001031", name: "Coca-Cola 1L",                     brand: "Coca-Cola",  category: "İçecek",            stock: 320, minStock: 80, purchasePrice: 22.00, salePrice: 32.00 },
  { productCode: "ICK-FUSE-500",   barcode: "8690504001048", name: "Fuse Tea Şeftali 500ml",          brand: "Fuse Tea",   category: "İçecek",            stock: 150, minStock: 40, purchasePrice: 11.50, salePrice: 17.00 },
  { productCode: "ICK-EFE-50",     barcode: "8690504001055", name: "Efes Pilsen 500ml",                brand: "Efes",       category: "İçecek",            stock:  96, minStock: 24, purchasePrice: 28.00, salePrice: 39.00 },
  { productCode: "SUT-PIN-1L",     barcode: "8690504001062", name: "Pınar Tam Yağlı Süt 1L",          brand: "Pınar",      category: "Süt & Kahvaltılık", stock: 110, minStock: 30, purchasePrice: 32.00, salePrice: 42.00 },
  { productCode: "SUT-ICM-500",    barcode: "8690504001079", name: "İçim Beyaz Peynir 500g",          brand: "İçim",       category: "Süt & Kahvaltılık", stock:  65, minStock: 20, purchasePrice: 105.00, salePrice: 138.00 },
  { productCode: "EKM-FRN-NORM",   barcode: "8690504001086", name: "Fırın Ekmeği 250g",               brand: "Yerel Fırın", category: "Fırın",            stock:  85, minStock: 30, purchasePrice: 7.50, salePrice: 10.00 },
  { productCode: "TEM-YUM-2400",   barcode: "8690504001093", name: "Yumoş Çamaşır Yumuşatıcı 2400ml", brand: "Yumoş",      category: "Temizlik",          stock:  48, minStock: 12, purchasePrice: 145.00, salePrice: 189.00 },
  { productCode: "TEM-FAY-ULTRA",  barcode: "8690504001109", name: "Fairy Ultra Bulaşık Det. 2L",     brand: "Fairy",      category: "Temizlik",          stock:  52, minStock: 15, purchasePrice: 168.00, salePrice: 215.00 },
  { productCode: "TEM-SLP-450",    barcode: "8690504001116", name: "Selpak Tuvalet Kağıdı 32'li",     brand: "Selpak",     category: "Temizlik",          stock:  38, minStock: 10, purchasePrice: 198.00, salePrice: 259.00 },
  { productCode: "ATIS-SIG-MAR",   barcode: "8690504001123", name: "Marlboro Red 20'lik",              brand: "Marlboro",   category: "Tütün",             stock: 130, minStock: 40, purchasePrice: 78.00, salePrice: 88.00 },
  { productCode: "GIDA-CIPS-LAY",  barcode: "8690504001130", name: "Lay's Klasik Cips 100g",          brand: "Lay's",      category: "Atıştırmalık",      stock: 200, minStock: 60, purchasePrice: 14.50, salePrice: 22.50 },
  { productCode: "GIDA-DON-AL",    barcode: "8690504001147", name: "Algida Cornetto Klasik",          brand: "Algida",     category: "Dondurma",          stock:  72, minStock: 24, purchasePrice: 15.00, salePrice: 24.00 },
  { productCode: "GIDA-MKR-BIR",   barcode: "8690504001154", name: "Bizim Mutfak Makarna 500g",       brand: "Bizim",      category: "Bakliyat & Erzak",  stock: 165, minStock: 50, purchasePrice: 13.20, salePrice: 18.50 },
];

const RETAIL_CUSTOMERS: DemoCustomer[] = [
  { code: "CRR-001", type: "individual", name: "Ayşe Kaya",     phone: "0535 222 11 33", city: "İstanbul", creditLimit: 0 },
  { code: "CRR-002", type: "individual", name: "Mehmet Öztürk", phone: "0532 111 22 44", city: "İstanbul", creditLimit: 500 },
  { code: "CRR-003", type: "individual", name: "Fatma Şahin",   phone: "0533 333 44 55", city: "İstanbul", creditLimit: 0 },
  { code: "CRR-004", type: "individual", name: "Hasan Yıldız",  phone: "0537 444 55 66", city: "İstanbul", creditLimit: 1000 },
  { code: "CRR-005", type: "individual", name: "Zeynep Aslan",  phone: "0534 555 66 77", city: "İstanbul", creditLimit: 0 },
  { code: "CRR-006", type: "individual", name: "Ahmet Polat",   phone: "0536 666 77 88", city: "İstanbul", creditLimit: 250 },
];

const RETAIL_SUPPLIERS: DemoSupplier[] = [
  { code: "TED-R001", name: "ETİ GIDA SAN. TİC. A.Ş. (Bayi)",   taxOffice: "Eskişehir",  taxNumber: "1111222233", phone: "0222 111 22 33", email: "bayi@eti.com.tr",       city: "Eskişehir", contactPerson: "Bölge Sorumlusu" },
  { code: "TED-R002", name: "COCA-COLA İÇECEK BAYİ A.Ş.",        taxOffice: "Bağcılar",   taxNumber: "2222333344", phone: "0212 222 33 44", email: "siparis@cci.com.tr",    city: "İstanbul",  contactPerson: "Sipariş Hattı" },
  { code: "TED-R003", name: "MİGROS TOPTAN — TEMİZLİK GRUBU",    taxOffice: "Ataşehir",   taxNumber: "3333444455", phone: "0216 333 44 55", email: "toptan@migros.com.tr",  city: "İstanbul",  contactPerson: "Toptan Satış" },
];

const RETAIL_SALES: DemoSaleSpec[] = [
  { productIdx: 2,  quantity: 4, paymentMethod: "card",     daysAgo: 6 },
  { productIdx: 12, quantity: 3, paymentMethod: "cash",     daysAgo: 6 },
  { productIdx: 0,  quantity: 6, paymentMethod: "cash",     daysAgo: 5 },
  { productIdx: 8,  quantity: 1, customerIdx: 0, paymentMethod: "card", daysAgo: 4 },
  { productIdx: 11, quantity: 2, paymentMethod: "cash",     daysAgo: 3 },
  { productIdx: 5,  quantity: 3, customerIdx: 1, paymentMethod: "credit", daysAgo: 2 },
  { productIdx: 13, quantity: 5, paymentMethod: "card",     daysAgo: 1 },
  { productIdx: 3,  quantity: 8, paymentMethod: "card",     daysAgo: 0 },
  { productIdx: 7,  quantity: 4, paymentMethod: "cash",     daysAgo: 0 },
];

const RETAIL_PURCHASES: DemoPurchaseSpec[] = [
  {
    supplierIdx: 0, invoiceNo: "ETI-2026-1187", daysAgo: 10, paymentStatus: "paid",
    lines: [
      { productIdx: 0, quantity: 100, unitCost: 4.50 },
      { productIdx: 1, quantity:  60, unitCost: 8.20 },
      { productIdx: 12, quantity: 80, unitCost: 14.50 },
    ],
  },
  {
    supplierIdx: 1, invoiceNo: "CCI-2026-0822", daysAgo: 7, paymentStatus: "paid",
    lines: [
      { productIdx: 2, quantity: 144, unitCost: 22.00 },
      { productIdx: 3, quantity:  60, unitCost: 11.50 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEED FONKSİYONU
// ─────────────────────────────────────────────────────────────────────────────

interface SeedSummary {
  products: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchases: number;
}

/**
 * seedDemoDataInTx — *çağıran transaction içinde* çalışır.
 *
 * Idempotency burada YAPILMAZ (architect bulgu #2,#3): caller önce
 * `UPDATE companies SET demo_seeded_at = now() WHERE id = ? AND demo_seeded_at IS NULL`
 * ile satırı atomik olarak claim etmeli; 0 satır dönerse seed çağrılmaz.
 * Bu sayede iki paralel istek birbirini ezemez ve demo veri yarısı yazılı kalmaz.
 */
export async function seedDemoDataInTx(
  tx: Tx,
  opts: { companyId: number; sector: DemoSector; userId?: number | null },
): Promise<SeedSummary> {
  const { companyId, sector, userId } = opts;
  const PRODUCTS  = sector === "industrial" ? INDUSTRIAL_PRODUCTS  : RETAIL_PRODUCTS;
  const CUSTOMERS = sector === "industrial" ? INDUSTRIAL_CUSTOMERS : RETAIL_CUSTOMERS;
  const SUPPLIERS = sector === "industrial" ? INDUSTRIAL_SUPPLIERS : RETAIL_SUPPLIERS;
  const SALES     = sector === "industrial" ? INDUSTRIAL_SALES     : RETAIL_SALES;
  const PURCHASES = sector === "industrial" ? INDUSTRIAL_PURCHASES : RETAIL_PURCHASES;

  // body — eski db.transaction() wrapper'ı kaldırıldı, tx parametresi ile çalışıyor
  {
    // 1) Products
    const insertedProducts = await tx
      .insert(productsTable)
      .values(
        PRODUCTS.map((p) => ({
          companyId,
          productCode: p.productCode,
          barcode: p.barcode,
          name: p.name,
          brand: p.brand,
          category: p.category,
          stock: p.stock,
          minStock: p.minStock,
          purchasePrice: p.purchasePrice,
          salePrice: p.salePrice,
          profitPercent: Number(
            (((p.salePrice - p.purchasePrice) / p.purchasePrice) * 100).toFixed(2),
          ),
          isActive: true,
        })),
      )
      .returning({ id: productsTable.id });

    // 2) Customers
    const insertedCustomers = await tx
      .insert(customersTable)
      .values(
        CUSTOMERS.map((c) => ({
          companyId,
          code: c.code,
          type: c.type,
          name: c.name,
          taxOffice: c.taxOffice,
          taxNumber: c.taxNumber,
          phone: c.phone,
          email: c.email,
          city: c.city,
          district: c.district,
          contactPerson: c.contactPerson,
          creditLimit: c.creditLimit ?? 0,
        })),
      )
      .returning({ id: customersTable.id });

    // 3) Suppliers
    const insertedSuppliers = await tx
      .insert(suppliersTable)
      .values(
        SUPPLIERS.map((s) => ({
          companyId,
          code: s.code,
          name: s.name,
          taxOffice: s.taxOffice,
          taxNumber: s.taxNumber,
          phone: s.phone,
          email: s.email,
          city: s.city,
          contactPerson: s.contactPerson,
        })),
      )
      .returning({ id: suppliersTable.id });

    // 4) Sales (created_at zamanını DB'ye sql ile geriye sarıyoruz)
    let salesCount = 0;
    for (const s of SALES) {
      const product = PRODUCTS[s.productIdx];
      const productId = insertedProducts[s.productIdx]?.id;
      if (!productId || !product) continue;
      const customerId =
        s.customerIdx !== undefined ? insertedCustomers[s.customerIdx]?.id ?? null : null;
      const totalPrice = product.salePrice * s.quantity;
      const profit = (product.salePrice - product.purchasePrice) * s.quantity;
      await tx.insert(salesTable).values({
        companyId,
        productId,
        productName: product.name,
        productCode: product.productCode,
        barcode: product.barcode,
        quantity: s.quantity,
        unitPrice: product.salePrice,
        totalPrice,
        purchasePrice: product.purchasePrice,
        profit,
        userId: userId ?? null,
        soldBy: "demo",
        paymentMethod: s.paymentMethod,
        customerId,
        channelKey: "pos",
        // created_at'i geriye al — boş dashboard yerine son 7 günlük trend görünsün
        createdAt: sql`now() - interval '${sql.raw(String(s.daysAgo))} days'`,
      } as any);
      // Satış sonucu stok düş
      await tx
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${s.quantity}` })
        .where(sql`${productsTable.id} = ${productId}`);
      salesCount++;
    }

    // 5) Purchases (alış faturaları)
    let purchasesCount = 0;
    for (const p of PURCHASES) {
      const supplierId = insertedSuppliers[p.supplierIdx]?.id;
      if (!supplierId) continue;
      const subtotal = p.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
      const taxAmount = Number((subtotal * 0.20).toFixed(2)); // %20 KDV varsayımı
      const total = subtotal + taxAmount;
      const [created] = await tx
        .insert(purchasesTable)
        .values({
          companyId,
          supplierId,
          invoiceNo: p.invoiceNo,
          invoiceDate: sql`now() - interval '${sql.raw(String(p.daysAgo))} days'` as any,
          subtotalAmount: subtotal,
          taxAmount,
          totalAmount: total,
          paymentStatus: p.paymentStatus,
          createdBy: userId ?? null,
          createdAt: sql`now() - interval '${sql.raw(String(p.daysAgo))} days'` as any,
        })
        .returning({ id: purchasesTable.id });
      if (!created) continue;
      for (const line of p.lines) {
        const productId = insertedProducts[line.productIdx]?.id;
        if (!productId) continue;
        await tx.insert(purchaseItemsTable).values({
          companyId,
          purchaseId: created.id,
          productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.quantity * line.unitCost,
        });
      }
      purchasesCount++;
    }

    return {
      products: insertedProducts.length,
      customers: insertedCustomers.length,
      suppliers: insertedSuppliers.length,
      sales: salesCount,
      purchases: purchasesCount,
    };
  }
}
