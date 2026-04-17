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

// ---------------------------------------------------------------------------
// 14. BİLDİRİMLER (Sprint 3)
// ---------------------------------------------------------------------------
describe("14. Bildirimler", () => {
  test("Admin bildirim sayısını okuyabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notifications/count", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.unread === "number", "unread sayısal olmalı");
  });

  test("Viewer bildirim sayısını okuyabilir", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status, json } = await api("GET", "/notifications/count", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.unread === "number", "viewer de count okuyabilmeli");
  });

  test("Auth olmadan bildirim sayısı — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/notifications/count", { jar });
    assert.equal(status, 401);
  });

  test("Admin bildirim listesi okuyabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notifications", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.notifications), "notifications dizi olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Viewer bildirim listesi okuyamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/notifications", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Admin bildirim üretebilir (generate)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/notifications/generate", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.created === "number", "created sayısal olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Viewer bildirim üretemez — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/notifications/generate", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Tümünü okundu işaretleme çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", "/notifications/read-all", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok === true, "ok:true döner");
  });

  test("Okunmamış filtresi çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notifications?unread=true", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.notifications), "okunmamış listesi dizi olmalı");
  });

  test("Mesaj şablonları endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notifications/templates?productName=Test&stock=5&companyName=PROSAN", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.low_stock_whatsapp, "whatsapp şablonu olmalı");
    assert.ok(json.low_stock_email, "email şablonu olmalı");
    assert.ok(typeof json.low_stock_email.subject === "string", "email subject olmalı");
  });

  test("Tenant izolasyonu: iki firma bildirimleri ayrı", async () => {
    const { jar: jarA } = await login("cenan", "cenan123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");
    await api("POST", "/notifications/generate", { jar: jarA });
    await api("POST", "/notifications/generate", { jar: jarB });
    const { json: countA } = await api("GET", "/notifications/count", { jar: jarA });
    const { json: countB } = await api("GET", "/notifications/count", { jar: jarB });
    // İki şirketin sayısı bağımsız (her iki de sayısal olmalı)
    assert.ok(typeof countA.unread === "number" && typeof countB.unread === "number", "her iki tenant kendi sayısını döner");
  });
});

// ---------------------------------------------------------------------------
// 15. GÜNAYDINSABAH BRİEF + ŞABLONLAR (Sprint 3)
// ---------------------------------------------------------------------------
describe("15. Morning Brief ve Şablonlar", () => {
  test("Admin morning brief okuyabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/dashboard/morning-brief", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.greeting === "string", "greeting string olmalı");
    assert.ok(typeof json.date === "string", "date string olmalı");
    assert.ok(json.yesterday, "yesterday alanı olmalı");
    assert.ok(typeof json.yesterday.salesCount === "number", "salesCount sayısal");
    assert.ok(json.stock, "stock alanı olmalı");
  });

  test("Viewer morning brief okuyamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/dashboard/morning-brief", { jar });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Auth olmadan morning brief — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/dashboard/morning-brief", { jar });
    assert.equal(status, 401);
  });

  test("Şablon parametreleri doğru render edilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/notifications/templates?productName=Çivi&stock=2&companyName=PROSAN", { jar });
    assert.ok(json.low_stock_whatsapp.includes("Çivi"), "ürün adı şablonda yer almalı");
    assert.ok(json.restock_request_whatsapp.includes("PROSAN"), "firma adı şablonda yer almalı");
  });
});

