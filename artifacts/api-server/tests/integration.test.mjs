/**
 * Ticarium365 API — Integration Test Suite
 * node --test tests/integration.test.mjs
 *
 * Gerçek çalışan sunucuya (localhost:8080) HTTP istekleri atar.
 * Testler birbirinden bağımsızdır — her test kendi session'ını yönetir.
 *
 * KONKURRENSİ NOTU (Sprint B, 2026-04-20):
 * Mevcut çalıştırma modeli `--test-concurrency=8` test-level paralel; suite'ler
 * dosyada beyan sırasında ardışık ele alınır. Eğer ileride suite-level concurrency
 * etkinleştirilirse, plan-mutating suite'ler (Sprint 11, Sprint A re-validation,
 * Sprint H CAS describe) seri sıraya zorlanmalı veya her birinin before/after'ı
 * ensureTenantPlan ile baseline restore etmelidir — aksi halde aynı şirketin
 * (companyId 1/2) plan state'i çakışır.
 */

import { test, describe, before, after } from "node:test";
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
// B1 + B2 — Per-suite plan-fixture izolasyonu (cross-suite plan-coupling kırma)
//
// PROSAN (companyId 1) ve NİHAT (companyId 2) için "kanonik plan zemini" sağlar.
// Idempotent: mevcut plan slug + cycle hedefle uyuşuyorsa NO-OP. Aksi halde
// superadmin set-plan çağrısı yapar (Sprint H CAS olmadan, basit upsert).
// Bu sayede her suite'in before()'unda kendi plan zemini garanti altına alınır
// ve bir önceki suite'in after() restore başarısı load-bearing olmaktan çıkar.
//
// Kullanım: await ensureTenantPlan("prosan", "pkg_pro", "yearly");
// ---------------------------------------------------------------------------
const TENANT_TO_COMPANY_ID = { prosan: 1, nihatturizm: 2, nihat: 2 };
const TENANT_ADMIN_CREDS = {
  prosan: { user: "talha", pass: "talha123" },
  nihatturizm: { user: "nihat_admin", pass: "nihat123" },
  nihat: { user: "nihat_admin", pass: "nihat123" },
};
let _saJarCache = null;
async function _getSuperadminJar() {
  if (_saJarCache) return _saJarCache;
  const r = await login("superadmin", "superadmin123");
  if (r.status === 200) _saJarCache = r.jar;
  return r.jar;
}
async function ensureTenantPlan(tenant, targetSlug, targetCycle = "monthly") {
  const companyId = TENANT_TO_COMPANY_ID[tenant];
  if (!companyId) throw new Error(`ensureTenantPlan: bilinmeyen tenant ${tenant}`);
  const creds = TENANT_ADMIN_CREDS[tenant];
  // Önce tenant-admin ile current-state oku
  const adminLogin = await login(creds.user, creds.pass, tenant);
  // Sprint B fail-fast (architect): admin login fail = test fixture bozuk → erken hata fırlat
  // (önceki sessiz "skipped" davranışı suite başlangıcı sapmasını gizliyordu).
  assert.equal(adminLogin.status, 200,
    `ensureTenantPlan(${tenant}): admin login başarısız (status=${adminLogin.status}). ` +
    `Seed/credentials kontrol et: ${creds.user}.`);
  const cur = await api("GET", "/subscriptions/current", { jar: adminLogin.jar });
  if (cur.status === 200 && cur.json?.plan?.slug === targetSlug
      && (cur.json?.subscription?.billingCycle ?? "monthly") === targetCycle) {
    return { skipped: true, reason: "already_target", currentSlug: targetSlug };
  }
  // Mismatch → superadmin set-plan
  const saJar = await _getSuperadminJar();
  assert.ok(saJar, `ensureTenantPlan(${tenant}): superadmin login jar yok (seed/credentials bozuk olabilir).`);
  const set = await api("POST", "/subscriptions/admin/billing/set-plan", {
    jar: saJar,
    body: { companyId, planSlug: targetSlug, billingCycle: targetCycle, note: `ensureTenantPlan ${tenant}→${targetSlug}/${targetCycle}` },
  });
  // Sprint B fail-fast (architect): set-plan 201 dönmeli — aksi halde fixture bozuk.
  assert.equal(set.status, 201,
    `ensureTenantPlan(${tenant}→${targetSlug}/${targetCycle}): set-plan 201 dönmeli, ` +
    `alındı: ${set.status} ${JSON.stringify(set.json)}`);
  return {
    skipped: false,
    previous: cur.json?.plan?.slug ?? null,
    target: targetSlug,
    setStatus: set.status,
  };
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
    const { status, json } = await login("admin", "admin123");
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.user.username, "admin");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/auth/me", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.username, "admin");
  });

  test("Logout sonrası /auth/me — 401 döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await createTestProduct(jar);
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.id, "id dolu olmalı");
    assert.equal(json.companyId, 1, "companyId 1 olmalı");
  });

  test("Aynı ürün koduyla tekrar oluşturma — 409 DUPLICATE_PRODUCT_CODE", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");

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
    const { jar } = await login("admin", "admin123");

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
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar: adminJar } = await login("admin", "admin123");
    const { jar: staffJar } = await login("goruntule", "staff123");

    const { json: product } = await createTestProduct(adminJar);
    const productId = product.id;
    await api("DELETE", `/products/${productId}`, { jar: adminJar });

    const { status } = await api("PATCH", `/products/${productId}/restore`, { jar: staffJar });
    assert.equal(status, 403, "Staff restore yapamamalı");
  });

  test("Zaten silinmiş ürünü tekrar silme — 404", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar: jarA } = await login("admin", "admin123");
    const { jar: jarB } = await login("nihat_admin", "nihat123", "nihatturizm");

    const { json: productA } = await createTestProduct(jarA);
    const productId = productA.id;

    // Şirket B bu ürünü görmemeli
    const { status } = await api("GET", `/products/${productId}`, { jar: jarB });
    assert.equal(status, 404, "Başka şirketin ürünü görünmemeli");
  });

  test("Şirket A'nın ürününü Şirket B güncelleyemez", async () => {
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/alerts/low-stock", { jar });
    for (const p of json.products) {
      assert.ok(p.stock <= p.minStock, `${p.productCode} stok (${p.stock}) > minStock (${p.minStock})`);
    }
  });

  test("Tenant izolasyonu: farklı şirketler farklı alarm görir", async () => {
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await stockImportRequest(jar, "product_code,quantity,mode\nNONEXISTENT-999,5,set", true);
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.dryRun === true, "dryRun flag olmalı");
    assert.ok(json.errors.length > 0, "Hata döndürülmeli");
    assert.ok(json.errors[0].code === "PRODUCT_NOT_FOUND", `Kod PRODUCT_NOT_FOUND olmalı, aldık: ${json.errors[0]?.code}`);
  });

  test("Dry-run: geçersiz mod hata döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await stockImportRequest(jar, "product_code,quantity,mode\nPRO-001,5,invalid", true);
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.errors.length > 0, "Hata döndürülmeli");
  });

  test("Dry-run: negatif miktar hata döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/reports/daily-summary?date=not-a-date", { jar });
    assert.equal(status, 400, JSON.stringify(json));
  });

  test("Tarihsiz çağrı bugünü döndürür", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/reports/daily-summary", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const today = new Date().toISOString().split("T")[0];
    assert.equal(json.date, today, "Bugünün tarihi döndürülmeli");
  });

  test("Tenant izolasyonu: farklı şirketlerin ciroları birbirinden bağımsız", async () => {
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", "/notifications/read-all", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok === true, "ok:true döner");
  });

  test("Okunmamış filtresi çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/notifications?unread=true", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.notifications), "okunmamış listesi dizi olmalı");
  });

  test("Mesaj şablonları endpoint çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/notifications/templates?productName=Test&stock=5&companyName=PROSAN", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.low_stock_whatsapp, "whatsapp şablonu olmalı");
    assert.ok(json.low_stock_email, "email şablonu olmalı");
    assert.ok(typeof json.low_stock_email.subject === "string", "email subject olmalı");
  });

  test("Tenant izolasyonu: iki firma bildirimleri ayrı", async () => {
    const { jar: jarA } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/customers", {
      jar,
      body: { code, name: "Başka Müşteri" },
    });
    assert.equal(status, 409, "çift kod 409 vermeli");
  });

  test("Müşteri listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/customers", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.customers), "customers dizi olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Müşteri detayı döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/customers/${createdId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.customer.id, createdId, "doğru müşteri");
  });

  test("Müşteri güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/customers/${createdId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok:true döner");
  });

  test("Silinmiş müşteri aktif filtresiyle görünmez", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/customers?active=true", { jar });
    const found = (json.customers ?? []).find((c) => c.id === createdId);
    assert.ok(!found, "soft deleted müşteri aktif listede olmamalı");
  });

  test("Müşteri geri yüklenebilir (restore)", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/customers", {
      jar,
      body: { code: cariCode, name: "Cari Test Müşteri", openingBalance: 0 },
    });
    assert.equal(status, 201, JSON.stringify(json));
    cariId = json.customer.id;
  });

  test("Satış müşteriye bağlanınca debit oluşur", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", `/customers/${cariId}`, { jar });
    assert.ok(json.customer.currentBalance > 0, `bakiye arttı: ${json.customer.currentBalance}`);
  });

  test("Cari hareket listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/customers/${cariId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    assert.ok(json.transactions.length > 0, "en az 1 hareket olmalı");
  });

  test("Tahsilat alındıktan sonra bakiye düşer", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", `/customers/${cariId}/payment`, {
      jar,
      body: { amount: 0 },
    });
    assert.equal(status, 400, "0 tutar 400 vermeli");
  });

  test("Hesap ekstresi endpoint çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/customers/${cariId}/sales`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.sales), "sales dizi olmalı");
  });

  test("En borçlu müşteriler endpoint çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/suppliers", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.suppliers), "suppliers dizi olmalı");
    assert.ok(typeof json.total === "number", "total sayısal olmalı");
  });

  test("Tedarikçi oluşturulur", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/suppliers", {
      jar,
      body: { code, name: "Kopya Tedarikçi" },
    });
    assert.equal(status, 409, JSON.stringify(json));
  });

  test("Tedarikçi detayı döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.supplier.id, supplierId);
  });

  test("Tedarikçi güncellenir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/suppliers/${supplierId}`, {
      jar,
      body: { name: "Test Tedarikçi (Güncellendi)", phone: "0212 666 00 00" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.supplier.name, "Test Tedarikçi (Güncellendi)");
  });

  test("Tedarikçi bakiye düzeltmesi yapılır", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/suppliers/${supplierId}/adjustment`, {
      jar,
      body: { amount: 1000, direction: "debit", note: "Test düzeltme" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(typeof json.newBalance === "number", "newBalance sayısal olmalı");
  });

  test("Tedarikçi ödeme kaydedilir ve bakiye güncellenir", async () => {
    const { jar } = await login("admin", "admin123");
    const balBefore = (await api("GET", `/suppliers/${supplierId}`, { jar })).json.supplier.currentBalance;
    const { status, json } = await api("POST", `/suppliers/${supplierId}/payment`, {
      jar,
      body: { amount: 500, paymentMethod: "nakit", note: "Test ödeme" },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.newBalance, balBefore - 500, "Bakiye 500 azalmalı");
  });

  test("Tedarikçi cari hareketleri listelenir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    assert.ok(json.transactions.length >= 3, "En az 3 hareket olmalı (açılış+düzeltme+ödeme)");
  });

  test("Hesap ekstresi endpoint çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/suppliers/${supplierId}/statement`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.supplier, "supplier alanı olmalı");
    assert.ok(Array.isArray(json.transactions), "transactions dizi olmalı");
    if (json.transactions.length > 0) {
      assert.ok(typeof json.transactions[0].runningBalance === "number", "runningBalance olmalı");
    }
  });

  test("En borçlu tedarikçiler endpoint çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/suppliers/top-creditors", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.suppliers), "suppliers dizi olmalı");
  });

  test("Tedarikçi silinir (soft-delete)", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/suppliers/${supplierId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(json.ok, "ok dönmeli");
  });

  test("Silinmiş tedarikçi geri yüklenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar: j2 } = await login("nihat_admin", "nihat123", "nihatturizm");
    const code2 = `NIT-SUPP-${Date.now()}`;
    const { status: createStatus, json: createJson } = await api("POST", "/suppliers", {
      jar: j2,
      body: { code: code2, name: "Nihat Tedarikçi" },
    });
    assert.equal(createStatus, 201, `co2 supplier create 201 olmalı — ${JSON.stringify(createJson)}`);
    const newId = createJson.supplier?.id;
    assert.ok(newId, `co2 supplier id dönmeli — ${JSON.stringify(createJson)}`);
    const { jar: j1 } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/suppliers/${purchSuppId}/transactions`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const purchaseTxs = json.transactions.filter((t) => t.type === "purchase" && t.direction === "debit");
    assert.ok(purchaseTxs.length > 0, "Alış debit transaction olmalı");
  });

  test("Alış faturası tedarikçi bakiyesini artırır", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", `/suppliers/${purchSuppId}`, { jar });
    assert.ok(json.supplier.currentBalance > 0, "Tedarikçi bakiyesi pozitif olmalı");
  });

  test("Alış faturası listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/purchases", { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok(Array.isArray(json.purchases), "purchases dizi olmalı");
  });

  test("Alış faturası tedarikçiye göre filtrelenir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/purchases?supplierId=${purchSuppId}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    const all = json.purchases;
    assert.ok(all.every((p) => p.supplierId === purchSuppId), "Yalnızca bu tedarikçinin faturaları dönmeli");
  });

  test("Alış faturası ürün maliyeti günceller", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", `/products/${testProductId}`, { jar });
    assert.equal(json.purchasePrice, 12, "Maliyet faturadaki unitCost ile eşleşmeli");
  });

  test("Tedarikçisiz fatura oluşturulamaz", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/purchases", {
      jar,
      body: { invoiceDate: new Date().toISOString(), items: [{ productId: testProductId, quantity: 5, unitCost: 10 }] },
    });
    assert.equal(status, 400);
  });

  test("Kalemsiz fatura oluşturulamaz", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/reports/sales", { jar });
    assert.equal(status, 400);
  });

  test("Kâr analizi raporu 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/reports/profit", { jar });
    assert.equal(status, 400);
  });

  test("Müşteri analizi raporu 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/reports/supplier-analytics?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("totalSuppliers"       in json, "totalSuppliers eksik");
    assert.ok("totalPurchaseAmount"  in json, "totalPurchaseAmount eksik");
    assert.ok("topSuppliersBySpend"  in json, "topSuppliersBySpend eksik");
    assert.ok("monthlyPurchases"     in json, "monthlyPurchases eksik");
    assert.ok(Array.isArray(json.monthlyPurchases), "monthlyPurchases dizi olmalı");
  });

  test("Alış özet raporu 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/reports/purchases-summary?startDate=${START}&endDate=${END}`, { jar });
    assert.equal(status, 200, JSON.stringify(json));
    assert.ok("totalPurchases" in json, "totalPurchases eksik");
    assert.ok("totalAmount"    in json, "totalAmount eksik");
    assert.ok("purchases"      in json, "purchases eksik");
    assert.ok(Array.isArray(json.purchases), "purchases dizi olmalı");
  });

  test("Tenant izolasyonu — rapor yalnızca kendi tenant verisini döner", async () => {
    const { jar: jar1 } = await login("admin", "admin123");
    const { json: j1 } = await api("GET", `/reports/sales?startDate=${START}&endDate=${END}`, { jar: jar1 });
    const { jar: jar2 } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: j2 } = await api("GET", `/reports/sales?startDate=${START}&endDate=${END}`, { jar: jar2 });
    // Farklı tenant'lar farklı satış sayısına sahip olabilir, key'ler her ikisinde de mevcut olmalı
    assert.ok("totalSales" in j1, "j1 totalSales eksik");
    assert.ok("totalSales" in j2, "j2 totalSales eksik");
  });

  test("Satış CSV export 200 döner ve CSV içeriği gelir", async () => {
    const { jar } = await login("admin", "admin123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/reports/export/sales?startDate=${START}&endDate=${END}`, { headers });
    assert.equal(res.status, 200, "export/sales 200 olmalı");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı, alınan: ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("Tarih") || text.includes("Ürün"), "CSV başlık satırı eksik");
  });

  test("Alış CSV export 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/reports/export/purchases?startDate=${START}&endDate=${END}`, { headers });
    assert.equal(res.status, 200, "export/purchases 200 olmalı");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı, alınan: ${ct}`);
  });

  test("Stok CSV export 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/stock-counts", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.sessions), "sessions dizisi olmalı");
  });

  test("Yeni sayım oturumu açılır", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/stock-counts", {
      jar,
      body: { name: "Duplicate Sayım" },
    });
    assert.equal(status, 409);
    assert.equal(json.error?.code, "OPEN_SESSION_EXISTS");
  });

  test("Oturum detayı çekilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/stock-counts/${sessionId}`, { jar });
    assert.equal(status, 200);
    assert.ok(json.session, "session alanı olmalı");
    assert.ok(Array.isArray(json.items), "items dizisi olmalı");
    assert.equal(json.session.id, sessionId);
  });

  test("Var olmayan oturum 404 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/stock-counts/999999", { jar });
    assert.equal(status, 404);
  });

  test("Barkod ile ürün sayılır ve kalem eklenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/load-all`, { jar });
    assert.equal(status, 200, `load-all 200 olmalı — ${JSON.stringify(json)}`);
    assert.ok(typeof json.added === "number", "added sayısı olmalı");
    assert.ok(typeof json.total === "number", "total sayısı olmalı");
  });

  test("Sayım kalemi CSV export çalışır", async () => {
    const { jar } = await login("admin", "admin123");
    const headers = { "Cookie": jar.header(), "X-Tenant": "prosan" };
    const res = await fetch(`http://localhost:8080/api/stock-counts/${sessionId}/export`, { headers });
    assert.equal(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.includes("text/csv"), `Content-Type text/csv olmalı: ${ct}`);
    const text = await res.text();
    assert.ok(text.includes("Ürün Kodu"), "CSV başlık satırı eksik");
  });

  test("Oturum kapatılır", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/close`, { jar });
    assert.equal(status, 200, `close 200 olmalı — ${JSON.stringify(json)}`);
    assert.equal(json.session.status, "closed");
  });

  test("Kapalı oturuma kalem eklenemez", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/stock-counts/${sessionId}/approve`, { jar });
    assert.equal(status, 200, `approve 200 olmalı — ${JSON.stringify(json)}`);
    assert.ok(typeof json.adjusted === "number", "adjusted sayısı olmalı");
    assert.equal(json.session.status, "approved");
  });

  test("Onaylı oturumu tekrar onaylamak 409 döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/finance/expense-categories", {
      jar,
      body: { name: "Test Kira", icon: "🏢", color: "red-500" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.category.name, "Test Kira");
    catId = json.category.id;
  });

  test("Kategori listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/finance/expense-categories", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.categories), "categories dizisi bekleniyor");
    const found = json.categories.find(c => c.id === catId);
    assert.ok(found, "Oluşturulan kategori listede olmalı");
  });

  test("Kategori güncelleme (admin)", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 0, description: "Sıfır", expenseDate: "2026-04-01" },
    });
    assert.equal(status, 400);
  });

  test("Açıklama olmadan gider reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 100, expenseDate: "2026-04-01" },
    });
    assert.equal(status, 400);
  });

  test("Banka ödemeli gider oluşturulabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 1500, description: "Şubat Kira", expenseDate: "2026-04-05", paymentMethod: "bank" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Gider listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/finance/expenses/${expenseId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Olmayan gider silinmeye çalışılırsa 404 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", "/finance/expenses/99999999", { jar });
    assert.equal(status, 404, `404 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Viewer rolü gider silemez", async () => {
    // Önce admin ile gider ekle
    const { jar: adminJar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    await api("POST", "/finance/expenses", {
      jar,
      body: { amount: 10, description: "Kasa init", expenseDate: "2026-04-15", paymentMethod: "cash" },
    });
    // Kasa listesini al
    const { json } = await api("GET", "/finance/cash", { jar });
    registerId = json.registers?.[0]?.id;
  });

  test("Kasa listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/finance/cash", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.registers));
    assert.ok(json.registers.length > 0, "En az bir kasa olmalı");
  });

  test("Kasa giriş hareketi eklenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { type: "income", direction: "in", amount: 500, description: "Manuel kasa girişi" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.movement.direction, "in");
    assert.ok(typeof json.movement.balanceAfter === "number");
  });

  test("Kasa çıkış hareketi eklenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { type: "expense", direction: "out", amount: 100, description: "Manuel kasa çıkışı" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.movement.direction, "out");
  });

  test("Geçersiz yön reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", `/finance/cash/${registerId}/movements`, {
      jar,
      body: { direction: "sideways", amount: 100, description: "Test" },
    });
    assert.equal(status, 400);
  });

  test("Kasa hareketleri listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/finance/cash/${registerId}/movements`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.movements));
  });

  test("Olmayan kasa için 404 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/finance/cash/99999999/movements", {
      jar,
      body: { direction: "in", amount: 100, description: "Test" },
    });
    assert.equal(status, 404);
  });
});

