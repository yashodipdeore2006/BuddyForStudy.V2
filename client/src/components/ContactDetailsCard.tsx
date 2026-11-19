import { useEffect, useState } from "react";
import { CheckCircle2, DownloadCloud, Loader2, MapPin, Phone, Save, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type AddressFields = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  formatted: string;
};

type GoogleConfig = {
  enabled?: boolean;
  clientId?: string;
  phoneVerificationEnabled?: boolean;
};

type GoogleImportResult = {
  phoneNumber?: string;
  city?: string;
  address?: Partial<AddressFields>;
  availability?: { phoneNumbers?: boolean; addresses?: boolean };
  phoneNumberVerified?: false;
};

const emptyAddress: AddressFields = {
  line1: "", line2: "", city: "", state: "", postalCode: "", country: "", formatted: ""
};

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
    }
    const currentScript = script;
    const onLoad = () => {
      cleanup();
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error("Google authorization is unavailable. Please try again."));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to load Google authorization. Check your connection and try again."));
    };
    const cleanup = () => {
      currentScript.removeEventListener("load", onLoad);
      currentScript.removeEventListener("error", onError);
    };
    currentScript.addEventListener("load", onLoad, { once: true });
    currentScript.addEventListener("error", onError, { once: true });
    if (!currentScript.isConnected) document.head.appendChild(currentScript);
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