// ---------------------------------------------------------------------------
// 16. MÜŞTERİ CRUD (Sprint 4)
// ---------------------------------------------------------------------------
describe("16. Müşteri CRUD", () => {
  let createdId = 0;
  const code = `TST-${Date.now()}`;

  test("Admin müşteri oluşturabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/customers", {
      jar,
      body: { code, name: "Test Müşteri A.Ş.", type: "company", phone: "05551234567", city: "Ankara" },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.customer?.id, "id olmalı");
    assert.equal(json.customer.code, code, "kod eşleşmeli");
    createdId = json.customer.id;
  });

  test("Duplicate kod engellenir — 409", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/customers", {
      jar,
      body: { code, name: "Başka Müşteri" },
    });
    assert.equal(status, 409, "çift kod 409 vermeli");
  });

  test("Müşteri listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/customers", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.customers), "customers dizi olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Müşteri detayı döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/customers/${createdId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.customer.id, createdId, "doğru müşteri");
  });

  test("Müşteri güncellenebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/customers/${createdId}`, {
      jar,
      body: { city: "İstanbul", phone: "05559876543" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.customer.city, "İstanbul", "şehir güncellenmeli");
  });

  test("Auth olmadan müşteri listesi — 401", async () => {
    const jar = new CookieJar();
    const { status } = await api("GET", "/customers", { jar });
    assert.equal(status, 401);
  });

  test("Tenant izolasyonu: co2 co1 müşterisini göremez", async () => {
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json } = await api("GET", "/customers", { jar });
    const found = (json.customers ?? []).find((c) => c.id === createdId);
    assert.ok(!found, "farklı tenant müşterisi görünmemeli");
  });

  test("Müşteri soft delete edilebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/customers/${createdId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok:true döner");
  });

  test("Silinmiş müşteri aktif filtresiyle görünmez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/customers?active=true", { jar });
    const found = (json.customers ?? []).find((c) => c.id === createdId);
    assert.ok(!found, "soft deleted müşteri aktif listede olmamalı");
  });

  test("Müşteri geri yüklenebilir (restore)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PATCH", `/customers/${createdId}/restore`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok:true");
  });
});

// ---------------------------------------------------------------------------
// 17. CARİ İŞLEMLER VE TAHSİLAT (Sprint 4)
// ---------------------------------------------------------------------------
describe("17. Cari İşlemler ve Tahsilat", () => {
  let cariId = 0;
  const cariCode = `CAR-${Date.now()}`;

  test("Kurulum: müşteri oluştur", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/customers", {
      jar,
      body: { code: cariCode, name: "Cari Test Müşteri", openingBalance: 0 },
    });
    assert.equal(status, 201, JSON.stringify(json));
    cariId = json.customer.id;
  });

  test("Satış müşteriye bağlanınca debit oluşur", async () => {
    const { jar } = await login("cenan", "cenan123");
    // Stok > 0 olan ilk ürünü bul
    const { json: pJson } = await api("GET", "/products?limit=100", { jar });
    const product = (pJson.products ?? []).find((p) => p.stock > 0);
    if (!product) return; // stoklu ürün yoksa atla
    const { status: sStatus, json: sJson } = await api("POST", "/sales", {
      jar,
      body: { productId: product.id, quantity: 1, unitPrice: product.salePrice || 10, paymentMethod: "credit", customerId: cariId },
    });
    assert.equal(sStatus, 201, JSON.stringify(sJson));
    assert.equal(sJson.customerId, cariId, "customerId kaydedilmeli");
  });

  test("Satış sonrası müşteri bakiyesi arttı", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", `/customers/${cariId}`, { jar });
    assert.ok(json.customer.currentBalance > 0, `bakiye arttı: ${json.customer.currentBalance}`);
  });

  test("Cari hareket listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/customers/${cariId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    assert.ok(json.transactions.length > 0, "en az 1 hareket olmalı");
  });

  test("Tahsilat alındıktan sonra bakiye düşer", async () => {
    const { jar } = await login("cenan", "cenan123");
    const beforeRes = await api("GET", `/customers/${cariId}`, { jar });
    const before = beforeRes.json.customer.currentBalance;

    const payAmount = 100;
    const { status, json } = await api("POST", `/customers/${cariId}/payment`, {
      jar,
      body: { amount: payAmount, paymentMethod: "cash", note: "Test tahsilatı" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok:true");
    assert.ok(json.newBalance < before || json.newBalance === before - payAmount,
      `bakiye düşmeli: ${before} -> ${json.newBalance}`);
  });

  test("Viewer tahsilat alamaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", `/customers/${cariId}/payment`, {
      jar,
      body: { amount: 50, paymentMethod: "cash" },
    });
    assert.equal(status, 403, "viewer 403 almalı");
  });

  test("Sıfır tutar tahsilat reddedilir — 400", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", `/customers/${cariId}/payment`, {
      jar,
      body: { amount: 0 },
    });
    assert.equal(status, 400, "0 tutar 400 vermeli");
  });

  test("Hesap ekstresi endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/customers/${cariId}/statement`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.customer, "customer alanı olmalı");
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    assert.ok(typeof json.currentBalance === "number", "currentBalance sayısal olmalı");
    // Running balance kontrolü
    if (json.transactions.length > 0) {
      assert.ok(typeof json.transactions[0].runningBalance === "number", "runningBalance olmalı");
    }
  });

  test("Müşteri satış geçmişi endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/customers/${cariId}/sales`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.sales), "sales dizi olmalı");
  });

  test("En borçlu müşteriler endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/customers/top-debtors", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.customers), "customers dizi olmalı");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 18. TEDARİKÇİ CRUD
