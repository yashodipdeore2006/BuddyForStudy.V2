import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => Promise<void>;
  disabled?: boolean;
}

interface GoogleConfigResponse {
  enabled?: boolean;
  clientId?: string;
}

type GoogleSetupStatus =
  | "checking"
  | "waiting_for_sdk"
  | "ready"
  | "unconfigured"
  | "connection_error"
  | "sdk_unavailable"
  | "client_mismatch"
  | "credential_error";

const frontendGoogleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
let initializedClientId = "";
let activeCredentialHandler: ((credential: string) => Promise<void>) | null = null;

const retryableStates = new Set<GoogleSetupStatus>(["connection_error", "sdk_unavailable"]);

let googleIdentityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-bfs-google-identity="true"]');
    if (script?.dataset.loaded === "true" && window.google?.accounts?.id) {
      resolve();
      return;
    }

    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.bfsGoogleIdentity = "true";
    }

    const currentScript = script;
    const onLoad = () => {
      currentScript.dataset.loaded = "true";
      cleanup();
      if (window.google?.accounts?.id) resolve();
      else reject(new Error("Google Identity Services loaded without its sign-in API."));
    };
    const onError = () => {
      cleanup();
      currentScript.remove();
      reject(new Error("Unable to load Google Identity Services."));
    };
    const cleanup = () => {
      currentScript.removeEventListener("load", onLoad);
      currentScript.removeEventListener("error", onError);
    };

    currentScript.addEventListener("load", onLoad, { once: true });
    currentScript.addEventListener("error", onError, { once: true });
    if (!currentScript.isConnected) document.head.appendChild(currentScript);
  }).catch((error) => {
    googleIdentityScriptPromise = null;
    throw error;
  });

  return googleIdentityScriptPromise;
}

function getStatusMessage(status: GoogleSetupStatus): string {
  switch (status) {
    case "unconfigured":
      return "Google sign-in is not configured on the backend. Set GOOGLE_CLIENT_ID in server/.env and restart the API.";
    case "connection_error":
      return "Could not load Google sign-in settings from the API. Check that the backend is running and that its CORS settings allow this local frontend origin.";
    case "sdk_unavailable":
      return "Google Identity Services did not load. Check your internet connection or browser extensions, then retry.";
    case "client_mismatch":
      return "The frontend and backend Google OAuth client IDs do not match. Use the same Web client ID in VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID.";
    case "credential_error":
      return "Google did not return a sign-in credential. Check the authorized JavaScript origin and browser sign-in/privacy settings, then try again. If this repeats, open Google Sign-In troubleshooting below.";
    default:
      return "";
  }
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const disabledRef = useRef(disabled);
  const [status, setStatus] = useState<GoogleSetupStatus>("checking");
  const [retryKey, setRetryKey] = useState(0);
  const [credentialError, setCredentialError] = useState(false);

  credentialHandlerRef.current = onCredential;
  disabledRef.current = disabled;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    let clientId = "";

    const credentialHandler = (credential: string) => credentialHandlerRef.current(credential);
    activeCredentialHandler = credentialHandler;

    const renderWhenReady = () => {
      if (cancelled) return;

      // Keep the setup alive during a simultaneous password sign-in, but do not
      // issue more network requests while waiting for the form to become idle.
      if (!containerRef.current || disabledRef.current) {
        timer = window.setTimeout(renderWhenReady, 100);
        return;
      }

      if (!window.google?.accounts?.id) {
        attempts += 1;
        if (attempts >= 80) {
          setStatus("sdk_unavailable");
          return;
        }
        timer = window.setTimeout(renderWhenReady, 125);
        return;
      }

      try {
        if (initializedClientId !== clientId) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: ({ credential }) => {
              if (!credential) {
                setCredentialError(true);
                return;
              }
              setCredentialError(false);
              void activeCredentialHandler?.(credential).catch(() => {
                // The parent displays server-side authentication errors. Do not
                // leak ID tokens or provider internals into the console.
              });
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            // Keep the traditional popup/callback flow while FedCM token
            // retrieval is failing in the current local browser setup.
            ux_mode: "popup",
            use_fedcm_for_button: false,
          });
          initializedClientId = clientId;
        }

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          width: Math.min(container.clientWidth || 400, 400),
          text: "continue_with",
          shape: "rectangular",
        });
        setStatus("ready");
      } catch {
        setStatus("sdk_unavailable");
      }
    };

    const loadGoogleConfig = async () => {
      setStatus("checking");
      try {
        const response = await apiFetch<GoogleConfigResponse>("/api/auth/google/config");
        if (cancelled) return;

        const serverClientId = typeof response?.clientId === "string" ? response.clientId.trim() : "";
        if (response?.enabled !== true || !serverClientId) {
          setStatus("unconfigured");
          return;
        }
        if (frontendGoogleClientId && frontendGoogleClientId !== serverClientId) {
          setStatus("client_mismatch");
          return;
        }

        clientId = serverClientId;
        setStatus("waiting_for_sdk");
        try {
          await loadGoogleIdentityScript();
          if (!cancelled) timer = window.setTimeout(renderWhenReady, 0);
        } catch {
          if (!cancelled) setStatus("sdk_unavailable");
        }
      } catch {
        if (!cancelled) setStatus("connection_error");
      }
    };

    void loadGoogleConfig();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (activeCredentialHandler === credentialHandler) activeCredentialHandler = null;
    };
  }, [retryKey]);

  const statusMessage = credentialError ? getStatusMessage("credential_error") : getStatusMessage(status);
  const retryable = retryableStates.has(status);

  return (
    <div className="w-full space-y-2">
      <div
        ref={containerRef}
        className={status === "ready" ? (disabled ? "pointer-events-none flex min-h-10 w-full justify-center opacity-60" : "flex min-h-10 w-full justify-center") : "hidden"}
        aria-hidden={status !== "ready"}
        aria-disabled={disabled}
      />
      {status !== "ready" && (
        <button
          type="button"
          disabled={disabled || !retryable}
          onClick={retryable ? () => setRetryKey((value) => value + 1) : undefined}
          aria-describedby={statusMessage ? "google-signin-status" : undefined}
          className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-500 disabled:opacity-90"
        >
          <span aria-hidden="true" className="text-base font-bold">G</span>
          <span>{retryable ? "Retry Google sign-in setup" : status === "checking" || status === "waiting_for_sdk" ? "Loading Google sign-in…" : "Continue with Google"}</span>
        </button>
      )}
      {credentialError && (
        <button
          type="button"
          onClick={() => { setCredentialError(false); setRetryKey((value) => value + 1); }}
          disabled={disabled}
          className="text-sm font-semibold text-violet-700 underline underline-offset-2 disabled:opacity-50"
        >
          Reload Google sign-in
        </button>
      )}
      {statusMessage && (
        <p
          id="google-signin-status"
          role={status === "client_mismatch" ? "alert" : "status"}
          aria-live="polite"
          className="text-xs leading-5 text-amber-800"
        >
          {statusMessage}
        </p>
      )}
      {disabled && status === "ready" && <span className="sr-only" aria-live="polite">Google sign-in temporarily unavailable while another sign-in request is processing.</span>}
    </div>
  );
}