export default function ContactDetailsCard() {
  const { profile, refreshProfile } = useAuth();
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>({});
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || "");
  const [city, setCity] = useState(profile?.city || "");
  const [address, setAddress] = useState<AddressFields>({
    ...emptyAddress,
    ...(profile?.address || {})
  });
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPhoneNumber(profile?.phone_number || "");
    setCity(profile?.city || "");
    setAddress({ ...emptyAddress, ...(profile?.address || {}) });
  }, [profile?.phone_number, profile?.city, profile?.address]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/auth/google/config").then((data) => {
      if (!cancelled) setGoogleConfig(data || {});
    }).catch(() => {
      if (!cancelled) setGoogleConfig({});
    });
    return () => { cancelled = true; };
  }, []);

  const updateAddress = (field: keyof AddressFields, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
    if (field === "city") setCity(value);
  };

  const handleGoogleImport = async () => {
    setError("");
    setNotice("");
    if (!googleConfig.enabled || !googleConfig.clientId) {
      setError("Google profile import is not configured. You can enter your details manually.");
      return;
    }
    setImporting(true);
    try {
      await loadGoogleIdentityScript();
      if (!window.google?.accounts?.oauth2) throw new Error("Google authorization is unavailable. Please try again.");

      const scope = [
        "openid",
        "email",
        "https://www.googleapis.com/auth/user.phonenumbers.read",
        "https://www.googleapis.com/auth/user.addresses.read"
      ].join(" ");

      const tokenResponse = await new Promise<{ access_token?: string; error?: string }>((resolve, reject) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: googleConfig.clientId!,
          scope,
          include_granted_scopes: true,
          callback: (response) => resolve(response),
          error_callback: () => reject(new Error("Google permission request was cancelled or could not be completed."))
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      });

      if (tokenResponse.error || !tokenResponse.access_token) {
        throw new Error("Google did not grant access to profile details. You can enter them manually.");
      }

      const result = await apiFetch<GoogleImportResult>("/api/auth/google/contact-data", {
        method: "POST",
        body: JSON.stringify({ accessToken: tokenResponse.access_token })
      });

      if (result.phoneNumber) setPhoneNumber(result.phoneNumber);
      if (result.address) {
        setAddress((current) => ({ ...current, ...result.address }));
        if (result.address.city) setCity(result.address.city);
      }
      const imported = Boolean(result.phoneNumber || Object.values(result.address || {}).some(Boolean));
      if (!imported) {
        setNotice("Google did not provide a phone number or address. You can enter the details below.");
      } else {
        const denied = [];
        if (result.availability?.phoneNumbers === false) denied.push("phone number");
        if (result.availability?.addresses === false) denied.push("address");
        setNotice(
          "Google details loaded. Review and save them before continuing." +
          (denied.length ? " Google permission was not granted for " + denied.join(" and ") + "; enter that information manually." : "")
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import Google profile details.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          city: city.trim(),
          address: { ...address, city: city.trim() }
        })
      });
      await refreshProfile();
      setOtpSent(false);
      setCode("");
      setNotice("Contact details saved. Your phone number remains unverified until you complete OTP verification.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save contact details.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendOtp = async () => {
    setError("");
    setNotice("");
    setSendingOtp(true);
    try {
      await apiFetch("/api/auth/phone/send-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() })
      });
      await refreshProfile();
      setOtpSent(true);
      setNotice("Verification code sent. Check your SMS messages.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send a verification code.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    setNotice("");
    setVerifying(true);
    try {
      await apiFetch("/api/auth/phone/verify-otp", {
        method: "POST",
        body: JSON.stringify({ code })
      });
      await refreshProfile();
      setOtpSent(false);
      setCode("");
      setNotice("Your mobile number is verified.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify this number.");
    } finally {
      setVerifying(false);
    }
  };

  if (!profile) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><MapPin className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Contact details</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Import information from your Google profile with your permission, or enter it yourself. Review every field before saving.</p>
          </div>
        </div>
        <button type="button" onClick={handleGoogleImport} disabled={importing || saving} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
          {importing ? "Connecting to Google…" : "Import from Google"}
        </button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Phone className="h-4 w-4 text-slate-500" /> Mobile number</div>
          <label className="block text-sm font-semibold text-slate-700">
            Phone number (international format)
            <input value={phoneNumber} onChange={(event) => { setPhoneNumber(event.target.value); setOtpSent(false); }} className="input-field mt-1.5" placeholder="+919876543210" autoComplete="tel" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {profile.phone_number_verified && phoneNumber === profile.phone_number ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800"><ShieldCheck className="h-3.5 w-3.5" /> Not verified</span>
            )}
            {googleConfig.phoneVerificationEnabled && (
              <button type="button" onClick={handleSendOtp} disabled={sendingOtp || !phoneNumber.trim() || saving} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {sendingOtp ? "Sending…" : otpSent ? "Resend code" : "Verify with SMS"}
              </button>
            )}
          </div>
          {!googleConfig.phoneVerificationEnabled && <p className="text-xs leading-5 text-slate-500">SMS verification is not configured yet. You can save the number, but it will remain unverified.</p>}
          {otpSent && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <label className="block text-sm font-semibold text-slate-700">SMS verification code
                <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))} className="input-field mt-1.5" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code" />
              </label>
              <button type="button" onClick={handleVerifyOtp} disabled={verifying || code.length < 4} className="btn-primary w-full disabled:opacity-50">
                {verifying ? "Verifying…" : "Confirm phone number"}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><MapPin className="h-4 w-4 text-slate-500" /> Address</div>
          <label className="block text-sm font-semibold text-slate-700">Address line 1
            <input value={address.line1} onChange={(event) => updateAddress("line1", event.target.value)} className="input-field mt-1.5" autoComplete="address-line1" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Address line 2
            <input value={address.line2} onChange={(event) => updateAddress("line2", event.target.value)} className="input-field mt-1.5" autoComplete="address-line2" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">City
              <input value={city} onChange={(event) => { setCity(event.target.value); updateAddress("city", event.target.value); }} className="input-field mt-1.5" autoComplete="address-level2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">State
              <input value={address.state} onChange={(event) => updateAddress("state", event.target.value)} className="input-field mt-1.5" autoComplete="address-level1" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">PIN / Postal code
              <input value={address.postalCode} onChange={(event) => updateAddress("postalCode", event.target.value)} className="input-field mt-1.5" autoComplete="postal-code" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Country
              <input value={address.country} onChange={(event) => updateAddress("country", event.target.value)} className="input-field mt-1.5" autoComplete="country-name" />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <p className="max-w-xl text-xs leading-5 text-slate-500">Google-imported phone numbers are not considered verified. BuddyForStudy marks a number verified only after the SMS provider confirms the OTP.</p>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save contact details"}
        </button>
      </div>
    </section>
  );
}
