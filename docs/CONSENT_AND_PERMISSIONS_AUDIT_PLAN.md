# Consent, Permissions & Personal Data — Audit and Implementation Plan

**Branch:** `test`  
**Status:** Inventory completed. Consent and push/email enforcement updates are implemented on `test`; the latest changes are under CI validation.  
**Design rule:** Reuse BuddyForStudy's unified brand tokens and established controls. Do not introduce a second color system or a separate-looking permission center.

## Product rules

1. Ask only when the user reaches the feature that needs a permission or data field.
2. Separate browser/platform permission (for example, native push permission) from an in-app preference and from cookie consent.
3. Keep optional marketing consent off until the user actively opts in; never bundle it with required Terms/Privacy acceptance.
4. Required legal acknowledgement must be visible at the account action; record the policy version and time. A Privacy Policy notice is not blanket consent for every future purpose.
5. Do not imply that a contact number is verified unless a verification process actually succeeded.
6. A refusal for optional features must not block ordinary learning or account use.
7. Store only what the platform needs. Explain purpose, provide editing/withdrawal where applicable, and retain an audit event for material consent changes.
8. Optional analytics/marketing tools must not load or write tracking storage before an applicable opt-in. A saved preference alone does not gate scripts automatically.
9. Push requests must be triggered by a clear user action and follow the browser's native permission decision.
10. Use current BuddyForStudy design tokens: indigo foundation (`--bfs-primary: #1A1B41`), violet action/AI accent (`--bfs-ai: #8B5CF6`, deep violet `#6d28d9`), pale canvas/surfaces, muted body text, existing input/button classes, 12px control and 20px card radii.

## Inventory

| ID | Consent / data / permission | Current flow | Required behavior / gap |
|---|---|---|---|
| C01 | Terms of Service | Inline notice on registration; versioned server acknowledgement; existing-user gate for new policy versions | Keep links visible before account action, version and timestamp recorded; do not pre-check unrelated marketing choices. |
| C02 | Privacy Policy | Inline notice and account gate | Keep accessible policy link and acknowledgement record; policy wording/version must match the displayed policy. |
| C03 | Essential storage | Described in Cookie settings; auth/session and preference storage are used by the app | Always-on only for required operations. Describe local storage/session technology accurately; do not call every browser-storage item a cookie. |
| C04 | Optional analytics storage | Separate off-by-default category; source review found no analytics SDK in this build | **Source audit completed:** no analytics SDK found in frontend dependencies/source. The banner explains that this is currently a saved preference only; future analytics must gate initialization on opt-in and support revocation. |
| C05 | Optional marketing/advertising storage | Separate off-by-default category; source review found no advertising/marketing pixel SDK in this build | **Source audit completed:** no ad/pixel SDK found in frontend dependencies/source. The banner says this choice is recorded for future use until a reviewed tracker is added; future trackers must be gated. |
| C06 | Browser push permission | Separate Settings → Notifications action calls `Notification.requestPermission()`; service worker and push subscription are registered on demand | **Implemented:** clear browser support/HTTPS/server-config/denied states; native permission is requested only on explicit user action; explicit enable/disable is audited. Browser permission remains per-browser/device. |
| C07 | Promotional email | Separate unchecked marketing opt-in, Settings control, signed unsubscribe link and delivery preference | **Enforcement updated:** explicit opt-in/withdrawal synchronizes account and delivery preference; one-click unsubscribe uses the central revocation service and appends an `email_unsubscribe` event; transactional/security/billing mail remains separate. |
| C08 | In-app notification types | Existing preferences for course/project updates, announcements and reminders | Keep user-controlled defaults and persist current choices; do not request browser permission for in-app notifications. |
| C09 | Reminder schedule / quiet hours | Existing time-zone, reminder-hour and quiet-hours controls | Explain effect and validate settings; this is a preference, not a browser permission. |
| C10 | Google sign-in profile data | Google OAuth supplies basic identity fields; app asks the user to enter a contact number, with optional city/learning goal and a skip path | Do not claim Google supplied phone number. Phone remains unverified until a real verification feature exists. Make purpose and skip/withdraw paths explicit. |
| C11 | Profile/contact details | Phone, city and learning goal can be edited in Settings | Keep fields optional outside the Google onboarding gate's chosen completion flow; allow clearing; constrain values and record changed-field audit without labeling the change as consent. |
| C12 | Learning activity/personalization | Enrollments, lesson progress, quiz activity, reviews and learning goals power platform functions | Describe the data categories and purposes in the Privacy Policy; do not request a broad extra checkbox when the data is essential to the feature the learner chose. |
| C13 | AI features and third-party resources | Build with AI, lesson summaries and resource search may transmit task context to configured providers | Disclose relevant provider/data processing in policy and feature copy; send minimum necessary context; don't claim that a provider uses no data unless configuration/terms confirm it. |
| C14 | Course payments / refunds | Existing checkout, payment and refund flows | Keep payment-provider handling and transactional communications explained; never treat payment/account messages as optional marketing. |
| C15 | Camera, microphone, geolocation, clipboard, file access | No general-purpose permission request is part of the reviewed consent flows | Do not ask globally. Request at the point a specific feature needs one and explain why. If no feature needs it, do not request it. |
| C16 | Account access, export, correction and deletion | Contact fields can be edited; a full privacy rights workflow was not found in this inventory | Audit separately before launch. Define export/deletion request handling, retention/legal holds and identity verification. Do not promise automated deletion/export until implemented. |
| C17 | Consent proof and audit history | Append-only `UserConsentEvent` records cover terms, privacy, cookies, marketing, push, and profile events | **Implemented for identified gaps:** push event type and explicit enable/disable records; general preference save omits push; promotional opt-out records `accepted: false` with source `email_unsubscribe`; profile edits are not labeled as consent acceptance. |
| C18 | Legal policy publication/versioning | Admin can publish policy versions; interim default policies exist | Ensure displayed version matches the one recorded on acceptance. Have policy text reviewed for target markets before production launch. |
| C19 | Consent center placement / visual system | Cookie settings available in footer and Settings; privacy preferences in Settings | Keep entry points findable; use current indigo/violet palette, neutral surfaces, semantic success/warning/error colors, existing buttons and keyboard focus rings. |
| C20 | Third-party scripts and external assets | Google Fonts loads the Inter typeface globally; Google Identity Services is loaded dynamically only where the Google sign-in button is mounted; no analytics/ad SDK was found in the reviewed frontend source | Disclose external resources in the Privacy Policy, minimize when they load, and review provider behavior/configuration before production. Do not confuse sign-in/typography requests with optional analytics cookies. |

