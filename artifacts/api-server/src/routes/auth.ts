import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, companySettingsTable, passwordResetTokensTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { sendSms } from "../services/sms/netgsm-provider.js";

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

    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      companyId: user.role === "super_admin" ? (user.companyId ?? companyId) : companyId,
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
