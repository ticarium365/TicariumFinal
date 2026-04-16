import { Router, Request, Response } from "express";
import { db, companySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    let [settings] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
    if (!settings) {
      [settings] = await db.insert(companySettingsTable).values({
        companyId: cid,
        companyName: req.company.name,
      }).returning();
    }
    res.json(settings);
  } catch (err) {
    req.log?.error({ err }, "Get settings error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { companyName, iban, bankName, accountHolder, phone, email, address } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (companyName !== undefined) updateData.companyName = companyName;
    if (iban !== undefined) updateData.iban = iban;
    if (bankName !== undefined) updateData.bankName = bankName;
    if (accountHolder !== undefined) updateData.accountHolder = accountHolder;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;

    let [settings] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, cid));
    if (!settings) {
      [settings] = await db.insert(companySettingsTable).values({
        companyId: cid,
        companyName: companyName ?? req.company.name,
        ...updateData,
      }).returning();
    } else {
      [settings] = await db.update(companySettingsTable)
        .set(updateData)
        .where(eq(companySettingsTable.id, settings.id))
        .returning();
    }

    res.json(settings);
  } catch (err) {
    req.log?.error({ err }, "Update settings error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
