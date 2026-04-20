import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  db, usersTable, companySettingsTable, passwordResetTokensTable, companiesTable,
  subscriptionPlansTable, companySubscriptionsTable, verificationTokensTable,
} from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { sendSms } from "../services/sms/factory.js";
import { sendMail } from "../lib/email.js";

const router = Router();

// ---------------------------------------------------------------------------
// Yardımcılar — şifre sıfırlama akışı için
// ---------------------------------------------------------------------------
const RESET_CODE_TTL_MIN = 10;        // 6 haneli kod 10 dk geçerli
const RESET_TOKEN_TTL_MIN = 15;       // Kod doğrulandıktan sonra reset token 15 dk
const MAX_CODE_ATTEMPTS = 5;          // Kod girişinde brute-force koruması

function generateSixDigitCode(): string {
  // 100000 - 999999 arası rastgele
  return String(crypto.randomInt(100_000, 1_000_000));
}

function normalizePhoneInput(raw: string): string {
  let p = (raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+90")) p = p.slice(3);
  else if (p.startsWith("90") && p.length === 12) p = p.slice(2);
  else if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  return p;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json(Errors.badRequest("Kullanıcı adı ve şifre gerekli"));
      return;
    }

    const companyId = req.companyId;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username));

    // Super admin her şirketten giriş yapabilir; diğerleri kendi şirketinden
    if (!user || (user.role !== "super_admin" && user.companyId !== companyId)) {
      await audit({
        req,
        action: "LOGIN_FAILED",
        details: { username, reason: "user_not_found_or_wrong_company" },
      });
      res.status(401).json(Errors.unauthorized("Kullanıcı adı veya şifre hatalı"));
      return;
    }

    if (!user.isActive) {
      await audit({
        req,
        action: "LOGIN_FAILED",
        details: { username, reason: "account_disabled" },
      });
      res.status(401).json(Errors.unauthorized("Hesabınız devre dışı bırakılmış"));
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await audit({
        req,
        action: "LOGIN_FAILED",
        details: { username, reason: "wrong_password" },
      });
      res.status(401).json(Errors.unauthorized("Kullanıcı adı veya şifre hatalı"));
      return;
    }

    const sessionCompanyId = user.role === "super_admin" ? (user.companyId ?? companyId) : companyId;

    // Sprint D: companies.accountType session ve response'a yansıtılır.
    let accountType: "seller" | "buyer" | "both" | "purchasing" = "seller";
    if (sessionCompanyId) {
      const [c] = await db.select({ accountType: companiesTable.accountType })
        .from(companiesTable).where(eq(companiesTable.id, sessionCompanyId)).limit(1);
      if (c?.accountType) accountType = c.accountType as typeof accountType;
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      companyId: sessionCompanyId,
      accountType,
    };

    await audit({
      req,
      action: "LOGIN",
      entity: "user",
      entityId: user.id,
      details: { role: user.role },
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        companyId: req.session.user.companyId,
        accountType: req.session.user.accountType ?? "seller",
        createdAt: user.createdAt,
      },
      message: "Giriş başarılı",
    });
  } catch (err) {
    req.log?.error({ err }, "Login error");
    res.status(500).json(Errors.internal());
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const user = req.session.user;
  if (user) {
    await audit({ req, action: "LOGOUT", entity: "user", entityId: user.id });
  }
  req.session.destroy(() => {
    res.json({ message: "Çıkış yapıldı" });
  });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;

  let onboardingCompleted: boolean | null = null;
  if (user.role === "admin" && user.companyId) {
    try {
      const [s] = await db.select({ onboardingCompleted: companySettingsTable.onboardingCompleted })
        .from(companySettingsTable)
        .where(eq(companySettingsTable.companyId, user.companyId));
      onboardingCompleted = s?.onboardingCompleted ?? false;
    } catch { /* hata durumunda null bırak */ }
  }

  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    companyId: user.companyId,
    accountType: user.accountType ?? "seller",
    createdAt: new Date(),
    onboardingCompleted,
  });
});

// ---------------------------------------------------------------------------
// Şifremi Unuttum — 3 adımlı akış (telefon → SMS kod → yeni şifre)
// ---------------------------------------------------------------------------

