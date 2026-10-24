import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Mail, RotateCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { routes } from "@/lib/routes";

const RESEND_SECONDS = 60;

export default function VerifyLogin() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyLogin } = useAuth();
  const state = location.state as { email?: string; from?: string } | null;
  const email = state?.email || "";
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("We sent a 6-digit login code to your email.");

  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    if (!email) navigate(routes.login(), { replace: true });
  }, [email, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const profile = await verifyLogin(email, otp);
      navigate(profile.role === "admin" ? "/admin" : state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify the login code.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (seconds > 0 || !email) return;
    setError("");
    setResending(true);
    try {
      await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ email, purpose: "login_verification" }),
      });
      setOtp("");
      setSeconds(RESEND_SECONDS);
      setMessage("A new login code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the login code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your login"
      subtitle="Enter the one-time code sent to your email"
      footer={
        <>
          Need another account?{" "}
          <Link to={routes.login()} className="font-semibold text-blue-600 hover:text-blue-700">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && !error && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Signing in as <strong>{email}</strong>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Login code</label>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="input-field text-center text-xl font-extrabold tracking-[0.45em]"
            placeholder="000000"
            required
            autoComplete="one-time-code"
          />
        </div>

        <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full">
          {loading ? "Signing in..." : "Verify & Sign In"}
        </button>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={resending || seconds > 0}
          className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <RotateCw className={resending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {seconds > 0 ? "Resend OTP in " + seconds + "s" : "Resend OTP"}
        </button>

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          The login code expires in 10 minutes and can only be used once.
        </div>
      </form>
    </AuthLayout>
  );
}