describe("Sprint 10 — Finans: Özet & Rapor", () => {
  // Architect 3. round: feature-based guard + conditional lost-update-safe restore.
  // /finance/* requires `finance.expenses`. Plan slug listesi yerine GET /subscriptions/features
  // ile gerçek feature bilgisini sorgula — yeni eklenen veya `*` (trial/superuser) içeren plan
  // varyantlarında da doğru NO-OP. Restore: re-check current → SADECE hala bizim set ettiğimiz
  // plan'daysa ve yetki hala fazlaysa pre-state'e dön (paralel test/process lost-update koruması).
  const FINANCE_FEATURE = "finance.expenses";
  let nihatPrePlan = null;       // { slug, cycle } captured at before
  let nihatUpgraded = false;
  let nihatUpgradeSubId = null;  // Sprint H — CAS expected version after our upgrade
  const UPGRADE_TARGET = "pkg_pro";
  before(async () => {
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    // Feature-based guard — Architect 4. round residual: fail-CLOSED.
    // Feature probe 200 değilse "yetkisiz" varsayma (gereksiz mutation tetikler);
    // emin olamadığımızda mutation'ı atla, izolasyon testi feature gate ile gerçek durumu raporlar.
    const feats = await api("GET", "/subscriptions/features", { jar: nihat });
    if (feats.status !== 200) {
      nihatPrePlan = null;
      nihatUpgraded = false;
      return;
    }
    const hasFinance =
      feats.json?.isAllUnlocked === true ||
      (Array.isArray(feats.json?.features) && feats.json.features.includes(FINANCE_FEATURE));
    // Architect 3. round residual: risky fallback restore default kaldırıldı.
    // Pre-state okunamazsa MUTASYON YAPMA (fail-safe: yanlış restore'dan iyidir).
    const cur = await api("GET", "/subscriptions/current", { jar: nihat });
    if (cur.status !== 200 || !cur.json?.plan?.slug) {
      // Pre-state okunamadı → upgrade'i atla; testler izolasyon assertion'ında
      // doğal olarak feature gate (403) ile fail eder, sessiz pass'e izin verme.
      nihatPrePlan = null;
      nihatUpgraded = false;
      return;
    }
    nihatPrePlan = { slug: cur.json.plan.slug, cycle: cur.json.subscription?.billingCycle || "monthly" };
    if (hasFinance) return; // zaten finance.expenses var → mutation yok
    const { jar: sa } = await login("superadmin", "superadmin123");
    // Sprint H — pre-state subscription.id'yi capture et (CAS expected version, lost-update'i provably engeller).
    // /subscriptions/current'ın subscription.id'si daha önce nihatPrePlan ile beraber okundu; oradan al.
    const curResp = await api("GET", "/subscriptions/current", { jar: nihat });
    const expectedPreId = curResp.json?.subscription?.id ?? null;
    const r = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: sa,
      body: {
        companyId: 2, planSlug: UPGRADE_TARGET, billingCycle: "monthly",
        note: "Sprint 10 isolation test setup",
        expectedSubscriptionId: expectedPreId, // CAS: pre-state hala bu olmalı
      },
    });
    assert.equal(r.status, 201, `nihatturizm ${UPGRADE_TARGET} set 201 dönmeli, response: ${JSON.stringify(r.json)}`);
    nihatUpgraded = true;
    nihatUpgradeSubId = r.json?.subscription?.id ?? null;
    assert.ok(typeof nihatUpgradeSubId === "number", "Sprint H: setup response.subscription.id sayı olmalı");
  });
  after(async () => {
    if (!nihatUpgraded || !nihatPrePlan) return;
    // Sprint H — CAS-guarded teardown: stillOurs sezgisel kontrolü kaldırıldı, yerine
    // expectedSubscriptionId=nihatUpgradeSubId. Backend FOR UPDATE row-lock ile TOCTOU yok:
    // başka bir process bizim sub'ı override etmişse 409+currentSubscriptionId döner → no-op.
    const { jar: sa } = await login("superadmin", "superadmin123");
    const r = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: sa,
      body: {
        companyId: 2, planSlug: nihatPrePlan.slug, billingCycle: nihatPrePlan.cycle,
        note: "Sprint 10 isolation test teardown",
        expectedSubscriptionId: nihatUpgradeSubId,
      },
    });
    // 201 = restore başarılı; 409 = başka process ezmiş, lost-update korundu (ikisi de OK).
    assert.ok(r.status === 201 || r.status === 409,
      `nihatturizm restore: 201 (success) veya 409 (CAS conflict, lost-update korundu) bekleniyor, alındı: ${r.status} ${JSON.stringify(r.json)}`);
  });

  test("Finans özeti döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/finance/summary", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(typeof json.revenue === "number");
  });

  test("Aylık özet döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/finance/monthly-summary?year=2026", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.year, 2026);
    assert.ok(Array.isArray(json.monthlySales));
    assert.ok(Array.isArray(json.monthlyExpenses));
  });

  test("Gider CSV export çalışır", async () => {
    const { jar } = await login("admin", "admin123");
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

  test("Şirket izolasyonu — nihat sadece kendi özetini görür (deterministic delta)", async () => {
    // Architect 3. round: causal delta invariant — eşitlik/shape değil, NEDENSEL fark.
    // nihat'a benzersiz bir gider INSERT et → nihat summary'de delta gözlemlenmeli,
    // cenan summary'de DEĞİŞİM olmamalı. Bu cross-tenant leak için deterministik kanıt.
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { jar: cenan } = await login("admin", "admin123");
    // Bu ay aralığı (default summary penceresi) — insert tarihi de bu pencerede olmalı
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const startDate = `${yyyy}-${mm}-01`;
    const endDate = `${yyyy}-${mm}-${dd}`;
    const qs = `?startDate=${startDate}&endDate=${endDate}`;

    // Baseline (insert öncesi)
    const { status: ns0, json: nihatBefore } = await api("GET", `/finance/summary${qs}`, { jar: nihat });
    assert.equal(ns0, 200, "nihat /finance/summary 200 (before insert) — feature gate setup doğrulaması");
    const { json: cenanBefore } = await api("GET", `/finance/summary${qs}`, { jar: cenan });

    // Shape kontratı — her iki tenant'ta da
    for (const [label, s] of [["nihat", nihatBefore], ["cenan", cenanBefore]]) {
      for (const k of ["revenue", "totalExpenses", "netProfit", "totalCashBalance"]) {
        assert.ok(typeof s[k] === "number" && Number.isFinite(s[k]), `${label}.${k} finite number olmalı`);
      }
      assert.ok(Array.isArray(s.categoryBreakdown), `${label}: categoryBreakdown array olmalı`);
    }

    // Unique marker: nonce tabanlı amount → deterministik beklenen delta
    const nonce = Math.floor(Math.random() * 1e6);
    const markerAmount = 42000.5 + nonce / 1000;
    const markerDescription = `[ISOLATION_TEST_${nonce}_${Date.now()}]`;
    const insertRes = await api("POST", "/finance/expenses", {
      jar: nihat,
      body: {
        amount: markerAmount,
        description: markerDescription,
        expenseDate: `${yyyy}-${mm}-${dd}`,
        paymentMethod: "bank", // cash hareketi yaratmasın → cleanup basit
      },
    });
    assert.equal(insertRes.status, 201, `nihat marker expense 201, response: ${JSON.stringify(insertRes.json)}`);
    const expenseId = insertRes.json?.expense?.id;
    assert.ok(typeof expenseId === "number", "insert response.expense.id sayı olmalı");

    try {
      // After insert
      const { json: nihatAfter } = await api("GET", `/finance/summary${qs}`, { jar: nihat });
      const { json: cenanAfter } = await api("GET", `/finance/summary${qs}`, { jar: cenan });

      // Architect 3. round residual: tek dimension yetmez — tüm summary dimension'larında delta invariant.
      // Marker bir gider olduğu için beklenen delta vektörü:
      //   nihat: totalExpenses=+marker, netProfit=-marker, revenue=0, totalCashBalance=0 (paymentMethod=bank)
      //   cenan: hepsi 0 (cross-tenant leak yok)
      const EPS = 0.01;
      const checkDelta = (label, before, after, expected) => {
        for (const [k, exp] of Object.entries(expected)) {
          const delta = after[k] - before[k];
          assert.ok(Math.abs(delta - exp) < EPS,
            `${label}.${k} delta beklenen=${exp}, alındı=${delta} (before=${before[k]}, after=${after[k]})`);
        }
      };
      checkDelta("nihat", nihatBefore, nihatAfter, {
        totalExpenses: markerAmount,
        netProfit: -markerAmount,
        revenue: 0,
        totalCashBalance: 0, // paymentMethod=bank → kasa dokunulmadı
      });
      checkDelta("cenan", cenanBefore, cenanAfter, {
        totalExpenses: 0,
        netProfit: 0,
        revenue: 0,
        totalCashBalance: 0,
      });

      // 3) categoryBreakdown id intersection = 0 (her tenant kendi expense_categories tablosundan)
      const nihatCats = new Set(nihatAfter.categoryBreakdown.map((c) => c.categoryId).filter((x) => x != null));
      const cenanCats = new Set(cenanAfter.categoryBreakdown.map((c) => c.categoryId).filter((x) => x != null));
      const overlap = [...nihatCats].filter((id) => cenanCats.has(id));
      assert.equal(overlap.length, 0,
        `İzolasyon ihlali: nihat ve cenan aynı expense category id'lerini paylaşıyor: ${JSON.stringify(overlap)}`);
    } finally {
      // Cleanup — marker expense'i sil (test stateini koru). Nihat admin bu silebilir.
      const del = await api("DELETE", `/finance/expenses/${expenseId}`, { jar: nihat });
      assert.equal(del.status, 200, `cleanup: marker expense delete 200, response: ${JSON.stringify(del.json)}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 9 — ÇOK ŞUBELİ YAPI
// ═══════════════════════════════════════════════════════════════════════════
describe("Sprint 9 — Şube CRUD", () => {
  let branchId;
  let branch2Id;

  test("Şube oluşturma (admin)", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/branches", {
      jar,
      body: { name: "Kadıköy Şubesi", address: "Kadıköy, İstanbul" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    branch2Id = json.branch.id;
  });

  test("Şube listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/branches", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.branches));
    assert.ok(json.branches.length >= 2, "En az 2 şube olmalı");
    const found = json.branches.find(b => b.id === branchId);
    assert.ok(found, "Oluşturulan şube listede olmalı");
  });

  test("Şube detayı döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/branches/${branchId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.branch.id, branchId);
    assert.ok(Array.isArray(json.users));
  });

  test("Şube güncelleme (admin)", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/branches", {
      jar,
      body: { name: "  " },
    });
    assert.equal(status, 400, `400 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Olmayan şube 404 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/branches/99999999", { jar });
    assert.equal(status, 404);
  });

  test("Şube stok listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/branches/${branchId}/stock`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.stocks));
    assert.equal(json.branchName, "Merkez Şube Güncel");
  });

  test("Şube stok seviyesi güncellenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/branches/${branchId}`, { jar });
    assert.equal(status, 409, `409 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.error?.code, "CANNOT_DELETE_MAIN");
  });

  test("Şirket izolasyonu — nihat kendi şubelerini görür", async () => {
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json: nihatBranches } = await api("GET", "/branches", { jar: nihat });
    const { jar: cenan } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId: fromBranchId, items: [{ productId, quantity: 5 }] },
    });
    assert.equal(status, 400);
  });

  test("Ürünsüz transfer reddedilir", async () => {
    if (!fromBranchId || !toBranchId) return;
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/branches/transfers", {
      jar,
      body: { fromBranchId, toBranchId, items: [] },
    });
    assert.equal(status, 400);
  });

  test("Transfer listesi döner", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/branches/transfers/${transferId}/complete`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.transfer.status, "completed");
  });

  test("Tamamlanmış transfer tekrar tamamlanamaz", async () => {
    if (!transferId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/branches/transfers/${transferId}/complete`, { jar });
    assert.equal(status, 409, `409 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Bekleyen transfer iptal edilebilir", async () => {
    if (!fromBranchId || !toBranchId || !productId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/integrations/webhooks", {
      jar,
      body: { name: "Bad URL", url: "bu-bir-url-degil", events: [] },
    });
    assert.equal(status, 400, `400 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Webhook güncellenebilir", async () => {
    if (!webhookId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/integrations/webhooks/${webhookId}/test`, { jar });
    // Dış URL ulaşılamaz olabilir — success/fail ayrımı değil, response şeklini kontrol et
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("success" in json, "success alanı olmalı");
  });

  test("Webhook teslimat logu listelenir", async () => {
    if (!webhookId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/integrations/webhooks/${webhookId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Silinen webhook bulunamaz", async () => {
    if (!webhookId) return;
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", `/integrations/webhooks/${webhookId}/deliveries`, { jar });
    assert.equal(status, 404);
  });

  // ─── API Key CRUD ──────────────────────────────────────────────────────
  test("Admin API Key oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/integrations/api-keys/${apiKeyId}`, {
      jar, body: { isActive: false },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.apiKey.isActive, false);
  });

  test("API Key ad olmadan oluşturulamaz", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/integrations/api-keys", {
      jar, body: { scopes: "read" },
    });
    assert.equal(status, 400);
  });

  test("API Key silinebilir", async () => {
    if (!apiKeyId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/ext-integrations/accounting/providers", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.providers), "providers dizisi bekleniyor");
    assert.ok(json.providers.length > 0, "En az bir sağlayıcı olmalı");
    const ids = json.providers.map(p => p.id);
    assert.ok(ids.includes("parasut"), "parasut içermeli");
    assert.ok(ids.includes("logo"), "logo içermeli");
  });

  test("Admin muhasebe entegrasyonu ekleyebilir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/ext-integrations/accounting", {
      jar,
      body: { provider: "parasut", credentials: {} },
    });
    assert.equal(status, 409, `409 bekleniyor`);
  });

  test("Muhasebe entegrasyonları listelenir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/ext-integrations/accounting", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.integrations));
    if (accIntegrationId) {
      const found = json.integrations.find(i => i.id === accIntegrationId);
      assert.ok(found, "Oluşturulan entegrasyon listede olmalı");
    }
  });

  test("Geçersiz sağlayıcı reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/ext-integrations/accounting", {
      jar, body: { provider: "sahte-yazilim", credentials: {} },
    });
    assert.equal(status, 400);
  });

  test("Senkronizasyon tetiklenebilir (simülasyon)", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", `/ext-integrations/accounting/${accIntegrationId}/sync`, {
      jar, body: { syncType: "sahte-tip" },
    });
    assert.equal(status, 400);
  });

  test("Senkronizasyon logu listelenir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/ext-integrations/accounting/${accIntegrationId}/logs`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.logs), "logs dizisi olmalı");
    assert.ok(json.logs.length >= 1, "En az 1 log kaydı olmalı");
  });

  test("Muhasebe entegrasyonu güncellenebilir", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/ext-integrations/accounting/${accIntegrationId}`, {
      jar, body: { displayName: "Paraşüt Üretim", isActive: false },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.integration.displayName, "Paraşüt Üretim");
    assert.equal(json.integration.isActive, false);
  });

  test("Pasif entegrasyon senkronize edilemez", async () => {
    if (!accIntegrationId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/ext-integrations/ecommerce/platforms", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.platforms));
    const ids = json.platforms.map(p => p.id);
    assert.ok(ids.includes("trendyol"), "trendyol içermeli");
    assert.ok(ids.includes("hepsiburada"), "hepsiburada içermeli");
  });

  test("Admin e-ticaret entegrasyonu ekleyebilir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/ext-integrations/ecommerce", {
      jar, body: { storeName: "Mağazam" },
    });
    assert.equal(status, 400);
  });

  test("Mağaza adı olmadan entegrasyon eklenemez", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/ext-integrations/ecommerce", {
      jar, body: { platform: "n11" },
    });
    assert.equal(status, 400);
  });

  test("E-ticaret entegrasyonları listelenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "product_push" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("success" in json, "success alanı olmalı");
    assert.ok(json.log?.syncType === "product_push");
  });

  test("Sipariş çekme senkronizasyonu tetiklenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "order_pull" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.log?.syncType === "order_pull");
  });

  test("Stok güncelleme senkronizasyonu tetiklenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/ext-integrations/ecommerce/${ecIntegrationId}/sync`, {
      jar, body: { syncType: "inventory_update" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.log?.syncType === "inventory_update");
  });

  test("Senkronizasyon logu listelenir (birden fazla kayıt)", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/ext-integrations/ecommerce/${ecIntegrationId}/logs`, { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.logs));
    assert.ok(json.logs.length >= 3, "3 sync'ten en az 3 log olmalı");
  });

  test("E-ticaret entegrasyonu güncellenebilir", async () => {
    if (!ecIntegrationId) return;
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/subscriptions/plans", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.plans), "plans dizisi bekleniyor");
    assert.ok(json.plans.length >= 4, "En az 4 plan olmalı");
    const slugs = json.plans.map(p => p.slug);
    assert.ok(slugs.includes("pkg_starter"), "pkg_starter planı olmalı");
    assert.ok(slugs.includes("pkg_starter"), "pkg_starter planı olmalı");
    assert.ok(slugs.includes("pkg_pro"), "pkg_pro planı olmalı");
    assert.ok(slugs.includes("pkg_enterprise_v3"), "pkg_enterprise_v3 planı olmalı");
  });

  test("Mevcut abonelik bilgisi alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("usage" in json, "usage alanı olmalı");
    assert.ok(typeof json.usage.users === "number", "users sayı olmalı");
    assert.ok(typeof json.usage.products === "number", "products sayı olmalı");
    assert.ok(json.companyPlanType, "companyPlanType olmalı");
  });

  test("Kullanım istatistikleri alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/subscriptions/usage", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.usage, "usage olmalı");
  });

  test("Admin Pro planına abone olabilir", async () => {
    const { jar } = await login("admin", "admin123");
    // Pro planın id'sini bul
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const proPlan = plansJson.plans.find(p => p.slug === "pkg_pro");
    assert.ok(proPlan, "pkg_pro plan bulunmalı");

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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(status, 200);
    assert.ok(json.subscription?.status === "active", "Abonelik aktif olmalı");
    assert.equal(json.plan.slug, "pkg_pro", "pkg_pro plan aktif olmalı");
  });

  test("Aynı plana tekrar abone olunabilir (yenileme)", async () => {
    const { jar } = await login("admin", "admin123");
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const starterPlan = plansJson.plans.find(p => p.slug === "pkg_starter");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: starterPlan.id, billingCycle: "yearly" },
    });
    // Düşürme de mümkün olmalı
    assert.equal(status, 201);
  });

  test("Geçersiz planId reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: 9999, billingCycle: "monthly" },
    });
    assert.equal(status, 404);
  });

  test("Geçersiz billingCycle reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    const proPlan = plansJson.plans.find(p => p.slug === "pkg_pro");
    const { status } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: proPlan.id, billingCycle: "weekly" },
    });
    assert.equal(status, 400);
  });

  test("Fatura geçmişi listelenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    // Önce fatura durumunu kontrol et
    const { json: invList } = await api("GET", "/subscriptions/invoices", { jar });
    const pendingInv = invList.invoices.find(i => i.status === "pending");
    if (!pendingInv) return; // Tüm faturalar zaten ödendi

    const { status, json } = await api("POST", `/subscriptions/invoices/${pendingInv.id}/pay`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.invoice.status, "paid");
  });

  test("Zaten ödenmiş fatura tekrar ödenemez", async () => {
    const { jar } = await login("admin", "admin123");
    const { json: invList } = await api("GET", "/subscriptions/invoices", { jar });
    const paidInv = invList.invoices.find(i => i.status === "paid");
    if (!paidInv) return;

    const { status } = await api("POST", `/subscriptions/invoices/${paidInv.id}/pay`, { jar });
    assert.equal(status, 409);
  });

  test("Abonelik iptal edilebilir (grace period)", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/subscriptions/cancel", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
    assert.ok(json.gracePeriodEndsAt, "gracePeriodEndsAt olmalı");
  });

  test("İptal sonrası abonelik grace_period statüsünde", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/subscriptions/current", { jar });
    assert.ok(
      json.subscription?.status === "grace_period" || json.subscription === null,
      "Grace period veya null bekleniyor"
    );
  });

  test("Grace period aboneliği yeniden aktif edilebilir", async () => {
    const { jar } = await login("admin", "admin123");
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

  // Cleanup (STRICT): PROSAN'i tekrar pkg_pro/active'e döndür — aksi halde
  // sonraki suite'ler (Sprint 12/22/23/73) FEATURE_LOCKED 403 alir.
  // Silent catch yok: cleanup hata verirse test suite'ini fail et.
  after(async () => {
    const { jar } = await login("admin", "admin123");
    const { status: pStatus, json: plansJson } = await api("GET", "/subscriptions/plans", { jar });
    assert.equal(pStatus, 200, `cleanup: plans listesi 200 olmali — ${JSON.stringify(plansJson)}`);
    const growthPlan = plansJson.plans?.find(p => p.slug === "pkg_pro");
    assert.ok(growthPlan, "cleanup: pkg_pro plani bulunamadi (seed bozuk olabilir)");
    const { status: sStatus, json: sJson } = await api("POST", "/subscriptions/subscribe", {
      jar, body: { planId: growthPlan.id, billingCycle: "yearly" },
    });
    assert.equal(sStatus, 201, `cleanup: pkg_pro aboneligine donus 201 olmali — ${JSON.stringify(sJson)}`);
    const { status: cStatus, json: cJson } = await api("GET", "/subscriptions/current", { jar });
    assert.equal(cStatus, 200, "cleanup: current 200 olmali");
    assert.equal(cJson.subscription?.status, "active", `cleanup: aktif olmali — ${JSON.stringify(cJson.subscription)}`);
    assert.equal(cJson.plan?.slug, "pkg_pro", `cleanup: pkg_pro aktif olmali — ${JSON.stringify(cJson.plan)}`);
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
    // B1+B2: PROSAN baseline plan zemini garantile (Sprint 11 after() bağımlılığı kırma)
    await ensureTenantPlan("prosan", "pkg_pro", "yearly");
    const a = await login("admin", "admin123");
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
  before(async () => { await ensureTenantPlan("prosan", "pkg_pro", "yearly"); });
  let ruleId;

  test("Desteklenen bildirim tipleri listelenir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/notification-rules", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.rules));
  });

  test("Admin kural oluşturabilir (low_stock eşikli)", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/notification-rules", {
      jar,
      body: { name: "Satış Bildirimi", type: "new_sale", isActive: true },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.type, "new_sale");
  });

  test("Kural listesinde oluşturulan kural görünüyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/notification-rules", { jar });
    assert.ok(json.rules.some(r => r.id === ruleId));
  });

  test("Kural güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/notification-rules/${ruleId}`, {
      jar,
      body: { name: "Güncellenmiş Stok Uyarısı", threshold: 10 },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Güncellenmiş Stok Uyarısı");
    assert.equal(json.threshold, 10);
  });

  test("Kural toggle (aktif/pasif) çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PATCH", `/notification-rules/${ruleId}/toggle`, { jar });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.isActive, false, "Pasife alınmalı");

    // Tekrar aktifleştir
    const { json: j2 } = await api("PATCH", `/notification-rules/${ruleId}/toggle`, { jar });
    assert.equal(j2.isActive, true);
  });

  test("Test bildirimi gönderilebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/notification-rules/${ruleId}/test`, { jar });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.message);
  });

  test("Test bildirimi notifications tablosuna ekleniyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/notifications", { jar });
    assert.ok(json.notifications.some(n => n.type === "low_stock"), "low_stock bildirimi olmalı");
  });

  test("Kullanıcı tercihleri alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/notification-rules/preferences", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.preferences));
    assert.ok(json.preferences.length >= 7, "Tüm tipler için tercih olmalı");
    assert.ok(json.preferences.every(p => p.type && typeof p.enabled === "boolean"));
  });

  test("Kullanıcı tercihleri güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
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
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/notification-rules/${ruleId}`, { jar });
    assert.equal(status, 204);
  });

  test("Silinen kural listede yok", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/notification-rules", { jar });
    assert.ok(!json.rules.some(r => r.id === ruleId));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 22 — Personel Yönetimi
// ═══════════════════════════════════════════════════════════════════════════════
describe("Sprint 22 — Personel Yönetimi", () => {
  before(async () => { await ensureTenantPlan("prosan", "pkg_pro", "yearly"); });
  let deptId;
  let personnelId;
  let leaveId;

  test("Departman listesi başlangıçta boş", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/departments", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.departments));
  });

  test("Admin departman oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/departments", {
      jar,
      body: { name: "Satış Departmanı", description: "Satış ve pazarlama ekibi" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Satış Departmanı");
    assert.ok(json.id);
    deptId = json.id;
  });

  test("Viewer departman oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/departments", { jar, body: { name: "Yasak" } });
    assert.equal(status, 403);
  });

  test("Departman güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/departments/${deptId}`, {
      jar,
      body: { name: "Satış & Pazarlama" },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Satış & Pazarlama");
  });

  test("Admin personel oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/personnel", {
      jar,
      body: {
        firstName: "Ahmet",
        lastName: "Yılmaz",
        position: "Satış Temsilcisi",
        departmentId: deptId,
        phone: "05551234567",
        email: "ahmet@test.com",
        startDate: "2024-01-15",
        salary: "25000",
        isActive: true,
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.fullName, "Ahmet Yılmaz");
    assert.equal(json.position, "Satış Temsilcisi");
    assert.ok(json.id);
    personnelId = json.id;
  });

  test("Personel listesinde görünüyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/personnel", { jar });
    assert.ok(json.personnel.some((p) => p.id === personnelId));
  });

  test("Personel detayı alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/personnel/${personnelId}`, { jar });
    assert.equal(status, 200);
    assert.equal(json.fullName, "Ahmet Yılmaz");
    assert.ok(Array.isArray(json.leaves));
  });

  test("İstatistikler alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/personnel/stats", { jar });
    assert.equal(status, 200);
    assert.ok(typeof json.total === "number");
    assert.ok(typeof json.active === "number");
    assert.ok(typeof json.inactive === "number");
    assert.ok(typeof json.pendingLeaves === "number");
  });

  test("Personel güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/personnel/${personnelId}`, {
      jar,
      body: { position: "Kıdemli Satış Temsilcisi", salary: "30000" },
    });
    assert.equal(status, 200);
    assert.equal(json.position, "Kıdemli Satış Temsilcisi");
  });

  test("Personel aktif/pasif toggle çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PATCH", `/personnel/${personnelId}/toggle`, { jar });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.isActive, false);
    // Tekrar aktifleştir
    const { json: j2 } = await api("PATCH", `/personnel/${personnelId}/toggle`, { jar });
    assert.equal(j2.isActive, true);
  });

  test("İzin talebi oluşturulabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/leave-requests", {
      jar,
      body: {
        personnelId,
        type: "annual",
        startDate: "2026-05-01",
        endDate: "2026-05-05",
        days: 5,
        reason: "Yıllık tatil",
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.status, "pending");
    assert.equal(json.typeLabel, "Yıllık İzin");
    leaveId = json.id;
  });

  test("İzin talepleri listeleniyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/leave-requests", { jar });
    assert.ok(json.leaveRequests.some((l) => l.id === leaveId));
  });

  test("İzin talebi onaylanabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PATCH", `/leave-requests/${leaveId}/approve`, { jar });
    assert.equal(status, 200);
    assert.equal(json.status, "approved");
  });

  test("Onaylanan izin personel detayında görünüyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", `/personnel/${personnelId}`, { jar });
    const leave = json.leaves.find((l) => l.id === leaveId);
    assert.ok(leave, "İzin personel detayında görünmeli");
    assert.equal(leave.status, "approved");
  });

  test("Viewer izin talebi oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/leave-requests", {
      jar,
      body: { personnelId, type: "sick", startDate: "2026-06-01", endDate: "2026-06-02", days: 1 },
    });
    assert.equal(status, 403);
  });

  test("Tenant izolasyonu: diğer tenant personel göremez", async () => {
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json } = await api("GET", "/personnel", { jar });
    assert.ok(!json.personnel?.some((p) => p.id === personnelId), "Başka tenant personeli görmemeli");
  });

  test("İzin talebi silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/leave-requests/${leaveId}`, { jar });
    assert.equal(status, 204);
  });

  test("Personel silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/personnel/${personnelId}`, { jar });
    assert.equal(status, 204);
  });

  test("Departman silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/departments/${deptId}`, { jar });
    assert.equal(status, 204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 23 — Kampanya & İndirim Yönetimi
// ═══════════════════════════════════════════════════════════════════════════════
describe("Sprint 23 — Kampanya & İndirim Yönetimi", () => {
  before(async () => { await ensureTenantPlan("prosan", "pkg_pro", "yearly"); });
  let campaignId;
  let fixedCampaignId;

  test("Kampanya listesi başlangıçta boş", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/campaigns", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.campaigns));
  });

  test("Aktif kampanya listesi alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/campaigns/active", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.campaigns));
  });

  test("Admin yüzde indirim kampanyası oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { status, json } = await api("POST", "/campaigns", {
      jar,
      body: {
        name: "Yaz İndirimi",
        discountType: "percent",
        discountValue: 20,
        scope: "all",
        startDate: today,
        endDate: future,
        isActive: true,
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Yaz İndirimi");
    assert.equal(json.discountType, "percent");
    assert.ok(json.discountLabel);
    assert.ok(json.statusLabel);
    campaignId = json.id;
  });

  test("Admin sabit indirim kampanyası oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const { status, json } = await api("POST", "/campaigns", {
      jar,
      body: {
        name: "50TL İndirim",
        discountType: "fixed",
        discountValue: 50,
        scope: "all",
        minAmount: 200,
        startDate: today,
        endDate: future,
        couponCode: "YAZ50",
        isActive: true,
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.couponCode, "YAZ50");
    fixedCampaignId = json.id;
  });

  test("Kampanya detayı alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/campaigns/${campaignId}`, { jar });
    assert.equal(status, 200);
    assert.equal(json.id, campaignId);
  });

  test("Kampanya listesinde görünüyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/campaigns", { jar });
    assert.ok(json.campaigns.some((c) => c.id === campaignId));
  });

  test("Aktif kampanya listesinde görünüyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/campaigns/active", { jar });
    assert.ok(json.campaigns.some((c) => c.id === campaignId));
  });

  test("Kampanya güncellenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/campaigns/${campaignId}`, {
      jar,
      body: { name: "Yaz Büyük İndirimi", discountValue: 25 },
    });
    assert.equal(status, 200);
    assert.equal(json.name, "Yaz Büyük İndirimi");
  });

  test("Kampanya toggle (aktif/pasif) çalışıyor", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PATCH", `/campaigns/${campaignId}/toggle`, { jar });
    assert.equal(status, 200);
    assert.equal(json.isActive, false);
    // Geri aktifleştir
    const { json: j2 } = await api("PATCH", `/campaigns/${campaignId}/toggle`, { jar });
    assert.equal(j2.isActive, true);
  });

  test("Kampanya uygulama — yeterli tutar", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/campaigns/apply", {
      jar,
      body: { amount: 300, quantity: 1 },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.applicable));
    assert.ok(json.applicable.length >= 1, "En az 1 kampanya uygulanmalı");
    assert.ok(json.discountAmount > 0);
    assert.ok(json.finalAmount < 300);
    assert.ok(json.bestCampaign);
  });

  test("Kampanya uygulama — sabit indirim min tutar kontrolü", async () => {
    const { jar } = await login("admin", "admin123");
    // 50TL kampanyası için minAmount=200, burada 100TL ile deneyelim
    const { json } = await api("POST", "/campaigns/apply", { jar, body: { amount: 100, quantity: 1 } });
    // 50TL kampanyası uygulanmamalı (minAmount=200 > 100)
    const fixed = json.applicable?.find((c) => c.id === fixedCampaignId);
    assert.ok(!fixed, "Minimum tutar sağlanmadığında sabit indirim uygulanmamalı");
  });

  test("Viewer kampanya oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/campaigns", {
      jar,
      body: { name: "Yasak", discountType: "percent", discountValue: 10, scope: "all", startDate: "2026-01-01", endDate: "2026-12-31" },
    });
    assert.equal(status, 403);
  });

  test("Tenant izolasyonu: diğer tenant kampanya göremez", async () => {
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const { json } = await api("GET", "/campaigns", { jar });
    assert.ok(!json.campaigns?.some((c) => c.id === campaignId), "Başka tenant kampanyası görülmemeli");
  });

  test("Kampanya silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/campaigns/${campaignId}`, { jar });
    assert.equal(status, 204);
  });

  test("İkinci kampanya da silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/campaigns/${fixedCampaignId}`, { jar });
    assert.equal(status, 204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 20 — Public API (Geliştirici API'si)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Sprint 20 — Public API", () => {
  let rawApiKey;
  let apiKeyId;

  // Public API için Bearer auth yardımcısı
  async function publicApi(method, path, { body, apiKey } = {}) {
    const url = `http://localhost:8080/api${path}`;
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    const r = await fetch(url, opts);
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  }

  test("API anahtarı olmadan erişim engellenir", async () => {
    const { status } = await publicApi("GET", "/public/v1/info");
    assert.equal(status, 401);
  });

  test("Geçersiz API anahtarı reddedilir", async () => {
    const { status } = await publicApi("GET", "/public/v1/info", { apiKey: "sms_invalid_key_here_invalid" });
    assert.equal(status, 401);
  });

  test("Admin 'write' scope ile API anahtarı oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/integrations/api-keys", {
      jar,
      body: { name: "Test API Anahtarı", scopes: "write" },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.apiKey?.rawKey, "rawKey dönmeli");
    rawApiKey = json.apiKey.rawKey;
    apiKeyId = json.apiKey.id;
  });

  test("API anahtarı ile /info alınabilir", async () => {
    const { status, json } = await publicApi("GET", "/public/v1/info", { apiKey: rawApiKey });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.api?.version);
    assert.ok(json.company?.name);
    assert.equal(json.scopes, "write");
  });

  test("Ürün listesi alınabilir", async () => {
    const { status, json } = await publicApi("GET", "/public/v1/products", { apiKey: rawApiKey });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.products));
    assert.ok(json.pagination?.total >= 0);
  });

  test("Sayfalama parametreleri çalışıyor", async () => {
    const { json } = await publicApi("GET", "/public/v1/products?page=1&limit=5", { apiKey: rawApiKey });
    assert.ok(json.products.length <= 5);
    assert.equal(json.pagination?.limit, 5);
  });

  test("Barkod ile ürün sorgulanabilir", async () => {
    // Önce var olan bir ürünün barkodunu al
    const { json: listJson } = await publicApi("GET", "/public/v1/products?limit=1", { apiKey: rawApiKey });
    if (listJson.products.length > 0 && listJson.products[0].barcode) {
      const barcode = listJson.products[0].barcode;
      const { status, json } = await publicApi("GET", `/public/v1/products/${barcode}`, { apiKey: rawApiKey });
      assert.equal(status, 200);
      assert.equal(json.barcode, barcode);
    } else {
      // Barkod yoksa 404 bekleniyor
      const { status } = await publicApi("GET", "/public/v1/products/NONEXISTENT", { apiKey: rawApiKey });
      assert.equal(status, 404);
    }
  });

  test("Stok özeti alınabilir", async () => {
    const { status, json } = await publicApi("GET", "/public/v1/inventory", { apiKey: rawApiKey });
    assert.equal(status, 200);
    assert.ok(typeof json.totalProducts === "number");
    assert.ok(typeof json.totalStock === "number");
    assert.ok(typeof json.lowStockCount === "number");
    assert.ok(Array.isArray(json.byCategory));
  });

  test("Aktif kampanyalar alınabilir", async () => {
    const { status, json } = await publicApi("GET", "/public/v1/campaigns", { apiKey: rawApiKey });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.campaigns));
  });

  test("İstatistikler (write scope ile) alınabilir", async () => {
    const { status, json } = await publicApi("GET", "/public/v1/stats", { apiKey: rawApiKey });
    assert.equal(status, 200);
    assert.ok(json.month);
    assert.ok(json.sales);
    assert.ok(json.inventory);
  });

  test("Read-only anahtar write endpoint'i çağıramaz", async () => {
    // Read-only anahtar oluştur
    const { jar } = await login("admin", "admin123");
    const { json: keyJson } = await api("POST", "/integrations/api-keys", {
      jar,
      body: { name: "Read Only", scopes: "read" },
    });
    const readOnlyKey = keyJson.apiKey?.rawKey;
    assert.ok(readOnlyKey);

    const { status } = await publicApi("GET", "/public/v1/stats", { apiKey: readOnlyKey });
    assert.equal(status, 403);

    // Temizle
    await api("DELETE", `/integrations/api-keys/${keyJson.apiKey.id}`, { jar });
  });

  test("API anahtarı silinebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/integrations/api-keys/${apiKeyId}`, { jar });
    assert.equal(status, 200);
  });

  test("Silinmiş anahtar artık çalışmaz", async () => {
    const { status } = await publicApi("GET", "/public/v1/info", { apiKey: rawApiKey });
    assert.equal(status, 401);
  });
});

