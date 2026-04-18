import { db, einvoiceSettingsTable, einvoiceEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { EInvoiceProvider, EInvoiceProviderConfig } from "./types.js";
import { decryptSecrets } from "../../lib/secret-crypto.js";
import { MockEInvoiceProvider } from "./mock-provider.js";
import { ParasutEInvoiceProvider } from "./parasut-provider.js";
import {
  QnbEFinansProvider, ForibaProvider,
  LogoEFlowProvider, MikroProvider,
} from "./stub-providers.js";

export const PROVIDER_REGISTRY: Record<string, new (cfg: EInvoiceProviderConfig) => EInvoiceProvider> = {
  mock: MockEInvoiceProvider,
  parasut: ParasutEInvoiceProvider,
  qnb_efinans: QnbEFinansProvider,
  foriba: ForibaProvider,
  logo_eflow: LogoEFlowProvider,
  mikro: MikroProvider,
};

export const PROVIDER_META = [
  { key: "mock", label: "Mock (Sandbox)", category: "test", needs: [] },
  { key: "parasut", label: "Paraşüt", category: "saas", needs: ["clientId", "clientSecret", "username", "password", "companyId"] },
  { key: "qnb_efinans", label: "QNB eFinans", category: "integrator", needs: ["username", "password", "vkn"] },
  { key: "foriba", label: "Foriba (Sovos)", category: "integrator", needs: ["username", "password", "vkn"] },
  { key: "logo_eflow", label: "Logo e-Flow", category: "integrator", needs: ["apiKey", "username", "password"] },
  { key: "mikro", label: "Mikro e-Fatura", category: "integrator", needs: ["apiKey", "vkn"] },
];

export async function getProviderForCompany(companyId: number): Promise<{
  provider: EInvoiceProvider;
  settings: typeof einvoiceSettingsTable.$inferSelect;
}> {
  const [row] = await db.select().from(einvoiceSettingsTable).where(eq(einvoiceSettingsTable.companyId, companyId)).limit(1);
  let settings = row;
  if (!settings) {
    // Default mock + sandbox kayıt oluştur
    const [created] = await db.insert(einvoiceSettingsTable).values({
      companyId, provider: "mock", sandbox: true, enabled: false, config: {},
    }).returning();
    settings = created;
  }
  const Klass = PROVIDER_REGISTRY[settings.provider] || MockEInvoiceProvider;
  // Provider'a config geçerken hassas alanları decrypt et — DB'de hep şifreli durur
  const cfg: EInvoiceProviderConfig = {
    provider: settings.provider,
    sandbox: settings.sandbox,
    config: decryptSecrets(settings.config || {}),
  };
  return { provider: new Klass(cfg), settings };
}

export async function logEvent(opts: {
  companyId: number;
  provider: string;
  event: string;
  level?: "info" | "warn" | "error";
  message?: string | null;
  payload?: any;
  outboxId?: number | null;
  inboxId?: number | null;
}) {
  try {
    await db.insert(einvoiceEventsTable).values({
      companyId: opts.companyId,
      provider: opts.provider,
      event: opts.event,
      level: opts.level || "info",
      message: opts.message || null,
      payload: opts.payload || null,
      outboxId: opts.outboxId || null,
      inboxId: opts.inboxId || null,
    });
  } catch (e) {
    console.error("[einvoice/logEvent]", e);
  }
}
