import { Router, type Request, type Response } from "express";
import { db, catalogSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.get("/catalog-settings", requireAuth, async (req: Request, res: Response) => {
  const cid = req.companyId;
  try {
    const [settings] = await db.select().from(catalogSettingsTable)
      .where(eq(catalogSettingsTable.companyId, cid));
    if (!settings) {
      const [created] = await db.insert(catalogSettingsTable)
        .values({ companyId: cid })
        .returning();
      return void res.json(created);
    }
    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.put("/catalog-settings", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  const cid = req.companyId;
  const { isEnabled, title, description, themeColor, showPrices, allowOrders } = req.body as {
    isEnabled?: boolean;
    title?: string;
    description?: string;
    themeColor?: string;
    showPrices?: boolean;
    allowOrders?: boolean;
  };
  try {
    const [existing] = await db.select({ id: catalogSettingsTable.id })
      .from(catalogSettingsTable).where(eq(catalogSettingsTable.companyId, cid));

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (themeColor !== undefined) data.themeColor = themeColor;
    if (showPrices !== undefined) data.showPrices = showPrices;
    if (allowOrders !== undefined) data.allowOrders = allowOrders;

    if (existing) {
      const [updated] = await db.update(catalogSettingsTable)
        .set(data as any)
        .where(eq(catalogSettingsTable.companyId, cid))
        .returning();
      return void res.json(updated);
    }
    const [created] = await db.insert(catalogSettingsTable)
      .values({ companyId: cid, ...(data as any) })
      .returning();
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

export default router;
