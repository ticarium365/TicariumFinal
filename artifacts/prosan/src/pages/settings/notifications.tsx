import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Plus, Trash2, Play, Power, Edit2, X, CheckCircle,
  AlertTriangle, ShoppingBag, Package, BarChart3, CreditCard,
  Users, ClipboardList, Zap, Mail, MessageSquare, Smartphone, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const LS_CHANNELS = "ticarium-notif-channel-prefs-v1";
const LS_QUIET = "ticarium-notif-quiet-hours-v1";

type ChannelTriplet = { email: boolean; sms: boolean; push: boolean };

function loadChannelMap(): Record<string, ChannelTriplet> {
  try {
    const raw = localStorage.getItem(LS_CHANNELS);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, ChannelTriplet>;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveChannelMap(m: Record<string, ChannelTriplet>) {
  try {
    localStorage.setItem(LS_CHANNELS, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function loadQuietHours(): { start: string; end: string } {
  try {
    const raw = localStorage.getItem(LS_QUIET);
    if (!raw) return { start: "22:00", end: "07:00" };
    const o = JSON.parse(raw) as { start?: string; end?: string };
    return { start: o.start ?? "22:00", end: o.end ?? "07:00" };
  } catch {
    return { start: "22:00", end: "07:00" };
  }
}

// ─── İkon eşleştirme ────────────────────────────────────────────────────────
function typeIcon(type: string) {
  const cls = "h-4 w-4";
  switch (type) {
    case "low_stock": return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "new_sale": return <ShoppingBag className={`${cls} text-green-500`} />;
    case "daily_summary": return <BarChart3 className={`${cls} text-blue-500`} />;
    case "subscription_expiry": return <CreditCard className={`${cls} text-purple-500`} />;
    case "overdue_payment": return <Users className={`${cls} text-red-500`} />;
    case "new_purchase": return <Package className={`${cls} text-blue-500`} />;
    case "stock_count_closed": return <ClipboardList className={`${cls} text-cyan-500`} />;
    default: return <Bell className={`${cls} text-muted-foreground/70`} />;
  }
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { company } = useCompany();
  const tenant = company?.subdomain ?? "";
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

  const [channelMap, setChannelMap] = useState<Record<string, ChannelTriplet>>({});
  const [quietHours, setQuietHours] = useState(() => loadQuietHours());

  useEffect(() => {
    if (prefs.length === 0) return;
    setChannelMap((prev) => {
      const fromLs = loadChannelMap();
      const next: Record<string, ChannelTriplet> = { ...fromLs };
      for (const p of prefs) {
        if (!next[p.type]) {
          next[p.type] = { email: p.enabled, sms: false, push: p.enabled };
        }
      }
      saveChannelMap(next);
      return { ...prev, ...next };
    });
  }, [prefs]);

  const applyChannels = useCallback(
    (type: string, triplet: ChannelTriplet) => {
      setChannelMap((prev) => {
        const next = { ...prev, [type]: triplet };
        saveChannelMap(next);
        return next;
      });
      const enabled = triplet.email || triplet.sms || triplet.push;
      const updated = prefs.map((p) => (p.type === type ? { ...p, enabled } : p));
      savePrefsMut.mutate(updated);
    },
    [prefs, savePrefsMut]
  );

  const persistQuietHours = useCallback((next: { start: string; end: string }) => {
    setQuietHours(next);
    try {
      localStorage.setItem(LS_QUIET, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Bildirim Ayarları</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bildirim kurallarını ve tercihlerinizi yönetin</p>
        </div>
        {tab === "rules" && (
          <Button onClick={() => { setEditRule(null); setRuleModal(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Kural Ekle
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["rules", "preferences"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/90"}`}
          >
            {t === "rules" ? "Bildirim Kuralları" : "Tercihlerim"}
          </button>
        ))}
      </div>

      {/* ─── Kurallar Sekmesi ─────────────────────────────────────────────── */}
      {tab === "rules" && (
        <div className="space-y-4">
          {rulesQ.isLoading ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground/70">Yükleniyor...</div>
          ) : rules.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Henüz bildirim kuralı yok</p>
              <p className="text-sm text-muted-foreground/70 mt-1">İlk kuralınızı eklemek için yukarıdaki butonu kullanın</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">KURAL</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">TİP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">KANAL</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">DURUM</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">İŞLEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{rule.name}</p>
                        {rule.threshold != null && (
                          <p className="text-xs text-muted-foreground/70">Eşik: {rule.threshold}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-foreground/90">
                          {typeIcon(rule.type)}
                          {rule.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          {rule.channel === "in_app" ? "Uygulama İçi" : "Webhook"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleMut.mutate(rule.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                            ${rule.isActive
                              ? "bg-green-500/10 text-green-300 hover:bg-green-500/150/150/15"
                              : "bg-muted text-muted-foreground hover:bg-muted"}`}
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
                            className="p-1.5 rounded-lg hover:bg-blue-500/150/150/10 text-muted-foreground hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Test Et"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { setEditRule(rule); setRuleModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`"${rule.name}" kuralını silmek istediğinizden emin misiniz?`))
                                delMut.mutate(rule.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-500/150/150/10 text-muted-foreground hover:text-red-400 transition-colors"
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
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Moon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Sessiz saatler</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bu aralıkta özet bildirimleri geciktirilebilir (tercih bu cihazda saklanır).
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Başlangıç</Label>
                    <input
                      type="time"
                      value={quietHours.start}
                      onChange={(e) => persistQuietHours({ ...quietHours, start: e.target.value })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bitiş</Label>
                    <input
                      type="time"
                      value={quietHours.end}
                      onChange={(e) => persistQuietHours({ ...quietHours, end: e.target.value })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border/70 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Olay ve kanallar</p>
              <p className="text-xs text-muted-foreground mt-0.5">E-posta, SMS ve push için kanal grubu (çoklu seçim)</p>
            </div>
            {prefsQ.isLoading ? (
              <div className="p-8 text-center text-muted-foreground/70">Yükleniyor...</div>
            ) : prefs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground/70">Tercih bulunamadı</div>
            ) : (
              <div className="divide-y divide-border/70">
                {prefs.map((pref) => {
                  const triplet = channelMap[pref.type] ?? {
                    email: pref.enabled,
                    sms: false,
                    push: pref.enabled,
                  };
                  const value = (["email", "sms", "push"] as const).filter((k) => triplet[k]);
                  return (
                    <div
                      key={pref.type}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {typeIcon(pref.type)}
                        <span className="text-sm font-medium text-foreground">{pref.label}</span>
                      </div>
                      <ToggleGroup
                        type="multiple"
                        value={value}
                        onValueChange={(vals) => {
                          const v = new Set(vals);
                          applyChannels(pref.type, {
                            email: v.has("email"),
                            sms: v.has("sms"),
                            push: v.has("push"),
                          });
                        }}
                        className="justify-end flex-wrap"
                        size="sm"
                        variant="outline"
                      >
                        <ToggleGroupItem value="email" aria-label="E-posta" className="gap-1.5 px-2.5 data-[state=on]:border-[var(--color-brand-500)] data-[state=on]:bg-[color-mix(in_srgb,var(--color-brand-500)_12%,transparent)]">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">E-posta</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem value="sms" aria-label="SMS" className="gap-1.5 px-2.5 data-[state=on]:border-[var(--color-brand-500)] data-[state=on]:bg-[color-mix(in_srgb,var(--color-brand-500)_12%,transparent)]">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">SMS</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem value="push" aria-label="Push" className="gap-1.5 px-2.5 data-[state=on]:border-[var(--color-brand-500)] data-[state=on]:bg-[color-mix(in_srgb,var(--color-brand-500)_12%,transparent)]">
                          <Smartphone className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Push</span>
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-foreground">{existing ? "Kural Düzenle" : "Yeni Kural Ekle"}</h2>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground/90 block mb-1">Kural Adı *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Kritik Stok Uyarısı"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/90 block mb-1">Bildirim Tipi *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card"
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {selectedType?.hasThreshold && (
            <div>
              <label className="text-xs font-medium text-foreground/90 block mb-1">
                Eşik Değeri (bu miktarın altında uyarı ver)
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min={0}
                placeholder="ör. 5"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
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
