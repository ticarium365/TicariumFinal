import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Plus, Search, Edit, Trash2, ToggleLeft, ToggleRight,
  Building2, CalendarCheck, AlertCircle, UserCheck, UserX,
  Check, X, ChevronRight,
} from "lucide-react";
import { apiBase } from "@/lib/api";

interface Department {
  id: number;
  name: string;
  description?: string;
}

interface Personnel {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  tcNo?: string;
  position: string;
  departmentId?: number;
  departmentName?: string;
  phone?: string;
  email?: string;
  startDate: string;
  salary?: string;
  isActive: boolean;
  notes?: string;
}

interface LeaveRequest {
  id: number;
  personnelId: number;
  fullName?: string;
  position?: string;
  type: string;
  typeLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: string;
  statusLabel: string;
  createdAt: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  pendingLeaves: number;
}

const LEAVE_TYPES = [
  { value: "annual", label: "Yıllık İzin" },
  { value: "sick", label: "Hastalık İzni" },
  { value: "maternity", label: "Doğum İzni" },
  { value: "unpaid", label: "Ücretsiz İzin" },
  { value: "other", label: "Diğer" },
];

const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function PersonnelPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState("personnel");
  const [stats, setStats] = useState<Stats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Personnel modal
  const [showPersonnelModal, setShowPersonnelModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null);
  const [personForm, setPersonForm] = useState({
    firstName: "", lastName: "", tcNo: "", position: "",
    departmentId: "", phone: "", email: "", startDate: "",
    salary: "", isActive: true, notes: "",
  });

  // Department modal
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });

  // Leave modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    personnelId: "", type: "annual", startDate: "", endDate: "", days: "", reason: "",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterActive !== "all") params.isActive = filterActive;
      if (filterDept !== "all") params.departmentId = filterDept;
      const qs = new URLSearchParams(params).toString();

      const [statsR, deptsR, persR, leavesR] = await Promise.all([
        fetch(`${apiBase}/personnel/stats`, { credentials: "include" }),
        fetch(`${apiBase}/departments`, { credentials: "include" }),
        fetch(`${apiBase}/personnel${qs ? `?${qs}` : ""}`, { credentials: "include" }),
        fetch(`${apiBase}/leave-requests${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`, { credentials: "include" }),
      ]);
      if (statsR.ok) setStats(await statsR.json());
      if (deptsR.ok) setDepartments((await deptsR.json()).departments);
      if (persR.ok) setPersonnel((await persR.json()).personnel);
      if (leavesR.ok) setLeaves((await leavesR.json()).leaveRequests);
    } finally {
      setLoading(false);
    }
  }, [filterActive, filterDept, filterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredPersonnel = personnel.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(s) ||
      p.position.toLowerCase().includes(s) ||
      (p.phone ?? "").includes(s)
    );
  });

  // ── Personnel CRUD ────────────────────────────────────────────────────────
  function openAddPerson() {
    setEditingPerson(null);
    setPersonForm({ firstName: "", lastName: "", tcNo: "", position: "", departmentId: "", phone: "", email: "", startDate: new Date().toISOString().slice(0, 10), salary: "", isActive: true, notes: "" });
    setShowPersonnelModal(true);
  }
  function openEditPerson(p: Personnel) {
    setEditingPerson(p);
    setPersonForm({
      firstName: p.firstName, lastName: p.lastName, tcNo: p.tcNo ?? "",
      position: p.position, departmentId: p.departmentId?.toString() ?? "",
      phone: p.phone ?? "", email: p.email ?? "", startDate: p.startDate,
      salary: p.salary ?? "", isActive: p.isActive, notes: p.notes ?? "",
    });
    setShowPersonnelModal(true);
  }

  async function savePerson() {
    const body = {
      ...personForm,
      departmentId: personForm.departmentId ? parseInt(personForm.departmentId) : null,
      salary: personForm.salary || null,
      tcNo: personForm.tcNo || null,
      phone: personForm.phone || null,
      email: personForm.email || null,
      notes: personForm.notes || null,
    };
    const url = editingPerson ? `${apiBase}/personnel/${editingPerson.id}` : `${apiBase}/personnel`;
    const method = editingPerson ? "PUT" : "POST";
    const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setShowPersonnelModal(false); fetchAll(); }
  }

  async function togglePerson(p: Personnel) {
    await fetch(`${apiBase}/personnel/${p.id}/toggle`, { method: "PATCH", credentials: "include" });
    fetchAll();
  }

  async function deletePerson(p: Personnel) {
    if (!confirm(`${p.fullName} silinsin mi?`)) return;
    await fetch(`${apiBase}/personnel/${p.id}`, { method: "DELETE", credentials: "include" });
    fetchAll();
  }

  // ── Department CRUD ───────────────────────────────────────────────────────
  function openAddDept() {
    setEditingDept(null);
    setDeptForm({ name: "", description: "" });
    setShowDeptModal(true);
  }
  function openEditDept(d: Department) {
    setEditingDept(d);
    setDeptForm({ name: d.name, description: d.description ?? "" });
    setShowDeptModal(true);
  }
  async function saveDept() {
    const url = editingDept ? `${apiBase}/departments/${editingDept.id}` : `${apiBase}/departments`;
    const method = editingDept ? "PUT" : "POST";
    const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deptForm) });
    if (r.ok) { setShowDeptModal(false); fetchAll(); }
  }
  async function deleteDept(d: Department) {
    if (!confirm(`${d.name} silinsin mi?`)) return;
    await fetch(`${apiBase}/departments/${d.id}`, { method: "DELETE", credentials: "include" });
    fetchAll();
  }

  // ── Leave CRUD ────────────────────────────────────────────────────────────
  function openAddLeave() {
    setLeaveForm({ personnelId: "", type: "annual", startDate: "", endDate: "", days: "", reason: "" });
    setShowLeaveModal(true);
  }
  async function saveLeave() {
    const body = { ...leaveForm, personnelId: parseInt(leaveForm.personnelId), days: parseInt(leaveForm.days), reason: leaveForm.reason || null };
    const r = await fetch(`${apiBase}/leave-requests`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { setShowLeaveModal(false); fetchAll(); }
  }
  async function approveLeave(id: number) {
    await fetch(`${apiBase}/leave-requests/${id}/approve`, { method: "PATCH", credentials: "include" });
    fetchAll();
  }
  async function rejectLeave(id: number) {
    await fetch(`${apiBase}/leave-requests/${id}/reject`, { method: "PATCH", credentials: "include" });
    fetchAll();
  }
  async function deleteLeave(id: number) {
    if (!confirm("Bu izin talebi silinsin mi?")) return;
    await fetch(`${apiBase}/leave-requests/${id}`, { method: "DELETE", credentials: "include" });
    fetchAll();
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personel Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">Çalışanlar, departmanlar ve izin takibi</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setTab("departments"); openAddDept(); }}>
              <Building2 className="h-4 w-4 mr-2" /> Departman Ekle
            </Button>
            <Button size="sm" onClick={openAddPerson}>
              <Plus className="h-4 w-4 mr-2" /> Personel Ekle
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-gray-500">Toplam Personel</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <UserCheck className="h-8 w-8 text-green-600" />
              <div><p className="text-2xl font-bold">{stats.active}</p><p className="text-xs text-gray-500">Aktif</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <UserX className="h-8 w-8 text-gray-400" />
              <div><p className="text-2xl font-bold">{stats.inactive}</p><p className="text-xs text-gray-500">Pasif</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CalendarCheck className="h-8 w-8 text-orange-500" />
              <div><p className="text-2xl font-bold">{stats.pendingLeaves}</p><p className="text-xs text-gray-500">Bekleyen İzin</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="personnel">Personel Listesi</TabsTrigger>
          <TabsTrigger value="leaves">İzin Talepleri</TabsTrigger>
          <TabsTrigger value="departments">Departmanlar</TabsTrigger>
        </TabsList>

        {/* ── PERSONEL ─────────────────────────────────────────────────── */}
        <TabsContent value="personnel">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Ad, pozisyon, telefon..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="true">Aktif</SelectItem>
                <SelectItem value="false">Pasif</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Departman" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Departmanlar</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
          ) : filteredPersonnel.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Personel bulunamadı</p>
              {isAdmin && <Button className="mt-4" onClick={openAddPerson}><Plus className="h-4 w-4 mr-2" /> Personel Ekle</Button>}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPersonnel.map((p) => (
                <Card key={p.id} className={`${!p.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-700">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{p.fullName}</span>
                          <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                            {p.isActive ? "Aktif" : "Pasif"}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500 flex gap-3">
                          <span>{p.position}</span>
                          {p.departmentName && <span>• {p.departmentName}</span>}
                          {p.phone && <span>• {p.phone}</span>}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { openAddLeave(); setLeaveForm((f) => ({ ...f, personnelId: p.id.toString() })); }}>
                          <CalendarCheck className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditPerson(p)}><Edit className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => togglePerson(p)}>
                          {p.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deletePerson(p)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── İZİNLER ──────────────────────────────────────────────────── */}
        <TabsContent value="leaves">
          <div className="flex gap-2 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Durum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durumlar</SelectItem>
                <SelectItem value="pending">Bekliyor</SelectItem>
                <SelectItem value="approved">Onaylandı</SelectItem>
                <SelectItem value="rejected">Reddedildi</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button size="sm" onClick={openAddLeave}><Plus className="h-4 w-4 mr-2" /> İzin Talebi Ekle</Button>
            )}
          </div>

          {leaves.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CalendarCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>İzin talebi bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaves.map((l) => (
                <Card key={l.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{l.fullName}</span>
                        <Badge className={`text-xs ${statusColor[l.status] ?? ""}`}>{l.statusLabel}</Badge>
                        <Badge variant="outline" className="text-xs">{l.typeLabel}</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {l.startDate} → {l.endDate} ({l.days} gün)
                        {l.reason && <span> • {l.reason}</span>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        {l.status === "pending" && (
                          <>
                            <Button size="sm" variant="ghost" className="text-green-600" onClick={() => approveLeave(l.id)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => rejectLeave(l.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteLeave(l.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── DEPARTMANLAR ─────────────────────────────────────────────── */}
        <TabsContent value="departments">
          {isAdmin && (
            <Button size="sm" className="mb-4" onClick={openAddDept}>
              <Plus className="h-4 w-4 mr-2" /> Departman Ekle
            </Button>
          )}
          {departments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Henüz departman yok</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((d) => (
                <Card key={d.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      {d.description && <p className="text-sm text-gray-500">{d.description}</p>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDept(d)}><Edit className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteDept(d)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Personel Modal ─────────────────────────────────────────────── */}
      <Dialog open={showPersonnelModal} onOpenChange={setShowPersonnelModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Personel Düzenle" : "Yeni Personel"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ad *</Label><Input value={personForm.firstName} onChange={(e) => setPersonForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label>Soyad *</Label><Input value={personForm.lastName} onChange={(e) => setPersonForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
            <div><Label>TC No</Label><Input maxLength={11} value={personForm.tcNo} onChange={(e) => setPersonForm((f) => ({ ...f, tcNo: e.target.value }))} /></div>
            <div><Label>Pozisyon *</Label><Input value={personForm.position} onChange={(e) => setPersonForm((f) => ({ ...f, position: e.target.value }))} /></div>
            <div>
              <Label>Departman</Label>
              <Select value={personForm.departmentId || "none"} onValueChange={(v) => setPersonForm((f) => ({ ...f, departmentId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Yok —</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>İşe Başlama *</Label><Input type="date" value={personForm.startDate} onChange={(e) => setPersonForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={personForm.phone} onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>E-posta</Label><Input type="email" value={personForm.email} onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Maaş (₺)</Label><Input type="number" value={personForm.salary} onChange={(e) => setPersonForm((f) => ({ ...f, salary: e.target.value }))} /></div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="isActive" checked={personForm.isActive} onChange={(e) => setPersonForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <Label htmlFor="isActive">Aktif</Label>
            </div>
            <div className="col-span-2"><Label>Notlar</Label><Textarea rows={2} value={personForm.notes} onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPersonnelModal(false)}>İptal</Button>
            <Button onClick={savePerson}>{editingPerson ? "Güncelle" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Departman Modal ──────────────────────────────────────────────── */}
      <Dialog open={showDeptModal} onOpenChange={setShowDeptModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingDept ? "Departman Düzenle" : "Yeni Departman"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Ad *</Label><Input value={deptForm.name} onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Açıklama</Label><Textarea rows={2} value={deptForm.description} onChange={(e) => setDeptForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeptModal(false)}>İptal</Button>
            <Button onClick={saveDept}>{editingDept ? "Güncelle" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── İzin Modal ──────────────────────────────────────────────────── */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>İzin Talebi Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Personel *</Label>
              <Select value={leaveForm.personnelId} onValueChange={(v) => setLeaveForm((f) => ({ ...f, personnelId: v }))}>
                <SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger>
                <SelectContent>
                  {personnel.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.fullName} — {p.position}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>İzin Türü *</Label>
              <Select value={leaveForm.type} onValueChange={(v) => setLeaveForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Başlangıç</Label><Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>Bitiş</Label><Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
              <div><Label>Gün</Label><Input type="number" min={1} value={leaveForm.days} onChange={(e) => setLeaveForm((f) => ({ ...f, days: e.target.value }))} /></div>
            </div>
            <div><Label>Açıklama</Label><Textarea rows={2} value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveModal(false)}>İptal</Button>
            <Button onClick={saveLeave}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
