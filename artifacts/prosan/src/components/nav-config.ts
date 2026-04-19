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
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
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
      { href: "/sales", label: "Satış Ekranı", icon: ShoppingCart, roles: ["admin", "staff"] },
      { href: "/pos", label: "Hızlı Satış (POS)", icon: ScanLine, roles: ["admin", "staff"] },
      { href: "/sales/history", label: "Satış Geçmişi", icon: History, roles: ["admin", "staff", "viewer"] },
      { href: "/customers", label: "Müşteriler", icon: UserCircle, roles: ["admin", "staff", "viewer"] },
      { href: "/b2b/quotes", label: "Teklifler", icon: FileText, roles: ["admin", "staff"] },
      { href: "/b2b/orders", label: "Siparişler", icon: Package, roles: ["admin", "staff"] },
      { href: "/sadakat", label: "Sadakat & Puan", icon: Award, roles: ["admin", "staff", "viewer"] },
      { href: "/campaigns", label: "Kampanyalar", icon: Tag, roles: ["admin", "staff", "viewer"] },
    ],
  },
  {
    id: "urun",
    label: "Ürün & Stok",
    icon: Package,
    items: [
      { href: "/products", label: "Ürünler", icon: Package, roles: ["admin", "staff", "viewer"] },
      { href: "/stock", label: "Stok Girişi", icon: PackagePlus, roles: ["admin", "staff"] },
      { href: "/stock-counts", label: "Stok Sayım", icon: ClipboardList, roles: ["admin", "staff"] },
      { href: "/barcode", label: "Barkod Tarama", icon: ScanBarcode, roles: ["admin", "staff"] },
      { href: "/barcodes", label: "Etiket Merkezi", icon: Barcode, roles: ["admin", "staff", "viewer"] },
      { href: "/purchases", label: "Alış Faturaları", icon: ShoppingBag, roles: ["admin", "staff", "viewer"] },
      { href: "/suppliers", label: "Tedarikçiler", icon: Truck, roles: ["admin", "staff", "viewer"] },
      { href: "/ice-aktarim", label: "Veri İçe Aktarımı", icon: Upload, roles: ["admin", "staff"] },
    ],
  },
  {
    id: "finans",
    label: "Finans",
    icon: Wallet,
    items: [
      { href: "/finance", label: "Kasa / Finans", icon: Wallet, roles: ["admin", "staff", "viewer"] },
      { href: "/banking", label: "Bankacılık", icon: Banknote, roles: ["admin", "staff"] },
      { href: "/finance-dashboard", label: "Finans Paneli", icon: TrendingUp, roles: ["admin", "viewer"] },
      { href: "/profit", label: "Net Kâr", icon: TrendingUp, roles: ["admin", "staff", "viewer"] },
      { href: "/gercek-kar", label: "Gerçek Kâr", icon: TrendingUp, roles: ["admin", "viewer"] },
      { href: "/butce", label: "Bütçe", icon: PieChart, roles: ["admin", "staff", "viewer"] },
      { href: "/muhasebeci", label: "Mali Müşavir", icon: Calculator, roles: ["admin", "staff", "viewer"] },
      { href: "/einvoice", label: "e-Fatura", icon: FileText, roles: ["admin", "staff", "viewer"] },
      { href: "/documents", label: "Evrak", icon: FileText, roles: ["admin", "staff", "viewer"] },
      { href: "/doviz", label: "Çoklu Para", icon: DollarSign, roles: ["admin", "staff", "viewer"] },
    ],
  },
  {
    id: "online",
    label: "Online Satış",
    icon: Store,
    items: [
      { href: "/eticarium-merkezi", label: "e-Ticarium Merkezi", icon: Sparkles, roles: ["admin", "staff", "viewer"] },
      { href: "/marketplace", label: "Pazaryeri", icon: Radio, roles: ["admin", "staff"] },
      { href: "/channels", label: "Satış Kanalları", icon: Radio, roles: ["admin", "staff"] },
      { href: "/magaza", label: "Hazır Mağaza", icon: Store, roles: ["admin", "staff", "viewer"] },
      { href: "/b2b/vitrin", label: "B2B Vitrin", icon: Store, roles: ["admin", "staff", "viewer"] },
      { href: "/network", label: "B2B Ağı", icon: Network, roles: ["admin", "staff", "viewer"] },
      { href: "/aggregator", label: "Ticarium Pazar", icon: ShoppingBasket, roles: ["admin"] },
      { href: "/fiyat-motoru", label: "Fiyat Motoru", icon: Tag, roles: ["admin", "staff", "viewer"] },
      { href: "/karlilik-kanal", label: "Kanal Karlılığı", icon: Trophy, roles: ["admin", "staff", "viewer"] },
      { href: "/kargo", label: "Kargo", icon: Truck, roles: ["admin", "staff", "viewer"] },
      { href: "/reklam-butce", label: "Reklam Bütçesi", icon: Megaphone, roles: ["admin", "staff", "viewer"] },
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
    id: "yonetim",
    label: "Yönetim",
    icon: Settings,
    items: [
      { href: "/personnel", label: "Personel", icon: Users, roles: ["admin", "staff", "viewer"] },
      { href: "/branches", label: "Şubeler", icon: GitBranch, roles: ["admin", "staff", "viewer"] },
      { href: "/uretim", label: "Üretim & Reçete", icon: Factory, roles: ["admin", "staff", "viewer"] },
      { href: "/users", label: "Kullanıcılar", icon: Users, roles: ["admin"] },
      { href: "/settings", label: "Genel Ayarlar", icon: Settings, roles: ["admin"] },
      { href: "/settings/integrations", label: "Entegrasyonlar", icon: Webhook, roles: ["admin"] },
      { href: "/settings/notifications", label: "Bildirim Ayarları", icon: Bell, roles: ["admin"] },
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
      { href: "/super-admin/pazaryeri-saglik", label: "Pazaryeri Sağlık", icon: Activity, roles: ["super_admin"] },
      { href: "/admin/platform-settings", label: "Platform Ayarları", icon: Wrench, roles: ["super_admin"] },
    ],
  },
];
