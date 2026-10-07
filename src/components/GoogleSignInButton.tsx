import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => Promise<void>;
  disabled?: boolean;
}

interface GoogleConfigResponse {
  enabled: boolean;
  clientId: string;
}

let googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
let googleConfigPromise: Promise<string> | null = null;
let initializedClientId = "";
let activeCredentialHandler: ((credential: string) => Promise<void>) | null = null;

function getGoogleClientId() {
  if (googleClientId) return Promise.resolve(googleClientId);
  if (!googleConfigPromise) {
    googleConfigPromise = apiFetch("/api/auth/google/config")
      .then((response) => {
        const config = response as GoogleConfigResponse;
        if (!config.enabled || !config.clientId) return "";
        googleClientId = config.clientId;
        return googleClientId;
      })
      .catch(() => "");
  }
  return googleConfigPromise;
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const [configured, setConfigured] = useState(Boolean(googleClientId));

  credentialHandlerRef.current = onCredential;

  useEffect(() => {
    activeCredentialHandler = (credential) => credentialHandlerRef.current(credential);

    let cancelled = false;
    let attempts = 0;

    const render = () => {
      if (cancelled || !containerRef.current || disabled || !googleClientId || !window.google?.accounts?.id) {
        if (!cancelled && !disabled && googleClientId && attempts++ < 100) {
          window.setTimeout(render, 200);
        }
        return;
      }

      setConfigured(true);

      if (initializedClientId !== googleClientId) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: ({ credential }) => {
            if (credential) void activeCredentialHandler?.(credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initializedClientId = googleClientId;
      }

      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        width: Math.min(containerRef.current.clientWidth || 400, 400),
        text: "continue_with",
        shape: "rectangular",
      });
    };

    void getGoogleClientId().then((clientId) => {
      if (!cancelled && clientId) {
        setConfigured(true);
        render();
      }
    });

    return () => {
      cancelled = true;
      if (activeCredentialHandler === credentialHandlerRef.current) {
        activeCredentialHandler = null;
      }
    };
  }, [disabled]);

  if (!configured) {
    return (
      <button
        type="button"
        disabled
        title="Google Sign-In is not configured yet"
        className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-500 opacity-90"
      >
        <span className="text-base font-bold">G</span>
        <span>Continue with Google</span>
      </button>
    );
  }

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-60" : ""} />;
}
