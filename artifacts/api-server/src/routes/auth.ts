import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

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

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = req.session.user!;
  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    companyId: user.companyId,
    createdAt: new Date(),
  });
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
