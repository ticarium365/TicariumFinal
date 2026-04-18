import { db, featureFlagsRuntimeTable } from "@workspace/db";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import crypto from "node:crypto";

interface RuntimeFlag {
  enabled: boolean;
  rolloutPct: number;
}

const cache = new Map<string, { value: RuntimeFlag | null; expires: number }>();
const TTL_MS = 30_000;

function cacheKey(key: string, companyId: number | null) {
  return `${key}::${companyId ?? "global"}`;
}

export function invalidateRuntimeFlagCache() {
  cache.clear();
}

async function loadFromDb(key: string, companyId: number): Promise<RuntimeFlag | null> {
  const now = new Date();
  const [companyFlag] = await db.select().from(featureFlagsRuntimeTable).where(and(
    eq(featureFlagsRuntimeTable.key, key),
    eq(featureFlagsRuntimeTable.companyId, companyId),
    or(isNull(featureFlagsRuntimeTable.expiresAt), gt(featureFlagsRuntimeTable.expiresAt, now))!,
  )).limit(1);
  if (companyFlag) return { enabled: companyFlag.enabled, rolloutPct: companyFlag.rolloutPct };

  const [globalFlag] = await db.select().from(featureFlagsRuntimeTable).where(and(
    eq(featureFlagsRuntimeTable.key, key),
    isNull(featureFlagsRuntimeTable.companyId),
    or(isNull(featureFlagsRuntimeTable.expiresAt), gt(featureFlagsRuntimeTable.expiresAt, now))!,
  )).limit(1);
  if (globalFlag) return { enabled: globalFlag.enabled, rolloutPct: globalFlag.rolloutPct };

  return null;
}

export async function isRuntimeFlagEnabled(key: string, companyId: number): Promise<boolean | null> {
  const ck = cacheKey(key, companyId);
  const cached = cache.get(ck);
  let flag: RuntimeFlag | null;
  if (cached && cached.expires > Date.now()) {
    flag = cached.value;
  } else {
    flag = await loadFromDb(key, companyId);
    cache.set(ck, { value: flag, expires: Date.now() + TTL_MS });
  }
  if (!flag) return null;
  if (!flag.enabled) return false;
  if (flag.rolloutPct >= 100) return true;
  if (flag.rolloutPct <= 0) return false;
  const hash = crypto.createHash("sha1").update(`${key}:${companyId}`).digest();
  const bucket = hash.readUInt8(0) % 100;
  return bucket < flag.rolloutPct;
}

export async function listRuntimeFlags() {
  return db.select().from(featureFlagsRuntimeTable);
}

export async function upsertRuntimeFlag(input: {
  key: string;
  companyId: number | null;
  enabled: boolean;
  rolloutPct?: number;
  description?: string | null;
  expiresAt?: Date | null;
}) {
  const existing = await db.select().from(featureFlagsRuntimeTable).where(and(
    eq(featureFlagsRuntimeTable.key, input.key),
    input.companyId === null
      ? isNull(featureFlagsRuntimeTable.companyId)
      : eq(featureFlagsRuntimeTable.companyId, input.companyId),
  )).limit(1);
  if (existing[0]) {
    await db.update(featureFlagsRuntimeTable)
      .set({
        enabled: input.enabled,
        rolloutPct: input.rolloutPct ?? existing[0].rolloutPct,
        description: input.description ?? existing[0].description,
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(featureFlagsRuntimeTable.id, existing[0].id));
  } else {
    await db.insert(featureFlagsRuntimeTable).values({
      key: input.key,
      companyId: input.companyId,
      enabled: input.enabled,
      rolloutPct: input.rolloutPct ?? 100,
      description: input.description ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  }
  invalidateRuntimeFlagCache();
}

export async function deleteRuntimeFlag(id: number) {
  await db.delete(featureFlagsRuntimeTable).where(eq(featureFlagsRuntimeTable.id, id));
  invalidateRuntimeFlagCache();
}
