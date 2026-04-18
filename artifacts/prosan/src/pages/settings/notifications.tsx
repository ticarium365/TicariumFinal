import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Plus, Trash2, Play, Power, Edit2, X, CheckCircle,
  AlertTriangle, ShoppingBag, Package, BarChart3, CreditCard,
  Users, ClipboardList, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";

// ─── Tipler ─────────────────────────────────────────────────────────────────
interface NotificationType {
  value: string;
  label: string;
  hasThreshold: boolean;
}
interface NotificationRule {
  id: number; companyId: number; name: string; type: string;
  typeLabel: string; channel: string; threshold?: number | null;
  isActive: boolean; createdAt: string;
}
interface UserPref { type: string; label: string; enabled: boolean; }

// ─── İkon eşleştirme ────────────────────────────────────────────────────────
function typeIcon(type: string) {
  const cls = "h-4 w-4";
  switch (type) {
    case "low_stock": return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "new_sale": return <ShoppingBag className={`${cls} text-green-500`} />;
    case "daily_summary": return <BarChart3 className={`${cls} text-blue-500`} />;
    case "subscription_expiry": return <CreditCard className={`${cls} text-purple-500`} />;
    case "overdue_payment": return <Users className={`${cls} text-red-500`} />;
    case "new_purchase": return <Package className={`${cls} text-indigo-500`} />;
    case "stock_count_closed": return <ClipboardList className={`${cls} text-cyan-500`} />;
    default: return <Bell className={`${cls} text-gray-400`} />;
  }
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useCompany();
  const [tab, setTab] = useState<"rules" | "preferences">("rules");
  const [ruleModal, setRuleModal] = useState(false);
  const [editRule, setEditRule] = useState<NotificationRule | null>(null);

  const base = `/api/${tenant}`;

  // ─── Tipler ───────────────────────────────────────────────────────────────
  const typesQ = useQuery<{ types: NotificationType[] }>({
    queryKey: ["notif-types", tenant],
    queryFn: async () => {
      const r = await fetch(`${base}/notification-rules/types`, { credentials: "include" });
      return r.json();
    },
  });

  // ─── Kurallar ─────────────────────────────────────────────────────────────
  const rulesQ = useQuery<{ rules: NotificationRule[] }>({
    queryKey: ["notif-rules", tenant],
    queryFn: async () => {
      const r = await fetch(`${base}/notification-rules`, { credentials: "include" });
      if (!r.ok) throw new Error("Kurallar yüklenemedi");
      return r.json();
    },
  });

  // ─── Tercihler ────────────────────────────────────────────────────────────
  const prefsQ = useQuery<{ preferences: UserPref[] }>({
    queryKey: ["notif-prefs", tenant],
    queryFn: async () => {
      const r = await fetch(`${base}/notification-rules/preferences`, { credentials: "include" });
      if (!r.ok) throw new Error("Tercihler yüklenemedi");
      return r.json();
    },
    enabled: tab === "preferences",
  });

  // ─── Toggle ───────────────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/notification-rules/${id}/toggle`, {
        method: "PATCH", credentials: "include",
      });
      if (!r.ok) throw new Error("Güncelleme başarısız");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-rules"] }),
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  // ─── Sil ──────────────────────────────────────────────────────────────────
  const delMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/notification-rules/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-rules"] });
      toast({ title: "Kural silindi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  // ─── Test ─────────────────────────────────────────────────────────────────
  const testMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/notification-rules/${id}/test`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Test başarısız");
      return r.json();
    },
    onSuccess: (data) => toast({ title: data.message ?? "Test bildirimi gönderildi" }),
    onError: () => toast({ title: "Test başarısız", variant: "destructive" }),
  });

  // ─── Tercih kaydet ────────────────────────────────────────────────────────
  const savePrefsMut = useMutation({
    mutationFn: async (prefs: UserPref[]) => {
      const r = await fetch(`${base}/notification-rules/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferences: prefs.map((p) => ({ type: p.type, enabled: p.enabled })) }),
      });
      if (!r.ok) throw new Error("Kaydedilemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-prefs"] });
      toast({ title: "Tercihler kaydedildi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const rules = rulesQ.data?.rules ?? [];
  const types = typesQ.data?.types ?? [];
  const prefs = prefsQ.data?.preferences ?? [];

  const handleTogglePref = (type: string, enabled: boolean) => {
    const updated = prefs.map((p) => p.type === type ? { ...p, enabled } : p);
    savePrefsMut.mutate(updated);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Bildirim Ayarları</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bildirim kurallarını ve tercihlerinizi yönetin</p>
        </div>
        {tab === "rules" && (
          <Button onClick={() => { setEditRule(null); setRuleModal(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Kural Ekle
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["rules", "preferences"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t === "rules" ? "Bildirim Kuralları" : "Tercihlerim"}
          </button>
        ))}
      </div>

      {/* ─── Kurallar Sekmesi ─────────────────────────────────────────────── */}
      {tab === "rules" && (
        <div className="space-y-4">
          {rulesQ.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Yükleniyor...</div>
          ) : rules.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Henüz bildirim kuralı yok</p>
              <p className="text-sm text-gray-400 mt-1">İlk kuralınızı eklemek için yukarıdaki butonu kullanın</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">KURAL</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TİP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">KANAL</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">DURUM</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">İŞLEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{rule.name}</p>
                        {rule.threshold != null && (
                          <p className="text-xs text-gray-400">Eşik: {rule.threshold}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          {typeIcon(rule.type)}
                          {rule.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                          <Zap className="h-3 w-3" />
                          {rule.channel === "in_app" ? "Uygulama İçi" : "Webhook"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleMut.mutate(rule.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                            ${rule.isActive
                              ? "bg-green-50 text-green-700 hover:bg-green-100"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                        >
                          <Power className="h-3 w-3" />
                          {rule.isActive ? "Aktif" : "Pasif"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => testMut.mutate(rule.id)}
                            disabled={!rule.isActive}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Test Et"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { setEditRule(rule); setRuleModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-indigo-600 transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`"${rule.name}" kuralını silmek istediğinizden emin misiniz?`))
                                delMut.mutate(rule.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Tercihler Sekmesi ────────────────────────────────────────────── */}
      {tab === "preferences" && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {prefsQ.isLoading ? (
            <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
          ) : prefs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Tercih bulunamadı</div>
          ) : (
            prefs.map((pref) => (
              <div key={pref.type} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  {typeIcon(pref.type)}
                  <span className="text-sm font-medium text-gray-900">{pref.label}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={pref.enabled}
                    onChange={(e) => handleTogglePref(pref.type, e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer
                    peer-checked:after:translate-x-full peer-checked:after:border-white after:content-['']
                    after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300
                    after:border after:rounded-full after:h-5 after:w-5 after:transition-all
                    peer-checked:bg-indigo-600" />
                </label>
              </div>
            ))
          )}
        </div>
      )}

      {/* Kural Modal */}
      {ruleModal && (
        <RuleModal
          base={base}
          types={types}
          existing={editRule}
          onClose={() => { setRuleModal(false); setEditRule(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["notif-rules"] });
            setRuleModal(false);
            setEditRule(null);
            toast({ title: editRule ? "Kural güncellendi" : "Kural oluşturuldu" });
          }}
        />
      )}
    </div>
  );
}

// ─── Kural Modal ─────────────────────────────────────────────────────────────
function RuleModal({
  base, types, existing, onClose, onSuccess,
}: {
  base: string;
  types: NotificationType[];
  existing: NotificationRule | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState(existing?.type ?? types[0]?.value ?? "low_stock");
  const [threshold, setThreshold] = useState<string>(existing?.threshold?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedType = types.find((t) => t.value === type);

  const handleSave = async () => {
    if (!name.trim()) { setError("Kural adı zorunludur"); return; }
    setSaving(true);
    try {
      const method = existing ? "PUT" : "POST";
      const url = existing
        ? `${base}/notification-rules/${existing.id}`
        : `${base}/notification-rules`;
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        channel: "in_app",
      };
      if (selectedType?.hasThreshold && threshold) body.threshold = parseInt(threshold, 10);
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Kaydedilemedi");
      onSuccess();
    } catch (err: any) {
      setError(err.message ?? "Sunucu hatası");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{existing ? "Kural Düzenle" : "Yeni Kural Ekle"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Kural Adı *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Kritik Stok Uyarısı"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Bildirim Tipi *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {selectedType?.hasThreshold && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Eşik Değeri (bu miktarın altında uyarı ver)
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min={0}
                placeholder="ör. 5"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>İptal</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
