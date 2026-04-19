import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center px-4 overflow-hidden"
      style={{
        background:
          "radial-gradient(60% 80% at 20% 10%, hsl(234 89% 60% / 0.15), transparent 60%)," +
          "radial-gradient(50% 70% at 80% 20%, hsl(180 70% 45% / 0.18), transparent 60%)," +
          "linear-gradient(180deg, hsl(224 56% 8%) 0%, hsl(224 56% 12%) 100%)",
      }}
    >
      <div className="t365-card-glass max-w-md w-full rounded-2xl p-8 text-center" style={{ background: "hsl(0 0% 100% / 0.06)" }}>
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, hsl(234 89% 60%) 0%, hsl(180 70% 40%) 100%)" }}>
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-extrabold mb-2 text-white" style={{ fontFamily: "var(--font-display)" }}>404</h1>
        <p className="text-white/70 mb-6">Aradığınız sayfa bulunamadı.</p>
        <Link href="/">
          <Button className="gap-2" data-testid="btn-home">
            <ArrowLeft className="h-4 w-4" />
            Ana sayfaya dön
          </Button>
        </Link>
      </div>
    </div>
  );
}
