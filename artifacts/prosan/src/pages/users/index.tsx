import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Shield, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function UsersList() {
  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    role: "staff" as const
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser.mutateAsync({ data: formData });
      toast({ title: "Başarılı", description: "Kullanıcı oluşturuldu." });
      setIsOpen(false);
      setFormData({ username: "", password: "", fullName: "", email: "", role: "staff" });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error: any) {
      toast({ title: "Hata", description: error?.response?.data?.message || "Kullanıcı oluşturulamadı.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive } });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error) {
      toast({ title: "Hata", description: "Durum güncellenemedi.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) return;
    try {
      await deleteUser.mutateAsync({ id });
      toast({ title: "Başarılı", description: "Kullanıcı silindi." });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error) {
      toast({ title: "Hata", description: "Silme işlemi başarısız.", variant: "destructive" });
    }
  };

  const roleColors: Record<string, string> = {
    admin: "destructive",
    staff: "primary",
    viewer: "secondary"
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Kullanıcı Yönetimi</h1>
          <p className="text-muted-foreground mt-1">Sistem erişimlerini ve rolleri yönetin.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Kullanıcı
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Kullanıcı Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <Input id="username" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input id="password" type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Ad Soyad</Label>
                <Input id="fullName" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-posta</Label>
                <Input id="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Yetki Rolü</Label>
                <Select value={formData.role} onValueChange={(val: any) => setFormData({...formData, role: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Yönetici (Admin)</SelectItem>
                    <SelectItem value="staff">Personel (Staff)</SelectItem>
                    <SelectItem value="viewer">İzleyici (Viewer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Oluştur"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Yükleniyor...</TableCell>
                </TableRow>
              ) : (
                users?.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-bold">{user.fullName}</p>
                      <p className="text-sm text-muted-foreground">@{user.username}</p>
                    </TableCell>
                    <TableCell className="text-sm">{user.email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role] as any} className="uppercase text-[10px] tracking-wider">
                        {user.role === 'admin' ? 'YÖNETİCİ' : user.role === 'staff' ? 'PERSONEL' : 'İZLEYİCİ'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch 
                        checked={user.isActive} 
                        onCheckedChange={(val) => handleToggleActive(user.id, val)}
                        disabled={updateUser.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(user.id)} disabled={deleteUser.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}