import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, LockKeyhole } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function AcceptAdminInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const email = params.get("email") || "";
  const token = params.get("token") || "";

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!email || !token) {
      setError("This invitation link is incomplete. Ask a Super Admin to send a new invitation.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(API_URL + "/api/auth/accept-admin-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, name: name.trim() || undefined, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.message || "Unable to accept invitation.");
      setNotice("Your administrator account is active. Redirecting you to the standard sign-in page…");
      window.setTimeout(() => navigate("/login", { replace: true, state: { email } }), 900);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to accept invitation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-9">
        <div className="mb-5 inline-flex rounded-2xl bg-violet-50 p-3 text-violet-700"><ShieldCheck className="h-7 w-7" /></div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Activate administrator access</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Set a secure password to accept your BuddyForStudy administrator invitation. The invitation can only be used once and expires after 24 hours.</p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        <form onSubmit={accept} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Invited email
            <input value={email} readOnly className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Confirm your name (optional)
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} autoComplete="name" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Name used in the invitation" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Create password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="At least 12 characters" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Confirm password
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="Re-enter your password" />
          </label>
          <button type="submit" disabled={loading || !email || !token} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
            <LockKeyhole className="h-4 w-4" /> {loading ? "Activating account…" : "Accept invitation"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">Already activated? <Link to="/login" className="font-semibold text-violet-700 hover:text-violet-900">Sign in</Link></p>
      </section>
    </main>
  );
}
