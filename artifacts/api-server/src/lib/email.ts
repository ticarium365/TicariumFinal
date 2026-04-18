import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

let transporter: Transporter | null = null;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.info("E-mail servisi yapılandırılmadı (SMTP_HOST/USER/PASS yok). Mail göndermek devre dışı.");
    return;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  logger.info({ host, port }, "E-mail servisi hazır");
}

export interface MailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

/**
 * Mail gönderir; SMTP yapılandırılmamışsa log atar ve sessizce başarılı sayar
 * (uygulama akışını bloke etmez). Hata gerçek SMTP hatası durumunda fırlar.
 */
export async function sendMail(params: MailParams): Promise<{ sent: boolean; reason?: string }> {
  init();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@ticarium365.com";

  if (!transporter) {
    logger.warn({ to: params.to, subject: params.subject }, "E-mail atlandı (SMTP yok)");
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
    logger.info({ to: params.to, subject: params.subject, messageId: info.messageId }, "mail_sent");
    return { sent: true };
  } catch (err: any) {
    // Mail hatası asla ana akışı bloke etmemeli — sadece loglayıp false dön
    logger.error({ err: { message: err.message, code: err.code }, to: params.to, subject: params.subject }, "mail_failed");
    return { sent: false, reason: "smtp_error" };
  }
}

/**
 * Strict variant — hata fırlatır. Yalnızca caller hatayı bilinçli olarak yakalayacaksa kullanın.
 */
export async function sendMailStrict(params: MailParams): Promise<void> {
  const r = await sendMail(params);
  if (!r.sent) throw new Error(`mail_failed: ${r.reason}`);
}

export function isMailEnabled(): boolean {
  init();
  return transporter !== null;
}
