import { useAuth } from "@/components/auth-context";
import { NAV_GROUPS } from "@/components/nav-config";
import { useMenuPrefs } from "@/components/use-menu-prefs";
import { useFeatures } from "@/components/use-features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lock, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MenuPrefsPage() {
  const { user } = useAuth();
  const { hidden, isHidden, toggle, setMany } = useMenuPrefs();
  const { has, planName } = useFeatures();
  const { toast } = useToast();

  if (!user) return null;

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) }))
    .filter((g) => g.items.length > 0);

  const totalCount = visibleGroups.reduce((s, g) => s + g.items.length, 0);
  const hiddenCount = hidden.length;

  return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Menü Tercihleri</h1>
          <p className="text-slate-600 mt-1 text-sm">
            Sol menüde görmek istemediğiniz öğeleri kapatın. Tercihleriniz bu cihaza kaydedilir;
            istediğiniz zaman tekrar açabilirsiniz.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {totalCount - hiddenCount} / {totalCount} menü öğesi görünür
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">Paket: <span className="font-semibold">{planName}</span></p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMany([]);
                toast({ title: "Sıfırlandı", description: "Tüm menü öğeleri tekrar görünür." });
              }}
              disabled={hiddenCount === 0}
              data-testid="button-reset-menu-prefs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Tümünü göster
            </Button>
          </CardHeader>
        </Card>

        {visibleGroups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                <g.icon className="h-4 w-4" />
                {g.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {g.items.map((item) => {
                  const off = isHidden(item.href);
                  const locked = item.feature ? !has(item.feature) : false;
                  return (
                    <label
                      key={item.href}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-50 ${
                        off ? "opacity-50" : ""
                      }`}
                      data-testid={`menu-pref-row-${item.href.replace(/\//g, "-").replace(/^-/, "")}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="text-sm truncate">{item.label}</span>
                        {locked && <Lock className="h-3 w-3 text-amber-600 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {off ? (
                          <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        <Switch
                          checked={!off}
                          onCheckedChange={() => toggle(item.href)}
                          data-testid={`menu-pref-switch-${item.href.replace(/\//g, "-").replace(/^-/, "")}`}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
  );
}
