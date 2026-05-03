import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function SessionExpiryModal() {
  const [open, setOpen] = useState(true);
  const [, setLocation] = useLocation();

  const handleLogin = () => {
    const currentPath = window.location.pathname + window.location.search;
    const loginUrl = `/login?next=${encodeURIComponent(currentPath)}`;
    setLocation(loginUrl, { replace: true });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Oturumunuz Sona Erdi</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Güvenliğiniz için oturum süreniz doldu. Devam etmek için lütfen tekrar giriş yapın.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleLogin} className="w-full">
            Giriş Yap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
