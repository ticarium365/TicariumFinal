import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "";
if (!SECRET) {
  throw new Error("SESSION_SECRET zorunlu (secret-crypto)");
}
const KEY = scryptSync(SECRET, "ticarium365-secret-v1", 32);
const PREFIX = "enc:v1:";

export function encryptString(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptString(value: string): string {
  if (!value || typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}

const SENSITIVE_RE = /password|secret|token|apikey|api_key|accesskey|access_key|secretkey|secret_key|clientsecret|client_secret|privatekey|private_key/i;

export function encryptSecrets<T = any>(obj: T | null | undefined, parentKeySensitive = false): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map((v) => {
      if (typeof v === "string" && parentKeySensitive && v.length > 0) return encryptString(v);
      if (v && typeof v === "object") return encryptSecrets(v, parentKeySensitive);
      return v;
    }) as any;
  }
  if (typeof obj !== "object") return obj as T;
  const out: any = { ...(obj as any) };
  for (const [k, v] of Object.entries(obj as any)) {
    const sensitive = SENSITIVE_RE.test(k) || parentKeySensitive;
    if (typeof v === "string" && sensitive && v.length > 0) {
      out[k] = encryptString(v);
    } else if (v && typeof v === "object") {
      out[k] = encryptSecrets(v, sensitive);
    }
  }
  return out as T;
}

export function decryptSecrets<T = any>(obj: T | null | undefined): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map((v) => {
      if (typeof v === "string" && v.startsWith(PREFIX)) return decryptString(v);
      if (v && typeof v === "object") return decryptSecrets(v);
      return v;
    }) as any;
  }
  if (typeof obj !== "object") return obj as T;
  const out: any = { ...(obj as any) };
  for (const [k, v] of Object.entries(obj as any)) {
    if (typeof v === "string" && v.startsWith(PREFIX)) {
      out[k] = decryptString(v);
    } else if (v && typeof v === "object") {
      out[k] = decryptSecrets(v);
    }
  }
  return out as T;
}

export function isSensitiveKey(k: string): boolean {
  return SENSITIVE_RE.test(k);
}