// 1) Telefon ile sıfırlama isteği başlat — SMS gönderir
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const phone = normalizePhoneInput(req.body?.phone || "");
    const companyId = req.companyId;

    if (phone.length !== 10) {
      res.status(400).json(Errors.badRequest("Geçerli bir telefon numarası girin (10 haneli, başında 0 olmadan)"));
      return;
    }

    // Hesap olsa da olmasa da hep aynı yanıtı dönüyoruz — phone enumeration koruması
    const successResponse = {
      ok: true,
      message: "Telefon numaranız sistemde kayıtlıysa doğrulama kodu birazdan SMS olarak ulaşacaktır.",
      ttlMinutes: RESET_CODE_TTL_MIN,
    };

    // Tenant scope: aynı telefon başka bir tenant'ta varsa onu DİKKATE ALMA
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.phone, phone), eq(usersTable.companyId, companyId)));

    if (!user || !user.isActive) {
      await audit({
        req,
        action: "PASSWORD_RESET_REQUEST_NO_ACCOUNT",
        details: { phone },
      });
      res.json(successResponse);
      return;
    }

    // Aynı kullanıcı için açık (consumed=false) önceki tüm kodları geçersiz kıl
    // — yeni istek eskisini iptal eder, böylece çoklu aktif kod kalmaz
    await db.update(passwordResetTokensTable)
      .set({ consumed: true })
      .where(and(
        eq(passwordResetTokensTable.userId, user.id),
        eq(passwordResetTokensTable.companyId, companyId),
        eq(passwordResetTokensTable.consumed, false),
      ));

    // 6 haneli kod üret, hash'le, kaydet (companyId ile birlikte)
    const code = generateSixDigitCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60_000);

    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      companyId,
      codeHash,
      phone,
      expiresAt,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    });

    // SMS gönder — provider kurulu değilse sadece DEV ortamında konsola yaz
    const smsBody =
      `Ticarium365 sifre sifirlama kodunuz: ${code}\n` +
      `Bu kod ${RESET_CODE_TTL_MIN} dakika gecerlidir. Kimseyle paylasmayin.`;

    const smsResult = await sendSms({
      companyId,
      toPhone: phone,
      body: smsBody,
    });

    if (!smsResult.ok) {
      if (process.env.NODE_ENV !== "production") {
        // Sadece geliştirme — production'da OTP ASLA log'a düşmez
        logger.warn(
          { phone, code, userId: user.id },
          "PASSWORD_RESET_SMS_MOCK [DEV] — SMS provider eksik, kod log üzerinden iletildi",
        );
      } else {
        // Production: SMS gönderilemedi ama kod sızdırılmaz
        logger.error(
          { phone, userId: user.id, smsError: smsResult.error },
          "PASSWORD_RESET_SMS_FAILED — SMS provider hatası, kullanıcı kod alamadı",
        );
      }
    }

    await audit({
      req,
      action: "PASSWORD_RESET_REQUESTED",
      entity: "user",
      entityId: user.id,
      details: { phone, smsOk: smsResult.ok },
    });

    res.json(successResponse);
  } catch (err) {
    req.log?.error({ err }, "forgot-password error");
    res.status(500).json(Errors.internal());
  }
});

// 2) SMS kodunu doğrula — başarılıysa kısa süreli reset token döner
router.post("/verify-reset-code", async (req: Request, res: Response) => {
  try {
    const phone = normalizePhoneInput(req.body?.phone || "");
    const code = String(req.body?.code || "").trim();
    const companyId = req.companyId;

    if (phone.length !== 10 || !/^\d{6}$/.test(code)) {
      res.status(400).json(Errors.badRequest("Telefon ve 6 haneli doğrulama kodunu girin"));
      return;
    }

    // Tenant izolasyonu önce — TÜM sorgu companyId ile filtreli
    const candidates = await db
      .select()
      .from(passwordResetTokensTable)
      .where(and(
        eq(passwordResetTokensTable.phone, phone),
        eq(passwordResetTokensTable.companyId, companyId),
        eq(passwordResetTokensTable.consumed, false),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ))
      .orderBy(passwordResetTokensTable.createdAt);

    // En son oluşturulanı al (öncekiler zaten forgot-password sırasında consumed olmuştur)
    const record = candidates[candidates.length - 1];

    if (!record) {
      res.status(400).json(Errors.badRequest("Doğrulama kodu bulunamadı veya süresi geçti. Lütfen yeni bir kod isteyin."));
      return;
    }

    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      res.status(429).json(Errors.tooManyRequests("Çok fazla hatalı deneme. Lütfen yeni bir kod isteyin."));
      return;
    }

    const codeOk = await bcrypt.compare(code, record.codeHash);

    if (!codeOk) {
      await db.update(passwordResetTokensTable)
        .set({ attempts: record.attempts + 1 })
        .where(eq(passwordResetTokensTable.id, record.id));
      res.status(400).json(Errors.badRequest("Doğrulama kodu hatalı"));
      return;
    }

    // Doğrulandı — bir defa kullanılacak reset token üret (15 dk)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(resetToken);
    const tokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60_000);

    await db.update(passwordResetTokensTable)
      .set({
        resetTokenHash,
        expiresAt: tokenExpires,
        attempts: record.attempts + 1,
      })
      .where(eq(passwordResetTokensTable.id, record.id));

    await audit({
      req,
      action: "PASSWORD_RESET_CODE_VERIFIED",
      entity: "user",
      entityId: record.userId,
    });

    res.json({
      ok: true,
      resetToken,
      ttlMinutes: RESET_TOKEN_TTL_MIN,
    });
  } catch (err) {
    req.log?.error({ err }, "verify-reset-code error");
    res.status(500).json(Errors.internal());
  }
});