## Implementation sequence

### Phase A — Complete and clarify user permissions
- [x] Keep cookie choices separate from push permission.
- [x] Keep promotional email opt-in unchecked by default and independently revocable.
- [x] Keep Google contact collection user-entered; do not infer phone from Google.
- [x] Audit/record explicit push enable and disable choices in consent history.
- [x] Ensure general notification-preference saving does not accidentally re-record a push decision when the user changes only another preference.
- [x] Improve push error/state copy for unsupported browser, insecure non-local origin, native permission denied, missing server VAPID configuration, and successful subscription.
- [x] Add unit and controller-boundary regression coverage: general notification preference saves do not create push consent events; explicit push enable/disable choices create auditable events.

### Phase B — Verify privacy enforcement
- [x] Review current frontend source/dependencies for analytics/ad SDKs: none found in this build. Cookie UI now states that preferences are recorded but no optional analytics/ad tracker is currently enabled. Re-check the deployed bundle before production.
- [x] Reviewed the notification service promotional email gate (explicit opt-in timestamp required) and routed unsubscribe through the central revocation service to synchronize account state, delivery preference, and audit event. Re-run backend tests after the latest changes.
- [x] Cookie manager stores an anonymous choice locally and syncs it to the account after sign-in/account switching; a regression test is included.
- [x] Account gate compares current policy versions, prompts when accepted versions differ, records the exact current versions, and fails closed on missing/error responses. Browser checks display the current version identifiers.
- [x] Reviewed browser permission call sites: `Notification.requestPermission()` is called only inside the explicit push-enable helper; a browser test asserts Settings page load does not call it.

### Phase C — User transparency and future launch readiness
- [ ] Verify policy documents describe identity, contact, learning activity, AI-provider processing, third parties, storage, retention and contact channels accurately.
- [ ] Plan account data export/deletion/correction and retention workflow.
- [ ] Confirm all user-facing consent and permission UI uses current BuddyForStudy theme tokens and remains keyboard/mobile accessible.
- [ ] Have interim policies reviewed and replace them with approved production policies before public launch.

## Acceptance checks

- No optional checkbox is pre-selected on signup.
- Accepting Terms/Privacy does not imply consent to marketing email, optional cookies or push.
- Push prompt appears only after the learner activates the push action; a denied permission is not automatically re-prompted.
- Explicit push changes produce append-only consent history; saving other notification preferences does not change that history.
- Promotional email remains suppressed unless a recorded opt-in exists and remains enabled.
- Cookie settings can be reopened and changed at any time.
- No global prompts for camera, microphone, location or clipboard are shown without a feature-specific reason.
- Consent surfaces inherit BuddyForStudy tokens and shared components rather than hard-coded alternate branding.
- Typecheck, backend tests, production build and consent/notification browser tests pass.
