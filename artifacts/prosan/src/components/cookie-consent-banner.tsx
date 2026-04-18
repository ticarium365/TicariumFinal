import { useEffect, useState } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "ticarium365_cookie_consent_v1";
const CONSENT_VERSION_URL = "/api/kvkk/consent/version";
const CONSENT_POST_URL = "/api/kvkk/consent";

interface ConsentChoice {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
  version: string;
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch { setVisible(true); }
  }, []);

  async function persistConsent(choice: Omit<ConsentChoice, "acceptedAt" | "version">) {
    let version = "v1.2026.04";
    try {
      const r = await fetch(CONSENT_VERSION_URL);
      if (r.ok) version = (await r.json()).version || version;
    } catch { /* offline ok */ }

    const fullChoice: ConsentChoice = {
      essential: true,
      analytics: choice.analytics,
      marketing: choice.marketing,
      acceptedAt: new Date().toISOString(),
      version,
    };

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fullChoice)); } catch {/* */}

    for (const type of ["essential", choice.analytics ? "analytics" : null, choice.marketing ? "marketing" : null].filter(Boolean) as string[]) {
      try {
        await fetch(CONSENT_POST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consentType: type, accepted: true }),
        });
      } catch { /* offline ok, localStorage saklı */ }
    }

    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Çerez tercihleri"
      className="fixed inset-x-0 bottom-0 z-[9999] border-t border-emerald-200 bg-card shadow-2xl dark:border-emerald-900 dark:bg-zinc-950"
      data-testid="cookie-consent-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
          <p>
            Bu site, deneyiminizi iyileştirmek için zorunlu çerezler kullanır.
            Analiz ve pazarlama çerezlerini onaylarsanız hizmetlerimizi geliştirebiliriz.{" "}
            <Link href="/kvkk" className="font-medium text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400">
              KVKK Aydınlatma Metni
            </Link>
          </p>
          {showDetails && (
            <div className="mt-3 space-y-2 rounded-md bg-emerald-50 p-3 text-xs dark:bg-emerald-950/30">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked disabled />
                <span><strong>Zorunlu</strong> — Oturum, güvenlik (devre dışı bırakılamaz)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
                <span><strong>Analitik</strong> — Anonim kullanım istatistikleri</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span><strong>Pazarlama</strong> — Kişiselleştirilmiş içerik</span>
              </label>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            data-testid="button-cookie-customize"
          >
            {showDetails ? "Gizle" : "Tercihleri Yönet"}
          </button>
          <button
            onClick={() => persistConsent({ essential: true, analytics: false, marketing: false })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            data-testid="button-cookie-reject"
          >
            Sadece Zorunlu
          </button>
          <button
            onClick={() => persistConsent({ essential: true, analytics: showDetails ? analytics : true, marketing: showDetails ? marketing : false })}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            data-testid="button-cookie-accept"
          >
            {showDetails ? "Seçimi Kaydet" : "Tümünü Kabul Et"}
          </button>
        </div>
      </div>
    </div>
  );
}
