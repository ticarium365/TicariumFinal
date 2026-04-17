import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Star, MapPin, Phone, Globe, Tag, MessageSquare, Package, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-context";
import { apiBase } from "@/lib/api";

interface Review {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  fromCompanyName: string;
}

interface ProfileData {
  id: number;
  companyName: string;
  companySubdomain: string;
  companyLogo: string | null;
  companyColor: string;
  sector: string | null;
  city: string | null;
  district: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  acceptOffers: boolean;
  acceptOrders: boolean;
  trustScore: number;
  reviewCount: number;
  tags: string[];
  isOnline: boolean;
  showPrice: boolean;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-7 w-7 cursor-pointer transition-colors ${s <= (hovered || value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{review.fromCompanyName}</p>
          <div className="flex mt-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} className={`h-3.5 w-3.5 ${s <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
            ))}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(review.createdAt).toLocaleDateString("tr-TR")}
        </span>
      </div>
      {review.comment && (
        <p className="text-sm text-muted-foreground">{review.comment}</p>
      )}
    </div>
  );
}

interface Props { subdomain: string }

export default function CompanyProfilePage({ subdomain }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<{ profile: ProfileData; reviews: Review[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/network/companies/${subdomain}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setProfileData)
      .catch(() => navigate("/network"))
      .finally(() => setLoading(false));
  }, [subdomain]);

  async function submitReview() {
    if (!rating) return toast({ title: "Puan seçin", variant: "destructive" });
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/network/companies/${subdomain}/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) throw new Error("fail");
      toast({ title: "Değerlendirme gönderildi" });
      setRating(0);
      setComment("");
      const r = await fetch(`${apiBase}/network/companies/${subdomain}`, { credentials: "include" });
      setProfileData(await r.json());
    } catch {
      toast({ title: "Hata", description: "Değerlendirme gönderilemedi", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-40" />
        <div className="h-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!profileData) return null;

  const { profile, reviews } = profileData;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Link href="/network">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Ağa Dön
        </Button>
      </Link>

      <Card className="overflow-hidden">
        <div className="h-2 w-full" style={{ backgroundColor: profile.companyColor }} />
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {profile.companyLogo ? (
              <img src={profile.companyLogo} alt={profile.companyName} className="h-20 w-20 rounded-xl object-contain border shrink-0" />
            ) : (
              <div className="h-20 w-20 rounded-xl flex items-center justify-center text-white font-bold text-3xl shrink-0" style={{ backgroundColor: profile.companyColor }}>
                {profile.companyName.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{profile.companyName}</h1>
                  {profile.sector && (
                    <p className="text-muted-foreground mt-0.5">{profile.sector}</p>
                  )}
                </div>
                {profile.isOnline && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block mr-1.5 animate-pulse" />
                    Çevrimiçi
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                {profile.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {profile.city}{profile.district ? `, ${profile.district}` : ""}
                  </span>
                )}
                {profile.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4" />
                    {profile.phone}
                  </span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                    <Globe className="h-4 w-4" />
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(profile.trustScore) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                  ))}
                  <span className="text-sm font-medium ml-1">{profile.trustScore > 0 ? profile.trustScore.toFixed(1) : "—"}</span>
                  <span className="text-sm text-muted-foreground">({profile.reviewCount} yorum)</span>
                </div>
              </div>
            </div>
          </div>

          {profile.description && (
            <p className="mt-5 text-sm text-muted-foreground leading-relaxed">{profile.description}</p>
          )}

          {profile.tags && profile.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {(profile.acceptOffers || profile.acceptOrders) && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {profile.acceptOffers && (
                <div className="flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Teklif Kabul Ediyor
                </div>
              )}
              {profile.acceptOrders && (
                <div className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <Package className="h-4 w-4" />
                  Sipariş Kabul Ediyor
                </div>
              )}
              {profile.acceptOffers && user && (
                <Link href={`/b2b/quotes/new?company=${profile.companySubdomain}`}>
                  <Button size="sm" className="ml-auto">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Teklif İste
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Değerlendirmeler ({reviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Henüz değerlendirme yok
              </p>
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4" />
              Değerlendirme Yap
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user ? (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Puanınız</p>
                  <StarPicker value={rating} onChange={setRating} />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Yorum (opsiyonel)</p>
                  <Textarea
                    placeholder="Bu firma ile deneyiminizi paylaşın..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button onClick={submitReview} disabled={submitting || !rating} className="w-full">
                  {submitting ? "Gönderiliyor..." : "Değerlendirmeyi Gönder"}
                </Button>
              </>
            ) : (
              <div className="text-center py-6">
                <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Değerlendirme yapmak için giriş yapmalısınız</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