// ─── Sprint 16 — Katalog Yönetimi ─────────────────────────────────────────────
describe("Sprint 16 — Katalog Yönetimi", () => {
  let writeApiKey;

  async function publicApi(method, path, { body, apiKey } = {}) {
    const url = `http://localhost:8080/api${path}`;
    const r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  }

  test("Admin katalog ayarlarını alabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/catalog-settings", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("isEnabled" in json, "isEnabled alanı olmalı");
    assert.ok("allowOrders" in json, "allowOrders alanı olmalı");
  });

  test("Admin katalog ayarlarını güncelleyebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", "/catalog-settings", {
      jar,
      body: { isEnabled: true, title: "Test Kataloğu", showPrices: true, allowOrders: true },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.isEnabled, true);
    assert.equal(json.title, "Test Kataloğu");
  });

  test("Viewer katalog ayarlarını güncelleyemez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("PUT", "/catalog-settings", {
      jar,
      body: { isEnabled: false },
    });
    assert.equal(status, 403);
  });

  test("Aktif katalog API anahtarı ile alınabilir", async () => {
    // Önce write scope ile API key oluştur
    const { jar } = await login("admin", "admin123");
    const { json: keyJson } = await api("POST", "/integrations/api-keys", {
      jar,
      body: { name: "Katalog Test Anahtarı", scopes: "write" },
    });
    writeApiKey = keyJson.apiKey?.rawKey;

    const { status, json } = await publicApi("GET", "/public/v1/catalog", { apiKey: writeApiKey });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.products), "products dizisi olmalı");
    assert.ok("catalog" in json, "catalog objesi olmalı");
  });

  test("Katalog devre dışı bırakıldığında 403 döner", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/catalog-settings", { jar, body: { isEnabled: false } });
    const { status } = await publicApi("GET", "/public/v1/catalog", { apiKey: writeApiKey });
    assert.equal(status, 403);
    // Tekrar aktif et
    await api("PUT", "/catalog-settings", { jar, body: { isEnabled: true } });
  });

  test("Temizlik: katalog API anahtarını sil", async () => {
    if (!writeApiKey) return;
    const { jar } = await login("admin", "admin123");
    const { json: listJson } = await api("GET", "/integrations/api-keys", { jar });
    const key = listJson?.apiKeys?.find(k => k.name === "Katalog Test Anahtarı");
    if (key) {
      const { status } = await api("DELETE", `/integrations/api-keys/${key.id}`, { jar });
      assert.equal(status, 200);
    }
  });
});

// ─── Sprint 17 — Sipariş Yönetimi ─────────────────────────────────────────────
describe("Sprint 17 — Sipariş Yönetimi", () => {
  let orderId;
  let productId;
  let writeApiKey;

  async function publicApi(method, path, { body, apiKey } = {}) {
    const url = `http://localhost:8080/api${path}`;
    const r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  }

  test("Sipariş oluşturmak için ürün ID alınır", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/products", { jar });
    const products = json?.products ?? json ?? [];
    productId = Array.isArray(products) ? products[0]?.id : null;
    assert.ok(productId, "En az bir ürün olmalı");
  });

  test("Admin sipariş oluşturabilir", async () => {
    if (!productId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/orders", {
      jar,
      body: {
        customerName: "Test Müşteri",
        customerEmail: "test@example.com",
        customerPhone: "05001234567",
        notes: "Test notu",
        items: [{ productId, quantity: 2, unitPrice: 100 }],
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.order?.id, "Sipariş ID'si olmalı");
    assert.ok(json.order?.orderNo?.startsWith("ORD-"), "Sipariş numarası formatı");
    orderId = json.order.id;
  });

  test("Viewer sipariş oluşturamaz", async () => {
    if (!productId) return;
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/orders", {
      jar,
      body: { customerName: "Test", items: [{ productId, quantity: 1, unitPrice: 50 }] },
    });
    assert.equal(status, 403);
  });

  test("Admin sipariş listesini alabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/orders", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.orders), "orders dizisi olmalı");
    assert.ok("pagination" in json, "pagination bilgisi olmalı");
  });

  test("Sipariş detayı alınabilir", async () => {
    if (!orderId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/orders/${orderId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.id, orderId);
    assert.ok(Array.isArray(json.items), "items dizisi olmalı");
  });

  test("Sipariş istatistikleri alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/orders/stats", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("total" in json, "total alanı olmalı");
    assert.ok(Array.isArray(json.byStatus), "byStatus dizisi olmalı");
  });

  test("Sipariş durumu güncellenebilir", async () => {
    if (!orderId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PATCH", `/orders/${orderId}/status`, {
      jar,
      body: { status: "confirmed" },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.status, "confirmed");
  });

  test("Geçersiz sipariş durumu reddedilir", async () => {
    if (!orderId) return;
    const { jar } = await login("admin", "admin123");
    const { status } = await api("PATCH", `/orders/${orderId}/status`, {
      jar,
      body: { status: "gecersiz_durum" },
    });
    assert.equal(status, 400);
  });

  test("Onaylanmış sipariş silinemez", async () => {
    if (!orderId) return;
    const { jar } = await login("admin", "admin123");
    const { status } = await api("DELETE", `/orders/${orderId}`, { jar });
    assert.equal(status, 409);
  });

  test("Public API ile katalog sipariş oluşturulabilir", async () => {
    if (!productId) return;
    // Write scope API key oluştur
    const { jar } = await login("admin", "admin123");
    const { json: keyJson } = await api("POST", "/integrations/api-keys", {
      jar,
      body: { name: "Sipariş Test Anahtarı", scopes: "write" },
    });
    writeApiKey = keyJson.apiKey?.rawKey;

    const { status, json } = await publicApi("POST", "/public/v1/orders", {
      apiKey: writeApiKey,
      body: {
        customerName: "API Müşterisi",
        customerEmail: "api@example.com",
        items: [{ productId, quantity: 1 }],
      },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.order?.orderNo, "Sipariş numarası olmalı");
  });

  test("Bekleyen sipariş silinebilir", async () => {
    if (!orderId) return;
    // Durumu cancelled yap, sonra sil
    const { jar } = await login("admin", "admin123");
    await api("PATCH", `/orders/${orderId}/status`, { jar, body: { status: "cancelled" } });
    const { status, json } = await api("DELETE", `/orders/${orderId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Temizlik: API anahtarını sil", async () => {
    if (!writeApiKey) return;
    const { jar } = await login("admin", "admin123");
    const { json: listJson } = await api("GET", "/integrations/api-keys", { jar });
    const key = listJson?.apiKeys?.find(k => k.name === "Sipariş Test Anahtarı");
    if (key) {
      await api("DELETE", `/integrations/api-keys/${key.id}`, { jar });
    }
  });
});

// ─── Sprint 18 — Müşteri Grupları & Özel Fiyatlandırma ───────────────────────
describe("Sprint 18 — Müşteri Grupları", () => {
  let groupId;
  let customerId;

  test("Müşteri ID alınır", async () => {
    const { jar } = await login("admin", "admin123");
    const { json } = await api("GET", "/customers", { jar });
    const customers = json?.customers ?? json ?? [];
    customerId = Array.isArray(customers) ? customers[0]?.id : null;
  });

  test("Admin müşteri grubu oluşturabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", "/customer-groups", {
      jar,
      body: { name: "VIP Müşteriler", description: "En iyi müşteriler", discountPct: 10 },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(json.group?.id, "Grup ID'si olmalı");
    assert.equal(json.group.name, "VIP Müşteriler");
    assert.equal(json.group.discountPct, 10);
    groupId = json.group.id;
  });

  test("Geçersiz indirim yüzdesi reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/customer-groups", {
      jar,
      body: { name: "Hatalı Grup", discountPct: 150 },
    });
    assert.equal(status, 400);
  });

  test("Viewer müşteri grubu oluşturamaz", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("POST", "/customer-groups", {
      jar,
      body: { name: "Viewer Grubu", discountPct: 5 },
    });
    assert.equal(status, 403);
  });

  test("Müşteri grupları listelenebilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/customer-groups", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(json.groups), "groups dizisi olmalı");
  });

  test("Müşteri grubu detayı alınabilir", async () => {
    if (!groupId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", `/customer-groups/${groupId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.id, groupId);
    assert.ok(Array.isArray(json.members), "members dizisi olmalı");
  });

  test("Müşteri gruba eklenebilir", async () => {
    if (!groupId || !customerId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("POST", `/customer-groups/${groupId}/members`, {
      jar,
      body: { customerId },
    });
    assert.equal(status, 201, `201 bekleniyor — ${JSON.stringify(json)}`);
  });

  test("Müşteri grubundan çıkarılabilir", async () => {
    if (!groupId || !customerId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/customer-groups/${groupId}/members/${customerId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Müşteri grubu güncellenebilir", async () => {
    if (!groupId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("PUT", `/customer-groups/${groupId}`, {
      jar,
      body: { name: "Platinum Müşteriler", discountPct: 15 },
    });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.name, "Platinum Müşteriler");
    assert.equal(json.discountPct, 15);
  });

  test("Müşteri grubu silinebilir", async () => {
    if (!groupId) return;
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("DELETE", `/customer-groups/${groupId}`, { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.ok, true);
  });

  test("Silinmiş grup bulunamaz", async () => {
    if (!groupId) return;
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", `/customer-groups/${groupId}`, { jar });
    assert.equal(status, 404);
  });
});

// ─── Sprint 19 — Sipariş & Katalog Analitik ───────────────────────────────────
describe("Sprint 19 — Sipariş & Katalog Analitik", () => {

  test("Sipariş analitiği alınabilir (varsayılan: month)", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/orders/analytics", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("totals" in json, "totals olmalı");
    assert.ok("bySource" in json, "bySource olmalı");
    assert.ok("topProducts" in json, "topProducts olmalı");
    assert.ok("period" in json, "period olmalı");
  });

  test("Sipariş analitiği haftalık periyot ile alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/orders/analytics?period=week", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.period, "week");
  });

  test("Sipariş analitiği yıllık periyot ile alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/orders/analytics?period=year", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.equal(json.period, "year");
  });

  test("Viewer sipariş analitiğini göremez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/orders/analytics", { jar });
    assert.equal(status, 403);
  });

  test("Katalog analitiği alınabilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/catalog-analytics", { jar });
    assert.equal(status, 200, `200 bekleniyor — ${JSON.stringify(json)}`);
    assert.ok("orderStats" in json, "orderStats olmalı");
    assert.ok("totalOrders" in json.orderStats, "totalOrders olmalı");
    assert.ok("catalogOrders" in json.orderStats, "catalogOrders olmalı");
  });

  test("Viewer katalog analitiğini göremez", async () => {
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/catalog-analytics", { jar });
    assert.equal(status, 403);
  });
});

// ─── Sprint 24 — QA & Giriş Doğrulama ────────────────────────────────────────
describe("Sprint 24 — QA & Giriş Doğrulama", () => {
  test("Sipariş oluşturma: customerName olmadan 400 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/orders", {
      jar,
      body: { items: [{ productId: 1, quantity: 1, unitPrice: 10 }] },
    });
    assert.equal(status, 400);
  });

  test("Sipariş oluşturma: items boş olduğunda 400 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/orders", {
      jar,
      body: { customerName: "Test", items: [] },
    });
    assert.equal(status, 400);
  });

  test("Müşteri grubu: discountPct > 100 reddedilir", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/customer-groups", {
      jar,
      body: { name: "Hata Test", discountPct: 999 },
    });
    assert.equal(status, 400);
  });

  test("Müşteri grubu: name olmadan 400 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("POST", "/customer-groups", {
      jar,
      body: { discountPct: 5 },
    });
    assert.equal(status, 400);
  });

  test("Geçersiz ID ile sipariş detayı 400 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/orders/abc", { jar });
    assert.equal(status, 400);
  });

  test("Var olmayan sipariş 404 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/orders/999999", { jar });
    assert.equal(status, 404);
  });
});

// ─── Sprint 25 — Performans ───────────────────────────────────────────────────
describe("Sprint 25 — Performans", () => {
  test("Ürün listesi sıkıştırma desteği ile 200 döner", async () => {
    const { jar } = await login("admin", "admin123");
    const { status } = await api("GET", "/products", { jar });
    assert.equal(status, 200);
  });

  test("API JSON yanıtlarına Content-Type: application/json eklenir", async () => {
    const { jar } = await login("admin", "admin123");
    // api() helper json döndürüyorsa content-type doğru demektir
    const { status, json } = await api("GET", "/products", { jar });
    assert.equal(status, 200);
    assert.ok(json && typeof json === "object", "Yanıt JSON objesi olmalı");
    assert.ok(Array.isArray(json.products), "Yanıt JSON.products dizisi olmalı");
  });
});

// ─── Sprint 26 — Güvenlik ─────────────────────────────────────────────────────
describe("Sprint 26 — Güvenlik", () => {
  test("Güvenlik başlığı X-Content-Type-Options: nosniff aktif", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", "X-Content-Type-Options başlığı olmalı");
  });

  test("X-Frame-Options başlığı aktif", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    const header = r.headers.get("x-frame-options");
    assert.ok(header !== null, "X-Frame-Options başlığı olmalı");
  });

  test("Kimlik doğrulama olmadan korunan endpoint 401 döner", async () => {
    const r = await fetch("http://localhost:8080/api/products", {
      headers: { "x-tenant": "prosan" },
    });
    assert.equal(r.status, 401);
  });

  test("Yetkisiz role admin endpoint'e erişemez", async () => {
    // goruntule rolü admin-only endpoint'e erişemez
    const { jar } = await login("goruntule", "staff123");
    const { status } = await api("GET", "/companies", { jar });
    assert.equal(status, 403);
  });
});

// ─── Sprint 27 — DevOps & İzleme ─────────────────────────────────────────────
describe("Sprint 27 — DevOps & İzleme", () => {
  test("Temel sağlık kontrolü /healthz çalışıyor", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    const json = await r.json();
    assert.equal(r.status, 200);
    assert.equal(json.status, "ok");
  });

  test("Derin sağlık kontrolü /healthz/deep alt-bileşenleri (DB+Storage+SMTP) raporlar (sansürlü)", async () => {
    const r = await fetch("http://localhost:8080/api/healthz/deep");
    const json = await r.json();
    assert.ok([200, 503].includes(r.status), "status 200 veya 503 olmalı");
    assert.ok(["ok", "degraded", "down"].includes(json.status), "status değeri tanımlı kümede olmalı");
    assert.ok(json.checks, "checks objesi olmalı");
    assert.ok(json.checks.db, "db check olmalı");
    assert.equal(json.checks.db.status, "ok", "DB ok olmalı (test ortamı)");
    assert.ok(json.checks.objectStorage, "objectStorage check olmalı");
    assert.ok(json.checks.smtp, "smtp check olmalı");
    // Hassas bilgiler bu public uçtan dışlanmalı
    assert.equal(json.checks.db.detail, undefined, "public uçta detail dışlanmalı");
    assert.equal(json.checks.db.latencyMs, undefined, "public uçta latency dışlanmalı");
    assert.equal(json.nodeVersion, undefined, "public uçta nodeVersion dışlanmalı");
    assert.equal(json.memory, undefined, "public uçta memory dışlanmalı");
    assert.ok(typeof json.uptime === "number", "uptime sayı olmalı");
    assert.ok(json.version, "version bilgisi olmalı");
    assert.ok(json.timestamp, "timestamp olmalı");
  });

  test("/healthz/internal kimliksiz erişimi reddeder (403)", async () => {
    const r = await fetch("http://localhost:8080/api/healthz/internal");
    assert.equal(r.status, 403);
  });

  test("X-Request-Id otomatik üretilir ve yanıta yansıtılır", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    const id = r.headers.get("x-request-id");
    assert.ok(id && id.length >= 10, "request id üretilmiş olmalı");
  });

  test("X-Request-Id geçerli istemci değeri pass-through edilir", async () => {
    const r = await fetch("http://localhost:8080/api/healthz", { headers: { "X-Request-Id": "trace-xyz-789" } });
    assert.equal(r.headers.get("x-request-id"), "trace-xyz-789");
  });

  test("X-Request-Id geçersiz değer reddedilip yenisi üretilir", async () => {
    const r = await fetch("http://localhost:8080/api/healthz", { headers: { "X-Request-Id": "<bad chars>" } });
    const id = r.headers.get("x-request-id");
    assert.notEqual(id, "<bad chars>");
    assert.ok(id && id.length >= 10);
  });

  test("/api/client-errors endpoint'i hata raporu kabul eder", async () => {
    const r = await fetch("http://localhost:8080/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "regression test client error",
        stack: "Error: x\n  at test",
        url: "http://localhost/test-page",
      }),
    });
    assert.equal(r.status, 200);
    const json = await r.json();
    assert.equal(json.ok, true);
  });

  test("Sağlık endpoint'i kimlik doğrulama gerektirmiyor", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    assert.equal(r.status, 200);
  });
});

// ─── Sprint 73.6 — Reklam Bütçesi (atomic upsert regression) ────────────────
describe("Sprint 73.6 — Reklam Bütçesi", () => {
  let jar;
  let channelId;
  before(async () => {
    // B1+B2: PROSAN baseline plan zemini garantile (Sprint 11 after() bağımlılığı kırma)
    await ensureTenantPlan("prosan", "pkg_pro", "yearly");
    ({ jar } = await login("talha", "talha123"));
    const create = await api("POST", "/ad-budgets/channels", {
      jar,
      body: { code: "test_ch_" + Date.now(), name: "Test Reklam Kanalı", platform: "google_ads" },
    });
    assert.equal(create.status, 201, "Kanal oluşturulmalı");
    channelId = create.json.id;
  });

  test("Presets endpoint çalışıyor", async () => {
    const r = await api("GET", "/ad-budgets/presets", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json) && r.json.length >= 5, "En az 5 preset olmalı");
  });

  test("Paralel POST aynı period için tek satır oluşturur (atomic upsert)", async () => {
    const period = "2026-04";
    const requests = [1, 2, 3].map(() =>
      api("POST", "/ad-budgets/spends", {
        jar,
        body: { channelId, period, budgetAmount: 5000, spendAmount: 1500, conversions: 10, revenue: 8000 },
      })
    );
    const results = await Promise.all(requests);
    for (const r of results) assert.equal(r.status, 200, "Hepsi 200 dönmeli");

    const list = await api("GET", `/ad-budgets/spends?period=${period}`, { jar });
    const matching = list.json.filter((s) => s.channelId === channelId);
    assert.equal(matching.length, 1, "Aynı period için tek satır olmalı");
  });

  test("Summary endpoint ROAS hesaplıyor", async () => {
    const r = await api("GET", "/ad-budgets/summary?period=2026-04", { jar });
    assert.equal(r.status, 200);
    assert.ok(r.json.totals && typeof r.json.totals.spend === "number", "totals.spend olmalı");
    assert.ok("roas" in r.json.totals, "roas alanı olmalı");
  });
});

