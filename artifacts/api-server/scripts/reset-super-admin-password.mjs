#!/usr/bin/env node
/**
 * Tek seferlik super_admin şifre sıfırlama (operator-run, API yok).
 * register/login ile aynı: bcryptjs, cost factor 10 (auth.ts ile uyumlu).
 *
 * Kullanım:
 *   pnpm -C artifacts/api-server run reset-super-admin-password -- "<username veya email>" "<YENI_SIFRE>"
 *
 * Şifre stderr/stdout'a veya log'a yazılmaz.
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL gerekli.");
  process.exit(2);
}

const ident = String(process.argv[2] ?? "").trim();
const newPassword = String(process.argv[3] ?? "");

if (!ident || !newPassword) {
  console.error(
    "Kullanım: pnpm -C artifacts/api-server run reset-super-admin-password -- \"<username|email>\" \"<YENI_SIFRE>\"",
  );
  process.exit(2);
}

if (newPassword.length < 12) {
  console.error("Yeni şifre en az 12 karakter olmalı.");
  process.exit(2);
}

const BCRYPT_ROUNDS = 10;
const pool = new pg.Pool({ connectionString: url, max: 2 });

try {
  const find = await pool.query(
    `select id, username, email, role::text as role
     from users
     where role = 'super_admin'
       and (username = $1 or (email is not null and lower(trim(email)) = lower(trim($1))))
     limit 2`,
    [ident],
  );

  if (find.rows.length === 0) {
    console.error("İşlem yapılmadı: eşleşen super_admin yok (kullanıcı adı / e-posta ve rolü kontrol edin).");
    process.exit(1);
  }
  if (find.rows.length > 1) {
    console.error("İşlem yapılmadı: birden fazla super_admin eşleşti — veritabanında çakışmayı giderin.");
    process.exit(1);
  }

  const row = find.rows[0];
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const upd = await pool.query(
    `update users
     set password_hash = $1, updated_at = now()
     where id = $2 and role = 'super_admin'
     returning id, username`,
    [passwordHash, row.id],
  );

  if (upd.rowCount !== 1) {
    console.error("Güncelleme başarısız (koşul uyuşmazlığı).");
    process.exit(1);
  }

  console.log("OK: super_admin parola güncellendi.");
  console.log(`  user id: ${upd.rows[0].id}`);
  console.log(`  username: ${upd.rows[0].username}`);
} finally {
  await pool.end();
}
