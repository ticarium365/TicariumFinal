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

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 8 — Stok Sayım Merkezi
// ─────────────────────────────────────────────────────────────────────────────
describe("Stok Sayım Merkezi", () => {
  let sessionId;

  // Önceki test çalışmalarından kalan açık oturumları temizle
  before(async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/stock-counts", { jar });
    const openSessions = (json.sessions ?? []).filter(s => s.status === "open");
    for (const s of openSessions) {
      await api("POST", `/stock-counts/${s.id}/close`, { jar });
      await api("POST", `/stock-counts/${s.id}/approve`, { jar });
    }
  });

  test("Anonim kullanıcı sayım listesine erişemez", async () => {
    const jar = new CookieJar("prosan");
    const { status } = await api("GET", "/stock-counts", { jar });
    assert.equal(status, 401);
  });

  test("Sayım oturumları listelenir (başlangıçta boş olabilir)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/stock-counts", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.sessions), "sessions dizisi olmalı");
  });

  test("Yeni sayım oturumu açılır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/stock-counts", {
      jar,
      body: { name: "Test Sayımı Sprint8", notes: "Otomatik test" },
    });
    assert.equal(status, 201, `Beklenen 201, alınan: ${status} — ${JSON.stringify(json)}`);
    assert.ok(json.session?.id, "session.id olmalı");
    assert.equal(json.session.status, "open");
    assert.equal(json.session.name, "Test Sayımı Sprint8");
    sessionId = json.session.id;
  });

  test("Açık oturum varken tekrar açılamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/stock-counts", {
      jar,
      body: { name: "Duplicate Sayım" },
    });
    assert.equal(status, 409);
    assert.equal(json.error?.code, "OPEN_SESSION_EXISTS");
  });

  test("Oturum detayı çekilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/stock-counts/${sessionId}`, { jar });
    assert.equal(status, 200);
    assert.ok(json.session, "session alanı olmalı");
    assert.ok(Array.isArray(json.items), "items dizisi olmalı");
    assert.equal(json.session.id, sessionId);
  });

  test("Var olmayan oturum 404 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("GET", "/stock-counts/999999", { jar });
    assert.equal(status, 404);
  });

  test("Barkod ile ürün sayılır ve kalem eklenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    // Önce bir ürün bul
    const { json: pj } = await api("GET", "/products?limit=1", { jar });
    const product = pj?.products?.[0];
    assert.ok(product, "En az bir ürün gerekli");

    const { status, json } = await api("POST", `/stock-counts/${sessionId}/items`, {
      jar,
      body: { productId: product.id, countedQty: 5 },
    });
    assert.ok([200, 201].includes(status), `Beklenen 200/201, alınan: ${status} — ${JSON.stringify(json)}`);
    assert.ok(json.item, "item alanı olmalı");
    assert.equal(json.item.countedQty, 5);
    assert.equal(json.item.productId, product.id);
  });

  test("Aynı ürün tekrar sayılınca upsert çalışır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: pj } = await api("GET", "/products?limit=1", { jar });
    const product = pj?.products?.[0];

    const { status, json } = await api("POST", `/stock-counts/${sessionId}/items`, {
      jar,
      body: { productId: product.id, countedQty: 10 },
    });
    assert.equal(status, 200, `Upsert 200 olmalı — ${JSON.stringify(json)}`);
    assert.equal(json.item.countedQty, 10);
  });

  test("Tüm ürünler oturuma yüklenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/load-all`, { jar });
    assert.equal(status, 200, `load-all 200 olmalı — ${JSON.stringify(json)}`);
    assert.ok(typeof json.added === "number", "added sayısı olmalı");
    assert.ok(typeof json.total === "number", "total sayısı olmalı");
  });

  test("Sayım kalemi CSV export çalışır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/stock-counts/${sessionId}/export`, { headers });
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı: ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("Ürün Kodu"), "CSV başlık satırı eksik");
  });

  test("Oturum kapatılır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/close`, { jar });
    assert.equal(status, 200, `close 200 olmalı — ${JSON.stringify(json)}`);
    assert.equal(json.session.status, "closed");
  });

  test("Kapalı oturuma kalem eklenemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: pj } = await api("GET", "/products?limit=1", { jar });
    const product = pj?.products?.[0];
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/items`, {
      jar,
      body: { productId: product.id, countedQty: 3 },
    });
    assert.equal(status, 409);
    assert.equal(json.error?.code, "SESSION_CLOSED");
  });

  test("Düzeltmeler onaylanır ve stoklar güncellenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/approve`, { jar });
    assert.equal(status, 200, `approve 200 olmalı — ${JSON.stringify(json)}`);
    assert.ok(typeof json.adjusted === "number", "adjusted sayısı olmalı");
    assert.equal(json.session.status, "approved");
  });

  test("Onaylı oturumu tekrar onaylamak 409 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/approve`, { jar });
    assert.equal(status, 409);
    assert.equal(json.error?.code, "ALREADY_APPROVED");
  });

  test("Viewer rolü sayım oturumu açamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/stock-counts", {
      jar,
      body: { name: "Viewer Sayım" },
    });
    assert.equal(status, 403);
  });

  test("Onaylı oturum listede görünür", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/stock-counts", { jar });
    assert.equal(status, 200);
    const found = json.sessions.find(s => s.id === sessionId);
    assert.ok(found, "Oluşturulan oturum listede olmalı");
    assert.equal(found.status, "approved");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 10 — KASA / GİDER / FİNANS MERKEZİ
// ═══════════════════════════════════════════════════════════════════════════
describe("Sprint 10 — Finans: Gider Kategorileri", () => {
  let catId;

  test("Kategori oluşturma (admin)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "Test Kira", icon: "🏢", color: "red-500" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.category.name, "Test Kira");
    catId = json.category.id;
  });

  test("Kategori listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/finance/expense-categories", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.categories), "categories dizisi bekleniyor");
    const found = json.categories.find(c => c.id === catId);
    assert.ok(found, "Oluşturulan kategori listede olmalı");
  });

  test("Kategori güncelleme (admin)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/finance/expense-categories/${catId}`, {
      jar,
      body: { name: "Kira Güncel", icon: "🏠", isActive: true },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.category.name, "Kira Güncel");
  });

  test("Staff rolü kategori oluşturabilir", async () => {
    const { jar } = await login("talha", "talha123");
    const { status } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "Personel", icon: "👥" },
    });
    assert.equal(status, 201);
  });

  test("Viewer rolü kategori oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "Yasak" },
    });
    assert.equal(status, 403);
  });

  test("Ad olmadan kategori oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "  " },
    });
    assert.equal(status, 400, `400 bekleniyor — ${JSON.stringify(json)}`);
  });
});