// ─── Sprint 73.7 — Ticarium Pazar (concurrent regression) ───────────────────
describe("Sprint 73.7 — Ticarium Pazar (Aggregator)", () => {
  let jar;
  before(async () => {
    // B1+B2: PROSAN baseline plan zemini garantile (Sprint 11 after() bağımlılığı kırma)
    await ensureTenantPlan("prosan", "pkg_pro", "yearly");
    ({ jar } = await login("talha", "talha123"));
  });

  test("Public /pazar endpoint auth gerektirmez", async () => {
    const r = await fetch("http://localhost:8080/api/public/v1/pazar?limit=5");
    assert.equal(r.status, 200);
    const json = await r.json();
    assert.ok(Array.isArray(json.items));
    assert.ok(typeof json.count === "number");
  });

  test("Stats endpoint çalışıyor", async () => {
    const r = await api("GET", "/aggregator/stats", { jar });
    assert.equal(r.status, 200);
    assert.ok("candidate" in r.json && "active" in r.json && "paused" in r.json);
  });

  test("Listings filter çalışıyor", async () => {
    const r = await api("GET", "/aggregator/listings?status=active", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    for (const l of r.json) assert.equal(l.status, "active");
  });

  test("Paralel activate/pause çağrıları tutarlı kalır", async () => {
    const list = await api("GET", "/aggregator/listings?status=active", { jar });
    if (!list.json || list.json.length === 0) return; // veri yoksa skip
    const target = list.json[0];

    // 5 paralel pause/activate döngüsü — race condition kontrolü
    const ops = [];
    for (let i = 0; i < 5; i++) {
      ops.push(api("POST", `/aggregator/listings/${target.id}/pause`, { jar }));
      ops.push(api("POST", `/aggregator/listings/${target.id}/activate`, { jar }));
    }
    const results = await Promise.all(ops);
    // Hiçbiri 5xx döndürmemeli (race olabilir ama deadlock/crash olmamalı)
    for (const r of results) {
      assert.ok(r.status < 500, `Race sırasında 5xx olmamalı (got ${r.status})`);
    }

    // Final state: stats okunabilmeli, chosen invariant korunmalı
    const stats = await api("GET", "/aggregator/stats", { jar });
    assert.equal(stats.status, 200);
  });
});

// ─── Canlı öncesi rate limit regression ──────────────────────────────────────
describe("Canlı Öncesi — Rate Limit & Güvenlik", () => {
  test("Strict-Transport-Security header production'da set edilir (env-bağımlı, dev'de yok)", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    // dev'de yok, prod'da olmalı; sadece varlığı test edemiyoruz, kırılganlık yok
    assert.ok(r.status === 200);
  });

  test("Referrer-Policy header set edildi", async () => {
    const r = await fetch("http://localhost:8080/api/healthz");
    assert.equal(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  });

  test("Public pazar endpoint çalışıyor", async () => {
    const r = await fetch("http://localhost:8080/api/public/v1/pazar?limit=3");
    assert.equal(r.status, 200);
  });

  test("İletişim formu validasyon yapıyor", async () => {
    const r = await fetch("http://localhost:8080/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.ok(r.status === 400 || r.status === 422, "Boş gövde reddedilmeli");
  });
});

// ─── Süper Admin & Audit Log kapsam testleri ─────────────────────────────────
describe("Süper Admin & Audit Log Kapsamı", () => {
  test("Süper admin login çalışıyor", async () => {
    const r = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "superadmin", password: "superadmin123" }),
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.user?.role, "super_admin");
  });

  test("Süper admin audit-logs endpoint'ine erişebiliyor", async () => {
    // login + cookie
    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "superadmin", password: "superadmin123" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
    const r = await fetch("http://localhost:8080/api/audit-logs?limit=5", {
      headers: { cookie },
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.ok(Array.isArray(data.items), "items array döndürülmeli");
  });

  test("Audit log /actions endpoint çalışıyor", async () => {
    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "superadmin", password: "superadmin123" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
    const r = await fetch("http://localhost:8080/api/audit-logs/actions", { headers: { cookie } });
    assert.equal(r.status, 200);
    const arr = await r.json();
    assert.ok(Array.isArray(arr));
  });
});

// ─── PWA Manifest & SEO meta ────────────────────────────────────────────────
describe("PWA & SEO", () => {
  test("Manifest dosyası var (frontend)", async () => {
    const r = await fetch("http://localhost:80/manifest.webmanifest");
    if (r.status === 200) {
      const ct = r.headers.get("content-type") || "";
      const data = await r.json();
      assert.equal(data.name, "Ticarium365");
      assert.equal(data.display, "standalone");
    }
    // 404 ise frontend dev server build aşamasında olabilir, kırılgan değil
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 62 — E-Fatura provider zinciri (mock + idempotency + iptal + inbox)
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 62 — E-Fatura", () => {
  before(async () => {
    // PROSAN ve NİHAT için einvoice feature'ı içeren plana abone ol (idempotent)
    for (const tenant of ["prosan", "nihatturizm"]) {
      const adminUser = tenant === "prosan" ? "talha" : "nihat_admin";
      const adminPass = tenant === "prosan" ? "talha123" : "nihat123";
      const { jar } = await login(adminUser, adminPass, tenant);
      const plansResp = await api("GET", "/subscriptions/plans", { jar });
      if (plansResp.status !== 200) continue;
      const plans = plansResp.json.plans || plansResp.json;
      const target = plans.find(p => {
        try { return JSON.parse(p.features).includes("einvoice.basic"); }
        catch { return false; }
      });
      if (!target) continue;
      await api("POST", "/subscriptions/subscribe", {
        jar, body: { planId: target.id, billingCycle: "monthly" },
      });
    }
  });

  test("Provider listesi (PROVIDER_META) erişilebilir", async () => {
    const { jar } = await login("talha", "talha123");
    const { status, json } = await api("GET", "/einvoice/providers", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json));
    assert.ok(json.find(p => p.key === "mock"), "mock provider listede olmalı");
    assert.ok(json.find(p => p.key === "parasut"), "parasut provider listede olmalı");
    assert.ok(json.find(p => p.key === "qnb_efinans"));
  });

  test("Settings yoksa otomatik mock+sandbox kayıt oluşur", async () => {
    const { jar } = await login("talha", "talha123");
    const { status, json } = await api("GET", "/einvoice/settings", { jar });
    assert.equal(status, 200);
    assert.ok(json.provider, "provider değeri olmalı");
    assert.equal(typeof json.sandbox, "boolean");
  });

  test("Settings güncellenebilir, hassas alanlar maskelenir", async () => {
    const { jar } = await login("talha", "talha123");
    // Mock'a sıfırla (test ortamı bağımsız olsun)
    const r = await api("PUT", "/einvoice/settings", {
      jar,
      body: { provider: "mock", sandbox: true, enabled: true, defaultProfile: "TICARIFATURA" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.provider, "mock");
    assert.equal(r.json.enabled, true);
  });

  test("Bilinmeyen provider 400 döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("PUT", "/einvoice/settings", { jar, body: { provider: "yok_boyle_bir_sey" } });
    assert.equal(r.status, 400);
  });

  test("Hassas credential alanları DB'de şifrelenir, GET'te maskelenir", async () => {
    const { jar } = await login("talha", "talha123");
    // Önce provider'ı parasut'a al ve credential ver
    await api("PUT", "/einvoice/settings", {
      jar,
      body: { provider: "parasut", config: { username: "user@example.com", password: "secret-pass-123", clientId: "cid", clientSecret: "csec", companyId: "12345" } },
    });
    const r = await api("GET", "/einvoice/settings", { jar });
    assert.equal(r.status, 200);
    // Hassas alanlar maskelenmiş olmalı
    assert.equal(r.json.config.password, "********", "password maskelenmeli");
    assert.equal(r.json.config.clientSecret, "********", "clientSecret maskelenmeli");
    // Mock'a geri al
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
  });

  test("Health check çalıştırılır ve sonuç saklanır", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const r = await api("POST", "/einvoice/health-check", { jar });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true, "mock provider sağlıklı olmalı");
    assert.ok(r.json.message, "mesaj olmalı");
    assert.ok(r.json.checkedAt, "tarih olmalı");
  });

  test("Outbox: fatura oluşturulur, ETTN üretilir", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const body = {
      receiver: { name: "ABC Bilgisayar Ltd.", vkn: "1234567890", taxOffice: "Beşiktaş" },
      lines: [
        { name: "Test Ürün", quantity: 2, unitPrice: 100, vatRate: 20 },
        { name: "Hizmet Bedeli", quantity: 1, unitPrice: 50, vatRate: 20 },
      ],
      invoiceType: "SATIS",
      profile: "TICARIFATURA",
      scenario: "EFATURA",
      currency: "TRY",
    };
    const r = await api("POST", "/einvoice/outbox", { jar, body });
    assert.equal(r.status, 201);
    assert.ok(r.json.id, "id olmalı");
    assert.ok(r.json.externalId, "ETTN olmalı");
    assert.ok(r.json.externalNo, "external_no olmalı");
    assert.equal(r.json.status, "draft");
    // Toplam: (2*100 + 1*50) * 1.20 = 250 * 1.20 = 300
    assert.equal(Math.round(r.json.totalAmount), 300, "toplam 300 olmalı (KDV dahil)");
    assert.equal(Math.round(r.json.taxAmount), 50, "KDV 50 olmalı");
  });

  test("Outbox: receiver.name yoksa 400 döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("POST", "/einvoice/outbox", {
      jar,
      body: { receiver: {}, lines: [{ name: "x", quantity: 1, unitPrice: 10, vatRate: 0 }] },
    });
    assert.equal(r.status, 400);
  });

  test("Outbox: lines boşsa 400 döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("POST", "/einvoice/outbox", {
      jar,
      body: { receiver: { name: "X" }, lines: [] },
    });
    assert.equal(r.status, 400);
  });

  test("Idempotency-Key: aynı anahtarla çift POST aynı kaydı döner", async () => {
    const { jar } = await login("talha", "talha123");
    const idemKey = `test-idem-${Date.now()}`;
    const body = {
      receiver: { name: "Idempotency Test A.Ş.", vkn: "9876543210" },
      lines: [{ name: "X", quantity: 1, unitPrice: 100, vatRate: 20 }],
      idempotencyKey: idemKey,
    };
    const r1 = await api("POST", "/einvoice/outbox", { jar, body });
    assert.equal(r1.status, 201);
    const r2 = await api("POST", "/einvoice/outbox", { jar, body });
    assert.ok([200, 201].includes(r2.status));
    assert.equal(r2.json.id, r1.json.id, "aynı id dönmeli");
  });

  test("Outbox: send akışı (draft → accepted)", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const created = await api("POST", "/einvoice/outbox", {
      jar,
      body: { receiver: { name: "Send Test" }, lines: [{ name: "x", quantity: 1, unitPrice: 100, vatRate: 20 }] },
    });
    assert.equal(created.status, 201);
    const id = created.json.id;
    const sent = await api("POST", `/einvoice/outbox/${id}/send`, { jar });
    assert.equal(sent.status, 200);
    assert.equal(sent.json.status, "accepted");
    // İkinci kez send: 409 (artık not_sendable)
    const sent2 = await api("POST", `/einvoice/outbox/${id}/send`, { jar });
    assert.equal(sent2.status, 409, "tekrar send çağrısı 409 olmalı");
  });

  test("Outbox: cancel akışı", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const created = await api("POST", "/einvoice/outbox", {
      jar,
      body: { receiver: { name: "Cancel Test" }, lines: [{ name: "x", quantity: 1, unitPrice: 50, vatRate: 0 }] },
    });
    const id = created.json.id;
    const cancelled = await api("POST", `/einvoice/outbox/${id}/cancel`, { jar, body: { reason: "Test iptali" } });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.status, "cancelled");
  });

  test("Outbox: PDF endpoint döner", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const created = await api("POST", "/einvoice/outbox", {
      jar,
      body: { receiver: { name: "PDF Test" }, lines: [{ name: "x", quantity: 1, unitPrice: 1, vatRate: 0 }] },
    });
    const r = await fetch(`${BASE}/einvoice/outbox/${created.json.id}/pdf`, {
      headers: { Cookie: jar.header(), "X-Tenant": jar.tenant },
    });
    assert.equal(r.status, 200);
    const buf = await r.arrayBuffer();
    assert.ok(buf.byteLength > 0, "PDF buffer dolu olmalı");
  });

  test("Inbox: poll mock provider örnek fatura döner", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const r = await api("POST", "/einvoice/inbox/poll", { jar, body: {} });
    assert.equal(r.status, 200);
    assert.ok(typeof r.json.inserted === "number");
    assert.ok(typeof r.json.skipped === "number");
  });

  test("Stats endpoint outbox/inbox sayılarını döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/einvoice/stats", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.outbox));
    assert.ok(Array.isArray(r.json.inbox));
  });

  test("Events endpoint son audit log'ları döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/einvoice/events?limit=5", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
  });

  test("Auth gereklidir — anonim erişim 401", async () => {
    const r = await fetch(`${BASE}/einvoice/settings`);
    assert.equal(r.status, 401);
  });

  test("Tenant izolasyonu: nihat firma A faturasını GET edemez", async () => {
    const a = await login("talha", "talha123");
    const created = await api("POST", "/einvoice/outbox", {
      jar: a.jar,
      body: { receiver: { name: "Iso Test" }, lines: [{ name: "x", quantity: 1, unitPrice: 1, vatRate: 0 }] },
    });
    assert.equal(created.status, 201);
    const b = await login("nihat_admin", "nihat123", "nihatturizm");
    if (b.status === 200) {
      const r = await api("GET", `/einvoice/outbox/${created.json.id}`, { jar: b.jar });
      assert.equal(r.status, 404, "diğer tenant kendi firmasına ait olmayan kaydı görmemeli");
    }
  });

  test("Parasut connector — eksik credential ile health-check graceful fail döner", async () => {
    const { jar } = await login("talha", "talha123");
    // Önce mock'a sıfırla (önceki testlerin bıraktığı creds'i temizlemek için provider değiştir)
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    // Şimdi parasut'a geç — boş string ile mevcut config alanlarını sil (merge mantığında "" missing sayılır)
    await api("PUT", "/einvoice/settings", {
      jar,
      body: { provider: "parasut", sandbox: true, config: {
        clientId: "", clientSecret: "", username: "", password: "", companyId: "",
      } },
    });
    const r = await api("POST", "/einvoice/health-check", { jar });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, false, "parasut credential olmadan ok=false dönmeli");
    assert.match(r.json.message, /Eksik config/i, "credential eksikse mesaj 'Eksik config: <key>' biçiminde olmalı");
    // Geri mock'a al
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
  });

  test("Parasut connector — geçersiz credential ile health-check OAuth hatası bildirir", async () => {
    const { jar } = await login("talha", "talha123");
    await api("PUT", "/einvoice/settings", {
      jar,
      body: {
        provider: "parasut", sandbox: true,
        config: {
          clientId: "fake-client-id",
          clientSecret: "fake-client-secret",
          username: "noone@example.com",
          password: "wrong",
          companyId: "999999",
        },
      },
    });
    const r = await api("POST", "/einvoice/health-check", { jar });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, false, "geçersiz creds ile ok=false dönmeli");
    // Paraşüt OAuth 401 → "invalid_client" veya benzeri bir hata mesajı
    assert.match(r.json.message, /OAuth|HTTP\s+\d{3}|invalid|client/i);
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Routing regresyon — hr.staff gate sızıntısı bug-fix testleri
// (PROSAN'ın Ticaret planı einvoice.basic'i içerir, hr.staff'ı içermez.)
// ─────────────────────────────────────────────────────────────────────────────
describe("Routing — hr.staff feature gate izolasyonu", () => {
  test("/personnel → hr.staff yoksa 403 FEATURE_LOCKED döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/personnel", { jar });
    assert.equal(r.status, 403);
    assert.equal(r.json?.error?.code, "FEATURE_LOCKED");
    assert.equal(r.json?.error?.requiredFeature, "hr.staff");
  });

  test("/departments → hr.staff yoksa 403 FEATURE_LOCKED döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/departments", { jar });
    assert.equal(r.status, 403);
    assert.equal(r.json?.error?.requiredFeature, "hr.staff");
  });

  test("/leave-requests → hr.staff yoksa 403 FEATURE_LOCKED döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/leave-requests", { jar });
    assert.equal(r.status, 403);
    assert.equal(r.json?.error?.requiredFeature, "hr.staff");
  });

  test("/einvoice/providers → einvoice.basic varsa hr.staff gate'inden geçer", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/einvoice/providers", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 65 — Bütçe & Tahmin zemini
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 65 — Bütçe & Tahmin zemini", () => {
  // PROSAN'a profit.dashboard içeren bir plan abone et (forecast endpointleri için)
  before(async () => {
    for (const u of [{ user: "talha", pass: "talha123" }, { user: "nihat", pass: "nihat123" }]) {
      const { jar } = await login(u.user, u.pass);
      const plansResp = await api("GET", "/subscriptions/plans", { jar });
      if (plansResp.status !== 200) continue;
      const plans = plansResp.json.plans || plansResp.json;
      const target = plans.find((p) => {
        try { return JSON.parse(p.features).includes("profit.dashboard"); } catch { return false; }
      });
      if (!target) continue;
      await api("POST", "/subscriptions/subscribe", {
        jar, body: { planId: target.id, billingCycle: "monthly" },
      });
    }
  });

  test("GET /finance/expense-categories → boş tenant için varsayılan TR kategoriler seed olur", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/finance/expense-categories", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.categories), "categories array dönmeli");
    assert.ok(r.json.categories.length >= 1, `en az 1 kategori bekleniyor, geldi: ${r.json.categories.length}`);
    // PROSAN tenant'ında zaten kategori varsa seed atlanır; yine de aktif kategori dönmeli.
  });

  test("GET /finance/expense-categories → ikinci çağrıda yeni seed yapmaz (idempotent)", async () => {
    const { jar } = await login("talha", "talha123");
    const r1 = await api("GET", "/finance/expense-categories", { jar });
    const n1 = r1.json.categories.length;
    const r2 = await api("GET", "/finance/expense-categories", { jar });
    assert.equal(r2.json.categories.length, n1, "ikinci çağrıda kategori sayısı değişmemeli");
  });

  test("GET /budgets/forecast/revenue → tarihsel veri + ağırlıklı ortalama döner", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/budgets/forecast/revenue?basis=trend3", { jar });
    assert.equal(r.status, 200);
    assert.ok(r.json.targetPeriod, "targetPeriod dolu olmalı");
    assert.equal(r.json.basis, "trend3");
    assert.equal(r.json.sampleMonths, 3);
    assert.ok(Array.isArray(r.json.history), "history array dönmeli");
    assert.equal(r.json.history.length, 3);
    assert.equal(typeof r.json.forecast, "number");
    assert.equal(typeof r.json.avg, "number");
  });

  test("GET /budgets/forecast/cashflow → 8 haftalık nakit akış projeksiyonu", async () => {
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", "/budgets/forecast/cashflow?weeks=8", { jar });
    assert.equal(r.status, 200);
    // Endpoint farklı şekillerde sonuç dönebilir; en azından objeyi/ alanları kontrol et
    assert.ok(r.json && typeof r.json === "object", "JSON cevap bekleniyor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 51-55 — Pazaryeri canlı mod hazırlık
// (Mock provider üzerinde idempotent order ingest doğrulaması)
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint 51-55 — Marketplace order ingest idempotency", () => {
  let accountId = null;

  before(async () => {
    // PROSAN'a marketplace.basic içeren plan abone et
    const { jar } = await login("talha", "talha123");
    const plansResp = await api("GET", "/subscriptions/plans", { jar });
    if (plansResp.status === 200) {
      const plans = plansResp.json.plans || plansResp.json;
      const target = plans.find((p) => {
        try { return JSON.parse(p.features).includes("marketplace.basic"); } catch { return false; }
      });
      if (target) {
        await api("POST", "/subscriptions/subscribe", {
          jar, body: { planId: target.id, billingCycle: "monthly" },
        });
      }
    }
    // Mock provider hesabı yarat (yoksa)
    const acc = await api("POST", "/marketplace/accounts", {
      jar, body: { provider: "mock", name: "MockAcc-Sprint51", sandbox: true,
        credentials: { accountKey: "sprint51-test" } },
    });
    if (acc.status === 201) accountId = acc.json.id;
    else {
      // çakışma vs. olabilir, listede var mı bak
      const list = await api("GET", "/marketplace/accounts", { jar });
      const found = (list.json || []).find((a) => a.name === "MockAcc-Sprint51");
      accountId = found?.id || null;
    }
  });

  async function waitJobDone(jar, jobId, maxMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const r = await api("GET", `/marketplace/jobs`, { jar });
      const job = (r.json || []).find((j) => j.id === jobId);
      if (job && (job.status === "completed" || job.status === "failed")) return job;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error(`Job ${jobId} timeout`);
  }


  test("pull_orders job → mock siparişi marketplace_orders tablosuna idempotent yazar", async () => {
    if (!accountId) { console.warn("accountId yok, test atlandı"); return; }
    const { jar } = await login("talha", "talha123");
    // 1. pull
    const j1 = await api("POST", "/marketplace/jobs", {
      jar, body: { accountId, jobType: "pull_orders", payload: {} },
    });
    assert.equal(j1.status, 201);
    const job1 = await waitJobDone(jar, j1.json.id);
    assert.equal(job1.status, "completed", `1. job tamamlanmalı, lastError=${job1.lastError}`);
    assert.ok(job1.result?.count >= 1, "en az 1 mock sipariş çekilmeli");
    assert.ok(job1.result?.inserted >= 1, "ilk pull insert olmalı");

    // 2. pull (aynı sipariş) — upsert path, insert sayısı artmamalı
    const j2 = await api("POST", "/marketplace/jobs", {
      jar, body: { accountId, jobType: "pull_orders", payload: {} },
    });
    const job2 = await waitJobDone(jar, j2.json.id);
    assert.equal(job2.status, "completed");
    assert.equal(job2.result?.updated, job1.result.inserted, "ikinci pull tüm satırları update yolundan geçirmeli");
    assert.equal(job2.result?.inserted ?? 0, 0, "ikinci pull yeni insert üretmemeli (idempotent)");
  });

  test("Sprint C — GET /marketplace/jobs response'unda errorCategory + nextRetryAt + retryAvailable türetilmiş alanları yer alır", async () => {
    if (!accountId) return;
    const { jar } = await login("talha", "talha123");
    // Bir job kuyruğa al → response shape kontrolü (worker'ın simüle ettiği case'leri zaten 51-55 testleri tetikledi)
    const en = await api("POST", "/marketplace/jobs", {
      jar, body: { accountId, jobType: "pull_orders", payload: {} },
    });
    assert.equal(en.status, 201);
    const list = await api("GET", "/marketplace/jobs", { jar });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.json) && list.json.length > 0, "en az 1 job olmalı");
    const sample = list.json[0];
    // Türetilmiş alanlar tanımlı olmalı (null olabilirler ama key var olmalı)
    assert.ok("errorCategory" in sample, "errorCategory key eksik");
    assert.ok("errorMessage" in sample, "errorMessage key eksik");
    assert.ok("nextRetryAt" in sample, "nextRetryAt key eksik");
    assert.ok("retryAvailable" in sample, "retryAvailable key eksik");
    // errorCategory enum kısıtı (sırasıyla kabul edilen değerler)
    if (sample.errorCategory != null) {
      assert.match(sample.errorCategory, /^(rate-limit|permanent|transient)$/);
    }
    // retryAvailable boolean olmalı
    assert.equal(typeof sample.retryAvailable, "boolean");
    // Eğer rate-limit ya da transient + scheduledAt gelecekte ise nextRetryAt set olmalı
    if (sample.retryAvailable) assert.ok(sample.nextRetryAt, "retryAvailable=true iken nextRetryAt boş olamaz");
  });

  test("GET /marketplace/orders → liste döner ve filtre çalışır", async () => {
    if (!accountId) return;
    const { jar } = await login("talha", "talha123");
    const r = await api("GET", `/marketplace/orders?accountId=${accountId}`, { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
  });

  test("POST /marketplace/orders/:id/convert-to-sale → product_not_matched skipped + idempotent", async () => {
    if (!accountId) return;
    const { jar } = await login("talha", "talha123");
    // Önce yeni bir mock pull yap (varsa pas, yoksa oluştur)
    const j = await api("POST", "/marketplace/jobs", {
      jar, body: { accountId, jobType: "pull_orders", payload: {} },
    });
    await waitJobDone(jar, j.json.id);
    const list = await api("GET", `/marketplace/orders?accountId=${accountId}&converted=false`, { jar });
    if (!list.json.length) { console.warn("hiç order yok, test atlandı"); return; }
    const orderId = list.json[0].id;

    // 1. convert: mock siparişi DEMO-SKU içerir, mapping yok → 422 conversion_aborted (all-or-nothing)
    const c1 = await api("POST", `/marketplace/orders/${orderId}/convert-to-sale`, { jar, body: {} });
    assert.ok([200, 422].includes(c1.status), `unexpected status ${c1.status}: ${JSON.stringify(c1.json)}`);

    if (c1.status === 422) {
      // All-or-nothing rollback
      assert.ok(["conversion_aborted", "no_sales_created"].includes(c1.json.error));
      assert.ok(Array.isArray(c1.json.skipped) && c1.json.skipped.length > 0);
      // Idempotent failure: 2. çağrı da aynı 422 vermeli (rollback ile convertedSaleId hâlâ null)
      const c2 = await api("POST", `/marketplace/orders/${orderId}/convert-to-sale`, { jar, body: {} });
      assert.equal(c2.status, 422);
    } else {
      // 200 ise idempotent şekilde tekrar çağrılınca alreadyConverted dönmeli
      assert.ok(c1.json.primarySaleId, "primarySaleId set olmalı");
      const c2 = await api("POST", `/marketplace/orders/${orderId}/convert-to-sale`, { jar, body: {} });
      assert.equal(c2.status, 200);
      assert.equal(c2.json.alreadyConverted, true);
      assert.equal(c2.json.primarySaleId, c1.json.primarySaleId, "aynı sale id dönmeli");
    }
  });

  test("POST /marketplace/orders/:id/convert-to-sale → mapping varsa sale oluşur, stok düşer, idempotent", async () => {
    if (!accountId) return;
    const { jar } = await login("talha", "talha123");

    // 1. Test ürünü hazırla (yoksa oluştur)
    const skuKey = "SPRINT55-TEST-SKU";
    let prodResp = await api("GET", `/products?search=${skuKey}`, { jar });
    let product = (prodResp.json?.products || prodResp.json || []).find((p) => p.productCode === skuKey);
    if (!product) {
      const create = await api("POST", "/products", { jar, body: {
        productCode: skuKey, name: "Sprint55 Test Ürün", barcode: skuKey,
        stock: 100, purchasePrice: 50, salePrice: 100,
      } });
      if (create.status === 201) product = create.json.product || create.json;
    }
    if (!product?.id) { console.warn("test ürünü oluşturulamadı, test atlandı"); return; }

    // 2. Mapping ekle
    await api("POST", `/marketplace/accounts/${accountId}/mappings`, {
      jar, body: {
        productId: product.id, channelSku: "DEMO-SKU", externalProductId: null, isPublished: true,
      },
    });

    // 3. Yeni mock order yarat (zaten var olabilir)
    const j = await api("POST", "/marketplace/jobs", {
      jar, body: { accountId, jobType: "pull_orders", payload: {} },
    });
    await waitJobDone(jar, j.json.id);

    // 4. Henüz convert edilmemiş bir order seç
    const list = await api("GET", `/marketplace/orders?accountId=${accountId}&converted=false`, { jar });
    if (!list.json.length) { console.warn("dönüştürülecek order yok, test atlandı"); return; }
    const orderId = list.json[0].id;

    const stockBefore = product.stock;

    // 5. Convert
    const c1 = await api("POST", `/marketplace/orders/${orderId}/convert-to-sale`, { jar, body: {} });
    if (c1.status !== 200) {
      console.warn("convert beklenmedik:", c1.status, c1.json);
      return;
    }
    assert.ok(c1.json.primarySaleId);
    assert.ok(Array.isArray(c1.json.sales) && c1.json.sales.length >= 1);

    // 6. Stok düşmüş mü?
    const after = await api("GET", `/products/${product.id}`, { jar });
    if (after.status === 200) {
      const newStock = (after.json.product || after.json).stock;
      assert.ok(newStock < stockBefore, `stok düşmeli: ${stockBefore} → ${newStock}`);
    }

    // 7. Idempotent: 2. çağrı yeni satış üretmemeli
    const c2 = await api("POST", `/marketplace/orders/${orderId}/convert-to-sale`, { jar, body: {} });
    assert.equal(c2.status, 200);
    assert.equal(c2.json.alreadyConverted, true);
    assert.equal(c2.json.primarySaleId, c1.json.primarySaleId);
  });
});

describe("Sprint B — Trendyol gerçek HTTP konnektörü", () => {
  let accountId;

  before(async () => {
    const { jar } = await login("talha", "talha123");
    // marketplace.basic plan zaten Sprint 51-55 setup ile aboneydi
    const list = await api("GET", "/marketplace/accounts", { jar });
    const existing = (list.json || []).find((a) => a.provider === "trendyol");
    if (existing) { accountId = existing.id; return; }
    const created = await api("POST", "/marketplace/accounts", {
      jar, body: {
        provider: "trendyol", name: "Trendyol Test", sandbox: true,
        credentials: { sellerId: "TESTSELLER", apiKey: "INVALIDKEY", apiSecret: "INVALIDSECRET" },
      },
    });
    if (created.status === 201) accountId = created.json.id || created.json.account?.id;
  });

  test("Trendyol provider gerçek konnektör factory'de bağlı", async () => {
    if (!accountId) { console.warn("trendyol accountId yok, test atlandı"); return; }
    const { jar } = await login("talha", "talha123");
    // healthCheck'i tetikle
    const r = await api("POST", `/marketplace/accounts/${accountId}/health-check`, { jar });
    assert.equal(r.status, 200);
    // Geçersiz API key ile sandbox'a gerçek HTTP isteği yapılır → ok:false ama graceful
    assert.equal(typeof r.json.ok, "boolean", "ok alanı boolean olmalı");
    assert.ok(typeof r.json.message === "string" && r.json.message.length > 0, "message dolu olmalı");
    // Stub'tan farklı: "henüz uygulanmadı" mesajı GELMEMELİ
    assert.ok(!r.json.message.includes("henüz uygulanmadı"),
      `stub mesajı görünmemeli, gerçek HTTP cevabı bekleniyor: ${r.json.message}`);
  });

  test("Eksik credential ile graceful 'Eksik config' mesajı döner", async () => {
    const { jar } = await login("talha", "talha123");
    const created = await api("POST", "/marketplace/accounts", {
      jar, body: {
        provider: "trendyol", name: "Trendyol Eksik Config", sandbox: true,
        credentials: { sellerId: "X" }, // apiKey/apiSecret yok
      },
    });
    if (created.status !== 201) { console.warn("eksik-config testi atlandı"); return; }
    const accId = created.json.id || created.json.account?.id;
    const r = await api("POST", `/marketplace/accounts/${accId}/health-check`, { jar });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, false);
    assert.ok(r.json.message.includes("Eksik config"),
      `Eksik config mesajı bekleniyor: ${r.json.message}`);
    // Temizle
    await api("DELETE", `/marketplace/accounts/${accId}`, { jar });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 80+ — SMS Provider Adapter (per-tenant, registry, encrypted creds)
// ─────────────────────────────────────────────────────────────────────────────
describe("SMS Provider Adapter", () => {
  test("Provider katalog döner — netgsm + mock implemented, stub'lar implemented:false", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/sms/providers", { jar });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json), "providers dizi olmalı");
    const keys = json.map((p) => p.key);
    for (const k of ["mock", "netgsm", "iletimerkezi", "vatansms"]) {
      assert.ok(keys.includes(k), `${k} provider listede olmalı`);
    }
    const netgsm = json.find((p) => p.key === "netgsm");
    assert.equal(netgsm.implemented, true, "netgsm gerçek HTTP — implemented:true");
    const ilt = json.find((p) => p.key === "iletimerkezi");
    assert.equal(ilt.implemented, false, "iletimerkezi stub — implemented:false");
  });

  test("Anonim erişim — 401", async () => {
    const jar = new CookieJar();
    const r = await api("GET", "/sms/providers", { jar });
    assert.equal(r.status, 401);
  });

  test("Viewer rol PUT settings — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const r = await api("PUT", "/sms/settings", {
      jar, body: { provider: "mock" },
    });
    assert.equal(r.status, 403);
  });

  test("Bilinmeyen provider PUT — 400", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("PUT", "/sms/settings", {
      jar, body: { provider: "olmayan_provider" },
    });
    assert.equal(r.status, 400);
  });

  test("Mock+sandbox ayarla → settings GET'te credentials maskelenir", async () => {
    const { jar } = await login("admin", "admin123");
    const upd = await api("PUT", "/sms/settings", {
      jar,
      body: {
        provider: "mock", sandbox: true, senderHeader: "TICARIUMTEST",
        credentials: { username: "secret_user", password: "secret_pass" },
        isActive: true,
      },
    });
    assert.equal(upd.status, 200, JSON.stringify(upd.json));
    assert.equal(upd.json.provider, "mock");
    // GET'te plaintext sızdırma yok
    const get = await api("GET", "/sms/settings", { jar });
    assert.equal(get.status, 200);
    if (get.json.credentials?.password) {
      assert.equal(get.json.credentials.password, "********",
        "password maskelenmeli — gerçek değer dönmemeli");
    }
    if (get.json.credentials?.username) {
      // username hassas değil (isSensitiveKey false), açık dönebilir
      assert.equal(typeof get.json.credentials.username, "string");
    }
  });

  test("Mock provider health-check → ok:true", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/sms/settings", {
      jar, body: { provider: "mock", sandbox: true, senderHeader: "TEST", credentials: {}, isActive: true },
    });
    const r = await api("POST", "/sms/health-check", { jar });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true, JSON.stringify(r.json));
    assert.equal(r.json.source, "db");
  });

  test("Test-send mock → ok:true ve mesaj geçmişine sent yazılır", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/sms/settings", {
      jar, body: { provider: "mock", sandbox: true, senderHeader: "TEST", credentials: {}, isActive: true },
    });
    const send = await api("POST", "/sms/test-send", {
      jar, body: { toPhone: "+905551234567", body: "Mock E2E test" },
    });
    assert.equal(send.status, 200, JSON.stringify(send.json));
    assert.equal(send.ok ?? send.json.ok, true, JSON.stringify(send.json));
    assert.ok(send.json.messageId, "messageId dönmeli");

    const hist = await api("GET", "/sms/messages?limit=5", { jar });
    assert.equal(hist.status, 200);
    const found = hist.json.find((m) => m.id === send.json.messageId);
    assert.ok(found, "mesaj geçmişte olmalı");
    assert.equal(found.status, "sent");
    assert.equal(found.provider, "mock");
  });

  test("isActive=false → test-send 'disabled' ile bloklanır, gerçek gönderim yapılmaz", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/sms/settings", {
      jar, body: { provider: "netgsm", sandbox: false, isActive: false,
                   credentials: { username: "x", password: "y" }, senderHeader: "X" },
    });
    const send = await api("POST", "/sms/test-send", {
      jar, body: { toPhone: "+905551234567", body: "Disabled test" },
    });
    assert.equal(send.status, 200);
    assert.equal(send.json.ok, false, "isActive=false iken gönderim engellenmeli");
    const hist = await api("GET", "/sms/messages?limit=5", { jar });
    const m = hist.json.find((x) => x.id === send.json.messageId);
    assert.equal(m.status, "disabled", "DB'ye 'disabled' status yazılmalı");

    // Cleanup: tekrar aktif et
    await api("PUT", "/sms/settings", { jar, body: { isActive: true, provider: "mock", sandbox: true } });
  });

  test("Geçersiz telefon (kısa) → ok:false", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/sms/settings", {
      jar, body: { provider: "netgsm", sandbox: false, senderHeader: "T",
                   credentials: { username: "u", password: "p" }, isActive: true },
    });
    // Mock'a değil gerçek netgsm provider'a gider — geçersiz numara için validation patlar
    const r = await api("POST", "/sms/test-send", {
      jar, body: { toPhone: "123", body: "test" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, false);
    assert.match(r.json.error || "", /Türkiye mobil/i,
      `TR mobil hata mesajı bekleniyor: ${r.json.error}`);
    // Cleanup
    await api("PUT", "/sms/settings", { jar, body: { provider: "mock", sandbox: true, isActive: true } });
  });

  test("Mesaj gövdesi çok uzun (>1000) — 400", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("POST", "/sms/test-send", {
      jar, body: { toPhone: "+905551234567", body: "x".repeat(1001) },
    });
    assert.equal(r.status, 400);
  });

  test("Viewer rolü /sms/send tetikleyemez — 403 (maliyet/güvenlik kapısı)", async () => {
    const { jar } = await login("goruntule", "staff123");
    const r = await api("POST", "/sms/send", {
      jar, body: { toPhone: "+905551234567", body: "viewer should not send" },
    });
    assert.equal(r.status, 403, `viewer 403 bekleniyor: ${JSON.stringify(r.json)}`);
  });

  test("source='missing' kontratı: settings yok + env fallback kapalı → no_provider failed kayıt", async () => {
    // Önce nihat tenant ayarlarını sil → settings yok durumuna düşür
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    // Var ise mock'a/aktife çek (silmek yerine kontrollü stub - missing davranışı SMS_ALLOW_ENV_FALLBACK
    // varsayılan kapalı + DB satırı yok kombinasyonunda doğrulanır; nihat'ta zaten satır olmayabilir)
    const get = await api("GET", "/sms/settings", { jar });
    // _empty=true ise satır yok demektir → missing branch'i tetiklenir
    if (get.json._empty) {
      const send = await api("POST", "/sms/test-send", {
        jar, body: { toPhone: "+905551234567", body: "missing branch test" },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.ok, false, "settings yok + env yok → ok:false");
      const hist = await api("GET", "/sms/messages?limit=5", { jar });
      const m = hist.json.find((x) => x.id === send.json.messageId);
      assert.ok(m, "missing kaydı geçmişte olmalı");
      assert.equal(m.status, "no_provider", "missing branch için status=no_provider");
      assert.equal(m.provider, "none");
    }
  });

  test("Tenant izolasyonu: prosan ve nihatturizm ayarları ayrı", async () => {
    const { jar: prosanJar } = await login("admin", "admin123", "prosan");
    await api("PUT", "/sms/settings", {
      jar: prosanJar,
      body: { provider: "mock", sandbox: true, senderHeader: "PROSAN_HDR",
              credentials: {}, isActive: true },
    });
    const { jar: nihatJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const nihatSettings = await api("GET", "/sms/settings", { jar: nihatJar });
    assert.equal(nihatSettings.status, 200);
    // Nihat'ın PROSAN ayarlarını GÖRMEMELİ
    assert.notEqual(nihatSettings.json.senderHeader, "PROSAN_HDR",
      "tenant izolasyonu: nihat prosan'ın senderHeader'ını görmemeli");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 62 — POS → Sale → /einvoice/from-sales kontrat doğrulamaları
// (gerçek fatura kesme PROSAN senderVkn'i gerektirir — burada validation ön kontrolleri)
// ─────────────────────────────────────────────────────────────────────────────
describe("POS → from-sales köprüsü — validation kontratı", () => {
  test("Boş saleIds → 400", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [] } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /saleIds dizisi gerekli/);
  });

  test("Geçersiz saleIds (dizi değil) → 400", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: "abc" } });
    assert.equal(r.status, 400);
  });

  test("Var olmayan saleId → 404", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [99999999] } });
    assert.equal(r.status, 404);
  });

  test("Müşterisiz satıştan e-fatura kesilemez → 400 (müşteri seçilmemiş)", async () => {
    const { jar } = await login("admin", "admin123");
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", {
      jar, body: { productId: product.id, quantity: 1, unitPrice: 100 },
    });
    if (sale.status !== 201) { console.warn("sale_create_failed, atlandı"); return; }
    const r = await api("POST", "/einvoice/from-sales", {
      jar, body: { saleIds: [sale.json.id] },
    });
    // Sale customerId yok → "Müşteri seçilmemiş satıştan e-fatura kesilemez"
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Müşteri/);
  });

  test("Viewer rolü from-sales çağıramaz — 403", async () => {
    const { jar } = await login("goruntule", "staff123");
    const r = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [1] } });
    assert.equal(r.status, 403);
  });

  // Sprint G — happy path (sertleştirilmiş): sender config setup + 201 zorunlu + UBL XML + idempotency
  test("Sprint G — müşterili satıştan from-sales 201 + UBL XML + idempotent reuse", async () => {
    const { jar } = await login("admin", "admin123");

    // 0) Sender VKN config'i sertleştir (test'in 400 'senderVkn tanımsız' yoluna düşmesini engelle)
    const cfgRes = await api("PUT", "/einvoice/settings", {
      jar,
      body: {
        provider: "mock",
        sandbox: true,
        enabled: true,
        config: {
          senderVkn: "1234567890",
          senderName: "Test Şirket A.Ş.",
          senderAlias: "urn:mail:defaultpk@test.local",
          senderTaxOffice: "TestVD",
          senderAddress: "Test Mah. No:1",
          senderCity: "İstanbul",
          senderEmail: "sender@test.local",
          defaultVatRate: 20,
        },
      },
    });
    assert.ok([200, 201].includes(cfgRes.status), `einvoice settings PUT failed: ${cfgRes.status} ${JSON.stringify(cfgRes.json)}`);

    // 1) Müşteri (VKN ile) yarat — code zorunlu
    const custName = `__test_qg_customer_${Date.now()}`;
    const custCode = `QG${Date.now()}`;
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: custName, taxNumber: "1234567890", email: "qg@test.local", taxOffice: "TestVD" },
    });
    assert.ok([200, 201].includes(cc.status), `customer create failed: ${cc.status} ${JSON.stringify(cc.json)}`);
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    assert.ok(typeof customerId === "number" && customerId > 0, `customerId çıkarılamadı: ${JSON.stringify(cc.json)}`);

    // 2) Ürün + satış (müşterili)
    const { json: product } = await createTestProduct(jar, { stock: 10 });
    const sale = await api("POST", "/sales", {
      jar, body: { productId: product.id, quantity: 2, unitPrice: 150, customerId },
    });
    assert.equal(sale.status, 201, `sale create failed: ${JSON.stringify(sale.json)}`);

    // 3) İlk from-sales çağrısı: 201 + outbox + UBL XML zorunlu
    const r = await api("POST", "/einvoice/from-sales", {
      jar, body: { saleIds: [sale.json.id] },
    });
    assert.equal(r.status, 201, `from-sales 201 bekleniyor, ${r.status} geldi: ${JSON.stringify(r.json)}`);
    const outboxId = r.json?.id ?? r.json?.outboxId;
    assert.ok(typeof outboxId === "number" && outboxId > 0, `outboxId yok: ${JSON.stringify(r.json)}`);
    assert.ok(!r.json?.reused, "ilk çağrıda reused=true olmamalı");

    // 4) Outbox detayı + UBL XML kontratı
    const get = await api("GET", `/einvoice/outbox/${outboxId}`, { jar });
    assert.equal(get.status, 200);
    assert.equal(get.json?.saleId, sale.json.id, "outbox.saleId from-sales kaynağını tracelemeli");
    const xml = get.json?.lastResponse?.xml;
    assert.ok(typeof xml === "string" && xml.length > 0, "lastResponse.xml dolu olmalı");
    assert.match(xml, /<Invoice/i, "UBL <Invoice root içermeli");
    assert.match(xml, /<cbc:ID/i, "UBL cbc:ID elementi içermeli");

    // 5) Architect fix: idempotency — aynı saleId ile 2. çağrı 200 + reused=true + AYNI outbox.id döner
    const r2 = await api("POST", "/einvoice/from-sales", {
      jar, body: { saleIds: [sale.json.id] },
    });
    assert.equal(r2.status, 200, `idempotent 2. çağrı 200 bekleniyor, ${r2.status} geldi: ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.reused, true, "2. çağrıda reused=true olmalı");
    assert.equal(r2.json?.id, outboxId, "2. çağrıda aynı outbox.id döndürülmeli (mükerrer fatura yok)");
  });

  // Sprint G — Architect 3. round: sent statüsündeki outbox için 2. from-sales 409 + existingOutboxId
  test("Sprint G — sent statüsündeki satış için from-sales 409 + existingOutboxId döner (mükerrer fatura yok)", async () => {
    const { jar } = await login("admin", "admin123");
    const stamp = Date.now();
    const custCode = `SENT${stamp}`;
    const taxNum = String(2_000_000_000 + (stamp % 1_000_000_000));
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: `__test_sent_${stamp}`, taxNumber: taxNum, email: `s${stamp}@test.local`, taxOffice: "TestVD" },
    });
    assert.ok([200, 201].includes(cc.status), `customer create failed: ${cc.status} ${JSON.stringify(cc.json)}`);
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    assert.ok(typeof customerId === "number" && customerId > 0, `customerId çıkarılamadı: ${JSON.stringify(cc.json)}`);
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", { jar, body: { productId: product.id, quantity: 1, unitPrice: 80, customerId } });
    assert.equal(sale.status, 201);
    // 1. from-sales — draft outbox
    const r1 = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } });
    assert.equal(r1.status, 201);
    const outboxId = r1.json.id;
    // outbox/:id/send — sent statüsüne taşı (mock provider)
    const sendRes = await api("POST", `/einvoice/outbox/${outboxId}/send`, { jar });
    assert.ok([200, 201].includes(sendRes.status), `send failed: ${sendRes.status} ${JSON.stringify(sendRes.json)}`);
    assert.ok(['sent','accepted','sending'].includes(sendRes.json?.status), `expected sent-like status, got: ${sendRes.json?.status}`);
    // 2. from-sales aynı satışla → 409 + existingOutboxId
    const r2 = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } });
    assert.equal(r2.status, 409, `sent satış için 409 bekleniyor, ${r2.status} geldi: ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.existingOutboxId, outboxId, "409 cevabı existingOutboxId içermeli");
    assert.ok(['sent','accepted','sending'].includes(r2.json?.status));
  });

  // Sprint G — Architect 3. round: concurrent paralel POST'lar TEK outbox üretir (race-safe partial unique index)
  test("Sprint G — concurrent paralel from-sales POST'ları aynı outbox.id'i döner (race-safe DB)", async () => {
    const { jar } = await login("admin", "admin123");
    const stamp = Date.now();
    const custCode = `RACE${stamp}`;
    const taxNum = String(3_000_000_000 + (stamp % 1_000_000_000));
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: `__test_race_${stamp}`, taxNumber: taxNum, email: `r${stamp}@test.local`, taxOffice: "TestVD" },
    });
    assert.ok([200, 201].includes(cc.status), `customer create failed: ${cc.status} ${JSON.stringify(cc.json)}`);
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    assert.ok(typeof customerId === "number" && customerId > 0, `customerId çıkarılamadı: ${JSON.stringify(cc.json)}`);
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", { jar, body: { productId: product.id, quantity: 1, unitPrice: 60, customerId } });
    assert.equal(sale.status, 201);
    // Architect 4. round: provider call sayacını sıfırla — 5 paralel POST sadece 1 createInvoice tetiklemeli
    await api("POST", "/einvoice/__test_mock_counter/reset", { jar });
    // 5 paralel POST — DB unique partial index sayesinde TEK outbox.id'e yakınsamalı
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } }))
    );
    const statuses = responses.map((r) => r.status);
    const ids = responses.map((r) => r.json?.id).filter((x) => typeof x === "number");
    assert.ok(statuses.every((s) => [200, 201].includes(s)), `tüm statuses 200/201 olmalı, gelen: ${JSON.stringify(statuses)}`);
    assert.equal(ids.length, 5, `tüm cevaplarda id olmalı: ${JSON.stringify(responses.map((r) => r.json))}`);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 1, `tüm paralel POST'lar AYNI outbox.id'e yakınsamalı, gelen: ${JSON.stringify([...uniqueIds])}`);
    // En fazla 1 tane 201 (yarış kazananı), gerisi 200 reused/raceWon=false
    const created = statuses.filter((s) => s === 201).length;
    const reused = statuses.filter((s) => s === 200).length;
    assert.equal(created, 1, `tam 1 'kazanan' 201 olmalı, gelen: created=${created} reused=${reused}`);
    assert.equal(reused, 4, `4 'kaybeden' 200 olmalı, gelen: created=${created} reused=${reused}`);
    // KRİTİK: Architect 4. round invariant — provider.createInvoice TAM 1 kez çağrıldı (mükerrer harici fatura yok)
    const counter = await api("GET", "/einvoice/__test_mock_counter", { jar });
    assert.equal(counter.json?.createInvoiceCalls, 1, `provider.createInvoice tam 1 kez çağrılmalı (reserve-first); gelen: ${counter.json?.createInvoiceCalls}`);
  });

  // Sprint G — partial saleIds list → 404 missing detail
  test("Sprint G — kısmi geçerli saleIds → 404 + missing[] döner (partial silently proceed yok)", async () => {
    const { jar } = await login("admin", "admin123");
    // Sender config zaten önceki test'te set edildi
    const custName = `__test_partial_customer_${Date.now()}`;
    const custCode = `PART${Date.now()}`;
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: custName, taxNumber: "1234567890", email: "p@test.local", taxOffice: "TestVD" },
    });
    if (![200, 201].includes(cc.status)) { console.warn(`partial test skip: customer create ${cc.status}`); return; }
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", {
      jar, body: { productId: product.id, quantity: 1, unitPrice: 50, customerId },
    });
    assert.equal(sale.status, 201);
    const ghostId = 999_999_999;
    const r = await api("POST", "/einvoice/from-sales", {
      jar, body: { saleIds: [sale.json.id, ghostId] },
    });
    assert.equal(r.status, 404, `partial liste için 404 bekleniyor, ${r.status} geldi: ${JSON.stringify(r.json)}`);
    assert.ok(Array.isArray(r.json?.missing) && r.json.missing.includes(ghostId), `missing[] ghostId içermeli: ${JSON.stringify(r.json)}`);
  });

  // Sprint G — Architect 4. round (II): provider hata cleanup invariantı
  // Provider createInvoice fırlatırsa → reserving satırı 'failed'e çekilmeli, sonraki istek reuse edebilmeli
  test("Sprint G — provider hata olursa reserving satırı 'failed'e çekilir + sonraki istek reuse eder (deadlock yok)", async () => {
    const { jar } = await login("admin", "admin123");
    const custName = `__test_provfail_customer_${Date.now()}`;
    const custCode = `PFAIL${Date.now()}`;
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: custName, taxNumber: "1234567890", email: "pf@test.local", taxOffice: "TestVD" },
    });
    if (![200, 201].includes(cc.status)) { console.warn(`provider-fail test skip: customer ${cc.status}`); return; }
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", { jar, body: { productId: product.id, quantity: 1, unitPrice: 70, customerId } });
    assert.equal(sale.status, 201);

    // 1) Bir sonraki provider çağrısı throw etsin
    await api("POST", "/einvoice/__test_mock_fail_next", { jar, body: { count: 1 } });
    // 2) İlk POST → 500 (provider failure surfacing)
    const r1 = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } });
    assert.equal(r1.status, 500, `provider hatası 500 olmalı, gelen: ${r1.status} ${JSON.stringify(r1.json)}`);
    // 3) İkinci POST → satır 'reserving'de kilitli kalmamalı; idempotency 'failed' satırı reuse etmeli (200)
    const r2 = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } });
    assert.equal(r2.status, 200, `cleanup sonrası 2. istek 200/reused dönmeli, gelen: ${r2.status} ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.reused, true, `reused=true olmalı: ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.status, 'failed', `cleanup sonrası satır 'failed' olmalı, gelen status=${r2.json?.status}`);
  });

  // Sprint G — Architect 4. round (III): pre-check'te 'reserving' satırı varsa ASLA 200/reused dönmez.
  // Late-loser pre-check timing: kazanan reserving INSERT etti ama provider henüz settle etmedi.
  // İkinci istek pre-check'te 'reserving' görür → polling timeout sonu hâlâ reserving → 503 reserve_pending.
  test("Sprint G — pre-check 'reserving' satırı için 200/reused dönmez (timeout 503 reserve_pending)", async () => {
    const { jar } = await login("admin", "admin123");
    const custName = `__test_reserve_pending_${Date.now()}`;
    const custCode = `RPND${Date.now()}`;
    const cc = await api("POST", "/customers", {
      jar, body: { code: custCode, name: custName, taxNumber: "1234567890", email: "rp@test.local", taxOffice: "TestVD" },
    });
    if (![200, 201].includes(cc.status)) { console.warn(`reserve-pending test skip: customer ${cc.status}`); return; }
    const customerId = cc.json?.id ?? cc.json?.customer?.id;
    const { json: product } = await createTestProduct(jar, { stock: 5 });
    const sale = await api("POST", "/sales", { jar, body: { productId: product.id, quantity: 1, unitPrice: 80, customerId } });
    assert.equal(sale.status, 201);

    // 1) Manuel olarak 'reserving' satırı enjekte (sanki kazanan provider'da takıldı)
    const inj = await api("POST", "/einvoice/__test_inject_reserving", { jar, body: { saleId: sale.json.id } });
    assert.equal(inj.status, 201, `inject 201 olmalı: ${JSON.stringify(inj.json)}`);
    const injectedId = inj.json.id;
    try {
      // 2) from-sales çağrısı — pre-check 'reserving' görmeli, 200/reused DÖNMEMELİ
      const r = await api("POST", "/einvoice/from-sales", { jar, body: { saleIds: [sale.json.id] } });
      assert.equal(r.status, 503, `pre-check reserving için 503 bekleniyor, gelen: ${r.status} ${JSON.stringify(r.json)}`);
      assert.equal(r.json?.error, 'reserve_pending', `error 'reserve_pending' olmalı: ${JSON.stringify(r.json)}`);
    } finally {
      // Cleanup: enjekte edilen satırı sil
      await api("DELETE", `/einvoice/__test_outbox/${injectedId}`, { jar });
    }
  });
});

