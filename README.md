## Build with AI v2

Build with AI turns a learning goal into a personalized roadmap. The v2 rollout is feature-flagged so the existing synchronous builder and normal course search can remain available while intent parsing, shared resource curation, goal modules, and asynchronous node resolution are validated.

- **Rollout plan:** [Build with AI v2 rollout](docs/BUILD_WITH_AI_V2_ROLLOUT.md)
- **Implementation guide and phase acceptance criteria:** [Build with AI v2 Implementation Guide](Build%20with%20AI%20v2%20Implementation%20Guide.md)
- **Selector comparison (mock-first by default):** run `node scripts/compareSelectors.js`. Live mode is opt-in, capped at five skills, and must not be used in CI.
- Keep server flags off by default. Enable one stage at a time in development, then staging; the rollout document lists each flag, its default, and the metrics to monitor.
- Do not remove the legacy selector or synchronous flow until the two-week stability window and rollback review are complete.

# BuddyForStudy.V2

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-bydm9yrw)


## Google Sign-In troubleshooting

If Google Sign-In shows `FedCM get() rejects with NetworkError: Error retrieving a token`, follow the [Google Sign-In troubleshooting guide](docs/GOOGLE_SIGN_IN_TROUBLESHOOTING.md). Verify the exact Vite origin and matching OAuth Web Client ID in Google Cloud Console before changing security headers.

## Notifications

See [Notification events, channel configuration, worker deployment, and smoke tests](docs/NOTIFICATIONS.md).

## Browser push notifications

BuddyForStudy sends browser push notifications directly through the standard Web Push protocol; it does not require OneSignal.

1. In `server/`, run `npm ci`.
2. Generate a VAPID key pair with `npm run generate:web-push-keys`.
3. Copy the generated public and private keys into `server/.env` as `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`. Set `WEB_PUSH_SUBJECT` to a contact URI such as `mailto:your-admin@example.com`.
4. Restart the API and worker. The frontend obtains the public VAPID key from the API; do not place the private key in the frontend.
5. Open Settings in a supported browser, enable browser push, and grant permission. Use **Send test push** to verify delivery.

`localhost` is supported for local browser testing. Phone testing and production use require an HTTPS origin. This setup is for web/PWA push; native Android/iOS apps need separate native SDK/platform integration.


## UI/UX and deployment readiness

- **Functional inventory and release gates:** [Platform UI/UX Functional Inventory](docs/PLATFORM_UI_UX_FUNCTIONAL_INVENTORY.md)
- **Historical findings and remediation log:** [UI/UX Audit](docs/UI_UX_AUDIT.md)
- **Navigation and element map:** [User Flow and Element Map](USER_FLOW_AND_ELEMENT_MAP.md)

The functional inventory maps runtime routes, learner/admin control families, API dependencies, existing tests, browser validation scenarios, and production integration gates. Treat it as a source-based audit until each control has browser and staging evidence recorded.
