import { Router } from "express";
import crypto from "node:crypto";
import {
  db,
  accountantInvitesTable,
  accountantAccessTable,
  periodClosesTable,
  usersTable,
  companiesTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);
const requireAdmin = requireRole(["admin", "super_admin"]);

// ─────────────────────────────────────────────────────────────────────────────
// INVITES — admin invites a mali müşavir; muhasebeci kabul eder
// ─────────────────────────────────────────────────────────────────────────────
router.get("/invites", requireAdmin, async (req, res) => {
  const rows = await db.select().from(accountantInvitesTable)
    .where(eq(accountantInvitesTable.companyId, req.companyId!))
    .orderBy(desc(accountantInvitesTable.createdAt));
  res.json(rows);
});

router.post("/invites", requireAdmin, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { email, fullName } = req.body || {};
  if (!email) return res.status(400).json({ error: "email zorunlu" });

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 gün

  const [row] = await db.insert(accountantInvitesTable).values({
    companyId, email: String(email).toLowerCase().trim(),
    fullName: fullName || null, token, invitedBy: userId, expiresAt,
  }).returning();
  res.status(201).json(row);
});

router.post("/invites/:id/revoke", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.update(accountantInvitesTable).set({ status: "revoked" })
    .where(and(eq(accountantInvitesTable.id, id), eq(accountantInvitesTable.companyId, req.companyId!)));
  res.json({ ok: true });
});

// Davet kabulü — token ile login olmuş kullanıcının erişim hakkı verilir
// Atomic single-use: conditional UPDATE pending→accepted ile race koşulları engellenir
router.post("/invites/accept", async (req, res) => {
  const userId = req.session.user!.id;
  const userEmail = (req.session.user as any)?.email;
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token zorunlu" });

  try {
    const result = await db.transaction(async (tx) => {
      // Önce invite'ı oku — email kontrolü ve expire için
      const [peek] = await tx.select().from(accountantInvitesTable)
        .where(eq(accountantInvitesTable.token, String(token))).limit(1);
      if (!peek) throw new Error("invalid_token");
      if (peek.status !== "pending") throw new Error(`invite_${peek.status}`);
      if (new Date(peek.expiresAt) < new Date()) {
        await tx.update(accountantInvitesTable).set({ status: "expired" })
          .where(eq(accountantInvitesTable.id, peek.id));
        throw new Error("expired");
      }
      // Email binding — davet edilen e-posta giriş yapan kullanıcıyla eşleşmeli
      if (userEmail && peek.email && peek.email.toLowerCase() !== String(userEmail).toLowerCase()) {
        throw new Error("email_mismatch");
      }
      // Atomic claim: status pending iken UPDATE — RETURNING boşsa başkası kapmıştır
      const claimed = await tx.update(accountantInvitesTable).set({
        status: "accepted", acceptedUserId: userId, acceptedAt: new Date(),
      }).where(and(
        eq(accountantInvitesTable.id, peek.id),
        eq(accountantInvitesTable.status, "pending"),
      )).returning();
      if (claimed.length === 0) throw new Error("already_accepted");
      // Erişim hakkını ver
      await tx.insert(accountantAccessTable).values({
        companyId: peek.companyId, userId, scope: "read",
      }).onConflictDoNothing();
      return { companyId: peek.companyId };
    });
    res.json({ ok: true, companyId: result.companyId });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "fail" });
  }
});

// Bana atanmış firmalar (muhasebecinin paneli)
router.get("/my-access", async (req, res) => {
  const userId = req.session.user!.id;
  const rows = await db.select({
    accessId: accountantAccessTable.id,
    companyId: accountantAccessTable.companyId,
    companyName: companiesTable.name,
    scope: accountantAccessTable.scope,
    createdAt: accountantAccessTable.createdAt,
    isActive: accountantAccessTable.isActive,
  }).from(accountantAccessTable)
    .leftJoin(companiesTable, eq(companiesTable.id, accountantAccessTable.companyId))
    .where(and(eq(accountantAccessTable.userId, userId), eq(accountantAccessTable.isActive, true)));
  res.json(rows);
});

router.delete("/access/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.update(accountantAccessTable).set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(accountantAccessTable.id, id), eq(accountantAccessTable.companyId, req.companyId!)));
  res.json({ ok: true });
});

router.get("/access", requireAdmin, async (req, res) => {
  const rows = await db.select({
    id: accountantAccessTable.id,
    userId: accountantAccessTable.userId,
    fullName: usersTable.fullName,
    username: usersTable.username,
    email: usersTable.email,
    scope: accountantAccessTable.scope,
    isActive: accountantAccessTable.isActive,
    createdAt: accountantAccessTable.createdAt,
  }).from(accountantAccessTable)
    .leftJoin(usersTable, eq(usersTable.id, accountantAccessTable.userId))
    .where(eq(accountantAccessTable.companyId, req.companyId!));
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD CLOSE — kapatılmış aya yeni kayıt eklenemez (frontend uyarısı için)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/period-closes", async (req, res) => {
  const rows = await db.select().from(periodClosesTable)
    .where(eq(periodClosesTable.companyId, req.companyId!))
    .orderBy(desc(periodClosesTable.period));
  res.json(rows);
});

router.post("/period-close", requireAdmin, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { period, note } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(String(period || ""))) {
    return res.status(400).json({ error: "period YYYY-MM formatında olmalı" });
  }
  const [row] = await db.insert(periodClosesTable).values({
    companyId, period, status: "closed", closedBy: userId, note: note || null,
  }).onConflictDoUpdate({
    target: [periodClosesTable.companyId, periodClosesTable.period],
    set: { status: "closed", closedBy: userId, closedAt: new Date(), reopenedAt: null, note: note || null },
  }).returning();
  res.json(row);
});

router.post("/period-reopen", requireAdmin, async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.session.user!.id;
  const { period } = req.body || {};
  const [row] = await db.update(periodClosesTable).set({
    status: "reopened", reopenedBy: userId, reopenedAt: new Date(),
  }).where(and(
    eq(periodClosesTable.companyId, companyId),
    eq(periodClosesTable.period, String(period)),
  )).returning();
  res.json(row || { ok: true });
});

// Hızlı check helper: period bu ay kapalı mı?
router.get("/period-status/:period", async (req, res) => {
  const [row] = await db.select().from(periodClosesTable)
    .where(and(
      eq(periodClosesTable.companyId, req.companyId!),
      eq(periodClosesTable.period, req.params.period),
    )).limit(1);
  res.json({ closed: !!row && row.status === "closed", row: row || null });
});

export default router;
