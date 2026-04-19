import type { FeatureCode } from "@workspace/db/feature-codes";
import {
  ShoppingCart,
  History,
  UserCircle,
  FileText,
  Package,
  Award,
  Tag,
  PackagePlus,
  ClipboardList,
  ScanBarcode,
  Barcode,
  ShoppingBag,
  Truck,
  Upload,
  Wallet,
  Banknote,
  TrendingUp,
  PieChart,
  Calculator,
  DollarSign,
  Sparkles,
  Store,
  Radio,
  Network,
  ShoppingBasket,
  Trophy,
  Megaphone,
  BarChart3,
  CalendarCheck,
  Users,
  GitBranch,
  Factory,
  Settings,
  Target,
  Webhook,
  Bell,
  CreditCard,
  Inbox,
  PackageOpen,
  ShieldCheck,
  Building2,
  Wrench,
  Activity,
  ScanLine,
  Search,
} from "lucide-react";

export type NavItem = {
  /**
   * Stabil id — href değişse de menü tercihi ve testid korunur.
   * Opsiyonel; verilmezse `nav:${href}` türetilir. Önemli öğelere mutlaka manuel id atanmalı.
   */
  id?: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  /**
   * Paket özellik kodu — yoksa kilit göstergesi çıkar (içerik yine erişilebilir, FeatureGate yükseltme ekranı gösterir).
   * `FeatureCode` union'ı sayesinde tipo derleme zamanında yakalanır
   * (örn. `"loyalty.point"` yazmak compile error verir).
   */
  feature?: FeatureCode;
  /**
   * Sprint H — item-level accountType filtresi. Verilmezse her account tipinde görünür.
   * Örn: ["buyer","both"] → satıcı-yalnız kullanıcıdan gizlenir.
   */
  accountTypes?: Array<"buyer" | "seller" | "both">;
};

/** Stabil bir id döndür: item.id varsa onu, yoksa href'ten türetilen sabit string. */
export function navItemId(item: { id?: string; href: string }): string {
  return item.id ?? `nav:${item.href}`;
}

/** Test/UI için id'yi DOM-güvenli hale getir. */
export function navIdToTestSlug(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /**
   * Sprint H — accountType bazlı görünürlük.
   * Verilmezse her zaman görünür (varsayılan satıcı paneli davranışı).
   * Örn. ["buyer", "both"] → sadece alıcı yetkili kullanıcılarda.
   */
  accountTypes?: Array<"buyer" | "seller" | "both">;
};