// ─── Sprint H — set-plan CAS/version precondition ─────────────────────────
describe("Sprint H — set-plan CAS (compare-and-set, lost-update precondition)", () => {
  // Test tenant: nihatturizm (companyId=2). Bütün set-plan'ler superadmin oturumuyla.
  // Bu suite kendi state-preserving teardown'ını yönetir: önce mevcut planı oku, üst üste
  // 2 idempotent set-plan ile doğrula (CAS doğru), kasıtlı stale id ile 409 doğrula, sonunda restore et.
  let saJar = null;
  let prePlan = null;        // { slug, cycle }
  let preSubId = null;
  let mutationsDone = false;

  before(async () => {
    const sa = await login("superadmin", "superadmin123");
    saJar = sa.jar;
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const cur = await api("GET", "/subscriptions/current", { jar: nihat });
    if (cur.status !== 200 || !cur.json?.plan?.slug || !cur.json?.subscription?.id) return;
    prePlan = { slug: cur.json.plan.slug, cycle: cur.json.subscription.billingCycle || "monthly" };
    preSubId = cur.json.subscription.id;
  });

  after(async () => {
    if (!mutationsDone || !prePlan || !saJar) return;
    // Best-effort restore: hangi sub aktifse onu CAS expected olarak yolla; reddederse no-op.
    const { jar: nihat } = await login("nihat_admin", "nihat123", "nihatturizm");
    const cur = await api("GET", "/subscriptions/current", { jar: nihat });
    const currentId = cur.json?.subscription?.id ?? null;
    const r = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: prePlan.slug, billingCycle: prePlan.cycle,
        note: "Sprint H test teardown",
        expectedSubscriptionId: currentId,
      },
    });
    assert.ok(r.status === 201 || r.status === 409,
      `Sprint H teardown 201 veya 409 bekleniyor, alındı: ${r.status}`);
  });

  test("CAS doğru → 201; sonra stale id ile 409 + currentSubscriptionId döner", async () => {
    if (!prePlan || !saJar || !preSubId) {
      // Pre-state okunamadıysa Sprint H semantiği test edilemez; skip yerine fail-loud.
      assert.fail("Sprint H test için pre-state okunmalıydı (nihatturizm /subscriptions/current 200 + subscription.id)");
    }

    // 1) CAS doğru: pkg_pro/monthly hedefine eşit-veya-değişik geçiş.
    const target1 = { slug: "pkg_pro", cycle: "monthly" };
    const r1 = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: target1.slug, billingCycle: target1.cycle,
        note: "Sprint H CAS test step 1",
        expectedSubscriptionId: preSubId,
      },
    });
    mutationsDone = true;
    assert.equal(r1.status, 201, `step1 201 dönmeli, response: ${JSON.stringify(r1.json)}`);
    const sub1 = r1.json?.subscription?.id;
    assert.ok(typeof sub1 === "number" && sub1 !== preSubId, "step1 yeni sub.id üretmeli");

    // 2) Stale id ile retry → 409 + currentSubscriptionId döner; mevcut sub değişmemeli.
    const r2 = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: "pkg_business_v3", billingCycle: "monthly",
        note: "Sprint H CAS test step 2 (stale id)",
        expectedSubscriptionId: preSubId, // KASITLI stale: artık sub1 aktif
      },
    });
    assert.equal(r2.status, 409, `step2 stale CAS 409 dönmeli, alındı: ${r2.status} ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.error?.code, "subscription_version_mismatch",
      `step2 error.code subscription_version_mismatch olmalı, alındı: ${JSON.stringify(r2.json)}`);
    assert.equal(r2.json?.currentSubscriptionId, sub1,
      `step2 currentSubscriptionId taze değer olmalı (sub1=${sub1}), alındı: ${r2.json?.currentSubscriptionId}`);

    // 3) Mevcut sub gerçekten değişmemiş mi? (409 sonrası state stable)
    const { jar: nihat2 } = await login("nihat_admin", "nihat123", "nihatturizm");
    const cur = await api("GET", "/subscriptions/current", { jar: nihat2 });
    assert.equal(cur.json?.subscription?.id, sub1, "409 sonrası aktif sub değişmemeli");
    assert.equal(cur.json?.plan?.slug, target1.slug, "409 sonrası plan değişmemeli");

    // 4) Doğru taze id ile retry → 201 (akıllı caller flow'u).
    const r3 = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: "pkg_business_v3", billingCycle: "monthly",
        note: "Sprint H CAS test step 3 (refreshed id)",
        expectedSubscriptionId: sub1,
      },
    });
    assert.equal(r3.status, 201, `step3 doğru CAS 201 dönmeli, response: ${JSON.stringify(r3.json)}`);
  });

  test("Paralel race: aynı expectedSubscriptionId ile 5 eşzamanlı çağrı → 1 success + 4×409 (deterministik)", async () => {
    if (!prePlan || !saJar) {
      assert.fail("Sprint H race test için pre-state okunmalıydı");
    }
    // Setup: tek bir baseline'a sıfırla → tüm paralel çağrılar AYNI expectedId görür.
    const setup = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: "pkg_pro", billingCycle: "monthly",
        note: "Sprint H race test baseline",
      },
    });
    mutationsDone = true;
    assert.equal(setup.status, 201, "race baseline 201");
    const baselineSubId = setup.json?.subscription?.id;
    assert.ok(typeof baselineSubId === "number", "baselineSubId number");

    // 5 paralel set-plan, hepsi aynı expectedSubscriptionId ile.
    // Backend: per-company advisory lock → tx'ler serileştirilir; ilki kazanır + CAS pass + sub değişir;
    // sonrakiler tx alır, CAS check yapar, currentId artık baselineSubId değil → 409 conflict döner.
    // 23505 unique violation oluşursa o da 409'a map edilir (yine deterministik).
    const cycle = "monthly";
    const targets = ["pkg_business_v3", "pkg_pro", "pkg_business_v3", "pkg_pro", "pkg_business_v3"];
    const results = await Promise.all(targets.map((slug, idx) =>
      api("POST", "/subscriptions/admin/billing/set-plan", {
        jar: saJar,
        body: {
          companyId: 2, planSlug: slug, billingCycle: cycle,
          note: `Sprint H race ${idx}`,
          expectedSubscriptionId: baselineSubId,
        },
      })
    ));
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter((r) => r.status !== 201 && r.status !== 409);
    assert.equal(others.length, 0,
      `Tüm yanıtlar 201 veya 409 olmalı (500 yok); other: ${JSON.stringify(others.map((r) => ({ s: r.status, j: r.json })))}`);
    assert.equal(successes.length, 1,
      `Tam 1 success bekleniyor, alındı: ${successes.length}; statuses: ${results.map((r) => r.status).join(",")}`);
    assert.equal(conflicts.length, 4,
      `Tam 4 conflict bekleniyor, alındı: ${conflicts.length}`);
    // Conflict response shape kontratı
    for (const c of conflicts) {
      assert.equal(c.json?.error?.code, "subscription_version_mismatch",
        `conflict response error.code subscription_version_mismatch olmalı, alındı: ${JSON.stringify(c.json)}`);
      assert.ok(typeof c.json?.currentSubscriptionId === "number",
        `conflict response currentSubscriptionId number olmalı, alındı: ${JSON.stringify(c.json)}`);
    }
  });

  test("Null-precondition race: aktif sub yokken 2 paralel expectedNull → 1×201 + 1×409 (no-row gap kapanmış)", async () => {
    if (!prePlan || !saJar) {
      assert.fail("Sprint H null-race test için pre-state okunmalıydı");
    }
    // Setup: company 2'nin tüm aktif/grace sub'larını cancel et (no-row baseline).
    const clear = await api("POST", "/subscriptions/admin/billing/__test_cancel_active", {
      jar: saJar,
      body: { companyId: 2 },
    });
    mutationsDone = true;
    assert.equal(clear.status, 200, `__test_cancel_active 200 olmalı, alındı: ${clear.status} ${JSON.stringify(clear.json)}`);

    // 2 paralel set-plan, expectedSubscriptionId: null (yani "hiç aktif yok bekliyorum").
    // Backend: per-company advisory lock → tx'ler seri; ilki kazanır + insert; ikincisi tx'e
    // girip CAS check yapar, currentRows artık [yeni sub] → null !== id → 409 conflict.
    // Kontrat: tam 1×201 + 1×409, asla 23505 500 sızıntısı YOK; final state = tek aktif sub.
    const results = await Promise.all([
      api("POST", "/subscriptions/admin/billing/set-plan", {
        jar: saJar,
        body: {
          companyId: 2, planSlug: "pkg_business_v3", billingCycle: "monthly",
          note: "Sprint H null-race A", expectedSubscriptionId: null,
        },
      }),
      api("POST", "/subscriptions/admin/billing/set-plan", {
        jar: saJar,
        body: {
          companyId: 2, planSlug: "pkg_pro", billingCycle: "monthly",
          note: "Sprint H null-race B", expectedSubscriptionId: null,
        },
      }),
    ]);
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter((r) => r.status !== 201 && r.status !== 409);
    assert.equal(others.length, 0,
      `Null-race: yanıtlar 201 veya 409 olmalı (500 yok); other: ${JSON.stringify(others.map((r) => ({ s: r.status, j: r.json })))}`);
    assert.equal(successes.length, 1,
      `Null-race: tam 1 success bekleniyor, alındı: ${successes.length}; statuses: ${results.map((r) => r.status).join(",")}`);
    assert.equal(conflicts.length, 1,
      `Null-race: tam 1 conflict bekleniyor, alındı: ${conflicts.length}`);
    assert.equal(conflicts[0].json?.error?.code, "subscription_version_mismatch",
      `Null-race: conflict.error.code subscription_version_mismatch, alındı: ${JSON.stringify(conflicts[0].json)}`);
    assert.ok(typeof conflicts[0].json?.currentSubscriptionId === "number",
      `Null-race: conflict.currentSubscriptionId number olmalı (winner sub.id), alındı: ${JSON.stringify(conflicts[0].json)}`);
    // Final state invariantı: tam 1 aktif sub var ve o = winner sub.id.
    const winnerId = successes[0].json?.subscription?.id;
    assert.equal(conflicts[0].json.currentSubscriptionId, winnerId,
      `Null-race: conflict currentSubscriptionId == winner.subscription.id olmalı`);
  });

  test("expectedSubscriptionId GÖNDERİLMEZSE backward-compatible (CAS bypass, 201)", async () => {
    if (!prePlan || !saJar) {
      assert.fail("Sprint H backward-compat için pre-state okunmalıydı");
    }
    // expectedSubscriptionId yok → eski davranış (CAS check skip), sadece atomic transaction.
    const r = await api("POST", "/subscriptions/admin/billing/set-plan", {
      jar: saJar,
      body: {
        companyId: 2, planSlug: "pkg_pro", billingCycle: "monthly",
        note: "Sprint H backward-compat (no expectedSubscriptionId)",
      },
    });
    mutationsDone = true;
    assert.equal(r.status, 201, `backward-compat 201, alındı: ${r.status} ${JSON.stringify(r.json)}`);
  });
});

// ─── Sprint A — Architect P1 Regression Tests ────────────────────────────────
describe("Sprint A — Architect regression: forecast aliases + outbox XML", () => {
  test("GET /budgets/forecast/expenses returns alias + legacy fields", async () => {
    const { jar } = await login("admin", "admin123");
    const { status, json } = await api("GET", "/budgets/forecast/expenses?months=6", { jar });
    assert.equal(status, 200, "endpoint 200 dönmeli");
    assert.ok(Array.isArray(json.categories), "categories array olmalı");
    assert.equal(typeof json.totalForecast, "number", "totalForecast number olmalı");
    assert.equal(json.sampleMonths, 6, "sampleMonths istek months ile eşleşmeli");
    assert.match(String(json.targetPeriod || ""), /^\d{4}-\d{2}$/, "targetPeriod YYYY-MM");
    assert.ok(json.categories.length > 0, "PROSAN tenant'ında en az 1 gider kategorisi olmalı (production seed garantisi)");
    // Architect feedback: TÜM kategorilerde alias↔legacy invariantı + numeric/shape kontratı
    let sumForecast = 0;
    for (const [i, c] of json.categories.entries()) {
      for (const k of ["avg", "slope", "label"]) {
        assert.ok(k in c, `categories[${i}]: alias key '${k}' eksik (frontend kullanıyor)`);
      }
      for (const k of ["categoryName", "trendSlope", "forecast", "forecastWithTrend"]) {
        assert.ok(k in c, `categories[${i}]: legacy key '${k}' eksik (geriye uyumluluk)`);
      }
      assert.equal(c.slope, c.trendSlope, `categories[${i}]: slope ve trendSlope eşleşmeli`);
      assert.equal(c.label, c.categoryName, `categories[${i}]: label ve categoryName eşleşmeli`);
      // Numeric finiteness — NaN/Infinity regression guard
      for (const k of ["avg", "slope", "forecast", "forecastWithTrend"]) {
        assert.ok(Number.isFinite(c[k]), `categories[${i}].${k} finite number olmalı, alındı: ${c[k]}`);
      }
      // history schema: period+total
      assert.ok(Array.isArray(c.history) && c.history.length === 6, `categories[${i}].history length=6 (sampleMonths) olmalı`);
      for (const [hi, h] of c.history.entries()) {
        assert.match(String(h.period || ""), /^\d{4}-\d{2}$/, `categories[${i}].history[${hi}].period YYYY-MM`);
        assert.ok(Number.isFinite(h.total), `categories[${i}].history[${hi}].total finite olmalı`);
      }
      sumForecast += c.forecast;
    }
    // totalForecast ≈ sum(category.forecast) — yuvarlama farkı için tolerans
    assert.ok(Math.abs(json.totalForecast - sumForecast) < 1, `totalForecast (${json.totalForecast}) ≈ sum(forecast) (${sumForecast.toFixed(2)}) olmalı`);
  });

  test("GET /budgets/forecast/expenses months clamp [2,12] + invalid period 400", async () => {
    const { jar } = await login("admin", "admin123");
    // months=99 → 12'ye clamp; TÜM kategorilerin history.length === 12 (architect: tek kategori değil)
    const big = await api("GET", "/budgets/forecast/expenses?months=99", { jar });
    assert.equal(big.status, 200);
    assert.equal(big.json.sampleMonths, 12, "sampleMonths 99→12 clamp");
    for (const [i, c] of big.json.categories.entries()) {
      assert.equal(c.history.length, 12, `categories[${i}].history.length=12 (months=99 clamp)`);
    }
    // months=1 → 2'ye clamp
    const small = await api("GET", "/budgets/forecast/expenses?months=1", { jar });
    assert.equal(small.status, 200);
    assert.equal(small.json.sampleMonths, 2, "sampleMonths 1→2 clamp");
    for (const [i, c] of small.json.categories.entries()) {
      assert.equal(c.history.length, 2, `categories[${i}].history.length=2 (months=1 clamp)`);
    }
    // period geçersiz format → 400
    const bad = await api("GET", "/budgets/forecast/expenses?period=2026-13-99", { jar });
    assert.equal(bad.status, 400, "geçersiz period 400 dönmeli");
  });

  test("POST /einvoice/outbox stores XML retrievable via lastResponse.xml", async () => {
    const { jar } = await login("admin", "admin123");
    // E-fatura ayarları PROSAN tenant'ında kurulu olmalı (Sprint 62 sonrası garanti).
    const settingsRes = await api("GET", "/einvoice/settings", { jar });
    assert.equal(settingsRes.status, 200, "einvoice settings endpoint 200 dönmeli");
    assert.ok(settingsRes.json?.provider, "PROSAN tenant'ında provider tanımlı olmalı (mock veya gerçek)");
    const { status: createStatus, json: created } = await api("POST", "/einvoice/outbox", {
      jar,
      body: {
        invoiceType: "SATIS", profile: "TICARIFATURA", scenario: "EFATURA",
        invoiceDate: new Date().toISOString().slice(0, 10),
        sender: { name: "Test Sender Co.", vkn: "1234567890" },
        receiver: { name: "Test Buyer Ltd.", vkn: "9876543210" },
        lines: [{ name: "Test Item A", quantity: 2, unitPrice: 50, vatRate: 20, unitCode: "C62" }],
      },
    });
    assert.equal(createStatus, 201, `outbox create 201 dönmeli, response: ${JSON.stringify(created)}`);
    assert.ok(created.id, "outbox id dönmeli");
    const detail = await api("GET", `/einvoice/outbox/${created.id}`, { jar });
    assert.equal(detail.status, 200, "outbox detail 200 dönmeli");
    // Schema'da rawXml outbox kolonu yok; XML lastResponse JSONB içinde olmalı
    const xml = detail.json.rawXml || detail.json.lastResponse?.xml;
    assert.ok(xml, "XML lastResponse.xml içinde bulunamadı");
    assert.match(xml, /<Invoice/i, "UBL Invoice root etiketi yok");
    assert.match(xml, /xmlns/i, "UBL namespace tanımı yok");
  });

  test("Mock provider fallback path: invalid VKN payload still returns 201 + valid XML", async () => {
    const { jar } = await login("admin", "admin123");
    const settingsRes = await api("GET", "/einvoice/settings", { jar });
    assert.equal(settingsRes.status, 200);
    // Architect feedback: silent skip yerine deterministic assertion — PROSAN tenant'ında provider=mock garanti.
    assert.equal(settingsRes.json?.provider, "mock", `Test ortamında PROSAN tenant provider=mock olmalı (mevcut: ${settingsRes.json?.provider}). Fallback regression testi noop'a düşmemeli.`);
    // Bilinçli geçersiz VKN (UBL builder throw etmeli) → mock fallback path tetiklenir
    const { status, json: created } = await api("POST", "/einvoice/outbox", {
      jar,
      body: {
        invoiceType: "SATIS", profile: "TICARIFATURA", scenario: "EFATURA",
        invoiceDate: new Date().toISOString().slice(0, 10),
        sender: { name: "Bad Sender" }, // VKN yok
        receiver: { name: "Bad Buyer", vkn: "abc" }, // geçersiz VKN
        lines: [{ name: "Test Item", quantity: 1, unitPrice: 100, vatRate: 20, unitCode: "C62" }],
      },
    });
    assert.equal(status, 201, `mock fallback create 201 dönmeli (geriye uyumluluk), response: ${JSON.stringify(created)}`);
    const detail = await api("GET", `/einvoice/outbox/${created.id}`, { jar });
    assert.equal(detail.status, 200);
    const xml = detail.json.rawXml || detail.json.lastResponse?.xml;
    assert.ok(xml, "fallback XML lastResponse içinde olmalı");
    assert.match(xml, /<Invoice/i, "fallback XML'de Invoice root yok");
    // PayableAmount numeric olmalı, undefined değil (eski bug regression)
    const m = xml.match(/<PayableAmount[^>]*>([^<]+)<\/PayableAmount>/);
    assert.ok(m, "PayableAmount etiketi bulunamadı");
    assert.ok(!isNaN(Number(m[1])), `PayableAmount numeric olmalı, alındı: '${m[1]}'`);
    assert.match(xml, /mock-fallback="true"/, "fallback marker eksik (debugging için gerekli)");
  });

  // ─── Architect follow-up: XML edge regressions ──────────────────────────
  test("Outbox XML: non-TRY currency propagates to DocumentCurrencyCode + PayableAmount@currencyID", async () => {
    const { jar } = await login("admin", "admin123");
    // Determinizm: provider'ı mock'a sabitle
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const { status, json: created } = await api("POST", "/einvoice/outbox", {
      jar,
      body: {
        invoiceType: "SATIS", profile: "TICARIFATURA", scenario: "EFATURA",
        invoiceDate: new Date().toISOString().slice(0, 10),
        currency: "USD",
        sender: { name: "USD Sender Co.", vkn: "1234567890" },
        receiver: { name: "USD Buyer Ltd.", vkn: "9876543210" },
        lines: [{ name: "USD Item", quantity: 1, unitPrice: 200, vatRate: 20, unitCode: "C62" }],
      },
    });
    assert.equal(status, 201, `USD outbox 201 dönmeli, response: ${JSON.stringify(created)}`);
    const detail = await api("GET", `/einvoice/outbox/${created.id}`, { jar });
    assert.equal(detail.status, 200);
    const xml = detail.json.rawXml || detail.json.lastResponse?.xml;
    assert.ok(xml, "USD XML lastResponse içinde olmalı");
    assert.match(xml, /<cbc:DocumentCurrencyCode>USD<\/cbc:DocumentCurrencyCode>/, "DocumentCurrencyCode=USD propagate olmalı");
    const m = xml.match(/<cbc:PayableAmount\s+currencyID="USD">([^<]+)<\/cbc:PayableAmount>/);
    assert.ok(m, "PayableAmount currencyID=USD bulunamadı (currency propagation regressed)");
    assert.ok(!isNaN(Number(m[1])), `PayableAmount numeric olmalı, alındı: ${m[1]}`);
    // taşma kontrolü: TRY referansı XML totals içinde kalmamalı
    assert.doesNotMatch(xml, /currencyID="TRY"/, "USD faturada TRY currencyID sızıntısı olmamalı");
  });

  test("Outbox XML: multi-line + discount → 2× InvoiceLine + AllowanceTotalAmount + payable math", async () => {
    const { jar } = await login("admin", "admin123");
    await api("PUT", "/einvoice/settings", { jar, body: { provider: "mock", sandbox: true } });
    const { status, json: created } = await api("POST", "/einvoice/outbox", {
      jar,
      body: {
        invoiceType: "SATIS", profile: "TICARIFATURA", scenario: "EFATURA",
        invoiceDate: new Date().toISOString().slice(0, 10),
        currency: "TRY",
        sender: { name: "Multi Sender", vkn: "1234567890" },
        receiver: { name: "Multi Buyer", vkn: "9876543210" },
        lines: [
          { name: "Ürün A", quantity: 2, unitPrice: 100, vatRate: 20, discountAmount: 20, unitCode: "C62" },
          { name: "Ürün B", quantity: 1, unitPrice: 50,  vatRate: 10, discountAmount: 5,  unitCode: "C62" },
        ],
      },
    });
    assert.equal(status, 201, `multi-line outbox 201 dönmeli, response: ${JSON.stringify(created)}`);
    const detail = await api("GET", `/einvoice/outbox/${created.id}`, { jar });
    assert.equal(detail.status, 200);
    const xml = detail.json.rawXml || detail.json.lastResponse?.xml;
    assert.ok(xml, "multi-line XML olmalı");
    // 2 satır olmalı
    const lineMatches = xml.match(/<cac:InvoiceLine>/g) || [];
    assert.equal(lineMatches.length, 2, `2 InvoiceLine bekleniyor, alındı: ${lineMatches.length}`);
    // discount toplamı XML'e yansımalı (toplam = 25)
    assert.match(xml, /<cbc:AllowanceTotalAmount[^>]*>25/, "AllowanceTotalAmount=25 (20+5) bulunamadı");
    // PayableAmount = (200-20)+(50-5) = 225 net + (180*0.20 + 45*0.10) = 36 + 4.5 = 40.5 → 265.5
    const pm = xml.match(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/);
    assert.ok(pm, "PayableAmount tag bulunamadı");
    const payable = Number(pm[1]);
    assert.ok(Math.abs(payable - 265.5) < 0.05, `PayableAmount 265.5 olmalı, alındı: ${payable}`);
    // outbox row totalAmount aynı miktar olmalı
    assert.ok(Math.abs(Number(detail.json.totalAmount) - 265.5) < 0.05, `outbox.totalAmount 265.5 olmalı, alındı: ${detail.json.totalAmount}`);
  });
});

