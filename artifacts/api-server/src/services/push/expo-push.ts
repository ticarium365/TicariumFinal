import { db, expoPushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function registerPushToken(opts: {
  userId: number;
  companyId: number;
  token: string;
  deviceInfo?: any;
}) {
  if (!opts.token.startsWith("ExponentPushToken[") && !opts.token.startsWith("ExpoPushToken[")) {
    throw new Error("Invalid Expo push token format");
  }
  const [existing] = await db.select().from(expoPushTokensTable).where(eq(expoPushTokensTable.token, opts.token)).limit(1);
  if (existing) {
    await db.update(expoPushTokensTable).set({
      userId: opts.userId,
      companyId: opts.companyId,
      isActive: "true",
      lastUsedAt: new Date(),
      deviceInfo: opts.deviceInfo ?? existing.deviceInfo,
    }).where(eq(expoPushTokensTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(expoPushTokensTable).values({
    userId: opts.userId,
    companyId: opts.companyId,
    token: opts.token,
    deviceInfo: opts.deviceInfo ?? null,
    isActive: "true",
  }).returning({ id: expoPushTokensTable.id });
  return created.id;
}

export async function sendExpoPush(opts: {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<{ ok: boolean; sent: number; error?: string }> {
  const tokens = await db.select().from(expoPushTokensTable).where(and(
    eq(expoPushTokensTable.userId, opts.userId),
    eq(expoPushTokensTable.isActive, "true"),
  ));
  if (tokens.length === 0) return { ok: false, sent: 0, error: "no_tokens" };

  const messages = tokens.map(t => ({
    to: t.token,
    title: opts.title,
    body: opts.body,
    data: opts.data ?? {},
    sound: "default",
  }));

  try {
    const r = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, sent: 0, error: `Expo HTTP ${r.status}: ${text.slice(0, 200)}` };
    }
    const json = await r.json();
    const errors = (json?.data || []).filter((d: any) => d.status === "error");
    if (errors.length > 0) {
      for (const err of errors) {
        if (err.details?.error === "DeviceNotRegistered") {
          const idx = (json.data as any[]).indexOf(err);
          const badToken = tokens[idx]?.token;
          if (badToken) {
            await db.update(expoPushTokensTable).set({ isActive: "false" })
              .where(eq(expoPushTokensTable.token, badToken));
          }
        }
      }
    }
    return { ok: true, sent: tokens.length - errors.length };
  } catch (err: any) {
    logger.error({ err }, "expo_push_failed");
    return { ok: false, sent: 0, error: err?.message || "send_failed" };
  }
}
