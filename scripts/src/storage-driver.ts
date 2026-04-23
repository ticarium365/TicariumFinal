/** api-server `resolveStorageDriver` ile aynı mantık (scripts paketi api'ye bağlı değil) */
export function scriptsUseR2(): boolean {
  const d = (process.env.STORAGE_DRIVER || "").trim().toLowerCase();
  if (d === "replit") return false;
  if (d === "r2") return true;
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}
