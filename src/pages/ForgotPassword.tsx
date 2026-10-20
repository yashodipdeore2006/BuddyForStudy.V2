import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, KeyRound, Mail, RotateCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { routes } from "@/lib/routes";

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestOtp = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStep("reset");
      setSeconds(RESEND_SECONDS);
      setMessage("If an account exists for this email, a password reset OTP has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (seconds > 0 || !email) return;
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ email, purpose: "password_reset" }),
      });
      setSeconds(RESEND_SECONDS);
      setMessage("A new password reset OTP has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the OTP.");
    } finally {
      setLoading(false);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, otp, newPassword);
      navigate(routes.home(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={step === "email" ? "We'll send a one-time code to your email" : "Enter the OTP and choose a new password"}
      footer={
        <>
          Remembered your password?{" "}
          <Link to={routes.login()} className="font-semibold text-blue-600 hover:text-blue-700">
            Back to sign in
          </Link>
        </>
      }
    >
      {step === "email" ? (
        <form onSubmit={requestOtp} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input-field pl-10"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Sending..." : "Send Reset OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && !error && (
            <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Resetting password for <strong>{email}</strong>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">OTP</label>
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="input-field"
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full">
            {loading ? "Resetting..." : "Reset Password"}
          </button>

          <button
            type="button"
            onClick={() => void resend()}
            disabled={loading || seconds > 0}
            className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <RotateCw className="h-4 w-4" />
            {seconds > 0 ? `Resend OTP in ${seconds}s` : "Resend OTP"}
          </button>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            <KeyRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
            The reset code expires after 10 minutes and can only be used once.
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