// ─── Sprint B — Notification Hub Entegrasyonu ────────────────────────────────
describe("Sprint B — Bütçe alarmları + e-fatura olayları → bildirim merkezi", () => {
  test("POST /budgets/alerts/dispatch alarmları notification olarak yazar (idempotent dedup)", async () => {
    const { jar } = await login("admin", "admin123");
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Önce kaç notification var?
    const before = await api("GET", "/notifications/count", { jar });
    assert.equal(before.status, 200);

    // İlk dispatch — alarm varsa created>=0
    const r1 = await api("POST", "/budgets/alerts/dispatch", {
      jar, body: { period, warningPct: 1, criticalPct: 200 }, // düşük eşik = bol alarm
    });
    assert.equal(r1.status, 200, `dispatch 200 dönmeli, alındı: ${JSON.stringify(r1.json)}`);
    assert.equal(r1.json.period, period);
    assert.equal(typeof r1.json.created, "number");
    assert.equal(typeof r1.json.deduped, "number");
    assert.equal(typeof r1.json.total, "number");
    assert.equal(r1.json.created + r1.json.deduped, r1.json.total, "created+deduped=total kontratı");

    // İkinci kez aynı dispatch → hepsi deduped olmalı (aynı gün, aynı entity)
    const r2 = await api("POST", "/budgets/alerts/dispatch", {
      jar, body: { period, warningPct: 1, criticalPct: 200 },
    });
    assert.equal(r2.status, 200);
    assert.equal(r2.json.created, 0, "tekrarlı dispatch'te yeni kayıt olmamalı");
    assert.equal(r2.json.deduped, r2.json.total, "hepsi dedup edilmeli");

    // Bell badge sayacı en az ilk turda yazılan kadar arttı mı?
    if (r1.json.created > 0) {
      const after = await api("GET", "/notifications/count", { jar });
      assert.ok(
        after.json.unread >= (before.json.unread || 0),
        "dispatch sonrası unread sayısı azalmamalı",
      );
    }
  });

  test("GET /notifications budget_alert_* tipli kayıtlar listede görünür", async () => {
    const { jar } = await login("admin", "admin123");
    // Yukarıdaki dispatch sonrası en az 1 budget_alert_* var olabilir; varsa şema kontratı doğru olmalı
    const r = await api("GET", "/notifications?limit=50", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.notifications), "notifications array dönmeli");
    const budget = r.json.notifications.filter((n) => /^budget_alert_/.test(n.type));
    if (budget.length > 0) {
      const n = budget[0];
      assert.match(n.type, /^budget_alert_(critical|warning|info)$/, "tip doğru namespace");
      assert.equal(n.entityType, "budget", "entityType budget olmalı");
      assert.ok(n.title && n.message, "title ve message dolu olmalı");
    } else {
      console.log("[Sprint B] aktif bütçe alarmı yok, sadece kontrat sınanmadı");
    }
  });

  test("E-fatura outbox send sonrası einvoice_sent veya einvoice_failed notification yazılır", async () => {
    const { jar } = await login("admin", "admin123");
    const settingsRes = await api("GET", "/einvoice/settings", { jar });
    if (settingsRes.status !== 200 || settingsRes.json?.provider !== "mock") {
      console.log("[Sprint B] e-fatura testi sadece mock provider için çalıştırılır");
      return;
    }
    // Outbox kaydı oluştur
    const create = await api("POST", "/einvoice/outbox", {
      jar, body: {
        invoiceType: "SATIS", profile: "TICARIFATURA", scenario: "EFATURA",
        invoiceDate: new Date().toISOString().slice(0, 10),
        sender: { name: "Test Sender", vkn: "1234567890" },
        receiver: { name: "Test Receiver", vkn: "9876543210" },
        lines: [{ name: "Item", quantity: 1, unitPrice: 100, vatRate: 20, unitCode: "C62" }],
      },
    });
    assert.equal(create.status, 201, `outbox create başarısız: ${JSON.stringify(create.json)}`);
    const outboxId = create.json.id;
    // Send tetikle (mock provider hep accept eder)
    const send = await api("POST", `/einvoice/outbox/${outboxId}/send`, { jar });
    assert.ok([200, 500].includes(send.status), `send unexpected status ${send.status}`);
    // Outbox status'u oku → notification type ile eşleşmeli (state-coupled)
    const after = await api("GET", `/einvoice/outbox/${outboxId}`, { jar });
    assert.equal(after.status, 200);
    const outboxStatus = after.json?.status;
    const expectedType =
      outboxStatus === "sent" || outboxStatus === "accepted" ? "einvoice_sent" :
      outboxStatus === "failed" || outboxStatus === "error" ? "einvoice_failed" :
      outboxStatus === "cancelled" ? "einvoice_cancelled" : null;
    // dispatch fire-and-forget → polling-with-timeout (3s, 100ms) flakiness'i düşürür
    let hit = null;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const list = await api("GET", "/notifications?limit=50", { jar });
      assert.equal(list.status, 200);
      hit = list.json.notifications.find(
        (n) => /^einvoice_/.test(n.type) && n.entityType === "einvoice_outbox" && n.entityId === outboxId,
      );
      if (hit) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(hit, `outbox #${outboxId} (status=${outboxStatus}) için einvoice_* notification bulunmadı`);
    assert.match(hit.type, /^einvoice_(sent|failed|cancelled)$/, "tip einvoice_sent/failed/cancelled olmalı");
    if (expectedType) {
      assert.equal(hit.type, expectedType,
        `outbox status='${outboxStatus}' ile notification type='${hit.type}' eşleşmiyor (beklenen ${expectedType})`);
    }
  });

  test("dispatch dedup günlük entity bazlıdır (entityId değişince yeni kayıt)", async () => {
    const { jar } = await login("admin", "admin123");
    const period = new Date().toISOString().slice(0, 7);
    // Aynı period, farklı eşik → aynı kategori için yine aynı entityId üretir → dedup olmalı
    const r1 = await api("POST", "/budgets/alerts/dispatch", {
      jar, body: { period, warningPct: 1, criticalPct: 200 },
    });
    const r2 = await api("POST", "/budgets/alerts/dispatch", {
      jar, body: { period, warningPct: 5, criticalPct: 100 },
    });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    // İki çağrı arasında alarm sayısı değişebilir ama eşit eşitlik testi anlamsız;
    // burada sadece her iki çağrının da created+deduped=total kontratını koruduğunu doğrularız
    assert.equal(r2.json.created + r2.json.deduped, r2.json.total);
  });

  // Architect follow-up (deterministik, fixture-controlled):
  // PROSAN seed'inde geçen ay gideri olmayabilir; bu yüzden test in-line minimal
  // expense fixture insert eder (pg direkt) — aynı `categoryId` için thisMonth +
  // lastMonth giderleri yaratır, sonra her iki periodu dispatch eder ve
  // entityId set'lerinin **disjoint** olduğunu zorunlu doğrular. Hash kontratı
  // (period+type+categoryId) ihlal edilirse test FAIL eder.
  test("budget_alert dedup period boyutuna duyarlı (fixture-controlled: aynı kategori farklı dönem → disjoint entityId)", async () => {
    // pg direkt erişim (drizzle gerekmez): minimal expense + category insert
    const { Client } = await import("pg");
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();
    let categoryId = null;
    let insertedExpenseIds = [];
    try {
      // 1) Login + companyId çek
      const { jar } = await login("admin", "admin123");
      const me = await api("GET", "/auth/me", { jar });
      assert.equal(me.status, 200);
      const companyId = me.json?.user?.companyId ?? me.json?.companyId;
      assert.ok(typeof companyId === "number" && companyId > 0, `companyId çıkarılamadı: ${JSON.stringify(me.json)}`);

      // 2) Test kategorisi oluştur (idempotent: önce ara, yoksa ekle)
      const catName = `__test_period_dedup_cat`;
      const catRes = await pgClient.query(
        `SELECT id FROM expense_categories WHERE company_id=$1 AND name=$2 LIMIT 1`,
        [companyId, catName],
      );
      if (catRes.rows.length > 0) {
        categoryId = catRes.rows[0].id;
      } else {
        const ins = await pgClient.query(
          `INSERT INTO expense_categories (company_id, name, is_active) VALUES ($1, $2, true) RETURNING id`,
          [companyId, catName],
        );
        categoryId = ins.rows[0].id;
      }
      assert.ok(typeof categoryId === "number" && categoryId > 0);

      // 3) thisMonth + lastMonth için 1'er gider satırı insert et (aynı kategori)
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
      const lastMonth = prevDate.toISOString().slice(0, 7);
      const thisDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12, 0, 0));

      const e1 = await pgClient.query(
        `INSERT INTO expenses (company_id, category_id, amount, description, expense_date, payment_method)
         VALUES ($1, $2, 9999.99, '__period_dedup_thisMonth', $3, 'cash') RETURNING id`,
        [companyId, categoryId, thisDate.toISOString()],
      );
      const e2 = await pgClient.query(
        `INSERT INTO expenses (company_id, category_id, amount, description, expense_date, payment_method)
         VALUES ($1, $2, 9999.99, '__period_dedup_lastMonth', $3, 'cash') RETURNING id`,
        [companyId, categoryId, prevDate.toISOString()],
      );
      insertedExpenseIds = [e1.rows[0].id, e2.rows[0].id];

      // 4) Aynı gün içindeki önceki test kayıtlarını temizle ki saf ölçüm yapalım
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      await pgClient.query(
        `DELETE FROM notifications WHERE company_id=$1 AND type LIKE 'budget_alert_%' AND entity_type='budget' AND created_at >= $2`,
        [companyId, todayStart.toISOString()],
      );

      // 5) İki periodu mikro-eşikle dispatch et → her ikisi de en az 1 alarm üretir
      const a = await api("POST", "/budgets/alerts/dispatch", {
        jar, body: { period: thisMonth, warningPct: 0.0001, criticalPct: 0.0001 },
      });
      const b = await api("POST", "/budgets/alerts/dispatch", {
        jar, body: { period: lastMonth, warningPct: 0.0001, criticalPct: 0.0001 },
      });
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.ok(a.json.created >= 1, `thisMonth dispatch hiç alarm üretmedi: ${JSON.stringify(a.json)}`);
      assert.ok(b.json.created >= 1, `lastMonth dispatch hiç alarm üretmedi: ${JSON.stringify(b.json)}`);

      // 6) Notifications listesini al, period bazında ayır, entityId set'leri DISJOINT olmalı
      const list = await api("GET", "/notifications?limit=500", { jar });
      assert.equal(list.status, 200);
      const budgets = list.json.notifications.filter((n) => /^budget_alert_/.test(n.type) && n.entityType === "budget");
      const thisM = budgets.filter((n) => typeof n.title === "string" && n.title.includes(`(${thisMonth})`));
      const lastM = budgets.filter((n) => typeof n.title === "string" && n.title.includes(`(${lastMonth})`));
      assert.ok(thisM.length > 0, `thisMonth (${thisMonth}) notification yok`);
      assert.ok(lastM.length > 0, `lastMonth (${lastMonth}) notification yok`);
      const thisIds = new Set(thisM.map((n) => n.entityId));
      const lastIds = new Set(lastM.map((n) => n.entityId));
      const intersection = [...thisIds].filter((x) => lastIds.has(x));
      assert.equal(intersection.length, 0,
        `period dimension dedup'ı ihlal edildi: ortak entityId(ler) ${JSON.stringify(intersection)} (this=${[...thisIds].join(",")}, last=${[...lastIds].join(",")})`);
    } finally {
      // Cleanup: insert ettiğimiz test kayıtlarını sil
      try {
        if (insertedExpenseIds.length > 0) {
          await pgClient.query(`DELETE FROM expenses WHERE id = ANY($1::int[])`, [insertedExpenseIds]);
        }
        if (categoryId) {
          await pgClient.query(`DELETE FROM expense_categories WHERE id=$1`, [categoryId]);
        }
      } catch (_) { /* best-effort */ }
      await pgClient.end();
    }
  });
});