// 3) Reset token ile yeni şifre belirle — atomik tüketim, race-safe
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const phone = normalizePhoneInput(req.body?.phone || "");
    const resetToken = String(req.body?.resetToken || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const companyId = req.companyId;

    if (phone.length !== 10 || !resetToken || newPassword.length < 8) {
      res.status(400).json(Errors.badRequest("Yeni şifre en az 8 karakter olmalıdır"));
      return;
    }

    const tokenHash = hashToken(resetToken);
    const newHash = await bcrypt.hash(newPassword, 10);

    // Atomik consume + parola güncelleme — tek transaction içinde
    // İlk RETURNING boşsa: token başka bir istekçi tarafından zaten tüketildi
    const result = await db.transaction(async (tx) => {
      const consumed = await tx.update(passwordResetTokensTable)
        .set({ consumed: true })
        .where(and(
          eq(passwordResetTokensTable.phone, phone),
          eq(passwordResetTokensTable.companyId, companyId),
          eq(passwordResetTokensTable.resetTokenHash, tokenHash),
          eq(passwordResetTokensTable.consumed, false),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ))
        .returning();

      if (consumed.length === 0) return null;
      const rec = consumed[0];

      // Kullanıcıyı çek (tenant doğrulaması hâlâ var — defansif)
      const [u] = await tx.select().from(usersTable)
        .where(and(eq(usersTable.id, rec.userId), eq(usersTable.companyId, companyId)));
      if (!u) return null;

      await tx.update(usersTable)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(usersTable.id, u.id));

      return { user: u, record: rec };
    });

    if (!result) {
      res.status(400).json(Errors.badRequest("Şifre sıfırlama oturumu geçersiz veya süresi geçmiş. Lütfen yeniden başlayın."));
      return;
    }

    await audit({
      req,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "user",
      entityId: result.user.id,
    });

    res.json({ ok: true, message: "Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz." });
  } catch (err) {
    req.log?.error({ err }, "reset-password error");
    res.status(500).json(Errors.internal());
  }
});

// ---------------------------------------------------------------------------
// Sprint J — Üyelik / Public Registration + Verification
// ---------------------------------------------------------------------------

const VERIFY_CODE_TTL_MIN = 10;
const VERIFY_RESEND_COOLDOWN_SEC = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const TRIAL_DAYS = 21;

/** Per-IP basit rate-limit (in-memory, burst koruması).
 *  Test ortamında devre dışı (NODE_ENV !== "production" + DISABLE_REGISTER_RATE_LIMIT=1). */
