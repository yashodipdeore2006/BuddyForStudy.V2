import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { CheckCircle2, Clock3, Copy, FileText, RefreshCcw, RotateCcw, Save, UploadCloud, WandSparkles } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminTabs } from "@/components/admin/AdminUI";

type PromptFeature = "build_with_ai" | "lesson_summary";
type PromptVersion = {
  id: string;
  feature: PromptFeature;
  version: number;
  name: string;
  contentHash: string;
  notes?: string;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
type ActivePrompt = {
  feature: PromptFeature;
  source: "built_in" | "version";
  versionId: string | null;
  version: number | null;
  name: string;
  prompt: string;
  contentHash: string;
  createdAt?: string | null;
};
type PromptInfo = {
  feature: PromptFeature;
  label: string;
  description: string;
  requiredPlaceholders: string[];
  maxLength: number;
  builtInDefault: { name: string; prompt: string };
  active: ActivePrompt;
  versions: PromptVersion[];
};

const FEATURE_OPTIONS = [
  { value: "build_with_ai", label: "Build with AI" },
  { value: "lesson_summary", label: "Lesson summary" }
] as const;

function nextVersionName(info: PromptInfo) {
  const next = Math.max(0, ...info.versions.map((version) => version.version)) + 1;
  return `${info.label} v${next}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Date unavailable";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Date unavailable" : timestamp.toLocaleString();
}

export default function AIPromptVersionsPanel() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [feature, setFeature] = useState<PromptFeature>("build_with_ai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [promptText, setPromptText] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [activateAfterSave, setActivateAfterSave] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/api/admin/prompts");
      setPrompts((data.prompts || []) as PromptInfo[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load AI prompt versions.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = prompts.find((item) => item.feature === feature);
  useEffect(() => {
    if (!selected) return;
    setPromptText(selected.active.prompt);
    setName(nextVersionName(selected));
    setNotes("");
  }, [feature, selected]);

  function selectFeature(value: string) {
    if (value === "build_with_ai" || value === "lesson_summary") {
      setFeature(value);
      setError("");
      setNotice("");
    }
  }

  async function loadVersionIntoEditor(version: PromptVersion) {
    setLoadingVersionId(version.id);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch(`/api/admin/prompts/${feature}/versions/${encodeURIComponent(version.id)}`);
      const body = String(data.version?.prompt || "");
      if (!body) throw new Error("This prompt version has no content.");
      setPromptText(body);
      setName(`${version.name} copy`.slice(0, 120));
      setNotes(`Based on version ${version.version}; update this note before saving if needed.`);
      setNotice(`Version ${version.version} copied into the editor. Saving it will create a new immutable version.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load that prompt version.");
    } finally {
      setLoadingVersionId(null);
    }
  }

  async function readPromptFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !selected) return;
    setError("");
    setNotice("");
    if (file.size > selected.maxLength * 4) {
      setError(`The file is too large. ${selected.label} prompts must be ${selected.maxLength.toLocaleString()} characters or fewer.`);
      input.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (text.length > selected.maxLength) {
        setError(`The file is too large. ${selected.label} prompts must be ${selected.maxLength.toLocaleString()} characters or fewer.`);
        return;
      }
      setPromptText(text);
      setName(file.name.replace(/\.(txt|md|prompt)$/i, "").slice(0, 120) || nextVersionName(selected));
      setNotes(`Uploaded from ${file.name}`);
      setNotice("Prompt file loaded into the editor. Review the content and required placeholders before saving.");
    } catch {
      setError("Unable to read that file. Use a UTF-8 .txt or .md prompt file.");
    } finally {
      input.value = "";
    }
  }

  async function saveVersion() {
    if (!selected) return;
    if (name.trim().length < 1 || name.trim().length > 120) {
      setError("Enter a version name of 1–120 characters.");
      return;
    }
    if (promptText.trim().length < 100 || promptText.length > selected.maxLength) {
      setError(`The prompt must contain 100–${selected.maxLength.toLocaleString()} characters.`);
      return;
    }
    const missing = selected.requiredPlaceholders.filter((key) => !promptText.includes(`{{${key}}}`));
    if (missing.length) {
      setError("Required placeholders are missing: " + missing.map((key) => `{{${key}}}`).join(", ") + ".");
      return;
    }
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError("Enter a change reason between 10 and 500 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await adminFetch(`/api/admin/prompts/${feature}/versions`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          prompt: promptText,
          notes: notes.trim(),
          reason: reason.trim(),
          activate: activateAfterSave
        })
      });
      setReason("");
      setNotice(activateAfterSave
        ? "New prompt version saved and activated. Future uncached generations will use it."
        : "New prompt version saved. The active version has not changed.");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the prompt version.");
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(versionId: string | null) {
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError("Enter a change reason between 10 and 500 characters before switching versions.");
      return;
    }
    setActivatingId(versionId || "built_in");
    setError("");
    setNotice("");
    try {
      await adminFetch(`/api/admin/prompts/${feature}/activate`, {
        method: "POST",
        body: JSON.stringify({ versionId, reason: reason.trim() })
      });
      setReason("");
      setNotice(versionId ? "Active prompt switched. New generations will use the selected version." : "Built-in default prompt restored.");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to switch the active prompt.");
    } finally {
      setActivatingId(null);
    }
  }

  const activeIsBuiltin = selected?.active.source === "built_in";

  return (
    <section className="space-y-5" aria-labelledby="ai-prompt-versions-title">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-700"><WandSparkles className="h-4 w-4" /> Versioned prompt studio</p>
            <h2 id="ai-prompt-versions-title" className="mt-2 text-xl font-extrabold text-slate-950">AI prompt versions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Upload a new prompt, preserve immutable history, and switch between releases without deploying code. Active prompt changes apply to future generation requests; existing generated content is not rewritten.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary shrink-0"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <AdminTabs ariaLabel="Prompt feature" value={feature} onChange={selectFeature} items={FEATURE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />

      {loading && !selected ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading prompt configuration…</div>
      ) : selected ? (
        <>
          <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
            Change reason (required for upload and activation)
            <input className="input-field mt-2" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} placeholder="Why is this prompt version being created or activated?" aria-describedby="prompt-version-reason-help" />
            <span id="prompt-version-reason-help" className="mt-1 block text-xs font-normal text-slate-500">10–500 characters. Prompt creation and activation/rollback actions are recorded in the audit log. {reason.trim().length}/500</span>
          </label>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-950">{selected.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{selected.description}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {activeIsBuiltin ? "Built-in default active" : `v${selected.active.version} active`}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">New version name
                  <input className="input-field mt-2" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={nextVersionName(selected)} />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Upload prompt file
                  <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-medium normal-case text-slate-600">
                    <UploadCloud className="h-4 w-4 shrink-0 text-violet-600" />
                    <input type="file" accept=".txt,.md,.prompt,text/plain,text/markdown" onChange={(event) => void readPromptFile(event)} className="min-w-0 w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-violet-100 file:px-2 file:py-1.5 file:font-semibold file:text-violet-800" />
                  </span>
                </label>
              </div>

              <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">Prompt content
                <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} maxLength={selected.maxLength} spellCheck={false} className="input-field mt-2 min-h-[360px] w-full resize-y font-mono text-xs leading-6" placeholder="Paste the prompt here or upload a UTF-8 text/Markdown file." />
                <span className="mt-1 flex flex-wrap justify-between gap-2 text-xs font-normal text-slate-500">
                  <span>{promptText.length.toLocaleString()} / {selected.maxLength.toLocaleString()} characters</span>
                  <span>UTF-8 .txt or .md files accepted</span>
                </span>
              </label>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Required placeholders</p>
                <p className="mt-2 text-xs leading-6 text-slate-600">Keep these exact tokens in the prompt so live learner context can be injected safely.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.requiredPlaceholders.map((key) => {
                    const token = `{{${key}}}`;
                    const present = promptText.includes(token);
                    return <span key={key} className={`rounded-lg border px-2 py-1 font-mono text-xs ${present ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{token}</span>;
                  })}
                </div>
              </div>

              <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">Release notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} className="input-field mt-2 w-full resize-y text-sm normal-case" placeholder="What changed in this version, and why?" />
              </label>

              <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={activateAfterSave} onChange={(event) => setActivateAfterSave(event.target.checked)} />
                <span><span className="font-semibold">Activate immediately after saving</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Turn off to upload a draft version first. All versions stay in history either way.</span></span>
              </label>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void saveVersion()} disabled={saving || promptText.trim().length < 100 || promptText.length > selected.maxLength || reason.trim().length < 10 || reason.trim().length > 500 || selected.requiredPlaceholders.some((key) => !promptText.includes(`{{${key}}}`))} className="btn-primary"><Save className="h-4 w-4" /> {saving ? "Saving version…" : activateAfterSave ? "Save & activate new version" : "Save new version"}</button>
                <button type="button" onClick={() => { setPromptText(selected.active.prompt); setName(nextVersionName(selected)); setNotes(""); setError(""); setNotice("Editor reset to the currently active prompt."); }} disabled={saving} className="btn-secondary"><RotateCcw className="h-4 w-4" /> Reset to active</button>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileText className="h-4 w-4 text-violet-600" /> Active version</h3>
                <p className="mt-3 font-semibold text-slate-800">{selected.active.name}</p>
                <p className="mt-1 text-xs text-slate-500">{selected.active.source === "built_in" ? "Built into the server as the default." : `Version ${selected.active.version} · saved ${formatDate(selected.active.createdAt)}`}</p>
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs leading-5 text-slate-600">{selected.versions.length} saved version{selected.versions.length === 1 ? "" : "s"} retained for this feature.</p>
                  {selected.active.contentHash && selected.active.source === "version" && <p className="mt-2 break-all font-mono text-[10px] text-slate-400">SHA-256 {selected.active.contentHash}</p>}
                </div>
                {!activeIsBuiltin && <button type="button" onClick={() => void activateVersion(null)} disabled={activatingId !== null || reason.trim().length < 10 || reason.trim().length > 500} className="btn-secondary mt-4 w-full"><RotateCcw className="h-4 w-4" /> Restore built-in default</button>}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Clock3 className="h-4 w-4 text-violet-600" /> Version history</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Versions are immutable. Copy an older version to create an edited successor, or activate it to roll back.</p>
                <div className="mt-4 space-y-3">
                  {selected.versions.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No saved versions yet. The built-in default is currently available.</p>}
                  {selected.versions.map((version) => {
                    const isActive = selected.active.source === "version" && selected.active.versionId === version.id;
                    return <article key={version.id} className={`rounded-xl border p-3 ${isActive ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">v{version.version} · {version.name}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatDate(version.createdAt)}</p>
                        </div>
                        {isActive && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">ACTIVE</span>}
                      </div>
                      {version.notes && <p className="mt-2 text-xs leading-5 text-slate-600">{version.notes}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void loadVersionIntoEditor(version)} disabled={loadingVersionId !== null || saving} className="btn-secondary px-2.5 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /> {loadingVersionId === version.id ? "Loading…" : "Copy to editor"}</button>
                        {!isActive && <button type="button" onClick={() => void activateVersion(version.id)} disabled={activatingId !== null || reason.trim().length < 10 || reason.trim().length > 500} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40">{activatingId === version.id ? "Switching…" : "Activate"}</button>}
                      </div>
                    </article>;
                  })}
                </div>
              </section>
            </aside>
          </div>

        </>
      ) : null}
    </section>
  );
}
