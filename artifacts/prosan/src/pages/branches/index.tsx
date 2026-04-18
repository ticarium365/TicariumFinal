import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Building2, Plus, X, Pencil, Users, Package,
  MapPin, Phone, Mail, ArrowLeftRight, CheckCircle, Clock, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────
interface Branch {
  id: number; name: string; address?: string | null; phone?: string | null;
  email?: string | null; isMain: boolean; isActive: boolean;
  userCount: number;
}
interface Transfer {
  id: number; fromBranchId: number; toBranchId: number; fromBranchName?: string;
  toBranchName?: string; status: string; notes?: string | null;
  createdAt: string; items: { productId: number; productName: string; quantity: number }[];
}

type TabId = "branches" | "transfers";

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function BranchesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("branches");

  // Şube formu
  const [showForm, setShowForm] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "", isMain: false });

  // Transfer formu
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromBranchId: "", toBranchId: "", notes: "",
    items: [{ productId: "", productCode: "", productName: "", quantity: "1" }],
  });
  const [productSearch, setProductSearch] = useState("");

  // ─── Sorgular ─────────────────────────────────────────────────────────────
  const branchesQ = useQuery<{ branches: Branch[] }>({
    queryKey: ["branches"],
    queryFn: async () => {
      const res = await fetch("/api/branches?includeInactive=0", { credentials: "include" });
      if (!res.ok) throw new Error("Şubeler yüklenemedi");
      return res.json();
    },
  });

  const transfersQ = useQuery<{ transfers: Transfer[] }>({
    queryKey: ["branch-transfers"],
    queryFn: async () => {
      const res = await fetch("/api/branches/transfers/list", { credentials: "include" });
      if (!res.ok) throw new Error("Transferler yüklenemedi");
      return res.json();
    },
    enabled: tab === "transfers",
  });

  const productsQ = useQuery<{ products: { id: number; name: string; productCode: string; barcode?: string }[] }>({
    queryKey: ["products-search", productSearch],
    queryFn: async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("Ürünler yüklenemedi");
      return res.json();
    },
    enabled: productSearch.length > 1,
  });

  // ─── Mutasyonlar ─────────────────────────────────────────────────────────
  const saveBranch = useMutation({
    mutationFn: async (body: object) => {
      const url = editBranch ? `/api/branches/${editBranch.id}` : "/api/branches";
      const method = editBranch ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      setShowForm(false);
      setEditBranch(null);
      setForm({ name: "", address: "", phone: "", email: "", isMain: false });
      toast({ title: editBranch ? "Şube güncellendi" : "Şube eklendi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const deleteBranch = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/branches/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Silinemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast({ title: "Şube deaktif edildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const createTransfer = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch("/api/branches/transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Kaydedilemedi");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch-transfers"] });
      setShowTransferForm(false);
      setTransferForm({ fromBranchId: "", toBranchId: "", notes: "", items: [{ productId: "", productCode: "", productName: "", quantity: "1" }] });
      toast({ title: "Transfer talebi oluşturuldu" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const completeTransfer = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/branches/transfers/${id}/complete`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Tamamlanamadı");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch-transfers"] });
      toast({ title: "Transfer tamamlandı" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const cancelTransfer = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/branches/transfers/${id}/cancel`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "İptal edilemedi");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branch-transfers"] });
      toast({ title: "Transfer iptal edildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const openEdit = (b: Branch) => {
    setEditBranch(b);
    setForm({ name: b.name, address: b.address ?? "", phone: b.phone ?? "", email: b.email ?? "", isMain: b.isMain });
    setShowForm(true);
  };

  const branches = branchesQ.data?.branches ?? [];
  const transfers = transfersQ.data?.transfers ?? [];
  const products = productsQ.data?.products ?? [];

  const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    pending: { label: "Bekliyor", icon: Clock, color: "text-yellow-400 bg-yellow-500/10" },
    completed: { label: "Tamamlandı", icon: CheckCircle, color: "text-green-400 bg-green-500/10" },
    cancelled: { label: "İptal", icon: Ban, color: "text-muted-foreground bg-muted" },
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Çok Şubeli Yönetim</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Şubeler, stok transferleri ve atamalar</p>
        </div>
        <div className="flex gap-2">
          {tab === "branches" && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditBranch(null); setForm({ name: "", address: "", phone: "", email: "", isMain: false }); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5" />Şube Ekle
            </Button>
          )}
          {tab === "transfers" && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowTransferForm(true)}>
              <ArrowLeftRight className="h-3.5 w-3.5" />Yeni Transfer
            </Button>
          )}
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {[{ id: "branches" as TabId, label: "Şubeler" }, { id: "transfers" as TabId, label: "Stok Transferleri" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── ŞUBELER ───────────────────────────────────────────────── */}
      {tab === "branches" && (
        <div className="space-y-4">
          {/* Şube formu */}
          {showForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{editBranch ? "Şube Düzenle" : "Yeni Şube"}</p>
                <button onClick={() => { setShowForm(false); setEditBranch(null); }}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Şube Adı *</label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Merkez Şube" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Telefon</label>
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+90 212 000 00 00" className="mt-1" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Adres</label>
                  <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Şube adresi" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">E-posta</label>
                  <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="sube@firma.com" className="mt-1" />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" id="isMain" checked={form.isMain}
                    onChange={e => setForm(p => ({ ...p, isMain: e.target.checked }))}
                    className="h-4 w-4 rounded" />
                  <label htmlFor="isMain" className="text-sm">Ana Şube</label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveBranch.mutate(form)} disabled={!form.name.trim() || saveBranch.isPending}>
                  {saveBranch.isPending ? "Kaydediliyor..." : "Kaydet"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); setEditBranch(null); }}>İptal</Button>
              </div>
            </div>
          )}

          {branchesQ.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
          ) : branches.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed rounded-xl">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Henüz şube tanımlanmamış</p>
              <Button className="mt-3 gap-2" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />İlk Şubeyi Ekle
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {branches.map(b => (
                <div key={b.id} className="bg-card border rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{b.name}</p>
                        {b.isMain && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">ANA ŞUBE</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {!b.isMain && (
                        <button onClick={() => { if (confirm(`${b.name} deaktif edilsin mi?`)) deleteBranch.mutate(b.id); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10">
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {b.address && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{b.address}</span>
                      </div>
                    )}
                    {b.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{b.phone}</span>
                      </div>
                    )}
                    {b.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{b.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{b.userCount} kullanıcı</span>
                    </div>
                    <Link href={`/branches/${b.id}/stock`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Package className="h-3 w-3" />
                      <span>Stok görüntüle</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TRANSFERler ─────────────────────────────────────────── */}
      {tab === "transfers" && (
        <div className="space-y-4">
          {/* Transfer formu */}
          {showTransferForm && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Yeni Stok Transferi</p>
                <button onClick={() => setShowTransferForm(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Kaynak Şube *</label>
                  <select value={transferForm.fromBranchId}
                    onChange={e => setTransferForm(p => ({ ...p, fromBranchId: e.target.value }))}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Seçin...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hedef Şube *</label>
                  <select value={transferForm.toBranchId}
                    onChange={e => setTransferForm(p => ({ ...p, toBranchId: e.target.value }))}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Seçin...</option>
                    {branches.filter(b => String(b.id) !== transferForm.fromBranchId).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Not</label>
                  <Input value={transferForm.notes} onChange={e => setTransferForm(p => ({ ...p, notes: e.target.value }))} placeholder="Transfer notu" className="mt-1" />
                </div>
              </div>

              {/* Transfer kalemleri */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Ürünler</p>
                <div className="space-y-2">
                  {transferForm.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 relative">
                        <Input
                          value={item.productName || item.productCode}
                          onChange={e => {
                            setProductSearch(e.target.value);
                            setTransferForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, productName: e.target.value, productId: "", productCode: "" } : it) }));
                          }}
                          placeholder="Ürün ara (ad, kod, barkod)"
                          className="text-sm"
                        />
                        {productSearch && products.length > 0 && (
                          <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                            {products.map(p => (
                              <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                                onClick={() => {
                                  setTransferForm(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, productId: String(p.id), productName: p.name, productCode: p.productCode } : it) }));
                                  setProductSearch("");
                                }}>
                                <span className="font-semibold">{p.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">{p.productCode}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Input type="number" min="1" step="1" value={item.quantity}
                        onChange={e => setTransferForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it) }))}
                        className="w-20 text-sm" placeholder="Adet" />
                      <button onClick={() => setTransferForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                        className="mt-1 text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setTransferForm(p => ({ ...p, items: [...p.items, { productId: "", productCode: "", productName: "", quantity: "1" }] }))}>
                    <Plus className="h-3.5 w-3.5" />Ürün Ekle
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => createTransfer.mutate({
                    fromBranchId: Number(transferForm.fromBranchId),
                    toBranchId: Number(transferForm.toBranchId),
                    notes: transferForm.notes || undefined,
                    items: transferForm.items.filter(i => i.productId).map(i => ({ productId: Number(i.productId), quantity: Number(i.quantity) })),
                  })}
                  disabled={!transferForm.fromBranchId || !transferForm.toBranchId || createTransfer.isPending}>
                  {createTransfer.isPending ? "Oluşturuluyor..." : "Transfer Oluştur"}
                </Button>
                <Button variant="outline" onClick={() => setShowTransferForm(false)}>İptal</Button>
              </div>
            </div>
          )}

          {transfersQ.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
          ) : transfers.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed rounded-xl">
              <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Henüz transfer yok</p>
              <Button className="mt-3 gap-2" onClick={() => setShowTransferForm(true)}>
                <Plus className="h-4 w-4" />Yeni Transfer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map(t => {
                const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div key={t.id} className="bg-card border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{t.fromBranchName ?? `Şube #${t.fromBranchId}`}</span>
                          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold text-sm">{t.toBranchName ?? `Şube #${t.toBranchId}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            <StatusIcon className="h-3 w-3" />{cfg.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.createdAt).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
                      </div>
                      {t.status === "pending" && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => completeTransfer.mutate(t.id)}>
                            <CheckCircle className="h-3 w-3" />Tamamla
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive"
                            onClick={() => cancelTransfer.mutate(t.id)}>
                            <Ban className="h-3 w-3" />İptal
                          </Button>
                        </div>
                      )}
                    </div>
                    {t.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                        {t.items.map(item => (
                          <span key={item.productId} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {item.productName} × {item.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