const _registerHits = new Map<string, number[]>();
function registerRateLimit(req: Request, max = 5, windowMs = 10 * 60_000): boolean {
  if (process.env.DISABLE_REGISTER_RATE_LIMIT === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const ip = (req.ip || "unknown").toString();
  const now = Date.now();
  const arr = (_registerHits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  _registerHits.set(ip, arr);
  return arr.length <= max;
}

function turkishToAscii(s: string): string {
  return s
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase();
}
function slugifyName(name: string): string {
  const ascii = turkishToAscii(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "firma";
}

async function generateUniqueSubdomain(name: string): Promise<string> {
  const base = slugifyName(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [exists] = await db.select({ id: companiesTable.id })
      .from(companiesTable).where(eq(companiesTable.subdomain, candidate)).limit(1);
    if (!exists) return candidate;
  }
  // Çok düşük olasılık: 50 çakışma → rastgele suffix
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function makeUsernameFromEmail(email: string): string {
  const local = (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return local.slice(0, 32) || "user";
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function findOrCreatePlanId(slug: string): Promise<number | null> {
  const [p] = await db.select({ id: subscriptionPlansTable.id })
    .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, slug)).limit(1);
  return p?.id ?? null;
}

async function sendVerificationCode(channel: "sms" | "email", target: string, code: string) {
  if (channel === "sms") {
    const body = `Ticarium365 dogrulama kodunuz: ${code}\n${VERIFY_CODE_TTL_MIN} dk gecerlidir.`;
    const r = await sendSms({ companyId: 0, toPhone: target, body });
    if (!r.ok && process.env.NODE_ENV !== "production") {
      logger.warn({ target, code }, "VERIFY_SMS_MOCK [DEV] — SMS provider eksik, kod log'a düştü");
    }
    return r.ok;
  }
  const r = await sendMail({
    to: target,
    subject: "Ticarium365 hesap doğrulama kodu",
    text: `Ticarium365 doğrulama kodunuz: ${code}\nBu kod ${VERIFY_CODE_TTL_MIN} dakika geçerlidir.`,
    html:
      `<p>Ticarium365 hesabınızı doğrulamak için aşağıdaki kodu kullanın:</p>` +
      `<p style="font-size:22px;font-weight:bold;letter-spacing:3px">${code}</p>` +
      `<p>Bu kod ${VERIFY_CODE_TTL_MIN} dakika geçerlidir.</p>`,
  });
  if (!r.sent && process.env.NODE_ENV !== "production") {
    logger.warn({ target, code }, "VERIFY_EMAIL_MOCK [DEV] — SMTP yok, kod log'a düştü");
  }
  return r.sent;
}

interface RegisterCommonInput {
  firstName: string; lastName: string; phone: string; email: string;
  password: string; companyName: string; city?: string; district?: string;
  verificationMethod?: "sms" | "email"; kvkkConsent?: boolean;
}

function validateRegisterInput(b: any): { ok: true; data: RegisterCommonInput } | { ok: false; msg: string } {
  const firstName = String(b?.firstName || "").trim();
  const lastName = String(b?.lastName || "").trim();
  const phone = normalizePhoneInput(String(b?.phone || ""));
  const email = String(b?.email || "").trim().toLowerCase();
  const password = String(b?.password || "");
  const companyName = String(b?.companyName || "").trim();
  const city = String(b?.city || "").trim() || undefined;
  const district = String(b?.district || "").trim() || undefined;
  const verificationMethod: "sms" | "email" = b?.verificationMethod === "sms" ? "sms" : "email";
  const kvkkConsent = b?.kvkkConsent === true || b?.kvkkConsent === "true";

  if (firstName.length < 2 || lastName.length < 2) return { ok: false, msg: "Ad ve soyad en az 2 karakter olmalıdır" };
  if (phone.length !== 10) return { ok: false, msg: "Geçerli bir telefon numarası girin (10 haneli)" };
  if (!isValidEmail(email)) return { ok: false, msg: "Geçerli bir e-posta adresi girin" };
  if (password.length < 8) return { ok: false, msg: "Şifre en az 8 karakter olmalıdır" };
  if (companyName.length < 2) return { ok: false, msg: "Şirket adı en az 2 karakter olmalıdır" };
  if (!kvkkConsent) return { ok: false, msg: "KVKK aydınlatma metnini onaylamanız gerekiyor" };

  return { ok: true, data: { firstName, lastName, phone, email, password, companyName, city, district, verificationMethod, kvkkConsent } };
}

/**
 * Public business registration — 21 günlük tam sürüm trial başlatır.
 * Subdomain otomatik slug + collision suffix; pkg_growth/yearly seedlenir.
 */
router.post("/register/business", async (req: Request, res: Response) => {
  try {
    if (!registerRateLimit(req)) {
      res.status(429).json(Errors.tooManyRequests("Çok fazla kayıt isteği. Lütfen biraz sonra tekrar deneyin."));
      return;
    }
    const v = validateRegisterInput(req.body);
    if (!v.ok) { res.status(400).json(Errors.badRequest(v.msg)); return; }
    const data = v.data;

    // Email duplicate check (cross-tenant — platform geneli)
    const [emailDup] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.email, data.email)).limit(1);
    if (emailDup) {
      res.status(409).json(Errors.conflict("Bu e-posta adresi zaten kayıtlı"));
      return;
    }

    const subdomain = await generateUniqueSubdomain(data.companyName);
    const planId = await findOrCreatePlanId("pkg_growth");
    if (!planId) {
      res.status(500).json(Errors.internal("Varsayılan plan tanımlı değil (pkg_growth bulunamadı)"));
      return;
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60_000);
    const verifyCode = generateSixDigitCode();
    const verifyCodeHash = await bcrypt.hash(verifyCode, 10);
    const verifyTarget = data.verificationMethod === "sms" ? data.phone : data.email;
    const verifyExpires = new Date(now.getTime() + VERIFY_CODE_TTL_MIN * 60_000);

    const result = await db.transaction(async (tx) => {
      const [company] = await tx.insert(companiesTable).values({
        name: data.companyName,
        subdomain,
        planType: "trial",
        trialEndsAt,
        trialStartedAt: now,
        accountType: "seller",
        city: data.city ?? null,
        district: data.district ?? null,
        verificationMethod: data.verificationMethod,
        primaryColor: "#2563eb",
        isActive: true,
      }).returning();

      const username = makeUsernameFromEmail(data.email);
      const [user] = await tx.insert(usersTable).values({
        companyId: company.id,
        username,
        passwordHash,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        email: data.email,
        phone: data.phone,
        role: "admin",
        isActive: true,
        kvkkConsentAt: now,
        kvkkConsentVersion: "1.0",
      }).returning();

      await tx.insert(companySubscriptionsTable).values({
        companyId: company.id,
        planId,
        billingCycle: "yearly",
        status: "active",
        startedAt: now,
        expiresAt: trialEndsAt,
        autoRenew: false,
        notes: "21-day trial — auto-seeded on registration",
      });

      const [vt] = await tx.insert(verificationTokensTable).values({
        companyId: company.id,
        userId: user.id,
        channel: data.verificationMethod,
        target: verifyTarget,
        codeHash: verifyCodeHash,
        expiresAt: verifyExpires,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      }).returning();

      return { company, user, verificationId: vt.id };
    });

    // Verification kodu gönder (best-effort, transaction dışı)
    await sendVerificationCode(data.verificationMethod, verifyTarget, verifyCode);

    // Oturumu aç
    req.session.user = {
      id: result.user.id,
      username: result.user.username,
      fullName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      isActive: result.user.isActive,
      companyId: result.company.id,
      accountType: "seller",
    };

    await audit({
      req,
      action: "REGISTER_BUSINESS_COMPLETED",
      entity: "company",
      entityId: result.company.id,
      details: { subdomain, email: data.email, verificationMethod: data.verificationMethod },
    });

    res.status(201).json({
      ok: true,
      companyId: result.company.id,
      userId: result.user.id,
      verificationId: result.verificationId,
      verificationMethod: data.verificationMethod,
      subdomain,
      trialEndsAt,
      redirect: "/dashboard?welcome=1",
      message: "Hesabınız oluşturuldu. 21 gün boyunca tüm özelliklere erişebilirsiniz.",
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json(Errors.conflict("Bu e-posta veya şirket adı zaten kullanımda"));
      return;
    }
    req.log?.error({ err: { message: err?.message } }, "register/business error");
    res.status(500).json(Errors.internal());
  }
});

/**
 * Public buyer (procurement) registration — Satınalmacı portalı için sade kayıt.
 * Trial yok; pkg_trade/monthly minimum plana bağlanır; accountType=purchasing.
 */
router.post("/register/buyer", async (req: Request, res: Response) => {
  try {
    if (!registerRateLimit(req)) {
      res.status(429).json(Errors.tooManyRequests("Çok fazla kayıt isteği. Lütfen biraz sonra tekrar deneyin."));
      return;
    }
    const v = validateRegisterInput(req.body);
    if (!v.ok) { res.status(400).json(Errors.badRequest(v.msg)); return; }
    const data = v.data;

    const [emailDup] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.email, data.email)).limit(1);
    if (emailDup) {
      res.status(409).json(Errors.conflict("Bu e-posta adresi zaten kayıtlı"));
      return;
    }

    const subdomain = await generateUniqueSubdomain(data.companyName);
    const planId = await findOrCreatePlanId("pkg_trade");
    if (!planId) {
      res.status(500).json(Errors.internal("Varsayılan plan tanımlı değil (pkg_trade bulunamadı)"));
      return;
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const now = new Date();
    const verifyCode = generateSixDigitCode();
    const verifyCodeHash = await bcrypt.hash(verifyCode, 10);
    const verifyTarget = data.verificationMethod === "sms" ? data.phone : data.email;
    const verifyExpires = new Date(now.getTime() + VERIFY_CODE_TTL_MIN * 60_000);

    const result = await db.transaction(async (tx) => {
      const [company] = await tx.insert(companiesTable).values({
        name: data.companyName,
        subdomain,
        planType: "active",
        accountType: "purchasing",
        city: data.city ?? null,
        district: data.district ?? null,
        verificationMethod: data.verificationMethod,
        primaryColor: "#2563eb",
        isActive: true,
      }).returning();

      const username = makeUsernameFromEmail(data.email);
      const [user] = await tx.insert(usersTable).values({
        companyId: company.id,
        username,
        passwordHash,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        email: data.email,
        phone: data.phone,
        role: "admin",
        isActive: true,
        kvkkConsentAt: now,
        kvkkConsentVersion: "1.0",
      }).returning();

      await tx.insert(companySubscriptionsTable).values({
        companyId: company.id,
        planId,
        billingCycle: "monthly",
        status: "active",
        startedAt: now,
        autoRenew: false,
        notes: "Buyer / procurement account — minimal plan",
      });

      const [vt] = await tx.insert(verificationTokensTable).values({
        companyId: company.id,
        userId: user.id,
        channel: data.verificationMethod,
        target: verifyTarget,
        codeHash: verifyCodeHash,
        expiresAt: verifyExpires,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      }).returning();

      return { company, user, verificationId: vt.id };
    });

    await sendVerificationCode(data.verificationMethod, verifyTarget, verifyCode);

    req.session.user = {
      id: result.user.id,
      username: result.user.username,
      fullName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      isActive: result.user.isActive,
      companyId: result.company.id,
      accountType: "purchasing",
    };

    await audit({
      req,
      action: "REGISTER_BUYER_COMPLETED",
      entity: "company",
      entityId: result.company.id,
      details: { subdomain, email: data.email, verificationMethod: data.verificationMethod },
    });

    res.status(201).json({
      ok: true,
      companyId: result.company.id,
      userId: result.user.id,
      verificationId: result.verificationId,
      verificationMethod: data.verificationMethod,
      subdomain,
      redirect: "/satinalma-merkezi?welcome=1",
      message: "Satınalmacı hesabınız oluşturuldu. Satınalma Merkezi'ne yönlendiriliyorsunuz.",
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json(Errors.conflict("Bu e-posta veya şirket adı zaten kullanımda"));
      return;
    }
    req.log?.error({ err: { message: err?.message } }, "register/buyer error");
    res.status(500).json(Errors.internal());
  }
});

/**
 * Yeni doğrulama kodu üret/yeniden gönder (oturum gerekli).
 * 60 sn cooldown koruması.
 */
router.post("/verify/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.session.user!;
    if (!u.companyId) { res.status(400).json(Errors.badRequest("Şirket bağlantısı yok")); return; }
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1);
    if (!company) { res.status(404).json(Errors.notFound("Şirket bulunamadı")); return; }

    const channel: "sms" | "email" = (req.body?.channel === "sms" || req.body?.channel === "email")
      ? req.body.channel
      : (company.verificationMethod ?? "email");
    const target = channel === "sms" ? (u.username ? "" : "") : (u.email || "");
    // SMS için target user.phone — session'da yok, DB'den al
    let actualTarget = target;
    if (channel === "sms") {
      const [usr] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, u.id)).limit(1);
      actualTarget = usr?.phone || "";
    }
    if (!actualTarget) {
      res.status(400).json(Errors.badRequest(`Doğrulama için ${channel === "sms" ? "telefon" : "e-posta"} kayıtlı değil`));
      return;
    }

    // Cooldown — son 60 sn içinde aynı kullanıcı için aynı kanaldan kod gönderilmiş mi?
    const cutoff = new Date(Date.now() - VERIFY_RESEND_COOLDOWN_SEC * 1000);
    const [recent] = await db.select({ id: verificationTokensTable.id })
      .from(verificationTokensTable)
      .where(and(
        eq(verificationTokensTable.userId, u.id),
        eq(verificationTokensTable.channel, channel),
        gt(verificationTokensTable.createdAt, cutoff),
      )).limit(1);
    if (recent) {
      res.status(429).json(Errors.tooManyRequests(`Yeni kod için ${VERIFY_RESEND_COOLDOWN_SEC} saniye bekleyin`));
      return;
    }

    // Eski açık kodları consume et
    await db.update(verificationTokensTable)
      .set({ consumed: true })
      .where(and(
        eq(verificationTokensTable.userId, u.id),
        eq(verificationTokensTable.channel, channel),
        eq(verificationTokensTable.consumed, false),
      ));

    const code = generateSixDigitCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + VERIFY_CODE_TTL_MIN * 60_000);

    const [vt] = await db.insert(verificationTokensTable).values({
      companyId: u.companyId,
      userId: u.id,
      channel,
      target: actualTarget,
      codeHash,
      expiresAt,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    }).returning();

    await sendVerificationCode(channel, actualTarget, code);
    await audit({ req, action: "VERIFY_CODE_SENT", entity: "user", entityId: u.id, details: { channel } });

    res.json({ ok: true, verificationId: vt.id, channel, ttlMinutes: VERIFY_CODE_TTL_MIN });
  } catch (err: any) {
    req.log?.error({ err: { message: err?.message } }, "verify/send error");
    res.status(500).json(Errors.internal());
  }
});