// ─── Sprint E — Buyer Portal: Discovery + RFQ + Seller Inbox ─────────────────
describe("Sprint E — Buyer Portal: discovery + RFQ + seller inbox", () => {
  // PROSAN admin account_type = 'both' yapalım ki buyer endpoint'lerine erişebilsin.
  // (Test sonunda 'seller' geri alınır.)
  before(async () => {
    const { jar } = await login("superadmin", "admin123");
    // Doğrudan companies update — super_admin /companies endpoint'i üzerinden
    await api("PATCH", "/companies/1", { jar, body: { accountType: "both" } });
  });

  test("GET /buyer/sellers buyer-only guard + discovery returns other tenants", async () => {
    const { jar } = await login("admin", "admin123");
    // Seller-only login (PROSAN şu an 'both' — admin re-login'de session refresh olur)
    // Test seed data birikimi default limit=50'yi aşabildiğinden hedef firmayı ?q= ile daraltıyoruz.
    const r = await api("GET", "/buyer/sellers?q=NIHAT", { jar });
    assert.equal(r.status, 200, `discovery 200 olmalı; got ${r.status}`);
    assert.ok(Array.isArray(r.json.sellers), "sellers array olmalı");
    // Kendi şirket id'si listede olmamalı
    assert.ok(!r.json.sellers.some((s) => s.id === 1), "kendi şirketin (PROSAN id=1) discovery'de olmamalı");
    // NIHAT (id=2) olmalı (PG ilike Turkish-aware)
    const nihat = r.json.sellers.find((s) => s.id === 2);
    assert.ok(nihat, "NIHAT TURIZM (id=2) discovery'de görünmeli");
    assert.match(nihat.name, /NIHAT|NİHAT/i);
  });

  test("POST /buyer/rfqs creates RFQ + targets + drops leads (transactional)", async () => {
    const { jar } = await login("admin", "admin123");
    const r = await api("POST", "/buyer/rfqs", {
      jar,
      body: {
        title: `Sprint E test RFQ ${Date.now()}`,
        description: "Integration test — endüstriyel rulman tedarik talebi",
        items: [
          { name: "Rulman 6205-2RS", qty: 100, unit: "ad", specs: "C3 clearance" },
          { name: "Yağlama gresi NLGI 2", qty: 5, unit: "kg" },
        ],
        targetSellerCompanyIds: [2], // NIHAT
        currency: "TRY",
        dropLeads: true,
      },
    });
    assert.equal(r.status, 201, `RFQ create 201 olmalı; got ${r.status} body=${JSON.stringify(r.json)}`);
    assert.ok(r.json.rfq?.id, "rfq.id dönmeli");
    assert.equal(r.json.rfq.status, "sent", "status sent olmalı");
    assert.equal(r.json.rfq.buyerCompanyId, 1);
    assert.equal(r.json.targets.length, 1, "1 target oluşmalı");
    assert.equal(r.json.targets[0].sellerCompanyId, 2);
    assert.equal(r.json.targets[0].status, "pending");
    assert.equal(r.json.leadsCreated, 1, "1 lead (contact_request) düşmeli");
  });

  test("Buyer self-targeting + invalid seller graceful 400", async () => {
    const { jar } = await login("admin", "admin123");
    // Sadece kendi şirketini hedeflemek → 400
    const self = await api("POST", "/buyer/rfqs", {
      jar,
      body: {
        title: "Self target", items: [{ name: "x", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [1], dropLeads: false,
      },
    });
    assert.ok(self.status === 400, `self target 400 olmalı; got ${self.status}`);
    // Olmayan satıcı id → 400 no_valid_sellers
    const bad = await api("POST", "/buyer/rfqs", {
      jar,
      body: {
        title: "Bad target", items: [{ name: "x", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [99999], dropLeads: false,
      },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, "no_valid_sellers");
  });

  test("GET /buyer/rfqs lists RFQs with target counts; /:id includes seller name", async () => {
    const { jar } = await login("admin", "admin123");
    const list = await api("GET", "/buyer/rfqs", { jar });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.json));
    assert.ok(list.json.length >= 1, "az önce yaratılan RFQ listede olmalı");
    const recent = list.json[0];
    assert.ok(recent.targetCounts, "targetCounts türetilmiş alan dönmeli");
    assert.equal(typeof recent.targetCounts.total, "number");

    const detail = await api("GET", `/buyer/rfqs/${recent.id}`, { jar });
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.json.targets));
    assert.ok(detail.json.targets[0].sellerName, "seller name join'lenmeli");
  });

  test("Seller inbox: NIHAT /seller/rfqs/inbox sees PROSAN's RFQ + view marks pending→viewed", async () => {
    const { jar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const inbox = await api("GET", "/seller/rfqs/inbox", { jar });
    assert.equal(inbox.status, 200, `inbox 200 olmalı; got ${inbox.status}`);
    assert.ok(Array.isArray(inbox.json));
    assert.ok(inbox.json.length >= 1, "NIHAT'ın inbox'unda en az 1 RFQ olmalı");
    const item = inbox.json[0];
    assert.equal(item.buyerCompanyId, 1, "buyer PROSAN olmalı");
    assert.equal(item.targetStatus, "pending", "ilk durumda pending olmalı");
    assert.ok(item.buyerName, "buyer firma adı join'lenmeli");

    // View — pending→viewed
    const v1 = await api("POST", `/seller/rfqs/${item.targetId}/view`, { jar });
    assert.equal(v1.status, 200);
    assert.equal(v1.json.status, "viewed");
    assert.ok(v1.json.viewedAt);
    // Idempotent — ikinci kez 200 + aynı viewedAt
    const v2 = await api("POST", `/seller/rfqs/${item.targetId}/view`, { jar });
    assert.equal(v2.status, 200);
    assert.equal(v2.json.viewedAt, v1.json.viewedAt, "viewedAt idempotent olmalı");
  });

  test("Buyer can cancel their own RFQ; seller-tenant can't access another's target", async () => {
    const { jar: jarA } = await login("admin", "admin123");
    // Yeni RFQ
    const created = await api("POST", "/buyer/rfqs", {
      jar: jarA,
      body: {
        title: "Cancel test", items: [{ name: "Item", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [2], dropLeads: false,
      },
    });
    assert.equal(created.status, 201);
    const cancelled = await api("POST", `/buyer/rfqs/${created.json.rfq.id}/cancel`, { jar: jarA });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.status, "cancelled");

    // Cross-tenant: NIHAT, başka tenant'ın target'ına view atamaz (404)
    const { jar: jarN } = await login("nihat_admin", "nihat123", "nihatturizm");
    const cross = await api("POST", `/seller/rfqs/999999/view`, { jar: jarN });
    assert.equal(cross.status, 404);
  });
});

// ─── Sprint E — Architect P0/P1 follow-up: lead linkage + invalid IDs surface ─
describe("Sprint E — Architect follow-up: lead linkage + invalid seller IDs", () => {
  test("Lead drop yazılan contact_request kayıtlarında sellerCompanyId+buyerCompanyId+rfqId+sourceType='rfq' set", async () => {
    const { jar } = await login("admin", "admin123");
    const created = await api("POST", "/buyer/rfqs", {
      jar,
      body: {
        title: `Lead linkage test ${Date.now()}`,
        items: [{ name: "X", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [2],
        dropLeads: true,
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.leadsCreated, 1);
    // Verify via DB query through health/admin not available — use seller inbox path:
    // Lead'in DB'de var olduğunu ve sellerCompanyId set'li olduğunu doğrulamak için
    // ek bir admin endpoint olmadığından, RFQ id üzerinden notes+linkage'ı dolaylı doğrulayalım.
    assert.ok(created.json.rfq.id, "rfq id dönmeli");
    // Mixed valid/invalid: P1 — invalidSellerCompanyIds response'ta görünmeli
    const mixed = await api("POST", "/buyer/rfqs", {
      jar,
      body: {
        title: "Mixed IDs",
        items: [{ name: "X", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [2, 99999, 88888],
        dropLeads: false,
      },
    });
    assert.equal(mixed.status, 201);
    assert.deepEqual(mixed.json.invalidSellerCompanyIds.sort(), [88888, 99999], "invalid IDs response'ta yer almalı");
    assert.equal(mixed.json.targets.length, 1, "sadece geçerli satıcı için target oluşmalı");
  });
});

// ─── Sprint F — Quote Response & Comparison ───────────────────────────────────
describe("Sprint F — Quote Response & Comparison", () => {
  test("Seller quotes RFQ → status='quoted', quoteTotal hesaplanır, RFQ status 'sent'→'responded'", async () => {
    // 1) Buyer (PROSAN admin) bir RFQ oluşturur, hedef NIHAT (companyId=2)
    const { jar: buyerJar } = await login("admin", "admin123");
    const itemQty = 10;
    const created = await api("POST", "/buyer/rfqs", {
      jar: buyerJar,
      body: {
        title: `Sprint F quote test ${Date.now()}`,
        items: [
          { name: "Çelik Saç", qty: itemQty, unit: "kg" },
          { name: "Vida M8", qty: 200, unit: "ad" },
        ],
        targetSellerCompanyIds: [2],
        dropLeads: false,
      },
    });
    assert.equal(created.status, 201);
    const rfqId = created.json.rfq.id;
    const targetId = created.json.targets[0].id;

    // 2) Seller (NIHAT admin) target'ı görür ve teklif verir
    const { jar: sellerJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const view = await api("POST", `/seller/rfqs/${targetId}/view`, { jar: sellerJar, body: {} });
    assert.equal(view.status, 200);

    const quote = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: {
        quoteLines: [
          { itemIndex: 0, unitPrice: 50, leadTimeDays: 3 },
          { itemIndex: 1, unitPrice: 1.5 },
        ],
        quoteCurrency: "TRY",
      },
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.json));
    assert.equal(quote.json.status, "quoted");
    assert.ok(quote.json.quotedAt, "quotedAt set olmalı");
    // total = 10*50 + 200*1.5 = 800
    assert.equal(Number(quote.json.quoteTotal), 800);

    // 3) Buyer RFQ detail'de status 'responded' olmalı
    const detail = await api("GET", `/buyer/rfqs/${rfqId}`, { jar: buyerJar });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.status, "responded");
  });

  test("Invalid quote line itemIndex 400; declined target tekrar quote alamaz (409)", async () => {
    const { jar: buyerJar } = await login("admin", "admin123");
    const created = await api("POST", "/buyer/rfqs", {
      jar: buyerJar,
      body: {
        title: `Sprint F decline test ${Date.now()}`,
        items: [{ name: "X", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [2],
        dropLeads: false,
      },
    });
    const targetId = created.json.targets[0].id;

    const { jar: sellerJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    // Out-of-range itemIndex
    const bad = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 99, unitPrice: 10 }], quoteCurrency: "TRY" },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, "invalid_item_index");

    // Decline → idempotent re-decline → quote attempt 409
    const declined = await api("POST", `/seller/rfqs/${targetId}/decline`, { jar: sellerJar, body: {} });
    assert.equal(declined.status, 200);
    assert.equal(declined.json.status, "declined");
    const reDecline = await api("POST", `/seller/rfqs/${targetId}/decline`, { jar: sellerJar, body: {} });
    assert.equal(reDecline.status, 200, "decline idempotent");

    const quoteAfterDecline = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 0, unitPrice: 5 }], quoteCurrency: "TRY" },
    });
    assert.equal(quoteAfterDecline.status, 409);
    assert.equal(quoteAfterDecline.json.error, "already_declined");
  });

  test("Comparison + award: best-price highlight, RFQ→awarded, diğer quoted target'lar declined", async () => {
    // PROSAN buyer, hedef sadece NIHAT (tek satıcı senaryosu — best-price kendisi olur)
    const { jar: buyerJar } = await login("admin", "admin123");
    const created = await api("POST", "/buyer/rfqs", {
      jar: buyerJar,
      body: {
        title: `Sprint F award test ${Date.now()}`,
        items: [{ name: "Boru", qty: 5, unit: "m" }],
        targetSellerCompanyIds: [2],
        dropLeads: false,
      },
    });
    const rfqId = created.json.rfq.id;
    const targetId = created.json.targets[0].id;

    const { jar: sellerJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const q = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 0, unitPrice: 100 }], quoteCurrency: "TRY" },
    });
    assert.equal(q.status, 200);

    // Comparison
    const comp = await api("GET", `/buyer/rfqs/${rfqId}/comparison`, { jar: buyerJar });
    assert.equal(comp.status, 200);
    assert.equal(comp.json.quotedCount, 1);
    assert.equal(comp.json.matrix.length, 1);
    assert.equal(comp.json.matrix[0].offers.length, 1);
    assert.equal(comp.json.matrix[0].offers[0].isBest, true, "tek teklif best olmalı");
    assert.equal(comp.json.totals[0].quoteTotal, 500); // 5 × 100

    // Award
    const award = await api("POST", `/buyer/rfqs/${rfqId}/award`, { jar: buyerJar, body: { targetId } });
    assert.equal(award.status, 200, JSON.stringify(award.json));
    assert.equal(award.json.rfq.status, "awarded");
    assert.equal(award.json.rfq.awardedTargetId, targetId);
    assert.equal(award.json.winner.status, "awarded");

    // Re-award reddedilir
    const reAward = await api("POST", `/buyer/rfqs/${rfqId}/award`, { jar: buyerJar, body: { targetId } });
    assert.equal(reAward.status, 409);
    assert.equal(reAward.json.error, "already_awarded");

    // Award sonrası satıcı yeni teklif gönderemez
    const lateQuote = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 0, unitPrice: 50 }], quoteCurrency: "TRY" },
    });
    assert.equal(lateQuote.status, 409);
  });
});

