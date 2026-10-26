/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_PUBLIC_SUPPORT_EMAIL?: string;
  readonly VITE_PUBLIC_SOCIAL_INSTAGRAM?: string;
  readonly VITE_PUBLIC_SOCIAL_LINKEDIN?: string;
  readonly VITE_PUBLIC_SOCIAL_YOUTUBE?: string;
  readonly VITE_PUBLIC_SOCIAL_X?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleIdentityCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleIdentityCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_button?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: {
    theme?: string;
    size?: string;
    width?: number | string;
    text?: string;
    shape?: string;
  }): void;
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
