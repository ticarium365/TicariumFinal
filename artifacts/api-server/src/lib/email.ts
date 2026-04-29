import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

/**
 * Giden e-posta sağlayıcı seçimi (geri uyumlu):
 * - `RESEND_API_KEY` tanımlıysa → Resend HTTP API (önerilen düşük maliyet / stabil).
 * - Aksi halde `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` → Nodemailer SMTP.
 *
 * Hiçbiri yoksa gönderim yapılmaz; **uygulama çökmez**, `sendMail` `{ sent: false }` döner.
 */

let transporter: Transporter | null = null;
let smtpInitialized = false;

export type MailParams = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

function hasResend(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function hasSmtp(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(host && user && pass);
}

/** Resend + SMTP için ortak gönderen (domain doğrulaması Resend’de zorunlu). */
export function resolveMailFromAddress(): string {
  const from =
    (process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || "")
      .trim();
  if (from) return from;
  return "no-reply@ticarium365.com";
}

function initSmtp(): void {
  if (smtpInitialized) return;
  smtpInitialized = true;
  if (!hasSmtp()) {
    if (!hasResend()) {
      logger.info(
        "E-posta: RESEND_API_KEY veya SMTP_HOST/USER/PASS yok — giden posta kapalı (graceful).",
      );
    }
    return;
  }
  const host = process.env.SMTP_HOST!.trim();
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  logger.info({ host, port }, "E-posta: SMTP (Nodemailer) hazır");
}

async function sendViaResend(params: MailParams): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY!.trim();
  const from = resolveMailFromAddress();
  if (!from.includes("@") || from === "no-reply@ticarium365.com") {
    logger.warn(
      "RESEND_API_KEY tanımlı ama geçerli RESEND_FROM / SMTP_FROM / MAIL_FROM yok — gönderim atlandı (domain doğrulayın).",
    );
    return { sent: false, reason: "resend_from_missing" };
  }
  try {
    const body: Record<string, unknown> = {
      from,
      to: [params.to],
      subject: params.subject,
    };
    if (params.text) body.text = params.text;
    if (params.html) body.html = params.html;
    if (params.replyTo) body.reply_to = params.replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      logger.error(
        { status: res.status, body: json, to: params.to, subject: params.subject },
        "resend_mail_failed",
      );
      return { sent: false, reason: "resend_api_error" };
    }
    logger.info(
      { to: params.to, subject: params.subject, provider: "resend", id: json?.id },
      "mail_sent",
    );
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, to: params.to, subject: params.subject }, "resend_mail_exception");
    return { sent: false, reason: "resend_error" };
  }
}

async function sendViaSmtp(params: MailParams): Promise<{ sent: boolean; reason?: string }> {
  initSmtp();
  const from = resolveMailFromAddress();
  if (!transporter) {
    logger.warn({ to: params.to, subject: params.subject }, "E-mail atlandı (SMTP yapılandırılmadı)");
    return { sent: false, reason: "smtp_not_configured" };
  }
  try {
    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
    });
    logger.info(
      { to: params.to, subject: params.subject, provider: "smtp", messageId: info.messageId },
      "mail_sent",
    );
    return { sent: true };
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    logger.error(
      { err: { message: e?.message, code: e?.code }, to: params.to, subject: params.subject },
      "mail_failed",
    );
    return { sent: false, reason: "smtp_error" };
  }
}

/**
 * Öncelik: Resend → SMTP. Yapılandırma yoksa log + `{ sent: false }` (throw yok).
 */
export async function sendMail(params: MailParams): Promise<{ sent: boolean; reason?: string }> {
  if (hasResend()) return sendViaResend(params);
  return sendViaSmtp(params);
}

export async function sendMailStrict(params: MailParams): Promise<void> {
  const r = await sendMail(params);
  if (!r.sent) throw new Error(`mail_failed: ${r.reason}`);
}

/** Resend (geçerli from ile) veya tam SMTP seti. */
export function isMailEnabled(): boolean {
  if (hasResend()) {
    const from = (process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || "").trim();
    return Boolean(from && from.includes("@"));
  }
  initSmtp();
  return transporter !== null;
}

/** Operasyon / health: `resend` | `smtp` | `none` */
export function getMailProviderKind(): "resend" | "smtp" | "none" {
  if (hasResend()) return "resend";
  if (hasSmtp()) return "smtp";
  return "none";
}