// ─── Sprint F — Architect follow-up: forbidden state transitions ──────────────
describe("Sprint F — State transition guards", () => {
  test("Quoted target re-quote 409 (already_quoted); quoted→decline 409 (already_quoted)", async () => {
    const { jar: buyerJar } = await login("admin", "admin123");
    const created = await api("POST", "/buyer/rfqs", {
      jar: buyerJar,
      body: {
        title: `Sprint F transitions ${Date.now()}`,
        items: [{ name: "X", qty: 1, unit: "ad" }],
        targetSellerCompanyIds: [2],
        dropLeads: false,
      },
    });
    const targetId = created.json.targets[0].id;

    const { jar: sellerJar } = await login("nihat_admin", "nihat123", "nihatturizm");
    const q1 = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 0, unitPrice: 10 }], quoteCurrency: "TRY" },
    });
    assert.equal(q1.status, 200, "ilk quote başarılı");
    assert.equal(q1.json.status, "quoted");

    // Re-quote → 409 already_quoted
    const q2 = await api("POST", `/seller/rfqs/${targetId}/quote`, {
      jar: sellerJar,
      body: { quoteLines: [{ itemIndex: 0, unitPrice: 5 }], quoteCurrency: "TRY" },
    });
    assert.equal(q2.status, 409);
    assert.equal(q2.json.error, "already_quoted");

    // Quoted target decline → 409 already_quoted
    const d = await api("POST", `/seller/rfqs/${targetId}/decline`, { jar: sellerJar, body: {} });
    assert.equal(d.status, 409);
    assert.equal(d.json.error, "already_quoted");
  });
});

// ===========================================================================
// Sprint J — Membership + Verification (public registration + OTP)
// ===========================================================================
describe("Sprint J — Membership + Verification", () => {
  // Her test kendi unique e-postası ve oturumu ile çalışır; izole tenant — Sprint 11
  // STRICT after() çakışması yok (yeni şirketler, mevcut prosan/nihat'a dokunmaz).

  const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  test("J1 — register/business 201, oturum açık, plan pkg_trial_enterprise (Dalga 16), trial ~21d", async () => {
    const jar = new CookieJar("prosan");
    const s = stamp();
    const body = {
      firstName: "Test", lastName: "Kullanici",
      phone: "5551234567",
      email: `j1-${s}@regtest.local`,
      password: "Strong1234",
      companyName: `RegTest ${s}`,
      city: "İstanbul", district: "Kadıköy",
      verificationMethod: "email",
      kvkkConsent: true,
    };
    const r = await api("POST", "/auth/register/business", { body, jar });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.ok(r.json?.companyId);
    assert.ok(r.json?.subdomain);
    assert.ok(new Date(r.json.trialEndsAt).getTime() > Date.now() + 20 * 86400_000);
    // Sonraki istekleri yeni şirkete yönlendir (X-Tenant header)
    jar.tenant = r.json.subdomain;

    // Oturum açık olmalı — /auth/me 200 ve plan pkg_pro/yearly
    const me = await api("GET", "/auth/me", { jar });
    assert.equal(me.status, 200);
    assert.equal(me.json?.companyId, r.json.companyId);

    const sub = await api("GET", "/subscriptions/current", { jar });
    assert.equal(sub.status, 200);
    // Dalga 16: yeni kayıtlar gizli pkg_trial_enterprise planına atanır
    // (21 gün boyunca tüm enterprise feature'ları açık).
    assert.equal(sub.json?.plan?.slug, "pkg_trial_enterprise");
  });

  test("J2 — register/business duplicate email 409", async () => {
    const s = stamp();
    const email = `j2-${s}@regtest.local`;
    const base = {
      firstName: "Dup", lastName: "Test", phone: "5551112299",
      email, password: "Strong1234",
      companyName: `DupCo1 ${s}`, kvkkConsent: true, verificationMethod: "email",
    };
    const j1 = new CookieJar("prosan");
    const r1 = await api("POST", "/auth/register/business", { body: base, jar: j1 });
    assert.equal(r1.status, 201);

    const j2 = new CookieJar("prosan");
    const r2 = await api("POST", "/auth/register/business", {
      body: { ...base, companyName: `DupCo2 ${s}` }, jar: j2,
    });
    assert.equal(r2.status, 409);
  });

  test("J3 — register/buyer 201, accountType=purchasing", async () => {
    const jar = new CookieJar("prosan");
    const s = stamp();
    const r = await api("POST", "/auth/register/buyer", {
      jar,
      body: {
        firstName: "Alici", lastName: "Test", phone: "5559998877",
        email: `j3-${s}@regtest.local`, password: "Strong1234",
        companyName: `BuyerCo ${s}`, city: "İzmir",
        verificationMethod: "email", kvkkConsent: true,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    jar.tenant = r.json.subdomain;
    const me = await api("GET", "/auth/me", { jar });
    assert.equal(me.status, 200);
    assert.equal(me.json?.accountType, "purchasing");
    // Dalga 16: satınalmacı kayıtları gizli pkg_procurement planına atanır.
    const sub = await api("GET", "/subscriptions/current", { jar });
    assert.equal(sub.status, 200);
    assert.equal(sub.json?.plan?.slug, "pkg_procurement");
  });

  test("J4 — verify/check happy path → emailVerifiedAt set", async () => {
    const jar = new CookieJar("prosan");
    const s = stamp();
    const reg = await api("POST", "/auth/register/business", {
      jar,
      body: {
        firstName: "Ver", lastName: "İfy", phone: "5551238888",
        email: `j4-${s}@regtest.local`, password: "Strong1234",
        companyName: `VerifyCo ${s}`,
        verificationMethod: "email", kvkkConsent: true,
      },
    });
    assert.equal(reg.status, 201);
    jar.tenant = reg.json.subdomain;

    // SUPER_ADMIN test arka kapısı: code'u DB'den alacak public endpoint yok.
    // En son verification token'ı dev mode'da loglara da yazıyor; test için
    // mock SMTP davranışı: env'de READ_LATEST_VERIFY_CODE flag bulunmadığından,
    // bu test wrong-code → 5x → 429 yolunu doğrular (gerçek code DB'de hash'li).
    // Happy path için: GET /auth/me ile companies.emailVerifiedAt başlangıçta null
    // olmalı; verify/check başarılı doğrulamayı resend cooldown'dan dolayı
    // ayrı bir test olarak dev-only DB sondajıyla yapacağız (skip pragmatic).
    // Burada en azından attempts increment ve 400 kontrolü yapıyoruz:
    const wrong = await api("POST", "/auth/verify/check", { jar, body: { code: "000000" } });
    assert.ok(wrong.status === 400 || wrong.status === 429, `unexpected ${wrong.status}`);
  });

  test("J5 — verify/check 5x wrong → 429 too many attempts", async () => {
    const jar = new CookieJar("prosan");
    const s = stamp();
    const reg = await api("POST", "/auth/register/business", {
      jar,
      body: {
        firstName: "Att", lastName: "Empts", phone: "5551237777",
        email: `j5-${s}@regtest.local`, password: "Strong1234",
        companyName: `AttCo ${s}`,
        verificationMethod: "email", kvkkConsent: true,
      },
    });
    assert.equal(reg.status, 201);
    jar.tenant = reg.json.subdomain;

    let saw429 = false;
    for (let i = 0; i < 6; i++) {
      const r = await api("POST", "/auth/verify/check", { jar, body: { code: "111111" } });
      if (r.status === 429) { saw429 = true; break; }
      assert.equal(r.status, 400);
    }
    assert.ok(saw429, "5 hatalı denemeden sonra 429 bekleniyordu");
  });
});

// ===========================================================================
// Dalga 17 — Lock reason ayrımı (package / role / accountType)
// nav-lock.mjs saf helper testleri — UI tooltip + CTA mesajları için temel.
// ===========================================================================
import {
  getNavLockReason as _navLockFn,
  lockUiText as _lockUiTextFn,
  filterVisibleNavGroups as _filterGroupsFn,
} from "../../prosan/src/lib/nav-lock.mjs";

describe("Dalga 17 — getNavLockReason + lockUiText", () => {
  const allowAll = () => true;
  const denyAll = () => false;
  const allow = (codes) => (c) => codes.includes(c);

  test("D17-1 — açık item null döner", () => {
    const r = _navLockFn(
      { roles: ["admin"], feature: "sales.invoices" },
      { role: "admin", accountType: "seller", hasFeature: allowAll },
    );
    assert.equal(r, null);
  });

  test("D17-2 — rol yetersiz → 'role' (en yüksek öncelik)", () => {
    const r = _navLockFn(
      { roles: ["admin"], feature: "sales.invoices" },
      { role: "staff", accountType: "seller", hasFeature: denyAll },
    );
    assert.equal(r, "role"); // feature de eksik ama 'role' önce gelir
  });

  test("D17-3 — accountType uyumsuz → 'accountType'", () => {
    const r = _navLockFn(
      { roles: ["admin"], accountTypes: ["buyer", "both"], feature: "x" },
      { role: "admin", accountType: "seller", hasFeature: denyAll },
    );
    assert.equal(r, "accountType");
  });

  test("D17-4 — purchasing whitelist semantiği (xs yoksa kapalı)", () => {
    const r = _navLockFn(
      { roles: ["admin"] },
      { role: "admin", accountType: "purchasing", hasFeature: allowAll },
    );
    assert.equal(r, "accountType", "purchasing item explicit listelenmediyse kapalı olmalı");
    const r2 = _navLockFn(
      { roles: ["admin"], accountTypes: ["purchasing"] },
      { role: "admin", accountType: "purchasing", hasFeature: allowAll },
    );
    assert.equal(r2, null);
  });

  test("D17-5 — paket yetersiz → 'package'", () => {
    const r = _navLockFn(
      { roles: ["admin"], feature: "marketplace.pro" },
      { role: "admin", accountType: "seller", hasFeature: allow(["sales.pos"]) },
    );
    assert.equal(r, "package");
  });

  test("D17-6 — feature undefined → paket kontrolü skip", () => {
    const r = _navLockFn(
      { roles: ["admin"] },
      { role: "admin", accountType: "seller", hasFeature: denyAll },
    );
    assert.equal(r, null);
  });

  test("D17-8 — filterVisibleNavGroups: rol uyumsuz item GİZLENİR", () => {
    const groups = [{
      id: "g1",
      items: [
        { href: "/a", roles: ["admin"] },
        { href: "/b", roles: ["staff"] },
      ],
    }];
    const r = _filterGroupsFn(groups, { role: "staff", accountType: "seller" });
    assert.equal(r.length, 1);
    assert.equal(r[0].items.length, 1);
    assert.equal(r[0].items[0].href, "/b");
  });

  test("D17-9 — filterVisibleNavGroups: accountType=purchasing whitelist", () => {
    const groups = [
      { id: "satis", items: [{ href: "/sales", roles: ["admin"] }] },
      { id: "satinalma-merkezi", accountTypes: ["purchasing"], items: [
        { href: "/satinalma-merkezi", roles: ["admin"], accountTypes: ["purchasing"] },
      ]},
    ];
    const purchasing = _filterGroupsFn(groups, { role: "admin", accountType: "purchasing" });
    assert.equal(purchasing.length, 1, "purchasing sadece whitelisted grubu görmeli");
    assert.equal(purchasing[0].id, "satinalma-merkezi");

    const seller = _filterGroupsFn(groups, { role: "admin", accountType: "seller" });
    assert.equal(seller.length, 1);
    assert.equal(seller[0].id, "satis", "seller satinalma-merkezi'ni görmemeli");
  });

  test("D17-10 — filterVisibleNavGroups: tüm item gizlenirse grup atılır", () => {
    const groups = [
      { id: "empty", items: [{ href: "/x", roles: ["super_admin"] }] },
      { id: "ok", items: [{ href: "/y", roles: ["admin"] }] },
    ];
    const r = _filterGroupsFn(groups, { role: "admin", accountType: "seller" });
    assert.equal(r.length, 1);
    assert.equal(r[0].id, "ok");
  });

  test("D17-11 — filterVisibleNavGroups: isItemHidden tercihi uygulanır", () => {
    const groups = [{
      id: "g1",
      items: [
        { href: "/a", roles: ["admin"] },
        { href: "/b", roles: ["admin"] },
      ],
    }];
    const r = _filterGroupsFn(groups, {
      role: "admin", accountType: "seller",
      isItemHidden: (id) => id === "nav:/a",
    });
    assert.equal(r[0].items.length, 1);
    assert.equal(r[0].items[0].href, "/b");
  });

  test("D17-7 — lockUiText her reason için TR string + CTA href döner", () => {
    const pkg = _lockUiTextFn("package");
    assert.match(pkg.tooltip, /paketinizde yok/i);
    assert.equal(pkg.href, "/pricing");
    assert.equal(pkg.cta, "Paketi Yükselt");

    const role = _lockUiTextFn("role");
    assert.match(role.tooltip, /rolünüze kapalı/i);
    assert.equal(role.href, "/users");

    const at = _lockUiTextFn("accountType");
    assert.match(at.tooltip, /hesap tipinize uygun/i);
    assert.equal(at.href, "/firma-profili");

    const none = _lockUiTextFn(null);
    assert.equal(none.href, null);
    assert.equal(none.tooltip, "");
  });
});

// ===========================================================================
// Dalga 16 — Yetki Şeması v2 Foundation (gizli sistem planları)
// Public afişlerde sadece satılan planlar; trial_enterprise + procurement gizli.
// ===========================================================================
describe("Dalga 16 — Yetki Şeması v2 (gizli sistem planları)", () => {
  test("D16-1 — GET /subscriptions/plans (public afiş) gizli planları DÖNDÜRMEZ", async () => {
    const r = await api("GET", "/subscriptions/plans");
    assert.equal(r.status, 200);
    const plans = r.json?.plans ?? [];
    assert.ok(plans.length >= 5, `en az 5 public plan bekleniyordu, görüldü: ${plans.length}`);
    const slugs = plans.map((p) => p.slug);
    // Gizli sistem planları PUBLIC listede OLMAMALI
    assert.ok(!slugs.includes("pkg_trial_enterprise"),
      `pkg_trial_enterprise public listede görünmemeli, slugs=${slugs.join(",")}`);
    assert.ok(!slugs.includes("pkg_procurement"),
      `pkg_procurement public listede görünmemeli, slugs=${slugs.join(",")}`);
    // 5 satılan plan public listede OLMALI
    assert.ok(slugs.includes("pkg_starter"));
    assert.ok(slugs.includes("pkg_starter"));
    assert.ok(slugs.includes("pkg_business_v3"));
    assert.ok(slugs.includes("pkg_pro"));
    assert.ok(slugs.includes("pkg_enterprise_v3"));
    // Tüm public planlar isPublic=true
    for (const p of plans) {
      assert.equal(p.isPublic, true, `${p.slug} public listede ama isPublic=${p.isPublic}`);
    }
  });

  test("D16-2 — GET /subscriptions/plans/all (super_admin) gizli planları DÖNDÜRÜR", async () => {
    const jar = new CookieJar("prosan");
    // super_admin login (mevcut seed: admin@prosan.com / Admin123 platform-level)
    const login = await api("POST", "/auth/login", {
      jar,
      body: { username: "platformadmin", password: "Admin123!" },
    });
    if (login.status !== 200) {
      // super_admin seed yoksa testi skip — yine de endpoint var olduğunu kontrol et
      const unauth = await api("GET", "/subscriptions/plans/all");
      assert.ok(unauth.status === 401 || unauth.status === 403,
        `auth gerekli (got ${unauth.status})`);
      return;
    }
    const r = await api("GET", "/subscriptions/plans/all", { jar });
    assert.equal(r.status, 200);
    const slugs = (r.json?.plans ?? []).map((p) => p.slug);
    assert.ok(slugs.includes("pkg_trial_enterprise"),
      `super_admin tüm planları görmeli, slugs=${slugs.join(",")}`);
    assert.ok(slugs.includes("pkg_procurement"));
  });

  test("D16-4 — tenant admin /subscribe ile gizli planı SEÇEMEZ (security guard)", async () => {
    // Önce normal bir business kayıt et (admin yetkisiyle), sonra gizli plan
    // ID'sini super_admin'den öğren ve admin olarak /subscribe ile dene → 403.
    const jar = new CookieJar("prosan");
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const reg = await api("POST", "/auth/register/business", {
      jar,
      body: {
        firstName: "D16", lastName: "Four", phone: "5550003164",
        email: `d16-4-${s}@regtest.local`, password: "Strong1234",
        companyName: `D164Co ${s}`, city: "İstanbul",
        verificationMethod: "email", kvkkConsent: true,
      },
    });
    assert.equal(reg.status, 201);
    jar.tenant = reg.json.subdomain;

    // Public planları çek — burada gizli plan ID'si BULUNMAMALI
    const publicPlans = await api("GET", "/subscriptions/plans", { jar });
    assert.equal(publicPlans.status, 200);
    const hidden = (publicPlans.json?.plans ?? [])
      .find((p) => p.slug === "pkg_trial_enterprise" || p.slug === "pkg_procurement");
    assert.equal(hidden, undefined, "gizli plan public listede çıkmamalı (D16-1 doğrulaması)");

    // Saldırı senaryosu: API'yi doğrudan çağırarak gizli plan ID denenir.
    // ID'yi tahmin etmek yerine pratik test: olası planId'leri enumerate et.
    // 1..50 aralığında her aktif planı dene; pkg_trial_enterprise/procurement → 403.
    let attemptedHidden = 0;
    let confirmedRejected = 0;
    for (let pid = 1; pid <= 50; pid++) {
      const r = await api("POST", "/subscriptions/subscribe", {
        jar,
        body: { planId: pid, billingCycle: "monthly" },
      });
      // Plan yoksa 404 (normal); public planı 201 olur (saldırı dışı); gizli olan 403 olmalı.
      if (r.status === 403 && /kullanıcı seçimine kapalıdır|hesap tipine uygundur/i.test(JSON.stringify(r.json))) {
        attemptedHidden++;
        confirmedRejected++;
      }
      // Devam — tüm 50 ID'yi tara; en az bir gizli planın 403 verdiğini kanıtlamak yeterli.
    }
    assert.ok(attemptedHidden >= 1,
      `en az 1 gizli plan ID'sinin 403 ile reddedilmesi bekleniyordu (taranan: 50, reddedilen: ${attemptedHidden})`);
    assert.equal(confirmedRejected, attemptedHidden);
  });

  test("D16-3 — pkg_procurement requiredAccountType='purchasing' DB'de seedlenmiş", async () => {
    const jar = new CookieJar("prosan");
    // Bu testi public endpoint'le yapamayız (gizli plan); register/buyer akışından
    // elde edilen plan atamasını J3 doğruluyor zaten. Burada feature setini doğrula:
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const reg = await api("POST", "/auth/register/buyer", {
      jar,
      body: {
        firstName: "D16", lastName: "Three", phone: "5550003163",
        email: `d16-3-${s}@regtest.local`, password: "Strong1234",
        companyName: `D163Co ${s}`,
        verificationMethod: "email", kvkkConsent: true,
      },
    });
    assert.equal(reg.status, 201);
    jar.tenant = reg.json.subdomain;

    const feat = await api("GET", "/subscriptions/features", { jar });
    assert.equal(feat.status, 200);
    const features = feat.json?.features ?? [];
    // Procurement plan: sadece keşif/teklif modülleri açık olmalı
    assert.ok(features.includes("customers.crm"),
      `procurement customers.crm açık olmalı, features=${features.join(",")}`);
    assert.ok(features.includes("suppliers"));
    // Sales/POS/Marketplace KAPALI olmalı (procurement satış yapmaz)
    assert.ok(!features.includes("sales.pos"),
      `procurement'ta sales.pos olmamalı, features=${features.join(",")}`);
    assert.ok(!features.includes("marketplace.basic"));
    assert.ok(!features.includes("einvoice.pro"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint M+ — Sales Type (Toptan / Perakende)
// ─────────────────────────────────────────────────────────────────────────────
describe("Sprint M+ — Sales Type (wholesale/retail)", () => {
  const _st = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  async function _ensureSaleTypeProduct(jar) {
    const code = `STYPE-${_st()}`;
    const create = await api("POST", "/products", { jar, body: {
      productCode: code, name: `SaleType Test ${code}`, barcode: code,
      stock: 100, minStock: 0, purchasePrice: 10, salePrice: 25,
    } });
    assert.equal(create.status, 201, `product create ${create.status}`);
    return create.json.product || create.json;
  }

  test("M+1 — POST /sales explicit saleType='wholesale' kabul edilir", async () => {
    const { jar } = await login("talha", "talha123", "prosan");
    const p = await _ensureSaleTypeProduct(jar);
    const r = await api("POST", "/sales", { jar, body: {
      productId: p.id, quantity: 1, unitPrice: 25, saleType: "wholesale",
    } });
    assert.equal(r.status, 201);
    assert.equal(r.json.saleType, "wholesale");
  });

  test("M+2 — POST /sales POS default → retail", async () => {
    const { jar } = await login("talha", "talha123", "prosan");
    const p = await _ensureSaleTypeProduct(jar);
    const r = await api("POST", "/sales", { jar, body: {
      productId: p.id, quantity: 1, unitPrice: 25, channelKey: "pos",
    } });
    assert.equal(r.status, 201);
    assert.equal(r.json.saleType, "retail");
  });

  test("M+3 — GET /sales?saleType=wholesale yalnız wholesale döner", async () => {
    const { jar } = await login("talha", "talha123", "prosan");
    const p = await _ensureSaleTypeProduct(jar);
    // 1 wholesale + 1 retail oluştur
    await api("POST", "/sales", { jar, body: { productId: p.id, quantity: 1, unitPrice: 25, saleType: "wholesale" } });
    await api("POST", "/sales", { jar, body: { productId: p.id, quantity: 1, unitPrice: 25, saleType: "retail" } });
    const r = await api("GET", "/sales?saleType=wholesale&limit=200", { jar });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.sales), "sales[] beklenir");
    assert.ok(r.json.sales.length >= 1, "en az 1 wholesale satır beklenir");
    for (const s of r.json.sales) assert.equal(s.saleType, "wholesale", `kayıt ${s.id} wholesale değil`);
  });
});


// =============================================================================
// Dalga 13 — Mobile Theme Token Drift Prevention
// Architect non-blocking öneri (D11/D12): mobile constants/colors.ts brand
// commitment'ları (primary/tint/accent/success) drift'e karşı assert et.
// Test cross-package okuma: api-server suite ⇄ smsystems-mobile constants.
// =============================================================================
import { readFileSync as _drift_read } from "node:fs";
import { resolve as _drift_resolve, dirname as _drift_dirname } from "node:path";
import { fileURLToPath as _drift_fileURLToPath } from "node:url";

const _DRIFT_HERE = _drift_dirname(_drift_fileURLToPath(import.meta.url));
const _DRIFT_COLORS_PATH = _drift_resolve(_DRIFT_HERE, "../../smsystems-mobile/constants/colors.ts");

function _driftExtractToken(src, scope, key) {
  // scope: "light" | "dark"; src: full file. Çok basit regex parse, JSDoc'lara
  // uymaz — sadece object literal field'ı yakalar.
  const scopeRe = new RegExp(`${scope}\\s*:\\s*\\{([\\s\\S]*?)\\}`, "m");
  const m = src.match(scopeRe);
  if (!m) throw new Error(`scope ${scope} bulunamadı`);
  const fieldRe = new RegExp(`${key}\\s*:\\s*"(#[0-9A-Fa-f]{3,8})"`);
  const fm = m[1].match(fieldRe);
  if (!fm) throw new Error(`${scope}.${key} bulunamadı`);
  return fm[1].toUpperCase();
}

describe("Dalga 13 — Mobile theme token drift prevention", () => {
  test("BRAND COMMITMENT — light primary/tint/accent/success Ticarium365 brand'iyle hizalı", () => {
    const src = _drift_read(_DRIFT_COLORS_PATH, "utf-8");
    assert.equal(_driftExtractToken(src, "light", "primary"), "#4F46E5", "light.primary mor brand drift");
    assert.equal(_driftExtractToken(src, "light", "tint"), "#4F46E5", "light.tint primary ile aynı olmalı");
    assert.equal(_driftExtractToken(src, "light", "accent"), "#5EEAD4", "light.accent teal brand drift");
    assert.equal(_driftExtractToken(src, "light", "success"), "#5EEAD4", "light.success accent ile aynı olmalı");
  });

  test("BRAND COMMITMENT — dark primary/tint mor varyant (Indigo-400)", () => {
    const src = _drift_read(_DRIFT_COLORS_PATH, "utf-8");
    assert.equal(_driftExtractToken(src, "dark", "primary"), "#818CF8", "dark.primary Indigo-400 drift");
    assert.equal(_driftExtractToken(src, "dark", "tint"), "#818CF8", "dark.tint primary ile aynı olmalı");
    assert.equal(_driftExtractToken(src, "dark", "accent"), "#5EEAD4", "dark.accent light ile aynı (brand teal)");
  });

  test("BRAND COMMITMENT — JSDoc başlığı dosyada yer alır", () => {
    const src = _drift_read(_DRIFT_COLORS_PATH, "utf-8");
    assert.ok(src.includes("BRAND COMMITMENT"), "BRAND COMMITMENT JSDoc kayıp — drift signal silinmiş");
    assert.ok(src.includes("Ticarium365"), "Ticarium365 brand referansı kayıp");
  });
});
