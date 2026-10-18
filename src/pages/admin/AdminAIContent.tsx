import { useEffect, useState } from "react";
import { BrainCircuit, Check, RefreshCcw, Save, SlidersHorizontal } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type Setting = { key: string; value: number | boolean; defaultValue: number | boolean; type: "number" | "boolean"; min?: number; max?: number; description: string };
const GROUPS = [
  { title: "AI learning assistant", description: "Control the safe operating limits of lesson summaries and question generation.", keys: ["advanced_ai_questions_per_hour_video", "advanced_ai_questions_unknown_duration", "advanced_ai_max_questions_per_lesson", "advanced_ai_summary_enabled", "advanced_ai_qa_enabled"] },
  { title: "YouTube discovery and course generation", description: "These controls are applied by the course discovery pipeline when new AI-assisted courses are generated.", keys: ["discovery_max_skills_per_course", "discovery_search_results_per_query", "discovery_min_duration_minutes", "discovery_max_duration_minutes", "discovery_exclude_shorts", "discovery_require_embeddable"] },
];

export default function AdminAIContent() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/admin/ai-content/settings");
      const rows: Setting[] = data.settings || [];
      setSettings(rows);
      setDrafts(Object.fromEntries(rows.map((item) => [item.key, item.value])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load AI/content settings.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function save(setting: Setting) {
    const value = drafts[setting.key];
    if (setting.type === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < (setting.min ?? 0) || value > (setting.max ?? Number.MAX_SAFE_INTEGER))) {
      setError("Enter a valid value for " + setting.key + ".");
      return;
    }
    if (setting.key === "discovery_min_duration_minutes") {
      const max = Number(drafts.discovery_max_duration_minutes);
      if (Number(value) > max) { setError("Minimum duration cannot exceed maximum duration."); return; }
    }
    if (setting.key === "discovery_max_duration_minutes") {
      const min = Number(drafts.discovery_min_duration_minutes);
      if (Number(value) < min) { setError("Maximum duration cannot be below minimum duration."); return; }
    }
    setSavingKey(setting.key); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/ai-content/settings/" + encodeURIComponent(setting.key), {
        method: "PUT",
        body: JSON.stringify({ value, reason: "AI & Learning Content Manager updated " + setting.key }),
      });
      setNotice("Saved " + setting.key.replaceAll("_", " ") + ".");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this setting.");
    } finally { setSavingKey(null); }
  }

  const label = (key: string) => key.replace(/^advanced_ai_/, "").replace(/^discovery_/, "").replaceAll("_", " ").replace(/w/g, (letter) => letter.toUpperCase());

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"><BrainCircuit className="h-3.5 w-3.5"/> AI & learning governance</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">AI & content controls</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Manage safe generation limits and discovery quality rules. Provider API keys and secrets are intentionally not exposed here.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading AI settings…</div> : GROUPS.map((group) => <section key={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-violet-600"/><h2 className="font-semibold text-slate-950">{group.title}</h2></div><p className="mt-1 text-sm text-slate-500">{group.description}</p></div>
      <div className="divide-y divide-slate-100">{group.keys.map((key) => {
        const setting = settings.find((item) => item.key === key);
        if (!setting) return null;
        const value = drafts[key];
        const changed = value !== setting.value;
        return <div key={key} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center">
          <div><label htmlFor={"ai-setting-" + key} className="text-sm font-semibold text-slate-800">{label(key)}</label><p className="mt-1 text-xs leading-5 text-slate-500">{setting.description}{setting.type === "number" ? " Range: " + setting.min + "–" + setting.max + "." : ""}</p></div>
          <div>{setting.type === "boolean" ? <label className="flex items-center gap-3 text-sm text-slate-700"><input id={"ai-setting-" + key} type="checkbox" checked={Boolean(value)} onChange={(e) => setDrafts((old) => ({ ...old, [key]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"/>{value ? "Enabled" : "Disabled"}</label> : <input id={"ai-setting-" + key} type="number" min={setting.min} max={setting.max} value={Number(value)} onChange={(e) => setDrafts((old) => ({ ...old, [key]: e.target.value === "" ? Number.NaN : Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"/>}</div>
          <button type="button" onClick={() => void save(setting)} disabled={!changed || savingKey === key} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4"/>{savingKey === key ? "Saving…" : changed ? "Save" : <><Check className="h-4 w-4"/> Saved</>}</button>
        </div>;
      })}</div>
    </section>)}
  </div>;
}
