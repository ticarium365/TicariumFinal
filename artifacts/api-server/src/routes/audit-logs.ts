import { Router, type IRouter, type Request, type Response } from "express";
import { db, auditLogsTable, companiesTable } from "@workspace/db";
import { eq, desc, and, gte, lte, ilike, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
  const offset = parseInt(String(req.query.offset ?? "0"));
  const action = req.query.action as string | undefined;
  const username = req.query.username as string | undefined;
  const companyId = req.query.companyId ? parseInt(String(req.query.companyId)) : undefined;
  const fromDate = req.query.from as string | undefined;
  const toDate = req.query.to as string | undefined;

  const conds: any[] = [];
  if (action) conds.push(eq(auditLogsTable.action, action));
  if (username) conds.push(ilike(auditLogsTable.username, `%${username}%`));
  if (companyId) conds.push(eq(auditLogsTable.companyId, companyId));
  if (fromDate) conds.push(gte(auditLogsTable.createdAt, new Date(fromDate)));
  if (toDate) conds.push(lte(auditLogsTable.createdAt, new Date(toDate)));

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db.select({
    id: auditLogsTable.id,
    companyId: auditLogsTable.companyId,
    companyName: companiesTable.name,
    userId: auditLogsTable.userId,
    username: auditLogsTable.username,
    action: auditLogsTable.action,
    entity: auditLogsTable.entity,
    entityId: auditLogsTable.entityId,
    details: auditLogsTable.details,
    ipAddress: auditLogsTable.ipAddress,
    createdAt: auditLogsTable.createdAt,
  })
    .from(auditLogsTable)
    .leftJoin(companiesTable, eq(companiesTable.id, auditLogsTable.companyId))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const totalRow = await db.select({ c: sql<number>`count(*)::int` }).from(auditLogsTable).where(where);
  res.json({ items: rows, total: totalRow[0]?.c ?? 0, limit, offset });
});

router.get("/actions", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`SELECT DISTINCT action FROM audit_logs ORDER BY action`);
  res.json((rows as any).rows.map((r: any) => r.action));
});

router.get("/stats", async (req: Request, res: Response) => {
  const days = Math.min(parseInt(String(req.query.days ?? "7")), 90);
  const rows = await db.execute(sql`
    SELECT date_trunc('day', created_at)::date AS day, action, count(*)::int AS count
    FROM audit_logs
    WHERE created_at > now() - (${days}::int || ' days')::interval
    GROUP BY day, action
    ORDER BY day DESC, count DESC
  `);
  res.json((rows as any).rows);
});

export default router;
