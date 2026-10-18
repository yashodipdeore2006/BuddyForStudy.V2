import { FormEvent, useEffect, useState } from "react";
import { MailPlus, RefreshCcw, ShieldCheck, XCircle, Clock3 } from "lucide-react";
import { adminFetch } from "@/lib/adminApi";

type Role = { key: string; label: string; description: string };
type Invitation = {
  _id: string;
  email: string;
  name: string;
  adminRole: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { name?: string; email?: string };
};

export default function AdminInvitationManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adminRole, setAdminRole] = useState("platform_admin");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roleData, invitationData] = await Promise.all([
        adminFetch("/api/admin/roles"),
        adminFetch("/api/admin/invitations")
      ]);
      setRoles(roleData.roles || []);
      setInvitations(invitationData.invitations || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load invitations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function sendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setNotice("");
    try {
      await adminFetch("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), adminRole, reason: reason.trim() })
      });
      setNotice("Invitation email sent to " + email.trim().toLowerCase() + ".");
      setName("");
      setEmail("");
      setReason("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send invitation.");
    } finally {
      setSending(false);
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm("Revoke the pending invitation for " + invitation.email + "?")) return;
    setRevokingId(invitation._id);
    setError("");
    setNotice("");
    try {
      await adminFetch("/api/admin/invitations/" + invitation._id, {
        method: "DELETE",
        body: JSON.stringify({ reason: "Revoked from administrator access console." })
      });
      setNotice("Invitation revoked for " + invitation.email + ".");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to revoke invitation.");
    } finally {
      setRevokingId("");
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><MailPlus className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Invite an administrator</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Send a single-use invitation link. The invitee sets their own password; links expire after 24 hours. No public registration path can grant administrator access.</p>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <form onSubmit={sendInvitation} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Full name
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Administrator name" />
        </label>
        <label className="text-sm font-medium text-slate-700">Work email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="name@company.com" />
        </label>
        <label className="text-sm font-medium text-slate-700">Administrator role
          <select value={adminRole} onChange={(event) => setAdminRole(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
            {roles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Reason (audit log)
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Why is this access needed?" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
          <p className="text-xs text-slate-500">The invitation is emailed; the raw token is never returned by the API.</p>
          <button type="submit" disabled={sending || loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
            <MailPlus className="h-4 w-4" /> {sending ? "Sending invitation…" : "Send invitation"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-950">Pending invitations</h3>
            <p className="text-sm text-slate-500">Unaccepted invitations that have not expired or been revoked.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh invitations" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCcw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /></button>
        </div>
        {loading ? <p role="status" className="p-6 text-center text-sm text-slate-500">Loading invitations…</p> : invitations.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No pending invitations.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {invitations.map((invitation) => {
              const roleLabel = roles.find((role) => role.key === invitation.adminRole)?.label || invitation.adminRole;
              return <article key={invitation._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{invitation.name}</p>
                  <p className="truncate text-sm text-slate-500">{invitation.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700"><ShieldCheck className="mr-1 inline h-3 w-3" />{roleLabel}</span>
                    <span className="text-slate-500"><Clock3 className="mr-1 inline h-3 w-3" />Expires {new Date(invitation.expiresAt).toLocaleString()}</span>
                  </div>
                </div>
                <button type="button" onClick={() => void revokeInvitation(invitation)} disabled={revokingId === invitation._id} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  <XCircle className="h-4 w-4" /> {revokingId === invitation._id ? "Revoking…" : "Revoke"}
                </button>
              </article>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}
