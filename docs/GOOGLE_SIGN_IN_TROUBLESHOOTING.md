# Google Sign-In Troubleshooting

This guide is for the Google Identity Services (GIS) button used by BuddyForStudy.V2.

## Current implementation

The frontend uses the GIS JavaScript API with the popup/callback flow:
- `ux_mode: "popup"`
- `use_fedcm_for_button: false`

The FedCM button opt-in is intentionally disabled while debugging the current `FedCM get() rejects with NetworkError: Error retrieving a token` report. The Vite development and preview servers retain `Cross-Origin-Opener-Policy: same-origin-allow-popups` for popup compatibility.

A console line such as `Prompt dismissed. API exponential cool down not triggered.` means the browser's identity UI was dismissed; it does not establish that the backend rejected an ID token. The `NetworkError: Error retrieving a token` message indicates GIS could not complete token retrieval, before BuddyForStudy can submit a credential to `POST /api/auth/google`.

## 1. Check the exact frontend origin

Use the origin shown in the browser address bar, including its port and hostname. Vite may choose a fallback port if 5173 is already in use.

Examples (these are different origins and may need to be registered separately):
- `http://localhost:5173`
- `http://localhost:5174`
- `http://127.0.0.1:5173`

In Google Cloud Console, open **Google Auth Platform / Clients** (or **APIs & Services / Credentials** in the older console), select the OAuth 2.0 client, and verify that its application type is **Web application**. Under **Authorized JavaScript origins**, add the exact origin(s) used for development. For production, add the exact public HTTPS frontend origin, e.g. `https://your-domain.example`; do not add paths such as `/login`.

For local tests, Google's setup guide recommends adding `http://localhost` and `http://localhost:<port>`. Do not assume localhost and 127.0.0.1 are interchangeable.

Reference: [Google Identity Services — get your client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## 2. Match the Web Client ID

Use the same OAuth **Web application** client ID for:
- `server/.env`: `GOOGLE_CLIENT_ID=...`
- frontend `.env`: `VITE_GOOGLE_CLIENT_ID=...` (optional in this codebase, but when set it must match the backend ID)

Do not include quotes or whitespace around the client ID. Do not paste client secrets into frontend variables, code, issues, or chat. The browser client ID is public; client secrets and server credentials are not.

After changing env files:
1. Stop the frontend and backend.
2. Start the backend again so it reloads `server/.env`.
3. Restart Vite so it reloads frontend `.env` values.
4. Hard-refresh the login page.

The backend returns its configured client ID through `GET /api/auth/google/config`; the frontend compares it to `VITE_GOOGLE_CLIENT_ID` when the latter is set.

## 3. Check browser identity/privacy settings

If the origin and client ID are correct, test in a fresh Chrome profile or Incognito window with extensions disabled. Confirm that:
- the browser can reach `https://accounts.google.com/gsi/client` and other Google Identity Services requests;
- Google sign-in/third-party sign-in is not blocked by browser site settings or an extension;
- you are signed in to the intended Google account and are not repeatedly closing the account chooser/prompt.

The app does not control Chrome's internal FedCM cooldown or restore identity-provider permissions. Repeatedly clicking the button after dismissing the same prompt is unlikely to help; wait, try a fresh browser session, and inspect the browser site settings.

## 4. Identify whether the failure reaches the backend

Open DevTools → **Network**, filter by `google` or `gsi`, and inspect the failing request/status. Never copy or share credential tokens.

- If no `POST /api/auth/google` request happens, the token was not delivered to the app. Re-check the OAuth origin, browser identity settings, and Google requests.
- If `POST /api/auth/google` happens, inspect its HTTP status and safe response message. The backend verifies the ID token against `GOOGLE_CLIENT_ID`; an audience/client-ID mismatch must be corrected rather than bypassed.
- If `GET /api/auth/google/config` returns disabled or no client ID, configure `GOOGLE_CLIENT_ID` on the backend and restart it.

## Security notes

Do not remove the COOP header as a workaround, expose credentials, or skip backend ID-token verification. Popup compatibility, OAuth origin registration, and server-side token verification are separate controls.
