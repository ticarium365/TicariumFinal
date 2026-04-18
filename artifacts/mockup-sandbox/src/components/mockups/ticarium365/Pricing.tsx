import React from "react";
import "./_group.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Info } from "lucide-react";

export function Pricing() {
  const plans = [
    {
      name: "Stok",
      price: "999",
      tagline: "Temel envanter takibi",
      features: ["Barkod desteği", "Stok kartları", "Basit raporlar", "1 Kullanıcı"],
      cta: "Ücretsiz Dene",
      highlight: false
    },
    {
      name: "Ticaret",
      price: "1.999",
      tagline: "Büyüyen işletmeler için",
      features: ["Stok + Satış Modülü", "Fatura kesimi", "Cari hesap takibi", "3 Kullanıcı"],
      cta: "Ücretsiz Dene",
      highlight: false
    },
    {
      name: "İşletme",
      price: "3.499",
      tagline: "Tam kapsamlı yönetim",
      features: ["Kasa & Banka entegrasyonu", "Çoklu şube desteği", "E-fatura & E-arşiv", "5 Kullanıcı", "Öncelikli destek"],
      cta: "Başla",
      highlight: true
    },
    {
      name: "Büyüme",
      price: "5.999",
      tagline: "İleri düzey özellikler",
      features: ["Sadakat programı", "Dövizli işlemler", "Gelişmiş kâr raporları", "API erişimi", "10 Kullanıcı"],
      cta: "Bize Ulaşın",
      highlight: false
    },
    {
      name: "Kurumsal",
      price: "9.999",
      tagline: "Büyük ölçekli operasyonlar",
      features: ["Bayi yönetimi (B2B)", "White-label seçenekleri", "Özel müşteri temsilcisi", "Sınırsız Kullanıcı", "Özel entegrasyonlar"],
      cta: "Bize Ulaşın",
      highlight: false
    }
  ];

  return (
    <div className="min-h-screen bg-muted/20 font-sans py-20 px-4 md:px-8">
      <div className="max-w-[1400px] mx-auto space-y-16">
        
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <Badge variant="outline" className="text-secondary border-secondary/50 bg-secondary/5 px-4 py-1.5 text-sm rounded-full">Fiyatlandırma</Badge>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight">İşinize uygun planı seçin</h1>
          <p className="text-xl text-muted-foreground">Gizli ücret yok, karmaşık sözleşmeler yok. İşletmeniz büyüdükçe planınızı yükseltin.</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 items-end">
          {plans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative flex flex-col p-6 h-full transition-all duration-300 ${
                plan.highlight 
                  ? "border-primary shadow-2xl shadow-primary/10 lg:-mt-8 lg:mb-8 bg-card" 
                  : "border-border/50 hover:border-primary/30 hover:shadow-lg bg-card/50"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <Badge className="bg-secondary hover:bg-secondary text-white px-4 py-1 font-semibold text-sm rounded-full shadow-sm flex items-center">
                    <Star className="w-3.5 h-3.5 mr-1.5 fill-current" />
                    En Çok Tercih Edilen
                  </Badge>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div>
                  <h3 className={`font-display font-bold text-2xl ${plan.highlight ? 'text-primary' : 'text-foreground'}`}>
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">{plan.tagline}</p>
                </div>
                
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-foreground">₺{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">/ay</span>
                </div>
              </div>

              <Button 
                variant={plan.highlight ? "default" : "outline"} 
                className={`w-full mb-8 font-semibold rounded-xl h-11 ${
                  plan.highlight ? "bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20" : ""
                }`}
              >
                {plan.cta}
              </Button>

              <div className="space-y-4 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Özellikler</p>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start text-sm">
                      <Check className={`w-4 h-4 mr-2 shrink-0 ${plan.highlight ? 'text-secondary' : 'text-primary/60'}`} />
                      <span className="text-foreground/80 leading-tight">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>

        {/* FAQ / Trust section */}
        <div className="max-w-4xl mx-auto pt-12 flex items-start justify-center space-x-3 text-muted-foreground text-sm bg-background p-6 rounded-2xl border border-border/40 shadow-sm">
          <Info className="w-5 h-5 text-primary shrink-0" />
          <p>Tüm planlarda günlük veri yedeği, SSL şifreleme ve mesai saatleri içinde e-posta desteği standart olarak sunulmaktadır. Fiyatlara KDV dahil değildir. Yıllık alımlarda 2 ay hediye!</p>
        </div>

      </div>
    </div>
  );
}