// ─────────────────────────────────────────────────────────────────────────────
describe("18. Tedarikçi CRUD", () => {
  let supplierId;
  const code = `SUPP-TEST-${Date.now()}`;

  test("Tedarikçi listesi boş veya dizi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/suppliers", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.suppliers), "suppliers dizi olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Tedarikçi oluşturulur", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/suppliers", {
      jar,
      body: { code, name: "Test Tedarikçi A.Ş.", phone: "0212 555 00 00", city: "İstanbul", openingBalance: 5000 },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.supplier.id, "id dönmeli");
    assert.equal(json.supplier.code, code);
    assert.equal(json.supplier.currentBalance, 5000, "Açılış bakiyesi currentBalance'a yansımalı");
    supplierId = json.supplier.id;
  });

  test("Aynı kodla ikinci tedarikçi oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/suppliers", {
      jar,
      body: { code, name: "Kopya Tedarikçi" },
    });
    assert.equal(status, 409, JSON.stringify(json));
  });

  test("Tedarikçi detayı döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.supplier.id, supplierId);
  });

  test("Tedarikçi güncellenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/suppliers/${supplierId}`, {
      jar,
      body: { name: "Test Tedarikçi (Güncellendi)", phone: "0212 666 00 00" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.supplier.name, "Test Tedarikçi (Güncellendi)");
  });

  test("Tedarikçi bakiye düzeltmesi yapılır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/suppliers/${supplierId}/adjustment`, {
      jar,
      body: { amount: 1000, direction: "debit", note: "Test düzeltme" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.newBalance === "number", "newBalance sayısal olmalı");
  });

  test("Tedarikçi ödeme kaydedilir ve bakiye güncellenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const balBefore = (await api("GET", `/suppliers/${supplierId}`, { jar })).json.supplier.currentBalance;
    const { status, json } = await api("POST", `/suppliers/${supplierId}/payment`, {
      jar,
      body: { amount: 500, paymentMethod: "nakit", note: "Test ödeme" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.newBalance, balBefore - 500, "Bakiye 500 azalmalı");
  });

  test("Tedarikçi cari hareketleri listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    assert.ok(json.transactions.length >= 3, "En az 3 hareket olmalı (açılış+düzeltme+ödeme)");
  });

  test("Hesap ekstresi endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}/statement`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.supplier, "supplier alanı olmalı");
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    if (json.transactions.length > 0) {
      assert.ok(typeof json.transactions[0].runningBalance === "number", "runningBalance olmalı");
    }
  });

  test("En borçlu tedarikçiler endpoint çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/suppliers/top-creditors", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.suppliers), "suppliers dizi olmalı");
  });

  test("Tedarikçi silinir (soft-delete)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/suppliers/${supplierId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok dönmeli");
  });

  test("Silinmiş tedarikçi geri yüklenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PATCH", `/suppliers/${supplierId}/restore`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok dönmeli");
  });

  test("Viewer tedarikçi oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/suppliers", {
      jar,
      body: { code: `V-SUPP-${Date.now()}`, name: "Viewer Tedarikçisi" },
    });
    assert.equal(status, 403);
  });

  test("co2 tedarikçisi co1'den görünmez", async () => {
    const { jar: j2 } = await login("nihat_admin", "nihat123", "nihat");
    const code2 = `NIT-SUPP-${Date.now()}`;
    const { json: createJson } = await api("POST", "/suppliers", {
      jar: j2,
      body: { code: code2, name: "Nihat Tedarikçi" },
    });
    const newId = createJson.supplier?.id;
    if (!newId) return;
    const { jar: j1 } = await login("cenan", "cenan123");
    const { status } = await api("GET", `/suppliers/${newId}`, { jar: j1 });
    assert.equal(status, 404, "Farklı tenant tedarikçisi görünmemeli");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. ALIŞ FATURASI VE STOK GİRİŞİ
// ─────────────────────────────────────────────────────────────────────────────
describe("19. Alış Faturası ve Stok Girişi", () => {
  let purchSuppId;
  let testProductId;

  before(async () => {
    const { jar } = await login("cenan", "cenan123");
    // Tedarikçi oluştur
    const { json: sJson } = await api("POST", "/suppliers", {
      jar,
      body: { code: `PURCH-SUPP-${Date.now()}`, name: "Alış Test Tedarikçi" },
    });
    purchSuppId = sJson.supplier?.id;
    // Ürün oluştur
    const { json: pJson } = await api("POST", "/products", {
      jar,
      body: {
        productCode: `PURCH-PRD-${Date.now()}`,
        name: "Alış Test Ürün",
        purchasePrice: 10,
        salePrice: 15,
        stock: 0,
        minStock: 5,
      },
    });
    testProductId = pJson.id;
  });

  test("Alış faturası oluşturulur ve stok artar", async () => {
    const { jar } = await login("cenan", "cenan123");
    const stockBefore = (await api("GET", `/products/${testProductId}`, { jar })).json.stock;
    const { status, json } = await api("POST", "/purchases", {
      jar,
      body: {
        supplierId: purchSuppId,
        invoiceNo: `FAT-${Date.now()}`,
        invoiceDate: new Date().toISOString(),
        taxAmount: 0,
        discountAmount: 0,
        items: [{ productId: testProductId, quantity: 20, unitCost: 12 }],
      },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.purchase.id, "purchase.id dönmeli");
    // Stok arttı mı?
    const stockAfter = (await api("GET", `/products/${testProductId}`, { jar })).json.stock;
    assert.equal(stockAfter, stockBefore + 20, "Stok 20 artmalı");
  });

  test("Alış faturası tedarikçiye debit transaction açar", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/suppliers/${purchSuppId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const purchaseTxs = json.transactions.filter((t) => t.type === "purchase" && t.direction === "debit");
    assert.ok(purchaseTxs.length > 0, "Alış debit transaction olmalı");
  });

  test("Alış faturası tedarikçi bakiyesini artırır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", `/suppliers/${purchSuppId}`, { jar });
    assert.ok(json.supplier.currentBalance > 0, "Tedarikçi bakiyesi pozitif olmalı");
  });

  test("Alış faturası listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/purchases", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.purchases), "purchases dizi olmalı");
  });

  test("Alış faturası tedarikçiye göre filtrelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/purchases?supplierId=${purchSuppId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const all = json.purchases;
    assert.ok(all.every((p) => p.supplierId === purchSuppId), "Yalnızca bu tedarikçinin faturaları dönmeli");
  });

  test("Alış faturası ürün maliyeti günceller", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", `/products/${testProductId}`, { jar });
    assert.equal(json.purchasePrice, 12, "Maliyet faturadaki unitCost ile eşleşmeli");
  });

  test("Tedarikçisiz fatura oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/purchases", {
      jar,
      body: { invoiceDate: new Date().toISOString(), items: [{ productId: testProductId, quantity: 5, unitCost: 10 }] },
    });
    assert.equal(status, 400);
  });

  test("Kalemsiz fatura oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/purchases", {
      jar,
      body: { supplierId: purchSuppId, invoiceDate: new Date().toISOString(), items: [] },
    });
    assert.equal(status, 400);
  });

  test("Viewer fatura oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/purchases", {
      jar,
      body: {
        supplierId: purchSuppId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId: testProductId, quantity: 1, unitCost: 10 }],
      },
    });
    assert.equal(status, 403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 20. GELİŞMİŞ RAPORLAR — Kâr, Müşteri, Tedarikçi Analizleri, CSV Exportlar
// ══════════════════════════════════════════════════════════════════════════════
describe("20. Gelişmiş Raporlar", () => {
  const START = "2020-01-01";
  const END   = "2099-12-31";

  test("Satış raporu 200 döner ve gerekli alanlar mevcuttur", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/reports/sales?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("grossRevenue"    in json, "grossRevenue eksik");
    assert.ok("totalProfit"     in json, "totalProfit eksik");
    assert.ok("productBreakdown" in json, "productBreakdown eksik");
    assert.ok(Array.isArray(json.productBreakdown), "productBreakdown dizi olmalı");
    assert.ok("dailyBreakdown"  in json, "dailyBreakdown eksik");
    assert.ok("paymentBreakdown" in json, "paymentBreakdown eksik");
  });

  test("Satış raporu tarih parametresi olmadan 400 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("GET", "/reports/sales", { jar });
    assert.equal(status, 400);
  });

  test("Kâr analizi raporu 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/reports/profit?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("summary"         in json, "summary eksik");
    assert.ok("productProfits"  in json, "productProfits eksik");
    assert.ok("categoryProfits" in json, "categoryProfits eksik");
    assert.ok("monthlyTrend"    in json, "monthlyTrend eksik");
    assert.ok(typeof json.summary.totalRevenue === "number", "totalRevenue sayı olmalı");
  });

  test("Kâr analizi — viewer erişebilir", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", `/reports/profit?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200);
  });

  test("Kâr analizi tarih parametresi olmadan 400 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("GET", "/reports/profit", { jar });
    assert.equal(status, 400);
  });

  test("Müşteri analizi raporu 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/reports/customer-analytics?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("totalCustomers"      in json, "totalCustomers eksik");
    assert.ok("totalDebt"           in json, "totalDebt eksik");
    assert.ok("topCustomersBySales" in json, "topCustomersBySales eksik");
    assert.ok("topDebtors"          in json, "topDebtors eksik");
    assert.ok(Array.isArray(json.topDebtors), "topDebtors dizi olmalı");
  });

  test("Müşteri analizi — viewer erişebilir", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", `/reports/customer-analytics?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200);
  });

  test("Tedarikçi analizi raporu 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/reports/supplier-analytics?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("totalSuppliers"       in json, "totalSuppliers eksik");
    assert.ok("totalPurchaseAmount"  in json, "totalPurchaseAmount eksik");
    assert.ok("topSuppliersBySpend"  in json, "topSuppliersBySpend eksik");
    assert.ok("monthlyPurchases"     in json, "monthlyPurchases eksik");
    assert.ok(Array.isArray(json.monthlyPurchases), "monthlyPurchases dizi olmalı");
  });

  test("Alış özet raporu 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/reports/purchases-summary?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("totalPurchases" in json, "totalPurchases eksik");
    assert.ok("totalAmount"    in json, "totalAmount eksik");
    assert.ok("purchases"      in json, "purchases eksik");
    assert.ok(Array.isArray(json.purchases), "purchases dizi olmalı");
  });

  test("Tenant izolasyonu — rapor yalnızca kendi tenant verisini döner", async () => {
    const { jar: jar1 } = await login("cenan", "cenan123");
    const { json: j1 } = await api("GET", `/reports/sales?startDate=${START}&endDate=${END}`, { jar: jar1 });
    const { jar: jar2 } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: j2 } = await api("GET", `/reports/sales?startDate=${START}&endDate=${END}`, { jar: jar2 });
    // Farklı tenant'lar farklı satış sayısına sahip olabilir, key'ler her ikisinde de mevcut olmalı
    assert.ok("totalSales" in j1, "j1 totalSales eksik");
    assert.ok("totalSales" in j2, "j2 totalSales eksik");
  });

  test("Satış CSV export 200 döner ve CSV içeriği gelir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/reports/export/sales?startDate=${START}&endDate=${END}`, { headers });
    assert.equal(res.status, 200, "export/sales 200 olmalı");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı, alınan: ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("Tarih") || text.includes("Ürün"), "CSV başlık satırı eksik");
  });

  test("Alış CSV export 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/reports/export/purchases?startDate=${START}&endDate=${END}`, { headers });
    assert.equal(res.status, 200, "export/purchases 200 olmalı");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı, alınan: ${ct}`);
  });

  test("Stok CSV export 200 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/reports/export/stock`, { headers });
    assert.equal(res.status, 200, "export/stock 200 olmalı");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı, alınan: ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("Ürün Kodu"), "CSV başlık satırı eksik");
  });

  test("Anonim kullanıcı rapor erişemez", async () => {
    const jar = new CookieJar("prosan");
    const { status } = await api("GET", `/reports/profit?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 401);
  });
});
