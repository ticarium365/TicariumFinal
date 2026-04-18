import { db, smsMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const NETGSM_BASE = "https://api.netgsm.com.tr/sms/send/get";

interface NetgsmConfig {
  username: string;
  password: string;
  msgheader: string;
}

function getConfig(): NetgsmConfig | null {
  const username = process.env.NETGSM_USERNAME;
  const password = process.env.NETGSM_PASSWORD;
  const msgheader = process.env.NETGSM_HEADER;
  if (!username || !password || !msgheader) return null;
  return { username, password, msgheader };
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("+90")) p = p.slice(3);
  else if (p.startsWith("90") && p.length === 12) p = p.slice(2);
  else if (p.startsWith("0") && p.length === 11) p = p.slice(1);
  return p;
}

export async function sendSms(opts: {
  companyId: number;
  toPhone: string;
  body: string;
}): Promise<{ ok: boolean; messageId?: number; externalId?: string; error?: string }> {
  const cfg = getConfig();
  const phone = normalizePhone(opts.toPhone);
  if (phone.length !== 10) {
    return { ok: false, error: "Geçersiz telefon numarası" };
  }

  const [msg] = await db.insert(smsMessagesTable).values({
    companyId: opts.companyId,
    toPhone: phone,
    body: opts.body,
    provider: "netgsm",
    status: cfg ? "queued" : "no_provider",
  }).returning();

  if (!cfg) {
    logger.warn({ messageId: msg.id }, "netgsm_credentials_missing");
    return { ok: false, messageId: msg.id, error: "NetGSM credentials yapılandırılmamış" };
  }

  try {
    const url = new URL(NETGSM_BASE);
    url.searchParams.set("usercode", cfg.username);
    url.searchParams.set("password", cfg.password);
    url.searchParams.set("gsmno", phone);
    url.searchParams.set("message", opts.body);
    url.searchParams.set("msgheader", cfg.msgheader);
    url.searchParams.set("filter", "0");

    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    const code = text.split(" ")[0];
    const ok = code === "00" || code === "01" || code === "02";

    await db.update(smsMessagesTable).set({
      status: ok ? "sent" : "failed",
      externalId: ok ? text.split(" ")[1] || null : null,
      errorMessage: ok ? null : `NetGSM kod: ${text}`,
      sentAt: ok ? new Date() : null,
    }).where(eq(smsMessagesTable.id, msg.id));

    return ok
      ? { ok: true, messageId: msg.id, externalId: text.split(" ")[1] }
      : { ok: false, messageId: msg.id, error: `NetGSM kod: ${text}` };
  } catch (err: any) {
    await db.update(smsMessagesTable).set({
      status: "failed",
      errorMessage: err?.message || "send_failed",
    }).where(eq(smsMessagesTable.id, msg.id));
    return { ok: false, messageId: msg.id, error: err?.message || "send_failed" };
  }
}
