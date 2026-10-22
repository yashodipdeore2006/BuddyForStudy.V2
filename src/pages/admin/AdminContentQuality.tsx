import { useCallback, useEffect, useState } from "react";
import { Activity, Check, FileClock, Link2, RefreshCcw, RotateCcw, Trash2, X, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";
import { AdminPageHeader, AdminBadge } from "@/components/admin/AdminUI";

type Tab = "courses" | "review" | "quiz" | "insight" | "qa" | "roadmaps" | "links";
type Revision = { _id: string; revisionNumber: number; changedBy?: { name?: string; email?: string }; changeSource: string; reason: string; summary: string; createdAt: string };
type ApprovalPolicyId = "aiCourses" | "userReviews" | "aiQuizzes" | "aiInsights" | "aiAnswers";
type ApprovalMode = "manual" | "automatic";
type ApprovalPolicy = { id: ApprovalPolicyId; key: string; label: string; description: string; mode: ApprovalMode; updatedAt?: string | null };
const APPROVAL_POLICY_ITEMS: { id: ApprovalPolicyId; label: string; description: string }[] = [
  { id: "aiCourses", label: "AI-generated and AI-assembled courses", description: "Applies to AI Builder roadmaps, AI course builds, search-assembled courses and learner-specific copies." },
  { id: "userReviews", label: "Learner reviews", description: "Controls whether new reviews wait for moderation before appearing publicly." },
  { id: "aiQuizzes", label: "AI-generated quizzes", description: "Controls whether AI practice question sets wait for moderation before they can be reused." },
  { id: "aiInsights", label: "AI lesson insights", description: "Controls whether generated summaries and key notes are hidden until approved." },
  { id: "aiAnswers", label: "AI Q&A answers", description: "Controls whether cached AI answers are held for review before being shown or reused." }
];
const TABS: { id: Tab; label: string }[] = [
  { id: "courses", label: "Courses & revisions" }, { id: "review", label: "Reviews" },
  { id: "quiz", label: "Quizzes" }, { id: "insight", label: "AI insights" },
  { id: "qa", label: "Q&A" }, { id: "roadmaps", label: "Roadmaps" }, { id: "links", label: "Broken links" }
];
const when = (value?: string) => value ? new Date(value).toLocaleString() : "—";
const reasonPrompt = (label: string) => {
  const reason = window.prompt("Reason for " + label + " (10–500 characters):")?.trim() || "";
  return reason.length >= 10 && reason.length <= 500 ? reason : null;
};
const aiGenerated = (course: any) => ["normal", "ai", "module", "discovery"].includes(course.generation?.mode);

export default function AdminContentQuality() {
  const [tab, setTab] = useState<Tab>("courses");
  const [courses, setCourses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<Record<string, Revision[]>>({});
  const [expandedRevisions, setExpandedRevisions] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [moderationStatus, setModerationStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approvalPolicies, setApprovalPolicies] = useState<Record<ApprovalPolicyId, ApprovalPolicy>>({} as Record<ApprovalPolicyId, ApprovalPolicy>);
  const [loadingApprovalPolicies, setLoadingApprovalPolicies] = useState(false);
  const [savingApprovalPolicies, setSavingApprovalPolicies] = useState(false);
  const [policyReason, setPolicyReason] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const canManageCourses = permissions.includes("courses.manage");
  const canPublishCourses = permissions.includes("courses.publish");

  const loadCourses = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/admin/courses?includeDeleted=true");
      setCourses((data.courses || []).filter((course: any) => includeDeleted || !course.deletedAt));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load courses."); }
    finally { setLoading(false); }
  }, [includeDeleted]);

  const loadModeration = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch("/api/admin/content-moderation/" + tab + "?status=" + moderationStatus);
      setItems(data.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load moderation queue."); }
    finally { setLoading(false); }
  }, [tab, moderationStatus]);

  const loadRoadmaps = useCallback(async () => {
    setLoading(true); setError("");
    try { const data = await adminFetch("/api/admin/content-roadmaps?limit=300"); setRoadmaps(data.roadmaps || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load roadmaps."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "courses") void loadCourses();
    else if (["review", "quiz", "insight", "qa"].includes(tab)) void loadModeration();
    else if (tab === "roadmaps") void loadRoadmaps();
  }, [tab, loadCourses, loadModeration, loadRoadmaps]);
  const loadApprovalPolicies = useCallback(async () => {
    setLoadingApprovalPolicies(true);
    try {
      const data = await adminFetch("/api/admin/content-policies");
      if (data.policies) setApprovalPolicies(data.policies as Record<ApprovalPolicyId, ApprovalPolicy>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load content approval policies.");
    } finally {
      setLoadingApprovalPolicies(false);
    }
  }, []);

  useEffect(() => { void loadApprovalPolicies(); }, [loadApprovalPolicies]);

  useEffect(() => {
    let cancelled = false;
    void adminFetch("/api/admin/access")
      .then((data) => {
        if (!cancelled) setPermissions(Array.isArray(data.access?.permissions) ? data.access.permissions : []);
      })
      .catch(() => { if (!cancelled) setPermissions([]); })
      .finally(() => { if (!cancelled) setPermissionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function saveApprovalPolicies() {
    if (policyReason.trim().length < 10 || policyReason.trim().length > 500) {
      setError("A reason of 10–500 characters is required to change content approval policies.");
      return;
    }
    const policies = Object.fromEntries(APPROVAL_POLICY_ITEMS.map((item) => [
      item.id, approvalPolicies[item.id]?.mode || "manual"
    ])) as Record<ApprovalPolicyId, ApprovalMode>;
    setSavingApprovalPolicies(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch("/api/admin/content-policies", {
        method: "PUT",
        body: JSON.stringify({ policies, reason: policyReason.trim() })
      });
      setApprovalPolicies(data.policies as Record<ApprovalPolicyId, ApprovalPolicy>);
      setPolicyReason("");
      setNotice("Content approval policies saved. Policies affect new content and subsequent generation; existing pending content remains pending until moderated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save content approval policies.");
    } finally {
      setSavingApprovalPolicies(false);
    }
  }


  async function publish(course: any) {
    if (aiGenerated(course) && (course.aiReviewStatus !== "approved" || (!course.aiReviewedBy && course.aiReviewSource !== "automatic"))) {
      setError("This AI-generated course must be approved by an administrator or the configured automatic approval policy before publishing."); return;
    }
    const reason = reasonPrompt("publishing " + course.title);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(course._id); setError(""); setNotice("");
    try {
      const readiness = await adminFetch("/api/admin/courses/" + course._id + "/readiness");
      if (!readiness.readiness?.ready) {
        setError("Publishing blocked: " + (readiness.readiness?.failedChecks || []).map((item: any) => item.label).join(", "));
        return;
      }
      await adminFetch("/api/admin/courses/" + course._id + "/publish", { method: "POST", body: JSON.stringify({ reason }) });
      setNotice("Published " + course.title + "."); await loadCourses();
    } catch (e) { setError(e instanceof Error ? e.message : "Course could not be published."); }
    finally { setBusy(null); }
  }

  async function lifecycle(course: any, status: "draft" | "archived") {
    const reason = reasonPrompt(status === "archived" ? "archiving " + course.title : "moving " + course.title + " to draft");
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(course._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/courses/" + course._id + "/status", { method: "POST", body: JSON.stringify({ status, reason }) });
      setNotice("Course status updated."); await loadCourses();
    } catch (e) { setError(e instanceof Error ? e.message : "Course status could not be updated."); }
    finally { setBusy(null); }
  }

  async function deleteOrRestore(course: any) {
    const deleted = Boolean(course.deletedAt);
    const reason = reasonPrompt((deleted ? "restoring " : "soft-deleting ") + course.title);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(course._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/courses/" + course._id + (deleted ? "/restore" : "/soft-delete"), { method: "POST", body: JSON.stringify({ reason }) });
      setNotice(deleted ? "Course restored as a draft." : "Course moved to trash."); await loadCourses();
    } catch (e) { setError(e instanceof Error ? e.message : "Course lifecycle action failed."); }
    finally { setBusy(null); }
  }

  async function aiReview(course: any, decision: "approved" | "rejected") {
    const reason = reasonPrompt((decision === "approved" ? "approving AI-generated content for " : "rejecting AI-generated content for ") + course.title);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(course._id); setError(""); setNotice("");
    try {
      const result = await adminFetch("/api/admin/courses/" + course._id + "/ai-review", { method: "POST", body: JSON.stringify({ decision, reason, note: reason }) });
      setNotice(result.message || (result.publishedByApproval
        ? "Course approved and published."
        : result.readiness && !result.readiness.ready
          ? "Human review approved. Publication is blocked until readiness checks pass."
          : "Human review decision recorded."));
      await loadCourses();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save AI review decision."); }
    finally { setBusy(null); }
  }

  async function loadRevisions(courseId: string) {
    if (expandedRevisions === courseId) { setExpandedRevisions(null); return; }
    setBusy(courseId); setError("");
    try {
      const data = await adminFetch("/api/admin/courses/" + courseId + "/revisions");
      setRevisions((old) => ({ ...old, [courseId]: data.revisions || [] }));
      setExpandedRevisions(courseId);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load revisions."); }
    finally { setBusy(null); }
  }

  async function rollback(course: any, revision: Revision) {
    const reason = reasonPrompt("rolling " + course.title + " back to revision " + revision.revisionNumber);
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(course._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/courses/" + course._id + "/revisions/" + revision._id + "/rollback", { method: "POST", body: JSON.stringify({ reason }) });
      setNotice("Revision restored as a draft. Re-run readiness and human review before publishing."); await loadCourses();
      const data = await adminFetch("/api/admin/courses/" + course._id + "/revisions");
      setRevisions((old) => ({ ...old, [course._id]: data.revisions || [] }));
    } catch (e) { setError(e instanceof Error ? e.message : "Rollback failed."); }
    finally { setBusy(null); }
  }

  async function moderate(item: any, status: "approved" | "rejected" | "pending") {
    const reason = reasonPrompt(status + " " + tab + " content");
    if (!reason) { setError("A reason of 10–500 characters is required."); return; }
    setBusy(item._id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/content-moderation/" + tab + "/" + item._id, { method: "POST", body: JSON.stringify({ status, reason, note: reason, isHidden: status === "rejected" }) });
      setNotice("Moderation decision saved."); await loadModeration();
    } catch (e) { setError(e instanceof Error ? e.message : "Moderation action failed."); }
    finally { setBusy(null); }
  }

  async function checkLinks() {
    setBusy("links"); setError(""); setNotice("");
    try {
      const data = await adminFetch("/api/admin/content/broken-links/check", { method: "POST", body: JSON.stringify({}) });
      setLinks(data.links || []); setNotice("Checked " + (data.checked || 0) + " links; " + (data.brokenCount || 0) + " need attention.");
    } catch (e) { setError(e instanceof Error ? e.message : "Link check failed."); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader eyebrow="Learning governance" title="Content quality" description="Manage course lifecycle, AI human review, revisions and rollback, moderation queues, roadmap records, and resource-link health." actions={<button type="button" className="btn-secondary" onClick={() => { if (tab === "courses") void loadCourses(); else if (["review","quiz","insight","qa"].includes(tab)) void loadModeration(); else if (tab === "roadmaps") void loadRoadmaps(); }} disabled={loading}><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")}/> Refresh</button>} />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {!permissionsLoading && !canManageCourses && <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Read-only content quality access. Course lifecycle, approval policy changes, moderation, rollback and link scans are hidden unless your role has course-management permission.</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">Approval policy</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Choose whether each content type requires an administrator’s approval or can be released automatically. Manual is the default for every policy.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadApprovalPolicies()} disabled={loadingApprovalPolicies}>{loadingApprovalPolicies ? "Loading policies…" : "Refresh policies"}</button>
      </div>
      {loadingApprovalPolicies && !Object.keys(approvalPolicies).length ? <Loading/> : <>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {APPROVAL_POLICY_ITEMS.map((item) => {
            const mode = approvalPolicies[item.id]?.mode || "manual";
            return <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="sr-only">{item.label} approval mode</span>
                  <select className="input-field w-auto min-w-36" value={mode} disabled={!canManageCourses} onChange={(event) => setApprovalPolicies((current) => ({
                    ...current,
                    [item.id]: { ...(current[item.id] || { id: item.id, key: "", label: item.label, description: item.description }), mode: event.target.value as ApprovalMode }
                  }))}>
                    <option value="manual">Manual approval</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </label>
              </div>
              <p className={"mt-3 text-xs " + (mode === "automatic" ? "text-emerald-700" : "text-amber-700")}>
                {mode === "automatic"
                  ? item.id === "aiCourses" ? "Automatically approves generated courses; public courses publish only when readiness checks pass."
                    : item.id === "userReviews" ? "New reviews become visible immediately unless hidden by moderation."
                    : "New generated content is approved for use automatically."
                  : item.id === "aiCourses" ? "Generated courses wait for administrator review. Publishing remains a separate readiness-gated action."
                    : "New content remains pending and must be approved before public use or reuse."}
              </p>
            </div>;
          })}
        </div>
        {canManageCourses && <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Reason for policy change
            <textarea className="input-field mt-1 min-h-20 w-full" value={policyReason} onChange={(event) => setPolicyReason(event.target.value)} minLength={10} maxLength={500} placeholder="Explain why the approval policy is changing (10–500 characters)."/>
          </label>
          <button type="button" className="btn-primary shrink-0" disabled={savingApprovalPolicies || loadingApprovalPolicies || policyReason.trim().length < 10 || policyReason.trim().length > 500} onClick={() => void saveApprovalPolicies()}>{savingApprovalPolicies ? "Saving policies…" : "Save approval policies"}</button>
        </div>}
      </>}
    </section>
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">{TABS.map((item) => <button type="button" key={item.id} onClick={() => { setTab(item.id); setError(""); setNotice(""); }} className={"whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold " + (tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}>{item.label}</button>)}</div>

    {tab === "courses" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">Course lifecycle and revisions</h2><p className="mt-1 text-sm text-slate-500">Every saved course edit stores the prior version. Rollbacks always restore as a draft.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} className="rounded"/> Include trash</label></div>
      {loading ? <Loading/> : <div className="divide-y divide-slate-100">{courses.map((course) => <article key={course._id} className={"p-5 " + (course.deletedAt ? "bg-slate-50 opacity-80" : "")}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{course.title}</h3><AdminBadge tone={course.deletedAt ? "danger" : course.isPublished ? "success" : "neutral"}>{course.deletedAt ? "trashed" : course.status || (course.isPublished ? "published" : "draft")}</AdminBadge>{aiGenerated(course) && <AdminBadge tone={course.aiReviewStatus === "approved" ? "success" : course.aiReviewStatus === "rejected" ? "danger" : "warning"}>AI review: {course.aiReviewStatus === "approved" && course.aiReviewSource === "automatic" ? "auto-approved" : course.aiReviewStatus || "pending"}</AdminBadge>}{course.visibility === "private" && <AdminBadge tone="info">{course.aiReviewStatus === "approved" ? "Learner-private · approved" : "Owner-private · awaiting approval"}</AdminBadge>}</div><p className="mt-1 text-sm text-slate-500">{course.category} · {course.level} · source: {course.generation?.mode || "curated"} · updated {when(course.updatedAt)}</p>{course.aiReviewNote && <p className="mt-2 text-sm text-slate-600">Review note: {course.aiReviewNote}</p>}</div>
          <div className="flex flex-wrap gap-2">{aiGenerated(course) && !course.deletedAt && <><button type="button" disabled={busy === course._id || course.aiReviewStatus === "approved"} onClick={() => void aiReview(course, "approved")} className="btn-secondary"><Check className="h-4 w-4"/> Approve & publish if ready</button><button type="button" disabled={busy === course._id} onClick={() => void aiReview(course, "rejected")} className="btn-secondary"><XCircle className="h-4 w-4"/> Reject</button></>}{!course.deletedAt && course.visibility === "private" && course.createdForUser ? <span className="self-center text-xs font-medium text-slate-500">{course.aiReviewStatus === "approved" ? "Owner access is granted; kept out of public catalog" : "Learner cannot access this course until approval"}</span> : !course.deletedAt && (course.isPublished || course.status === "archived" ? <button type="button" disabled={busy === course._id} onClick={() => void lifecycle(course, "draft")} className="btn-secondary">{course.status === "archived" ? "Unarchive to draft" : "Move to draft"}</button> : <button type="button" disabled={busy === course._id} onClick={() => void publish(course)} className="btn-primary">Publish</button>)}{!course.deletedAt && course.status !== "archived" && <button type="button" disabled={busy === course._id} onClick={() => void lifecycle(course, "archived")} className="btn-secondary">Archive</button>}<button type="button" disabled={busy === course._id} onClick={() => void deleteOrRestore(course)} className="btn-secondary">{course.deletedAt ? <RotateCcw className="h-4 w-4"/> : <Trash2 className="h-4 w-4"/>}{course.deletedAt ? "Restore" : "Soft delete"}</button><button type="button" disabled={busy === course._id} onClick={() => void loadRevisions(course._id)} className="btn-secondary"><FileClock className="h-4 w-4"/> Revisions</button></div>
        </div>
        {expandedRevisions === course._id && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><h4 className="font-bold">Revision history</h4><button type="button" aria-label="Close revisions" onClick={() => setExpandedRevisions(null)} className="rounded-lg p-1 hover:bg-white"><X className="h-4 w-4"/></button></div>{(revisions[course._id] || []).length ? <div className="mt-3 space-y-2">{(revisions[course._id] || []).map((revision) => <div key={revision._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><div><p className="text-sm font-semibold">Revision {revision.revisionNumber} · {revision.summary}</p><p className="mt-1 text-xs text-slate-500">{when(revision.createdAt)} · {revision.changedBy?.name || revision.changeSource} · {revision.reason || "No reason recorded"}</p></div><button type="button" disabled={busy === course._id} onClick={() => void rollback(course, revision)} className="btn-secondary"><RotateCcw className="h-4 w-4"/> Roll back</button></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No prior revisions yet. The next saved edit will create a restorable snapshot.</p>}</div>}
      </article>)}{!courses.length && <p className="p-8 text-center text-sm text-slate-500">No courses found.</p>}</div>}
    </section>}

    {["review","quiz","insight","qa"].includes(tab) && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">{TABS.find((item) => item.id === tab)?.label} moderation</h2><p className="mt-1 text-sm text-slate-500">Review content, approve it for use, or reject and hide it. Every decision is audited with a reason.</p></div><select className="input-field w-auto" value={moderationStatus} onChange={(e) => setModerationStatus(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select></div>
      {loading ? <Loading/> : <div className="divide-y divide-slate-100">{items.map((item) => <article key={item._id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.course?.title || "Course unavailable"} · {tab === "review" ? (item.rating + "/5 review") : tab === "quiz" ? (item.title || "Practice quiz") : tab === "insight" ? "AI lesson insight" : "Learner Q&A"}</h3><AdminBadge tone={item.moderationStatus === "approved" ? "success" : item.moderationStatus === "rejected" ? "danger" : "warning"}>{item.moderationStatus || "pending"}</AdminBadge>{item.isHidden && <AdminBadge tone="danger">Hidden</AdminBadge>}</div><p className="mt-1 text-xs text-slate-500">{when(item.createdAt)} · {item._id}</p><div className="mt-3 max-w-4xl whitespace-pre-wrap break-words text-sm text-slate-700">{tab === "review" ? (item.comment || "No written comment") : tab === "quiz" ? (item.questions || []).slice(0, 5).map((q: any) => q.question).join("\n") || "No quiz questions" : tab === "insight" ? item.summary : "Question: " + (item.question || "") + "\n\nAnswer: " + (item.answer || "")}</div>{item.moderationNote && <p className="mt-2 text-xs text-slate-500">Previous moderation note: {item.moderationNote}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy === item._id} onClick={() => void moderate(item, "approved")} className="btn-primary"><Check className="h-4 w-4"/> Approve</button><button type="button" disabled={busy === item._id} onClick={() => void moderate(item, "rejected")} className="btn-secondary"><XCircle className="h-4 w-4"/> Reject & hide</button></div></div></article>)}{!items.length && <p className="p-8 text-center text-sm text-slate-500">No records match this moderation filter.</p>}</div>}
    </section>}

    {tab === "roadmaps" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Generated learning roadmaps</h2><p className="mt-1 text-sm text-slate-500">Inspect roadmap topics, learner, completion status and recent activity.</p></div>{loading ? <Loading/> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Topic</th><th className="p-4">Learner</th><th className="p-4">Level</th><th className="p-4">Status</th><th className="p-4">Activity</th></tr></thead><tbody className="divide-y divide-slate-100">{roadmaps.map((item) => <tr key={item._id}><td className="p-4"><p className="font-semibold">{item.course?.title || item.canonicalTopic || item.query}</p><p className="text-xs text-slate-500">{item.intent || item.careerOutcome || item.query}</p></td><td className="p-4">{item.user?.name || "Unknown"}<p className="text-xs text-slate-500">{item.user?.email || ""}</p></td><td className="p-4">{item.level}</td><td className="p-4"><AdminBadge tone={item.status === "completed" ? "success" : "neutral"}>{item.status}</AdminBadge></td><td className="p-4 text-xs text-slate-500">Last accessed {when(item.lastAccessedAt)}<p>Updated {when(item.updatedAt)}</p></td></tr>)}</tbody></table>{!roadmaps.length && <p className="p-8 text-center text-sm text-slate-500">No roadmap records found.</p>}</div>}</section>}

    {tab === "links" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">Resource link health</h2><p className="mt-1 text-sm text-slate-500">Checks up to 500 links across the 100 most recently updated active courses. Unsafe local/private hosts are skipped.</p></div><button type="button" className="btn-primary" disabled={busy === "links"} onClick={() => void checkLinks()}><Link2 className="h-4 w-4"/>{busy === "links" ? "Checking…" : "Run link check"}</button></div>{links.length ? <div className="divide-y divide-slate-100">{links.map((item, index) => <div key={item.courseId + item.path + index} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{item.courseTitle}</p><p className="mt-1 break-all text-xs text-blue-700">{item.url}</p><p className="mt-1 text-xs text-slate-500">{item.path} · HTTP {item.httpStatus ?? "—"}</p></div><AdminBadge tone={item.status === "ok" ? "success" : item.status === "skipped_unsafe" ? "neutral" : "danger"}>{item.status}</AdminBadge></div>)}</div> : <div className="p-10 text-center"><Activity className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-3 font-semibold">No link scan results yet</p><p className="mt-1 text-sm text-slate-500">Run a check to inspect URLs referenced by course lessons and modules.</p></div>}</section>}
  </div>;
}
function Loading() { return <div role="status" className="p-10 text-center text-sm text-slate-500"><RefreshCcw className="mx-auto mb-2 h-5 w-5 animate-spin"/>Loading content…</div>; }
