import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { audit } from "../lib/audit.js";

const router = Router();

const safeUserFields = {
  id: usersTable.id,
  username: usersTable.username,
  fullName: usersTable.fullName,
  email: usersTable.email,
  role: usersTable.role,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const users = await db.select(safeUserFields).from(usersTable)
      .where(eq(usersTable.companyId, cid));
    res.json(users);
  } catch (err) {
    req.log?.error({ err }, "List users error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { username, password, fullName, email, role } = req.body;
    if (!username || !password || !fullName || !role) {
      res.status(400).json({ error: "Bad Request", message: "Zorunlu alanlar eksik" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      companyId: cid,
      username,
      passwordHash,
      fullName,
      email,
      role,
    }).returning(safeUserFields);
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Bu kullanıcı adı bu şirkette zaten kullanılıyor" });
      return;
    }
    req.log?.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    const [user] = await db.select(safeUserFields).from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.companyId, cid)));
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
    const cid = req.companyId;
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
      .where(and(eq(usersTable.id, id), eq(usersTable.companyId, cid)))
      .returning(safeUserFields);
    if (!user) {
      res.status(404).json({ error: "Not Found", message: "Kullanıcı bulunamadı" });
      return;
    }
    await audit({ req, action: "USER_UPDATE", entity: "user", entityId: user.id,
      details: { username: user.username, role: user.role, changes: Object.keys(updateData), passwordChanged: !!password } });
    res.json(user);
  } catch (err) {
    req.log?.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = parseInt(req.params.id!);
    if (req.session.user?.id === id) {
      res.status(400).json({ error: "Bad Request", message: "Kendi hesabınızı silemezsiniz" });
      return;
    }
    const [deleted] = await db.delete(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.companyId, cid)))
      .returning({ id: usersTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Not Found", message: "Kullanıcı bulunamadı" });
      return;
    }
    await audit({ req, action: "USER_DELETE", entity: "user", entityId: deleted.id });
    res.json({ message: "Kullanıcı silindi" });
  } catch (err) {
    req.log?.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
