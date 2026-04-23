import type { AdapterHealthResult, IntegrationConnectionAdapter } from "./types.js";
import { getProviderForCompany as getEInvoiceProviderForCompany } from "../einvoice/factory.js";
import { getProviderForAccount as getMarketplaceProviderForAccount } from "../marketplace/factory.js";
import { getBillingProvider } from "../billing/iyzico.js";
import { db, channelAccountsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

/** Catalog entry → canlı adapter eşlemesi; anahtar yoksa null (bilinçli no-op). */
export function resolveConnectionAdapter(_catalogEntryId: string): IntegrationConnectionAdapter | null {
  // E‑Invoice
  if (_catalogEntryId === "einvoice_mock") return new EInvoiceCompanyAdapter("einvoice_mock");
  if (_catalogEntryId === "einvoice_parasut") return new EInvoiceCompanyAdapter("einvoice_parasut");

  // Marketplace (kanal hesabı gerekir) — catalog entryId, legacy ecommerce IDs ile eşleştirildi.
  if (_catalogEntryId === "ecommerce_trendyol") return new MarketplaceTopAccountAdapter("ecommerce_trendyol", "trendyol");
  if (_catalogEntryId === "ecommerce_hepsiburada") return new MarketplaceTopAccountAdapter("ecommerce_hepsiburada", "hepsiburada");
  if (_catalogEntryId === "ecommerce_n11") return new MarketplaceTopAccountAdapter("ecommerce_n11", "n11");

  // Payments
  if (_catalogEntryId === "payments_iyzico") return new PaymentsAdapter("payments_iyzico");
  if (_catalogEntryId === "payments_mock") return new PaymentsAdapter("payments_mock");

  return null;
}

export async function pingResolvedAdapter(entryId: string, ctx: { companyId: number }): Promise<AdapterHealthResult | null> {
  const a = resolveConnectionAdapter(entryId);
  if (!a) {
    return {
      ok: false,
      message: "Bu katalog girdisi için henüz bağlı adapter yok (altyapı hazır, anahtar bekleniyor).",
      mode: "unknown",
    };
  }
  return a.ping(ctx);
}

class EInvoiceCompanyAdapter implements IntegrationConnectionAdapter {
  constructor(public readonly catalogEntryId: string) {}
  async ping(ctx: { companyId: number }): Promise<AdapterHealthResult> {
    const { provider } = await getEInvoiceProviderForCompany(ctx.companyId);
    const r = await provider.healthCheck();
    // Catalog entryId spesifik: parasut bekleniyorsa, farklı provider seçiliyse bunu açık söyle.
    if (this.catalogEntryId === "einvoice_parasut" && provider.key !== "parasut") {
      return {
        ok: false,
        mode: "unknown",
        message: `E‑Invoice sağlayıcısı Paraşüt değil (aktif: ${provider.key}). Ayarlar → E‑Fatura’dan sağlayıcıyı değiştirin veya doğru kiracıda deneyin.`,
      };
    }
    return { ok: r.ok, message: r.message, mode: r.meta?.sandbox ? "sandbox" : "live" };
  }
}

class MarketplaceTopAccountAdapter implements IntegrationConnectionAdapter {
  constructor(
    public readonly catalogEntryId: string,
    private readonly providerKey: string,
  ) {}

  async ping(ctx: { companyId: number }): Promise<AdapterHealthResult> {
    const [account] = await db.select({ id: channelAccountsTable.id, sandbox: channelAccountsTable.sandbox })
      .from(channelAccountsTable)
      .where(and(
        eq(channelAccountsTable.companyId, ctx.companyId),
        eq(channelAccountsTable.isActive, true),
        eq(channelAccountsTable.provider, this.providerKey),
      ))
      .orderBy(desc(channelAccountsTable.createdAt))
      .limit(1);

    if (!account) {
      return {
        ok: false,
        mode: "unknown",
        message: `Bu sağlayıcı için aktif kanal hesabı bulunamadı (${this.providerKey}). Pazaryeri → Mağazalar’dan hesap ekleyin ve tekrar deneyin.`,
      };
    }

    const { provider } = await getMarketplaceProviderForAccount(ctx.companyId, account.id);
    const r = await provider.healthCheck();
    return { ok: r.ok, message: r.message, mode: account.sandbox ? "sandbox" : "live" };
  }
}

class PaymentsAdapter implements IntegrationConnectionAdapter {
  constructor(public readonly catalogEntryId: string) {}
  async ping(_ctx: { companyId: number }): Promise<AdapterHealthResult> {
    const p = getBillingProvider();
    const r = await p.healthCheck();
    // EntryId hedeflemesi: iyzico istendi ama mock seçiliyse uyar.
    if (this.catalogEntryId === "payments_iyzico" && p.name !== "iyzico") {
      return { ok: false, mode: r.mode, message: `Aktif ödeme sağlayıcısı Iyzico değil (aktif: ${p.name}).` };
    }
    if (this.catalogEntryId === "payments_mock" && p.name !== "mock") {
      return { ok: true, mode: r.mode, message: `Mock seçili değil (aktif: ${p.name}).` };
    }
    return { ok: r.ok, mode: r.mode, message: r.message };
  }
}