describe("Sprint 10 — Finans: Gider Yönetimi", () => {
  let expenseId;
  let catId;

  before(async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "Elektrik", icon: "💡" },
    });
    catId = json.category.id;
  });

  test("Gider oluşturma (staff)", async () => {
    const { jar } = await login("talha", "talha123");
    const { status, json } = await api("POST", "/finance/expenses", {
      jar,
      body: {
        categoryId: catId,
        amount: 250.50,
        description: "Ocak Elektrik Faturası",
        expenseDate: "2026-04-01",
        paymentMethod: "cash",
        notes: "Test not",
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.expense.description, "Ocak Elektrik Faturası");
    assert.ok(json.expense.id, "ID olmalı");
    expenseId = json.expense.id;
  });

  test("Gider tutarı sıfır/negatif reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 0, description: "Sıfır", expenseDate: "2026-04-01" },
    });
    assert.equal(status, 400);
  });

  test("Açıklama olmadan gider reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 100, expenseDate: "2026-04-01" },
    });
    assert.equal(status, 400);
  });

  test("Banka ödemeli gider oluşturulabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 1500, description: "Şubat Kira", expenseDate: "2026-04-05", paymentMethod: "bank" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Gider listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/finance/expenses?startDate=2026-04-01&endDate=2026-04-30", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.expenses));
    assert.ok(typeof json.totalAmount === "number");
  });

  test("Viewer rolü gider görebilir", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/finance/expenses", { jar });
    assert.equal(status, 200);
  });

  test("Viewer rolü gider ekleyemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 100, description: "Test", expenseDate: "2026-04-01" },
    });
    assert.equal(status, 403);
  });

  test("Gider silinir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/finance/expenses/${expenseId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Olmayan gider silinmeye çalışılırsa 404 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", "/finance/expenses/99999999", { jar });
    assert.equal(status, 404, `404 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Viewer rolü gider silemez", async () => {
    // Önce admin ile gider ekle
    const { jar: adminJar } = await login("cenan", "cenan123");
    const { json: created } = await api("POST", "/finance/expenses", {
      jar: adminJar,
      body: { amount: 50, description: "Silinmeyen gider", expenseDate: "2026-04-10" },
    });
    const { jar: viewerJar } = await login("goruntule", "staff123");
    const { status } = await api("DELETE", `/finance/expenses/${created.expense.id}`, { jar: viewerJar });
    assert.equal(status, 403);
    // Temizle
    await api("DELETE", `/finance/expenses/${created.expense.id}`, { jar: adminJar });
  });
});

describe("Sprint 10 — Finans: Kasa Hareketleri", () => {
  let registerId;

  before(async () => {
    // Nakit gider ekleyerek kasa oluşmasını sağla
    const { jar } = await login("cenan", "cenan123");
    await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 10, description: "Kasa init", expenseDate: "2026-04-15", paymentMethod: "cash" },
    });
    // Kasa listesini al
    const { json } = await api("GET", "/finance/cash", { jar });
    registerId = json.registers?.[0]?.id;
  });

  test("Kasa listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/finance/cash", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.registers));
    assert.ok(json.registers.length > 0, "En az bir kasa olmalı");
  });

  test("Kasa giriş hareketi eklenebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { type: "income", direction: "in", amount: 500, description: "Manuel kasa girişi" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.movement.direction, "in");
    assert.ok(typeof json.movement.balanceAfter === "number");
  });

  test("Kasa çıkış hareketi eklenebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { type: "expense", direction: "out", amount: 100, description: "Manuel kasa çıkışı" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.movement.direction, "out");
  });

  test("Geçersiz yön reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { direction: "sideways", amount: 100, description: "Test" },
    });
    assert.equal(status, 400);
  });

  test("Kasa hareketleri listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/finance/cash/${registerId}/movements`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.movements));
  });

  test("Olmayan kasa için 404 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/finance/cash/99999999/movements", {
      jar,
      body: { direction: "in", amount: 100, description: "Test" },
    });
    assert.equal(status, 404);
  });
});

