import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => Promise<void>;
  disabled?: boolean;
}

interface GoogleConfigResponse {
  enabled: boolean;
  clientId: string;
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

    const render = () => {
      if (cancelled || !containerRef.current || disabled || !clientId || !window.google?.accounts?.id) {
        if (!cancelled && !disabled && attempts++ < 100) window.setTimeout(render, 200);
        return;
      }

      containerRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (credential) void onCredential(credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        width: Math.min(containerRef.current.clientWidth || 400, 400),
        text: "continue_with",
        shape: "rectangular",
      });
    };

    const loadConfig = async () => {
      if (!clientId) {
        try {
          const config = await apiFetch("/api/auth/google/config") as GoogleConfigResponse;
          if (config.enabled && config.clientId) clientId = config.clientId;
        } catch {
          // Keep polling so the Google Identity Services script can finish loading.
        }
      }
      render();
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [disabled, onCredential]);

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-60" : ""} />;
}
