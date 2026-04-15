import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable);
    res.json(users);
  } catch (err) {
    req.log?.error({ err }, "List users error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, role } = req.body;
    if (!username || !password || !fullName || !role) {
      res.status(400).json({ error: "Bad Request", message: "Zorunlu alanlar eksik" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      username,
      passwordHash,
      fullName,
      email,
      role,
    }).returning({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Bu kullanıcı adı zaten kullanılıyor" });
      return;
    }
    req.log?.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const [user] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, id));
    if (!user) {
      res.status(404).json({ error: "Not Found", message: "Kullanıcı bulunamadı" });
      return;
    }
    res.json(user);
  } catch (err) {
    req.log?.error({ err }, "Get user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { fullName, email, role, isActive, password } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        email: usersTable.email,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      });
    if (!user) {
      res.status(404).json({ error: "Not Found", message: "Kullanıcı bulunamadı" });
      return;
    }
    res.json(user);
  } catch (err) {
    req.log?.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    if (req.session.user?.id === id) {
      res.status(400).json({ error: "Bad Request", message: "Kendi hesabınızı silemezsiniz" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ message: "Kullanıcı silindi" });
  } catch (err) {
    req.log?.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
