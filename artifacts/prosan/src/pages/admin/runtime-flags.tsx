import { useEffect, useState } from "react";

interface RuntimeFlag {
  id: number;
  key: string;
  companyId: number | null;
  enabled: boolean;
  rolloutPct: number;
  description: string | null;
  expiresAt: string | null;
}

export default function RuntimeFlagsAdminPage() {
  const [flags, setFlags] = useState<RuntimeFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "", enabled: true, rolloutPct: 100, description: "", companyId: "" });
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/runtime-flags", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setFlags(j.flags || []);
    } catch (e: any) { setError(e.message || "yükleme hatası"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function upsert(payload: Partial<RuntimeFlag>) {
    const r = await fetch("/api/admin/runtime-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Bayrak silinsin mi?")) return;
    setSavingId(id);
    try {
      await fetch(`/api/admin/runtime-flags/${id}`, { method: "DELETE", credentials: "include" });
      await load();
    } finally { setSavingId(null); }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Runtime Feature Flags</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Kademeli özellik açma. Şirket bazlı override {">"} global {">"} yüzdelik rollout.
        Cache TTL 30 saniye.
      </p>

      <div className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold">Yeni Bayrak / Güncelle</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <input
            placeholder="key (örn: new_pos_ui)"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm sm:col-span-2 dark:bg-zinc-900"
            data-testid="input-flag-key"
          />
          <input
            placeholder="companyId (boş = global)"
            value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm dark:bg-zinc-900"
            data-testid="input-flag-company"
          />
          <input
            type="number" min={0} max={100}
            value={form.rolloutPct}
            onChange={(e) => setForm({ ...form, rolloutPct: Number(e.target.value) })}
            className="rounded border px-2 py-1.5 text-sm dark:bg-zinc-900"
            data-testid="input-flag-rollout"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Aktif
          </label>
          <button
            onClick={() => upsert({
              key: form.key,
              companyId: form.companyId ? Number(form.companyId) : null,
              enabled: form.enabled,
              rolloutPct: form.rolloutPct,
              description: form.description || null,
            }).catch((e) => setError(e.message))}
            disabled={!form.key}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            data-testid="button-flag-save"
          >Kaydet</button>
          <input
            placeholder="açıklama (opsiyonel)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="rounded border px-2 py-1.5 text-sm sm:col-span-6 dark:bg-zinc-900"
            data-testid="input-flag-desc"
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="text-sm text-zinc-500">Yükleniyor...</div>}

      <table className="w-full border-collapse text-sm" data-testid="table-runtime-flags">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Key</th>
            <th>Scope</th>
            <th>Aktif</th>
            <th>Rollout %</th>
            <th>Açıklama</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id} className="border-b hover:bg-zinc-50 dark:hover:bg-zinc-900" data-testid={`row-flag-${f.id}`}>
              <td className="py-2 font-mono text-xs">{f.key}</td>
              <td>{f.companyId ? `Şirket #${f.companyId}` : "Global"}</td>
              <td>{f.enabled ? "✓" : "✗"}</td>
              <td>{f.rolloutPct}%</td>
              <td className="text-xs text-zinc-500">{f.description || "—"}</td>
              <td>
                <button
                  disabled={savingId === f.id}
                  onClick={() => remove(f.id)}
                  className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/150/10 disabled:opacity-50"
                  data-testid={`button-delete-flag-${f.id}`}
                >Sil</button>
              </td>
            </tr>
          ))}
          {!loading && flags.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-zinc-500">Henüz bayrak tanımlı değil.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
