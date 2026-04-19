import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Search, FileText, ShoppingBasket, Inbox } from "lucide-react";
import { useAuth } from "@/components/auth-context";

export default function SatinalmaHome() {
  const { user } = useAuth();
  const accountType = ((user as any)?.accountType ?? "seller") as "buyer" | "seller" | "both";
  const isBuyer = accountType === "buyer" || accountType === "both";
  const isSeller = accountType === "seller" || accountType === "both";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingBasket className="h-7 w-7 text-blue-600" />
          Satınalma Paneli
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tedarikçi keşfedin, teklif talebi gönderin, en iyi fiyatları karşılaştırın.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isBuyer && (
          <>
            <Link href="/satinalma/kesfet">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-discovery">
                <CardContent className="p-5 space-y-2">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Search className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">Tedarikçi Keşfet</h3>
                  <p className="text-sm text-muted-foreground">Sektör ve firma adına göre satıcı ara.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/satinalma/rfqs/new">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-new-rfq">
                <CardContent className="p-5 space-y-2">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">Yeni Teklif Talebi</h3>
                  <p className="text-sm text-muted-foreground">Birden çok satıcıya tek seferde RFQ gönder.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/satinalma/rfqs">
              <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-rfqs">
                <CardContent className="p-5 space-y-2">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <ShoppingBasket className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">RFQ'larım</h3>
                  <p className="text-sm text-muted-foreground">Açık/kapalı talepleri ve gelen teklifleri gör.</p>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
        {isSeller && (
          <Link href="/satinalma/inbox">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="card-inbox">
              <CardContent className="p-5 space-y-2">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Inbox className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="font-semibold">Gelen RFQ Kutusu</h3>
                <p className="text-sm text-muted-foreground">Müşterilerinizden gelen teklif taleplerine yanıt verin.</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