// Sprint 83 — 6 ana grup (kullanıcı talebi: menüyü sadeleştir).
// Süper Admin yalnızca super_admin rolü için ayrı görünür.
// Sprint 86 — layout.tsx ve command-palette.tsx tarafından paylaşılıyor.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "satis",
    label: "Satış",
    icon: ShoppingCart,
    items: [
      { href: "/sales", label: "Satış Ekranı", icon: ShoppingCart, roles: ["admin", "staff"], feature: "sales.invoices" },
      { href: "/pos", label: "Hızlı Satış (POS)", icon: ScanLine, roles: ["admin", "staff"], feature: "sales.pos" },
      { href: "/sales/history", label: "Satış Geçmişi", icon: History, roles: ["admin", "staff", "viewer"], feature: "sales.invoices" },
      { href: "/customers", label: "Müşteriler", icon: UserCircle, roles: ["admin", "staff", "viewer"], feature: "customers.crm" },
      { href: "/b2b/quotes", label: "Teklifler", icon: FileText, roles: ["admin", "staff"], feature: "customers.crm" },
      { href: "/b2b/orders", label: "Siparişler", icon: Package, roles: ["admin", "staff"], feature: "customers.crm" },
      { href: "/sadakat", label: "Sadakat & Puan", icon: Award, roles: ["admin", "staff", "viewer"], feature: "loyalty.points" },
      { href: "/campaigns", label: "Kampanyalar", icon: Tag, roles: ["admin", "staff", "viewer"], feature: "campaigns" },
    ],
  },
  {
    id: "urun",
    label: "Ürün & Stok",
    icon: Package,
    items: [
      { href: "/products", label: "Ürünler", icon: Package, roles: ["admin", "staff", "viewer"], feature: "inventory.core" },
      { href: "/stock", label: "Stok Girişi", icon: PackagePlus, roles: ["admin", "staff"], feature: "inventory.core" },
      { href: "/stock-counts", label: "Stok Sayım", icon: ClipboardList, roles: ["admin", "staff"], feature: "stock.counts" },
      { href: "/barcode", label: "Barkod Tarama", icon: ScanBarcode, roles: ["admin", "staff"], feature: "barcode.print" },
      { href: "/barcodes", label: "Etiket Merkezi", icon: Barcode, roles: ["admin", "staff", "viewer"], feature: "barcode.print" },
      { href: "/purchases", label: "Alış Faturaları", icon: ShoppingBag, roles: ["admin", "staff", "viewer"], feature: "suppliers" },
      { href: "/suppliers", label: "Tedarikçiler", icon: Truck, roles: ["admin", "staff", "viewer"], feature: "suppliers" },
      { href: "/ice-aktarim", label: "Veri İçe Aktarımı", icon: Upload, roles: ["admin", "staff"], feature: "inventory.core" },
    ],
  },
  {
    id: "finans",
    label: "Finans",
    icon: Wallet,
    items: [
      { href: "/finance", label: "Kasa / Finans", icon: Wallet, roles: ["admin", "staff", "viewer"], feature: "finance.expenses" },
      { href: "/banking", label: "Bankacılık", icon: Banknote, roles: ["admin", "staff"], feature: "finance.banking" },
      { href: "/finance-dashboard", label: "Finans Paneli", icon: TrendingUp, roles: ["admin", "viewer"], feature: "profit.dashboard" },
      { href: "/profit", label: "Net Kâr", icon: TrendingUp, roles: ["admin", "staff", "viewer"], feature: "profit.dashboard" },
      { href: "/gercek-kar", label: "Gerçek Kâr", icon: TrendingUp, roles: ["admin", "viewer"], feature: "profit.true_dashboard" },
      { href: "/butce", label: "Bütçe", icon: PieChart, roles: ["admin", "staff", "viewer"], feature: "finance.expenses" },
      { href: "/muhasebeci", label: "Mali Müşavir", icon: Calculator, roles: ["admin", "staff", "viewer"], feature: "accountant.panel" },
      { href: "/einvoice", label: "e-Fatura", icon: FileText, roles: ["admin", "staff", "viewer"], feature: "einvoice.basic" },
      { href: "/documents", label: "Evrak", icon: FileText, roles: ["admin", "staff", "viewer"], feature: "documents" },
      { href: "/doviz", label: "Çoklu Para", icon: DollarSign, roles: ["admin", "staff", "viewer"], feature: "currency.multi" },
    ],
  },
  {
    id: "online",
    label: "Online Satış",
    icon: Store,
    items: [
      { href: "/eticarium-merkezi", label: "e-Ticarium Merkezi", icon: Sparkles, roles: ["admin", "staff", "viewer"], feature: "marketplace.basic" },
      { href: "/marketplace", label: "Pazaryeri", icon: Radio, roles: ["admin", "staff"], feature: "marketplace.basic" },
      { href: "/channels", label: "Satış Kanalları", icon: Radio, roles: ["admin", "staff"], feature: "marketplace.pro" },
      { href: "/magaza", label: "Hazır Mağaza", icon: Store, roles: ["admin", "staff", "viewer"], feature: "marketplace.basic" },
      { href: "/b2b/vitrin", label: "B2B Vitrin", icon: Store, roles: ["admin", "staff", "viewer"], feature: "marketplace.pro" },
      { href: "/network", label: "B2B Ağı", icon: Network, roles: ["admin", "staff", "viewer"], feature: "marketplace.pro" },
      { href: "/aggregator", label: "Ticarium Pazar", icon: ShoppingBasket, roles: ["admin"], feature: "marketplace.pro" },
      { href: "/fiyat-motoru", label: "Fiyat Motoru", icon: Tag, roles: ["admin", "staff", "viewer"], feature: "marketplace.pro" },
      { href: "/karlilik-kanal", label: "Kanal Karlılığı", icon: Trophy, roles: ["admin", "staff", "viewer"], feature: "profit.true_dashboard" },
      { href: "/kargo", label: "Kargo", icon: Truck, roles: ["admin", "staff", "viewer"], feature: "marketplace.basic" },
      { href: "/reklam-butce", label: "Reklam Bütçesi", icon: Megaphone, roles: ["admin", "staff", "viewer"], feature: "campaigns" },
    ],
  },
  {
    id: "raporlar",
    label: "Raporlar",
    icon: BarChart3,
    items: [
      { href: "/reports", label: "Genel Raporlar", icon: BarChart3, roles: ["admin", "viewer"] },
      { href: "/reports/daily-summary", label: "Günlük Kapanış", icon: CalendarCheck, roles: ["admin", "viewer"] },
      { href: "/gercek-kar/oneriler", label: "Akıllı Öneriler", icon: Sparkles, roles: ["admin", "viewer"] },
    ],
  },
  {
    id: "satinalma",
    label: "Satınalma",
    icon: ShoppingBasket,
    accountTypes: ["buyer", "seller", "both"],
    items: [
      { href: "/satinalma", label: "Satınalma Anasayfa", icon: ShoppingBasket, roles: ["admin", "staff", "viewer"] },
      { href: "/satinalma/kesfet", label: "Tedarikçi Keşfet", icon: Search, roles: ["admin", "staff", "viewer"], accountTypes: ["buyer", "both"] },
      { href: "/satinalma/rfqs/new", label: "Yeni Teklif Talebi", icon: FileText, roles: ["admin", "staff"], accountTypes: ["buyer", "both"] },
      { href: "/satinalma/rfqs", label: "RFQ'larım", icon: ClipboardList, roles: ["admin", "staff", "viewer"], accountTypes: ["buyer", "both"] },
      { href: "/satinalma/inbox", label: "Gelen RFQ Kutusu", icon: Inbox, roles: ["admin", "staff"], accountTypes: ["seller", "both"] },
    ],
  },
  {
    id: "yonetim",
    label: "Yönetim",
    icon: Settings,
    items: [
      { href: "/personnel", label: "Personel", icon: Users, roles: ["admin", "staff", "viewer"] },
      { href: "/branches", label: "Şubeler", icon: GitBranch, roles: ["admin", "staff", "viewer"] },
      { href: "/uretim", label: "Üretim & Reçete", icon: Factory, roles: ["admin", "staff", "viewer"], feature: "production.bom" },
      { href: "/users", label: "Kullanıcılar", icon: Users, roles: ["admin"] },
      { href: "/firma-profili", label: "Firma Profili", icon: Settings, roles: ["admin"] },
      { href: "/kurulum-skoru", label: "Kurulum Skoru", icon: Target, roles: ["admin"] },
      { href: "/settings", label: "Marka & Logo", icon: Settings, roles: ["admin"] },
      { href: "/settings/integrations", label: "Entegrasyonlar", icon: Webhook, roles: ["admin"] },
      { href: "/settings/notifications", label: "Bildirim Ayarları", icon: Bell, roles: ["admin"] },
      { href: "/settings/menu", label: "Menü Tercihleri", icon: Settings, roles: ["admin", "staff", "viewer"] },
      { href: "/settings/subscription", label: "Abonelik", icon: CreditCard, roles: ["admin"] },
      { href: "/pricing", label: "Paketler & Fiyatlar", icon: Tag, roles: ["admin", "staff", "viewer", "super_admin"] },
      { href: "/finance-documents", label: "Belge Merkezi", icon: Inbox, roles: ["admin", "staff", "viewer"] },
      { href: "/b2b/catalog", label: "B2B Katalogum", icon: PackageOpen, roles: ["admin", "staff"] },
    ],
  },
  {
    id: "superadmin",
    label: "Süper Admin",
    icon: ShieldCheck,
    items: [
      { href: "/admin/companies", label: "Firma Yönetimi", icon: Building2, roles: ["super_admin"] },
      { href: "/super-admin/yeni-firma", label: "Yeni Firma Ekle", icon: Building2, roles: ["super_admin"] },
      { href: "/super-admin/talepler", label: "İletişim Talepleri", icon: Inbox, roles: ["super_admin"] },
      { href: "/super-admin/audit-logs", label: "Denetim Kayıtları", icon: ShieldCheck, roles: ["super_admin"] },
      { href: "/admin/payments", label: "Ödeme Bildirimleri", icon: CreditCard, roles: ["super_admin"] },
      { href: "/admin/billing", label: "Abonelik Yönetimi", icon: CreditCard, roles: ["super_admin"] },
      { href: "/admin/runtime-flags", label: "Runtime Flags", icon: ShieldCheck, roles: ["super_admin"] },
      { href: "/super-admin/sistem-saglik", label: "Sistem Sağlığı", icon: Activity, roles: ["super_admin"] },
      { href: "/super-admin/pazaryeri-saglik", label: "Pazaryeri Sağlık", icon: Activity, roles: ["super_admin"] },
      { href: "/admin/platform-settings", label: "Platform Ayarları", icon: Wrench, roles: ["super_admin"] },
    ],
  },
];