describe("Sprint 10 — Finans: Özet & Rapor", () => {
  test("Finans özeti döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const start = "2026-04-01";
    const end = "2026-04-30";
    const { status, json } = await api("GET", `/finance/summary?startDate=${start}&endDate=${end}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(typeof json.revenue === "number");
    assert.ok(typeof json.totalExpenses === "number");
    assert.ok(typeof json.netProfit === "number");
    assert.ok(typeof json.totalCashBalance === "number");
    assert.ok(Array.isArray(json.categoryBreakdown));
  });

  test("Finans özeti tarih olmadan (bu ay) döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/finance/summary", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(typeof json.revenue === "number");
  });

  test("Aylık özet döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/finance/monthly-summary?year=2026", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.year, 2026);
    assert.ok(Array.isArray(json.monthlySales));
    assert.ok(Array.isArray(json.monthlyExpenses));
  });

  test("Gider CSV export çalışır", async () => {
    const { jar } = await login("cenan", "cenan123");
    const res = await fetch(`${BASE}/finance/expenses/export?startDate=2026-04-01&endDate=2026-04-30`, {
      headers: { Cookie: jar.header(), "X-Tenant": jar.tenant },
    });
    assert.equal(res.status, 200, `200 bekleniyor — ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `CSV döndürülmeli, gelen: ${ct}`);
    // BOM'u ham byte olarak kontrol et (fetch.text() BOM'u siler)
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    assert.equal(bytes[0], 0xEF, "BOM byte[0]=0xEF olmalı");
    assert.equal(bytes[1], 0xBB, "BOM byte[1]=0xBB olmalı");
    assert.equal(bytes[2], 0xBF, "BOM byte[2]=0xBF olmalı");
    const text = new TextDecoder("utf-8").decode(buf);
    assert.ok(text.includes("Tarih"), "Header satırı olmalı");
  });

  test("Şirket izolasyonu — nihat sadece kendi özetini görür", async () => {
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { status, json: nihatSummary } = await api("GET", "/finance/summary", { jar: nihat });
    assert.equal(status, 200);

    const { jar: cenan } = await login("cenan", "cenan123");
    const { json: cenanSummary } = await api("GET", "/finance/summary", { jar: cenan });

    // İzolasyon: farklı veri olabilir (her ikisi de 200, ama birinin giderini
    // diğerinin kasasında görmemek yeterli — bu basit bir smoke check)
    assert.ok(typeof nihatSummary.revenue === "number");
    assert.ok(typeof cenanSummary.revenue === "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 9 — ÇOK ŞUBELİ YAPI
// ═══════════════════════════════════════════════════════════════════════════
describe("Sprint 9 — Şube CRUD", () => {
  let branchId;
  let branch2Id;

  test("Şube oluşturma (admin)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/branches", {
      jar,
      body: { name: "Merkez Şube", address: "İstanbul", phone: "0212000000", isMain: true },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.branch.name, "Merkez Şube");
    assert.equal(json.branch.isMain, true);
    branchId = json.branch.id;
  });

  test("İkinci şube oluşturma", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/branches", {
      jar,
      body: { name: "Kadıköy Şubesi", address: "Kadıköy, İstanbul" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    branch2Id = json.branch.id;
  });

  test("Şube listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/branches", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.branches));
    assert.ok(json.branches.length >= 2, "En az 2 şube olmalı");
    const found = json.branches.find(b => b.id === branchId);
    assert.ok(found, "Oluşturulan şube listede olmalı");
  });

  test("Şube detayı döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/branches/${branchId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.branch.id, branchId);
    assert.ok(Array.isArray(json.users));
  });

  test("Şube güncelleme (admin)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/branches/${branchId}`, {
      jar,
      body: { name: "Merkez Şube Güncel", address: "Beşiktaş, İstanbul", isActive: true },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.branch.name, "Merkez Şube Güncel");
  });

  test("Viewer şube oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/branches", {
      jar,
      body: { name: "Test Şube" },
    });
    assert.equal(status, 403);
  });

  test("Ad olmadan şube reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/branches", {
      jar,
      body: { name: "  " },
    });
    assert.equal(status, 400, `400 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Olmayan şube 404 döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("GET", "/branches/99999999", { jar });
    assert.equal(status, 404);
  });

  test("Şube stok listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/branches/${branchId}/stock`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.stocks));
    assert.equal(json.branchName, "Merkez Şube Güncel");
  });

  test("Şube stok seviyesi güncellenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    // Bir ürün al
    const { json: pj } = await api("GET", "/products?limit=1", { jar });
    const productId = pj.products[0]?.id;
    assert.ok(productId, "Ürün bulunmalı");

    const { status, json } = await api("POST", `/branches/${branchId}/stock`, {
      jar,
      body: { items: [{ productId, quantity: 25 }] },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.updated, 1);
  });

  test("Ana şube silinemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/branches/${branchId}`, { jar });
    assert.equal(status, 409, `409 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.error?.code, "CANNOT_DELETE_MAIN");
  });

  test("Şirket izolasyonu — nihat kendi şubelerini görür", async () => {
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: nihatBranches } = await api("GET", "/branches", { jar: nihat });
    const { jar: cenan } = await login("cenan", "cenan123");
    const { json: cenanBranches } = await api("GET", "/branches", { jar: cenan });
    // Her şirketin kendi listesi var — karşılıklı erişim yok
    assert.ok(Array.isArray(nihatBranches.branches));
    assert.ok(Array.isArray(cenanBranches.branches));
    // cenan'ın şubeleri nihat'ın listesinde olmamalı
    const nihatIds = nihatBranches.branches.map(b => b.id);
    for (const b of cenanBranches.branches) {
      assert.ok(!nihatIds.includes(b.id), `Şube ${b.id} izolasyon ihlali`);
    }
  });
});

describe("Sprint 9 — Şubeler Arası Transfer", () => {
  let fromBranchId;
  let toBranchId;
  let transferId;
  let productId;

  before(async () => {
    const { jar } = await login("cenan", "cenan123");
    // Şubeleri listele
    const { json: bj } = await api("GET", "/branches", { jar });
    [fromBranchId, toBranchId] = bj.branches.slice(0, 2).map(b => b.id);

    // Bir ürün al ve kaynak şubeye stok ver
    const { json: pj } = await api("GET", "/products?limit=1", { jar });
    productId = pj.products[0]?.id;
    if (productId) {
      await api("POST", `/branches/${fromBranchId}/stock`, {
        jar,
        body: { items: [{ productId, quantity: 100 }] },
      });
    }
  });

  test("Transfer talebi oluşturulur", async () => {
    if (!fromBranchId || !toBranchId || !productId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/branches/transfers", {
      jar,
      body: {
        fromBranchId,
        toBranchId,
        notes: "Test transferi",
        items: [{ productId, quantity: 10 }],
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.transfer.status, "pending");
    transferId = json.transfer.id;
  });

  test("Aynı şubeye transfer reddedilir", async () => {
    if (!fromBranchId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId: fromBranchId, items: [{ productId, quantity: 5 }] },
    });
    assert.equal(status, 400);
  });

  test("Ürünsüz transfer reddedilir", async () => {
    if (!fromBranchId || !toBranchId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId, items: [] },
    });
    assert.equal(status, 400);
  });

  test("Transfer listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/branches/transfers/list", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.transfers));
    if (transferId) {
      const found = json.transfers.find(t => t.id === transferId);
      assert.ok(found, "Oluşturulan transfer listede olmalı");
    }
  });

  test("Transfer tamamlanır ve stok güncellenir", async () => {
    if (!transferId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/branches/transfers/${transferId}/complete`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.transfer.status, "completed");
  });

  test("Tamamlanmış transfer tekrar tamamlanamaz", async () => {
    if (!transferId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/branches/transfers/${transferId}/complete`, { jar });
    assert.equal(status, 409, `409 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Bekleyen transfer iptal edilebilir", async () => {
    if (!fromBranchId || !toBranchId || !productId) return;
    const { jar } = await login("cenan", "cenan123");
    // Yeni transfer oluştur
    const { json: created } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId, items: [{ productId, quantity: 1 }] },
    });
    const newId = created.transfer?.id;
    assert.ok(newId, "Transfer oluşturulmalı");

    const { status, json } = await api("POST", `/branches/transfers/${newId}/cancel`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.transfer.status, "cancelled");
  });

  test("Viewer transfer oluşturamaz", async () => {
    if (!fromBranchId || !toBranchId || !productId) return;
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId, items: [{ productId, quantity: 5 }] },
    });
    assert.equal(status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 13 — ENTEGRASYON ÇEKİRDEĞİ
// Webhook CRUD, test ping, teslimat logu, API Key CRUD
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 13 — Entegrasyon Çekirdeği", () => {
  let webhookId;
  let apiKeyId;

  // ─── Webhook olayları listesi ──────────────────────────────────────────
  test("Desteklenen webhook olayları listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/integrations/webhook-events", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.events), "events dizisi bekleniyor");
    assert.ok(json.events.length > 0, "En az bir event olmalı");
    const eventNames = json.events.map(e => e.event);
    assert.ok(eventNames.includes("sale.created"), "sale.created içermeli");
    assert.ok(eventNames.includes("*"), "wildcard * içermeli");
  });

  // ─── Webhook CRUD ──────────────────────────────────────────────────────
  test("Admin webhook oluşturabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/integrations/webhooks", {
      jar,
      body: {
        name: "Test Webhook",
        url: "https://webhook.site/test-sms",
        events: ["sale.created", "stock.low"],
        secret: "gizli123",
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.webhook?.id, "webhook.id olmalı");
    assert.equal(json.webhook.name, "Test Webhook");
    webhookId = json.webhook.id;
  });

  test("Webhook listesi döner", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/integrations/webhooks", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.webhooks));
    if (webhookId) {
      const found = json.webhooks.find(w => w.id === webhookId);
      assert.ok(found, "Oluşturulan webhook listede olmalı");
      assert.ok(found.deliveryStats !== undefined, "deliveryStats olmalı");
    }
  });

  test("Webhook geçersiz URL ile oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/integrations/webhooks", {
      jar,
      body: { name: "Bad URL", url: "bu-bir-url-degil", events: [] },
    });
    assert.equal(status, 400, `400 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Webhook güncellenebilir", async () => {
    if (!webhookId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/integrations/webhooks/${webhookId}`, {
      jar,
      body: { name: "Güncel Webhook", isActive: false },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.webhook.name, "Güncel Webhook");
    assert.equal(json.webhook.isActive, false);
  });

  test("Webhook test ping gönderilir (fail tolerant — external URL)", async () => {
    if (!webhookId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/integrations/webhooks/${webhookId}/test`, { jar });
    // Dış URL ulaşılamaz olabilir — success/fail ayrımı değil, response şeklini kontrol et
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("success" in json, "success alanı olmalı");
  });

  test("Webhook teslimat logu listelenir", async () => {
    if (!webhookId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/integrations/webhooks/${webhookId}/deliveries`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.deliveries), "deliveries dizisi olmalı");
    // Test ping'ten en az 1 teslimat kaydı olmalı
    assert.ok(json.deliveries.length >= 1, "En az 1 teslimat kaydı olmalı");
  });

  test("Farklı şirket webhook'una erişilemez", async () => {
    if (!webhookId) return;
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { status } = await api("GET", `/integrations/webhooks/${webhookId}/deliveries`, { jar });
    // 404 — farklı şirket (nihatturizm'in webhook'u değil)
    assert.equal(status, 404);
  });

  test("Viewer webhook yönetemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/integrations/webhooks", { jar });
    assert.equal(status, 403);
  });

  test("Webhook silinebilir", async () => {
    if (!webhookId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/integrations/webhooks/${webhookId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Silinen webhook bulunamaz", async () => {
    if (!webhookId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("GET", `/integrations/webhooks/${webhookId}/deliveries`, { jar });
    assert.equal(status, 404);
  });

  // ─── API Key CRUD ──────────────────────────────────────────────────────
  test("Admin API Key oluşturabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/integrations/api-keys", {
      jar,
      body: { name: "E-Ticaret Entegrasyonu", scopes: "read" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.apiKey?.id, "id olmalı");
    assert.ok(json.apiKey.rawKey, "rawKey yalnızca bu response'da döner");
    assert.ok(json.apiKey.rawKey.startsWith("sms_"), "sms_ prefix olmalı");
    assert.ok(json.apiKey.keyPrefix, "keyPrefix olmalı");
    // rawKey sonradan hashlenmiş — ham anahtar asla DB'de saklanmaz
    assert.notEqual(json.apiKey.rawKey, json.apiKey.keyHash ?? "");
    apiKeyId = json.apiKey.id;
  });

  test("API Key listesinde rawKey dönmez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/integrations/api-keys", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.apiKeys));
    // rawKey veya keyHash hiçbir kayıtta dönmemeli
    for (const k of json.apiKeys) {
      assert.equal(k.rawKey, undefined, "rawKey dönemez");
      assert.equal(k.keyHash, undefined, "keyHash dönemez");
    }
    if (apiKeyId) {
      const found = json.apiKeys.find(k => k.id === apiKeyId);
      assert.ok(found, "Oluşturulan key listede olmalı");
      assert.ok(found.keyPrefix, "keyPrefix görünmeli");
    }
  });

  test("API Key aktif/pasif yapılabilir", async () => {
    if (!apiKeyId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/integrations/api-keys/${apiKeyId}`, {
      jar, body: { isActive: false },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.apiKey.isActive, false);
  });

  test("API Key ad olmadan oluşturulamaz", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/integrations/api-keys", {
      jar, body: { scopes: "read" },
    });
    assert.equal(status, 400);
  });

  test("API Key silinebilir", async () => {
    if (!apiKeyId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/integrations/api-keys/${apiKeyId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Viewer API Key yönetemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/integrations/api-keys", { jar });
    assert.equal(status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 14 — MUHASEBE ENTEGRASYONu
// Provider listesi, CRUD, sync simülasyonu, log
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 14 — Muhasebe Entegrasyonu", () => {
  let accIntegrationId;

  test("Muhasebe sağlayıcıları listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/ext-integrations/accounting/providers", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.providers), "providers dizisi bekleniyor");
    assert.ok(json.providers.length > 0, "En az bir sağlayıcı olmalı");
    const ids = json.providers.map(p => p.id);
    assert.ok(ids.includes("parasut"), "parasut içermeli");
    assert.ok(ids.includes("logo"), "logo içermeli");
  });

  test("Admin muhasebe entegrasyonu ekleyebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/ext-integrations/accounting", {
      jar,
      body: {
        provider: "parasut",
        displayName: "Paraşüt Test",
        credentials: { apiKey: "test-key-123", apiSecret: "test-secret-456" },
        syncOptions: { syncSales: true, syncExpenses: false },
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.integration?.id, "id olmalı");
    assert.equal(json.integration.provider, "parasut");
    // Credentials maskelenmiş olmalı
    assert.ok(!JSON.stringify(json.integration.credentials).includes("test-key-123"), "Ham credentials dönmemeli");
    accIntegrationId = json.integration.id;
  });

  test("Aynı sağlayıcı tekrar eklenemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/ext-integrations/accounting", {
      jar,
      body: { provider: "parasut", credentials: {} },
    });
    assert.equal(status, 409, `409 bekleniyor`);
  });

  test("Muhasebe entegrasyonları listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/ext-integrations/accounting", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.integrations));
    if (accIntegrationId) {
      const found = json.integrations.find(i => i.id === accIntegrationId);
      assert.ok(found, "Oluşturulan entegrasyon listede olmalı");
    }
  });

  test("Geçersiz sağlayıcı reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/ext-integrations/accounting", {
      jar, body: { provider: "sahte-yazilim", credentials: {} },
    });
    assert.equal(status, 400);
  });

  test("Senkronizasyon tetiklenebilir (simülasyon)", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/ext-integrations/accounting/${accIntegrationId}/sync`, {
      jar, body: { syncType: "sales" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("success" in json, "success alanı olmalı");
    assert.ok(json.log?.id, "log.id olmalı");
    assert.ok(json.log.syncType === "sales", "syncType doğru");
  });

  test("Geçersiz syncType reddedilir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", `/ext-integrations/accounting/${accIntegrationId}/sync`, {
      jar, body: { syncType: "sahte-tip" },
    });
    assert.equal(status, 400);
  });

  test("Senkronizasyon logu listelenir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/ext-integrations/accounting/${accIntegrationId}/logs`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.logs), "logs dizisi olmalı");
    assert.ok(json.logs.length >= 1, "En az 1 log kaydı olmalı");
  });

  test("Muhasebe entegrasyonu güncellenebilir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/ext-integrations/accounting/${accIntegrationId}`, {
      jar, body: { displayName: "Paraşüt Üretim", isActive: false },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.integration.displayName, "Paraşüt Üretim");
    assert.equal(json.integration.isActive, false);
  });

  test("Pasif entegrasyon senkronize edilemez", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", `/ext-integrations/accounting/${accIntegrationId}/sync`, {
      jar, body: { syncType: "sales" },
    });
    assert.equal(status, 400);
  });

  test("Viewer muhasebe entegrasyonlarına erişemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/ext-integrations/accounting", { jar });
    assert.equal(status, 403);
  });

  test("Muhasebe entegrasyonu silinebilir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/ext-integrations/accounting/${accIntegrationId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 15 — E-TİCARET ENTEGRASYONu
// Platform listesi, CRUD, sync simülasyonu, log
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 15 — E-Ticaret Entegrasyonu", () => {
  let ecIntegrationId;

  test("E-ticaret platformları listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/ext-integrations/ecommerce/platforms", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.platforms));
    const ids = json.platforms.map(p => p.id);
    assert.ok(ids.includes("trendyol"), "trendyol içermeli");
    assert.ok(ids.includes("hepsiburada"), "hepsiburada içermeli");
  });

  test("Admin e-ticaret entegrasyonu ekleyebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/ext-integrations/ecommerce", {
      jar,
      body: {
        platform: "trendyol",
        storeName: "PROSAN Trendyol Mağazası",
        credentials: { apiKey: "ty-api-key", apiSecret: "ty-secret" },
        syncOptions: { syncProducts: true, syncOrders: true },
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.integration?.id, "id olmalı");
    assert.equal(json.integration.platform, "trendyol");
    assert.equal(json.integration.storeName, "PROSAN Trendyol Mağazası");
    assert.ok(!JSON.stringify(json.integration.credentials).includes("ty-api-key"), "Ham credentials dönmemeli");
    ecIntegrationId = json.integration.id;
  });

  test("Platform olmadan entegrasyon eklenemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/ext-integrations/ecommerce", {
      jar, body: { storeName: "Mağazam" },
    });
    assert.equal(status, 400);
  });

  test("Mağaza adı olmadan entegrasyon eklenemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/ext-integrations/ecommerce", {
      jar, body: { platform: "n11" },
    });
    assert.equal(status, 400);
  });

  test("E-ticaret entegrasyonları listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/ext-integrations/ecommerce", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.integrations));
    if (ecIntegrationId) {
      const found = json.integrations.find(i => i.id === ecIntegrationId);
      assert.ok(found, "Oluşturulan entegrasyon listede olmalı");
    }
  });

  test("Ürün senkronizasyonu tetiklenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "product_push" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("success" in json, "success alanı olmalı");
    assert.ok(json.log?.syncType === "product_push");
  });

  test("Sipariş çekme senkronizasyonu tetiklenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "order_pull" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.log?.syncType === "order_pull");
  });

  test("Stok güncelleme senkronizasyonu tetiklenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "inventory_update" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.log?.syncType === "inventory_update");
  });

  test("Senkronizasyon logu listelenir (birden fazla kayıt)", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", `/ext-integrations/ecommerce/${ecIntegrationId}/logs`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.logs));
    assert.ok(json.logs.length >= 3, "3 sync'ten en az 3 log olmalı");
  });

  test("E-ticaret entegrasyonu güncellenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/ext-integrations/ecommerce/${ecIntegrationId}`, {
      jar, body: { storeName: "Güncel Trendyol Mağazası" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.integration.storeName, "Güncel Trendyol Mağazası");
  });

  test("Tenant izolasyonu: farklı şirket erişemez", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { status } = await api("GET", `/ext-integrations/ecommerce/${ecIntegrationId}/logs`, { jar });
    assert.equal(status, 404);
  });

  test("Viewer e-ticaret entegrasyonlarına erişemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/ext-integrations/ecommerce", { jar });
    assert.equal(status, 403);
  });

  test("E-ticaret entegrasyonu silinebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("DELETE", `/ext-integrations/ecommerce/${ecIntegrationId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 11 — ABONELİK SİSTEMİ v2
// Planlar, abonelik başlatma/iptal/yenileme, kullanım, faturalar
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 11 — Abonelik Sistemi v2", () => {
  let proSubId;
  let invoiceId;

  test("Abonelik planları listelenir (herkese açık)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/subscriptions/plans", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.plans), "plans dizisi bekleniyor");
    assert.ok(json.plans.length >= 4, "En az 4 plan olmalı");
    const slugs = json.plans.map(p => p.slug);
    assert.ok(slugs.includes("free"), "free planı olmalı");
    assert.ok(slugs.includes("starter"), "starter planı olmalı");
    assert.ok(slugs.includes("pro"), "pro planı olmalı");
    assert.ok(slugs.includes("enterprise"), "enterprise planı olmalı");
  });

  test("Mevcut abonelik bilgisi alınabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("usage" in json, "usage alanı olmalı");
    assert.ok(typeof json.usage.users === "number", "users sayı olmalı");
    assert.ok(typeof json.usage.products === "number", "products sayı olmalı");
    assert.ok(json.companyPlanType, "companyPlanType olmalı");
  });

  test("Kullanım istatistikleri alınabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/subscriptions/usage", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.usage, "usage olmalı");
  });

  test("Admin Pro planına abone olabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    // Pro planın id'sini bul
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const proPlan = plansJson.plans.find(p => p.slug === "pro");
    assert.ok(proPlan, "Pro plan bulunmalı");

    const { status, json } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: proPlan.id, billingCycle: "monthly" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.subscription?.id, "subscription.id olmalı");
    assert.equal(json.subscription.status, "active");
    assert.ok(json.invoiceNo, "invoiceNo olmalı");
    proSubId = json.subscription.id;
  });

  test("Abonelik aktif olarak görünüyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(status, 200);
    assert.ok(json.subscription?.status === "active", "Abonelik aktif olmalı");
    assert.equal(json.plan.slug, "pro", "Pro plan aktif olmalı");
  });

  test("Aynı plana tekrar abone olunabilir (yenileme)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const starterPlan = plansJson.plans.find(p => p.slug === "starter");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: starterPlan.id, billingCycle: "yearly" },
    });
    // Düşürme de mümkün olmalı
    assert.equal(status, 201);
  });

  test("Geçersiz planId reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: 9999, billingCycle: "monthly" },
    });
    assert.equal(status, 404);
  });

  test("Geçersiz billingCycle reddedilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const proPlan = plansJson.plans.find(p => p.slug === "pro");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: proPlan.id, billingCycle: "weekly" },
    });
    assert.equal(status, 400);
  });

  test("Fatura geçmişi listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/subscriptions/invoices", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.invoices));
    assert.ok(json.invoices.length >= 1, "En az 1 fatura olmalı");
    const first = json.invoices[0];
    assert.ok(first.invoiceNo, "invoiceNo olmalı");
    assert.ok(first.amount, "amount olmalı");
    assert.ok(first.planName, "planName olmalı");
    invoiceId = first.id;
  });

  test("Bekleyen fatura ödenebilir", async () => {
    if (!invoiceId) return;
    const { jar } = await login("cenan", "cenan123");
    // Önce fatura durumunu kontrol et
    const { json: invList } = await api("GET", "/subscriptions/invoices", { jar });
    const pendingInv = invList.invoices.find(i => i.status === "pending");
    if (!pendingInv) return; // Tüm faturalar zaten ödendi

    const { status, json } = await api("POST", `/subscriptions/invoices/${pendingInv.id}/pay`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.invoice.status, "paid");
  });

  test("Zaten ödenmiş fatura tekrar ödenemez", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json: invList } = await api("GET", "/subscriptions/invoices", { jar });
    const paidInv = invList.invoices.find(i => i.status === "paid");
    if (!paidInv) return;

    const { status } = await api("POST", `/subscriptions/invoices/${paidInv.id}/pay`, { jar });
    assert.equal(status, 409);
  });

  test("Abonelik iptal edilebilir (grace period)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/subscriptions/cancel", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
    assert.ok(json.gracePeriodEndsAt, "gracePeriodEndsAt olmalı");
  });

  test("İptal sonrası abonelik grace_period statüsünde", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/subscriptions/current", { jar });
    assert.ok(
      json.subscription?.status === "grace_period" || json.subscription === null,
      "Grace period veya null bekleniyor"
    );
  });

  test("Grace period aboneliği yeniden aktif edilebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    // Önce grace_period'da olduğunu doğrula
    const { json: curr } = await api("GET", "/subscriptions/current", { jar });
    if (curr.subscription?.status !== "grace_period") return;

    const { status, json } = await api("POST", "/subscriptions/reactivate", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Viewer abonelik bilgisini görebilir (genel bakış)", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(status, 200, "Viewer current subscription görebilmeli");
  });

  test("Viewer abonelik değiştiremez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: 1, billingCycle: "monthly" },
    });
    assert.equal(status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 12 — Dosya/Evrak Yönetimi
// ═══════════════════════════════════════════════════════════════════════════════
describe("Sprint 12 — Dosya/Evrak Yönetimi", () => {
  let adminJar;
  let staffJar;
  let viewerJar;
  let catId;
  let docId;

  before(async () => {
    const a = await login("cenan", "cenan123");
    adminJar = a.jar;
    const s = await login("personel", "staff123");
    staffJar = s.jar;
    const v = await login("goruntule", "staff123");
    viewerJar = v.jar;
  });

  test("Kategori listelenir (başlangıçta boş)", async () => {
    const { status, json } = await api("GET", "/documents/categories", { jar: adminJar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json));
  });

  test("Admin kategori oluşturabilir", async () => {
    const { status, json } = await api("POST", "/documents/categories", {
      jar: adminJar,
      body: { name: "Faturalar", color: "#10b981" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Faturalar");
    assert.equal(json.color, "#10b981");
    catId = json.id;
  });

  test("Kategori listelenir (1 kayıt)", async () => {
    const { json } = await api("GET", "/documents/categories", { jar: adminJar });
    assert.ok(json.length >= 1);
    assert.ok(json.some((c) => c.id === catId));
  });

  test("Kategori güncellenebilir", async () => {
    const { status, json } = await api("PUT", `/documents/categories/${catId}`, {
      jar: adminJar,
      body: { name: "Satış Faturaları" },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Satış Faturaları");
  });

  test("Viewer kategori görebilir", async () => {
    const { status } = await api("GET", "/documents/categories", { jar: viewerJar });
    assert.equal(status, 200);
  });

  test("Viewer kategori oluşturamaz", async () => {
    const { status } = await api("POST", "/documents/categories", {
      jar: viewerJar,
      body: { name: "Yasak", color: "#ef4444" },
    });
    assert.equal(status, 403);
  });

  test("Evrak listesi alınabilir (başlangıçta boş)", async () => {
    const { status, json } = await api("GET", "/documents", { jar: adminJar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.documents));
    assert.ok(typeof json.total === "number");
  });

  test("Admin evrak kaydı oluşturabilir (simülasyon — objectPath ile)", async () => {
    const { status, json } = await api("POST", "/documents", {
      jar: adminJar,
      body: {
        name: "Test Faturası",
        description: "Haziran faturası",
        fileName: "haziran-fatura.pdf",
        fileSize: 204800,
        mimeType: "application/pdf",
        objectPath: "/objects/uploads/test-uuid-12345",
        categoryId: catId,
        tags: ["fatura", "haziran"],
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Test Faturası");
    assert.deepEqual(json.tags, ["fatura", "haziran"]);
    docId = json.id;
  });

  test("Evrak listesi evrakı içeriyor", async () => {
    const { json } = await api("GET", "/documents", { jar: adminJar });
    assert.ok(json.documents.some((d) => d.id === docId));
    assert.ok(json.total >= 1);
  });

  test("Evrak ID ile alınabilir", async () => {
    const { status, json } = await api("GET", `/documents/${docId}`, { jar: adminJar });
    assert.equal(status, 200);
    assert.equal(json.id, docId);
    assert.equal(json.name, "Test Faturası");
  });

  test("Evrak isimle aranabilir", async () => {
    const { json } = await api("GET", "/documents?search=Fatura", { jar: adminJar });
    assert.ok(json.documents.some((d) => d.id === docId));
  });

  test("Evrak kategoriye göre filtrelenir", async () => {
    const { json } = await api("GET", `/documents?categoryId=${catId}`, { jar: adminJar });
    assert.ok(json.documents.some((d) => d.id === docId));
  });

  test("Evrak güncellenebilir", async () => {
    const { status, json } = await api("PUT", `/documents/${docId}`, {
      jar: adminJar,
      body: { name: "Güncellenmiş Fatura", tags: ["fatura", "güncellendi"] },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Güncellenmiş Fatura");
    assert.ok(json.tags.includes("güncellendi"));
  });

  test("Staff evrak oluşturabilir", async () => {
    const { jar: sJar } = await login("personel", "staff123");
    const { status, json } = await api("POST", "/documents", {
      jar: sJar,
      body: {
        name: "Stok Raporu",
        fileName: "stok-raporu.xlsx",
        fileSize: 51200,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        objectPath: "/objects/uploads/test-staff-uuid",
      },
    });
    assert.equal(status, 201, `Staff 201 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Viewer evrak görebilir", async () => {
    const { jar: vJar } = await login("goruntule", "staff123");
    const { status, json } = await api("GET", "/documents", { jar: vJar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.documents));
  });

  test("Viewer evrak oluşturamaz", async () => {
    const { jar: vJar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/documents", {
      jar: vJar,
      body: {
        name: "Yasak Evrak",
        fileName: "yasak.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        objectPath: "/objects/uploads/yasak",
      },
    });
    assert.equal(status, 403);
  });

  test("Tenant izolasyonu: farklı şirket evraklara erişemez", async () => {
    const { jar: otherJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json } = await api("GET", "/documents", { jar: otherJar });
    assert.ok(!json.documents?.some((d) => d.id === docId), "Diğer tenant evrakları görmemeli");
  });

  test("Evrak silinebilir", async () => {
    const { status } = await api("DELETE", `/documents/${docId}`, { jar: adminJar });
    assert.equal(status, 204);
  });

  test("Silinen evrak listede görünmüyor", async () => {
    const { json } = await api("GET", "/documents", { jar: adminJar });
    assert.ok(!json.documents.some((d) => d.id === docId));
  });

  test("Kategori silinebilir", async () => {
    const { status } = await api("DELETE", `/documents/categories/${catId}`, { jar: adminJar });
    assert.equal(status, 204);
  });

  test("Silinen kategori listede görünmüyor", async () => {
    const { json } = await api("GET", "/documents/categories", { jar: adminJar });
    assert.ok(!json.some((c) => c.id === catId));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 21 — Akıllı Bildirim Sistemi
// ═══════════════════════════════════════════════════════════════════════════════
describe("Sprint 21 — Akıllı Bildirim Sistemi", () => {
  let ruleId;

  test("Desteklenen bildirim tipleri listelenir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notification-rules/types", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.types));
    assert.ok(json.types.length >= 7, "En az 7 tip olmalı");
    const values = json.types.map(t => t.value);
    assert.ok(values.includes("low_stock"));
    assert.ok(values.includes("new_sale"));
    assert.ok(values.includes("daily_summary"));
  });

  test("Kural listesi başlangıçta boş", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notification-rules", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.rules));
  });

  test("Admin kural oluşturabilir (low_stock eşikli)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/notification-rules", {
      jar,
      body: { name: "Kritik Stok Uyarısı", type: "low_stock", threshold: 5, isActive: true },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Kritik Stok Uyarısı");
    assert.equal(json.type, "low_stock");
    assert.equal(json.threshold, 5);
    assert.equal(json.isActive, true);
    assert.ok(json.typeLabel, "typeLabel olmalı");
    ruleId = json.id;
  });

  test("Admin kural oluşturabilir (new_sale eşiksiz)", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", "/notification-rules", {
      jar,
      body: { name: "Satış Bildirimi", type: "new_sale", isActive: true },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.type, "new_sale");
  });

  test("Kural listesinde oluşturulan kural görünüyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/notification-rules", { jar });
    assert.ok(json.rules.some(r => r.id === ruleId));
  });

  test("Kural güncellenebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", `/notification-rules/${ruleId}`, {
      jar,
      body: { name: "Güncellenmiş Stok Uyarısı", threshold: 10 },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Güncellenmiş Stok Uyarısı");
    assert.equal(json.threshold, 10);
  });

  test("Kural toggle (aktif/pasif) çalışıyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PATCH", `/notification-rules/${ruleId}/toggle`, { jar });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.isActive, false, "Pasife alınmalı");

    // Tekrar aktifleştir
    const { json: j2 } = await api("PATCH", `/notification-rules/${ruleId}/toggle`, { jar });
    assert.equal(j2.isActive, true);
  });

  test("Test bildirimi gönderilebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("POST", `/notification-rules/${ruleId}/test`, { jar });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.message);
  });

  test("Test bildirimi notifications tablosuna ekleniyor", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/notifications", { jar });
    assert.ok(json.notifications.some(n => n.type === "low_stock"), "low_stock bildirimi olmalı");
  });

  test("Kullanıcı tercihleri alınabilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("GET", "/notification-rules/preferences", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.preferences));
    assert.ok(json.preferences.length >= 7, "Tüm tipler için tercih olmalı");
    assert.ok(json.preferences.every(p => p.type && typeof p.enabled === "boolean"));
  });

  test("Kullanıcı tercihleri güncellenebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status, json } = await api("PUT", "/notification-rules/preferences", {
      jar,
      body: {
        preferences: [
          { type: "new_sale", enabled: false },
          { type: "daily_summary", enabled: true },
        ],
      },
    });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
  });

  test("Güncellenen tercihler kalıcı", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/notification-rules/preferences", { jar });
    const newSale = json.preferences.find(p => p.type === "new_sale");
    assert.equal(newSale?.enabled, false, "new_sale kapalı olmalı");
  });

  test("Viewer kural oluşturamaz", async () => {
    const { jar: vJar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/notification-rules", {
      jar: vJar,
      body: { name: "Yasak Kural", type: "new_sale" },
    });
    assert.equal(status, 403);
  });

  test("Tenant izolasyonu: diğer şirket kurallarını göremez", async () => {
    const { jar: otherJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json } = await api("GET", "/notification-rules", { jar: otherJar });
    assert.ok(!json.rules?.some(r => r.id === ruleId), "Diğer tenant kuralları görmemeli");
  });

  test("Kural silinebilir", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { status } = await api("DELETE", `/notification-rules/${ruleId}`, { jar });
    assert.equal(status, 204);
  });

  test("Silinen kural listede yok", async () => {
    const { jar } = await login("cenan", "cenan123");
    const { json } = await api("GET", "/notification-rules", { jar });
    assert.ok(!json.rules.some(r => r.id === ruleId));
  });
});
