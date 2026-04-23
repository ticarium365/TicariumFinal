export type ResolvedStorageDriver = "r2" | "replit";

/**
 * STORAGE_DRIVER=r2 | replit
 * Belirtilmemişse: tüm R2 env doluysa r2, aksi halde replit (mevcut GCS/sidecar).
 */
export function resolveStorageDriver(): ResolvedStorageDriver {
  const explicit = (process.env.STORAGE_DRIVER || "").trim().toLowerCase();
  if (explicit === "replit") return "replit";
  if (explicit === "r2") return "r2";
  const r2Ready =
    Boolean(process.env.R2_ACCOUNT_ID) &&
    Boolean(process.env.R2_ACCESS_KEY_ID) &&
    Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
    Boolean(process.env.R2_BUCKET);
  if (r2Ready) return "r2";
  return "replit";
}

export function isR2Storage(): boolean {
  return resolveStorageDriver() === "r2";
}
