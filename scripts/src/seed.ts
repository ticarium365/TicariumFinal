import { db, usersTable, productsTable, salesTable, companySettingsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Users
  const adminHash = await bcrypt.hash("admin123", 10);
  const staffHash = await bcrypt.hash("staff123", 10);

  await db.insert(usersTable).values([
    { username: "admin", passwordHash: adminHash, fullName: "Sistem Yöneticisi", email: "admin@prosan.com.tr", role: "admin", isActive: true },
    { username: "personel", passwordHash: staffHash, fullName: "Ahmet Yılmaz", email: "ahmet@prosan.com.tr", role: "staff", isActive: true },
    { username: "goruntule", passwordHash: staffHash, fullName: "Mehmet Kaya", email: "mehmet@prosan.com.tr", role: "viewer", isActive: true },
  ]).onConflictDoNothing();

  // Company settings
  await db.insert(companySettingsTable).values({
    companyName: "PROSAN ENDÜSTRİ",
    iban: "TR12 0001 0002 0003 0004 0005 06",
    bankName: "Ziraat Bankası",
    accountHolder: "PROSAN ENDÜSTRİ LTD. ŞTİ.",
    phone: "+90 212 555 0101",
    email: "info@prosan.com.tr",
    address: "Organize Sanayi Bölgesi, 1. Cad. No:15, İstanbul",
  }).onConflictDoNothing();

  // Products
  const products = [
    { productCode: "PRO-001", barcode: "8690123456001", name: "Endüstriyel Rulman 6204", brand: "SKF", category: "Rulman", description: "Derin oluklu bilyalı rulman 6204-2RS", stock: 150, minStock: 20, purchasePrice: 45.00, salePrice: 72.00 },
    { productCode: "PRO-002", barcode: "8690123456002", name: "Endüstriyel Rulman 6206", brand: "SKF", category: "Rulman", description: "Derin oluklu bilyalı rulman 6206-2RS", stock: 85, minStock: 15, purchasePrice: 68.00, salePrice: 108.00 },
    { productCode: "PRO-003", barcode: "8690123456003", name: "Rulman 6305", brand: "FAG", category: "Rulman", description: "Tek sıralı derin oluklu rulman 6305", stock: 3, minStock: 10, purchasePrice: 95.00, salePrice: 152.00 },
    { productCode: "PRO-004", barcode: "8690123456004", name: "Kayış V-Belt A60", brand: "Gates", category: "Kayış-Kasnak", description: "Endüstriyel V kayışı A60", stock: 0, minStock: 10, purchasePrice: 28.00, salePrice: 45.00 },
    { productCode: "PRO-005", barcode: "8690123456005", name: "Kayış V-Belt B75", brand: "Gates", category: "Kayış-Kasnak", description: "Endüstriyel V kayışı B75", stock: 42, minStock: 8, purchasePrice: 38.00, salePrice: 61.00 },
    { productCode: "PRO-006", barcode: "8690123456006", name: "Zincir ASA 40-1 (Metre)", brand: "DID", category: "Zincir", description: "Standart ANSI zincir", stock: 1, minStock: 5, purchasePrice: 125.00, salePrice: 195.00 },
    { productCode: "PRO-007", barcode: "8690123456007", name: "Zincir ASA 50-1 (Metre)", brand: "DID", category: "Zincir", description: "ANSI 50 zincir", stock: 28, minStock: 5, purchasePrice: 165.00, salePrice: 258.00 },
    { productCode: "PRO-008", barcode: "8690123456008", name: "Elektrik Motoru 0.75kW", brand: "WEG", category: "Motor", description: "Üç fazlı asenkron motor 0.75kW 4 kutup", stock: 8, minStock: 3, purchasePrice: 1850.00, salePrice: 2960.00 },
    { productCode: "PRO-009", barcode: "8690123456009", name: "Elektrik Motoru 1.5kW", brand: "WEG", category: "Motor", description: "Üç fazlı asenkron motor 1.5kW 4 kutup", stock: 2, minStock: 3, purchasePrice: 2650.00, salePrice: 4240.00 },
    { productCode: "PRO-010", barcode: "8690123456010", name: "Redüktör SPN 50", brand: "Bonfiglioli", category: "Redüktör", description: "Helikal dişli redüktör SPN50 i=25", stock: 5, minStock: 2, purchasePrice: 3200.00, salePrice: 5120.00 },
    { productCode: "PRO-011", barcode: "8690123456011", name: "Hortum DN25 (Metre)", brand: "Parker", category: "Hidrolik", description: "Yüksek basınç hidrolik hortum DN25", stock: 35, minStock: 10, purchasePrice: 185.00, salePrice: 296.00 },
    { productCode: "PRO-012", barcode: "8690123456012", name: "Hidrolik Silindir 100x200", brand: "Bosch Rexroth", category: "Hidrolik", description: "Çift etkili hidrolik silindir Ø100mm 200mm strok", stock: 4, minStock: 2, purchasePrice: 4500.00, salePrice: 7200.00 },
    { productCode: "PRO-013", barcode: "8690123456013", name: "Gres Yağı 15kg", brand: "Shell", category: "Yağlama", description: "Endüstriyel gres yağı Gadus S2 V220 15kg", stock: 22, minStock: 5, purchasePrice: 420.00, salePrice: 672.00 },
    { productCode: "PRO-014", barcode: "8690123456014", name: "Bağlantı Flanşı PN16 DN50", brand: "Tecofi", category: "Bağlantı", description: "PN16 DN50 çelik flanş", stock: 60, minStock: 20, purchasePrice: 85.00, salePrice: 136.00 },
    { productCode: "PRO-015", barcode: "8690123456015", name: "Endüstriyel Filtre G1''", brand: "Watts", category: "Filtre", description: "Elek filtresi G1 inç bağlantı 100 mikron", stock: 18, minStock: 5, purchasePrice: 320.00, salePrice: 512.00 },
    { productCode: "PRO-016", barcode: "8690123456016", name: "Kontaktör 25A LC1D25", brand: "Schneider", category: "Elektrik", description: "Tesya LC1D25M7 25A 220V bobin", stock: 12, minStock: 5, purchasePrice: 450.00, salePrice: 720.00 },
    { productCode: "PRO-017", barcode: "8690123456017", name: "Termal Röle 18-25A", brand: "Schneider", category: "Elektrik", description: "LRD325 termal aşırı yük rölesi 18-25A", stock: 9, minStock: 4, purchasePrice: 280.00, salePrice: 448.00 },
    { productCode: "PRO-018", barcode: "8690123456018", name: "Pnömatik Silindir Ø63 200mm", brand: "SMC", category: "Pnömatik", description: "Standart çift etkili pnömatik silindir", stock: 7, minStock: 3, purchasePrice: 680.00, salePrice: 1088.00 },
    { productCode: "PRO-019", barcode: "8690123456019", name: "Solenoid Valf 5/2 G1/8", brand: "SMC", category: "Pnömatik", description: "5/2 yollu G1/8 monostabil solenoid valf 24VDC", stock: 15, minStock: 5, purchasePrice: 380.00, salePrice: 608.00 },
    { productCode: "PRO-020", barcode: "8690123456020", name: "Mil Bağlantısı Elastik Kaplin D55", brand: "Miki Pulley", category: "Kavrama", description: "Elastik kaplin D55 L78 6-28mm", stock: 11, minStock: 3, purchasePrice: 520.00, salePrice: 832.00 },
  ];

  for (const p of products) {
    const profitPercent = ((p.salePrice - p.purchasePrice) / p.purchasePrice) * 100;
    await db.insert(productsTable).values({
      ...p,
      profitPercent,
    }).onConflictDoNothing();
  }

  console.log("Seed completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
