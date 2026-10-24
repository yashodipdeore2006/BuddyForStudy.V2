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
