import { useEffect, useRef } from "react";

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => Promise<void>;
  disabled?: boolean;
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const render = () => {
      if (cancelled || !containerRef.current || disabled) return;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

      if (!clientId || !window.google?.accounts?.id) {
        if (attempts++ < 50) window.setTimeout(render, 200);
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

    render();
    return () => { cancelled = true; };
  }, [disabled, onCredential]);

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-60" : ""} />;
}
