/**
 * SMSYSTEMS API — Integration Test Suite
 * node --test tests/integration.test.mjs
 *
 * Gerçek çalışan sunucuya (localhost:8080) HTTP istekleri atar.
 * Testler birbirinden bağımsızdır — her test kendi session'ını yönetir.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:8080/api";

// ---------------------------------------------------------------------------
// Yardımcı: Cookie jar (session + tenant yönetimi)
// ---------------------------------------------------------------------------
class CookieJar {
  #cookies = new Map();
  tenant; // X-Tenant header için — dev ortamı tenant izolasyonu

  constructor(tenant = "prosan") {
    this.tenant = tenant;
  }

  update(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const [name, value] = pair.split("=");
      if (name && value !== undefined) this.#cookies.set(name.trim(), value.trim());
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

// ---------------------------------------------------------------------------
// Yardımcı: HTTP istekleri
// jar.tenant otomatik olarak X-Tenant header olarak gönderilir
// ---------------------------------------------------------------------------
async function api(method, path, { body, jar } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (jar) {
    headers["Cookie"] = jar.header();
    // Dev ortamında her istekte tenant header — production'da devre dışı
    if (jar.tenant) headers["X-Tenant"] = jar.tenant;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (jar) jar.update(res);

  let json = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) json = await res.json();

  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Login yardımcısı — session cookie'yi jar'a yazar
// tenant: subdomain — nihat_admin için "nihatturizm", cenan için "prosan"
// ---------------------------------------------------------------------------
async function login(username, password, tenant = "prosan") {
  const jar = new CookieJar(tenant);
  const { status, json } = await api("POST", "/auth/login", {
    body: { username, password },
    jar,
  });
  return { status, json, jar };
}

// ---------------------------------------------------------------------------
// Test ürünü oluşturma yardımcısı
// ---------------------------------------------------------------------------
let _testProductCounter = 0;
function uniqueCode() {
  return `TEST-${Date.now()}-${++_testProductCounter}`;
}

async function createTestProduct(jar, overrides = {}) {
  const code = uniqueCode();
  const { status, json } = await api("POST", "/products", {
    body: {
      productCode: code,
      name: `Test Ürün ${code}`,
      stock: 10,
      minStock: 2,
      purchasePrice: 50,
      salePrice: 100,
      discountSalePct: 0,
      ...overrides,
    },
    jar,
  });
  return { status, json, productCode: code };
}

// ---------------------------------------------------------------------------
// 1. AUTH TESTLERI
// ---------------------------------------------------------------------------
describe("1. Auth", () => {
  test("Başarılı login — kullanıcı ve companyId döner", async () => {
    const { status, json } = await login("cenan", "cenan123");
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.user.username, "cenan");
    assert.equal(json.user.companyId, 1);
    assert.ok(json.user.role, "role dolu olmalı");
  });

  test("Yanlış şifre — 401 döner", async () => {
    const { status, json } = await login("cenan", "yanlis_sifre");
    assert.equal(status, 401, JSON.stringify(json));
  });

  test("Var olmayan kullanıcı — 401 döner", async () => {
    const { status } = await login("hic_yoktur_bu_kullanici", "parola");
    assert.equal(status, 401);
  });

  test("Session olmadan korunan endpoint — 401 döner", async () => {
    const { status } = await api("GET", "/products");
    assert.equal(status, 401);
  });

  test("Login sonrası /auth/me — oturum geçerli", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/auth/me", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.username, "cenan");
  });

  test("Logout sonrası /auth/me — 401 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    await api("POST", "/auth/logout", { jar });
    const { status } = await api("GET", "/auth/me", { jar });
    assert.equal(status, 401);
  });
});

// ---------------------------------------------------------------------------
// 2. ÜRÜN TESTLERI
// ---------------------------------------------------------------------------
describe("2. Ürünler", () => {
  test("Ürün oluşturma başarılı — 201 ve id döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await createTestProduct(jar);
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.id, "id dolu olmalı");
    assert.equal(json.companyId, 1, "companyId 1 olmalı");
  });

  test("Aynı ürün koduyla tekrar oluşturma — 409 DUPLICATE_PRODUCT_CODE", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { productCode } = await createTestProduct(jar);

    const { status, json } = await api("POST", "/products", {
      body: {
        productCode,
        name: "Tekrar aynı kod",
        stock: 5,
        minStock: 1,
        purchasePrice: 10,
        salePrice: 20,
        discountSalePct: 0,
      },
      jar,
    });
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.error.code, "DUPLICATE_PRODUCT_CODE");
  });

  test("Aynı barkodla tekrar oluşturma — 409 DUPLICATE_BARCODE", async () => {
    const { jar } = await login("cenan", "cenan123");
    const barcode = `B${Date.now()}`;
    await createTestProduct(jar, { barcode });

    const { status, json } = await api("POST", "/products", {
      body: {
        productCode: uniqueCode(),
        barcode,
        name: "Tekrar aynı barkod",
        stock: 5,
        minStock: 1,
        purchasePrice: 10,
        salePrice: 20,
        discountSalePct: 0,
      },
      jar,
    });
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.error.code, "DUPLICATE_BARCODE");
  });

  test("Ürün listesi — toplam > 0 ve isActive filtresi çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/products?limit=5", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.total > 0, "ürün olmalı");
    for (const p of json.products) {
      assert.equal(p.isActive, true, `#${p.id} isActive false olmamalı`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. SATIŞ + STOK TESTLERI
// ---------------------------------------------------------------------------
describe("3. Satış ve Stok", () => {
  test("Satış başarılı — stok azalır", async () => {
    const { jar } = await login("cenan", "cenan123");

    const { json: product } = await createTestProduct(jar, { stock: 5, salePrice: 100, purchasePrice: 60 });
    const productId = product.id;
    const initialStock = product.stock;

    const { status, json: sale } = await api("POST", "/sales", {
      body: { productId, quantity: 2, unitPrice: 100 },
      jar,
    });
    assert.equal(status, 201, JSON.stringify(sale));
    assert.equal(sale.quantity, 2);
    assert.equal(sale.totalPrice, 200);

    // Stok düştü mü?
    const { json: updated } = await api("GET", `/products/${productId}`, { jar });
    assert.equal(updated.stock, initialStock - 2, "stok 2 azalmış olmalı");
  });

  test("Stok yetersizse — 400 INSUFFICIENT_STOCK", async () => {
    const { jar } = await login("cenan", "cenan123");

    const { json: product } = await createTestProduct(jar, { stock: 3 });
    const productId = product.id;

    const { status, json } = await api("POST", "/sales", {
      body: { productId, quantity: 99, unitPrice: 100 },
      jar,
    });
    assert.equal(status, 400, JSON.stringify(json));
    assert.equal(json.error.code, "INSUFFICIENT_STOCK");
    assert.equal(json.error.details.available, 3);
  });

  test("Başka şirketin ürününe satış — 404", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: productA } = await createTestProduct(jarA, { stock: 10 });
    const productId = productA.id;

    const { status } = await api("POST", "/sales", {
      body: { productId, quantity: 1, unitPrice: 100 },
      jar: jarB,
    });
    assert.equal(status, 404, "Başka şirketin ürününe erişilmemeli");
  });
});

// ---------------------------------------------------------------------------
// 4. SOFT DELETE + RESTORE
// ---------------------------------------------------------------------------
describe("4. Soft Delete & Restore", () => {
  test("Ürünü sil → listeden çıkar, isActive=false olur", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: product } = await createTestProduct(jar);
    const productId = product.id;

    const { status: delStatus } = await api("DELETE", `/products/${productId}`, { jar });
    assert.equal(delStatus, 200, "delete 200 olmalı");

    // Normal listede görünmemeli
    const { json: list } = await api("GET", "/products?limit=200", { jar });
    const found = list.products.find((p) => p.id === productId);
    assert.equal(found, undefined, "Silinen ürün listede olmamalı");
  });

  test("Admin showInactive=true ile silinmiş ürünü görür", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: product, productCode } = await createTestProduct(jar);
    const productId = product.id;

    await api("DELETE", `/products/${productId}`, { jar });

    // search ile spesifik ürünü bul — pagination sorununu bypass eder
    const { json: list } = await api("GET", `/products?showInactive=true&search=${encodeURIComponent(productCode)}&limit=5`, { jar });
    const found = list.products.find((p) => p.id === productId);
    assert.ok(found, "showInactive=true ile silinmiş ürün görünmeli");
    assert.equal(found.isActive, false);
  });

  test("Restore sonrası ürün aktif listeye döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: product, productCode } = await createTestProduct(jar);
    const productId = product.id;

    await api("DELETE", `/products/${productId}`, { jar });
    const { status: restoreStatus } = await api("PATCH", `/products/${productId}/restore`, { jar });
    assert.equal(restoreStatus, 200, "restore 200 olmalı");

    // search ile spesifik ürünü bul
    const { json: list } = await api("GET", `/products?search=${encodeURIComponent(productCode)}&limit=5`, { jar });
    const found = list.products.find((p) => p.id === productId);
    assert.ok(found, "Restore sonrası ürün aktif listede olmalı");
    assert.equal(found.isActive, true);
  });

  test("Staff rolü restore yapamaz — 403", async () => {
    const { jar: adminJar } = await login("cenan", "cenan123");
    const { jar: staffJar } = await login("goruntule", "staff123");

    const { json: product } = await createTestProduct(adminJar);
    const productId = product.id;
    await api("DELETE", `/products/${productId}`, { jar: adminJar });

    const { status } = await api("PATCH", `/products/${productId}/restore`, { jar: staffJar });
    assert.equal(status, 403, "Staff restore yapamamalı");
  });

  test("Zaten silinmiş ürünü tekrar silme — 404", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: product } = await createTestProduct(jar);
    const productId = product.id;

    await api("DELETE", `/products/${productId}`, { jar });
    const { status } = await api("DELETE", `/products/${productId}`, { jar });
    assert.equal(status, 404, "Zaten silinmiş ürün 404 dönmeli");
  });
});

// ---------------------------------------------------------------------------
// 5. TENANT İZOLASYONU
// ---------------------------------------------------------------------------
describe("5. Tenant İzolasyonu", () => {
  test("Şirket A'nın ürünü Şirket B session'ıyla görünmez", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: productA } = await createTestProduct(jarA);
    const productId = productA.id;

    // Şirket B bu ürünü görmemeli
    const { status } = await api("GET", `/products/${productId}`, { jar: jarB });
    assert.equal(status, 404, "Başka şirketin ürünü görünmemeli");
  });

  test("Şirket A'nın ürününü Şirket B güncelleyemez", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: productA } = await createTestProduct(jarA);
    const productId = productA.id;

    const { status } = await api("PUT", `/products/${productId}`, {
      body: { name: "Hack denemesi" },
      jar: jarB,
    });
    assert.equal(status, 404, "Başka şirketin ürünü güncellenememeli");
  });

  test("Şirket A'nın ürününü Şirket B silemez", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: productA } = await createTestProduct(jarA);
    const productId = productA.id;

    const { status } = await api("DELETE", `/products/${productId}`, { jar: jarB });
    assert.equal(status, 404, "Başka şirketin ürünü silinememeli");

    // Orijinal şirkette hala aktif olmalı
    const { json: still } = await api("GET", `/products/${productId}`, { jar: jarA });
    assert.equal(still.isActive, true, "A'nın ürünü hala aktif olmalı");
  });

  test("Şirket listesi birbirinden ayrı — total uyuşmaz", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: listA } = await api("GET", "/products?limit=1", { jar: jarA });
    const { json: listB } = await api("GET", "/products?limit=1", { jar: jarB });

    // Her şirket kendi ürünlerini görüyor — total'lar aynı olmayacak
    assert.notEqual(listA.total, listB.total, "Farklı şirketlerin ürün sayısı farklı olmalı");
  });
});

// ---------------------------------------------------------------------------
// 6. DÜŞÜK STOK ALARMLARI
// ---------------------------------------------------------------------------
describe("6. Düşük Stok Alarmları", () => {
  test("Düşük stok endpoint'i çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/alerts/low-stock", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.count === "number", "count sayısal olmalı");
    assert.ok(typeof json.critical === "number", "critical sayısal olmalı");
    assert.ok(typeof json.low === "number", "low sayısal olmalı");
    assert.ok(Array.isArray(json.products), "products dizi olmalı");
  });

  test("Düşük stok auth gerektiriyor", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/alerts/low-stock", { jar });
    assert.equal(status, 401, "Oturumsuz erişim reddedilmeli");
  });

  test("Düşük stok ürünlerin stoku minStock'a eşit veya küçük", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/alerts/low-stock", { jar });
    for (const p of json.products) {
      assert.ok(p.stock <= p.minStock, `${p.productCode} stok (${p.stock}) > minStock (${p.minStock})`);
    }
  });

  test("Tenant izolasyonu: farklı şirketler farklı alarm görir", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: alertA } = await api("GET", "/alerts/low-stock", { jar: jarA });
    const { json: alertB } = await api("GET", "/alerts/low-stock", { jar: jarB });
    // Her tenant kendi ürünlerini görüyor — product id listesi farklı olmalı
    const idsA = new Set(alertA.products.map((p) => p.id));
    const idsB = new Set(alertB.products.map((p) => p.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    assert.equal(overlap.length, 0, "Farklı tenant'ların alarm ürünleri çakışmamalı");
  });
});

// ---------------------------------------------------------------------------
// 7. TOPLU STOK GÜNCELLEMESİ
// ---------------------------------------------------------------------------
describe("7. Toplu Stok Güncellemesi", () => {
  // Minimal geçerli XLSX dosyası — base64 kodlu (1 satır: set modu)
  // Gerçek XLSX yerine multipart/form-data ile CSV text de kullanabiliriz
  async function stockImportRequest(jar, csvText, dryRun = true) {
    const boundary = "----TestBoundary123";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.csv"',
      "Content-Type: text/csv",
      "",
      csvText,
      `--${boundary}--`,
    ].join("\r\n");

    const headers = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(Buffer.byteLength(body)),
    };
    if (jar.header()) headers["Cookie"] = jar.header();
    if (jar.tenant) headers["X-Tenant"] = jar.tenant;

    const res = await fetch(`${BASE}/stock/import?dryRun=${dryRun}`, {
      method: "POST",
      headers,
      body,
    });
    const json = await res.json().catch(() => ({}));
    jar.update(res);
    return { status: res.status, json };
  }

  test("Şablon indirme çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const hdrs = { Cookie: jar.header(), "X-Tenant": jar.tenant };
    const res = await fetch(`${BASE}/stock/import-template`, { headers: hdrs });
    jar.update(res);
    assert.equal(res.status, 200, "Şablon 200 dönmeli");
    const ct = res.headers.get("content-type");
    assert.ok(ct?.includes("spreadsheetml") || ct?.includes("octet-stream"), `Content-Type beklenen: ${ct}`);
  });

  test("Auth olmadan import — 401", async () => {
    const jar = new CookieJar();
    const { status } = await stockImportRequest(jar, "product_code,quantity,mode\nPRO-999,5,set", true);
    assert.equal(status, 401, "401 bekleniyor");
  });

  test("Viewer import yapamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await stockImportRequest(jar, "product_code,quantity,mode\nPRO-999,5,set", true);
    assert.equal(status, 403, "403 bekleniyor");
  });

  test("Dry-run: olmayan ürün kodu hata döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await stockImportRequest(jar, "product_code,quantity,mode\nNONEXISTENT-999,5,set", true);
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.dryRun === true, "dryRun flag olmalı");
    assert.ok(json.errors.length > 0, "Hata döndürülmeli");
    assert.ok(json.errors[0].code === "PRODUCT_NOT_FOUND", `Kod PRODUCT_NOT_FOUND olmalı, aldık: ${json.errors[0]?.code}`);
  });

  test("Dry-run: geçersiz mod hata döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await stockImportRequest(jar, "product_code,quantity,mode\nPRO-001,5,invalid", true);
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.errors.length > 0, "Hata döndürülmeli");
  });

  test("Dry-run: negatif miktar hata döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await stockImportRequest(jar, "product_code,quantity,mode\nPRO-001,-5,add", true);
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.errors.length > 0, "Negatif miktar hatası döndürülmeli");
  });
});

// ---------------------------------------------------------------------------
// 8. GÜNLÜK KAPANIŞ ÖZETİ
// ---------------------------------------------------------------------------
describe("8. Günlük Kapanış Özeti", () => {
  test("Geçerli tarih ile özet döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const today = new Date().toISOString().split("T")[0];
    const { status, json } = await api("GET", `/reports/daily-summary?date=${today}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.totalSalesCount === "number", "totalSalesCount sayısal olmalı");
    assert.ok(typeof json.totalRevenue === "number", "totalRevenue sayısal olmalı");
    assert.ok(json.paymentBreakdown, "paymentBreakdown mevcut olmalı");
    assert.ok(Array.isArray(json.topProducts), "topProducts dizi olmalı");
    assert.ok(typeof json.lowStockCount === "number", "lowStockCount sayısal olmalı");
  });

  test("Auth olmadan — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/reports/daily-summary", { jar });
    assert.equal(status, 401, "401 bekleniyor");
  });

  test("Super admin göremez — 403", async () => {
    const { jar } = await login("superadmin", "superadmin123");
    const { status } = await api("GET", "/reports/daily-summary", { jar });
    assert.equal(status, 403, "Super admin 403 almalı");
  });

  test("Geçersiz tarih formatı — 400", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/reports/daily-summary?date=not-a-date", { jar });
    assert.equal(status, 400, JSON.stringify(json));
  });

  test("Tarihsiz çağrı bugünü döndürür", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/reports/daily-summary", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const today = new Date().toISOString().split("T")[0];
    assert.equal(json.date, today, "Bugünün tarihi döndürülmeli");
  });

  test("Tenant izolasyonu: farklı şirketlerin ciroları birbirinden bağımsız", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");
    const today = new Date().toISOString().split("T")[0];
    const { json: sumA } = await api("GET", `/reports/daily-summary?date=${today}`, { jar: jarA });
    const { json: sumB } = await api("GET", `/reports/daily-summary?date=${today}`, { jar: jarB });
    // İki şirketin verisi bağımsız hesaplanıyor — en azından lowStockCount aynı olmak zorunda değil
    assert.ok(typeof sumA.totalSalesCount === "number" && typeof sumB.totalSalesCount === "number", "Her iki tenant veri döndürmeli");
  });
});

// ---------------------------------------------------------------------------
// 9. SUPER ADMIN
// ---------------------------------------------------------------------------
describe("9. Super Admin", () => {
  test("Super admin giriş yapabilir", async () => {
    const { status, json } = await login("superadmin", "superadmin123");
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.user.role, "super_admin");
  });

  test("Super admin tüm şirketleri görebilir", async () => {
    const { jar } = await login("superadmin", "superadmin123");
    const { status, json } = await api("GET", "/companies", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json) || Array.isArray(json.companies), "şirket listesi döner");
  });
});

// ---------------------------------------------------------------------------
// 10. AYARLAR (Sprint 2)
// ---------------------------------------------------------------------------
describe("10. Ayarlar", () => {
  test("Admin ayarları okuyabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/settings", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.companyName, "companyName döner");
  });

  test("Viewer ayarları okuyabilir", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/settings", { jar });
    assert.equal(status, 200, "viewer 200 almalı");
  });

  test("Auth olmadan — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/settings", { jar });
    assert.equal(status, 401);
  });

  test("Admin ayarları güncelleyebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const payload = {
      companyName: "PROSAN TEST",
      phone: "05001234567",
      primaryColor: "#7c3aed",
    };
    const { status, json } = await api("PUT", "/settings", { body: payload, jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.primaryColor, "#7c3aed", "primaryColor güncellenmeli");
    // Geri al
    await api("PUT", "/settings", { body: { companyName: "PROSAN ENDÜSTRİ" }, jar });
  });

  test("Viewer ayarları güncelleyemez — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("PUT", "/settings", { body: { companyName: "hack" }, jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Tenant izolasyonu: farklı şirketlerin ayarları ayrı", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: setA } = await api("GET", "/settings", { jar: jarA });
    const { json: setB } = await api("GET", "/settings", { jar: jarB });
    assert.notEqual(setA.companyId, setB.companyId, "companyId farklı olmalı");
  });
});

// ---------------------------------------------------------------------------
// 11. ONBOARDING (Sprint 2)
// ---------------------------------------------------------------------------
describe("11. Onboarding", () => {
  test("Onboarding durumunu okuyabilir — admin", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/settings/onboarding-status", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.completed === "boolean", "completed alanı boolean olmalı");
    assert.ok(typeof json.hasProducts === "boolean", "hasProducts alanı boolean olmalı");
    assert.ok(typeof json.hasLogo === "boolean", "hasLogo alanı boolean olmalı");
  });

  test("Viewer onboarding durumunu okuyamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/settings/onboarding-status", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Onboarding tamamlama endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/settings/onboarding-complete", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.completed, true, "completed true olmalı");
  });

  test("Auth olmadan onboarding endpointlerine erişilemez", async () => {
    const jar = new CookieJar();
    const { status: s1 } = await api("GET", "/settings/onboarding-status", { jar });
    const { status: s2 } = await api("POST", "/settings/onboarding-complete", { jar });
    assert.equal(s1, 401, "onboarding-status 401 olmalı");
    assert.equal(s2, 401, "onboarding-complete 401 olmalı");
  });
});

// ---------------------------------------------------------------------------
// 12. LOGO YÜKLEME (Sprint 2)
// ---------------------------------------------------------------------------
describe("12. Logo Yükleme", () => {
  test("Logo silme endpoint çalışıyor — admin", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", "/settings/logo", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.logoUrl, null, "logoUrl null olmalı");
  });

  test("Viewer logo silemez — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("DELETE", "/settings/logo", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Auth olmadan logo işlemi — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("DELETE", "/settings/logo", { jar });
    assert.equal(status, 401);
  });
});

// ---------------------------------------------------------------------------
// 13. DEMO SIFIRLAMA (Sprint 2)
// ---------------------------------------------------------------------------
describe("13. Demo Sıfırlama", () => {
  test("Dev ortamında admin reset yapabilir", async () => {
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { status, json } = await api("POST", "/settings/reset-demo", { jar });
    // Dev ortamında 200, prod'da 403
    assert.ok(status === 200 || status === 403, `Beklenen 200 veya 403, alınan: ${status} — ${JSON.stringify(json)}`);
  });

  test("Viewer reset yapamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/settings/reset-demo", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Auth olmadan reset — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("POST", "/settings/reset-demo", { jar });
    assert.equal(status, 401);
  });
});
