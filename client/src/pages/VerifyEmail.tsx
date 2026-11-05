import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Mail, RotateCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { routes } from "@/lib/routes";

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const stateEmail = (location.state as { email?: string } | null)?.email || "";
  const [email, setEmail] = useState(stateEmail);
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("We sent a 6-digit verification code to your email.");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await verifyEmail(email, otp);
      navigate(routes.home(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify your email.");
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
        body: JSON.stringify({ email, purpose: "email_verification" }),
      });
      setOtp("");
      setSeconds(RESEND_SECONDS);
      setMessage("A new verification code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the OTP.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Enter the code we sent to finish creating your account"
      footer={
        <>
          Already verified?{" "}
          <Link to={routes.login()} className="font-semibold text-blue-600 hover:text-blue-700">
            Sign in
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

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-field"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Verification code</label>
          <input
            inputMode="numeric"
            pattern="\d{6}"
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
          {loading ? "Verifying..." : "Verify Email"}
        </button>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={resending || seconds > 0 || !email}
          className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <RotateCw className={resending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {seconds > 0 ? `Resend OTP in ${seconds}s` : "Resend OTP"}
        </button>

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          Check your spam/junk folder if the email is not in your inbox.
        </div>
      </form>
    </AuthLayout>
  );
}
