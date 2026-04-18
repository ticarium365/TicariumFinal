import React from "react";
import "./_group.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  BarChart3, 
  Store, 
  LineChart, 
  Zap,
  Globe
} from "lucide-react";

export function LogoConcepts() {
  return (
    <div className="min-h-screen bg-background p-12 font-sans text-foreground">
      <div className="max-w-5xl mx-auto space-y-12">
        <header className="space-y-4">
          <Badge variant="outline" className="text-secondary border-secondary">Ticarium365 Brand Identity</Badge>
          <h1 className="text-4xl font-bold font-display tracking-tight text-primary">Logo Direction Concepts</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Exploring visual identities for Ticarium365. The brand needs to feel trustworthy like a bank, practical for Turkish SMBs, and modern like a premium SaaS.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Concept 1: The Monogram */}
          <Card className="p-10 flex flex-col items-center justify-center text-center space-y-6 hover:shadow-lg transition-all border-2 border-transparent hover:border-primary/10">
            <div className="flex items-center justify-center w-24 h-24 rounded-2xl bg-primary text-white shadow-xl shadow-primary/20">
              <span className="font-display font-bold text-5xl tracking-tighter">T<span className="text-secondary">3</span></span>
            </div>
            <div>
              <h2 className="font-display font-bold text-3xl text-primary tracking-tight">Ticarium<span className="text-secondary font-light">365</span></h2>
            </div>
            <div className="space-y-2 pt-4">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Concept 1: The Monogram</Badge>
              <p className="text-sm text-muted-foreground">A strong, compact T3 badge for app icons, combined with a clean wordmark. Highlights "365" as the continuous service promise.</p>
            </div>
          </Card>

          {/* Concept 2: The Data Pillar */}
          <Card className="p-10 flex flex-col items-center justify-center text-center space-y-6 hover:shadow-lg transition-all border-2 border-transparent hover:border-primary/10">
            <div className="flex items-end space-x-1.5 h-16">
              <div className="w-4 h-8 bg-primary/40 rounded-sm"></div>
              <div className="w-4 h-12 bg-primary/70 rounded-sm"></div>
              <div className="w-4 h-16 bg-secondary rounded-sm"></div>
            </div>
            <div>
              <h2 className="font-display font-bold text-3xl text-foreground tracking-tight">
                ticarium<span className="text-primary font-black">365</span>
              </h2>
            </div>
            <div className="space-y-2 pt-4">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Concept 2: Data Pillar</Badge>
              <p className="text-sm text-muted-foreground">Focuses on growth, analytics, and business scaling. The bar chart motif suggests profit tracking and inventory management.</p>
            </div>
          </Card>

          {/* Concept 3: The Modern Esnaf */}
          <Card className="p-10 flex flex-col items-center justify-center text-center space-y-6 hover:shadow-lg transition-all border-2 border-transparent hover:border-primary/10">
            <div className="relative">
              <Store className="w-16 h-16 text-primary" strokeWidth={1.5} />
              <Zap className="w-6 h-6 text-secondary absolute -right-2 -bottom-2 fill-secondary" />
            </div>
            <div>
              <h2 className="font-display font-bold text-3xl text-primary tracking-tight uppercase">
                TICARIUM<span className="opacity-50">365</span>
              </h2>
            </div>
            <div className="space-y-2 pt-4">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Concept 3: Modern Esnaf</Badge>
              <p className="text-sm text-muted-foreground">Approachable and literal. A storefront icon modernized with a spark, representing the digitization of traditional commerce.</p>
            </div>
          </Card>

          {/* Concept 4: Abstract Continuous */}
          <Card className="p-10 flex flex-col items-center justify-center text-center space-y-6 bg-primary text-white hover:shadow-lg transition-all border-2 border-transparent">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-secondary rounded-full animate-[spin_10s_linear_infinite] border-t-transparent"></div>
              <div className="absolute inset-2 border-4 border-white/50 rounded-full border-b-transparent"></div>
            </div>
            <div>
              <h2 className="font-display font-medium text-3xl tracking-wide">
                ticarium<span className="font-bold text-secondary">365</span>
              </h2>
            </div>
            <div className="space-y-2 pt-4">
              <Badge className="bg-white/10 text-white hover:bg-white/20">Concept 4: Always On</Badge>
              <p className="text-sm text-white/70">A continuous loop representing the "365 days" tagline. Premium, minimalist, and highly abstract for a mature SaaS feel.</p>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