/**
 * Doğrulama kodu kontrolü — başarılıysa companies.email_verified_at veya phone_verified_at set.
 */
router.post("/verify/check", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.session.user!;
    if (!u.companyId) { res.status(400).json(Errors.badRequest("Şirket bağlantısı yok")); return; }
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) { res.status(400).json(Errors.badRequest("6 haneli kodu girin")); return; }

    // En son aktif kodu al
    const [record] = await db.select().from(verificationTokensTable)
      .where(and(
        eq(verificationTokensTable.userId, u.id),
        eq(verificationTokensTable.consumed, false),
        gt(verificationTokensTable.expiresAt, new Date()),
      ))
      .orderBy(sql`${verificationTokensTable.createdAt} DESC`)
      .limit(1);

    if (!record) {
      res.status(400).json(Errors.badRequest("Doğrulama kodu bulunamadı veya süresi geçti. Lütfen yeni bir kod isteyin."));
      return;
    }
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      res.status(429).json(Errors.tooManyRequests("Çok fazla hatalı deneme. Lütfen yeni bir kod isteyin."));
      return;
    }

    const ok = await bcrypt.compare(code, record.codeHash);
    if (!ok) {
      await db.update(verificationTokensTable)
        .set({ attempts: record.attempts + 1 })
        .where(eq(verificationTokensTable.id, record.id));
      res.status(400).json(Errors.badRequest("Doğrulama kodu hatalı"));
      return;
    }

    // Başarılı — token consumed + companies.*_verified_at set
    await db.transaction(async (tx) => {
      await tx.update(verificationTokensTable)
        .set({ consumed: true, attempts: record.attempts + 1 })
        .where(eq(verificationTokensTable.id, record.id));

      const patch = record.channel === "email"
        ? { emailVerifiedAt: new Date() }
        : { phoneVerifiedAt: new Date() };
      await tx.update(companiesTable).set(patch as any).where(eq(companiesTable.id, u.companyId!));
    });

    await audit({ req, action: "VERIFY_CODE_CONFIRMED", entity: "user", entityId: u.id, details: { channel: record.channel } });
    res.json({ ok: true, channel: record.channel, message: "Hesabınız doğrulandı." });
  } catch (err: any) {
    req.log?.error({ err: { message: err?.message } }, "verify/check error");
    res.status(500).json(Errors.internal());
  }
});

// Mevcut tenant bilgisini döndür (auth olmadan, login sayfası için)
router.get("/tenant", (req: Request, res: Response) => {
  const { company } = req;
  res.json({
    id: company.id,
    name: company.name,
    subdomain: company.subdomain,
    primaryColor: company.primaryColor,
    logoUrl: company.logoUrl,
  });
});

export default router;
