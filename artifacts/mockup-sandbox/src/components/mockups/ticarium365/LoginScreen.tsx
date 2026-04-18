import React from "react";
import "./_group.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, TrendingUp, ShieldCheck } from "lucide-react";

export function LoginScreen() {
  return (
    <div className="min-h-screen bg-background font-sans flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1280px] h-[800px] bg-card rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-border/50">
        
        {/* Left Side: Brand Storytelling */}
        <div className="hidden md:flex w-1/2 bg-primary relative p-12 flex-col justify-between overflow-hidden">
          {/* Abstract background shapes */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-secondary/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center shadow-xl border border-white/20 mb-6">
              <span className="font-display font-bold text-2xl">T<span className="text-secondary">3</span></span>
            </div>
            <h1 className="font-display font-bold text-4xl text-white tracking-tight mb-2">Ticarium<span className="text-secondary font-light">365</span></h1>
            <p className="text-primary-foreground/80 text-lg">365 gün işinin yanında.</p>
          </div>

          <div className="relative z-10 space-y-8">
            <h2 className="font-display text-4xl font-semibold text-white leading-tight">
              Türkiye'nin esnafı için tasarlandı.
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Tek platform, tam kontrol</h3>
                  <p className="text-primary-foreground/70 text-sm mt-1">Stok, satış, fatura ve cari takibi tek bir yerde.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Gerçek kârınızı görün</h3>
                  <p className="text-primary-foreground/70 text-sm mt-1">Gelişmiş kâr analizi ile işletmenizin sağlığını ölçün.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Güvenli ve bulut tabanlı</h3>
                  <p className="text-primary-foreground/70 text-sm mt-1">Verileriniz banka standartlarında korunur ve yedeklenir.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative z-10">
            <p className="text-primary-foreground/50 text-sm">© 2025 Ticarium365. Tüm hakları saklıdır.</p>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center relative">
          
          <div className="md:hidden flex items-center space-x-2 mb-10">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center">
              <span className="font-display font-bold text-lg">T<span className="text-secondary">3</span></span>
            </div>
            <span className="font-display font-bold text-xl text-primary tracking-tight">Ticarium365</span>
          </div>

          <div className="max-w-md w-full mx-auto space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-display font-bold text-foreground">Hoş Geldiniz</h2>
              <p className="text-muted-foreground">Hesabınıza giriş yaparak işinize devam edin.</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Kullanıcı Adı veya E-posta</Label>
                <Input 
                  id="email" 
                  placeholder="ornek@sirket.com" 
                  className="h-12 bg-muted/50 border-border/50 focus:bg-background rounded-xl"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Şifre</Label>
                  <a href="#" className="text-sm text-primary font-medium hover:underline">Şifremi Unuttum?</a>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className="h-12 bg-muted/50 border-border/50 focus:bg-background rounded-xl"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox id="remember" className="rounded-md border-muted-foreground/30 data-[state=checked]:bg-primary" />
                <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Beni Hatırla
                </Label>
              </div>

              <Button className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                Giriş Yap
              </Button>
            </div>

            <div className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Hesabınız yok mu? <a href="#" className="text-primary font-semibold hover:underline">Demo talep edin</a>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
