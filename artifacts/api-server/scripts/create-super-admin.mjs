#!/usr/bin/env node
/**
 * Manuel super_admin oluşturma — DB'de zaten super_admin varken çalışmaz.
 *
 * Kullanım (repo kökünden, .env yüklü):
 *   pnpm -C artifacts/api-server run create-super-admin -- founder@ornek.com "GucluSifre123!" "Ad Soyad"
 *
 * Opsiyonel 4. argüman: username (boşsa email'in @ öncesi sanitize edilir).
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL gerekli.");
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error(
    "Kullanım: node create-super-admin.mjs <email> <password> [fullName] [username]",
  );
  process.exit(2);
}

const email = String(argv[0] || "").trim().toLowerCase();
const password = String(argv[1] || "");
const fullName = String(argv[2] || "Platform Kurucusu").trim().slice(0, 200);
let username = String(argv[3] || "").trim().slice(0, 64);

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Geçerli bir e-posta girin.");
  process.exit(2);
}

if (password.length < 12) {
  console.error("Şifre en az 12 karakter olmalı (üretim güvenliği).");
  process.exit(2);
}

if (!username) {
  username = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "founder";
}

const pool = new pg.Pool({ connectionString: url, max: 2 });

try {
  const cRes = await pool.query(`select count(*)::int as c from users where role = 'super_admin'`);
  const superCount = Number(cRes.rows[0]?.c ?? 0);
  if (superCount > 0) {
    console.error(
      `İptal: veritabanında zaten ${superCount} super_admin var. Çift kurucu oluşturulmaz.`,
    );
    process.exit(1);
  }

  const emailTaken = await pool.query(
    `select id from users where lower(email) = lower($1) limit 1`,
    [email],
  );
  if (emailTaken.rows.length > 0) {
    console.error("Bu e-posta zaten kayıtlı.");
    process.exit(1);
  }

  const userTaken = await pool.query(`select id from users where username = $1 limit 1`, [
    username,
  ]);
  if (userTaken.rows.length > 0) {
    console.error(`Kullanıcı adı kullanımda: ${username}. Farklı bir username verin (4. argüman).`);
    process.exit(1);
  }

  const co = await pool.query(`select id from companies order by id asc limit 1`);
  const companyId = co.rows[0]?.id;
  if (!companyId) {
    console.error("companies tablosu boş — önce en az bir şirket oluşturun.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const fn = fullName.length > 0 ? fullName : "Platform Kurucusu";

  await pool.query(
    `insert into users (company_id, username, password_hash, full_name, email, role, is_active)
     values ($1, $2, $3, $4, $5, 'super_admin', true)`,
    [companyId, username, passwordHash, fn, email],
  );

  console.log("OK: super_admin oluşturuldu.");
  console.log(`  username: ${username}`);
  console.log(`  email:    ${email}`);
  console.log("Giriş: /login — kullanıcı adı veya (sadece super_admin için) e-posta + şifre.");
} finally {
  await pool.end();
}
