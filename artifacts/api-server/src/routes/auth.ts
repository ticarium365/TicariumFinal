import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Bad Request", message: "Kullanıcı adı ve şifre gerekli" });
      return;
    }

    const companyId = req.companyId;

    // Super admin: company_id olmadan giriş yapabilir
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        eq(usersTable.username, username)
      );

    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Kullanıcı adı veya şifre hatalı" });
      return;
    }

    // Super admin her şirketten giriş yapabilir; diğerleri kendi şirketinden
    if (user.role !== "super_admin" && user.companyId !== companyId) {
      res.status(401).json({ error: "Unauthorized", message: "Kullanıcı adı veya şifre hatalı" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ error: "Unauthorized", message: "Hesabınız devre dışı bırakılmış" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Unauthorized", message: "Kullanıcı adı veya şifre hatalı" });
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
    res.status(500).json({ error: "Internal Server Error", message: "Sunucu hatası" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
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
