import { useState, useEffect, useMemo } from "react";
import { useListUsers, useCreateUser, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Mail, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const INVITES_LS = "ticarium-mgmt-pending-invites-v1";

type PendingInvite = { email: string; role: "admin" | "staff" | "viewer"; sentAt: number };

function loadInvites(): PendingInvite[] {
  try {
    const raw = sessionStorage.getItem(INVITES_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingInvite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInvites(list: PendingInvite[]) {
  sessionStorage.setItem(INVITES_LS, JSON.stringify(list));
}

function roleBadgeProps(role: string) {
  switch (role) {
    case "admin":
      return { tone: "brand" as const, label: "Admin" };
    case "staff":
      return { tone: "neutral" as const, label: "Staff" };
    case "viewer":
      return {
        tone: "neutral" as const,
        label: "Viewer",
        className:
          "border-[color:var(--color-border-subtle)] bg-muted text-muted-foreground font-medium",
      };
    default:
      return { tone: "neutral" as const, label: role };
  }
}

export default function UsersList() {
  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: number; fullName: string } | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: "", role: "staff" as "admin" | "staff" | "viewer" });
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    role: "staff" as "admin" | "staff" | "viewer",
  });

  useEffect(() => {
    setPendingInvites(loadInvites());
  }, []);

  useEffect(() => {
    const emails = new Set(
      (users ?? []).map((u) => (u.email || "").toLowerCase()).filter(Boolean)
    );
    setPendingInvites((prev) => {
      const next = prev.filter((p) => !emails.has(p.email.toLowerCase()));
      if (next.length === prev.length) return prev;
      saveInvites(next);
      return next;
    });
  }, [users]);

  const visiblePending = useMemo(() => {
    const list = users ?? [];
    return pendingInvites.filter(
      (p) => !list.some((u) => (u.email || "").toLowerCase() === p.email.trim().toLowerCase())
    );
  }, [pendingInvites, users]);

  const pushInvite = (inv: PendingInvite) => {
    const next = [...pendingInvites.filter((x) => x.email.toLowerCase() !== inv.email.toLowerCase()), inv];
    setPendingInvites(next);
    saveInvites(next);
  };

  const cancelInvite = (email: string) => {
    const next = pendingInvites.filter((x) => x.email.toLowerCase() !== email.toLowerCase());
    setPendingInvites(next);
    saveInvites(next);
    toast({ title: "Davet kaldırıldı" });
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteForm.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Geçerli bir e-posta girin", variant: "destructive" });
      return;
    }
    pushInvite({ email, role: inviteForm.role, sentAt: Date.now() });
    toast({ title: "Davet kaydedildi", description: `${email} adresine davet gönderildi (yerel önizleme).` });
    setInviteOpen(false);
    setInviteForm({ email: "", role: "staff" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser.mutateAsync({ data: formData });
      toast({ title: "Başarılı", description: "Kullanıcı oluşturuldu." });
      setCreateOpen(false);
      setFormData({ username: "", password: "", fullName: "", email: "", role: "staff" });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error: unknown) {
      const msg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({ title: "Hata", description: msg || "Kullanıcı oluşturulamadı.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive } });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch {
      toast({ title: "Hata", description: "Durum güncellenemedi.", variant: "destructive" });
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    await handleToggleActive(deactivateTarget.id, false);
    setDeactivateTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Kullanıcı Yönetimi
          </h1>
          <p className="text-muted-foreground mt-1">Sistem erişimlerini ve rolleri yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button variant="default">
                <Mail className="mr-2 h-4 w-4" />
                Davet et
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Kullanıcı davet et</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInviteSubmit} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">E-posta</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="ornek@sirket.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    value={inviteForm.role}
                    onValueChange={(val: "admin" | "staff" | "viewer") =>
                      setInviteForm((p) => ({ ...p, role: val }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Davet gönder
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Kullanıcı oluştur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni kullanıcı (şifre ile)</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Şifre</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Ad Soyad</Label>
                  <Input
                    id="fullName"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Yetki Rolü</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(val: "admin" | "staff" | "viewer") => setFormData({ ...formData, role: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createUser.isPending}>
                    {createUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Oluştur
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-center">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Yükleniyor...
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visiblePending.map((inv) => {
                    const rb = roleBadgeProps(inv.role);
                    return (
                      <TableRow key={`pending:${inv.email}`} className="bg-muted/25">
                        <TableCell>
                          <p className="font-medium text-muted-foreground">Bekleyen davet</p>
                          <p className="text-sm text-muted-foreground">{inv.email}</p>
                        </TableCell>
                        <TableCell className="text-sm">—</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={rb.tone} size="sm" className={cn("uppercase tracking-wide", rb.className)}>
                              {rb.label}
                            </Badge>
                            <Badge tone="warning" size="sm" dot>
                              Beklemede
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button type="button" variant="ghost" size="sm" onClick={() => cancelInvite(inv.email)}>
                            İptal
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(users ?? []).map((user) => {
                    const rb = roleBadgeProps(user.role);
                    const switchChecked = deactivateTarget?.id === user.id ? true : Boolean(user.isActive);
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <p className="font-bold">{user.fullName}</p>
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        </TableCell>
                        <TableCell className="text-sm">{user.email || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={rb.tone} size="sm" className={cn("uppercase tracking-wide", rb.className)}>
                              {rb.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={switchChecked}
                            onCheckedChange={(val) => {
                              if (val) {
                                void handleToggleActive(user.id, true);
                              } else if (user.isActive) {
                                setDeactivateTarget({ id: user.id, fullName: user.fullName });
                              }
                            }}
                            disabled={updateUser.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kullanıcıyı pasifleştir</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.fullName} kullanıcısı oturum açamaz. İstediğiniz zaman yeniden
              aktifleştirebilirsiniz. Bu işlem kullanıcıyı kalıcı olarak silmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDeactivate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Pasifleştir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
