# BuddyForStudy notification delivery

The notification system sends transactional billing messages, optional course updates, scheduled learning reminders, and admin communications through a shared event service.

## Events and channels

| Event | Default delivery | Notes |
| --- | --- | --- |
| Verified paid-course purchase | In-app + email | Created after payment verification/webhook; idempotent per payment |
| Subscription activation | In-app + email | Sent when Razorpay confirms activation |
| Subscription renewal payment | In-app + email | Receipt event is keyed to the provider payment |
| Subscription payment failure or attention required | In-app + email | User is directed to Billing |
| Subscription cancellation scheduled, cancelled, or ended | In-app + email | The scheduled cancellation is distinct from the provider-confirmed cancellation |
| Refund request received and refund decision | In-app + email | The decision notification is sent after the admin update is saved |
| Free-course enrollment | In-app + optional email | Uses the learner's course-update preferences |
| Course completed | In-app + optional email | Idempotent per learner and course |
| Learning reminder | In-app + email, with optional push | After the configured inactivity period, at the learner's configured local hour; at most one per learner per local date |
| Admin notification or announcement | Per selected channels and saved preferences | Audience and channel selection stay in the admin console |

Billing/security messages are treated as transactional and are not controlled by optional course/announcement preferences. The global email delivery switch is an operational kill switch. In-app billing/security notices remain visible even when optional in-app updates are globally paused.

## Required deployment configuration

Set these in the **server** environment (never commit actual secrets):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optionally `MAIL_FROM` for email delivery.
- `CLIENT_URL` to the public BuddyForStudy frontend URL so email links point to the right environment.
- `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` to enable server-side push delivery.
- `VITE_ONESIGNAL_APP_ID` in the frontend build environment to enable the user's browser push opt-in control.

Email events are recorded as `pending`, `sent`, `skipped`, or `failed`. When SMTP is missing, optional delivery is marked skipped instead of remaining in a forever-pending state. Failed sends are retried by the worker up to the platform-configured attempt count. The OneSignal REST key must be kept server-side; the frontend only needs the public app ID.

## The background worker is required

The API process handles immediate events. A separate, continuously running worker handles retry queues, learning reminders, subscription expiry maintenance, and stale-payment cleanup.

Run this as its own process/service using the repository's existing script:

```bash
cd server
npm ci
npm run worker
```

On Render, deploy it as a **Background Worker** using the same server repository/root directory and environment variables as the API, but use `npm run worker` as its start command. Do not rely only on the web API service: reminder scheduling and deferred retries do not run if the worker process is stopped.

## Admin configuration

In **Admin → Platform Settings**, the notification control plane exposes:

- `notification_email_enabled`: global email kill switch
- `notification_in_app_enabled`: global switch for optional in-app updates
- `notification_push_enabled`: global push switch
- `learning_reminders_enabled`: global reminder switch
- `learning_reminder_inactive_days`: inactivity threshold (1–30 days; defaults to 3)
- `notification_email_retry_attempts`: retries (1–10; defaults to 5)
- `notification_push_retry_attempts`: retries (1–6; defaults to 3)

Learners manage optional channel preferences and reminder time/time zone under **Settings → Notification Preferences**. Browser push requires explicit browser permission and learner opt-in.

In **Admin → Communications**, automatic templates are seeded on first load and can be edited. Keep each built-in template key unchanged to keep it connected to its trigger. Supported template variables include `{{userName}}`, `{{courseTitle}}`, `{{planName}}`, `{{amount}}`, `{{currency}}`, `{{purchaseDate}}`, `{{paymentReference}}`, `{{billingInterval}}`, `{{currentPeriodStart}}`, `{{currentPeriodEnd}}`, `{{periodSummary}}`, `{{status}}`, and `{{link}}`. The same page shows email/push delivery status, attempt counts, and latest errors for queued events. Failed email and push rows have a channel-specific **Retry** action. A delivery skipped only because SMTP/OneSignal or a global channel switch was unavailable can also be retried after configuration is restored. The retry endpoint is admin-only and audited; learner opt-outs are checked again before optional email/push delivery.

## Push notes

This repository contains a web client. Browser push can be enabled through OneSignal once both environment variables are configured. A native iOS/Android app must also integrate the matching OneSignal app and log in using the same BuddyForStudy user ID before it can receive push alerts; the web helper alone does not install or configure a native mobile app.

## Smoke-test checklist

1. Set SMTP values and send a test email from the admin Communications screen.
2. Confirm Settings persists across sign-out/sign-in and browser refresh.
3. Complete a Razorpay test-mode course purchase; verify an in-app item and email status in Communications delivery logs.
4. Activate a test subscription and test a renewal/payment failure webhook using Razorpay's test environment.
5. Submit a refund request and update it from Admin → Billing/Refunds; verify the user gets a status message.
6. Complete all lessons in a test course; verify a single course-completion notification.
7. Set a test user's reminder hour to the current hour, temporarily lower the inactivity threshold in Platform Settings, and run the worker; verify one reminder and no duplicates when the worker reruns.
8. If using push, configure OneSignal, enable push from a supported HTTPS browser, and send a real test notification. A browser permission grant without valid provider configuration is not a delivery test.
